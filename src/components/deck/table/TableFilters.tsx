import { useTranslation } from "react-i18next";
import { CORE_CLASSES, SPELL_SCHOOLS, type SpellSchool } from "@/domain/spells.ts";
import { classKey, schoolKey } from "@/locales/labels.ts";
import { MultiSelect } from "@/ui/MultiSelect.tsx";
import {
  FILTER_FLAGS,
  UNKNOWN,
  castingFilterFallback,
  getCastingOption,
  type CastingOption,
  type TableFilters as Filters,
} from "./model.ts";
import type { TFunction } from "i18next";

export function schoolLabel(school: string, t: TFunction): string {
  return school === UNKNOWN ? t("deckTable.unknown") : t(schoolKey(school as SpellSchool));
}

export function classLabel(name: string, t: TFunction): string {
  if (name === UNKNOWN) return t("deckTable.unknown");
  const key = classKey(name);
  return key ? t(key) : name;
}

export function flagLabel(flag: Filters["concentration"], t: TFunction): string {
  return flag === UNKNOWN ? t("deckTable.unknown") : t(`common.${flag}`);
}

export function summarizeFilters(
  filters: Filters,
  casting: CastingOption[],
  t: TFunction,
): string[] {
  const summary: string[] = [];
  const add = (label: string, value: string) =>
    summary.push(t("deckTable.filterSummary", { label, value }));
  if (filters.name.trim()) add(t("deckTable.column.name"), filters.name.trim());
  if (filters.schools.length)
    add(
      t("deckTable.column.school"),
      filters.schools.map((school) => schoolLabel(school, t)).join(", "),
    );
  if (filters.classes.length)
    add(
      t("deckTable.column.classes"),
      filters.classes.map((name) => classLabel(name, t)).join(", "),
    );
  for (const field of FILTER_FLAGS) {
    if (filters[field] !== "any") add(t(`deckTable.column.${field}`), flagLabel(filters[field], t));
  }
  if (filters.castingTime)
    add(
      t("deckTable.column.castingTime"),
      getCastingOption(casting, filters.castingTime)?.label ??
        castingFilterFallback(filters.castingTime, t),
    );
  return summary;
}

export function TableFilters({
  filters,
  casting,
  hasUnknown,
  classes,
  onPatch,
}: {
  filters: Filters;
  casting: CastingOption[];
  hasUnknown: boolean;
  classes: readonly string[];
  onPatch: (patch: Partial<Filters>) => void;
}) {
  const { t } = useTranslation();
  const castingValue = getCastingOption(casting, filters.castingTime)?.id ?? filters.castingTime;
  const activeCount =
    Number(filters.schools.length > 0) +
    Number(filters.classes.length > 0) +
    Number(filters.castingTime !== "") +
    FILTER_FLAGS.filter((flag) => filters[flag] !== "any").length;

  return (
    <details className="deck-table-filters">
      <summary>
        {t("deckTable.filters")}
        {activeCount > 0 ? ` · ${t("library.activeFilters", { count: activeCount })}` : ""}
      </summary>
      <div className="deck-table-filter-controls">
        <MultiSelect
          label={t("deckTable.column.school")}
          options={
            hasUnknown || filters.schools.includes(UNKNOWN)
              ? [...SPELL_SCHOOLS, UNKNOWN]
              : SPELL_SCHOOLS
          }
          selected={filters.schools}
          getLabel={(school) => schoolLabel(school, t)}
          onChange={(schools) => onPatch({ schools })}
          className="deck-table-multiselect"
        />
        <MultiSelect
          label={t("deckTable.column.classes")}
          options={[
            ...new Set([
              ...CORE_CLASSES,
              ...classes,
              ...filters.classes,
              ...(hasUnknown ? [UNKNOWN] : []),
            ]),
          ]}
          selected={filters.classes}
          getLabel={(name) => classLabel(name, t)}
          onChange={(selected) => onPatch({ classes: selected })}
          className="deck-table-multiselect"
          searchable
        />
        {FILTER_FLAGS.map((field) => (
          <label key={field} className="deck-table-field">
            {t(`deckTable.column.${field}`)}
            <select
              name={field}
              value={filters[field]}
              onChange={(event) => onPatch({ [field]: event.target.value })}
            >
              <option value="any">{t("common.any")}</option>
              <option value="yes">{t("common.yes")}</option>
              <option value="no">{t("common.no")}</option>
              {hasUnknown || filters[field] === UNKNOWN ? (
                <option value={UNKNOWN}>{t("deckTable.unknown")}</option>
              ) : null}
            </select>
          </label>
        ))}
        <label className="deck-table-field">
          {t("deckTable.column.castingTime")}
          <select
            name="castingTime"
            value={castingValue}
            onChange={(event) => onPatch({ castingTime: event.target.value })}
          >
            <option value="">{t("common.any")}</option>
            {castingValue && !casting.some(({ id }) => id === castingValue) ? (
              <option value={castingValue}>{castingFilterFallback(castingValue, t)}</option>
            ) : null}
            {casting.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </details>
  );
}
