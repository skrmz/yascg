import { describe, expect, it } from "vite-plus/test";
import {
  fittingTableColumns,
  paginateTableRows,
  tablePaperDimensions,
} from "./table-print-layout.ts";

describe("table print layout", () => {
  it("respects standard paper dimensions and landscape orientation", () => {
    expect(tablePaperDimensions("letter", "portrait")).toEqual([215.9, 279.4]);
    expect(tablePaperDimensions("A4", "landscape")).toEqual([297, 210]);
  });

  it("allocates width by demand and never falls below 6 pt", () => {
    const columnDemand = (fontPt: number) => [
      { minimum: fontPt * 7, preferred: fontPt * 9 },
      { minimum: fontPt * 8, preferred: fontPt * 20 },
    ];
    const [comfortable] = fittingTableColumns(180, columnDemand);
    expect(comfortable.fontPt).toBe(9);
    expect(comfortable.widths[0] + comfortable.widths[1]).toBeCloseTo(180);
    expect(comfortable.widths[1]).toBeGreaterThan(comfortable.widths[0]);
    expect([...fittingTableColumns(90, columnDemand)]).toEqual([{ fontPt: 6, widths: [42, 48] }]);
    expect([...fittingTableColumns(89, columnDemand)]).toEqual([]);
  });

  it("keeps short rows together and continues long Unicode text without dropping any characters", () => {
    const segmenter = new Intl.Segmenter();
    const graphemes = (value: string) =>
      Array.from(segmenter.segment(value), ({ segment }) => segment);
    const cellHeight = (index: number, value: string) =>
      index === 0
        ? value.split("\n").length
        : value
            .split("\n")
            .reduce((height, line) => height + Math.ceil(graphemes(line).length / 3), 0);
    const text = "e\u0301👩‍🚀Ω".repeat(17);
    const rows = [
      { key: "a", cells: ["Aid", "abc"] },
      { key: "b", cells: ["Bless", "123456789"] },
      { key: "c", cells: ["Cure", text] },
    ];
    const pages = paginateTableRows(
      rows,
      3,
      {
        row: (cells) => ({
          height: Math.max(...cells.map((value, index) => cellHeight(index, value))),
          fitsWidth: true,
        }),
        cellHeight,
      },
      0,
      "Continued",
    );
    expect(pages?.slice(0, 2)).toEqual([[rows[0]], [rows[1]]]);
    const fragments = pages?.slice(2).flat() ?? [];
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments[0].cells[0]).toBe("Cure");
    expect(fragments.slice(1).every(({ cells }) => cells[0].startsWith("Continued"))).toBe(true);
    expect(fragments.map(({ cells }) => cells[1]).join("")).toBe(text);
    expect(fragments.flatMap(({ cells }) => graphemes(cells[1]))).toEqual(graphemes(text));
  });

  it("rejects overflow when a page has no usable height or a cell clips", () => {
    const rows = [{ key: "a", cells: ["Aid"] }];
    const measure = {
      row: () => ({ height: 1, fitsWidth: true }),
      cellHeight: () => 1,
    };
    expect(paginateTableRows(rows, 0, measure, 0, "Continued")).toBeNull();
    expect(
      paginateTableRows(
        rows,
        10,
        { ...measure, row: () => ({ height: 1, fitsWidth: false }) },
        0,
        "Continued",
      ),
    ).toBeNull();
  });
});
