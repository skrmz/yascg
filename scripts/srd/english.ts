import { srdIdForIndex } from "../../src/domain/ids.ts";
import type { CoreClass, Spell, SpellComponents } from "../../src/domain/spells.ts";
import {
  CANONICAL_COMPONENT_LETTERS,
  CANONICAL_DAMAGE_TYPES,
  CLASS_BY_NAME,
  SCHOOL_BY_NAME,
  SrdSourceError,
  canonicalSubclasses,
  isRecord,
  normalizeDescription,
  normalizeHigherLevels,
  requireArray,
  requireComponents,
  requireRange,
  requireRecord,
  requireString,
  validateNormalizedSpell,
} from "./common.ts";

export const SOURCE_CANONICAL = "SRD-5.2.1" as const;
export const SOURCE_LABEL = "SRD 5.2.1" as const;

/** Actionable error for the pre-refactoring 5e-bits source shape. */
export const MIGRATION_HINT =
  'legacy 5e-bits raw source shape detected (object "school.index"); migrate the raw sources first with "pnpm exec tsx scripts/migrate-srd-source-format.ts --apply"';

function componentFlags(
  letters: readonly string[],
  materialText: string | undefined,
  fileName: string,
  index: string,
): SpellComponents {
  requireComponents(letters, fileName, index);
  const set = new Set(letters);
  for (const letter of letters) {
    if (letter !== "V" && letter !== "S" && letter !== "M") {
      throw new SrdSourceError(
        `unsupported component "${letter}" (expected V, S, or M)`,
        fileName,
        index,
      );
    }
  }
  const material = set.has("M");
  const components: SpellComponents = {
    verbal: set.has("V"),
    somatic: set.has("S"),
    material,
  };
  if (material && materialText && materialText.trim() !== "") {
    components.materialDescription = materialText.trim();
  }
  return components;
}

function canonicalClasses(rawClasses: unknown, fileName: string, index: string): CoreClass[] {
  const list = requireArray(rawClasses, fileName, index, "classes");
  const classes: CoreClass[] = [];
  const seen = new Set<CoreClass>();
  for (const item of list) {
    const name = requireString(item, fileName, index, "classes[]");
    const canonical = CLASS_BY_NAME.get(name.toLowerCase());
    if (!canonical) {
      throw new SrdSourceError(
        `unknown class "${name}"; expected a canonical core class name`,
        fileName,
        index,
      );
    }
    if (seen.has(canonical)) {
      throw new SrdSourceError(`duplicate class "${canonical}"`, fileName, index);
    }
    seen.add(canonical);
    classes.push(canonical);
  }
  return classes;
}

function canonicalDamageTypes(
  rawDamage: unknown,
  fileName: string,
  index: string,
): string[] | undefined {
  if (rawDamage === undefined || rawDamage === null) return undefined;
  const damage = requireRecord(rawDamage, fileName, index, "damage");
  const damageType = damage.damage_type;
  if (damageType === undefined || damageType === null) return undefined;
  const rawSlug = requireString(damageType, fileName, index, "damage.damage_type");
  const slug = rawSlug.toLowerCase();
  if (!CANONICAL_DAMAGE_TYPES.has(slug)) {
    throw new SrdSourceError(
      `unknown damage type "${rawSlug}"; expected a canonical damage slug`,
      fileName,
      index,
    );
  }
  return [slug];
}

export function normalizeEnglishEntry(raw: unknown, fileName: string): Spell {
  const entry = requireRecord(raw, fileName, "(file)", "entry");
  const index = requireString(entry.index, fileName, "(file)", "index");
  const name = requireString(entry.name, fileName, index, "name");
  const level = entry.level;
  if (typeof level !== "number" || !Number.isInteger(level)) {
    throw new SrdSourceError(`field "level" must be an integer`, fileName, index);
  }
  const schoolName = requireString(entry.school, fileName, index, "school");
  const school = SCHOOL_BY_NAME.get(schoolName.toLowerCase());
  if (!school) {
    throw new SrdSourceError(
      `unknown school "${schoolName}"; expected a canonical school name`,
      fileName,
      index,
    );
  }

  const rawComponents = requireArray(entry.components, fileName, index, "components");
  const letters = rawComponents.map((value) =>
    requireString(value, fileName, index, "components[]"),
  );
  const materialText = typeof entry.material === "string" ? entry.material : undefined;

  const spell: Spell = {
    id: srdIdForIndex(index),
    name,
    level,
    school,
    castingTime: requireString(entry.casting_time, fileName, index, "casting_time"),
    range: requireRange(entry.range, fileName, index),
    components: componentFlags(letters, materialText, fileName, index),
    duration: requireString(entry.duration, fileName, index, "duration"),
    concentration: Boolean(entry.concentration),
    ritual: Boolean(entry.ritual),
    classes: canonicalClasses(entry.classes, fileName, index),
    description: normalizeDescription(entry.description),
    source: SOURCE_CANONICAL,
    sourceLabel: SOURCE_LABEL,
  };

  const damageTypes = canonicalDamageTypes(entry.damage, fileName, index);
  if (damageTypes) spell.damageTypes = damageTypes;

  const subclasses = canonicalSubclasses(entry.subclasses, fileName, index);
  if (subclasses) spell.subclasses = subclasses;

  const higherLevels = normalizeHigherLevels(entry.higher_level ?? entry.higher_levels);
  if (higherLevels) spell.higherLevels = higherLevels;

  return validateNormalizedSpell(spell, fileName, index);
}

export function normalizeEnglish(raw: unknown, fileName: string): Spell[] {
  if (!Array.isArray(raw)) {
    throw new SrdSourceError(`top-level JSON must be an array of spells`, fileName);
  }
  if (isLegacySourceShape(raw)) {
    throw new SrdSourceError(MIGRATION_HINT, fileName);
  }
  const spells = raw.map((entry) => normalizeEnglishEntry(entry, fileName));
  assertUnique(spells, fileName);
  return spells;
}

function assertUnique(spells: readonly Spell[], fileName: string): void {
  const seenIds = new Set<string>();
  for (const spell of spells) {
    const index = spell.id.replace(/^srd-/, "");
    if (seenIds.has(spell.id)) {
      throw new SrdSourceError(`duplicate index/id "${index}"`, fileName, index);
    }
    seenIds.add(spell.id);
  }
}

/**
 * Detects the pre-refactoring 5e-bits shape (object `school.index`). Legacy
 * sources are never parsed; callers fail with {@link MIGRATION_HINT}.
 */
export function isLegacySourceShape(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  return raw.some(
    (entry) => isRecord(entry) && isRecord(entry.school) && typeof entry.school.index === "string",
  );
}

/**
 * Probes the canonical (post-refactoring) raw source shape: string `school`,
 * `classes` as canonical name strings, and `V`/`S`/`M` component letters.
 */
export function isCanonicalSourceShape(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  for (const entry of raw) {
    if (!isRecord(entry)) return false;
    if (typeof entry.index !== "string") return false;
    if (typeof entry.school !== "string") return false;
    if (!Array.isArray(entry.classes)) return false;
    for (const cls of entry.classes) {
      if (typeof cls !== "string") return false;
    }
    if (!Array.isArray(entry.components)) return false;
    for (const component of entry.components) {
      if (typeof component !== "string" || !CANONICAL_COMPONENT_LETTERS.has(component)) {
        return false;
      }
    }
  }
  return true;
}
