import { srdIdForIndex } from "../../src/domain/ids.ts";
import type { CoreClass, Spell, SpellComponents } from "../../src/domain/spells.ts";
import {
  GERMAN_CLASS_BY_NAME,
  SCHOOL_BY_INDEX,
  SrdSourceError,
  normalizeDescription,
  normalizeHigherLevels,
  requireArray,
  requireRecord,
  requireString,
  validateNormalizedSpell,
} from "./common.ts";
import { SOURCE_CANONICAL, SOURCE_LABEL } from "./english.ts";

function germanComponents(
  letters: readonly string[],
  materialText: string | undefined,
  fileName: string,
  index: string,
): SpellComponents {
  const components: SpellComponents = {
    verbal: false,
    somatic: false,
    material: false,
  };
  for (const letter of letters) {
    if (letter === "V") components.verbal = true;
    else if (letter === "G") components.somatic = true;
    else if (letter === "M") components.material = true;
    else {
      throw new SrdSourceError(
        `unsupported component "${letter}" (expected V, G, or M)`,
        fileName,
        index,
      );
    }
  }
  if (components.material && materialText && materialText.trim() !== "") {
    components.materialDescription = materialText.trim();
  }
  return components;
}

function germanClasses(rawClasses: unknown, fileName: string, index: string): CoreClass[] {
  const list = requireArray(rawClasses, fileName, index, "classes");
  const classes: CoreClass[] = [];
  for (const item of list) {
    const record = requireRecord(item, fileName, index, "classes[]");
    const name = requireString(record.name, fileName, index, "classes[].name");
    const canonical = GERMAN_CLASS_BY_NAME.get(name.trim());
    if (!canonical) {
      throw new SrdSourceError(
        `unknown German class name "${name}"; add it to the German class map`,
        fileName,
        index,
      );
    }
    classes.push(canonical);
  }
  return classes;
}

export function normalizeGermanEntry(raw: unknown, fileName: string): Spell {
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
    throw new SrdSourceError(`unknown canonical school index "${schoolIndex}"`, fileName, index);
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
    range: requireString(entry.range, fileName, index, "range"),
    components: germanComponents(letters, materialText, fileName, index),
    duration: requireString(entry.duration, fileName, index, "duration"),
    concentration: Boolean(entry.concentration),
    ritual: Boolean(entry.ritual),
    classes: germanClasses(entry.classes, fileName, index),
    description: normalizeDescription(entry.description),
    source: SOURCE_CANONICAL,
    sourceLabel: SOURCE_LABEL,
  };

  const higherLevels = normalizeHigherLevels(entry.higher_levels ?? entry.higher_level);
  if (higherLevels) spell.higherLevels = higherLevels;

  return validateNormalizedSpell(spell, fileName, index);
}

export function normalizeGerman(raw: unknown, fileName: string): Spell[] {
  if (!Array.isArray(raw)) {
    throw new SrdSourceError(`top-level JSON must be an array of spells`, fileName);
  }
  const spells = raw.map((entry) => normalizeGermanEntry(entry, fileName));
  const seen = new Set<string>();
  for (const spell of spells) {
    if (seen.has(spell.id)) {
      throw new SrdSourceError(
        `duplicate index/id "${spell.id.replace(/^srd-/, "")}"`,
        fileName,
        spell.id,
      );
    }
    seen.add(spell.id);
  }
  return spells;
}
