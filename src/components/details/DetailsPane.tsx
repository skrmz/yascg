import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Ellipsis, Info, Plus, SquarePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/state/AppProvider.tsx";
import { resolveContentLanguage } from "@/content-language.ts";
import { CardView } from "@/cards/Card.tsx";
import { useCardFit, AUTO_SHRINK_MIN_PT } from "@/cards/fit.tsx";
import { LIMITS, type Spell } from "@/domain/spells";
import type { DeckIdentity } from "@/db/active-deck.ts";
import { createCustomSpellCopy } from "@/db/custom-spells.ts";
import { message, translateMessage, type MessageDescriptor } from "@/locales/messages.ts";
import { Button } from "@/ui/Button.tsx";
import { SourceBadge } from "@/ui/Badge.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/ui/ContextMenu.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/DropdownMenu.tsx";
import { CustomSpellForm } from "./CustomSpellForm.tsx";
import { SpellDetailsDialog } from "./SpellDetailsDialog.tsx";

interface CopyDraftFlow {
  draft: Spell;
  sourceSpellId: string;
  entryId: string;
  expectedRevision: number;
  deckIdentity: DeckIdentity;
}

interface CopyConfirmationFlow {
  copy: Spell;
  sourceSpellId: string;
  entryId: string;
  expectedRevision: number;
  deckIdentity: DeckIdentity;
  error: MessageDescriptor | null;
  retryable: boolean;
}

export function DetailsPane() {
  const {
    selectedSpell,
    activeDeck,
    language,
    cardDesign,
    addSpellToDeck,
    duplicateSpell,
    deleteSpell,
    selectSpell,
    replaceDeckEntryWithCopy,
    canUndo,
    undoDelete,
  } = useApp();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailsSpellId, setDetailsSpellId] = useState<string | null>(null);
  const [copyDraft, setCopyDraft] = useState<CopyDraftFlow | null>(null);
  const [copyConfirmation, setCopyConfirmation] = useState<CopyConfirmationFlow | null>(null);
  const [replacing, setReplacing] = useState(false);
  const copyDraftRef = useRef<CopyDraftFlow | null>(null);
  const replacingRef = useRef(false);

  const deckEntry = activeDeck?.entries.find((entry) => entry.spellId === selectedSpell?.id);
  const fitMode = deckEntry?.fitMode ?? "auto-shrink";

  const fit = useCardFit({
    spell: selectedSpell,
    fitMode,
    language,
    design: cardDesign,
  });

  useEffect(() => {
    setDetailsSpellId(null);
  }, [selectedSpell?.id]);

  // Keep the captured flow available to `onSaved`, which runs after the form
  // closes, but discard it once neither the editor nor the confirmation is open.
  useEffect(() => {
    if (copyDraft === null && copyConfirmation === null) copyDraftRef.current = null;
  }, [copyDraft, copyConfirmation]);

  const closeCopyConfirmation = () => {
    if (!copyConfirmation) return;
    selectSpell(copyConfirmation.copy.id);
    toast.info(t("details.copySavedDeckUnchanged"));
    setCopyConfirmation(null);
  };

  const attemptReplace = async () => {
    const confirmation = copyConfirmation;
    if (!confirmation || replacingRef.current) return;
    replacingRef.current = true;
    setReplacing(true);
    setCopyConfirmation((previous) => (previous ? { ...previous, error: null } : previous));
    try {
      const result = await replaceDeckEntryWithCopy(
        confirmation.expectedRevision,
        confirmation.deckIdentity,
        confirmation.entryId,
        confirmation.sourceSpellId,
        {
          id: confirmation.copy.id,
          name: confirmation.copy.name,
          source: confirmation.copy.source,
        },
      );
      switch (result.status) {
        case "replaced":
          selectSpell(confirmation.copy.id);
          toast.success(t("details.copyReplaceSuccess"));
          setCopyConfirmation(null);
          break;
        case "conflict":
          setCopyConfirmation((previous) =>
            previous
              ? {
                  ...previous,
                  expectedRevision: result.actualRevision,
                  error: message("details.copyReplaceConflict"),
                }
              : previous,
          );
          break;
        case "deck-changed":
          setCopyConfirmation((previous) =>
            previous
              ? { ...previous, error: message("details.copyReplaceDeckChanged"), retryable: false }
              : previous,
          );
          break;
        case "missing":
          setCopyConfirmation((previous) =>
            previous ? { ...previous, error: message("details.copyReplaceMissing") } : previous,
          );
          break;
        case "duplicate":
          setCopyConfirmation((previous) =>
            previous ? { ...previous, error: message("details.copyReplaceDuplicate") } : previous,
          );
          break;
        case "error":
          setCopyConfirmation((previous) =>
            previous ? { ...previous, error: message("details.copyReplaceError") } : previous,
          );
          break;
      }
    } finally {
      replacingRef.current = false;
      setReplacing(false);
    }
  };

  const copyConfirmationDialog = (
    <Dialog
      open={copyConfirmation !== null}
      onOpenChange={(open) => {
        if (!open) closeCopyConfirmation();
      }}
    >
      {copyConfirmation ? (
        <DialogContent
          title={t("details.copyReplaceTitle", { name: copyConfirmation.copy.name })}
          description={t("details.copyReplaceDescription", { name: copyConfirmation.copy.name })}
          footer={
            <>
              <Button variant="outline" onClick={closeCopyConfirmation}>
                {t("common.cancel")}
              </Button>
              {copyConfirmation.error === null || copyConfirmation.retryable ? (
                <Button onClick={() => void attemptReplace()} disabled={replacing}>
                  {copyConfirmation.error === null
                    ? t("details.copyReplaceConfirm")
                    : t("details.copyReplaceRetry")}
                </Button>
              ) : null}
            </>
          }
        >
          {copyConfirmation.error ? (
            <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              {translateMessage(t, copyConfirmation.error)}
            </p>
          ) : null}
        </DialogContent>
      ) : null}
    </Dialog>
  );

  if (!selectedSpell) {
    return (
      <>
        <section className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("details.empty")}</p>
          {canUndo ? (
            <Button variant="outline" size="sm" onClick={() => void undoDelete()}>
              {t("details.undoDelete")}
            </Button>
          ) : null}
        </section>
        {copyConfirmationDialog}
      </>
    );
  }

  const spell = selectedSpell;
  const isCustom = spell.source === "Custom";
  const canCreateEditableCopy = spell.source === "SRD-5.2.1" && deckEntry !== undefined;
  const contentLanguage = resolveContentLanguage(spell, language);
  const detailsOpen = detailsSpellId !== null && detailsSpellId === spell.id;
  const openDetails = () => setDetailsSpellId(spell.id);
  const onAdd = async () => {
    const result = await addSpellToDeck(spell);
    if (result === "duplicate") {
      toast.info(t("library.toast.alreadyTitle"), {
        description: t("library.toast.alreadyDescription", { name: spell.name }),
      });
    }
  };

  const startCopy = () => {
    if (!activeDeck || !deckEntry || spell.source !== "SRD-5.2.1") return;
    const flow: CopyDraftFlow = {
      draft: createCustomSpellCopy(spell),
      sourceSpellId: spell.id,
      entryId: deckEntry.entryId,
      expectedRevision: activeDeck.revision,
      deckIdentity: {
        name: activeDeck.name,
        ...(activeDeck.savedDeckId === undefined ? {} : { savedDeckId: activeDeck.savedDeckId }),
      },
    };
    copyDraftRef.current = flow;
    setCopyDraft(flow);
  };

  const onCopySaved = (saved: Spell) => {
    const flow = copyDraftRef.current;
    setCopyDraft(null);
    if (!flow) return;
    setCopyConfirmation({
      copy: saved,
      sourceSpellId: flow.sourceSpellId,
      entryId: flow.entryId,
      expectedRevision: flow.expectedRevision,
      deckIdentity: flow.deckIdentity,
      error: null,
      retryable: true,
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={t("details.title")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 lang={contentLanguage} className="truncate text-sm font-semibold text-foreground">
            {spell.name}
          </h2>
          <SourceBadge
            source={spell.source}
            sourceLabel={spell.sourceLabel}
            overridden={spell.overridden}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button size="sm" onClick={() => void onAdd()}>
            <Plus size={14} aria-hidden="true" />
            {t("details.add")}
          </Button>
          <Button variant="outline" size="sm" onClick={openDetails} aria-label={t("details.show")}>
            <Info size={14} aria-hidden="true" />
            {t("details.show")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <SquarePen size={14} aria-hidden="true" />
            {t("details.edit")}
          </Button>
          {canCreateEditableCopy ? (
            <Button variant="ghost" size="sm" onClick={startCopy}>
              <Copy size={14} aria-hidden="true" />
              {t("details.createEditableCopy")}
            </Button>
          ) : null}
          {isCustom ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => void duplicateSpell(spell.id)}>
                <Copy size={14} aria-hidden="true" />
                {t("details.duplicate")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} aria-hidden="true" />
                {t("details.delete")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="mb-3 space-y-1">
          {fit.error ? (
            <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              {t("details.fitError")}
            </p>
          ) : null}
          {fit.result?.truncated ? (
            <p className="rounded border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-300">
              {t("details.truncated", { min: AUTO_SHRINK_MIN_PT })}
            </p>
          ) : null}
          {fit.result?.overflow ? (
            <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              {fit.result.overflowReason === "table"
                ? t("details.tableOverflow")
                : fit.result.overflowReason === "notes"
                  ? t("details.notesOverflow")
                  : t("details.overflow", { max: LIMITS.CONTINUATION_CARDS_MAX })}
            </p>
          ) : null}
          {fit.result && !fit.result.overflow ? (
            <p className="text-xs text-muted-foreground">
              {t("details.cardCount", {
                count: fit.result.pages.length,
                font: fit.result.fontPt,
              })}
            </p>
          ) : null}
        </div>

        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="card-preview-frame">
              {fit.result ? (
                fit.result.pages.map((pageBlocks, index) => (
                  <CardView
                    key={`${spell.id}-${index}`}
                    spell={spell}
                    blocks={pageBlocks}
                    cardIndex={index + 1}
                    cardCount={fit.result!.pages.length}
                    fontPt={fit.result!.fontPt}
                    contentLanguage={contentLanguage}
                    design={cardDesign}
                    presentation={fit.presentation ?? undefined}
                    className="card-preview-page animate-reveal-subtle"
                  />
                ))
              ) : (
                <div className="rounded border border-dashed border-input p-4 text-xs text-muted-foreground">
                  {t("details.measuring")}
                </div>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="app-no-print absolute right-2 top-2"
                    aria-label={t("details.moreActions")}
                    title={t("details.moreActions")}
                  >
                    <Ellipsis size={16} aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={openDetails}>
                    <Info size={14} aria-hidden="true" />
                    {t("details.show")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    <SquarePen size={14} aria-hidden="true" />
                    {t("details.edit")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={openDetails}>
              <Info size={14} aria-hidden="true" />
              {t("details.show")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setEditing(true)}>
              <SquarePen size={14} aria-hidden="true" />
              {t("details.edit")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>

      <SpellDetailsDialog
        spell={spell}
        open={detailsOpen}
        onOpenChange={(open) => setDetailsSpellId(open ? spell.id : null)}
        datasetLanguage={language}
      />

      <CustomSpellForm open={editing} onOpenChange={setEditing} spell={spell} />

      <CustomSpellForm
        open={copyDraft !== null}
        onOpenChange={(open) => {
          if (!open) setCopyDraft(null);
        }}
        spell={copyDraft?.draft}
        editableCopy
        selectOnSave={false}
        onSaved={onCopySaved}
      />

      {copyConfirmationDialog}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={t("details.deleteTitle", { name: spell.name })}
          description={t("details.deleteDescription")}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  void deleteSpell(spell.id);
                  setConfirmDelete(false);
                }}
              >
                {t("details.deleteConfirm")}
              </Button>
            </>
          }
        />
      </Dialog>
      {fit.measureLayer}
    </section>
  );
}
