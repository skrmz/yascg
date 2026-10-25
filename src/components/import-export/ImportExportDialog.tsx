import { useRef, useState } from "react";
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
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { NativeSelect } from "@/ui/Field.tsx";

type Notice = { tone: "ok" | "error"; text: string };

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
      text: `Exported ${customSpells.length} custom spell(s) and ${srdSpellOverrides.length} SRD override(s).`,
    });
  };

  const exportDeck = () => {
    if (!activeDeck) return;
    downloadJson(
      deckExportFilename(),
      buildDeckPayload({ name: activeDeck.name, entries: activeDeck.entries }),
    );
    setNotice({ tone: "ok", text: "Exported the active deck." });
  };

  const onCustomFile = async (file: File) => {
    const requestId = ++customAnalysisRef.current;
    setConfirmDiscard(false);
    if (!canAnalyzeCustom) {
      setCustomPlan(null);
      setNotice({
        tone: "error",
        text:
          dataError ??
          "SRD validation data is not loaded yet. Wait for the spell library to finish loading, then try again.",
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
      setNotice({ tone: "error", text: analysis.error });
      return;
    }
    setCustomPlan(analysis.plan);
    setStrategies("skip");
    setConfirmLossy(false);
    const summary = `${analysis.plan.entries.length} spell record(s) and ${analysis.plan.overrides.length} override record(s) validated.`;
    if (analysis.plan.lossy) {
      setNotice({
        tone: "ok",
        text: `Unknown version — ${summary} ${analysis.plan.droppedOverrides} override record(s) and dropped field(s) would be discarded. Confirm before importing.`,
      });
    } else if (analysis.plan.unknownVersion) {
      setNotice({
        tone: "ok",
        text: `Unknown version — Try Import available. ${summary}`,
      });
    } else {
      setNotice({ tone: "ok", text: summary });
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
      setNotice({
        tone: "ok",
        text: `Imported ${counts.imported}, overwritten ${counts.overwritten}, copied ${counts.copied}, skipped ${counts.skipped}, remapped ${counts.remapped}, overrides ${counts.overrides}.`,
      });
      if (customPlan.remaps.length > 0) {
        setNotice((previous) => ({
          tone: "ok",
          text: `${previous?.text ?? ""} Remapped: ${customPlan.remaps
            .map((remap) => `${remap.from} → ${remap.to}`)
            .join(", ")}`,
        }));
      }
      setCustomPlan(null);
      refreshAll();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      });
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
      setNotice({ tone: "error", text: analysis.error });
      return;
    }
    setDeckPlan(analysis.plan);
    setConfirmDeck(false);
    const duplicateText =
      analysis.plan.removedDuplicates > 0
        ? ` ${analysis.plan.removedDuplicates} duplicate entr${
            analysis.plan.removedDuplicates === 1 ? "y" : "ies"
          } will be removed.`
        : "";
    setNotice({
      tone: "ok",
      text: analysis.plan.unknownVersion
        ? `Unknown version — Try Import available. Confirm to replace the active deck.${duplicateText}`
        : `${analysis.plan.entries.length} deck entr${
            analysis.plan.entries.length === 1 ? "y" : "ies"
          } validated. Confirm to replace the active deck.${duplicateText}`,
    });
  };

  const commitDeck = async () => {
    if (!deckPlan) return;
    setConfirmDiscard(false);
    const current = activeDeck;
    if (!current) return;
    try {
      await applyDeckImport(deckPlan, current.revision);
      const duplicateText =
        deckPlan.removedDuplicates > 0
          ? ` Removed ${deckPlan.removedDuplicates} duplicate entr${
              deckPlan.removedDuplicates === 1 ? "y" : "ies"
            }.`
          : "";
      setNotice({ tone: "ok", text: `Active deck replaced.${duplicateText}` });
      toast.success("Deck imported", {
        description:
          deckPlan.removedDuplicates > 0
            ? `Removed ${deckPlan.removedDuplicates} duplicate entr${
                deckPlan.removedDuplicates === 1 ? "y" : "ies"
              } from the imported deck.`
            : "The active deck was replaced.",
      });
      setDeckPlan(null);
      refreshAll();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title="Import / Export JSON"
        description="Custom-spell payloads use version 1.1.0 (with SRD overrides); deck payloads remain version 1.0.0. Export is the recommended backup for local data."
        className="w-[min(92vw,44rem)]"
      >
        <div className="space-y-4">
          {confirmDiscard ? (
            <div
              className="space-y-2 rounded border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-300"
              role="alert"
            >
              <p>
                An import is ready but has not been applied. Closing the dialog now discards it.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirmDiscard(false)}>
                  Keep reviewing
                </Button>
                <Button size="sm" variant="destructive" onClick={discardAndClose}>
                  Discard import and close
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
              {notice.text}
            </p>
          ) : null}

          <section className="space-y-2 rounded border border-border p-3">
            <h3 className="text-sm font-semibold text-foreground">Custom spells</h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={exportCustom}>
                Export custom spells
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canAnalyzeCustom}
                onClick={() => customInputRef.current?.click()}
              >
                Import custom spells…
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
                      {customPlan.collisions.length} existing collision(s):{" "}
                      {customPlan.collisions.map((collision) => collision.incomingName).join(", ")}
                    </p>
                    <label className="flex items-center gap-2">
                      Conflict handling
                      <NativeSelect
                        aria-label="Collision strategy"
                        className="h-7 w-40 text-xs"
                        value={strategies}
                        onChange={(event) => setStrategies(event.target.value as CollisionStrategy)}
                      >
                        <option value="skip">Skip</option>
                        <option value="keep-both">Keep both</option>
                        <option value="overwrite">Overwrite existing</option>
                      </NativeSelect>
                    </label>
                  </>
                ) : (
                  <p>No collisions with existing custom spells.</p>
                )}
                <p>
                  {customPlan.entries.length} spell record(s) and {customPlan.overrides.length}{" "}
                  override record(s) will be applied.
                </p>
                {customPlan.lossy ? (
                  <p className="rounded border border-amber-400/30 bg-amber-400/10 p-2 text-amber-300">
                    Unknown version: {customPlan.droppedOverrides} override record(s) and dropped
                    field(s)
                    {customPlan.lossyFields.length > 0
                      ? ` (${customPlan.lossyFields.join(", ")})`
                      : ""}{" "}
                    will be discarded.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {customPlan.lossy && !confirmLossy ? (
                    <Button size="sm" variant="destructive" onClick={() => setConfirmLossy(true)}>
                      Confirm lossy import…
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => void commitCustom()}>
                      Commit custom-spell import
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={resetCustomImport}>
                    Reset custom import
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-2 rounded border border-border p-3">
            <h3 className="text-sm font-semibold text-foreground">Active deck</h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={exportDeck}>
                Export active deck
              </Button>
              <Button variant="outline" size="sm" onClick={() => deckInputRef.current?.click()}>
                Import deck…
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
                  {deckPlan.entries.length} entr{deckPlan.entries.length === 1 ? "y" : "ies"}
                  {deckPlan.name ? ` — name "${deckPlan.name}"` : ""}. Import replaces the active
                  deck and leaves saved decks untouched.
                  {deckPlan.removedDuplicates > 0
                    ? ` ${deckPlan.removedDuplicates} duplicate entr${
                        deckPlan.removedDuplicates === 1 ? "y" : "ies"
                      } will be removed.`
                    : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {confirmDeck ? (
                    <Button size="sm" variant="destructive" onClick={() => void commitDeck()}>
                      Confirm replace active deck
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setConfirmDeck(true)}>
                      Replace active deck…
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={resetDeckImport}>
                    Reset deck import
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
