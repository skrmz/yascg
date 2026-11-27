import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Accessibility,
  AutoScroller,
  Feedback,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import { scrollIntoViewIfNeeded } from "@dnd-kit/dom/utilities";
import { DragDropProvider, type DragDropManager, type DragEndEvent } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { ShowDetailsContext, type DeckPresentation } from "../workspace-layout.ts";
import { DeckTable } from "./table/DeckTable.tsx";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/state/AppProvider.tsx";
import { resolveContentLanguage } from "@/content-language.ts";
import { isValidDeckName, normalizeDeckName, type DeckEntry } from "@/domain/deck";
import type { CardFitMode } from "@/domain/spells";
import type { EntryResolution } from "@/services/data/resolution.ts";
import { translateMessage } from "@/locales/messages.ts";
import { Button } from "@/ui/Button.tsx";
import { Checkbox } from "@/ui/Checkbox.tsx";
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

const deckSensors = [
  PointerSensor.configure({
    activationConstraints: (event) => [
      event.pointerType === "touch"
        ? new PointerActivationConstraints.Delay({ value: 200, tolerance: 8 })
        : new PointerActivationConstraints.Distance({ value: 5 }),
    ],
  }),
  KeyboardSensor.configure({
    keyboardCodes: {
      ...KeyboardSensor.defaults.keyboardCodes,
      end: ["Space", "Enter"],
      left: [],
      right: [],
    },
  }),
];

const deckPlugins = [
  AutoScroller.configure({ threshold: { x: 0, y: 0.15 } }),
  Feedback.configure({ dropAnimation: null }),
];

function releasedRowIndex(event: PointerEvent, list: HTMLOListElement | null) {
  const row = list?.ownerDocument
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>("[data-deck-index]");
  return row && row.parentElement === list ? Number(row.dataset.deckIndex) : undefined;
}

function isInsideDeckScroller(list: HTMLOListElement, { x, y }: { x: number; y: number }) {
  const scroller =
    getComputedStyle(list).overflowY === "visible" ? list.closest("#deck-panel") : list;
  const rect = scroller?.getBoundingClientRect();
  return rect && x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

export function DeckPane({
  presentation = "list",
  presentationSwitch,
  onOpenAppearance,
  active = true,
}: {
  presentation?: DeckPresentation;
  presentationSwitch?: ReactNode;
  onOpenAppearance?: () => void;
  active?: boolean;
}) {
  const showDetails = useContext(ShowDetailsContext);
  const listActive = active && presentation === "list";
  const [renameOpen, setRenameOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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
    removeDeckEntries,
    collectionGeneration,
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
  const [dragAnnouncement, setDragAnnouncement] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [ioDirty, setIoDirty] = useState(false);
  const editingRef = useRef(false);
  const editSessionRef = useRef<{ revision: number; name: string } | null>(null);
  const skipBlurRef = useRef(false);
  const committingRef = useRef(false);
  const flushRef = useRef<Promise<FlushResult> | null>(null);
  const deckListRef = useRef<HTMLOListElement>(null);
  const dragManagerRef = useRef<DragDropManager | null>(null);
  const listActiveRef = useRef(listActive);
  listActiveRef.current = listActive;
  const dragSessionRef = useRef<{
    revision: number;
    generation: string;
    position: number;
  } | null>(null);

  useEffect(() => {
    const session = dragSessionRef.current;
    if (
      session &&
      (!listActive ||
        session.revision !== activeDeck?.revision ||
        session.generation !== collectionGeneration)
    ) {
      dragSessionRef.current = null;
      dragManagerRef.current?.actions.stop({ canceled: true });
    }
    if (!listActive) setRepairEntryId(null);
  }, [listActive, activeDeck?.revision, collectionGeneration]);

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

  const onNameBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    if (
      event.relatedTarget instanceof Element &&
      event.relatedTarget.closest("[data-collection-menu]")
    ) {
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

  const onDeckDragEnd = (
    { operation, nativeEvent, canceled }: DragEndEvent,
    manager: DragDropManager,
  ) => {
    const session = dragSessionRef.current;
    dragSessionRef.current = null;
    const { source, activatorEvent } = operation;
    if (!isSortable(source)) return;

    const keyboard = activatorEvent instanceof KeyboardEvent;
    const fromIndex = source.initialIndex;
    const toIndex = keyboard
      ? nativeEvent instanceof KeyboardEvent
        ? session?.position
        : undefined
      : nativeEvent instanceof PointerEvent && nativeEvent.type === "pointerup"
        ? releasedRowIndex(nativeEvent, deckListRef.current)
        : undefined;
    const valid =
      listActiveRef.current &&
      !canceled &&
      session?.revision === activeDeck?.revision &&
      session?.generation === collectionGeneration &&
      entries[fromIndex]?.entryId === source.id &&
      toIndex !== undefined &&
      Boolean(entries[toIndex]);

    if (keyboard) {
      setDragAnnouncement(
        valid
          ? t("deck.dragDropped", { name: source.data.name, position: toIndex + 1 })
          : t("deck.dragCanceled", { name: source.data.name }),
      );
      // The feedback element moves back into the list when dnd-kit finishes the drop.
      void manager.renderer.rendering.then(() => {
        requestAnimationFrame(() => {
          const grip = source.handle;
          if (!(grip instanceof HTMLButtonElement) || !grip.isConnected || !listActiveRef.current)
            return;
          grip.focus({ preventScroll: true });
          if (!valid || fromIndex === toIndex) scrollIntoViewIfNeeded(grip);
        });
      });
    }
    if (valid && fromIndex !== toIndex) void reorderDeckEntries(fromIndex, toIndex);
  };

  const repairTarget = librarySpells.find((spell) => spell.id === repairSpellId);

  return (
    <section
      id="deck-panel"
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
      aria-label={t("deck.title")}
    >
      <header id="deck-controls" className="space-y-2 border-b border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
            <h2
              aria-label={activeDeck?.name || t("deck.title")}
              className="min-w-0 text-sm font-semibold text-foreground [overflow-wrap:anywhere]"
            >
              <button
                type="button"
                className="min-w-0 rounded text-start underline decoration-muted-foreground underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={t("deck.rename", { name: activeDeck?.name || t("deck.title") })}
                aria-expanded={renameOpen}
                aria-controls="deck-name-settings"
                disabled={!activeDeck}
                onClick={() => setRenameOpen((open) => !open)}
              >
                {activeDeck?.name || t("deck.title")}
              </button>
            </h2>
            <span className="text-xs text-muted-foreground">
              {t("deck.entries", { count: entries.length })}
            </span>
            <button
              type="button"
              className={cn(
                "rounded text-left text-xs font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring",
                statusTone,
              )}
              aria-label={t("deck.statusHelp", { status: statusCopy.label })}
              aria-expanded={helpOpen}
              aria-controls="deck-persistence-hint"
              onClick={() => setHelpOpen((open) => !open)}
            >
              {statusCopy.label}
            </button>
          </div>
          {presentationSwitch}
        </div>
        <div id="deck-name-settings" hidden={!renameOpen}>
          <Label htmlFor="deck-name" className="sr-only">
            {t("deck.nameLabel")}
          </Label>
          <Input
            id="deck-name"
            value={nameDraft}
            placeholder={t("deck.namePlaceholder")}
            className="min-w-0"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "deck-name-error" : undefined}
            onFocus={startEdit}
            onBlur={onNameBlur}
            onChange={(event) => {
              setNameDraft(event.target.value);
              if (nameError) setNameError(null);
              if (actionError) setActionError(null);
            }}
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
        </div>
        <p id="deck-persistence-hint" hidden={!helpOpen} className="text-xs text-muted-foreground">
          {statusCopy.hint}
        </p>
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
        <div id="deck-actions" className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <div
              className="inline-flex"
              onPointerDownCapture={() => {
                if (editingRef.current) void flushNameCommit();
              }}
            >
              <Button
                size="sm"
                onClick={() =>
                  void (activeDeck?.savedDeckId === undefined ? requestSaveAs() : onSave())
                }
                disabled={saveDisabled}
                title={t("deck.persistenceHint")}
              >
                {t(activeDeck?.savedDeckId === undefined ? "deck.saveAs" : "deck.save")}
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPrintOpen(true)}
              disabled={printable === 0}
              aria-label={t("deck.print")}
            >
              {t("deck.print")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void requestOpen()}>
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
                {onOpenAppearance && (
                  <DropdownMenuItem onSelect={onOpenAppearance}>
                    {t("card.appearance")}
                  </DropdownMenuItem>
                )}
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

          {printable !== entries.length && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{t("deck.printable", { count: printable })}</span>
              {unavailableCount > 0 ? (
                <span className="text-amber-300">
                  {t("deck.notInLanguage", { count: unavailableCount, language })}
                </span>
              ) : null}
              {missingCount > 0 ? (
                <span className="text-red-300">{t("deck.missing", { count: missingCount })}</span>
              ) : null}
            </div>
          )}
        </div>
      </header>
      <div
        id="deck-entries-container"
        hidden={!listActive}
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col bg-card",
          !listActive && "hidden",
        )}
      >
        <h2 id="deck-entries-heading" className="sr-only">
          {t("deck.heading")}
        </h2>
        <DragDropProvider
          sensors={deckSensors}
          plugins={(defaults) => [
            ...defaults.filter(
              (plugin) =>
                plugin !== Accessibility && plugin !== AutoScroller && plugin !== Feedback,
            ),
            ...deckPlugins,
          ]}
          onBeforeDragStart={(event) => {
            const { source } = event.operation;
            if (!listActiveRef.current || !activeDeck || deckBusy || !isSortable(source)) {
              event.preventDefault();
              return;
            }
            dragSessionRef.current = {
              revision: activeDeck.revision,
              generation: collectionGeneration,
              position: source.index,
            };
          }}
          onDragStart={({ operation }, manager) => {
            dragManagerRef.current = manager;
            if (operation.activatorEvent instanceof KeyboardEvent && isSortable(operation.source)) {
              setDragAnnouncement(
                t("deck.dragPickedUp", {
                  name: operation.source.data.name,
                  position: operation.source.initialIndex + 1,
                  count: entries.length,
                }),
              );
            } else {
              manager.registry.plugins.get(AutoScroller)?.enable();
            }
          }}
          onCollision={(event, manager) => {
            if (manager.dragOperation.activatorEvent instanceof KeyboardEvent) {
              event.preventDefault();
            }
          }}
          onDragMove={(event, manager) => {
            const { to, by, nativeEvent, operation } = event;
            if (nativeEvent instanceof KeyboardEvent) {
              event.preventDefault();
              const session = dragSessionRef.current;
              const { source, shape } = operation;
              if (!session || !by?.y || !shape || !isSortable(source)) return;

              // Advance by deck index so fully clipped rows are reachable by keyboard.
              const position = session.position + Math.sign(by.y);
              const entry = entries[position];
              if (!entry) return;
              const row = manager.registry.droppables.get(entry.entryId)?.element;
              if (!row) return;

              session.position = position;
              void manager.actions.setDropTarget(entry.entryId);
              scrollIntoViewIfNeeded(row);
              const rect = row.getBoundingClientRect();
              manager.actions.move({
                by: { x: 0, y: rect.top + rect.height / 2 - shape.current.center.y },
                propagate: false,
              });
              setDragAnnouncement(
                t("deck.dragPosition", {
                  name: source.data.name,
                  position: position + 1,
                  count: entries.length,
                }),
              );
              return;
            }

            const list = deckListRef.current;
            if (!list || !to || !(nativeEvent instanceof PointerEvent)) return;
            // The plugin can retain a scroller after the pointer leaves it.
            const scroller = manager.registry.plugins.get(AutoScroller);
            if (isInsideDeckScroller(list, to)) scroller?.enable();
            else scroller?.disable();
          }}
          onDragEnd={onDeckDragEnd}
        >
          <p id="deck-drag-instructions" className="sr-only">
            {t("deck.dragInstructions")}
          </p>
          <p role="status" className="sr-only">
            {dragAnnouncement}
          </p>
          <ol
            ref={deckListRef}
            id="deck-entries"
            className="@container/deck-entries min-h-0 flex-1 overflow-auto p-2"
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
                    if (resolution.status === "resolved") {
                      showDetails({ spellId: resolution.spell.id, source: "deck" });
                    }
                  }}
                />
              );
            })}
          </ol>
        </DragDropProvider>
      </div>

      <div
        id="deck-table-container"
        hidden={presentation !== "table"}
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card",
          presentation !== "table" && "hidden",
        )}
      >
        <DeckTable
          active={active && presentation === "table"}
          deckInstance={activeDeck?.instanceId ?? ""}
          removeEntries={removeDeckEntries}
        />
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

      <PrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        onOpenAppearance={onOpenAppearance}
      />
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
}: DeckRowProps) {
  const { t } = useTranslation();
  const name = resolution.status === "resolved" ? resolution.spell.name : resolution.referenceName;
  const { ref, handleRef, isDragging, isDropTarget } = useSortable({
    id: entry.entryId,
    index,
    data: { name },
    // Use a drop-target highlight while keeping the list in React's committed order.
    plugins: [],
  });
  const nameContent = (
    <>
      <span
        lang={contentLanguage}
        className="block text-sm text-foreground [overflow-wrap:anywhere]"
      >
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
      ref={ref}
      data-deck-index={index}
      className={cn(
        "mb-1 grid grid-cols-[minmax(0,1fr)] items-center gap-1 rounded border px-2 py-1.5 @min-[36rem]/deck-entries:grid-cols-[minmax(0,1fr)_auto] @min-[36rem]/deck-entries:gap-2 @min-[36rem]/deck-entries:py-2",
        resolution.status === "resolved"
          ? "border-border bg-card"
          : "border-dashed border-amber-400/30 bg-amber-400/10",
        isDropTarget && !isDragging && "outline-2 -outline-offset-2 outline-ring",
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        <Button
          ref={handleRef}
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 touch-none cursor-grab text-muted-foreground select-none active:cursor-grabbing"
          aria-label={t("deck.reorderAria", { name })}
          aria-describedby="deck-drag-instructions"
          aria-pressed={isDragging}
        >
          <GripVertical size={14} aria-hidden="true" />
        </Button>
        <span className="w-5 shrink-0 text-start text-xs text-muted-foreground">{index + 1}</span>
        {resolution.status === "resolved" ? (
          <button
            type="button"
            className="min-w-0 flex-1 rounded text-start hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={t("deck.showAria", { name })}
            onClick={onSelect}
          >
            {nameContent}
          </button>
        ) : (
          <span className="min-w-0 flex-1 text-start">{nameContent}</span>
        )}
        {resolution.status === "missing" ? (
          <Button variant="ghost" size="icon" aria-label={t("deck.repairAria")} onClick={onRepair}>
            <Wrench size={14} aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-1 @min-[24rem]/deck-entries:ps-[calc(max(1.5rem,var(--touch-target,0px))+1.75rem)] @min-[36rem]/deck-entries:gap-2 @min-[36rem]/deck-entries:ps-0">
        <Checkbox
          id={`one-card-${entry.entryId}`}
          label={<span className="text-xs">{t("deck.oneCard")}</span>}
          aria-label={t("deck.oneCardAria", { name })}
          checked={entry.fitMode === "auto-shrink"}
          onChange={(event) => onFitMode(event.target.checked ? "auto-shrink" : "auto")}
        />
        <div className="flex shrink-0 items-center @min-[36rem]/deck-entries:gap-1">
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
        </div>
      </div>
    </li>
  );
}
