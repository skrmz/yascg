import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Hourglass, Target } from "lucide-react";
import type { CharacterClass, SpellComponentKey } from "@/domain/spells";
import type { BlockNode } from "@/markdown/parse.ts";
import { Block, Inline } from "@/markdown/render.tsx";
import type { CardViewProps } from "@/cards/Card.tsx";
import type { CompactNote, CompactPresentation } from "@/cards/compact.ts";
import {
  compactNoteId,
  parseCastingTime,
  castingTimeFullLabel,
  superscriptNumber,
} from "@/cards/compact.ts";
import { materialDetailText } from "@/cards/format.ts";
import {
  abbreviationFull,
  abbreviationShort,
  classAbbreviation,
  componentAbbreviation,
  schoolAbbreviation,
} from "@/locales/abbreviations.ts";
import { classKey, levelLabelKey, schoolKey, sourceLabelText } from "@/locales/labels.ts";
import { Tooltip } from "@/ui/Tooltip.tsx";

export type CompactCardViewProps = Omit<CardViewProps, "design" | "presentation"> & {
  presentation: CompactPresentation;
};

function HoverHint({
  label,
  enabled,
  className,
  ariaLabel,
  children,
}: {
  label: string;
  enabled: boolean;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const content = (
    <span className={className} tabIndex={enabled ? 0 : undefined} aria-label={ariaLabel}>
      {children}
    </span>
  );
  return enabled ? <Tooltip label={label}>{content}</Tooltip> : content;
}

function NoteMarker({ number, prefix }: { number: number | undefined; prefix: string }) {
  const { t } = useTranslation();
  if (number === undefined) return null;
  return (
    <sup
      className="compact-note-marker"
      aria-describedby={compactNoteId(prefix, number)}
      aria-label={t("card.noteReference", { number })}
    >
      {superscriptNumber(number)}
    </sup>
  );
}

function CompactBlockList({
  blocks,
  notes,
  notePrefix,
  showNotes,
}: {
  blocks: readonly BlockNode[];
  notes: readonly CompactNote[];
  notePrefix: string;
  showNotes: boolean;
}) {
  const { t } = useTranslation();
  const rendered: ReactNode[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    if (!block) break;
    if (block.type === "list" && block.role === "notes") {
      if (showNotes) {
        rendered.push(
          <section className="compact-notes" key={`notes-${index}`} aria-label={t("card.notes")}>
            <ol className="compact-notes-list">
              {notes.map((note) => (
                <li key={note.number} id={compactNoteId(notePrefix, note.number)}>
                  <span className="compact-note-number">{superscriptNumber(note.number)}</span>{" "}
                  <span className="compact-note-label">{note.label}:</span>{" "}
                  <span className="compact-note-text">
                    <Inline nodes={note.children} />
                  </span>
                </li>
              ))}
            </ol>
          </section>,
        );
      }
      index += 1;
      continue;
    }
    if (block.section === "higherLevels") {
      const start = index;
      const grouped: BlockNode[] = [];
      while (index < blocks.length && blocks[index]?.section === "higherLevels") {
        const sectionBlock = blocks[index];
        if (sectionBlock) grouped.push(sectionBlock);
        index += 1;
      }
      rendered.push(
        <section
          className="compact-higher"
          key={`higher-${start}`}
          aria-label={t("spell.higherLevels")}
        >
          <span className="compact-higher-marker" aria-hidden="true">
            (+)
          </span>
          <div className="compact-higher-body">
            {grouped.map((groupBlock, groupIndex) => (
              <Block
                key={`higher-block-${start}-${groupIndex}`}
                block={groupBlock}
                keyPrefix={`higher-${start}-${groupIndex}`}
              />
            ))}
          </div>
        </section>,
      );
      continue;
    }
    rendered.push(<Block key={`block-${index}`} block={block} keyPrefix={`compact-${index}`} />);
    index += 1;
  }
  return <>{rendered}</>;
}

function classDisplay(name: CharacterClass, t: TFunction): string {
  const abbreviation = classAbbreviation(name);
  if (abbreviation) return abbreviationShort(abbreviation, t);
  const key = classKey(name);
  return key ? t(key) : name;
}

function classFullLabel(name: CharacterClass, t: TFunction): string {
  const abbreviation = classAbbreviation(name);
  if (abbreviation) return abbreviationFull(abbreviation, t);
  const key = classKey(name);
  return key ? t(key) : name;
}

const COMPONENT_ORDER: readonly SpellComponentKey[] = ["verbal", "somatic", "material"];

export function CompactCardView({
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
  presentation,
}: CompactCardViewProps) {
  const { t } = useTranslation();
  const rawPrefix = useId();
  const notePrefix = rawPrefix.replace(/:/g, "-");
  const isContinuation = continuation ?? cardIndex > 1;
  const levelLabel = t(levelLabelKey(spell.level), { level: spell.level });
  const school = t(schoolKey(spell.school));
  const schoolAbbr = schoolAbbreviation(spell.school);
  const material = materialDetailText(spell, t);
  const castingParse = parseCastingTime(spell.castingTime);
  const components = COMPONENT_ORDER.filter((key) => spell.components[key]);
  const override = spell.components.componentsDisplayOverride?.trim();
  const disabledHints = isContinuation;

  return (
    <article
      lang={contentLanguage}
      data-school={spell.school.toLowerCase()}
      className={`spell-card spell-card-compact${
        isContinuation ? " spell-card-continuation" : ""
      }${className ? ` ${className}` : ""}`}
      style={{ ["--body-font-pt" as string]: `${fontPt}pt` }}
    >
      <div className="compact-card-measured" ref={bodyRef}>
        <header className="compact-header">
          <div className="compact-title-row">
            <span className="compact-level" aria-label={levelLabel} title={levelLabel}>
              {spell.level}
            </span>
            <h2 className="compact-name" title={spell.name}>
              {spell.name}
            </h2>
          </div>
          {isContinuation ? (
            <span className="compact-continuation">{t("card.continued")}</span>
          ) : null}
        </header>

        {isContinuation ? null : (
          <>
            <div className="compact-metadata">
              <HoverHint
                label={castingTimeFullLabel(castingParse, t)}
                enabled
                className="compact-meta-item compact-casting"
                ariaLabel={t("spell.metadata.castingTime")}
              >
                <span className="compact-meta-value">{presentation.displayCastingTime}</span>
                <NoteMarker number={presentation.castingNoteNumber} prefix={notePrefix} />
              </HoverHint>
              <HoverHint
                label={abbreviationFull("range", t)}
                enabled
                className="compact-meta-item"
                ariaLabel={t("spell.metadata.range")}
              >
                <Target size={12} aria-hidden="true" className="compact-meta-icon" />
                <span className="compact-meta-value">{spell.range}</span>
              </HoverHint>
              <HoverHint
                label={abbreviationFull("duration", t)}
                enabled
                className="compact-meta-item"
                ariaLabel={t("spell.metadata.duration")}
              >
                <Hourglass size={12} aria-hidden="true" className="compact-meta-icon" />
                <span className="compact-meta-value">{presentation.displayDuration}</span>
                <NoteMarker number={presentation.durationNoteNumber} prefix={notePrefix} />
              </HoverHint>
            </div>

            <div className="compact-components-row">
              {override ? (
                <span className="compact-component-override">{override}</span>
              ) : components.length > 0 ? (
                <span
                  className="compact-component-group"
                  aria-label={t("spell.metadata.components")}
                >
                  {components.map((component) => {
                    const abbreviation = componentAbbreviation(component);
                    return (
                      <HoverHint
                        key={component}
                        label={abbreviationFull(abbreviation, t)}
                        enabled
                        className="compact-component-box"
                      >
                        <span className="compact-glyph">{abbreviationShort(abbreviation, t)}</span>
                      </HoverHint>
                    );
                  })}
                </span>
              ) : null}
              {spell.concentration ? (
                <HoverHint
                  label={abbreviationFull("concentration", t)}
                  enabled
                  className="compact-concentration"
                  ariaLabel={abbreviationFull("concentration", t)}
                >
                  <span className="compact-glyph">C</span>
                </HoverHint>
              ) : null}
              {spell.ritual ? (
                <HoverHint
                  label={abbreviationFull("ritual", t)}
                  enabled={!disabledHints}
                  className="compact-ritual"
                  ariaLabel={abbreviationFull("ritual", t)}
                >
                  R
                </HoverHint>
              ) : null}
            </div>

            {material ? <p className="compact-material">{material}</p> : null}
          </>
        )}

        <div className="compact-body">
          <CompactBlockList
            blocks={blocks}
            notes={presentation.notes}
            notePrefix={notePrefix}
            showNotes={!isContinuation}
          />
        </div>

        {cardCount > 1 ? (
          <p className="compact-pagination">
            {t("card.pageNumber", { index: cardIndex, count: cardCount })}
          </p>
        ) : null}

        <footer className="compact-footer">
          <span className="compact-footer-source" title={sourceLabelText(spell, t)}>
            {sourceLabelText(spell, t)}
          </span>
          <span className="compact-footer-sep" aria-hidden="true">
            |
          </span>
          <HoverHint
            label={abbreviationFull(schoolAbbr, t)}
            enabled={!disabledHints}
            className="compact-footer-school"
            ariaLabel={school}
          >
            {abbreviationShort(schoolAbbr, t)}
          </HoverHint>
          <span className="compact-footer-sep" aria-hidden="true">
            |
          </span>
          {spell.classes.length > 0 ? (
            <span className="compact-footer-classes" aria-label={t("spell.metadata.classes")}>
              {spell.classes.map((name, index) => (
                <span key={`${name}-${index}`}>
                  {index > 0 ? " · " : null}
                  <HoverHint
                    label={classFullLabel(name, t)}
                    enabled={!disabledHints}
                    ariaLabel={classFullLabel(name, t)}
                  >
                    {classDisplay(name, t)}
                  </HoverHint>
                </span>
              ))}
            </span>
          ) : (
            <span className="compact-footer-classes" aria-label={t("spell.metadata.classes")}>
              {"\u2014"}
            </span>
          )}
        </footer>
      </div>
      {overflowWarning ? (
        <span className="card-overflow-badge" role="status">
          {t("card.truncated")}
        </span>
      ) : null}
    </article>
  );
}
