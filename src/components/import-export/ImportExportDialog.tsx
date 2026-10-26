import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "@/state/AppProvider.tsx";
import {
  buildCustomSpellsPayload,
  buildDeckPayload,
  customSpellsExportFilename,
  deckExportFilename,
  downloadJson,
} from "@/io/export.ts";
import {
  analyzeCustomImport,
  applyCustomImport,
  type CollisionStrategy,
  type CustomImportPlan,
} from "@/io/import-custom.ts";
import { analyzeDeckImport, applyDeckImport, type DeckImportPlan } from "@/io/import-deck.ts";
import {
  message,
  toMessageDescriptor,
  translateMessage,
  type MessageDescriptor,
} from "@/locales/messages.ts";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { NativeSelect } from "@/ui/Field.tsx";

type Notice = { tone: "ok" | "error"; texts: MessageDescriptor[] };

async function readFileText(file: File): Promise<string> {
  return file.text();
}

export function ImportExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    customSpells,
    activeDeck,
    refreshAll,
    srdSpellOverrides,
    englishById,
    manifest,
    dataLoading,
    dataError,
  } = useApp();
  const { t } = useTranslation();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [customPlan, setCustomPlan] = useState<CustomImportPlan | null>(null);
  const [strategies, setStrategies] = useState<CollisionStrategy>("skip");
  const [confirmLossy, setConfirmLossy] = useState(false);
  const [deckPlan, setDeckPlan] = useState<DeckImportPlan | null>(null);
  const [confirmDeck, setConfirmDeck] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const customInputRef = useRef<HTMLInputElement | null>(null);
  const deckInputRef = useRef<HTMLInputElement | null>(null);
  const customAnalysisRef = useRef(0);
  const deckAnalysisRef = useRef(0);

  // Override validation needs the loaded SRD lookup and manifest; analyzing
  // before they arrive would misreport real spell ids as unknown.
  const canAnalyzeCustom =
    !dataLoading && !dataError && manifest.length > 0 && englishById.size > 0;
  const hasPendingImport = customPlan !== null || deckPlan !== null;

  const resetCustomImport = () => {
    customAnalysisRef.current += 1;
    setCustomPlan(null);
    setStrategies("skip");
    setConfirmLossy(false);
    setConfirmDiscard(false);
    setNotice(null);
  };

  const resetDeckImport = () => {
    deckAnalysisRef.current += 1;
    setDeckPlan(null);
    setConfirmDeck(false);
    setConfirmDiscard(false);
    setNotice(null);
  };

  const resetImportState = () => {
    resetCustomImport();
    resetDeckImport();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (hasPendingImport) {
      setConfirmDiscard(true);
      return;
    }
    resetImportState();
    setNotice(null);
    onOpenChange(false);
  };

  const discardAndClose = () => {
    resetImportState();
    setNotice(null);
    onOpenChange(false);
  };

  const exportCustom = () => {
    downloadJson(
      customSpellsExportFilename(),
      buildCustomSpellsPayload(customSpells, srdSpellOverrides),
    );
    setNotice({
      tone: "ok",
      texts: [
        message("importExport.exportedSpells", { count: customSpells.length }),
        message("importExport.exportedOverrides", { count: srdSpellOverrides.length }),
      ],
    });
  };

  const exportDeck = () => {
    if (!activeDeck) return;
    downloadJson(
      deckExportFilename(),
      buildDeckPayload({ name: activeDeck.name, entries: activeDeck.entries }),
    );
    setNotice({ tone: "ok", texts: [message("importExport.exportedDeck")] });
  };

  const onCustomFile = async (file: File) => {
    const requestId = ++customAnalysisRef.current;
    setConfirmDiscard(false);
    if (!canAnalyzeCustom) {
      setCustomPlan(null);
      setNotice({
        tone: "error",
        texts: [dataError ?? message("importExport.error.validationUnavailable")],
      });
      return;
    }
    const text = await readFileText(file);
    if (requestId !== customAnalysisRef.current) return;
    const analysis = analyzeCustomImport(text, customSpells, {
      srdSpellsById: englishById,
      supportedLocales: manifest.map((entry) => entry.code),
    });
    if (!analysis.ok) {
      setCustomPlan(null);
      const texts: MessageDescriptor[] = [analysis.error];
      for (const entry of analysis.overrideErrors ?? []) {
        texts.push(
          message("importExport.error.overrideAt", {
            index: entry.index,
            spellId: entry.spellId || "?",
            locale: entry.locale || "?",
          }),
        );
        texts.push(entry.reason);
      }
      setNotice({ tone: "error", texts });
      return;
    }
    setCustomPlan(analysis.plan);
    setStrategies("skip");
    setConfirmLossy(false);
    const validatedTexts: MessageDescriptor[] = [
      message("importExport.validatedSpells", { count: analysis.plan.entries.length }),
      message("importExport.validatedOverrides", { count: analysis.plan.overrides.length }),
    ];
    if (analysis.plan.lossy) {
      setNotice({
        tone: "ok",
        texts: [
          message("importExport.unknownVersionTry"),
          ...validatedTexts,
          message("importExport.lossyDiscard", {
            count: analysis.plan.droppedOverrides,
            fields:
              analysis.plan.lossyFields.length > 0
                ? ` (${analysis.plan.lossyFields.join(", ")})`
                : "",
          }),
        ],
      });
    } else if (analysis.plan.unknownVersion) {
      setNotice({
        tone: "ok",
        texts: [message("importExport.unknownVersionTry"), ...validatedTexts],
      });
    } else {
      setNotice({ tone: "ok", texts: validatedTexts });
    }
  };

  const commitCustom = async () => {
    if (!customPlan) return;
    setConfirmDiscard(false);
    const fingerprints = new Map(
      customPlan.collisions.map((collision) => [collision.id, collision.fingerprint]),
    );
    try {
      const counts = await applyCustomImport(customPlan, strategies, fingerprints);
      const texts: MessageDescriptor[] = [
        message("importExport.importedCounts", {
          imported: counts.imported,
          overwritten: counts.overwritten,
          copied: counts.copied,
          skipped: counts.skipped,
          remapped: counts.remapped,
          overrides: counts.overrides,
        }),
      ];
      if (customPlan.remaps.length > 0) {
        texts.push(
          message("importExport.remapped", {
            items: customPlan.remaps.map((remap) => `${remap.from} → ${remap.to}`).join(", "),
          }),
        );
      }
      setNotice({ tone: "ok", texts });
      setCustomPlan(null);
      refreshAll();
    } catch (error) {
      console.error("Failed to apply custom-spell import:", error);
      setNotice({ tone: "error", texts: [toMessageDescriptor(error)] });
    }
  };

  const onDeckFile = async (file: File) => {
    const requestId = ++deckAnalysisRef.current;
    setConfirmDiscard(false);
    const text = await readFileText(file);
    if (requestId !== deckAnalysisRef.current) return;
    const analysis = analyzeDeckImport(text);
    if (!analysis.ok) {
      setDeckPlan(null);
      setNotice({ tone: "error", texts: [analysis.error] });
      return;
    }
    setDeckPlan(analysis.plan);
    setConfirmDeck(false);
    const texts: MessageDescriptor[] = [
      analysis.plan.unknownVersion
        ? message("importExport.unknownVersionDeck")
        : message("importExport.validatedDeck", { count: analysis.plan.entries.length }),
    ];
    if (analysis.plan.removedDuplicates > 0) {
      texts.push(
        message("importExport.duplicateWillBeRemoved", {
          count: analysis.plan.removedDuplicates,
        }),
      );
    }
    setNotice({ tone: "ok", texts });
  };

  const commitDeck = async () => {
    if (!deckPlan) return;
    setConfirmDiscard(false);
    const current = activeDeck;
    if (!current) return;
    try {
      await applyDeckImport(deckPlan, current.revision);
      const texts: MessageDescriptor[] = [message("importExport.activeDeckReplaced")];
      if (deckPlan.removedDuplicates > 0) {
        texts.push(
          message("importExport.duplicateRemoved", {
            count: deckPlan.removedDuplicates,
          }),
        );
      }
      setNotice({ tone: "ok", texts });
      toast.success(t("importExport.deckImportedTitle"), {
        description:
          deckPlan.removedDuplicates > 0
            ? t("importExport.deckImportedDescription", {
                count: deckPlan.removedDuplicates,
              })
            : t("importExport.deckImportedDefault"),
      });
      setDeckPlan(null);
      refreshAll();
    } catch (error) {
      console.error("Failed to apply deck import:", error);
      setNotice({ tone: "error", texts: [toMessageDescriptor(error)] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={t("importExport.title")}
        description={t("importExport.description")}
        className="w-[min(92vw,44rem)]"
      >
        <div className="space-y-4">
          {confirmDiscard ? (
            <div
              className="space-y-2 rounded border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-300"
              role="alert"
            >
              <p>{t("importExport.discardNotice")}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirmDiscard(false)}>
                  {t("importExport.keepReviewing")}
                </Button>
                <Button size="sm" variant="destructive" onClick={discardAndClose}>
                  {t("importExport.discardClose")}
                </Button>
              </div>
            </div>
          ) : null}
          {notice ? (
            <p
              className={
                notice.tone === "ok"
                  ? "rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300"
                  : "rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300"
              }
              role="status"
            >
              {notice.texts.map((text) => translateMessage(t, text)).join(" ")}
            </p>
          ) : null}

          <section className="space-y-2 rounded border border-border p-3">
            <h3 className="text-sm font-semibold text-foreground">
              {t("importExport.customSpells")}
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={exportCustom}>
                {t("importExport.exportCustom")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canAnalyzeCustom}
                onClick={() => customInputRef.current?.click()}
              >
                {t("importExport.importCustom")}
              </Button>
              <input
                ref={customInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onCustomFile(file);
                  event.target.value = "";
                }}
              />
            </div>
            {customPlan ? (
              <div className="space-y-2 rounded border border-border bg-muted/40 p-2 text-xs">
                {customPlan.collisions.length > 0 ? (
                  <>
                    <p>
                      {t("importExport.collisions", {
                        count: customPlan.collisions.length,
                        names: customPlan.collisions
                          .map((collision) => collision.incomingName)
                          .join(", "),
                      })}
                    </p>
                    <label className="flex items-center gap-2">
                      {t("importExport.conflictHandling")}
                      <NativeSelect
                        aria-label={t("importExport.collisionStrategy")}
                        className="h-7 w-44 text-xs"
                        value={strategies}
                        onChange={(event) => setStrategies(event.target.value as CollisionStrategy)}
                      >
                        <option value="skip">{t("importExport.skip")}</option>
                        <option value="keep-both">{t("importExport.keepBoth")}</option>
                        <option value="overwrite">{t("importExport.overwriteExisting")}</option>
                      </NativeSelect>
                    </label>
                  </>
                ) : (
                  <p>{t("importExport.noCollisions")}</p>
                )}
                <p>
                  {translateMessage(
                    t,
                    message("importExport.appliedSpells", {
                      count: customPlan.entries.length,
                    }),
                  )}{" "}
                  {translateMessage(
                    t,
                    message("importExport.appliedOverrides", {
                      count: customPlan.overrides.length,
                    }),
                  )}
                </p>
                {customPlan.lossy ? (
                  <p className="rounded border border-amber-400/30 bg-amber-400/10 p-2 text-amber-300">
                    {t("importExport.lossy", {
                      overrides: customPlan.droppedOverrides,
                      fields:
                        customPlan.lossyFields.length > 0
                          ? ` (${customPlan.lossyFields.join(", ")})`
                          : "",
                    })}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {customPlan.lossy && !confirmLossy ? (
                    <Button size="sm" variant="destructive" onClick={() => setConfirmLossy(true)}>
                      {t("importExport.confirmLossy")}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => void commitCustom()}>
                      {t("importExport.commitCustom")}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={resetCustomImport}>
                    {t("importExport.resetCustom")}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-2 rounded border border-border p-3">
            <h3 className="text-sm font-semibold text-foreground">
              {t("importExport.activeDeck")}
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={exportDeck}>
                {t("importExport.exportDeck")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => deckInputRef.current?.click()}>
                {t("importExport.importDeck")}
              </Button>
              <input
                ref={deckInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onDeckFile(file);
                  event.target.value = "";
                }}
              />
            </div>
            {deckPlan ? (
              <div className="space-y-2 rounded border border-border bg-muted/40 p-2 text-xs">
                <p>
                  {t("importExport.deckPlan", {
                    count: deckPlan.entries.length,
                    name: deckPlan.name ? t("importExport.deckName", { name: deckPlan.name }) : "",
                  })}
                  {deckPlan.removedDuplicates > 0
                    ? ` ${t("importExport.duplicateWillBeRemoved", {
                        count: deckPlan.removedDuplicates,
                      })}`
                    : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {confirmDeck ? (
                    <Button size="sm" variant="destructive" onClick={() => void commitDeck()}>
                      {t("importExport.confirmReplace")}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setConfirmDeck(true)}>
                      {t("importExport.replaceActive")}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={resetDeckImport}>
                    {t("importExport.resetDeck")}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
