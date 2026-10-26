import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Printer,
  Save,
  Trash2,
  Upload,
  Download,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/state/AppProvider.tsx";
import { resolveContentLanguage } from "@/content-language.ts";
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
  const { t, i18n } = useTranslation();

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
    <section id="deck-panel" className="flex h-full min-h-0 flex-col" aria-label={t("deck.title")}>
      <div id="deck-controls" className="space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="deck-name" className="sr-only">
            {t("deck.nameLabel")}
          </Label>
          <Input
            id="deck-name"
            value={nameDraft}
            placeholder={t("deck.namePlaceholder")}
            onChange={(event) => setNameDraft(event.target.value)}
            className="flex-1"
          />
          {dirty ? (
            <span
              className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[0.7rem] font-semibold text-amber-300"
              title={t("deck.unsavedTitle")}
            >
              {t("deck.unsaved")}
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
            {t("deck.saveAsNew")}
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
            {t("deck.rename")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIoOpen(true)}>
            <Upload size={13} aria-hidden="true" />
            <Download size={13} aria-hidden="true" />
            {t("deck.importExport")}
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => setPrintOpen(true)}
            disabled={printable === 0}
          >
            <Printer size={13} aria-hidden="true" />
            {t("deck.print")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t("deck.entries", { count: entries.length })}</span>
          <span aria-hidden="true">&middot;</span>
          <span>{t("deck.printable", { count: printable })}</span>
          {unavailableCount > 0 ? (
            <>
              <span aria-hidden="true">&middot;</span>
              <span className="text-amber-300">
                {t("deck.notInLanguage", { count: unavailableCount, language })}
              </span>
            </>
          ) : null}
          {missingCount > 0 ? (
            <>
              <span aria-hidden="true">&middot;</span>
              <span className="text-red-300">{t("deck.missing", { count: missingCount })}</span>
            </>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor="load-target">{t("deck.loadSaved")}</Label>
            <Select value={loadTarget} onValueChange={setLoadTarget}>
              <SelectTrigger
                id="load-target"
                aria-label={t("deck.savedDeckToLoad")}
                className="h-8 text-xs"
              >
                <SelectValue placeholder={t("deck.selectSaved")} />
              </SelectTrigger>
              <SelectContent>
                {savedDecks.map((deck) => (
                  <SelectItem key={deck.id} value={deck.id}>
                    {deck.name} — {new Date(deck.updatedAt).toLocaleString(i18n.resolvedLanguage)}
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
              {t("deck.load")}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="overwrite-target">{t("deck.overwriteSaved")}</Label>
            <Select value={overwriteTarget} onValueChange={setOverwriteTarget}>
              <SelectTrigger
                id="overwrite-target"
                aria-label={t("deck.savedDeckToOverwrite")}
                className="h-8 text-xs"
              >
                <SelectValue placeholder={t("deck.selectSaved")} />
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
              {t("deck.overwrite")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              disabled={!overwriteDeckInfo}
              onClick={() => setDeleteTarget(overwriteDeckInfo?.id ?? null)}
            >
              <Trash2 size={13} aria-hidden="true" />
              {t("deck.deleteSavedDeck")}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              disabled={entries.length === 0}
              onClick={() => setConfirmClear(true)}
            >
              {t("common.clear")}
            </Button>
            {canUndo ? (
              <Button size="sm" variant="secondary" onClick={() => void undoDelete()}>
                {t("deck.undoDelete")}
              </Button>
            ) : null}
          </div>
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

      <Dialog open={confirmLoad} onOpenChange={setConfirmLoad}>
        <DialogContent
          title={t("deck.loadTitle")}
          description={t("deck.loadDescription")}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmLoad(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  void loadSaved(loadTarget);
                  setConfirmLoad(false);
                }}
              >
                {t("deck.loadConfirm")}
              </Button>
            </>
          }
        />
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent
          title={t("deck.deleteTitle")}
          description={t("deck.deleteDescription")}
          footer={
            <>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deleteTarget) void deleteSaved(deleteTarget);
                  setDeleteTarget(null);
                  setOverwriteTarget("");
                }}
              >
                {t("deck.deleteConfirm")}
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
      <ImportExportDialog open={ioOpen} onOpenChange={setIoOpen} />
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
        "mb-1 flex flex-wrap items-center gap-1 rounded border px-2 py-1.5",
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
