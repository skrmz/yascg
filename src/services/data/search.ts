import Fuse from "fuse.js";
import type { Spell, SpellSchool, SpellSource } from "@/domain/spells";

export const LEVEL_MIN = 0;
export const LEVEL_MAX = 9;

export interface LevelRange {
  min: number;
  max: number;
}

export interface LibraryFilters {
  levels: LevelRange;
  schools: readonly SpellSchool[];
  classes: readonly string[];
  castingTimes: readonly string[];
  concentration: boolean | null;
  ritual: boolean | null;
  sources: readonly SpellSource[];
}

export const DEFAULT_FILTERS: LibraryFilters = {
  levels: { min: LEVEL_MIN, max: LEVEL_MAX },
  schools: [],
  classes: [],
  castingTimes: [],
  concentration: null,
  ritual: null,
  sources: [],
};

/** Counts the filters hidden inside the Advanced Filters section (casting time, concentration, ritual). */
export function countActiveAdvancedFilters(filters: LibraryFilters): number {
  let count = 0;
  if (filters.castingTimes.length > 0) count += 1;
  if (filters.concentration !== null) count += 1;
  if (filters.ritual !== null) count += 1;
  return count;
}

export function hasActiveAdvancedFilters(filters: LibraryFilters): boolean {
  return countActiveAdvancedFilters(filters) > 0;
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

export function createSearchIndex(spells: readonly Spell[]): Fuse<Spell> {
  return new Fuse(spells, {
    includeScore: true,
    ignoreLocation: true,
    ignoreDiacritics: true,
    threshold: 0.4,
    keys: ["name", "classes", "description"],
  });
}

export function searchSpells(index: Fuse<Spell>, spells: readonly Spell[], query: string): Spell[] {
  const trimmed = query.trim();
  if (trimmed === "") return [...spells];
  return index.search(trimmed).map((result) => result.item);
}

function matchesAnyGroup<T>(selected: readonly T[], value: T): boolean {
  return selected.length === 0 || selected.includes(value);
}

function normalizeCastingTime(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function matchesFilters(spell: Spell, filters: LibraryFilters): boolean {
  if (spell.level < filters.levels.min || spell.level > filters.levels.max) return false;
  if (!matchesAnyGroup(filters.schools, spell.school)) return false;
  if (!matchesAnyGroup(filters.sources, spell.source)) return false;
  if (filters.classes.length > 0) {
    const owns = filters.classes.some((cls) => spell.classes.includes(cls));
    if (!owns) return false;
  }
  if (filters.castingTimes.length > 0) {
    const value = normalizeCastingTime(spell.castingTime);
    if (!filters.castingTimes.some((entry) => normalizeCastingTime(entry) === value)) {
      return false;
    }
  }
  if (filters.concentration !== null && spell.concentration !== filters.concentration) {
    return false;
  }
  if (filters.ritual !== null && spell.ritual !== filters.ritual) return false;
  return true;
}

export function filterSpells(spells: readonly Spell[], filters: LibraryFilters): Spell[] {
  return spells.filter((spell) => matchesFilters(spell, filters));
}

const collators = new Map<string, Intl.Collator>();

export function collatorFor(locale: string): Intl.Collator {
  const cached = collators.get(locale);
  if (cached) return cached;
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  collators.set(locale, collator);
  return collator;
}

export function sortSpells(spells: readonly Spell[], locale: string): Spell[] {
  const collator = collatorFor(locale);
  return [...spells].sort((a, b) => {
    const byName = collator.compare(a.name, b.name);
    if (byName !== 0) return byName;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function deriveClassOptions(customSpells: readonly Spell[]): string[] {
  const set = new Set<string>();
  for (const spell of customSpells) {
    for (const cls of spell.classes) set.add(cls);
  }
  return [...set];
}

export function deriveCastingTimeOptions(spells: readonly Spell[]): string[] {
  const set = new Map<string, string>();
  for (const spell of spells) {
    const key = normalizeCastingTime(spell.castingTime);
    if (!set.has(key)) set.set(key, spell.castingTime.trim());
  }
  return [...set.values()].sort((a, b) => a.localeCompare(b));
}
