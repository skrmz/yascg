import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, RotateCcw } from "lucide-react";
import {
  CORE_CLASSES,
  SPELL_COMPONENT_KEYS,
  SPELL_SCHOOLS,
  type SpellSource,
} from "@/domain/spells";
import { classKey, componentLabelKey, schoolKey, subclassLabel } from "@/locales/labels.ts";
import { subclassParentClass } from "@/domain/subclasses";
import { countActiveAdvancedFilters, type LibraryFilters } from "@/services/data/search.ts";
import { Badge } from "@/ui/Badge.tsx";
import { Button } from "@/ui/Button.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/Collapsible.tsx";
import { MultiSelect } from "@/ui/MultiSelect.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/Select.tsx";
import { cn } from "@/ui/cn.ts";
import { LevelRangeSlider } from "./LevelRangeSlider.tsx";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

export interface LibraryFiltersProps {
  variant: "inline" | "sheet";
  filters: LibraryFilters;
  onPatch: (partial: Partial<LibraryFilters>) => void;
  onReset: () => void;
  castingOptions: readonly string[];
  rangeOptions: readonly string[];
  durationOptions: readonly string[];
  subclassOptions: readonly string[];
  searchInputClassName?: string;
}

export function LibraryFilters({
  variant,
  filters,
  onPatch,
  onReset,
  castingOptions,
  rangeOptions,
  durationOptions,
  subclassOptions,
  searchInputClassName,
}: LibraryFiltersProps) {
  const { t } = useTranslation();
  const advancedCount = countActiveAdvancedFilters(filters);

  const advancedFields = (
    <>
      <div className="space-y-1">
        <MultiSelect
          label={t("library.subclassFilter")}
          aria-label={t("library.subclassFilter")}
          allLabel={t("library.allSubclasses")}
          searchable
          searchPlaceholder={t("library.searchSubclasses")}
          searchInputClassName={searchInputClassName}
          options={subclassOptions}
          selected={filters.subclasses}
          onChange={(subclasses) => onPatch({ subclasses })}
          getLabel={(id) => subclassLabel(id, t)}
          groupBy={subclassParentClass}
          getGroupLabel={(parent) => {
            const key = classKey(parent);
            return key ? t(key) : parent;
          }}
        />
      </div>
      <div className="space-y-1">
        <MultiSelect
          label={t("library.school")}
          aria-label={t("library.school")}
          allLabel={t("library.allSchools")}
          options={SPELL_SCHOOLS}
          selected={filters.schools}
          onChange={(schools) => onPatch({ schools })}
          getLabel={(school) => t(schoolKey(school))}
        />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">{t("library.castingTime")}</span>
        <Select
          value={filters.castingTimes[0] ?? "any"}
          onValueChange={(value) => onPatch({ castingTimes: value === "any" ? [] : [value] })}
        >
          <SelectTrigger aria-label={t("library.castingTime")} className="h-8 text-xs">
            <SelectValue placeholder={t("common.any")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("common.any")}</SelectItem>
            {castingOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">{t("library.range")}</span>
        <Select
          value={filters.ranges[0] ?? "any"}
          onValueChange={(value) => onPatch({ ranges: value === "any" ? [] : [value] })}
        >
          <SelectTrigger aria-label={t("library.range")} className="h-8 text-xs">
            <SelectValue placeholder={t("common.any")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("common.any")}</SelectItem>
            {rangeOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">{t("library.duration")}</span>
        <Select
          value={filters.durations[0] ?? "any"}
          onValueChange={(value) => onPatch({ durations: value === "any" ? [] : [value] })}
        >
          <SelectTrigger aria-label={t("library.duration")} className="h-8 text-xs">
            <SelectValue placeholder={t("common.any")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("common.any")}</SelectItem>
            {durationOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <MultiSelect
          label={t("library.components")}
          aria-label={t("library.components")}
          allLabel={t("library.allComponents")}
          options={SPELL_COMPONENT_KEYS}
          selected={filters.components}
          onChange={(components) => onPatch({ components })}
          getLabel={(component) => t(componentLabelKey(component))}
        />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">{t("library.concentration")}</span>
        <Select
          value={filters.concentration === null ? "any" : filters.concentration ? "yes" : "no"}
          onValueChange={(value) =>
            onPatch({ concentration: value === "any" ? null : value === "yes" })
          }
        >
          <SelectTrigger aria-label={t("library.concentration")} className="h-8 text-xs">
            <SelectValue placeholder={t("common.any")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("common.any")}</SelectItem>
            <SelectItem value="yes">{t("common.yes")}</SelectItem>
            <SelectItem value="no">{t("common.no")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">{t("library.ritual")}</span>
        <Select
          value={filters.ritual === null ? "any" : filters.ritual ? "yes" : "no"}
          onValueChange={(value) => onPatch({ ritual: value === "any" ? null : value === "yes" })}
        >
          <SelectTrigger aria-label={t("library.ritual")} className="h-8 text-xs">
            <SelectValue placeholder={t("common.any")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("common.any")}</SelectItem>
            <SelectItem value="yes">{t("common.yes")}</SelectItem>
            <SelectItem value="no">{t("common.no")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );

  return (
    <div className="space-y-3">
      <LevelRangeSlider value={filters.levels} onChange={(levels) => onPatch({ levels })} />

      <MultiSelect
        label={t("library.classFilter")}
        aria-label={t("library.classFilter")}
        allLabel={t("library.allClasses")}
        searchable
        searchPlaceholder={t("library.searchClasses")}
        searchInputClassName={searchInputClassName}
        options={CORE_CLASSES}
        selected={filters.classes}
        onChange={(classes) => onPatch({ classes })}
        getLabel={(cls) => {
          const key = classKey(cls);
          return key ? t(key) : cls;
        }}
      />

      <div
        role="group"
        aria-label={t("library.source")}
        className="flex flex-wrap items-center gap-1"
      >
        <span className="mr-1 text-xs text-muted-foreground">{t("library.source")}</span>
        <Chip active={filters.sources.length !== 1} onClick={() => onPatch({ sources: [] })}>
          {t("common.all")}
        </Chip>
        {(["SRD-5.2.1", "Custom"] as SpellSource[]).map((source) => (
          <Chip
            key={source}
            active={filters.sources.length === 1 && filters.sources[0] === source}
            onClick={() => onPatch({ sources: [source] })}
          >
            {source === "Custom" ? t("source.custom") : t("source.srdShort")}
          </Chip>
        ))}
      </div>

      <Collapsible defaultOpen={advancedCount > 0} className="space-y-2">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="group w-full justify-between">
            <span>{t("library.advancedFilters")}</span>
            <span className="flex items-center gap-2">
              {advancedCount > 0 ? (
                <Badge>{t("library.activeFilters", { count: advancedCount })}</Badge>
              ) : null}
              <ChevronDown
                size={15}
                aria-hidden="true"
                className="transition-transform group-data-[state=open]:rotate-180"
              />
            </span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2">{advancedFields}</CollapsibleContent>
      </Collapsible>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        {variant === "inline" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            aria-label={t("library.resetFilters")}
          >
            <RotateCcw size={13} aria-hidden="true" />
            {t("library.resetFilters")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
