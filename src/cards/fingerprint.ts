import type { CardFitMode, Spell } from "@/domain/spells";
import type { BlockNode } from "@/markdown/parse.ts";

/** Bump whenever card print styles change so cached measurements invalidate. */
export const CARD_STYLE_VERSION = "2";

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
  });
}

export function blocksFingerprint(blocks: readonly BlockNode[]): string {
  return JSON.stringify(blocks);
}

export function fitCacheKey(options: {
  spellId: string;
  language: string;
  fitMode: CardFitMode;
  fingerprint: string;
}): string {
  return [
    options.spellId,
    options.language,
    options.fitMode,
    CARD_STYLE_VERSION,
    options.fingerprint,
  ].join("\u0000");
}
