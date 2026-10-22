import type { Spell } from "../../src/domain/spells.ts";
import { SrdSourceError } from "./common.ts";

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  for (const item of b) if (!setA.has(item)) return false;
  return true;
}

function conflict(
  fileName: string,
  index: string,
  field: string,
  english: unknown,
  translated: unknown,
): never {
  throw new SrdSourceError(
    `canonical mechanics conflict with English on "${field}" (English=${JSON.stringify(
      english,
    )}, translated=${JSON.stringify(translated)})`,
    fileName,
    index,
  );
}

/**
 * Validates every translated entry against the normalized canonical English set:
 * unknown canonical IDs and conflicting language-independent mechanics fail the
 * build with a filename + index diagnostic. Missing (not-provided) optional
 * mechanics such as damage types are allowed; partial translation coverage is valid.
 */
export function validateTranslation(
  englishById: ReadonlyMap<string, Spell>,
  translation: readonly Spell[],
  fileName: string,
): void {
  for (const spell of translation) {
    const english = englishById.get(spell.id);
    const index = spell.id.replace(/^srd-/, "");
    if (!english) {
      throw new SrdSourceError(
        `unknown canonical English ID "${spell.id}"; translations must reuse the canonical index`,
        fileName,
        index,
      );
    }
    if (spell.level !== english.level) {
      conflict(fileName, index, "level", english.level, spell.level);
    }
    if (spell.school !== english.school) {
      conflict(fileName, index, "school", english.school, spell.school);
    }
    if (spell.concentration !== english.concentration) {
      conflict(fileName, index, "concentration", english.concentration, spell.concentration);
    }
    if (spell.ritual !== english.ritual) {
      conflict(fileName, index, "ritual", english.ritual, spell.ritual);
    }
    if (spell.source !== english.source) {
      conflict(fileName, index, "source", english.source, spell.source);
    }
    if (
      spell.components.verbal !== english.components.verbal ||
      spell.components.somatic !== english.components.somatic ||
      spell.components.material !== english.components.material
    ) {
      conflict(
        fileName,
        index,
        "components",
        {
          verbal: english.components.verbal,
          somatic: english.components.somatic,
          material: english.components.material,
        },
        {
          verbal: spell.components.verbal,
          somatic: spell.components.somatic,
          material: spell.components.material,
        },
      );
    }
    if (spell.components.materialConsumed !== undefined) {
      const englishConsumed = english.components.materialConsumed ?? false;
      if (spell.components.materialConsumed !== englishConsumed) {
        conflict(
          fileName,
          index,
          "components.materialConsumed",
          englishConsumed,
          spell.components.materialConsumed,
        );
      }
    }
    if (!sameSet(spell.classes, english.classes)) {
      conflict(fileName, index, "classes", english.classes, spell.classes);
    }
    if (spell.damageTypes !== undefined && !sameSet(spell.damageTypes, english.damageTypes ?? [])) {
      conflict(fileName, index, "damageTypes", english.damageTypes, spell.damageTypes);
    }
    if (spell.subclasses !== undefined && !sameSet(spell.subclasses, english.subclasses ?? [])) {
      conflict(fileName, index, "subclasses", english.subclasses, spell.subclasses);
    }
    if (spell.subclasses === undefined && english.subclasses !== undefined) {
      // Subclasses are canonical mechanics. A translation that omits them would
      // silently lose subclass availability from the localized dataset, so the
      // English assignments are inherited into the normalized translation.
      spell.subclasses = [...english.subclasses];
    }
    if (spell.savingThrow !== undefined && spell.savingThrow !== english.savingThrow) {
      conflict(fileName, index, "savingThrow", english.savingThrow, spell.savingThrow);
    }
  }
}
