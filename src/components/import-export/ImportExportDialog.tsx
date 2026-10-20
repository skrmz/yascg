import { useRef, useState } from "react";
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
  const { customSpells, activeDeck, refreshAll } = useApp();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [customPlan, setCustomPlan] = useState<CustomImportPlan | null>(null);
  const [strategies, setStrategies] = useState<CollisionStrategy>("skip");
  const [deckPlan, setDeckPlan] = useState<DeckImportPlan | null>(null);
  const [confirmDeck, setConfirmDeck] = useState(false);
  const customInputRef = useRef<HTMLInputElement | null>(null);
  const deckInputRef = useRef<HTMLInputElement | null>(null);

  const exportCustom = () => {
    downloadJson(customSpellsExportFilename(), buildCustomSpellsPayload(customSpells));
    setNotice({ tone: "ok", text: `Exported ${customSpells.length} custom spell(s).` });
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
    const text = await readFileText(file);
    const analysis = analyzeCustomImport(text, customSpells);
    if (!analysis.ok) {
      setCustomPlan(null);
      setNotice({ tone: "error", text: analysis.error });
      return;
    }
    setCustomPlan(analysis.plan);
    setStrategies("skip");
    setNotice(
      analysis.plan.unknownVersion
        ? {
            tone: "ok",
            text: `Unknown version — Try Import available. ${
              analysis.plan.entries.length
            } recognized record(s); unrecognized fields are discarded.`,
          }
        : { tone: "ok", text: `${analysis.plan.entries.length} record(s) validated.` },
    );
  };

  const commitCustom = async () => {
    if (!customPlan) return;
    const fingerprints = new Map(
      customPlan.collisions.map((collision) => [collision.id, collision.fingerprint]),
    );
    try {
      const counts = await applyCustomImport(customPlan, strategies, fingerprints);
      setNotice({
        tone: "ok",
        text: `Imported ${counts.imported}, overwritten ${counts.overwritten}, copied ${counts.copied}, skipped ${counts.skipped}, remapped ${counts.remapped}.`,
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
    const text = await readFileText(file);
    const analysis = analyzeDeckImport(text);
    if (!analysis.ok) {
      setDeckPlan(null);
      setNotice({ tone: "error", text: analysis.error });
      return;
    }
    setDeckPlan(analysis.plan);
    setConfirmDeck(false);
    setNotice({
      tone: "ok",
      text: analysis.plan.unknownVersion
        ? "Unknown version — Try Import available. Confirm to replace the active deck."
        : `${analysis.plan.entries.length} deck entr(y/ies) validated. Confirm to replace the active deck.`,
    });
  };

  const commitDeck = async () => {
    if (!deckPlan) return;
    const current = activeDeck;
    if (!current) return;
    try {
      await applyDeckImport(deckPlan, current.revision);
      setNotice({ tone: "ok", text: "Active deck replaced." });
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Import / Export JSON"
        description="Wire version 1.0.0. Export is the recommended backup for local data."
        className="w-[min(92vw,44rem)]"
      >
        <div className="space-y-4">
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
              <Button variant="outline" size="sm" onClick={() => customInputRef.current?.click()}>
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
                <Button size="sm" onClick={() => void commitCustom()}>
                  Commit custom-spell import
                </Button>
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
                </p>
                {confirmDeck ? (
                  <Button size="sm" variant="destructive" onClick={() => void commitDeck()}>
                    Confirm replace active deck
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setConfirmDeck(true)}>
                    Replace active deck…
                  </Button>
                )}
              </div>
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
