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
import { componentKey } from "@/locales/labels.ts";
import { CardView } from "./Card.tsx";
import { buildCompactPresentation, type CompactPresentation } from "./compact.ts";
import { DEFAULT_CARD_DESIGN, type CardDesign } from "./design.ts";
import { waitForCardFonts } from "./fonts.ts";
import { blocksFingerprint, contentFingerprint, fitCacheKey } from "./fingerprint.ts";

export const AUTO_SHRINK_STEPS = [8.5, 8, 7.5, 7, 6.5, 6] as const;
export const AUTO_SHRINK_MIN_PT = 6;
export const MULTI_CARD_FONT_PT = 8;
export const MULTI_CARD_MIN_FONT_PT = 6;
/** Best fit paginates instead of rendering a single card below this body size. */
export const AUTO_MIN_FONT_PT = MULTI_CARD_FONT_PT;

export interface MeasureOutcome {
  fits: boolean;
  /** True when a Markdown table exceeds the available card dimensions. */
  tableOverflow?: boolean;
}

export type MeasureFit = (
  blocks: readonly BlockNode[],
  fontPt: number,
  continuation: boolean,
  cardCount?: number,
) => boolean | MeasureOutcome;

export interface FitResult {
  pages: BlockNode[][];
  fontPt: number;
  truncated: boolean;
  overflow: boolean;
  overflowReason?: "continuation-limit" | "notes" | "table";
}

function readMeasurement(value: boolean | MeasureOutcome): {
  fits: boolean;
  tableOverflow: boolean;
} {
  if (typeof value === "boolean") return { fits: value, tableOverflow: false };
  return { fits: value.fits, tableOverflow: value.tableOverflow === true };
}

type BooleanMeasureFit = (
  blocks: readonly BlockNode[],
  fontPt: number,
  continuation: boolean,
  cardCount?: number,
) => boolean;

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
  measure: BooleanMeasureFit,
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
  measure: BooleanMeasureFit,
  maxCards: number,
  tableOverflowed: () => boolean,
  resetTableOverflow: () => void,
): FitResult {
  let fontPt: number = MULTI_CARD_FONT_PT;
  const runPagination = () => {
    resetTableOverflow();
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
  if (result.overflow && tableOverflowed()) {
    return {
      pages: result.pages,
      fontPt,
      truncated: false,
      overflow: true,
      overflowReason: "table",
    };
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

function fitFullSourceSingleCard(
  source: BlockNode[],
  measure: BooleanMeasureFit,
  resetTableOverflow: () => void,
  minFontPt: number = AUTO_SHRINK_MIN_PT,
): FitResult | null {
  for (const fontPt of AUTO_SHRINK_STEPS) {
    if (fontPt < minFontPt) continue;
    resetTableOverflow();
    if (measure(source, fontPt, false)) {
      return { pages: [source], fontPt, truncated: false, overflow: false };
    }
  }
  return null;
}

function fitAutoShrink(
  source: BlockNode[],
  measure: BooleanMeasureFit,
  tableOverflowed: () => boolean,
  resetTableOverflow: () => void,
): FitResult {
  const full = fitFullSourceSingleCard(source, measure, resetTableOverflow);
  if (full) return full;
  if (tableOverflowed()) {
    return {
      pages: [source],
      fontPt: AUTO_SHRINK_MIN_PT,
      truncated: false,
      overflow: true,
      overflowReason: "table",
    };
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

export function computeFit(
  blocks: readonly BlockNode[],
  rawMeasure: MeasureFit,
  fitMode: CardFitMode,
  maxCards: number = LIMITS.CONTINUATION_CARDS_MAX,
): FitResult {
  const source = blocks.map(cloneBlock);
  let tableOverflow = false;
  const measure: BooleanMeasureFit = (...args) => {
    const result = readMeasurement(rawMeasure(...args));
    if (result.tableOverflow) tableOverflow = true;
    return result.fits;
  };
  const tableOverflowed = () => tableOverflow;
  const resetTableOverflow = () => {
    tableOverflow = false;
  };

  if (fitMode === "auto-shrink") {
    return fitAutoShrink(source, measure, tableOverflowed, resetTableOverflow);
  }
  if (fitMode === "auto") {
    const full = fitFullSourceSingleCard(source, measure, resetTableOverflow, AUTO_MIN_FONT_PT);
    if (full) return full;
  }
  return fitMultiCard(source, measure, maxCards, tableOverflowed, resetTableOverflow);
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
  ) => MeasureOutcome;
  layer: ReactNode;
}

function hasOversizedTable(element: HTMLElement): boolean {
  const availableWidth = element.clientWidth;
  const availableHeight = element.clientHeight;
  for (const table of element.querySelectorAll<HTMLElement>(".card-table")) {
    const rect = table.getBoundingClientRect();
    if (rect.width > availableWidth + 1 || rect.height > availableHeight + 1) return true;
  }
  return false;
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
      return {
        fits: element.scrollHeight <= element.clientHeight + 1,
        tableOverflow: hasOversizedTable(element),
      };
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

interface FitState {
  key: string | null;
  result: FitResult | null;
  ready: boolean;
  error: boolean;
}

const EMPTY_FIT_STATE: FitState = { key: null, result: null, ready: false, error: false };

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
  const [fitState, setFitState] = useState<FitState>(EMPTY_FIT_STATE);

  const markers = useMemo(
    () => ({
      verbal: t(componentKey("verbal")),
      somatic: t(componentKey("somatic")),
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
      setFitState(EMPTY_FIT_STATE);
      return;
    }
    const cached = fitCache.get(cacheKey);
    if (cached) {
      setFitState({ key: cacheKey, result: cached, ready: true, error: false });
      return;
    }
    let cancelled = false;
    setFitState({ key: cacheKey, result: null, ready: false, error: false });
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
        setFitState({ key: cacheKey, result: computed, ready: true, error: false });
      } catch (cause) {
        if (!cancelled) {
          console.error("Failed to measure card layout:", cause);
          setFitState({ key: cacheKey, result: null, ready: true, error: true });
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

  const currentState = fitState.key === cacheKey ? fitState : EMPTY_FIT_STATE;
  return {
    result: currentState.result,
    presentation,
    ready: currentState.ready,
    error: currentState.error,
    measureLayer: layer,
  };
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

interface DeckFitsState {
  signature: string | null;
  results: Map<string, DeckFitEntry>;
  ready: boolean;
  error: boolean;
}

const EMPTY_DECK_FITS_STATE: DeckFitsState = {
  signature: null,
  results: new Map(),
  ready: false,
  error: false,
};

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
  const [fitsState, setFitsState] = useState<DeckFitsState>(EMPTY_DECK_FITS_STATE);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const markers = useMemo(
    () => ({
      verbal: t(componentKey("verbal")),
      somatic: t(componentKey("somatic")),
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
      setFitsState({ signature, results: new Map(), ready: false, error: false });
      return;
    }
    let cancelled = false;
    setFitsState({ signature, results: new Map(), ready: false, error: false });
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
          setFitsState({ signature, results: next, ready: true, error: false });
        }
      } catch (cause) {
        if (!cancelled) {
          console.error("Failed to measure deck card layouts:", cause);
          setFitsState({ signature, results: new Map(), ready: true, error: true });
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

  const currentState = fitsState.signature === signature ? fitsState : EMPTY_DECK_FITS_STATE;
  return {
    results: currentState.results,
    ready: currentState.ready,
    error: currentState.error,
    measureLayer: enabled ? layer : null,
  };
}
