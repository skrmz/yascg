import {
  CORE_CLASSES,
  SPELL_SCHOOLS,
  spellSchema,
  type CoreClass,
  type Spell,
  type SpellSchool,
} from "../../src/domain/spells.ts";

export class SrdSourceError extends Error {
  constructor(
    message: string,
    readonly fileName: string,
    readonly sourceIndex?: string,
  ) {
    super(
      sourceIndex === undefined
        ? `[${fileName}] ${message}`
        : `[${fileName}] index "${sourceIndex}": ${message}`,
    );
    this.name = "SrdSourceError";
  }
}

export const SCHOOL_BY_INDEX = new Map<string, SpellSchool>(
  SPELL_SCHOOLS.map((school) => [school.toLowerCase(), school]),
);

export const CLASS_BY_INDEX = new Map<string, CoreClass>(
  CORE_CLASSES.map((cls) => [cls.toLowerCase(), cls]),
);

export const CANONICAL_COMPONENT_LETTERS = new Set(["V", "S", "M"]);

export const GERMAN_CLASS_BY_NAME = new Map<string, CoreClass>([
  ["Barde", "Bard"],
  ["Kleriker", "Cleric"],
  ["Druide", "Druid"],
  ["Paladin", "Paladin"],
  ["Waldläufer", "Ranger"],
  ["Zauberer", "Sorcerer"],
  ["Hexenmeister", "Warlock"],
  ["Magier", "Wizard"],
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireString(
  value: unknown,
  fileName: string,
  sourceIndex: string,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new SrdSourceError(`field "${field}" must be a string`, fileName, sourceIndex);
  }
  return value;
}

export function requireRecord(
  value: unknown,
  fileName: string,
  sourceIndex: string,
  field: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new SrdSourceError(`field "${field}" must be an object`, fileName, sourceIndex);
  }
  return value;
}

export function requireArray(
  value: unknown,
  fileName: string,
  sourceIndex: string,
  field: string,
): unknown[] {
  if (!Array.isArray(value)) {
    throw new SrdSourceError(`field "${field}" must be an array`, fileName, sourceIndex);
  }
  return value;
}

/**
 * Rejects spells that declare no components. Every SRD spell must have at least
 * one of V, S, or M; upstream entries with `components: []` are source errors
 * (historically caused by component data leaking into the `range` field) and are
 * never silently repaired.
 */
export function requireComponents(
  letters: readonly string[],
  fileName: string,
  sourceIndex: string,
): readonly string[] {
  if (letters.length === 0) {
    throw new SrdSourceError(
      `spell must declare at least one component (V, S, or M)`,
      fileName,
      sourceIndex,
    );
  }
  return letters;
}

/**
 * Reads and sanity-checks the `range` field. Upstream sources have shipped range
 * values that accidentally absorbed a component declaration (for example
 * `"Touch Component: V, S"`); such a value is a data error. Legitimate ranges
 * never contain the word "component"/"komponente".
 */
export function requireRange(value: unknown, fileName: string, sourceIndex: string): string {
  const range = requireString(value, fileName, sourceIndex, "range");
  if (/component|komponente/i.test(range)) {
    throw new SrdSourceError(
      `field "range" looks like it contains component data ("${range}"); expected a range such as "Touch" or "60 feet"`,
      fileName,
      sourceIndex,
    );
  }
  return range;
}

export function normalizeDescription(value: unknown): string[] {
  if (value === undefined || value === null) return [""];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : String(item)));
  }
  return [JSON.stringify(value) ?? ""];
}

export function normalizeHigherLevels(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    return value.trim() === "" ? undefined : [value];
  }
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === "string");
    return items.length > 0 ? items : undefined;
  }
  return undefined;
}

export function validateNormalizedSpell(
  spell: Spell,
  fileName: string,
  sourceIndex: string,
): Spell {
  const result = spellSchema.safeParse(spell);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path.join(".") || "spell";
    throw new SrdSourceError(
      `normalized data failed validation on field "${field}": ${first?.message ?? "unknown error"}`,
      fileName,
      sourceIndex,
    );
  }
  return result.data;
}
