import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { CharacterClass, Spell } from "@/domain/spells";
import type { BlockNode } from "@/markdown/parse.ts";
import { BlockList } from "@/markdown/render.tsx";
import { classKey, componentKey, levelLabelKey, schoolKey } from "@/locales/labels.ts";

export interface CardViewProps {
  spell: Spell;
  blocks: readonly BlockNode[];
  cardIndex: number;
  cardCount: number;
  fontPt: number;
  overflowWarning?: boolean;
  className?: string;
  bodyRef?: Ref<HTMLDivElement>;
}

export function componentSummary(spell: Spell, t: TFunction): string {
  const override = spell.components.componentsDisplayOverride?.trim();
  if (override) return override;
  const letters: string[] = [];
  if (spell.components.verbal) letters.push(t(componentKey("verbal")));
  if (spell.components.somatic) letters.push(t(componentKey("somatic")));
  if (spell.components.material) letters.push(t(componentKey("material")));
  return letters.length > 0 ? letters.join(", ") : "\u2014";
}

export function classSummary(classes: readonly CharacterClass[], t: TFunction): string {
  return classes
    .map((name) => {
      const key = classKey(name);
      return key ? t(key) : name;
    })
    .join(", ");
}

export function metadataRows(spell: Spell, t: TFunction): Array<{ label: string; value: string }> {
  return [
    { label: t("spell.metadata.castingTime"), value: spell.castingTime },
    { label: t("spell.metadata.range"), value: spell.range },
    { label: t("spell.metadata.components"), value: componentSummary(spell, t) },
    { label: t("spell.metadata.duration"), value: spell.duration },
  ];
}

export function CardView({
  spell,
  blocks,
  cardIndex,
  cardCount,
  fontPt,
  overflowWarning = false,
  className,
  bodyRef,
}: CardViewProps) {
  const { t, i18n } = useTranslation();
  const levelLabel = t(levelLabelKey(spell.level), { level: spell.level });
  const labels: string[] = [];
  if (spell.concentration) labels.push(t("spell.flag.concentration"));
  if (spell.ritual) labels.push(t("spell.flag.ritual"));
  const classes = classSummary(spell.classes, t);

  return (
    <article
      lang={i18n.resolvedLanguage}
      className={`spell-card${className ? ` ${className}` : ""}`}
      style={{ ["--body-font-pt" as string]: `${fontPt}pt` }}
    >
      <header className="card-header">
        <h2 className="card-name" title={spell.name}>
          {spell.name}
        </h2>
        <div className="card-subtitle">
          <span className="card-level-school">
            {levelLabel} &middot; {t(schoolKey(spell.school))}
          </span>
          <span className="card-flags">
            {labels.map((label) => (
              <span key={label} className="card-flag">
                {label}
              </span>
            ))}
          </span>
        </div>
      </header>
      <dl className="card-metadata">
        {metadataRows(spell, t).map((row) => (
          <div className="card-metadata-row" key={row.label}>
            <dt>{row.label}</dt>
            <dd title={row.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {spell.components.material && spell.components.materialDescription ? (
        <p className="card-material" title={spell.components.materialDescription}>
          {spell.components.materialDescription}
        </p>
      ) : null}
      <div className="card-body" ref={bodyRef}>
        <BlockList blocks={blocks} />
      </div>
      <footer className="card-footer">
        <span className="card-source">{spell.sourceLabel ?? spell.source}</span>
        {spell.classes.length > 0 ? (
          <p className="card-classes" title={classes}>
            {classes}
          </p>
        ) : null}
        {cardCount > 1 ? (
          <span className="card-continuation">
            {cardIndex > 1 ? `${t("card.continuedFrom", { index: cardIndex - 1 })} \u00b7 ` : ""}
            {t("card.continuation", { index: cardIndex, count: cardCount })}
          </span>
        ) : null}
      </footer>
      {overflowWarning ? (
        <span className="card-overflow-badge" role="status">
          {t("card.truncated")}
        </span>
      ) : null}
    </article>
  );
}
