import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "@/state/AppProvider.tsx";
import { buildCustomSpellsPayload, customSpellsExportFilename, downloadJson } from "@/io/export.ts";
import {
  analyzeCustomImport,
  applyCustomImport,
  type CollisionStrategy,
  type CustomImportPlan,
} from "@/io/import-custom.ts";
import { message, toMessageDescriptor, type MessageDescriptor } from "@/locales/messages.ts";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { NativeSelect } from "@/ui/Field.tsx";
import { DiscardNotice, FileInput, NoticeBanner, readFileText, type Notice } from "./shared.tsx";

export function CustomSpellImportExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    customSpells,
    refreshAll,
    srdSpellOverrides,
    englishById,
    manifest,
    dataLoading,
    dataError,
  } = useApp();
  const { t } = useTranslation();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [plan, setPlan] = useState<CustomImportPlan | null>(null);
  const [strategies, setStrategies] = useState<CollisionStrategy>("skip");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const analysisRef = useRef(0);

  // Override validation needs the loaded SRD lookup and manifest; analyzing
  // before they arrive would misreport real spell ids as unknown.
  const canAnalyzeCustom =
    !dataLoading && !dataError && manifest.length > 0 && englishById.size > 0;
  const hasPendingImport = plan !== null;

  const resetImport = () => {
    analysisRef.current += 1;
    setPlan(null);
    setStrategies("skip");
    setConfirmDiscard(false);
    setNotice(null);
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
    resetImport();
    onOpenChange(false);
  };

  const discardAndClose = () => {
    resetImport();
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

  const onCustomFile = async (file: File) => {
    const requestId = ++analysisRef.current;
    setConfirmDiscard(false);
    if (!canAnalyzeCustom) {
      setPlan(null);
      setNotice({
        tone: "error",
        texts: [dataError ?? message("importExport.error.validationUnavailable")],
      });
      return;
    }
    const text = await readFileText(file);
    if (requestId !== analysisRef.current) return;
    const analysis = analyzeCustomImport(text, customSpells, {
      srdSpellsById: englishById,
      supportedLocales: manifest.map((entry) => entry.code),
    });
    if (!analysis.ok) {
      setPlan(null);
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
    setPlan(analysis.plan);
    setStrategies("skip");
    setNotice({
      tone: "ok",
      texts: [
        message("importExport.validatedSpells", { count: analysis.plan.entries.length }),
        message("importExport.validatedOverrides", { count: analysis.plan.overrides.length }),
      ],
    });
  };

  const commitCustom = async () => {
    if (!plan) return;
    setConfirmDiscard(false);
    const fingerprints = new Map(
      plan.collisions.map((collision) => [collision.id, collision.fingerprint]),
    );
    try {
      const counts = await applyCustomImport(plan, strategies, fingerprints);
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
      if (plan.remaps.length > 0) {
        texts.push(
          message("importExport.remapped", {
            items: plan.remaps.map((remap) => `${remap.from} → ${remap.to}`).join(", "),
          }),
        );
      }
      setNotice({ tone: "ok", texts });
      setPlan(null);
      refreshAll();
    } catch (error) {
      console.error("Failed to apply custom-spell import:", error);
      setNotice({ tone: "error", texts: [toMessageDescriptor(error)] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={t("importExport.customTitle")}
        description={t("importExport.customDescription")}
        className="w-[min(92vw,44rem)]"
      >
        <div className="space-y-4">
          {confirmDiscard ? (
            <DiscardNotice
              onKeepReviewing={() => setConfirmDiscard(false)}
              onDiscard={discardAndClose}
            />
          ) : null}
          <NoticeBanner notice={notice} />
          <section className="space-y-2 rounded border border-border p-3">
            <p className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">
              {t("importExport.customBackupNotice")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={exportCustom}>
                {t("importExport.exportCustom")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canAnalyzeCustom}
                onClick={() => inputRef.current?.click()}
              >
                {t("importExport.importCustom")}
              </Button>
              <FileInput inputRef={inputRef} onFile={(file) => void onCustomFile(file)} />
            </div>
            {plan ? (
              <div className="space-y-2 rounded border border-border bg-muted/40 p-2 text-xs">
                {plan.collisions.length > 0 ? (
                  <>
                    <p>
                      {t("importExport.collisions", {
                        count: plan.collisions.length,
                        names: plan.collisions
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
                  {t("importExport.appliedSpells", { count: plan.entries.length })}{" "}
                  {t("importExport.appliedOverrides", { count: plan.overrides.length })}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => void commitCustom()}>
                    {t("importExport.commitCustom")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetImport}>
                    {t("importExport.resetCustom")}
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
