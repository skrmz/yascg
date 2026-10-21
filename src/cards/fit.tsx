import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import type { CardFitMode, Spell } from "@/domain/spells";
import { LIMITS } from "@/domain/spells";
import { parseSpellBody, type BlockNode } from "@/markdown/parse.ts";
import { cloneBlock, paginateToPages, truncateBlocksToFit } from "@/markdown/split.ts";
import { CardView } from "./Card.tsx";
import { fitCacheKey } from "./fingerprint.ts";

export const AUTO_SHRINK_STEPS = [8.5, 8, 7.5, 7, 6.5, 6] as const;
export const AUTO_SHRINK_MIN_PT = 6;
export const MULTI_CARD_FONT_PT = 8;
export const MULTI_CARD_MIN_FONT_PT = 6;

export type MeasureFit = (blocks: readonly BlockNode[], fontPt: number) => boolean;

export interface FitResult {
  pages: BlockNode[][];
  fontPt: number;
  truncated: boolean;
  overflow: boolean;
}

export function computeFit(
  blocks: readonly BlockNode[],
  measure: MeasureFit,
  fitMode: CardFitMode,
  maxCards: number = LIMITS.CONTINUATION_CARDS_MAX,
): FitResult {
  const source = blocks.map(cloneBlock);
  if (fitMode === "auto-shrink") {
    for (const fontPt of AUTO_SHRINK_STEPS) {
      if (measure(source, fontPt)) {
        return { pages: [source], fontPt, truncated: false, overflow: false };
      }
    }
    const truncated = truncateBlocksToFit(source, (candidate) =>
      measure(candidate, AUTO_SHRINK_MIN_PT),
    );
    return {
      pages: [truncated.blocks],
      fontPt: AUTO_SHRINK_MIN_PT,
      truncated: truncated.truncated,
      overflow: false,
    };
  }
  let fontPt: number = MULTI_CARD_FONT_PT;
  let result = paginateToPages(source, (page) => measure(page, fontPt), maxCards);
  if (result.overflow && fontPt > MULTI_CARD_MIN_FONT_PT) {
    fontPt = MULTI_CARD_MIN_FONT_PT;
    result = paginateToPages(source, (page) => measure(page, fontPt), maxCards);
  }
  return { pages: result.pages, fontPt, truncated: false, overflow: result.overflow };
}

const fitCache = new Map<string, FitResult>();

export function clearFitCache(): void {
  fitCache.clear();
}

interface Layout {
  spell: Spell | null;
  blocks: BlockNode[];
  fontPt: number;
}

interface Measurer {
  measure: (spell: Spell, blocks: readonly BlockNode[], fontPt: number) => boolean;
  layer: ReactNode;
}

/** Shared hidden-card measurer. Await `document.fonts.ready` before first use. */
function useMeasurer(): Measurer {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<Layout>({
    spell: null,
    blocks: [],
    fontPt: AUTO_SHRINK_STEPS[0],
  });

  const measure = useCallback<Measurer["measure"]>((spell, blocks, fontPt) => {
    flushSync(() => setLayout({ spell, blocks: blocks.map(cloneBlock), fontPt }));
    const element = bodyRef.current;
    if (!element) return true;
    return element.scrollHeight <= element.clientHeight + 1;
  }, []);

  const layer =
    layout.spell && typeof document !== "undefined"
      ? createPortal(
          <div className="card-measure-layer" aria-hidden="true">
            <CardView
              spell={layout.spell}
              blocks={layout.blocks}
              cardIndex={1}
              cardCount={1}
              fontPt={layout.fontPt}
              bodyRef={bodyRef}
              className="spell-card-measure"
            />
          </div>,
          document.body,
        )
      : null;

  return { measure, layer };
}

async function waitForFonts(): Promise<void> {
  const fonts = (globalThis as { document?: Document }).document?.fonts;
  if (fonts && typeof fonts.ready?.then === "function") {
    await fonts.ready;
  }
}

export interface UseCardFitOptions {
  spell: Spell | null;
  fitMode: CardFitMode;
  language: string;
}

export interface UseCardFitResult {
  result: FitResult | null;
  ready: boolean;
  error: string | null;
  measureLayer: ReactNode;
}

export function useCardFit({ spell, fitMode, language }: UseCardFitOptions): UseCardFitResult {
  const { t, i18n } = useTranslation();
  const higherLevelsHeading = t("spell.higherLevels");
  const resolvedLanguage = i18n.resolvedLanguage;
  const { measure, layer } = useMeasurer();
  const [result, setResult] = useState<FitResult | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocks = useMemo(
    () => (spell ? parseSpellBody(spell, higherLevelsHeading) : []),
    [spell, higherLevelsHeading],
  );
  const cacheKey = useMemo(() => {
    if (!spell) return null;
    return fitCacheKey({
      spellId: spell.id,
      language,
      fitMode,
      fingerprint: JSON.stringify(blocks),
    });
  }, [spell, language, fitMode, blocks]);

  useEffect(() => {
    if (!spell || !cacheKey) {
      setResult(null);
      setReady(false);
      return;
    }
    const cached = fitCache.get(cacheKey);
    if (cached) {
      setResult(cached);
      setReady(true);
      setError(null);
      return;
    }
    let cancelled = false;
    setReady(false);
    const run = async () => {
      try {
        await waitForFonts();
        if (cancelled) return;
        const computed = computeFit(
          blocks,
          (candidate, fontPt) => measure(spell, candidate, fontPt),
          fitMode,
        );
        if (cancelled) return;
        fitCache.set(cacheKey, computed);
        setResult(computed);
        setReady(true);
        setError(null);
      } catch (cause) {
        if (!cancelled) {
          setReady(true);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [spell, cacheKey, blocks, fitMode, measure, higherLevelsHeading, resolvedLanguage]);

  return { result, ready, error, measureLayer: layer };
}

export interface DeckFitItem {
  key: string;
  spell: Spell;
  fitMode: CardFitMode;
}

export interface UseDeckCardFitsResult {
  results: Map<string, FitResult>;
  ready: boolean;
  measureLayer: ReactNode;
}

/** Fits every distinct deck entry sequentially with one hidden measuring card. */
export function useDeckCardFits(
  items: readonly DeckFitItem[],
  language: string,
  enabled = true,
): UseDeckCardFitsResult {
  const { t, i18n } = useTranslation();
  const higherLevelsHeading = t("spell.higherLevels");
  const resolvedLanguage = i18n.resolvedLanguage;
  const { measure, layer } = useMeasurer();
  const [results, setResults] = useState<Map<string, FitResult>>(new Map());
  const [ready, setReady] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const signature = useMemo(
    () =>
      items.map((item) => `${item.key}:${item.spell.id}:${item.fitMode}`).join("|") +
      `@${language}:${higherLevelsHeading}`,
    [items, language, higherLevelsHeading],
  );

  useEffect(() => {
    const current = itemsRef.current;
    if (!enabled || current.length === 0) {
      setResults(new Map());
      setReady(false);
      return;
    }
    let cancelled = false;
    setReady(false);
    const run = async () => {
      await waitForFonts();
      if (cancelled) return;
      const next = new Map<string, FitResult>();
      for (const item of current) {
        const blocks = parseSpellBody(item.spell, higherLevelsHeading);
        const cacheKey = fitCacheKey({
          spellId: item.spell.id,
          language,
          fitMode: item.fitMode,
          fingerprint: JSON.stringify(blocks),
        });
        let computed = fitCache.get(cacheKey);
        if (!computed) {
          computed = computeFit(
            blocks,
            (candidate, fontPt) => measure(item.spell, candidate, fontPt),
            item.fitMode,
          );
          fitCache.set(cacheKey, computed);
        }
        next.set(item.key, computed);
        if (cancelled) return;
      }
      if (!cancelled) {
        setResults(next);
        setReady(true);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [signature, language, measure, enabled, higherLevelsHeading, resolvedLanguage]);

  return { results, ready, measureLayer: enabled ? layer : null };
}
