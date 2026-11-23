import type { PaperSize } from "@/print/PrintSheet.tsx";
import {
  tablePaperDimensions,
  type TablePrintColumn,
  type TablePrintLayout,
  type TablePrintOrientation,
} from "@/print/table-print-layout.ts";

export function TablePrintPages({
  columns,
  layout,
  paper,
  orientation,
  pageLabel,
}: {
  columns: readonly TablePrintColumn[];
  layout: TablePrintLayout;
  paper: PaperSize;
  orientation: TablePrintOrientation;
  pageLabel: (index: number) => string;
}) {
  const [widthMm, heightMm] = tablePaperDimensions(paper, orientation);
  const widthTotal = layout.widths.reduce((sum, width) => sum + width, 0);
  return layout.pages.map((rows, index) => (
    <section
      className="table-print-sheet"
      aria-label={pageLabel(index + 1)}
      style={{ width: `${widthMm}mm`, height: `${heightMm}mm`, fontSize: `${layout.fontPt}pt` }}
      key={index}
    >
      <table>
        <colgroup>
          {columns.map(({ id }, columnIndex) => (
            <col
              key={id}
              style={{ width: `${(layout.widths[columnIndex] / widthTotal) * 100}%` }}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map(({ id, label }) => (
              <th key={id} scope="col">
                <div className="table-print-cell-text">{label}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, cells }) => (
            <tr key={key}>
              {columns.map(({ id }, columnIndex) => {
                const content = <div className="table-print-cell-text">{cells[columnIndex]}</div>;
                return id === "name" ? (
                  <th key={id} scope="row">
                    {content}
                  </th>
                ) : (
                  <td key={id}>{content}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  ));
}
