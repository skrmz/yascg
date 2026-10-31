import type { TFunction } from "i18next";
import type { CharacterClass, CoreClass, SpellComponentKey, SpellSchool } from "@/domain/spells";
import { en } from "./en.ts";

/** Stable semantic identifiers from the active-language abbreviation catalog. */
export type AbbreviationId = keyof typeof en.abbreviations;

export const SCHOOL_ABBREVIATION_IDS = {
  Abjuration: "abjuration",
  Conjuration: "conjuration",
  Divination: "divination",
  Enchantment: "enchantment",
  Evocation: "evocation",
  Illusion: "illusion",
  Necromancy: "necromancy",
  Transmutation: "transmutation",
} as const satisfies Record<SpellSchool, AbbreviationId>;

export const CLASS_ABBREVIATION_IDS = {
  Barbarian: "barbarian",
  Bard: "bard",
  Cleric: "cleric",
  Druid: "druid",
  Fighter: "fighter",
  Monk: "monk",
  Paladin: "paladin",
  Ranger: "ranger",
  Rogue: "rogue",
  Sorcerer: "sorcerer",
  Warlock: "warlock",
  Wizard: "wizard",
} as const satisfies Record<CoreClass, AbbreviationId>;

export const COMPONENT_ABBREVIATION_IDS = {
  verbal: "verbalComponent",
  somatic: "somaticComponent",
  material: "materialComponent",
} as const satisfies Record<SpellComponentKey, AbbreviationId>;

function translate(t: TFunction, key: string): string {
  return (t as unknown as (messageKey: string) => string)(key);
}

export function abbreviationShort(id: AbbreviationId, t: TFunction): string {
  return translate(t, `abbreviations.${id}.short`);
}

export function abbreviationFull(id: AbbreviationId, t: TFunction): string {
  return translate(t, `abbreviations.${id}.full`);
}

export function schoolAbbreviation(school: SpellSchool): AbbreviationId {
  return SCHOOL_ABBREVIATION_IDS[school];
}

export function classAbbreviation(name: CharacterClass): AbbreviationId | null {
  return Object.hasOwn(CLASS_ABBREVIATION_IDS, name)
    ? CLASS_ABBREVIATION_IDS[name as CoreClass]
    : null;
}

export function componentAbbreviation(component: SpellComponentKey): AbbreviationId {
  return COMPONENT_ABBREVIATION_IDS[component];
}
