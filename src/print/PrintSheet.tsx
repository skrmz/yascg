import type { Spell } from "@/domain/spells";
import type { BlockNode } from "@/markdown/parse.ts";
import { CardView } from "@/cards/Card.tsx";
import type { CompactPresentation } from "@/cards/compact.ts";
import { DEFAULT_CARD_DESIGN, type CardDesign } from "@/cards/design.ts";
import { DEFAULT_CARD_BACKGROUND, type CardBackground } from "@/cards/backgrounds.ts";
import { resolveContentLanguage } from "@/content-language.ts";

export type PaperSize = "letter" | "A4";
export const CARDS_PER_SHEET = 9;

/** One physical card: a single page of a spell's expansion. */
export interface PrintCardData {
  key: string;
  spell: Spell;
  pageBlocks: BlockNode[];
  fontPt: number;
  cardIndex: number;
  cardCount: number;
  truncated: boolean;
  presentation?: CompactPresentation;
}

// undefined is an unavailable position. null is an unused position with guides.
type PrintSheet = Array<PrintCardData | null | undefined>;

export function buildSheets(
  groups: readonly PrintCardData[][],
  startSlot = 1,
  skippedSlots: readonly number[] = [],
  keepTogether = false,
) {
  let sheet: PrintSheet = Array.from({ length: CARDS_PER_SHEET }, (_, index) =>
    index + 1 < startSlot || skippedSlots.includes(index + 1) ? undefined : null,
  );
  const sheets = [sheet];
  const freshSheet = () => {
    sheet = Array<null>(CARDS_PER_SHEET).fill(null);
    sheets.push(sheet);
  };
  for (const group of groups) {
    if (
      keepTogether &&
      group.length <= CARDS_PER_SHEET &&
      group.length > sheet.filter((cell) => cell === null).length
    ) {
      freshSheet();
    }
    for (const card of group) {
      if (!sheet.includes(null)) freshSheet();
      sheet[sheet.indexOf(null)] = card;
    }
  }
  const firstSheet = sheets[0];
  const firstSheetUnused = sheets.length > 1 && !firstSheet.some(Boolean);
  return { sheets: sheets.filter((cells) => cells.some(Boolean)), firstSheetUnused };
}

export interface PrintSheetsProps {
  sheets: readonly PrintSheet[];
  paperSize: PaperSize;
  cuttingBorders: boolean;
  sheetPrefix?: string;
  datasetLanguage?: string;
  design?: CardDesign;
  background?: CardBackground;
}

/** Renders 3x3 physical sheets. Geometry is governed entirely by print.css. */
export function PrintSheets({
  sheets,
  paperSize,
  cuttingBorders,
  sheetPrefix = "sheet",
  datasetLanguage,
  design = DEFAULT_CARD_DESIGN,
  background = DEFAULT_CARD_BACKGROUND,
}: PrintSheetsProps) {
  return (
    <div className="print-root" data-paper={paperSize}>
      <style>{`@page { size: ${paperSize === "letter" ? "letter" : "A4"}; margin: 0; }`}</style>
      {sheets.map((cells, sheetIndex) => (
        <div
          className={`print-sheet print-sheet-${paperSize}${
            cuttingBorders ? " print-cutting" : ""
          }`}
          key={`${sheetPrefix}-${sheetIndex}`}
        >
          <div className="print-grid">
            {cells.map((card, cellIndex) =>
              card ? (
                <div className="print-cell" key={card.key}>
                  <CardView
                    spell={card.spell}
                    blocks={card.pageBlocks}
                    cardIndex={card.cardIndex}
                    cardCount={card.cardCount}
                    fontPt={card.fontPt}
                    design={design}
                    background={background}
                    presentation={card.presentation}
                    contentLanguage={
                      datasetLanguage
                        ? resolveContentLanguage(card.spell, datasetLanguage)
                        : undefined
                    }
                    className="print-card"
                  />
                </div>
              ) : (
                <div
                  className={`print-cell print-cell-empty${card === undefined ? " print-cell-unavailable" : ""}`}
                  key={`empty-${cellIndex}`}
                />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
