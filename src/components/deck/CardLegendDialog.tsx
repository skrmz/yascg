import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Hourglass, Target } from "lucide-react";
import { CORE_CLASSES, SPELL_SCHOOLS } from "@/domain/spells";
import {
  abbreviationFull,
  abbreviationShort,
  CLASS_ABBREVIATION_IDS,
  COMPONENT_ABBREVIATION_IDS,
  SCHOOL_ABBREVIATION_IDS,
  type SharedAbbreviationId,
} from "@/locales/abbreviations.ts";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";

function EntryRow({ glyph, full }: { glyph: string; full: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="min-w-10 shrink-0 font-semibold text-foreground">{glyph}</span>
      <span className="text-muted-foreground">{full}</span>
    </li>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-0.5 text-sm">{children}</ul>
    </section>
  );
}

function CatalogRow({ id }: { id: SharedAbbreviationId }) {
  const { t } = useTranslation();
  return <EntryRow glyph={abbreviationShort(id, t)} full={abbreviationFull(id, t)} />;
}

export function CardLegendDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("card.design.legendTitle")}
        description={t("card.design.legendDescription")}
        footer={
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Group title={t("card.design.legendCastingTime")}>
            <EntryRow glyph="A" full={abbreviationFull("action", t)} />
            <EntryRow glyph="B" full={abbreviationFull("bonusAction", t)} />
            <EntryRow glyph="R" full={abbreviationFull("reaction", t)} />
            <CatalogRow id="minute" />
            <CatalogRow id="hour" />
          </Group>

          <Group title={t("card.design.legendProperties")}>
            <EntryRow glyph="C" full={abbreviationFull("concentration", t)} />
            <EntryRow glyph="R" full={abbreviationFull("ritual", t)} />
            <EntryRow glyph="(+)" full={t("spell.higherLevels")} />
          </Group>

          <Group title={t("card.design.legendComponents")}>
            <CatalogRow id={COMPONENT_ABBREVIATION_IDS.verbal} />
            <CatalogRow id={COMPONENT_ABBREVIATION_IDS.somatic} />
            <CatalogRow id={COMPONENT_ABBREVIATION_IDS.material} />
          </Group>

          <Group title={t("card.design.legendRangeDuration")}>
            <li className="flex items-baseline gap-2">
              <Target size={14} aria-hidden="true" className="min-w-10 shrink-0" />
              <span className="text-muted-foreground">{abbreviationFull("range", t)}</span>
            </li>
            <li className="flex items-baseline gap-2">
              <Hourglass size={14} aria-hidden="true" className="min-w-10 shrink-0" />
              <span className="text-muted-foreground">{abbreviationFull("duration", t)}</span>
            </li>
          </Group>

          <Group title={t("card.design.legendSchools")}>
            {SPELL_SCHOOLS.map((school) => (
              <CatalogRow key={school} id={SCHOOL_ABBREVIATION_IDS[school]} />
            ))}
          </Group>

          <Group title={t("card.design.legendClasses")}>
            {CORE_CLASSES.map((name) => (
              <CatalogRow key={name} id={CLASS_ABBREVIATION_IDS[name]} />
            ))}
          </Group>
        </div>
      </DialogContent>
    </Dialog>
  );
}
