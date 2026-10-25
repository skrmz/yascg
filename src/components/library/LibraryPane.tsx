import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Plus, RotateCcw, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/state/AppProvider.tsx";
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
  createSearchIndex,
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
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [creating, setCreating] = useState(false);

  const index = useMemo(() => createSearchIndex(librarySpells), [librarySpells]);
  const searched = useMemo(
    () => searchSpells(index, librarySpells, query),
    [index, librarySpells, query],
  );
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
      toast.info("Already in deck", {
        description: `${spell.name} is already in the active deck.`,
      });
    }
  };

  const onAppendAll = async () => {
    const result = await addSpellsToDeck(results);
    if (!result.ok || (result.added === 0 && result.skipped === 0)) return;
    if (result.added === 0) {
      toast.info("No spells added", {
        description: `${result.skipped} matching spell${result.skipped === 1 ? " is" : "s are"} already in the active deck.`,
      });
      return;
    }
    toast.success(
      `Added ${result.added} spell${result.added === 1 ? "" : "s"} to the active deck.`,
      result.skipped > 0
        ? {
            description: `Skipped ${result.skipped} already in the active deck.`,
          }
        : undefined,
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Spell library">
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
            placeholder="Search name, class, or description"
            aria-label="Search spells"
            className="pl-7"
          />
        </div>

        <LevelRangeSlider value={filters.levels} onChange={(levels) => patch({ levels })} />

        <MultiSelect
          label="Class"
          aria-label="Class"
          allLabel="All classes"
          searchable
          searchPlaceholder="Search classes…"
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
              <span>Advanced Filters</span>
              <span className="flex items-center gap-2">
                {advancedCount > 0 ? <Badge>{advancedCount} active</Badge> : null}
                <ChevronDown
                  size={15}
                  aria-hidden="true"
                  className="transition-transform group-data-[state=open]:rotate-180"
                />
              </span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 overflow-hidden data-[state=closed]:animate-[collapsible-up_180ms_ease-out] data-[state=open]:animate-[collapsible-down_180ms_ease-out] motion-reduce:animate-none">
            <div className="space-y-1">
              <MultiSelect
                label="School"
                aria-label="School"
                allLabel="All schools"
                options={SPELL_SCHOOLS}
                selected={filters.schools}
                onChange={(schools) => patch({ schools })}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Casting Time</span>
              <Select
                value={filters.castingTimes[0] ?? "any"}
                onValueChange={(value) => patch({ castingTimes: value === "any" ? [] : [value] })}
              >
                <SelectTrigger aria-label="Casting time" className="h-8 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {castingOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Range</span>
              <Select
                value={filters.ranges[0] ?? "any"}
                onValueChange={(value) => patch({ ranges: value === "any" ? [] : [value] })}
              >
                <SelectTrigger aria-label="Range" className="h-8 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {rangeOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Duration</span>
              <Select
                value={filters.durations[0] ?? "any"}
                onValueChange={(value) => patch({ durations: value === "any" ? [] : [value] })}
              >
                <SelectTrigger aria-label="Duration" className="h-8 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
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
                label="Components"
                aria-label="Components"
                allLabel="All components"
                options={SPELL_COMPONENT_KEYS}
                selected={filters.components}
                onChange={(components) => patch({ components })}
                getLabel={(component) => t(componentLabelKey(component))}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Concentration</span>
              <Select
                value={
                  filters.concentration === null ? "any" : filters.concentration ? "yes" : "no"
                }
                onValueChange={(value) =>
                  patch({ concentration: value === "any" ? null : value === "yes" })
                }
              >
                <SelectTrigger aria-label="Concentration" className="h-8 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Ritual</span>
              <Select
                value={filters.ritual === null ? "any" : filters.ritual ? "yes" : "no"}
                onValueChange={(value) =>
                  patch({ ritual: value === "any" ? null : value === "yes" })
                }
              >
                <SelectTrigger aria-label="Ritual" className="h-8 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-muted-foreground">Source</span>
            {(["SRD-5.2.1", "Custom"] as SpellSource[]).map((source) => (
              <Chip
                key={source}
                active={filters.sources.includes(source)}
                onClick={() => patch({ sources: toggle(filters.sources, source) })}
              >
                {source === "Custom" ? "Custom" : "SRD"}
              </Chip>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={resetAll} aria-label="Reset filters">
            <RotateCcw size={13} aria-hidden="true" />
            Reset Filters
          </Button>
        </div>
      </div>

      <Separator className="my-3" />

      <div className="flex items-center justify-between gap-2 border-y border-border px-3 py-2">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {results.length} result{results.length === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={results.length === 0}
            onClick={() => void onAppendAll()}
          >
            <Sparkles size={13} aria-hidden="true" />
            Append all
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={results.length === 0}
            onClick={() => setConfirmReplace(true)}
          >
            Replace deck
          </Button>
        </div>
      </div>

      <div className="mt-2 px-3">
        <Button variant="outline" size="sm" className="w-full" onClick={() => setCreating(true)}>
          <Plus size={13} aria-hidden="true" />
          Create custom spell
        </Button>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <h2
          id="spell-results-heading"
          className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Spells
        </h2>
        <ul className="min-h-0 flex-1 overflow-auto px-2 py-2" aria-label="Spell results">
          {results.length === 0 ? (
            <li className="px-2 py-6 text-center text-sm text-muted-foreground">
              No spells match the current search and filters.
            </li>
          ) : null}
          {results.map((spell) => (
            <li key={spell.id}>
              <div
                className={cn(
                  "flex items-center justify-between gap-2 rounded px-2 py-1.5",
                  spell.id === selectedSpellId ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  onClick={() => selectSpell(spell.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {spell.name}
                    </span>
                    <span
                      lang={i18n.resolvedLanguage}
                      className="block truncate text-xs text-muted-foreground"
                    >
                      {t(levelLabelKey(spell.level), { level: spell.level })} &middot;{" "}
                      {t(schoolKey(spell.school))}
                    </span>
                  </span>
                  <SourceBadge source={spell.source} />
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Add ${spell.name} to active deck`}
                  onClick={() => void onAdd(spell)}
                >
                  <Plus size={16} aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <CustomSpellForm open={creating} onOpenChange={setCreating} />

      <Dialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <DialogContent
          title="Replace the active deck?"
          description={`This removes the current active deck entries and replaces them with the ${results.length} matching spell(s). Saved decks are not changed.`}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmReplace(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  void replaceDeckWithSpells(results);
                  setConfirmReplace(false);
                }}
              >
                Replace deck
              </Button>
            </>
          }
        />
      </Dialog>
    </section>
  );
}
