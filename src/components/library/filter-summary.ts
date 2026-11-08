import type { SpellComponentKey, SpellSchool, SpellSource } from "@/domain/spells";
import {
  DEFAULT_FILTERS,
  LEVEL_MAX,
  LEVEL_MIN,
  type LevelRange,
  type LibraryFilters,
} from "@/services/data/search.ts";

export interface ActiveFilterChip {
  key: string;
  label: string;
  clear: Partial<LibraryFilters>;
}

export interface MultiValueFilterLabel<T> {
  group: string;
  value: (value: T) => string;
}

export interface BooleanFilterLabel {
  group: string;
  yes: string;
  no: string;
}

export interface FilterChipLabels {
  levels: (range: LevelRange) => string;
  classes: MultiValueFilterLabel<string>;
  subclasses: MultiValueFilterLabel<string>;
  schools: MultiValueFilterLabel<SpellSchool>;
  castingTimes: MultiValueFilterLabel<string>;
  ranges: MultiValueFilterLabel<string>;
  durations: MultiValueFilterLabel<string>;
  components: MultiValueFilterLabel<SpellComponentKey>;
  concentration: BooleanFilterLabel;
  ritual: BooleanFilterLabel;
  sources: MultiValueFilterLabel<SpellSource>;
  multiValue: (label: string, count: number) => string;
}

function summarize<T>(
  values: readonly T[],
  labels: FilterChipLabels,
  group: MultiValueFilterLabel<T>,
) {
  const first = group.value(values[0]);
  const summary = values.length > 1 ? labels.multiValue(first, values.length - 1) : first;
  return `${group.group}: ${summary}`;
}

/**
 * One removable chip per active, non-default filter group. Clearing a chip
 * resets only that group; the search query is never part of the model.
 */
export function buildActiveFilterChips(
  filters: LibraryFilters,
  labels: FilterChipLabels,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (filters.levels.min !== LEVEL_MIN || filters.levels.max !== LEVEL_MAX) {
    chips.push({
      key: "levels",
      label: labels.levels(filters.levels),
      clear: { levels: DEFAULT_FILTERS.levels },
    });
  }
  if (filters.classes.length > 0) {
    chips.push({
      key: "classes",
      label: summarize(filters.classes, labels, labels.classes),
      clear: { classes: [] },
    });
  }
  if (filters.subclasses.length > 0) {
    chips.push({
      key: "subclasses",
      label: summarize(filters.subclasses, labels, labels.subclasses),
      clear: { subclasses: [] },
    });
  }
  if (filters.schools.length > 0) {
    chips.push({
      key: "schools",
      label: summarize(filters.schools, labels, labels.schools),
      clear: { schools: [] },
    });
  }
  if (filters.castingTimes.length > 0) {
    chips.push({
      key: "castingTimes",
      label: summarize(filters.castingTimes, labels, labels.castingTimes),
      clear: { castingTimes: [] },
    });
  }
  if (filters.ranges.length > 0) {
    chips.push({
      key: "ranges",
      label: summarize(filters.ranges, labels, labels.ranges),
      clear: { ranges: [] },
    });
  }
  if (filters.durations.length > 0) {
    chips.push({
      key: "durations",
      label: summarize(filters.durations, labels, labels.durations),
      clear: { durations: [] },
    });
  }
  if (filters.components.length > 0) {
    chips.push({
      key: "components",
      label: summarize(filters.components, labels, labels.components),
      clear: { components: [] },
    });
  }
  if (filters.concentration !== null) {
    chips.push({
      key: "concentration",
      label: `${labels.concentration.group}: ${
        filters.concentration ? labels.concentration.yes : labels.concentration.no
      }`,
      clear: { concentration: null },
    });
  }
  if (filters.ritual !== null) {
    chips.push({
      key: "ritual",
      label: `${labels.ritual.group}: ${filters.ritual ? labels.ritual.yes : labels.ritual.no}`,
      clear: { ritual: null },
    });
  }
  if (filters.sources.length === 1) {
    chips.push({
      key: "sources",
      label: summarize(filters.sources, labels, labels.sources),
      clear: { sources: [] },
    });
  }

  return chips;
}
