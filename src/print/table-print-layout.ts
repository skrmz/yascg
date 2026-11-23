import type { PaperSize } from "@/print/PrintSheet.tsx";
import "@/print/table-print.css";

export interface TablePrintColumn {
  id: string;
  label: string;
}

export interface TablePrintRow {
  id: string;
  cells: Readonly<Record<string, string>>;
}

export type TablePrintOrientation = "portrait" | "landscape";

interface ColumnDemand {
  minimum: number;
  preferred: number;
}

export interface TablePrintLine {
  key: string;
  cells: string[];
}

export interface TablePrintLayout {
  fontPt: number;
  widths: number[];
  pages: TablePrintLine[][];
}

const paperDimensions: Record<PaperSize, readonly [number, number]> = {
  letter: [215.9, 279.4],
  A4: [210, 297],
};

export function tablePaperDimensions(
  paper: PaperSize,
  orientation: TablePrintOrientation,
): readonly [number, number] {
  const [width, height] = paperDimensions[paper];
  return orientation === "landscape" ? [height, width] : [width, height];
}

export function* fittingTableColumns(
  available: number,
  demandAt: (fontPt: number) => readonly ColumnDemand[],
) {
  for (const fontPt of [9, 8, 7, 6]) {
    const demands = demandAt(fontPt);
    const totalMinimum = demands.reduce((total, { minimum }) => total + minimum, 0);
    if (totalMinimum > available) continue;
    const weights = demands.map(({ minimum, preferred }) => Math.max(1, preferred - minimum));
    const totalWeight = weights.reduce((total, weight) => total + weight, 0);
    const widths = demands.map(
      ({ minimum }, index) => minimum + ((available - totalMinimum) * weights[index]) / totalWeight,
    );
    yield { fontPt, widths };
  }
}

interface TableMeasure {
  row: (cells: readonly string[]) => { height: number; fitsWidth: boolean };
  cellHeight: (index: number, value: string) => number;
}

function splitCell(
  text: string,
  prefix: string,
  maxHeight: number,
  measure: (value: string) => number,
  segmenter: Intl.Segmenter,
): readonly [string, string] {
  if (measure(prefix + text) <= maxHeight) return [prefix + text, ""];
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(prefix + text.slice(0, mid)) <= maxHeight) low = mid;
    else high = mid - 1;
  }
  const segments = segmenter.segment(text);
  const boundary = segments.containing(low)?.index ?? low;
  // Keep a word intact if a nearby break still makes good use of the page.
  const wordBreak = Math.max(
    text.lastIndexOf(" ", boundary - 1),
    text.lastIndexOf("\n", boundary - 1),
  );
  const end =
    boundary > 0 && wordBreak >= boundary * 0.85
      ? (segments.containing(wordBreak + 1)?.index ?? wordBreak + 1)
      : boundary;
  return [prefix + text.slice(0, end), text.slice(end)];
}

export function paginateTableRows(
  rows: readonly TablePrintLine[],
  maxHeight: number,
  measure: TableMeasure,
  nameIndex: number,
  continuedLabel: string,
): TablePrintLine[][] | null {
  if (maxHeight <= 0) return null;
  const pages: TablePrintLine[][] = [];
  let page: TablePrintLine[] = [];
  let usedHeight = 0;
  const newPage = () => {
    if (page.length) pages.push(page);
    page = [];
    usedHeight = 0;
  };
  const append = (line: TablePrintLine, height: number) => {
    page.push(line);
    usedHeight += height;
  };

  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const row of rows) {
    const { height, fitsWidth } = measure.row(row.cells);
    if (!fitsWidth) return null;
    if (usedHeight + height > maxHeight) newPage();
    if (height <= maxHeight) {
      append(row, height);
      continue;
    }

    let remaining = row.cells;
    let part = 0;
    while (remaining.some(Boolean)) {
      const split = remaining.map((value, index) => {
        let prefix = "";
        if (part > 0 && index === nameIndex) {
          prefix = `${continuedLabel}\n`;
          const identified = prefix + row.cells[index];
          if (!value && measure.cellHeight(index, identified) <= maxHeight / 4) prefix = identified;
        }
        return splitCell(
          value,
          prefix,
          maxHeight,
          (text) => measure.cellHeight(index, text),
          segmenter,
        );
      });
      const cells = split.map(([value]) => value);
      const next = split.map(([, rest]) => rest);
      const measured = measure.row(cells);
      if (measured.height > maxHeight || !measured.fitsWidth) return null;
      if (next.every((text, index) => text === remaining[index])) return null;
      append({ key: JSON.stringify([row.key, part]), cells }, measured.height);
      remaining = next;
      part += 1;
      if (remaining.some(Boolean)) newPage();
    }
  }
  newPage();
  return pages;
}

const minimumEms: Record<string, number> = {
  name: 8,
  level: 2.5,
  school: 5,
  classes: 6,
  components: 5,
  castingTime: 6,
  range: 5,
  duration: 5,
  concentration: 5,
  ritual: 3.5,
  description: 12,
  source: 4,
};

function makeCell(kind: "th" | "td", content = "") {
  const cell = document.createElement(kind);
  const text = document.createElement("div");
  text.className = "table-print-cell-text";
  text.textContent = content;
  cell.append(text);
  return { cell, text };
}

export function measureTablePrint(
  columns: readonly TablePrintColumn[],
  rows: readonly TablePrintRow[],
  paper: PaperSize,
  orientation: TablePrintOrientation,
  continuedLabel: string,
): TablePrintLayout | null {
  if (!columns.length || !rows.length) return null;

  const sheet = document.createElement("div");
  sheet.className = "table-print-sheet table-print-measure app-no-print";
  sheet.setAttribute("aria-hidden", "true");
  const [widthMm, heightMm] = tablePaperDimensions(paper, orientation);
  sheet.style.width = `${widthMm}mm`;
  sheet.style.height = `${heightMm}mm`;
  const table = document.createElement("table");
  const group = document.createElement("colgroup");
  const head = table.createTHead().insertRow();
  const body = table.createTBody().insertRow();
  const colElements = columns.map(({ label }) => {
    const { cell, text } = makeCell("th", label);
    head.append(cell);
    return { col: group.appendChild(document.createElement("col")), text };
  });
  const cells = columns.map(() => {
    const refs = makeCell("td");
    body.append(refs.cell);
    return refs;
  });
  table.prepend(group);
  sheet.append(table);
  document.body.append(sheet);

  try {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return null;
    const usableWidth = table.getBoundingClientRect().width - 1;
    const sheetStyle = getComputedStyle(sheet);
    const cellStyle = getComputedStyle(cells[0].cell);
    const horizontalChrome =
      Number.parseFloat(cellStyle.paddingLeft) +
      Number.parseFloat(cellStyle.paddingRight) +
      Number.parseFloat(cellStyle.borderRightWidth);
    const verticalChrome =
      Number.parseFloat(cellStyle.paddingTop) +
      Number.parseFloat(cellStyle.paddingBottom) +
      Number.parseFloat(cellStyle.borderBottomWidth);
    const candidates = fittingTableColumns(usableWidth, (fontPt) => {
      const em = (fontPt * 96) / 72;
      const font = `${fontPt}pt ${sheetStyle.fontFamily}`;
      return columns.map(({ id, label }) => {
        const cap = (id === "description" ? 40 : 18) * em;
        context.font = `bold ${font}`;
        let preferred = context.measureText(label).width;
        context.font = font;
        for (const row of rows) {
          if (preferred >= cap) break;
          const value = row.cells[id]?.slice(0, 180) ?? "";
          preferred = Math.max(preferred, context.measureText(value.split("\n", 1)[0]).width);
        }
        return {
          minimum: (minimumEms[id] ?? 5) * em + horizontalChrome,
          preferred: Math.min(preferred, cap) + horizontalChrome,
        };
      });
    });
    const measure: TableMeasure = {
      row(values) {
        cells.forEach(({ text }, index) => {
          text.textContent = values[index];
        });
        return {
          height: body.getBoundingClientRect().height,
          fitsWidth: cells.every(({ text }) => text.scrollWidth <= text.clientWidth + 1),
        };
      },
      cellHeight(index, value) {
        const { text } = cells[index];
        text.textContent = value;
        return text.getBoundingClientRect().height + verticalChrome;
      },
    };
    const printLines = rows.map(({ id, cells }) => ({
      key: JSON.stringify(id),
      cells: columns.map((column) => cells[column.id] ?? ""),
    }));
    const nameIndex = columns.findIndex(({ id }) => id === "name");
    for (const fit of candidates) {
      sheet.style.fontSize = `${fit.fontPt}pt`;
      colElements.forEach(({ col }, index) => {
        col.style.width = `${(fit.widths[index] / usableWidth) * 100}%`;
      });
      if (colElements.some(({ text }) => text.scrollWidth > text.clientWidth + 1)) continue;
      const availableHeight =
        sheet.clientHeight -
        Number.parseFloat(sheetStyle.paddingTop) -
        Number.parseFloat(sheetStyle.paddingBottom) -
        head.getBoundingClientRect().height -
        3;
      const pages = paginateTableRows(
        printLines,
        availableHeight,
        measure,
        nameIndex,
        continuedLabel,
      );
      if (pages?.length) return { ...fit, pages };
    }
    return null;
  } finally {
    sheet.remove();
  }
}
