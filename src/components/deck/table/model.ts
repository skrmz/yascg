import type { TFunction } from "i18next";
import { classSummary, materialDetailText } from "@/cards/format.ts";
import { resolveContentLanguage } from "@/content-language.ts";
import { CORE_CLASSES, SPELL_COMPONENT_KEYS, SPELL_SCHOOLS, type Spell } from "@/domain/spells.ts";
import { componentKey, schoolKey, sourceKey, sourceLabelText } from "@/locales/labels.ts";
import { parseSpellBody, type BlockNode, type InlineNode } from "@/markdown/parse.ts";
import type { ResolvedDeckEntry } from "@/state/AppProvider.tsx";

export const DATA_COLUMNS = [
  "name",
  "level",
  "school",
  "classes",
  "components",
  "castingTime",
  "range",
  "duration",
  "concentration",
  "ritual",
  "description",
  "source",
] as const;
export type DataColumn = (typeof DATA_COLUMNS)[number];
export type SortColumn = Exclude<DataColumn, "description">;
export const OPTIONAL_COLUMNS = DATA_COLUMNS.filter((column) => column !== "name");
export const PAGE_SIZES = [10, 25, 50] as const;
export const UNKNOWN = "\u0000unknown";
export const FILTER_FLAGS = ["concentration", "ritual"] as const;
type FlagValue = "any" | "yes" | "no" | typeof UNKNOWN;

export interface TableFilters {
  name: string;
  schools: string[];
  classes: string[];
  concentration: FlagValue;
  ritual: FlagValue;
  castingTime: string;
}

export interface TableSort {
  column: SortColumn;
  direction: "ascending" | "descending";
}

export interface TablePreferences {
  filters: TableFilters;
  sort: TableSort | null;
  columns: DataColumn[];
  fullTable: boolean;
  pageSize: (typeof PAGE_SIZES)[number];
}

const NO_FILTERS: TableFilters = {
  name: "",
  schools: [],
  classes: [],
  concentration: "any",
  ritual: "any",
  castingTime: "",
};

export const DEFAULT_TABLE_PREFERENCES: TablePreferences = {
  filters: NO_FILTERS,
  sort: null,
  columns: ["name", "level", "components", "castingTime", "range", "duration", "concentration"],
  fullTable: false,
  pageSize: 10,
};

const PREFERENCE_KEY = "spellCards.deckTable";

export function canSort(value: unknown): value is SortColumn {
  return value !== "description" && DATA_COLUMNS.some((column) => column === value);
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string"))] : [];
}

function flag(value: unknown): FlagValue {
  return value === "yes" || value === "no" || value === UNKNOWN ? value : "any";
}

export function readTablePreferences(): TablePreferences {
  try {
    const raw = object(JSON.parse(localStorage.getItem(PREFERENCE_KEY) ?? "null"));
    const filters = object(raw.filters);
    const sort = object(raw.sort);
    const savedColumns = strings(raw.columns);
    const columns = Array.isArray(raw.columns)
      ? DATA_COLUMNS.filter((column) => column === "name" || savedColumns.includes(column))
      : DEFAULT_TABLE_PREFERENCES.columns;

    return {
      filters: {
        name: typeof filters.name === "string" ? filters.name : "",
        schools: strings(filters.schools).filter(
          (school) => school === UNKNOWN || SPELL_SCHOOLS.some((value) => value === school),
        ),
        classes: strings(filters.classes).filter(
          (name) => name === UNKNOWN || CORE_CLASSES.some((value) => value === name),
        ),
        concentration: flag(filters.concentration),
        ritual: flag(filters.ritual),
        castingTime:
          typeof filters.castingTime === "string" &&
          (filters.castingTime === UNKNOWN || castingIdentity(filters.castingTime))
            ? filters.castingTime
            : "",
      },
      sort:
        canSort(sort.column) && (sort.direction === "ascending" || sort.direction === "descending")
          ? { column: sort.column, direction: sort.direction }
          : null,
      columns,
      fullTable: raw.fullTable === true,
      pageSize: PAGE_SIZES.find((size) => size === raw.pageSize) ?? 10,
    };
  } catch {
    return DEFAULT_TABLE_PREFERENCES;
  }
}

export function writeTablePreferences(preferences: TablePreferences): void {
  try {
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences));
  } catch {
    // Preference storage is optional. Current session interactions remain available.
  }
}

export function resetTableFilters(preferences: TablePreferences): TablePreferences {
  return { ...preferences, filters: NO_FILTERS, sort: null };
}

export function normalizedText(value: string, language?: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase(language);
}

export interface TableRow {
  id: string;
  spellId: string;
  name: string;
  spell: Spell | null;
  status: "resolved" | "fallback" | "missing";
  language: string;
  contentLanguage: string | undefined;
  castingKey: string;
  values: Record<SortColumn, string | number | boolean | null>;
}

export function makeTableRows(
  entries: readonly ResolvedDeckEntry[],
  englishById: ReadonlyMap<string, Spell>,
  language: string,
  t: TFunction,
): TableRow[] {
  return entries.map(({ entry, resolution }) => {
    const canonical =
      entry.reference.source === "SRD-5.2.1" ? englishById.get(entry.spellId) : undefined;
    const spell = resolution.status === "resolved" ? resolution.spell : (canonical ?? null);
    const status = resolution.status === "resolved" ? "resolved" : spell ? "fallback" : "missing";
    const datasetLanguage = status === "fallback" ? "en" : language;
    const name = spell?.name ?? entry.reference.name;
    const castingTime = spell?.castingTime ?? null;
    return {
      id: entry.entryId,
      spellId: entry.spellId,
      spell,
      name,
      status,
      language: datasetLanguage,
      contentLanguage: spell ? resolveContentLanguage(spell, datasetLanguage) : undefined,
      castingKey: castingTime
        ? `time:${normalizedText(canonical?.castingTime ?? castingTime)}`
        : UNKNOWN,
      values: {
        name,
        level: spell?.level ?? null,
        school: spell ? t(schoolKey(spell.school)) : null,
        classes: spell ? classSummary(spell.classes, t) : null,
        components: spell
          ? activeComponents(spell)
              .map((key) => t(componentKey(key)))
              .join(", ")
          : null,
        castingTime,
        range: spell?.range ?? null,
        duration: spell?.duration ?? null,
        concentration: spell?.concentration ?? null,
        ritual: spell?.ritual ?? null,
        source: spell ? sourceLabelText(spell, t) : t(sourceKey(entry.reference.source)),
      },
    };
  });
}

export function activeComponents(spell: Spell) {
  return SPELL_COMPONENT_KEYS.filter((key) => spell.components[key]);
}

export interface CastingOption {
  id: string;
  label: string;
  normalized: string;
  keys: Set<string>;
}

export function castingOptions(
  rows: readonly TableRow[],
  language: string,
  t: TFunction,
): CastingOption[] {
  const options = new Map<string, CastingOption>();
  for (const row of rows) {
    const label =
      typeof row.values.castingTime === "string"
        ? row.values.castingTime.trim().replace(/\s+/gu, " ")
        : t("deckTable.unknown");
    const normalized = row.castingKey === UNKNOWN ? UNKNOWN : normalizedText(label, language);
    let option = options.get(normalized);
    if (!option) {
      option = { id: "", label, normalized, keys: new Set() };
      options.set(normalized, option);
    }
    option.keys.add(row.castingKey);
  }
  for (const option of options.values()) {
    option.id =
      option.normalized === UNKNOWN
        ? UNKNOWN
        : JSON.stringify([option.normalized, [...option.keys].sort()[0]]);
  }
  return [...options.values()].sort((a, b) => {
    if (a.id === UNKNOWN) return 1;
    if (b.id === UNKNOWN) return -1;
    return a.label.localeCompare(b.label, language);
  });
}

function castingIdentity(value: string): [string, string] | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && typeof parsed[0] === "string" && typeof parsed[1] === "string") {
      return [parsed[0], parsed[1]];
    }
  } catch {
    // Ignore obsolete values.
  }
}

export function getCastingOption(options: readonly CastingOption[], value: string) {
  const exact = options.find((option) => option.id === value);
  if (exact) return exact;
  const identity = castingIdentity(value);
  if (!identity) return undefined;
  return (
    options.find(({ normalized }) => normalized === identity[0]) ??
    options.find(({ keys }) => keys.has(identity[1]))
  );
}

export function castingFilterFallback(value: string, t: TFunction): string {
  return castingIdentity(value)?.[0] ?? t("deckTable.unknown");
}

export function filterTableRows(
  rows: readonly TableRow[],
  filters: TableFilters,
  casting: readonly CastingOption[],
  language: string,
): TableRow[] {
  const needle = normalizedText(filters.name, language);
  const castingChoice = getCastingOption(casting, filters.castingTime);
  return rows.filter((row) => {
    const { spell } = row;
    if (needle && !normalizedText(row.name, language).includes(needle)) return false;
    if (filters.schools.length && !filters.schools.includes(spell?.school ?? UNKNOWN)) return false;
    if (
      filters.classes.length &&
      !(spell
        ? spell.classes.some((name) => filters.classes.includes(name))
        : filters.classes.includes(UNKNOWN))
    )
      return false;
    if (filters.castingTime) {
      const castingValue =
        row.castingKey === UNKNOWN || !spell
          ? UNKNOWN
          : normalizedText(spell.castingTime, language);
      if (castingValue !== castingChoice?.normalized) return false;
    }
    return FILTER_FLAGS.every((field) => {
      const selected = filters[field];
      if (selected === "any") return true;
      const value = spell?.[field];
      return selected === UNKNOWN ? value === undefined : value === (selected === "yes");
    });
  });
}

export function sortTableRows(
  rows: TableRow[],
  sort: TableSort | null,
  language: string,
): TableRow[] {
  if (!sort) return rows;
  const collator = new Intl.Collator(language, { numeric: true, sensitivity: "base" });
  return rows.toSorted((a, b) => {
    const first = a.values[sort.column];
    const second = b.values[sort.column];
    if (first === null) return second === null ? 0 : 1;
    if (second === null) return -1;
    const delta =
      typeof first === "string" && typeof second === "string"
        ? collator.compare(first, second)
        : Number(first) - Number(second);
    return sort.direction === "ascending" ? delta : -delta;
  });
}

export function setMatchingSelection(
  previous: ReadonlySet<string>,
  ids: readonly string[],
  checked: boolean,
): Set<string> {
  const next = new Set(previous);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function reconcileSelection(previous: Set<string>, valid: ReadonlySet<string>): Set<string> {
  const remaining = [...previous].filter((id) => valid.has(id));
  return remaining.length === previous.size ? previous : new Set(remaining);
}

function inlineText(nodes: InlineNode[]): string {
  return nodes.map(({ value }) => value).join("");
}

function blockText(block: BlockNode): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return inlineText(block.children);
    case "code":
      return block.value;
    case "blockquote":
      return block.children.map(blockText).join("\n");
    case "table":
      return [block.header, ...block.rows].map((row) => row.map(inlineText).join(" | ")).join("\n");
    case "list":
      return block.items
        .map((item, index) => {
          const marker = block.ordered ? `${(block.start ?? 1) + index}.` : "•";
          const nested = block.sublists?.[index] ?? [];
          return [`${marker} ${inlineText(item)}`, ...nested.map(blockText)].join("\n");
        })
        .join("\n");
    case "hr":
      return "";
  }
}

export function rowNote(row: TableRow, t: TFunction): string {
  if (row.status === "fallback") return t("deckTable.englishFallback");
  if (row.status === "missing") return t("deckTable.unresolved");
  return "";
}

export function cellText(row: TableRow, column: DataColumn, t: TFunction): string {
  if (column === "description") {
    if (!row.spell) return "—";
    return (
      parseSpellBody(row.spell, t("spell.higherLevels"), {
        verbal: t(componentKey("verbal")),
        somatic: t(componentKey("somatic")),
      })
        .map(blockText)
        .join("\n\n")
        .trim() || "—"
    );
  }
  const value = row.values[column];
  if (value === null) return "—";
  if (typeof value === "boolean") return t(value ? "common.yes" : "common.no");
  return value === "" ? t("deckTable.none") : String(value);
}

export function printableCells(row: TableRow, columns: DataColumn[], t: TFunction) {
  return Object.fromEntries(
    columns.map((column) => {
      const text = cellText(row, column, t);
      const detail =
        column === "name"
          ? rowNote(row, t)
          : column === "components" && row.spell
            ? materialDetailText(row.spell, t)
            : null;
      return [column, detail ? `${text}\n${detail}` : text];
    }),
  );
}
