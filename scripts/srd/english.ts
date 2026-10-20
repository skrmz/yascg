import { srdIdForIndex } from "../../src/domain/ids.ts";
import type { CoreClass, Spell, SpellComponents } from "../../src/domain/spells.ts";
import {
  CLASS_BY_INDEX,
  SCHOOL_BY_INDEX,
  SrdSourceError,
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
  for (const item of list) {
    const record = requireRecord(item, fileName, index, "classes[]");
    const classIndex = requireString(record.index, fileName, index, "classes[].index");
    const canonical = CLASS_BY_INDEX.get(classIndex.toLowerCase());
    if (!canonical) {
      throw new SrdSourceError(
        `unknown class index "${classIndex}"; expected a core class`,
        fileName,
        index,
      );
    }
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
  const record = requireRecord(damageType, fileName, index, "damage.damage_type");
  const damageIndex = requireString(record.index, fileName, index, "damage.damage_type.index");
  return [damageIndex.toLowerCase()];
}

export function normalizeEnglishEntry(raw: unknown, fileName: string): Spell {
  const entry = requireRecord(raw, fileName, "(file)", "entry");
  const index = requireString(entry.index, fileName, "(file)", "index");
  const name = requireString(entry.name, fileName, index, "name");
  const level = entry.level;
  if (typeof level !== "number" || !Number.isInteger(level)) {
    throw new SrdSourceError(`field "level" must be an integer`, fileName, index);
  }
  const schoolRecord = requireRecord(entry.school, fileName, index, "school");
  const schoolIndex = requireString(schoolRecord.index, fileName, index, "school.index");
  const school = SCHOOL_BY_INDEX.get(schoolIndex.toLowerCase());
  if (!school) {
    throw new SrdSourceError(`unknown school index "${schoolIndex}"`, fileName, index);
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

  const higherLevels = normalizeHigherLevels(entry.higher_level ?? entry.higher_levels);
  if (higherLevels) spell.higherLevels = higherLevels;

  return validateNormalizedSpell(spell, fileName, index);
}

export function normalizeEnglish(raw: unknown, fileName: string): Spell[] {
  if (!Array.isArray(raw)) {
    throw new SrdSourceError(`top-level JSON must be an array of spells`, fileName);
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

export function isCanonicalSourceShape(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  for (const entry of raw) {
    if (!isRecord(entry)) return false;
    if (typeof entry.index !== "string") return false;
    if (!isRecord(entry.school) || typeof entry.school.index !== "string") return false;
    if (!Array.isArray(entry.classes)) return false;
    for (const cls of entry.classes) {
      if (!isRecord(cls) || typeof cls.index !== "string") return false;
    }
    if (!Array.isArray(entry.components)) return false;
    for (const component of entry.components) {
      if (typeof component !== "string" || !["V", "S", "M"].includes(component)) {
        return false;
      }
    }
  }
  return true;
}
