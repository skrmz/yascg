import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import type { CardFitMode, Spell } from "@/domain/spells";
import { LIMITS } from "@/domain/spells";
import { parseSpellBody, type BlockNode } from "@/markdown/parse.ts";
import {
  appendEllipsis,
  cloneBlock,
  isHeading,
  paginateToPages,
  truncateBlocksToFit,
} from "@/markdown/split.ts";
import { componentMarkerKey } from "@/locales/labels.ts";
import { CardView } from "./Card.tsx";
import { buildCompactPresentation, type CompactPresentation } from "./compact.ts";
import { DEFAULT_CARD_DESIGN, type CardDesign } from "./design.ts";
import { waitForCardFonts } from "./fonts.ts";
import { blocksFingerprint, contentFingerprint, fitCacheKey } from "./fingerprint.ts";

export const AUTO_SHRINK_STEPS = [8.5, 8, 7.5, 7, 6.5, 6] as const;
export const AUTO_SHRINK_MIN_PT = 6;
export const MULTI_CARD_FONT_PT = 8;
export const MULTI_CARD_MIN_FONT_PT = 6;

export type MeasureFit = (
  blocks: readonly BlockNode[],
  fontPt: number,
  continuation: boolean,
  cardCount?: number,
) => boolean;

export interface FitResult {
  pages: BlockNode[][];
  fontPt: number;
  truncated: boolean;
  overflow: boolean;
  overflowReason?: "continuation-limit" | "notes";
}

function isNotesBlock(block: BlockNode): boolean {
  return block.type === "list" && block.role === "notes";
}

function leadingNotes(blocks: readonly BlockNode[]): BlockNode[] {
  const notes: BlockNode[] = [];
  for (const block of blocks) {
    if (!isNotesBlock(block)) break;
    notes.push(block);
  }
  return notes;
}

function dropTrailingStructure(blocks: readonly BlockNode[]): BlockNode[] {
  const result = blocks.map(cloneBlock);
  while (result.length > 0) {
    const last = result[result.length - 1];
    if (!last) break;
    if (last.type === "hr" || (isHeading(last) && result.length > 1)) result.pop();
    else break;
  }
  return result;
}

const ELLIPSIS_BLOCK: BlockNode = {
  type: "paragraph",
  children: [{ type: "text", value: "\u2026" }],
};

/**
 * Truncates to the largest prefix that still fits together with its trailing
 * ellipsis. Trailing headings and rules are dropped so the card never ends with
 * a structure that would leave the ellipsis invisible.
 */
function truncateSingleCard(
  source: readonly BlockNode[],
  measure: MeasureFit,
): { blocks: BlockNode[]; truncated: boolean; overflow: boolean; overflowReason?: "notes" } {
  const notes = leadingNotes(source);
  const remainder = source.slice(notes.length);
  const notesClone = notes.map(cloneBlock);
  const fits = (candidate: readonly BlockNode[]) => {
    const prefix =
      notesClone.length > 0
        ? [...notesClone, ...appendEllipsis(candidate)]
        : appendEllipsis(candidate);
    return measure(prefix, AUTO_SHRINK_MIN_PT, false);
  };
  const result = truncateBlocksToFit(remainder, fits);
  if (!result.truncated) {
    return {
      blocks: notesClone.length > 0 ? [...notesClone, ...result.blocks] : result.blocks,
      truncated: false,
      overflow: false,
    };
  }

  const blocks = dropTrailingStructure(result.blocks);
  if (blocks.length === 0) {
    if (notesClone.length > 0) {
      const page = [...notesClone, ELLIPSIS_BLOCK];
      if (measure(page, AUTO_SHRINK_MIN_PT, false)) {
        return { blocks: page, truncated: true, overflow: false };
      }
      return { blocks: notesClone, truncated: true, overflow: true, overflowReason: "notes" };
    }
    return { blocks: [ELLIPSIS_BLOCK], truncated: true, overflow: false };
  }
  return {
    blocks:
      notesClone.length > 0 ? [...notesClone, ...appendEllipsis(blocks)] : appendEllipsis(blocks),
    truncated: true,
    overflow: false,
  };
}

function fitMultiCard(
  source: readonly BlockNode[],
  measure: MeasureFit,
  maxCards: number,
): FitResult {
  let fontPt: number = MULTI_CARD_FONT_PT;
  const runPagination = () => {
    // A first page whose spell spans multiple cards also renders the compact
    // pagination line. The final page count is not known until pagination
    // finishes, so paginate without it first and re-measure when it will appear.
    const paginate = (cardCount: number) =>
      paginateToPages(
        source,
        (page, pageIndex) => measure(page, fontPt, pageIndex > 0, cardCount),
        maxCards,
      );
    const withoutPagination = paginate(1);
    return withoutPagination.pages.length > 1 ? paginate(2) : withoutPagination;
  };
  let result = runPagination();
  if (result.overflow && fontPt > MULTI_CARD_MIN_FONT_PT) {
    fontPt = MULTI_CARD_MIN_FONT_PT;
    result = runPagination();
  }
  const notes = leadingNotes(source);
  const overflowReason =
    result.overflow &&
    notes.length > 0 &&
    !measure(notes, fontPt, false, result.pages.length > 1 ? 2 : 1)
      ? "notes"
      : result.overflow
        ? "continuation-limit"
        : undefined;
  return {
    pages: result.pages,
    fontPt,
    truncated: false,
    overflow: result.overflow,
    ...(overflowReason ? { overflowReason } : {}),
  };
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
    const notes = leadingNotes(source);
    if (notes.length > 0 && !measure(notes, AUTO_SHRINK_MIN_PT, false)) {
      return {
        pages: [notes],
        fontPt: AUTO_SHRINK_MIN_PT,
        truncated: false,
        overflow: true,
        overflowReason: "notes",
      };
    }
    const truncated = truncateSingleCard(source, measure);
    return {
      pages: [truncated.blocks],
      fontPt: AUTO_SHRINK_MIN_PT,
      truncated: truncated.truncated,
      overflow: truncated.overflow,
      ...(truncated.overflowReason ? { overflowReason: truncated.overflowReason } : {}),
    };
  }
  return fitMultiCard(source, measure, maxCards);
}

const fitCache = new Map<string, FitResult>();

export function clearFitCache(): void {
  fitCache.clear();
}

interface Layout {
  spell: Spell | null;
  design: CardDesign;
  presentation: CompactPresentation | null;
  blocks: BlockNode[];
  fontPt: number;
  continuation: boolean;
  cardCount: number;
}

interface Measurer {
  measure: (
    spell: Spell,
    design: CardDesign,
    presentation: CompactPresentation | null,
    blocks: readonly BlockNode[],
    fontPt: number,
    continuation: boolean,
    cardCount?: number,
  ) => boolean;
  layer: ReactNode;
}

/** Shared hidden-card measurer. Await card fonts before first use. */
function useMeasurer(): Measurer {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<Layout>({
    spell: null,
    design: DEFAULT_CARD_DESIGN,
    presentation: null,
    blocks: [],
    fontPt: AUTO_SHRINK_STEPS[0],
    continuation: false,
    cardCount: 1,
  });

  const measure = useCallback<Measurer["measure"]>(
    (spell, design, presentation, blocks, fontPt, continuation, cardCount = 1) => {
      flushSync(() =>
        setLayout({
          spell,
          design,
          presentation,
          blocks: blocks.map(cloneBlock),
          fontPt,
          continuation,
          cardCount: cardCount ?? 1,
        }),
      );
      const element = bodyRef.current;
      if (!element) {
        throw new Error(
          "Card measurement failed: the measured body element is not mounted in the hidden measurer.",
        );
      }
      return element.scrollHeight <= element.clientHeight + 1;
    },
    [],
  );

  const layer =
    layout.spell && typeof document !== "undefined"
      ? createPortal(
          <div className="card-measure-layer" aria-hidden="true">
            <CardView
              spell={layout.spell}
              design={layout.design}
              presentation={layout.presentation ?? undefined}
              blocks={layout.blocks}
              cardIndex={layout.continuation ? 2 : 1}
              cardCount={layout.cardCount}
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
  design?: CardDesign;
}

export interface UseCardFitResult {
  result: FitResult | null;
  presentation: CompactPresentation | null;
  ready: boolean;
  error: boolean;
  measureLayer: ReactNode;
}

export function useCardFit({
  spell,
  fitMode,
  language,
  design = DEFAULT_CARD_DESIGN,
}: UseCardFitOptions): UseCardFitResult {
  const { t, i18n } = useTranslation();
  const higherLevelsHeading = t("spell.higherLevels");
  const resolvedLanguage = i18n.resolvedLanguage;
  const { measure, layer } = useMeasurer();
  const [result, setResult] = useState<FitResult | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  const markers = useMemo(
    () => ({
      verbal: t(componentMarkerKey("verbal")),
      somatic: t(componentMarkerKey("somatic")),
    }),
    [t],
  );

  const parsedBlocks = useMemo(
    () =>
      spell
        ? parseSpellBody(spell, higherLevelsHeading, markers, {
            markSections: design === "compact",
          })
        : [],
    [spell, higherLevelsHeading, markers, design],
  );
  const presentation = useMemo(
    () => (spell && design === "compact" ? buildCompactPresentation(spell, parsedBlocks, t) : null),
    [spell, design, parsedBlocks, t],
  );
  const blocks = presentation ? presentation.blocks : parsedBlocks;

  const cacheKey = useMemo(() => {
    if (!spell) return null;
    return fitCacheKey({
      spellId: spell.id,
      language,
      fitMode,
      design,
      contentFingerprint: contentFingerprint(spell),
      blocksFingerprint: blocksFingerprint(blocks),
    });
  }, [spell, language, fitMode, design, blocks]);

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
      setError(false);
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
          (candidate, fontPt, continuation, cardCount) =>
            measure(spell, design, presentation, candidate, fontPt, continuation, cardCount),
          fitMode,
        );
        if (cancelled) return;
        fitCache.set(cacheKey, computed);
        setResult(computed);
        setReady(true);
        setError(false);
      } catch (cause) {
        if (!cancelled) {
          setReady(true);
          console.error("Failed to measure card layout:", cause);
          setError(true);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    spell,
    cacheKey,
    blocks,
    fitMode,
    measure,
    design,
    presentation,
    higherLevelsHeading,
    resolvedLanguage,
    markers,
  ]);

  return { result, presentation, ready, error, measureLayer: layer };
}

export interface DeckFitItem {
  key: string;
  spell: Spell;
  fitMode: CardFitMode;
}

export interface DeckFitEntry {
  fit: FitResult;
  presentation: CompactPresentation | null;
}

export interface UseDeckCardFitsResult {
  results: Map<string, DeckFitEntry>;
  ready: boolean;
  error: boolean;
  measureLayer: ReactNode;
}

/** Fits every distinct deck entry sequentially with one hidden measuring card. */
export function useDeckCardFits(
  items: readonly DeckFitItem[],
  language: string,
  enabled = true,
  design: CardDesign = DEFAULT_CARD_DESIGN,
): UseDeckCardFitsResult {
  const { t, i18n } = useTranslation();
  const higherLevelsHeading = t("spell.higherLevels");
  const resolvedLanguage = i18n.resolvedLanguage;
  const { measure, layer } = useMeasurer();
  const [results, setResults] = useState<Map<string, DeckFitEntry>>(new Map());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
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
      items
        .map(
          (item) =>
            `${item.key}:${item.spell.id}:${item.fitMode}:${contentFingerprint(item.spell)}`,
        )
        .join("|") +
      `@${language}:${design}:${higherLevelsHeading}:${markers.verbal}:${markers.somatic}`,
    [items, language, design, higherLevelsHeading, markers],
  );

  useEffect(() => {
    const current = itemsRef.current;
    if (!enabled || current.length === 0) {
      setResults(new Map());
      setReady(false);
      setError(false);
      return;
    }
    let cancelled = false;
    setReady(false);
    setError(false);
    const run = async () => {
      try {
        await waitForCardFonts();
        if (cancelled) return;
        const next = new Map<string, DeckFitEntry>();
        for (const item of current) {
          const parsedBlocks = parseSpellBody(item.spell, higherLevelsHeading, markers, {
            markSections: design === "compact",
          });
          const presentation =
            design === "compact" ? buildCompactPresentation(item.spell, parsedBlocks, t) : null;
          const blocks = presentation ? presentation.blocks : parsedBlocks;
          const cacheKey = fitCacheKey({
            spellId: item.spell.id,
            language,
            fitMode: item.fitMode,
            design,
            contentFingerprint: contentFingerprint(item.spell),
            blocksFingerprint: blocksFingerprint(blocks),
          });
          let computed = fitCache.get(cacheKey);
          if (!computed) {
            computed = computeFit(
              blocks,
              (candidate, fontPt, continuation, cardCount) =>
                measure(
                  item.spell,
                  design,
                  presentation,
                  candidate,
                  fontPt,
                  continuation,
                  cardCount,
                ),
              item.fitMode,
            );
            fitCache.set(cacheKey, computed);
          }
          next.set(item.key, { fit: computed, presentation });
          if (cancelled) return;
        }
        if (!cancelled) {
          setResults(next);
          setReady(true);
        }
      } catch (cause) {
        if (!cancelled) {
          console.error("Failed to measure deck card layouts:", cause);
          setResults(new Map());
          setError(true);
          setReady(true);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    signature,
    language,
    measure,
    enabled,
    design,
    higherLevelsHeading,
    resolvedLanguage,
    markers,
  ]);

  return { results, ready, error, measureLayer: enabled ? layer : null };
}
