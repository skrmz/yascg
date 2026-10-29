import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  FolderOpen,
  GripVertical,
  MoreHorizontal,
  Printer,
  Save,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/state/AppProvider.tsx";
import { resolveContentLanguage } from "@/content-language.ts";
import { isValidDeckName, normalizeDeckName, type DeckEntry } from "@/domain/deck";
import type { CardFitMode } from "@/domain/spells";
import type { EntryResolution } from "@/services/data/resolution.ts";
import { translateMessage } from "@/locales/messages.ts";
import { Button } from "@/ui/Button.tsx";
import { Input, Label, NativeSelect } from "@/ui/Field.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/DropdownMenu.tsx";
import { cn } from "@/ui/cn.ts";
import { PrintDialog } from "@/components/print/PrintDialog.tsx";
import { DeckImportExportDialog } from "@/components/import-export/DeckImportExportDialog.tsx";
import { OpenDeckDialog } from "./OpenDeckDialog.tsx";
import { SaveAsDialog } from "./SaveAsDialog.tsx";

interface FlushResult {
  ok: boolean;
  changed: boolean;
}

export function DeckPane() {
  const {
    activeDeck,
    dirty,
    deckStatus,
    deckBusy,
    resolvedEntries,
    language,
    renameActiveDeck,
    removeFromDeck,
    moveDeckEntry,
    reorderDeckEntries,
    setDeckEntryFitMode,
    clearDeck,
    repairDeckEntry,
    saveActiveDeck,
    newActiveDeck,
    canUndo,
    undoDelete,
    librarySpells,
    selectSpell,
  } = useApp();
  const { t } = useTranslation();

  const [nameDraft, setNameDraft] = useState(activeDeck?.name ?? "");
  const [editing, setEditing] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [saveConflictOpen, setSaveConflictOpen] = useState(false);
  const [confirmNewDeck, setConfirmNewDeck] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [repairEntryId, setRepairEntryId] = useState<string | null>(null);
  const [repairSpellId, setRepairSpellId] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [ioDirty, setIoDirty] = useState(false);

  const editingRef = useRef(false);
  const editSessionRef = useRef<{ revision: number; name: string } | null>(null);
  const skipBlurRef = useRef(false);
  const committingRef = useRef(false);
  const flushRef = useRef<Promise<FlushResult> | null>(null);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    if (!editing) setNameDraft(activeDeck?.name ?? "");
  }, [activeDeck?.name, editing]);

  // A revision change while editing means an Open/import/New/other-tab write
  // replaced the deck; never commit the draft over that newer content.
  useEffect(() => {
    if (!editing || committingRef.current) return;
    const session = editSessionRef.current;
    if (!session || !activeDeck) return;
    if (session.revision !== activeDeck.revision) {
      editingRef.current = false;
      setEditing(false);
      setNameDraft(activeDeck.name);
      setNameError(t("deck.nameStale"));
    }
  }, [activeDeck, editing, t]);

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

  const statusCopy = {
    saved: { label: t("deck.status.saved"), hint: t("deck.statusHint.saved") },
    unsaved: { label: t("deck.status.unsaved"), hint: t("deck.statusHint.unsaved") },
    "not-saved": { label: t("deck.status.notSaved"), hint: t("deck.statusHint.notSaved") },
    empty: { label: t("deck.status.empty"), hint: t("deck.statusHint.empty") },
    invalid: { label: t("deck.status.invalid"), hint: t("deck.statusHint.invalid") },
  }[deckStatus];
  const statusTone =
    deckStatus === "saved"
      ? "text-emerald-300"
      : deckStatus === "invalid"
        ? "text-red-300"
        : "text-amber-300";

  const draftChanged = !editing && normalizeDeckName(nameDraft) !== (activeDeck?.name ?? "");
  const effectiveDirty = dirty || draftChanged;

  const saveDisabled = !activeDeck || deckBusy || !dirty || deckStatus === "invalid";

  const startEdit = () => {
    if (editingRef.current || !activeDeck) return;
    editSessionRef.current = { revision: activeDeck.revision, name: activeDeck.name };
    editingRef.current = true;
    setNameDraft(activeDeck.name);
    setNameError(null);
    setActionError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    skipBlurRef.current = true;
    editingRef.current = false;
    setEditing(false);
    setNameDraft(activeDeck?.name ?? "");
    setNameError(null);
  };

  const flushNameCommit = useCallback(async (): Promise<FlushResult> => {
    if (flushRef.current) return flushRef.current;
    if (!editingRef.current) return { ok: true, changed: false };

    const run = async (): Promise<FlushResult> => {
      if (!activeDeck) {
        editingRef.current = false;
        setEditing(false);
        return { ok: false, changed: false };
      }
      const session = editSessionRef.current;
      if (session && session.revision !== activeDeck.revision) {
        editingRef.current = false;
        setEditing(false);
        setNameDraft(activeDeck.name);
        setNameError(t("deck.nameStale"));
        return { ok: false, changed: false };
      }
      const associated = activeDeck.savedDeckId !== undefined;
      if (!isValidDeckName(nameDraft, { associated })) {
        editingRef.current = false;
        setEditing(false);
        setNameDraft(activeDeck.name);
        setNameError(t("deck.nameInvalid"));
        return { ok: false, changed: false };
      }
      const normalized = normalizeDeckName(nameDraft);
      if (normalized === activeDeck.name) {
        editingRef.current = false;
        setEditing(false);
        setNameDraft(activeDeck.name);
        setNameError(null);
        return { ok: true, changed: false };
      }
      committingRef.current = true;
      try {
        const outcome = await renameActiveDeck(nameDraft);
        editingRef.current = false;
        setEditing(false);
        if (outcome.status === "ok" || outcome.status === "unchanged") {
          setNameDraft(normalized);
          setNameError(null);
          return { ok: true, changed: outcome.status === "ok" };
        }
        setNameDraft(activeDeck.name);
        if (outcome.status === "stale") {
          setNameError(t("deck.nameStale"));
        } else if (outcome.status === "invalid") {
          setNameError(translateMessage(t, outcome.message));
        } else {
          setNameError(t("error.generic"));
        }
        return { ok: false, changed: false };
      } finally {
        committingRef.current = false;
      }
    };

    const promise = run();
    flushRef.current = promise;
    try {
      return await promise;
    } finally {
      flushRef.current = null;
    }
  }, [activeDeck, nameDraft, renameActiveDeck, t]);

  const onNameBlur = () => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    if (editingRef.current) void flushNameCommit();
  };

  const onSave = async () => {
    setActionError(null);
    const flushed = await flushNameCommit();
    if (!flushed.ok) return;
    const outcome = await saveActiveDeck();
    if (outcome.status === "saved") {
      toast.success(t("deck.saveSuccess"));
      return;
    }
    if (outcome.status === "needs-save-as") {
      setSaveAsOpen(true);
      return;
    }
    if (outcome.status === "conflict") {
      setSaveConflictOpen(true);
      return;
    }
    if (outcome.status === "invalid" || outcome.status === "error") {
      setActionError(translateMessage(t, outcome.message));
    }
  };

  const requestSaveAs = async () => {
    setActionError(null);
    const flushed = await flushNameCommit();
    if (!flushed.ok) return;
    setSaveAsOpen(true);
  };

  const requestOpen = async () => {
    setActionError(null);
    const flushed = await flushNameCommit();
    if (!flushed.ok) return;
    setOpenDialogOpen(true);
  };

  const requestImportExport = async () => {
    setActionError(null);
    const flushed = await flushNameCommit();
    if (!flushed.ok) return;
    setIoDirty(dirty || flushed.changed);
    setIoOpen(true);
  };

  const runNewDeck = async () => {
    setConfirmNewDeck(false);
    const outcome = await newActiveDeck();
    if (outcome.status === "invalid" || outcome.status === "error") {
      setActionError(translateMessage(t, outcome.message));
    }
  };

  const requestNewDeck = async () => {
    setActionError(null);
    const flushed = await flushNameCommit();
    if (!flushed.ok) return;
    if (dirty || flushed.changed) {
      setConfirmNewDeck(true);
      return;
    }
    await runNewDeck();
  };

  const requestClear = async () => {
    setActionError(null);
    const flushed = await flushNameCommit();
    if (!flushed.ok) return;
    setConfirmClear(true);
  };

  const onDragStart = (index: number) => setDragIndex(index);
  const onDrop = (index: number) => {
    if (dragIndex !== null && dragIndex !== index) {
      void reorderDeckEntries(dragIndex, index);
    }
    setDragIndex(null);
  };

  const repairTarget = librarySpells.find((spell) => spell.id === repairSpellId);

  return (
    <section id="deck-panel" className="flex h-full min-h-0 flex-col" aria-label={t("deck.title")}>
      <div id="deck-controls" className="space-y-2 border-b border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("deck.title")}</h2>
          <span className="text-xs text-muted-foreground">
            {t("deck.entries", { count: entries.length })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="deck-name" className="sr-only">
            {t("deck.nameLabel")}
          </Label>
          <Input
            id="deck-name"
            value={nameDraft}
            placeholder={t("deck.namePlaceholder")}
            className="min-w-0 flex-1"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "deck-name-error" : undefined}
            onFocus={startEdit}
            onChange={(event) => {
              setNameDraft(event.target.value);
              if (nameError) setNameError(null);
              if (actionError) setActionError(null);
            }}
            onBlur={onNameBlur}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void flushNameCommit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancelEdit();
              }
            }}
          />
          <span
            className={cn("shrink-0 text-xs font-semibold", statusTone)}
            title={statusCopy.hint}
          >
            {statusCopy.label}
          </span>
        </div>

        {nameError ? (
          <p id="deck-name-error" role="alert" className="text-xs text-red-300">
            {nameError}
          </p>
        ) : null}
        {actionError ? (
          <p role="alert" className="text-xs text-red-300">
            {actionError}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{statusCopy.hint}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          <div
            className="inline-flex"
            onPointerDownCapture={() => {
              if (editingRef.current) void flushNameCommit();
            }}
          >
            <Button
              size="sm"
              onClick={() => void onSave()}
              disabled={saveDisabled}
              title={t("deck.persistenceHint")}
            >
              <Save size={13} aria-hidden="true" />
              {t("deck.save")}
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPrintOpen(true)}
            disabled={printable === 0}
          >
            <Printer size={13} aria-hidden="true" />
            {t("deck.print")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void requestOpen()}>
            <FolderOpen size={13} aria-hidden="true" />
            {t("deck.open")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label={t("deck.actions")}>
                <MoreHorizontal size={16} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => void requestSaveAs()}>
                {t("deck.saveAs")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void requestNewDeck()}>
                {t("deck.newDeck")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void requestImportExport()}>
                {t("deck.importExport")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-300"
                disabled={entries.length === 0}
                onSelect={() => void requestClear()}
              >
                <Trash2 size={14} aria-hidden="true" />
                {t("deck.clearEntries")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canUndo ? (
            <Button size="sm" variant="secondary" onClick={() => void undoDelete()}>
              {t("deck.undoDelete")}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {printable !== entries.length ? (
            <span>{t("deck.printable", { count: printable })}</span>
          ) : null}
          {unavailableCount > 0 ? (
            <span className="text-amber-300">
              {t("deck.notInLanguage", { count: unavailableCount, language })}
            </span>
          ) : null}
          {missingCount > 0 ? (
            <span className="text-red-300">{t("deck.missing", { count: missingCount })}</span>
          ) : null}
        </div>
      </div>

      <div id="deck-entries-container" className="mt-2 flex min-h-0 flex-1 flex-col">
        <h2
          id="deck-entries-heading"
          className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t("deck.heading")}
        </h2>
        <ol
          id="deck-entries"
          className="min-h-0 flex-1 overflow-auto p-2"
          aria-labelledby="deck-entries-heading"
        >
          {entries.length === 0 ? (
            <li className="p-4 text-center text-sm text-muted-foreground">{t("deck.empty")}</li>
          ) : null}
          {resolvedEntries.map(({ entry, resolution }, index) => {
            const contentLanguage =
              resolution.status === "resolved"
                ? resolveContentLanguage(resolution.spell, language)
                : undefined;
            return (
              <DeckRow
                key={entry.entryId}
                entry={entry}
                index={index}
                resolution={resolution}
                language={language}
                contentLanguage={contentLanguage}
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
            );
          })}
        </ol>
      </div>

      <SaveAsDialog
        open={saveAsOpen}
        onOpenChange={setSaveAsOpen}
        defaultName={nameDraft}
        onSaved={() => toast.success(t("deck.saveSuccess"))}
      />
      <OpenDeckDialog
        open={openDialogOpen}
        onOpenChange={setOpenDialogOpen}
        dirty={effectiveDirty}
      />
      <DeckImportExportDialog open={ioOpen} onOpenChange={setIoOpen} dirty={ioDirty || dirty} />

      <Dialog open={saveConflictOpen} onOpenChange={setSaveConflictOpen}>
        <DialogContent
          title={t("deck.saveConflictTitle")}
          description={t("deck.saveConflictDescription")}
          footer={
            <>
              <Button variant="outline" onClick={() => setSaveConflictOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSaveConflictOpen(false);
                  setOpenDialogOpen(true);
                }}
              >
                {t("deck.open")}
              </Button>
              <Button
                onClick={() => {
                  setSaveConflictOpen(false);
                  setSaveAsOpen(true);
                }}
              >
                {t("deck.saveAs")}
              </Button>
            </>
          }
        />
      </Dialog>

      <Dialog open={confirmNewDeck} onOpenChange={setConfirmNewDeck}>
        <DialogContent
          title={t("deck.newDeckTitle")}
          description={t("deck.newDeckDescription")}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmNewDeck(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={() => void runNewDeck()}>
                {t("deck.newDeckConfirm")}
              </Button>
            </>
          }
        />
      </Dialog>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent
          title={t("deck.clearTitle")}
          description={t("deck.clearDescription")}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmClear(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  void clearDeck();
                  setConfirmClear(false);
                }}
              >
                {t("deck.clearConfirm")}
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
          title={t("deck.repairTitle")}
          description={t("deck.repairDescription")}
          footer={
            <>
              <Button variant="outline" onClick={() => setRepairEntryId(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={!repairTarget}
                onClick={() => {
                  if (repairEntryId && repairTarget) {
                    void repairDeckEntry(repairEntryId, {
                      spellId: repairTarget.id,
                      source: repairTarget.source,
                      name: repairTarget.name,
                    }).then((result) => {
                      if (result === "duplicate") {
                        toast.info(t("library.toast.alreadyTitle"), {
                          description: t("library.toast.alreadyDescription", {
                            name: repairTarget.name,
                          }),
                        });
                      }
                    });
                  }
                  setRepairEntryId(null);
                }}
              >
                <Wrench size={13} aria-hidden="true" />
                {t("deck.repairConfirm")}
              </Button>
            </>
          }
        >
          <NativeSelect
            id="repair-spell"
            name="repair-spell"
            aria-label={t("deck.replacementSpell")}
            value={repairSpellId}
            onChange={(event) => setRepairSpellId(event.target.value)}
          >
            <option value="">{t("deck.chooseSpell")}</option>
            {librarySpells.map((spell) => (
              <option key={spell.id} value={spell.id}>
                {spell.name} (
                {spell.source === "Custom" ? t("source.custom") : t("source.srdShort")})
              </option>
            ))}
          </NativeSelect>
        </DialogContent>
      </Dialog>

      <PrintDialog open={printOpen} onOpenChange={setPrintOpen} />
    </section>
  );
}

interface DeckRowProps {
  entry: DeckEntry;
  index: number;
  resolution: EntryResolution;
  language: string;
  contentLanguage?: string;
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
  contentLanguage,
  onRemove,
  onMoveUp,
  onMoveDown,
  onFitMode,
  onRepair,
  onSelect,
  dragProps,
}: DeckRowProps) {
  const { t } = useTranslation();
  const name = resolution.status === "resolved" ? resolution.spell.name : resolution.referenceName;
  const nameContent = (
    <>
      <span lang={contentLanguage} className="block truncate text-sm text-foreground">
        {name}
      </span>
      {resolution.status === "translation-unavailable" ? (
        <span className="block text-xs text-amber-300">{t("deck.notAvailable", { language })}</span>
      ) : resolution.status === "missing" ? (
        <span className="block text-xs text-red-300">{t("deck.missingReference")}</span>
      ) : null}
    </>
  );
  return (
    <li
      className={cn(
        "mb-1 flex flex-wrap supports-[flex-wrap:balance]:[flex-wrap:balance] items-center gap-1 rounded border px-2 py-1.5",
        resolution.status === "resolved"
          ? "border-border bg-card"
          : "border-dashed border-amber-400/30 bg-amber-400/10",
      )}
      {...dragProps}
    >
      <GripVertical size={14} className="text-muted-foreground" aria-hidden="true" />
      <span className="w-5 text-start text-xs text-muted-foreground">{index + 1}</span>
      {resolution.status === "resolved" ? (
        <button
          type="button"
          className="min-w-[8rem] flex-1 rounded text-start hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={t("deck.showAria", { name })}
          onClick={onSelect}
        >
          {nameContent}
        </button>
      ) : (
        <span className="min-w-[8rem] flex-1 text-start">{nameContent}</span>
      )}
      <NativeSelect
        id={`fit-mode-${entry.entryId}`}
        name={`fit-mode-${entry.entryId}`}
        aria-label={t("deck.fitModeAria", { name })}
        className="h-7 w-32 text-xs"
        value={entry.fitMode}
        onChange={(event) => onFitMode(event.target.value as CardFitMode)}
      >
        <option value="auto-shrink">{t("deck.autoShrink")}</option>
        <option value="multi-card">{t("deck.multiCard")}</option>
      </NativeSelect>
      {resolution.status === "missing" ? (
        <Button variant="ghost" size="icon" aria-label={t("deck.repairAria")} onClick={onRepair}>
          <Wrench size={14} aria-hidden="true" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("deck.moveUpAria", { name })}
        onClick={onMoveUp}
      >
        <ArrowUp size={14} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("deck.moveDownAria", { name })}
        onClick={onMoveDown}
      >
        <ArrowDown size={14} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("deck.removeAria", { name })}
        onClick={onRemove}
      >
        <Trash2 size={14} aria-hidden="true" />
      </Button>
    </li>
  );
}
