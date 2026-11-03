import type { TFunction } from "i18next";
import type { CharacterClass, CoreClass, SpellComponentKey, SpellSchool } from "@/domain/spells";
import { de } from "./de.ts";
import { en } from "./en.ts";

/** Stable semantic identifiers from the active-language abbreviation catalog. */
export type AbbreviationId = keyof typeof en.abbreviations;

export type AbbreviationLocale = "en" | "de";

export interface AbbreviationEntry {
  id: AbbreviationId;
  full: string;
  short: string;
}

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

const EXCLUDED_EN: ReadonlySet<AbbreviationId> = new Set([
  "round",
  "turn",
  "line",
  "speed",
  "advantage",
  "disadvantage",
  "target",
  "object",
  "objects",
  "bonus",
  "minimum",
  "maximum",
  "example",
  "presumably",
  "compare",
  "possibly",
  "inPart",
  "or",
  "between",
]);

const EXCLUDED_DE: ReadonlySet<AbbreviationId> = new Set([
  "round",
  "turn",
  "line",
  "advantage",
  "disadvantage",
  "target",
  "object",
  "objects",
  "bonus",
  "minimum",
  "maximum",
  "presumably",
  "compare",
  "or",
  "between",
  "diameter",
  "cube",
]);

export const EXCLUDED_ABBREVIATION_IDS: Record<AbbreviationLocale, ReadonlySet<AbbreviationId>> = {
  en: EXCLUDED_EN,
  de: EXCLUDED_DE,
};

function catalogEntries(
  source: Record<AbbreviationId, { readonly full: string; readonly short: string }>,
): readonly AbbreviationEntry[] {
  return Object.entries(source).map(([id, entry]) => ({
    id: id as AbbreviationId,
    full: entry.full,
    short: entry.short,
  }));
}

const CATALOGS: Record<AbbreviationLocale, readonly AbbreviationEntry[]> = {
  en: catalogEntries(en.abbreviations),
  de: catalogEntries(de.abbreviations as Record<AbbreviationId, { full: string; short: string }>),
};

/**
 * Returns the abbreviation catalog only for exact `en`/`de` locale codes.
 * Prose matching must not fall back to English for other languages.
 */
export function abbreviationCatalog(locale: string): readonly AbbreviationEntry[] | null {
  return locale === "en" || locale === "de" ? CATALOGS[locale] : null;
}

export function isAbbreviationEligible(
  entry: AbbreviationEntry,
  locale: AbbreviationLocale,
): boolean {
  const full = entry.full.trim();
  const short = entry.short.trim();
  return (
    full !== short && short.length < full.length && !EXCLUDED_ABBREVIATION_IDS[locale].has(entry.id)
  );
}
