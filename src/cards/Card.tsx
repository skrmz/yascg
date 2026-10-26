import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { CharacterClass, Spell } from "@/domain/spells";
import type { BlockNode } from "@/markdown/parse.ts";
import { BlockList } from "@/markdown/render.tsx";
import {
  classKey,
  componentKey,
  levelLabelKey,
  schoolKey,
  sourceLabelText,
} from "@/locales/labels.ts";

export interface CardViewProps {
  spell: Spell;
  blocks: readonly BlockNode[];
  cardIndex: number;
  cardCount: number;
  fontPt: number;
  overflowWarning?: boolean;
  className?: string;
  bodyRef?: Ref<HTMLDivElement>;
  continuation?: boolean;
  contentLanguage?: string;
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

/**
 * Composes the material-detail line from description, cost, and an optional
 * consumed qualifier. Returns `null` when the material component is disabled or
 * no detail text exists, so no empty parentheses or stray separators render.
 */
export function materialDetailText(spell: Spell, t: TFunction): string | null {
  const components = spell.components;
  if (!components.material) return null;
  const description = components.materialDescription?.trim() ?? "";
  const details: string[] = [];
  const cost = components.materialCost?.trim();
  if (cost) details.push(cost);
  if (components.materialConsumed) details.push(t("spell.metadata.materialConsumed"));
  if (description === "" && details.length === 0) return null;
  if (description === "") return details.join(", ");
  if (details.length === 0) return description;
  return `${description} (${details.join(", ")})`;
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
  continuation,
  contentLanguage,
}: CardViewProps) {
  const { t } = useTranslation();
  const levelLabel = t(levelLabelKey(spell.level), { level: spell.level });
  const labels: string[] = [];
  if (spell.concentration) labels.push(t("spell.flag.concentration"));
  if (spell.ritual) labels.push(t("spell.flag.ritual"));
  const classes = classSummary(spell.classes, t);
  const material = materialDetailText(spell, t);
  const isContinuation = continuation ?? cardIndex > 1;

  return (
    <article
      lang={contentLanguage}
      className={`spell-card${isContinuation ? " spell-card-continuation" : ""}${
        className ? ` ${className}` : ""
      }`}
      style={{ ["--body-font-pt" as string]: `${fontPt}pt` }}
    >
      <header className="card-header">
        {isContinuation ? (
          <span className="card-continuation-label">{t("card.continued")}</span>
        ) : null}
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
      {isContinuation ? null : (
        <dl className="card-metadata">
          {metadataRows(spell, t).map((row) => (
            <div className="card-metadata-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd title={row.value}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="card-body-measured" ref={bodyRef}>
        {material && !isContinuation ? (
          <p className="card-material text-end pb-1" title={material}>
            {material}
          </p>
        ) : null}
        <div className="card-body">
          <BlockList blocks={blocks} />
        </div>
      </div>
      <footer className="card-footer">
        <span className="card-source">{sourceLabelText(spell, t)}</span>
        {spell.classes.length > 0 ? (
          <p className="card-classes" title={classes}>
            {classes}
          </p>
        ) : null}
        {cardCount > 1 ? (
          <span className="card-continuation">
            {t("card.pageNumber", { index: cardIndex, count: cardCount })}
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
