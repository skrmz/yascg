import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import type { CardFitMode, Spell } from "@/domain/spells";
import { LIMITS } from "@/domain/spells";
import { parseSpellBody, type BlockNode } from "@/markdown/parse.ts";
import { cloneBlock, paginateToPages, truncateBlocksToFit } from "@/markdown/split.ts";
import { componentMarkerKey } from "@/locales/labels.ts";
import { CardView } from "./Card.tsx";
import { waitForCardFonts } from "./fonts.ts";
import { fitCacheKey } from "./fingerprint.ts";

export const AUTO_SHRINK_STEPS = [8.5, 8, 7.5, 7, 6.5, 6] as const;
export const AUTO_SHRINK_MIN_PT = 6;
export const MULTI_CARD_FONT_PT = 8;
export const MULTI_CARD_MIN_FONT_PT = 6;

export type MeasureFit = (
  blocks: readonly BlockNode[],
  fontPt: number,
  continuation: boolean,
) => boolean;

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
      if (measure(source, fontPt, false)) {
        return { pages: [source], fontPt, truncated: false, overflow: false };
      }
    }
    const truncated = truncateBlocksToFit(source, (candidate) =>
      measure(candidate, AUTO_SHRINK_MIN_PT, false),
    );
    return {
      pages: [truncated.blocks],
      fontPt: AUTO_SHRINK_MIN_PT,
      truncated: truncated.truncated,
      overflow: false,
    };
  }
  let fontPt: number = MULTI_CARD_FONT_PT;
  const fitsPage = (page: readonly BlockNode[], pageIndex: number) =>
    measure(page, fontPt, pageIndex > 0);
  let result = paginateToPages(source, fitsPage, maxCards);
  if (result.overflow && fontPt > MULTI_CARD_MIN_FONT_PT) {
    fontPt = MULTI_CARD_MIN_FONT_PT;
    result = paginateToPages(source, fitsPage, maxCards);
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
  continuation: boolean;
}

interface Measurer {
  measure: (
    spell: Spell,
    blocks: readonly BlockNode[],
    fontPt: number,
    continuation: boolean,
  ) => boolean;
  layer: ReactNode;
}

/** Shared hidden-card measurer. Await card fonts before first use. */
function useMeasurer(): Measurer {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<Layout>({
    spell: null,
    blocks: [],
    fontPt: AUTO_SHRINK_STEPS[0],
    continuation: false,
  });

  const measure = useCallback<Measurer["measure"]>((spell, blocks, fontPt, continuation) => {
    flushSync(() => setLayout({ spell, blocks: blocks.map(cloneBlock), fontPt, continuation }));
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
              cardIndex={layout.continuation ? 2 : 1}
              cardCount={layout.continuation ? 2 : 1}
              fontPt={layout.fontPt}
              continuation={layout.continuation}
              bodyRef={bodyRef}
              className="spell-card-measure"
            />
          </div>,
          document.body,
        )
      : null;

  return { measure, layer };
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

  const markers = useMemo(
    () => ({
      verbal: t(componentMarkerKey("verbal")),
      somatic: t(componentMarkerKey("somatic")),
    }),
    [t],
  );

  const blocks = useMemo(
    () => (spell ? parseSpellBody(spell, higherLevelsHeading, markers) : []),
    [spell, higherLevelsHeading, markers],
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
        await waitForCardFonts();
        if (cancelled) return;
        const computed = computeFit(
          blocks,
          (candidate, fontPt, continuation) => measure(spell, candidate, fontPt, continuation),
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
  }, [spell, cacheKey, blocks, fitMode, measure, higherLevelsHeading, resolvedLanguage, markers]);

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

  const markers = useMemo(
    () => ({
      verbal: t(componentMarkerKey("verbal")),
      somatic: t(componentMarkerKey("somatic")),
    }),
    [t],
  );

  const signature = useMemo(
    () =>
      items.map((item) => `${item.key}:${item.spell.id}:${item.fitMode}`).join("|") +
      `@${language}:${higherLevelsHeading}:${markers.verbal}:${markers.somatic}`,
    [items, language, higherLevelsHeading, markers],
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
      await waitForCardFonts();
      if (cancelled) return;
      const next = new Map<string, FitResult>();
      for (const item of current) {
        const blocks = parseSpellBody(item.spell, higherLevelsHeading, markers);
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
            (candidate, fontPt, continuation) =>
              measure(item.spell, candidate, fontPt, continuation),
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
  }, [signature, language, measure, enabled, higherLevelsHeading, resolvedLanguage, markers]);

  return { results, ready, measureLayer: enabled ? layer : null };
}
