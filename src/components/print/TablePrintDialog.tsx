import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Info, Printer } from "lucide-react";
import type { PaperSize } from "@/print/PrintSheet.tsx";
import { TablePrintPages } from "@/print/TablePrintPages.tsx";
import { printDocumentTitle } from "@/print/document-title.ts";
import {
  measureTablePrint,
  type TablePrintColumn,
  type TablePrintLayout,
  type TablePrintOrientation,
  type TablePrintRow,
} from "@/print/table-print-layout.ts";
import { Button } from "@/ui/Button.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/Collapsible.tsx";
import { Dialog, DialogContent, DialogTrigger } from "@/ui/Dialog.tsx";
import { NativeSelect } from "@/ui/Field.tsx";

interface TablePrintInput {
  columns: readonly TablePrintColumn[];
  rows: () => readonly TablePrintRow[];
  paper: PaperSize;
  orientation: TablePrintOrientation;
  continued: string;
}

interface TablePrintJob {
  columns: readonly TablePrintColumn[];
  paper: PaperSize;
  orientation: TablePrintOrientation;
  layout: TablePrintLayout;
  title: string;
}

export function TablePrintDialog({
  columns,
  rows,
  rowCount,
  filters,
  sort,
  deckName,
  onColumns,
  disabled = false,
}: {
  columns: readonly TablePrintColumn[];
  rows: () => readonly TablePrintRow[];
  rowCount: number;
  filters: readonly string[];
  sort: string;
  deckName: string;
  onColumns: () => void;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const locale = i18n.resolvedLanguage;
  const [paperOverride, setPaper] = useState<PaperSize>();
  const [orientationOverride, setOrientation] = useState<TablePrintOrientation>();
  const [measured, setMeasured] = useState<{
    input: TablePrintInput;
    layout: TablePrintLayout | null;
  }>();
  const [job, setJob] = useState<TablePrintJob>();
  const noMatchesId = useId();
  const changeColumnsFrame = useRef(0);
  const paper = paperOverride ?? (locale === "de" ? "A4" : "letter");
  const orientation = orientationOverride ?? (columns.length > 6 ? "landscape" : "portrait");
  const continued = t("tablePrint.continued");
  const input = measured?.input;
  const measuredCurrent =
    input?.columns === columns &&
    input.rows === rows &&
    input.paper === paper &&
    input.orientation === orientation &&
    input.continued === continued;
  const layout = measuredCurrent ? measured?.layout : undefined;
  const pageLabel = (number: number) => t("tablePrint.page", { number });

  useEffect(() => {
    if (!open || !rowCount) return;
    const frame = window.requestAnimationFrame(() => {
      setMeasured({
        input: { columns, rows, paper, orientation, continued },
        layout: measureTablePrint(columns, rows(), paper, orientation, continued),
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, columns, rows, rowCount, paper, orientation, continued]);

  useEffect(() => {
    if (!job) return;
    const previousTitle = document.title;
    const afterPrint = () => setJob(undefined);
    window.addEventListener("afterprint", afterPrint, { once: true });
    const frame = window.requestAnimationFrame(() => {
      document.title = job.title;
      window.print();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", afterPrint);
      document.title = previousTitle;
    };
  }, [job]);

  useEffect(() => () => window.cancelAnimationFrame(changeColumnsFrame.current), []);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || rowCount === 0}
            aria-describedby={rowCount === 0 ? noMatchesId : undefined}
          >
            <Printer size={14} aria-hidden="true" />
            {t("tablePrint.action")}
          </Button>
        </DialogTrigger>
        {rowCount === 0 ? (
          <span id={noMatchesId} className="text-xs text-muted-foreground">
            {t("tablePrint.noMatches")}
          </span>
        ) : null}
        <DialogContent
          title={t("tablePrint.title")}
          description={t("tablePrint.description")}
          className="w-[min(94vw,74rem)]"
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("common.close")}
              </Button>
              <Button
                disabled={!layout || rowCount === 0 || Boolean(job) || disabled}
                onClick={() => {
                  if (!layout) return;
                  setJob({
                    layout,
                    columns,
                    paper,
                    orientation,
                    title: printDocumentTitle(deckName),
                  });
                }}
              >
                <Printer size={14} aria-hidden="true" />
                {t("tablePrint.action")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Collapsible className="space-y-2">
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-sm">
                  {t("print.paperSize")}
                  <NativeSelect
                    name="tablePaperSize"
                    value={paper}
                    onChange={(event) => setPaper(event.target.value as PaperSize)}
                  >
                    <option value="letter">US Letter</option>
                    <option value="A4">ISO A4</option>
                  </NativeSelect>
                </label>
                <label className="grid gap-1 text-sm">
                  {t("tablePrint.orientation")}
                  <NativeSelect
                    name="tableOrientation"
                    value={orientation}
                    onChange={(event) =>
                      setOrientation(event.target.value as TablePrintOrientation)
                    }
                  >
                    <option value="portrait">{t("tablePrint.portrait")}</option>
                    <option value="landscape">{t("tablePrint.landscape")}</option>
                  </NativeSelect>
                </label>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    changeColumnsFrame.current = window.requestAnimationFrame(onColumns);
                  }}
                >
                  {t("tablePrint.changeColumns")}
                </Button>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("tablePrint.showPrintHelp")}
                    title={t("tablePrint.showPrintHelp")}
                  >
                    <Info size={16} aria-hidden="true" />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="text-xs text-muted-foreground">
                {t("tablePrint.printHelp")}
              </CollapsibleContent>
            </Collapsible>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-words text-sm">
              <dt className="font-semibold">{t("tablePrint.filters")}</dt>
              <dd className="min-w-0">
                {filters.length ? filters.join(" · ") : t("tablePrint.noFilters")}
              </dd>
              <dt className="font-semibold">{t("tablePrint.sort")}</dt>
              <dd className="min-w-0">{sort}</dd>
              <dt className="font-semibold">{t("tablePrint.rows")}</dt>
              <dd>{rowCount.toLocaleString(locale)}</dd>
              <dt className="font-semibold">{t("tablePrint.columns")}</dt>
              <dd className="min-w-0">{columns.map(({ label }) => label).join(", ")}</dd>
            </dl>

            {rowCount === 0 ? (
              <p role="status">{t("tablePrint.noMatches")}</p>
            ) : layout === null ? (
              <p role="alert" className="rounded border border-amber-400/30 bg-amber-400/10 p-2">
                {t("tablePrint.doesNotFit")}
              </p>
            ) : !layout ? (
              <p role="status">{t("tablePrint.preparing")}</p>
            ) : (
              <div
                role="region"
                aria-label={t("tablePrint.pages")}
                tabIndex={0}
                className="table-print-preview rounded border border-border bg-muted"
              >
                <TablePrintPages {...{ layout, columns, paper, orientation, pageLabel }} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {job
        ? createPortal(
            <div className="table-print-output" aria-hidden="true">
              <style>{`@page deckTablePage { size: ${job.paper} ${job.orientation}; margin: 0; }`}</style>
              <TablePrintPages {...job} pageLabel={pageLabel} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
