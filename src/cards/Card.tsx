import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { Spell } from "@/domain/spells";
import type { BlockNode } from "@/markdown/parse.ts";
import { BlockList } from "@/markdown/render.tsx";
import { levelLabelKey, schoolKey, sourceLabelText } from "@/locales/labels.ts";
import { classSummary, materialDetailText, metadataRows } from "./format.ts";
import type { CardDesign } from "./design.ts";
import type { CompactPresentation } from "./compact.ts";
import { CompactCardView, type CompactCardViewProps } from "./CompactCard.tsx";

export { classSummary, componentSummary, materialDetailText, metadataRows } from "./format.ts";

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
  design?: CardDesign;
  presentation?: CompactPresentation;
}

export function ClassicCardView({
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

/** Dispatches to Classic (default) or the additive Compact design. */
export function CardView(props: CardViewProps) {
  if (props.design === "compact") {
    if (!props.presentation) {
      throw new Error("Compact card design requires a compact presentation.");
    }
    const { design: _design, presentation: _presentation, ...rest } = props;
    const compactProps: CompactCardViewProps = { ...rest, presentation: props.presentation };
    return <CompactCardView {...compactProps} />;
  }
  return <ClassicCardView {...props} />;
}
