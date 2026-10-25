import { useTranslation } from "react-i18next";
import { classSummary, componentSummary, materialDetailText } from "@/cards/Card.tsx";
import type { Spell } from "@/domain/spells";
import { componentMarkerKey, damageTypeKey, subclassLabel } from "@/locales/labels.ts";
import { parseSpellBody } from "@/markdown/parse.ts";
import { BlockList } from "@/markdown/render.tsx";
import { Badge, SourceBadge } from "@/ui/Badge.tsx";

export function SpellDetailsContent({ spell }: { spell: Spell }) {
  const { t, i18n } = useTranslation();
  const blocks = parseSpellBody(spell, t("spell.higherLevels"), {
    verbal: t(componentMarkerKey("verbal")),
    somatic: t(componentMarkerKey("somatic")),
  });
  const material = materialDetailText(spell, t);
  const subclasses =
    spell.subclasses && spell.subclasses.length > 0
      ? spell.subclasses.map((id) => subclassLabel(id, t)).join(", ")
      : "\u2014";

  return (
    <div lang={i18n.resolvedLanguage} className="spell-details-content space-y-4">
      <div className="flex flex-wrap items-center gap-1">
        <SourceBadge
          source={spell.source}
          sourceLabel={spell.sourceLabel}
          overridden={spell.overridden}
        />
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

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("spell.metadata.castingTime")}</dt>
        <dd className="min-w-0 break-words">{spell.castingTime}</dd>
        <dt className="text-muted-foreground">{t("spell.metadata.range")}</dt>
        <dd className="min-w-0 break-words">{spell.range}</dd>
        <dt className="text-muted-foreground">{t("spell.metadata.duration")}</dt>
        <dd className="min-w-0 break-words">{spell.duration}</dd>
        <dt className="text-muted-foreground">{t("spell.metadata.components")}</dt>
        <dd className="min-w-0 break-words">{componentSummary(spell, t)}</dd>
        {material ? (
          <>
            <dt className="text-muted-foreground">{t("spell.metadata.material")}</dt>
            <dd className="min-w-0 break-words">{material}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">{t("spell.metadata.classes")}</dt>
        <dd className="min-w-0 break-words">
          {spell.classes.length > 0 ? classSummary(spell.classes, t) : "\u2014"}
        </dd>
        <dt className="text-muted-foreground">{t("spell.metadata.subclasses")}</dt>
        <dd className="min-w-0 break-words">{subclasses}</dd>
      </dl>

      <div className="text-sm leading-relaxed text-foreground">
        <BlockList blocks={blocks} />
      </div>
    </div>
  );
}
