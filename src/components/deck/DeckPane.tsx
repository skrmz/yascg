import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  Printer,
  Save,
  Trash2,
  Upload,
  Download,
  Wrench,
} from "lucide-react";
import { useApp } from "@/state/AppProvider.tsx";
import type { DeckEntry } from "@/domain/deck";
import type { CardFitMode } from "@/domain/spells";
import type { EntryResolution } from "@/services/data/resolution.ts";
import { Button } from "@/ui/Button.tsx";
import { Input, Label, NativeSelect } from "@/ui/Field.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/Select.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { cn } from "@/ui/cn.ts";
import { PrintDialog } from "@/components/print/PrintDialog.tsx";
import { ImportExportDialog } from "@/components/import-export/ImportExportDialog.tsx";

export function DeckPane() {
  const {
    activeDeck,
    savedDecks,
    dirty,
    resolvedEntries,
    language,
    renameDeck,
    addCopyToDeck,
    removeFromDeck,
    moveDeckEntry,
    reorderDeckEntries,
    setDeckEntryFitMode,
    clearDeck,
    repairDeckEntry,
    saveDeckAs,
    overwriteDeck,
    loadSaved,
    deleteSaved,
    canUndo,
    undoDelete,
    librarySpells,
    selectSpell,
  } = useApp();

  const [nameDraft, setNameDraft] = useState(activeDeck?.name ?? "");
  const [loadTarget, setLoadTarget] = useState("");
  const [overwriteTarget, setOverwriteTarget] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [repairEntryId, setRepairEntryId] = useState<string | null>(null);
  const [repairSpellId, setRepairSpellId] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);

  useEffect(() => {
    setNameDraft(activeDeck?.name ?? "");
  }, [activeDeck?.name]);

  const overwriteDeckInfo = useMemo(
    () => savedDecks.find((deck) => deck.id === overwriteTarget) ?? null,
    [savedDecks, overwriteTarget],
  );

  const entries = activeDeck?.entries ?? [];
  const printable = resolvedEntries.filter(
    ({ resolution }) => resolution.status === "resolved",
  ).length;
  const missingCount = resolvedEntries.filter(
    ({ resolution }) => resolution.status === "missing",
  ).length;
  const unavailableCount = resolvedEntries.filter(
    ({ resolution }) => resolution.status === "translation-unavailable",
  ).length;

  const onDragStart = (index: number) => setDragIndex(index);
  const onDrop = (index: number) => {
    if (dragIndex !== null && dragIndex !== index) {
      void reorderDeckEntries(dragIndex, index);
    }
    setDragIndex(null);
  };

  const repairTarget = librarySpells.find((spell) => spell.id === repairSpellId);

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Active deck">
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="deck-name" className="sr-only">
            Active deck name
          </Label>
          <Input
            id="deck-name"
            value={nameDraft}
            placeholder="Untitled deck"
            onChange={(event) => setNameDraft(event.target.value)}
            className="flex-1"
          />
          {dirty ? (
            <span
              className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[0.7rem] font-semibold text-amber-300"
              title="The active deck differs from its saved baseline"
            >
              Unsaved
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void saveDeckAs(nameDraft)}
            disabled={nameDraft.trim() === ""}
          >
            <Save size={13} aria-hidden="true" />
            Save as new
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (activeDeck) void renameDeck(nameDraft);
            }}
            disabled={
              !activeDeck || nameDraft.trim() === "" || nameDraft.trim() === activeDeck.name
            }
          >
            Rename
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIoOpen(true)}>
            <Upload size={13} aria-hidden="true" />
            <Download size={13} aria-hidden="true" />
            Import / Export
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => setPrintOpen(true)}
            disabled={printable === 0}
          >
            <Printer size={13} aria-hidden="true" />
            Print
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{entries.length} entries</span>
          <span aria-hidden="true">&middot;</span>
          <span>{printable} printable</span>
          {unavailableCount > 0 ? (
            <>
              <span aria-hidden="true">&middot;</span>
              <span className="text-amber-300">
                {unavailableCount} not in {language}
              </span>
            </>
          ) : null}
          {missingCount > 0 ? (
            <>
              <span aria-hidden="true">&middot;</span>
              <span className="text-red-300">{missingCount} missing</span>
            </>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor="load-target">Load saved deck</Label>
            <Select value={loadTarget} onValueChange={setLoadTarget}>
              <SelectTrigger
                id="load-target"
                aria-label="Saved deck to load"
                className="h-8 text-xs"
              >
                <SelectValue placeholder="Select a saved deck…" />
              </SelectTrigger>
              <SelectContent>
                {savedDecks.map((deck) => (
                  <SelectItem key={deck.id} value={deck.id}>
                    {deck.name} — {new Date(deck.updatedAt).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={!loadTarget}
              onClick={() => {
                if (dirty) setConfirmLoad(true);
                else void loadSaved(loadTarget);
              }}
            >
              Load
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="overwrite-target">Overwrite saved deck</Label>
            <Select value={overwriteTarget} onValueChange={setOverwriteTarget}>
              <SelectTrigger
                id="overwrite-target"
                aria-label="Saved deck to overwrite"
                className="h-8 text-xs"
              >
                <SelectValue placeholder="Select a saved deck…" />
              </SelectTrigger>
              <SelectContent>
                {savedDecks.map((deck) => (
                  <SelectItem key={deck.id} value={deck.id}>
                    {deck.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={!overwriteDeckInfo}
              onClick={() => {
                if (overwriteDeckInfo && activeDeck) {
                  void overwriteDeck(overwriteDeckInfo.id, overwriteDeckInfo.revision, nameDraft);
                }
              }}
            >
              Overwrite
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              disabled={!overwriteDeckInfo}
              onClick={() => setDeleteTarget(overwriteDeckInfo?.id ?? null)}
            >
              <Trash2 size={13} aria-hidden="true" />
              Delete saved deck
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              disabled={entries.length === 0}
              onClick={() => setConfirmClear(true)}
            >
              Clear
            </Button>
            {canUndo ? (
              <Button size="sm" variant="secondary" onClick={() => void undoDelete()}>
                Undo delete
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <ol className="min-h-0 flex-1 overflow-auto p-2" aria-label="Ordered deck entries">
        {entries.length === 0 ? (
          <li className="p-4 text-center text-sm text-muted-foreground">
            The active deck is empty. Add spells from the library.
          </li>
        ) : null}
        {resolvedEntries.map(({ entry, resolution }, index) => (
          <DeckRow
            key={entry.entryId}
            entry={entry}
            index={index}
            resolution={resolution}
            language={language}
            onAddCopy={() => void addCopyToDeck(entry.entryId)}
            onRemove={() => void removeFromDeck(entry.entryId)}
            onMoveUp={() => void moveDeckEntry(entry.entryId, -1)}
            onMoveDown={() => void moveDeckEntry(entry.entryId, 1)}
            onFitMode={(mode) => void setDeckEntryFitMode(entry.entryId, mode)}
            onRepair={() => {
              setRepairEntryId(entry.entryId);
              setRepairSpellId("");
            }}
            onSelect={() => {
              if (resolution.status === "resolved") selectSpell(resolution.spell.id);
            }}
            dragProps={{
              draggable: true,
              onDragStart: () => onDragStart(index),
              onDragOver: (event) => event.preventDefault(),
              onDrop: () => onDrop(index),
            }}
          />
        ))}
      </ol>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent
          title="Clear the active deck?"
          description="This removes all entries from the active deck. The deck name, saved association, and saved decks are kept."
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  void clearDeck();
                  setConfirmClear(false);
                }}
              >
                Clear deck
              </Button>
            </>
          }
        />
      </Dialog>

      <Dialog open={confirmLoad} onOpenChange={setConfirmLoad}>
        <DialogContent
          title="Replace the active deck?"
          description="The active deck has unsaved changes. Loading a saved deck replaces them. Saved decks are not changed."
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmLoad(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  void loadSaved(loadTarget);
                  setConfirmLoad(false);
                }}
              >
                Replace active deck
              </Button>
            </>
          }
        />
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent
          title="Delete saved deck?"
          description="This permanently deletes the saved snapshot. The active deck content is not changed unless it was associated with this snapshot."
          footer={
            <>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deleteTarget) void deleteSaved(deleteTarget);
                  setDeleteTarget(null);
                  setOverwriteTarget("");
                }}
              >
                Delete saved deck
              </Button>
            </>
          }
        />
      </Dialog>

      <Dialog
        open={repairEntryId !== null}
        onOpenChange={(open) => !open && setRepairEntryId(null)}
      >
        <DialogContent
          title="Repair missing reference"
          description="Rebind this entry to an existing spell. Only the active deck is changed; saved snapshots remain untouched."
          footer={
            <>
              <Button variant="outline" onClick={() => setRepairEntryId(null)}>
                Cancel
              </Button>
              <Button
                disabled={!repairTarget}
                onClick={() => {
                  if (repairEntryId && repairTarget) {
                    void repairDeckEntry(repairEntryId, {
                      spellId: repairTarget.id,
                      source: repairTarget.source,
                      name: repairTarget.name,
                    });
                  }
                  setRepairEntryId(null);
                }}
              >
                <Wrench size={13} aria-hidden="true" />
                Repair
              </Button>
            </>
          }
        >
          <NativeSelect
            id="repair-spell"
            name="repair-spell"
            aria-label="Replacement spell"
            value={repairSpellId}
            onChange={(event) => setRepairSpellId(event.target.value)}
          >
            <option value="">Choose a spell…</option>
            {librarySpells.map((spell) => (
              <option key={spell.id} value={spell.id}>
                {spell.name} ({spell.source === "Custom" ? "Custom" : "SRD"})
              </option>
            ))}
          </NativeSelect>
        </DialogContent>
      </Dialog>

      <PrintDialog open={printOpen} onOpenChange={setPrintOpen} />
      <ImportExportDialog open={ioOpen} onOpenChange={setIoOpen} />
    </section>
  );
}

interface DeckRowProps {
  entry: DeckEntry;
  index: number;
  resolution: EntryResolution;
  language: string;
  onAddCopy: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onFitMode: (mode: CardFitMode) => void;
  onRepair: () => void;
  onSelect: () => void;
  dragProps: {
    draggable: boolean;
    onDragStart: () => void;
    onDragOver: (event: DragEvent) => void;
    onDrop: () => void;
  };
}

function DeckRow({
  entry,
  index,
  resolution,
  language,
  onAddCopy,
  onRemove,
  onMoveUp,
  onMoveDown,
  onFitMode,
  onRepair,
  onSelect,
  dragProps,
}: DeckRowProps) {
  const name = resolution.status === "resolved" ? resolution.spell.name : resolution.referenceName;
  const nameContent = (
    <>
      <span className="block truncate text-sm text-foreground">{name}</span>
      {resolution.status === "translation-unavailable" ? (
        <span className="block text-xs text-amber-300">
          Not available in {language} — kept in deck, omitted from print
        </span>
      ) : resolution.status === "missing" ? (
        <span className="block text-xs text-red-300">
          Missing reference — repairable, excluded from print
        </span>
      ) : null}
    </>
  );
  return (
    <li
      className={cn(
        "mb-1 flex flex-wrap items-center gap-1 rounded border px-2 py-1.5",
        resolution.status === "resolved"
          ? "border-border bg-card"
          : "border-dashed border-amber-400/30 bg-amber-400/10",
      )}
      {...dragProps}
    >
      <GripVertical size={14} className="text-muted-foreground" aria-hidden="true" />
      <span className="w-5 text-right text-xs text-muted-foreground">{index + 1}</span>
      {resolution.status === "resolved" ? (
        <button
          type="button"
          className="min-w-[8rem] flex-1 rounded text-end hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`Show ${name} in details`}
          onClick={onSelect}
        >
          {nameContent}
        </button>
      ) : (
        <span className="min-w-[8rem] text-end flex-1">{nameContent}</span>
      )}
      <NativeSelect
        id={`fit-mode-${entry.entryId}`}
        name={`fit-mode-${entry.entryId}`}
        aria-label={`Fit mode for ${name}`}
        className="h-7 w-28 text-xs"
        value={entry.fitMode}
        onChange={(event) => onFitMode(event.target.value as CardFitMode)}
      >
        <option value="auto-shrink">Auto-shrink</option>
        <option value="multi-card">Multi-card</option>
      </NativeSelect>
      {resolution.status === "missing" ? (
        <Button variant="ghost" size="icon" aria-label="Repair entry" onClick={onRepair}>
          <Wrench size={14} aria-hidden="true" />
        </Button>
      ) : null}
      <Button variant="ghost" size="icon" aria-label={`Add copy of ${name}`} onClick={onAddCopy}>
        <Plus size={14} aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Move ${name} up`} onClick={onMoveUp}>
        <ArrowUp size={14} aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Move ${name} down`} onClick={onMoveDown}>
        <ArrowDown size={14} aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Remove ${name}`} onClick={onRemove}>
        <Trash2 size={14} aria-hidden="true" />
      </Button>
    </li>
  );
}
