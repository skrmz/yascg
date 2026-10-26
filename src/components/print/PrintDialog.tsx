import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { useApp } from "@/state/AppProvider.tsx";
import { LIMITS } from "@/domain/spells";
import { useDeckCardFits, type DeckFitItem } from "@/cards/fit.tsx";
import { waitForCardFonts } from "@/cards/fonts.ts";
import { PrintSheets, type PaperSize, type PrintCardData } from "@/print/PrintSheet.tsx";
import { Button } from "@/ui/Button.tsx";
import { Checkbox } from "@/ui/Checkbox.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { NativeSelect } from "@/ui/Field.tsx";

export function PrintDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { resolvedEntries, language, activeDeck } = useApp();
  const { t } = useTranslation();
  const [paperSize, setPaperSize] = useState<PaperSize>("letter");
  const [cuttingBorders, setCuttingBorders] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [job, setJob] = useState<PrintCardData[] | null>(null);

  const resolvedSpells = resolvedEntries.flatMap((item) =>
    item.resolution.status === "resolved"
      ? [{ entry: item.entry, spell: item.resolution.spell }]
      : [],
  );

  const unavailableCount = resolvedEntries.filter(
    (item) => item.resolution.status === "translation-unavailable",
  ).length;
  const missingCount = resolvedEntries.filter(
    (item) => item.resolution.status === "missing",
  ).length;
  const omissionTotal = unavailableCount + missingCount;

  const fitItems = useMemo<DeckFitItem[]>(
    () =>
      resolvedSpells.map((item) => ({
        key: item.entry.entryId,
        spell: item.spell,
        fitMode: item.entry.fitMode,
      })),
    [resolvedSpells],
  );

  const fits = useDeckCardFits(fitItems, language, open);

  const overflowEntries = resolvedSpells.filter(
    (item) => fits.results.get(item.entry.entryId)?.overflow,
  );
  const blocked = overflowEntries.length > 0;

  const printCards = useMemo<PrintCardData[]>(() => {
    const cards: PrintCardData[] = [];
    for (const item of resolvedSpells) {
      const fit = fits.results.get(item.entry.entryId);
      if (!fit || fit.overflow) continue;
      fit.pages.forEach((pageBlocks, index) => {
        cards.push({
          key: `${item.entry.entryId}-${index}`,
          spell: item.spell,
          pageBlocks,
          fontPt: fit.fontPt,
          cardIndex: index + 1,
          cardCount: fit.pages.length,
          truncated: fit.truncated,
        });
      });
    }
    return cards;
  }, [resolvedSpells, fits.results]);

  const canPrint = printCards.length > 0 && !blocked && fits.ready && (!omissionTotal || confirmed);

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    let frame = 0;
    const run = async () => {
      await waitForCardFonts();
      if (cancelled) return;
      frame = window.requestAnimationFrame(() => window.print());
    };
    void run();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [job]);

  const startPrint = () => {
    setJob(printCards);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          title={t("print.title")}
          description={t("print.description")}
          footer={
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button disabled={!canPrint} onClick={startPrint}>
                <Printer size={14} aria-hidden="true" />
                {printCards.length > 0
                  ? t("print.printCards", { count: printCards.length })
                  : t("print.printAction")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                {t("print.paper")}
                <NativeSelect
                  aria-label={t("print.paperSize")}
                  className="h-8 w-36"
                  value={paperSize}
                  onChange={(event) => setPaperSize(event.target.value as PaperSize)}
                >
                  <option value="letter">US Letter</option>
                  <option value="A4">ISO A4</option>
                </NativeSelect>
              </label>
              <Checkbox
                label={t("print.cuttingBorders")}
                checked={cuttingBorders}
                onChange={(event) => setCuttingBorders(event.target.checked)}
              />
            </div>

            <div className="rounded border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">{t("print.settings")}</p>
              <ul className="mt-1 list-disc pl-4">
                <li>{t("print.scale")}</li>
                <li>{t("print.margins")}</li>
                <li>{t("print.headers")}</li>
                <li>{t("print.hardware")}</li>
              </ul>
            </div>

            {blocked ? (
              <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                {t("print.overflow", {
                  count: overflowEntries.length,
                  max: LIMITS.CONTINUATION_CARDS_MAX,
                })}
              </p>
            ) : null}

            {omissionTotal > 0 ? (
              <div className="rounded border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-200">
                <p>
                  {t("print.notAvailable", {
                    count: unavailableCount,
                    language,
                  })}{" "}
                  {t("print.missing", { count: missingCount })} {t("print.notDeleted")}
                </p>
                <div className="mt-2">
                  <Checkbox
                    label={t("print.omitConfirm")}
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                </div>
              </div>
            ) : null}

            {!fits.ready && printCards.length > 0 ? (
              <p className="text-xs text-muted-foreground">{t("print.preparing")}</p>
            ) : null}
            {activeDeck && activeDeck.entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("print.emptyDeck")}</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      {job
        ? createPortal(
            <PrintSheets
              cards={job}
              paperSize={paperSize}
              cuttingBorders={cuttingBorders}
              datasetLanguage={language}
            />,
            document.body,
          )
        : null}
      {open ? fits.measureLayer : null}
    </>
  );
}
