import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Plus, RotateCcw, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/state/AppProvider.tsx";
import { resolveContentLanguage } from "@/content-language.ts";
import { classKey, componentLabelKey, levelLabelKey, schoolKey } from "@/locales/labels.ts";
import {
  CORE_CLASSES,
  SPELL_COMPONENT_KEYS,
  SPELL_SCHOOLS,
  type Spell,
  type SpellSource,
} from "@/domain/spells";
import {
  DEFAULT_FILTERS,
  countActiveAdvancedFilters,
  deriveCastingTimeOptions,
  deriveDurationOptions,
  deriveRangeOptions,
  filterSpells,
  searchSpells,
  sortSpells,
  type LibraryFilters,
} from "@/services/data/search.ts";
import { Button } from "@/ui/Button.tsx";
import { Badge, SourceBadge } from "@/ui/Badge.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/Collapsible.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { Input } from "@/ui/Field.tsx";
import { MultiSelect } from "@/ui/MultiSelect.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/Select.tsx";
import { Separator } from "@/ui/Separator.tsx";
import { cn } from "@/ui/cn.ts";
import { CustomSpellForm } from "@/components/details/CustomSpellForm.tsx";
import { CustomSpellImportExportDialog } from "@/components/import-export/CustomSpellImportExportDialog.tsx";
import { LevelRangeSlider } from "./LevelRangeSlider.tsx";

function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

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

export function LibraryPane() {
  const {
    librarySpells,
    languageSpells,
    language,
    addSpellToDeck,
    addSpellsToDeck,
    replaceDeckWithSpells,
    selectSpell,
    selectedSpellId,
  } = useApp();
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [creating, setCreating] = useState(false);
  const [customIoOpen, setCustomIoOpen] = useState(false);

  const searched = useMemo(() => searchSpells(librarySpells, query), [librarySpells, query]);
  const results = useMemo(
    () => sortSpells(filterSpells(searched, filters), language),
    [searched, filters, language],
  );

  // REVIEW: Data-derived option lists intentionally use the localized SRD dataset only.
  // Custom spells keep author-written values across language switches, so deriving from
  // `librarySpells` mixed languages in these selects (e.g. "Action" and "Aktion").
  const castingOptions = useMemo(() => deriveCastingTimeOptions(languageSpells), [languageSpells]);
  const rangeOptions = useMemo(() => deriveRangeOptions(languageSpells), [languageSpells]);
  const durationOptions = useMemo(() => deriveDurationOptions(languageSpells), [languageSpells]);
  const advancedCount = countActiveAdvancedFilters(filters);

  const patch = (partial: Partial<LibraryFilters>) =>
    setFilters((previous) => ({ ...previous, ...partial }));

  useEffect(() => {
    setFilters((previous) =>
      previous.castingTimes.length === 0 &&
      previous.ranges.length === 0 &&
      previous.durations.length === 0
        ? previous
        : { ...previous, castingTimes: [], ranges: [], durations: [] },
    );
  }, [language]);

  const resetAll = () => {
    setQuery("");
    setFilters(DEFAULT_FILTERS);
  };

  const onAdd = async (spell: Spell) => {
    const result = await addSpellToDeck(spell);
    if (result === "added") selectSpell(spell.id);
    if (result === "duplicate") {
      toast.info(t("library.toast.alreadyTitle"), {
        description: t("library.toast.alreadyDescription", { name: spell.name }),
      });
    }
  };

  const onAppendAll = async () => {
    const result = await addSpellsToDeck(results);
    if (!result.ok || (result.added === 0 && result.skipped === 0)) return;
    if (result.added === 0) {
      toast.info(t("library.toast.noAddedTitle"), {
        description: t("library.toast.noAddedDescription", { count: result.skipped }),
      });
      return;
    }
    toast.success(
      t("library.toast.addedTitle", { count: result.added }),
      result.skipped > 0
        ? { description: t("library.toast.skippedDescription", { count: result.skipped }) }
        : {},
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={t("library.title")}>
      <div className="space-y-3 p-3">
        <div className="relative">
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="library-search"
            name="library-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("library.searchPlaceholder")}
            aria-label={t("library.searchLabel")}
            className="pl-7"
          />
        </div>

        <LevelRangeSlider value={filters.levels} onChange={(levels) => patch({ levels })} />

        <MultiSelect
          label={t("library.classFilter")}
          aria-label={t("library.classFilter")}
          allLabel={t("library.allClasses")}
          searchable
          searchPlaceholder={t("library.searchClasses")}
          options={CORE_CLASSES}
          selected={filters.classes}
          onChange={(classes) => patch({ classes })}
          getLabel={(cls) => {
            const key = classKey(cls);
            return key ? t(key) : cls;
          }}
        />

        <Collapsible defaultOpen={false} className="space-y-2">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="group w-full justify-between"
            >
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
          <CollapsibleContent className="space-y-2">
            <div className="space-y-1">
              <MultiSelect
                label={t("library.school")}
                aria-label={t("library.school")}
                allLabel={t("library.allSchools")}
                options={SPELL_SCHOOLS}
                selected={filters.schools}
                onChange={(schools) => patch({ schools })}
                getLabel={(school) => t(schoolKey(school))}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("library.castingTime")}</span>
              <Select
                value={filters.castingTimes[0] ?? "any"}
                onValueChange={(value) => patch({ castingTimes: value === "any" ? [] : [value] })}
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
                onValueChange={(value) => patch({ ranges: value === "any" ? [] : [value] })}
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
                onValueChange={(value) => patch({ durations: value === "any" ? [] : [value] })}
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
                onChange={(components) => patch({ components })}
                getLabel={(component) => t(componentLabelKey(component))}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("library.concentration")}</span>
              <Select
                value={
                  filters.concentration === null ? "any" : filters.concentration ? "yes" : "no"
                }
                onValueChange={(value) =>
                  patch({ concentration: value === "any" ? null : value === "yes" })
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
                onValueChange={(value) =>
                  patch({ ritual: value === "any" ? null : value === "yes" })
                }
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
          </CollapsibleContent>
        </Collapsible>

        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-muted-foreground">{t("library.source")}</span>
            {(["SRD-5.2.1", "Custom"] as SpellSource[]).map((source) => (
              <Chip
                key={source}
                active={filters.sources.includes(source)}
                onClick={() => patch({ sources: toggle(filters.sources, source) })}
              >
                {source === "Custom" ? t("source.custom") : t("source.srdShort")}
              </Chip>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetAll}
            aria-label={t("library.resetFilters")}
          >
            <RotateCcw size={13} aria-hidden="true" />
            {t("library.resetFilters")}
          </Button>
        </div>
      </div>

      <Separator className="my-3 !bg-transparent" />

      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border px-3 py-2">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {t("library.results", { count: results.length })}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={results.length === 0}
            onClick={() => void onAppendAll()}
          >
            <Sparkles size={13} aria-hidden="true" />
            {t("library.appendAll")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={results.length === 0}
            onClick={() => setConfirmReplace(true)}
          >
            {t("library.replaceDeck")}
          </Button>
        </div>
      </div>

      <div className="mt-2 flex items-stretch gap-2 px-3">
        <Button
          variant="outline"
          size="sm"
          className="h-auto flex-1 whitespace-normal py-1.5"
          onClick={() => setCreating(true)}
        >
          <Plus size={13} aria-hidden="true" />
          {t("library.createCustomSpell")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-auto flex-1 whitespace-normal py-1.5"
          onClick={() => setCustomIoOpen(true)}
        >
          {t("library.customImportExport")}
        </Button>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <h2
          id="spell-results-heading"
          className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t("library.spellsHeading")}
        </h2>
        <ul
          className="min-h-0 flex-1 overflow-auto px-2 py-2 [scrollbar-gutter:stable]"
          aria-label={t("library.resultsAria")}
        >
          {results.length === 0 ? (
            <li className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t("library.empty")}
            </li>
          ) : null}
          {results.map((spell) => {
            const contentLanguage = resolveContentLanguage(spell, language);
            return (
              <li key={spell.id}>
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1.5",
                    spell.id === selectedSpellId ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onClick={() => selectSpell(spell.id)}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        lang={contentLanguage}
                        className="block truncate text-sm font-medium text-foreground"
                      >
                        {spell.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t(levelLabelKey(spell.level), { level: spell.level })} &middot;{" "}
                        {t(schoolKey(spell.school))}
                      </span>
                    </span>
                    <SourceBadge source={spell.source} />
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("library.addToDeckAria", { name: spell.name })}
                    onClick={() => void onAdd(spell)}
                  >
                    <Plus size={16} aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <CustomSpellForm open={creating} onOpenChange={setCreating} />
      <CustomSpellImportExportDialog open={customIoOpen} onOpenChange={setCustomIoOpen} />

      <Dialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <DialogContent
          title={t("library.replaceTitle")}
          description={t("library.replaceDescription", { count: results.length })}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmReplace(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  void replaceDeckWithSpells(results);
                  setConfirmReplace(false);
                }}
              >
                {t("library.replaceConfirm")}
              </Button>
            </>
          }
        />
      </Dialog>
    </section>
  );
}
