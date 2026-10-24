import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Plus, SquarePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/state/AppProvider.tsx";
import { CardView, classSummary, materialDetailText } from "@/cards/Card.tsx";
import {
  componentKey,
  componentMarkerKey,
  damageTypeKey,
  subclassLabel,
} from "@/locales/labels.ts";
import { useCardFit, AUTO_SHRINK_MIN_PT } from "@/cards/fit.tsx";
import { LIMITS } from "@/domain/spells";
import { BlockList } from "@/markdown/render.tsx";
import { componentDescriptionBlocks, parseMarkdown } from "@/markdown/parse.ts";
import { Button } from "@/ui/Button.tsx";
import { Badge, SourceBadge } from "@/ui/Badge.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { CustomSpellForm } from "./CustomSpellForm.tsx";

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
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fitMode =
    activeDeck?.entries.find((entry) => entry.spellId === selectedSpell?.id)?.fitMode ??
    "auto-shrink";

  const fit = useCardFit({
    spell: selectedSpell,
    fitMode,
    language,
  });

  if (!selectedSpell) {
    return (
      <section className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Select a spell to preview its card and details.
        </p>
        <Button onClick={() => setEditing(true)}>
          <Plus size={16} aria-hidden="true" />
          New custom spell
        </Button>
        <CustomSpellForm open={editing} onOpenChange={setEditing} />
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
  const onAdd = async () => {
    const result = await addSpellToDeck(spell);
    if (result === "duplicate") {
      toast.info("Already in deck", {
        description: `${spell.name} is already in the active deck.`,
      });
    }
  };
  const descriptionBlocks = parseMarkdown(spell.description.join("\n\n"));
  const higherBlocks = spell.higherLevels ? parseMarkdown(spell.higherLevels.join("\n\n")) : [];
  const componentBlocks = componentDescriptionBlocks(spell, {
    verbal: t(componentMarkerKey("verbal")),
    somatic: t(componentMarkerKey("somatic")),
  });
  const material = materialDetailText(spell, t);

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
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => void onAdd()}>
            <Plus size={14} aria-hidden="true" />
            Add
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
        <div className="mb-4 flex flex-wrap items-start gap-4">
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
          </div>
          <div
            lang={i18n.resolvedLanguage}
            className="min-w-[16rem] flex-1 space-y-2 text-sm text-foreground"
          >
            {fit.error ? (
              <p className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                {fit.error}
              </p>
            ) : null}
            {fit.result?.truncated ? (
              <p className="rounded border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-300">
                Content was truncated to fit at {AUTO_SHRINK_MIN_PT}pt. Full text remains below.
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
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">{t("spell.metadata.castingTime")}</dt>
              <dd>{spell.castingTime}</dd>
              <dt className="text-muted-foreground">{t("spell.metadata.range")}</dt>
              <dd>{spell.range}</dd>
              <dt className="text-muted-foreground">{t("spell.metadata.duration")}</dt>
              <dd>{spell.duration}</dd>
              <dt className="text-muted-foreground">{t("spell.metadata.components")}</dt>
              <dd>
                {spell.components.verbal ? t(componentKey("verbal")) : ""}
                {spell.components.somatic ? t(componentKey("somatic")) : ""}
                {spell.components.material ? t(componentKey("material")) : ""}
                {!spell.components.verbal && !spell.components.somatic && !spell.components.material
                  ? "\u2014"
                  : ""}
              </dd>
              {material ? (
                <>
                  <dt className="text-muted-foreground">{t("spell.metadata.material")}</dt>
                  <dd>{material}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">{t("spell.metadata.classes")}</dt>
              <dd>{spell.classes.length > 0 ? classSummary(spell.classes, t) : "\u2014"}</dd>
              <dt className="text-muted-foreground">{t("spell.metadata.subclasses")}</dt>
              <dd>
                {spell.subclasses && spell.subclasses.length > 0
                  ? spell.subclasses.map((id) => subclassLabel(id, t)).join(", ")
                  : "\u2014"}
              </dd>
            </dl>
            <div className="flex flex-wrap gap-1">
              {spell.concentration ? <Badge>{t("spell.flag.concentration")}</Badge> : null}
              {spell.ritual ? <Badge>{t("spell.flag.ritual")}</Badge> : null}
              {spell.damageTypes?.map((type) => {
                const key = damageTypeKey(type);
                return (
                  <Badge key={type} tone="warning">
                    {key ? t(key) : type}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>

        <div
          lang={i18n.resolvedLanguage}
          className="max-w-3xl space-y-2 text-sm leading-relaxed text-foreground"
        >
          <BlockList blocks={descriptionBlocks} />
          {higherBlocks.length > 0 ? (
            <>
              <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("spell.higherLevels")}
              </h3>
              <BlockList blocks={higherBlocks} />
            </>
          ) : null}
          <BlockList blocks={componentBlocks} />
        </div>
      </div>

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
