import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Ellipsis, Info, Plus, SquarePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/state/AppProvider.tsx";
import { CardView } from "@/cards/Card.tsx";
import { useCardFit, AUTO_SHRINK_MIN_PT } from "@/cards/fit.tsx";
import { LIMITS } from "@/domain/spells";
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

export function DetailsPane() {
  const {
    selectedSpell,
    activeDeck,
    language,
    addSpellToDeck,
    duplicateSpell,
    deleteSpell,
    canUndo,
    undoDelete,
  } = useApp();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailsSpellId, setDetailsSpellId] = useState<string | null>(null);

  const fitMode =
    activeDeck?.entries.find((entry) => entry.spellId === selectedSpell?.id)?.fitMode ??
    "auto-shrink";

  const fit = useCardFit({
    spell: selectedSpell,
    fitMode,
    language,
  });

  useEffect(() => {
    setDetailsSpellId(null);
  }, [selectedSpell?.id]);

  if (!selectedSpell) {
    return (
      <section className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Select a spell to preview its card and details.
        </p>
        {canUndo ? (
          <Button variant="outline" size="sm" onClick={() => void undoDelete()}>
            Undo delete
          </Button>
        ) : null}
      </section>
    );
  }

  const spell = selectedSpell;
  const isCustom = spell.source === "Custom";
  const detailsOpen = detailsSpellId !== null && detailsSpellId === spell.id;
  const openDetails = () => setDetailsSpellId(spell.id);
  const onAdd = async () => {
    const result = await addSpellToDeck(spell);
    if (result === "duplicate") {
      toast.info("Already in deck", {
        description: `${spell.name} is already in the active deck.`,
      });
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Spell preview and details">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-foreground">{spell.name}</h2>
          <SourceBadge
            source={spell.source}
            sourceLabel={spell.sourceLabel}
            overridden={spell.overridden}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button size="sm" onClick={() => void onAdd()}>
            <Plus size={14} aria-hidden="true" />
            Add
          </Button>
          <Button variant="outline" size="sm" onClick={openDetails} aria-label={t("details.show")}>
            <Info size={14} aria-hidden="true" />
            {t("details.show")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <SquarePen size={14} aria-hidden="true" />
            Edit
          </Button>
          {isCustom ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => void duplicateSpell(spell.id)}>
                <Copy size={14} aria-hidden="true" />
                Duplicate
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="mb-3 space-y-1">
          {fit.error ? (
            <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              {fit.error}
            </p>
          ) : null}
          {fit.result?.truncated ? (
            <p className="rounded border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-300">
              Description truncated to fit on one card at {AUTO_SHRINK_MIN_PT}pt. Switch to
              multi-card mode to display the full description.
            </p>
          ) : null}
          {fit.result?.overflow ? (
            <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              This entry exceeds the {LIMITS.CONTINUATION_CARDS_MAX}-card continuation limit and
              cannot be printed.
            </p>
          ) : null}
          {fit.result && !fit.result.overflow ? (
            <p className="text-xs text-muted-foreground">
              {fit.result.pages.length} physical card
              {fit.result.pages.length === 1 ? "" : "s"} at {fit.result.fontPt}pt.
            </p>
          ) : null}
        </div>

        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="card-preview-frame">
              {fit.result ? (
                fit.result.pages.map((pageBlocks, index) => (
                  <CardView
                    key={index}
                    spell={spell}
                    blocks={pageBlocks}
                    cardIndex={index + 1}
                    cardCount={fit.result!.pages.length}
                    fontPt={fit.result!.fontPt}
                    className="card-preview-page"
                  />
                ))
              ) : (
                <div className="rounded border border-dashed border-input p-4 text-xs text-muted-foreground">
                  Measuring card layout…
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
      />

      <CustomSpellForm open={editing} onOpenChange={setEditing} spell={spell} />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={`Delete "${spell.name}"?`}
          description="Deleting this custom spell also removes all of its entries from the active deck. Saved decks are not changed."
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  void deleteSpell(spell.id);
                  setConfirmDelete(false);
                }}
              >
                Delete spell
              </Button>
            </>
          }
        />
      </Dialog>
      {fit.measureLayer}
    </section>
  );
}
