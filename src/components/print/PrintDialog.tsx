import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Printer } from "lucide-react";
import { useApp } from "@/state/AppProvider.tsx";
import { LIMITS } from "@/domain/spells";
import { useDeckCardFits, type DeckFitItem } from "@/cards/fit.tsx";
import { waitForCardFonts } from "@/cards/fonts.ts";
import { loadCardBackground, type CardBackground } from "@/cards/backgrounds.ts";
import type { CardDesign } from "@/cards/design.ts";
import {
  buildSheets,
  PrintSheets,
  type PaperSize,
  type PrintCardData,
} from "@/print/PrintSheet.tsx";
import { printDocumentTitle } from "@/print/document-title.ts";
import { Button } from "@/ui/Button.tsx";
import { Checkbox } from "@/ui/Checkbox.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/Collapsible.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { NativeSelect } from "@/ui/Field.tsx";

export function PrintDialog({
  open,
  onOpenChange,
  onOpenAppearance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAppearance?: () => void;
}) {
  const { resolvedEntries, language, activeDeck, cardDesign, cardBackground } = useApp();
  const { t } = useTranslation();
  const [paperSize, setPaperSize] = useState<PaperSize>(language === "de" ? "A4" : "letter");
  const [cuttingBorders, setCuttingBorders] = useState(false);
  // An absent entry is fully selected, including entries without a printable expansion.
  const [selection, setSelection] = useState<Map<string, number[]>>(new Map());
  const [confirmedOmissions, setConfirmedOmissions] = useState<string | null>(null);
  const [keepTogether, setKeepTogether] = useState(false);
  const [job, setJob] = useState<{
    sheets: ReturnType<typeof buildSheets>;
    title: string;
    background: CardBackground;
    design: CardDesign;
    paperSize: PaperSize;
    cuttingBorders: boolean;
    language: string;
  } | null>(null);

  useEffect(() => {
    setPaperSize(language === "de" ? "A4" : "letter");
  }, [language]);

  useEffect(() => {
    if (!open) {
      setSelection(new Map());
      setConfirmedOmissions(null);
      setKeepTogether(false);
    }
  }, [open]);

  const resolvedSpells = useMemo(
    () =>
      resolvedEntries.flatMap((item) =>
        item.resolution.status === "resolved"
          ? [{ entry: item.entry, spell: item.resolution.spell }]
          : [],
      ),
    [resolvedEntries],
  );
  const isSelected = (entryId: string) => selection.get(entryId)?.length !== 0;
  const allSpellsSelected = resolvedEntries.every(({ entry }) => !selection.has(entry.entryId));
  const anySpellSelected = resolvedEntries.some(({ entry }) => isSelected(entry.entryId));
  const omitted = resolvedEntries.filter(
    (item) => item.resolution.status !== "resolved" && isSelected(item.entry.entryId),
  );
  const unavailableCount = omitted.filter(
    (item) => item.resolution.status === "translation-unavailable",
  ).length;
  const missingCount = omitted.length - unavailableCount;
  const omissionKey = JSON.stringify(
    omitted.map(({ entry, resolution }) => [entry.entryId, resolution.status, language]),
  );

  const fitItems = useMemo<DeckFitItem[]>(
    () =>
      resolvedSpells.map((item) => ({
        key: item.entry.entryId,
        spell: item.spell,
        fitMode: item.entry.fitMode,
      })),
    [resolvedSpells],
  );

  const fits = useDeckCardFits(fitItems, language, open, cardDesign);

  const selectedSpells = resolvedSpells.filter(({ entry }) => isSelected(entry.entryId));
  const fitError =
    selectedSpells.length > 0 &&
    (fits.error || selectedSpells.some(({ entry }) => fits.failedKeys.has(entry.entryId)));
  const overflowEntries = selectedSpells.filter(
    (item) => fits.results.get(item.entry.entryId)?.fit.overflow,
  );
  const notesOverflow = overflowEntries.some(
    (item) => fits.results.get(item.entry.entryId)?.fit.overflowReason === "notes",
  );
  const tableOverflow = overflowEntries.some(
    (item) => fits.results.get(item.entry.entryId)?.fit.overflowReason === "table",
  );
  const blocked = overflowEntries.length > 0;

  const groups = selectedSpells.flatMap((item) => {
    const entry = fits.results.get(item.entry.entryId);
    if (!entry || entry.fit.overflow) return [];
    const cards: PrintCardData[] = [];
    const chosen = selection.get(item.entry.entryId);
    entry.fit.pages.forEach((pageBlocks, index) => {
      if (chosen && !chosen.includes(index)) return;
      cards.push({
        key: `${item.entry.entryId}-${index}`,
        spell: item.spell,
        pageBlocks,
        fontPt: entry.fit.fontPt,
        cardIndex: index + 1,
        cardCount: entry.fit.pages.length,
        truncated: entry.fit.truncated,
        presentation: entry.presentation ?? undefined,
      });
    });
    return cards.length ? [cards] : [];
  });
  const cardCount = groups.reduce((total, group) => total + group.length, 0);
  const sheets = buildSheets(groups, keepTogether);

  const canPrint =
    cardCount > 0 &&
    !blocked &&
    !fitError &&
    fits.ready &&
    (!omitted.length || confirmedOmissions === omissionKey);

  const selectCards = (entryId: string, cards?: number[]) => {
    setSelection((previous) => {
      const next = new Map(previous);
      if (cards) next.set(entryId, cards);
      else next.delete(entryId);
      return next;
    });
    setConfirmedOmissions(null);
  };

  useEffect(() => {
    if (!job) return;
    const previousTitle = document.title;
    let cancelled = false;
    let frame = 0;
    const restoreTitle = () => {
      document.title = previousTitle;
    };
    window.addEventListener("afterprint", restoreTitle);
    const run = async () => {
      await Promise.all([waitForCardFonts(), loadCardBackground(job.background)]);
      if (cancelled) return;
      document.title = job.title;
      frame = window.requestAnimationFrame(() => window.print());
    };
    void run();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", restoreTitle);
      restoreTitle();
    };
  }, [job]);

  const startPrint = () => {
    setJob({
      sheets,
      title: printDocumentTitle(activeDeck?.name),
      background: cardBackground,
      design: cardDesign,
      paperSize,
      cuttingBorders,
      language,
    });
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          title={t("print.title")}
          footer={
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button disabled={!canPrint} onClick={startPrint}>
                <Printer size={14} aria-hidden="true" />
                {cardCount > 0
                  ? t("print.printCards", { count: cardCount })
                  : t("print.printAction")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {onOpenAppearance && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenAppearance();
                  }}
                >
                  {t("card.appearance")}
                </Button>
              )}
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

            <div>
              <Checkbox
                label={t("print.keepTogether")}
                checked={keepTogether}
                onChange={(event) => setKeepTogether(event.target.checked)}
              />
              <p className="text-xs text-muted-foreground">{t("print.keepTogetherHelp")}</p>
            </div>
            <fieldset className="rounded border border-border p-3">
              <legend className="px-1 font-semibold">{t("print.selection")}</legend>
              {resolvedEntries.length > 0 && (
                <div className="mb-2 border-b border-border pb-2">
                  <Checkbox
                    label={t("print.selectAllSpells")}
                    checked={allSpellsSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = anySpellSelected && !allSpellsSelected;
                    }}
                    onChange={(event) => {
                      setSelection(
                        new Map(
                          event.target.checked
                            ? []
                            : resolvedEntries.map(({ entry }) => [entry.entryId, []]),
                        ),
                      );
                      setConfirmedOmissions(null);
                    }}
                  />
                </div>
              )}
              <ul className="max-h-48 space-y-2 overflow-auto">
                {resolvedEntries.map(({ entry, resolution }) => {
                  const name =
                    resolution.status === "resolved" ? resolution.spell.name : entry.reference.name;
                  const fit = fits.results.get(entry.entryId)?.fit;
                  const count = fit && !fit.overflow ? fit.pages.length : 0;
                  const chosen = selection.get(entry.entryId);
                  const indexes = Array.from({ length: count }, (_, index) => index);
                  const selected = indexes.filter((index) => !chosen || chosen.includes(index));
                  const partial = selected.length > 0 && selected.length < count;
                  return (
                    <li key={entry.entryId}>
                      <Checkbox
                        label={name}
                        checked={!chosen || (count > 0 && selected.length === count)}
                        ref={(input) => {
                          if (input) input.indeterminate = partial;
                        }}
                        onChange={(event) =>
                          selectCards(entry.entryId, event.target.checked ? undefined : [])
                        }
                      />
                      {count > 1 && (
                        <details className="ml-6">
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            {t("print.expandCards", { name })}
                          </summary>
                          <div className="flex flex-col items-start pl-3">
                            {indexes.map((index) => (
                              <Checkbox
                                key={index}
                                label={t("print.physicalCard", { index: index + 1, count })}
                                checked={selected.includes(index)}
                                onChange={(event) => {
                                  const next = event.target.checked
                                    ? [...selected, index]
                                    : selected.filter((value) => value !== index);
                                  selectCards(
                                    entry.entryId,
                                    next.length === count ? undefined : next,
                                  );
                                }}
                              />
                            ))}
                          </div>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <Collapsible className="rounded border border-border bg-muted/40 px-3 py-2">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="group w-full justify-between px-0"
                >
                  <span className="font-semibold text-foreground">{t("print.settings")}</span>
                  <ChevronDown
                    size={15}
                    aria-hidden="true"
                    className="transition-transform group-data-[state=open]:rotate-180"
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="text-xs leading-relaxed text-muted-foreground">
                <p>{t("print.description")}</p>
                <ul className="mt-1 list-disc pl-4">
                  <li>{t("print.scale")}</li>
                  <li>{t("print.margins")}</li>
                  <li>{t("print.headers")}</li>
                  <li>{t("print.backgroundGraphics")}</li>
                  <li>{t("print.hardware")}</li>
                </ul>
              </CollapsibleContent>
            </Collapsible>

            {fitError ? (
              <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                {t("print.fitError")}
              </p>
            ) : null}

            {blocked ? (
              <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                {tableOverflow
                  ? t("print.tableOverflow")
                  : notesOverflow
                    ? t("print.notesOverflow")
                    : t("print.overflow", {
                        count: overflowEntries.length,
                        max: LIMITS.CONTINUATION_CARDS_MAX,
                      })}
              </p>
            ) : null}

            {omitted.length > 0 ? (
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
                    checked={confirmedOmissions === omissionKey}
                    onChange={(event) =>
                      setConfirmedOmissions(event.target.checked ? omissionKey : null)
                    }
                  />
                </div>
              </div>
            ) : null}

            {!fits.ready && resolvedSpells.length > 0 ? (
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
              sheets={job.sheets}
              paperSize={job.paperSize}
              cuttingBorders={job.cuttingBorders}
              datasetLanguage={job.language}
              design={job.design}
              background={job.background}
            />,
            document.body,
          )
        : null}
      {open ? fits.measureLayer : null}
    </>
  );
}
