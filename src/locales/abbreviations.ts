import type { TFunction } from "i18next";
import type { CharacterClass, CoreClass, SpellComponentKey, SpellSchool } from "@/domain/spells";
import type { AbbreviationDefinition } from "./abbreviation-types.ts";
import { de } from "./de.ts";
import { en } from "./en.ts";

/** Stable semantic identifiers from either abbreviation catalog. */
export type AbbreviationId = keyof typeof en.abbreviations | keyof typeof de.abbreviations;

/** Identifiers used by structured UI lookups must exist in both catalogs. */
export type SharedAbbreviationId = keyof typeof en.abbreviations & keyof typeof de.abbreviations;

export type AbbreviationLocale = "en" | "de";

export interface AbbreviationEntry {
  id: AbbreviationId;
  full: string;
  short: string;
  forms: readonly string[];
  quantityPrefix?: boolean;
  timeUnit?: boolean;
}

export interface AbbreviationSurfaceConflict {
  surface: string;
  shorts: readonly string[];
  ids: readonly AbbreviationId[];
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
} as const satisfies Record<SpellSchool, SharedAbbreviationId>;

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
} as const satisfies Record<CoreClass, SharedAbbreviationId>;

export const COMPONENT_ABBREVIATION_IDS = {
  verbal: "verbalComponent",
  somatic: "somaticComponent",
  material: "materialComponent",
} as const satisfies Record<SpellComponentKey, SharedAbbreviationId>;

function translate(t: TFunction, key: string): string {
  return (t as unknown as (messageKey: string) => string)(key);
}

export function abbreviationShort(id: SharedAbbreviationId, t: TFunction): string {
  return translate(t, `abbreviations.${id}.short`);
}

export function abbreviationFull(id: SharedAbbreviationId, t: TFunction): string {
  return translate(t, `abbreviations.${id}.full`);
}

export function schoolAbbreviation(school: SpellSchool): SharedAbbreviationId {
  return SCHOOL_ABBREVIATION_IDS[school];
}

export function classAbbreviation(name: CharacterClass): SharedAbbreviationId | null {
  return Object.hasOwn(CLASS_ABBREVIATION_IDS, name)
    ? CLASS_ABBREVIATION_IDS[name as CoreClass]
    : null;
}

export function componentAbbreviation(component: SpellComponentKey): SharedAbbreviationId {
  return COMPONENT_ABBREVIATION_IDS[component];
}

const EXCLUDED_EN: ReadonlySet<AbbreviationId> = new Set([
  "turn",
  "speed",
  "presumably",
  "possibly",
  "inPart",
]);

const EXCLUDED_DE: ReadonlySet<AbbreviationId> = new Set([
  "turn",
  "presumably",
  "or",
  "diameter",
  "cube",
]);

export const EXCLUDED_ABBREVIATION_IDS: Record<AbbreviationLocale, ReadonlySet<AbbreviationId>> = {
  en: EXCLUDED_EN,
  de: EXCLUDED_DE,
};

function generatedForms(definition: AbbreviationDefinition): readonly string[] {
  return [
    ...new Set([
      definition.full,
      ...(definition.suffixes ?? []).map((suffix) => definition.full + suffix),
      ...(definition.forms ?? []),
    ]),
  ];
}

function catalogEntries(
  source: Readonly<Record<string, AbbreviationDefinition>>,
): readonly AbbreviationEntry[] {
  return Object.entries(source).map(([id, definition]) => ({
    id: id as AbbreviationId,
    full: definition.full,
    short: definition.short,
    forms: generatedForms(definition),
    quantityPrefix: definition.quantityPrefix,
    timeUnit: definition.timeUnit,
  }));
}

const CATALOGS: Record<AbbreviationLocale, readonly AbbreviationEntry[]> = {
  en: catalogEntries(en.abbreviations),
  de: catalogEntries(de.abbreviations),
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

/**
 * Reports generated surfaces that map to different shorts. Ambiguous surfaces
 * are a catalog bug, not something the matcher resolves by definition order.
 */
export function findAbbreviationSurfaceConflicts(
  entries: readonly AbbreviationEntry[],
  locale: AbbreviationLocale,
): readonly AbbreviationSurfaceConflict[] {
  const bySurface = new Map<string, { shorts: Set<string>; ids: Set<AbbreviationId> }>();
  for (const entry of entries) {
    const short = entry.short.trim();
    for (const form of entry.forms) {
      const surface = form.toLocaleLowerCase(locale).normalize("NFC");
      const record = bySurface.get(surface) ?? { shorts: new Set(), ids: new Set() };
      record.shorts.add(short);
      record.ids.add(entry.id);
      bySurface.set(surface, record);
    }
  }

  return [...bySurface.entries()]
    .filter(([, record]) => record.shorts.size > 1)
    .map(([surface, record]) => ({
      surface,
      shorts: [...record.shorts].sort(),
      ids: [...record.ids].sort(),
    }));
}
