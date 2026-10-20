import type { Spell } from "@/domain/spells";
import type { BlockNode } from "@/markdown/parse.ts";
import { CardView } from "@/cards/Card.tsx";

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
}

export function buildSheets(
  cards: readonly PrintCardData[],
  perSheet: number = CARDS_PER_SHEET,
): Array<Array<PrintCardData | null>> {
  const sheets: Array<Array<PrintCardData | null>> = [];
  for (let index = 0; index < cards.length; index += perSheet) {
    const slice = cards.slice(index, index + perSheet);
    const cells: Array<PrintCardData | null> = [...slice];
    while (cells.length < perSheet) cells.push(null);
    sheets.push(cells);
  }
  return sheets;
}

export interface PrintSheetsProps {
  cards: readonly PrintCardData[];
  paperSize: PaperSize;
  cuttingBorders: boolean;
  sheetPrefix?: string;
}

/** Renders 3x3 physical sheets. Geometry is governed entirely by print.css. */
export function PrintSheets({
  cards,
  paperSize,
  cuttingBorders,
  sheetPrefix = "sheet",
}: PrintSheetsProps) {
  const sheets = buildSheets(cards);
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
                    className="print-card"
                  />
                </div>
              ) : (
                <div className="print-cell print-cell-empty" key={`empty-${cellIndex}`} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
