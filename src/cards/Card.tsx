import type { Ref } from "react";
import type { Spell } from "@/domain/spells";
import type { BlockNode } from "@/markdown/parse.ts";
import { BlockList } from "@/markdown/render.tsx";

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

export function componentSummary(spell: Spell): string {
  const override = spell.components.componentsDisplayOverride?.trim();
  if (override) return override;
  const letters: string[] = [];
  if (spell.components.verbal) letters.push("V");
  if (spell.components.somatic) letters.push("S");
  if (spell.components.material) letters.push("M");
  return letters.length > 0 ? letters.join(", ") : "\u2014";
}

export function metadataRows(spell: Spell): Array<{ label: string; value: string }> {
  return [
    { label: "Casting Time", value: spell.castingTime },
    { label: "Range", value: spell.range },
    { label: "Components", value: componentSummary(spell) },
    { label: "Duration", value: spell.duration },
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
  const levelLabel = spell.level === 0 ? "Cantrip" : `Level ${spell.level}`;
  const labels: string[] = [];
  if (spell.concentration) labels.push("Concentration");
  if (spell.ritual) labels.push("Ritual");

  return (
    <article
      className={`spell-card${className ? ` ${className}` : ""}`}
      style={{ ["--body-font-pt" as string]: `${fontPt}pt` }}
    >
      <header className="card-header">
        <h2 className="card-name" title={spell.name}>
          {spell.name}
        </h2>
        <div className="card-subtitle">
          <span className="card-level-school">
            {levelLabel} &middot; {spell.school}
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
        {metadataRows(spell).map((row) => (
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
          <p className="card-classes" title={spell.classes.join(", ")}>
            {spell.classes.join(", ")}
          </p>
        ) : null}
        {cardCount > 1 ? (
          <span className="card-continuation">
            {cardIndex > 1 ? `Continued from Card ${cardIndex - 1} \u00b7 ` : ""}
            {`Card ${cardIndex} of ${cardCount}`}
          </span>
        ) : null}
      </footer>
      {overflowWarning ? (
        <span className="card-overflow-badge" role="status">
          Content truncated
        </span>
      ) : null}
    </article>
  );
}
