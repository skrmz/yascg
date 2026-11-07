import type { CardFitMode, Spell } from "@/domain/spells";
import type { BlockNode } from "@/markdown/parse.ts";
import type { CardDesign } from "./design.ts";

/** Bump whenever shared card print styles or fit semantics change so cached measurements invalidate. */
export const CARD_STYLE_VERSION = "6";

export function contentFingerprint(spell: Spell): string {
  return JSON.stringify({
    id: spell.id,
    name: spell.name,
    level: spell.level,
    school: spell.school,
    castingTime: spell.castingTime,
    range: spell.range,
    components: spell.components,
    duration: spell.duration,
    concentration: spell.concentration,
    ritual: spell.ritual,
    classes: spell.classes,
    description: spell.description,
    higherLevels: spell.higherLevels,
    source: spell.source,
    sourceLabel: spell.sourceLabel,
    overridden: spell.overridden ?? false,
  });
}

export function blocksFingerprint(blocks: readonly BlockNode[]): string {
  return JSON.stringify(blocks);
}

export function fitCacheKey(options: {
  spellId: string;
  language: string;
  fitMode: CardFitMode;
  design: CardDesign;
  contentFingerprint: string;
  blocksFingerprint: string;
}): string {
  return [
    options.spellId,
    options.language,
    options.fitMode,
    options.design,
    CARD_STYLE_VERSION,
    options.contentFingerprint,
    options.blocksFingerprint,
  ].join("\u0000");
}
