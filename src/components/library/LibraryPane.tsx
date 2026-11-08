import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/state/AppProvider.tsx";
import { resolveContentLanguage } from "@/content-language.ts";
import {
  classKey,
  componentLabelKey,
  levelLabelKey,
  schoolKey,
  subclassLabel,
} from "@/locales/labels.ts";
import {
  CORE_CLASSES,
  type Spell,
  type SpellComponentKey,
  type SpellSchool,
  type SpellSource,
} from "@/domain/spells";
import { subclassParentClass } from "@/domain/subclasses";
import {
  DEFAULT_FILTERS,
  collatorFor,
  deriveCastingTimeOptions,
  deriveDurationOptions,
  deriveRangeOptions,
  deriveSubclassOptions,
  filterSpells,
  searchSpells,
  sortSpells,
  type LibraryFilters as LibraryFilterState,
} from "@/services/data/search.ts";
import { Button } from "@/ui/Button.tsx";
import { Badge, SourceBadge } from "@/ui/Badge.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/DropdownMenu.tsx";
import { Input } from "@/ui/Field.tsx";
import { Separator } from "@/ui/Separator.tsx";
import { cn } from "@/ui/cn.ts";
import { CustomSpellForm } from "@/components/details/CustomSpellForm.tsx";
import { CustomSpellImportExportDialog } from "@/components/import-export/CustomSpellImportExportDialog.tsx";
import { LibraryFilters } from "./LibraryFilters.tsx";
import { buildActiveFilterChips, type FilterChipLabels } from "./filter-summary.ts";
import { ShowDetailsContext, useWorkspaceMode } from "../workspace-layout.ts";

export function LibraryPane({ active = true }: { active?: boolean }) {
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
  const isDesktop = useWorkspaceMode() === "wide";
  const showDetails = useContext(ShowDetailsContext);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<LibraryFilterState>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [creating, setCreating] = useState(false);
  const [customIoOpen, setCustomIoOpen] = useState(false);

  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listScrollTop = useRef(0);
  const activeRef = useRef(active);

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
  // Subclass identifiers are canonical and language-independent, so options come from the
  // whole library (selected-language SRD plus custom spells) and selections survive language
  // changes. Reference-only identifiers fall back to their English label.
  const subclassOptions = useMemo(() => {
    const classOrder = new Map<string, number>(
      CORE_CLASSES.map((cls, index): [string, number] => [cls, index]),
    );
    const collator = collatorFor(language);
    return deriveSubclassOptions(librarySpells).sort((left, right) => {
      const leftClass = subclassParentClass(left);
      const rightClass = subclassParentClass(right);
      const byClass =
        (classOrder.get(leftClass) ?? CORE_CLASSES.length) -
        (classOrder.get(rightClass) ?? CORE_CLASSES.length);
      if (byClass !== 0) return byClass;
      if (leftClass !== rightClass) return collator.compare(leftClass, rightClass);
      return collator.compare(subclassLabel(left, t), subclassLabel(right, t));
    });
  }, [librarySpells, language, t]);

  const chipLabels = useMemo<FilterChipLabels>(
    () => ({
      levels: (range) =>
        range.min === range.max
          ? t("library.levelSingle", { level: range.min })
          : t("library.levelRange", { min: range.min, max: range.max }),
      classes: {
        group: t("library.classFilter"),
        value: (cls) => {
          const key = classKey(cls);
          return key ? t(key) : cls;
        },
      },
      subclasses: { group: t("library.subclassFilter"), value: (id) => subclassLabel(id, t) },
      schools: {
        group: t("library.school"),
        value: (school: SpellSchool) => t(schoolKey(school)),
      },
      castingTimes: { group: t("library.castingTime"), value: (value) => value },
      ranges: { group: t("library.range"), value: (value) => value },
      durations: { group: t("library.duration"), value: (value) => value },
      components: {
        group: t("library.components"),
        value: (component: SpellComponentKey) => t(componentLabelKey(component)),
      },
      concentration: {
        group: t("library.concentration"),
        yes: t("common.yes"),
        no: t("common.no"),
      },
      ritual: { group: t("library.ritual"), yes: t("common.yes"), no: t("common.no") },
      sources: {
        group: t("library.source"),
        value: (source: SpellSource) =>
          source === "Custom" ? t("source.custom") : t("source.srdShort"),
      },
      multiValue: (label, count) => t("library.multiValueSummary", { label, count }),
    }),
    [t],
  );

  const activeChips = useMemo(
    () => buildActiveFilterChips(filters, chipLabels),
    [filters, chipLabels],
  );

  const patch = (partial: Partial<LibraryFilterState>) =>
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

  useLayoutEffect(() => {
    activeRef.current = active;
    if (!active) return;
    const list = listRef.current;
    if (list) list.scrollTop = listScrollTop.current;
  }, [active]);

  const onListScroll = () => {
    if (!activeRef.current) return;
    if (listRef.current) listScrollTop.current = listRef.current.scrollTop;
  };

  const resetAll = () => {
    setQuery("");
    setFilters(DEFAULT_FILTERS);
  };

  const onAdd = async (spell: Spell) => {
    const result = await addSpellToDeck(spell);
    if (result === "added") {
      selectSpell(spell.id);
      showDetails();
    }
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

  const filterControls = (
    <LibraryFilters
      variant={isDesktop ? "inline" : "sheet"}
      filters={filters}
      onPatch={patch}
      onReset={resetAll}
      castingOptions={castingOptions}
      rangeOptions={rangeOptions}
      durationOptions={durationOptions}
      subclassOptions={subclassOptions}
      searchInputClassName={isDesktop ? "text-sm" : "text-base"}
    />
  );

  return (
    <section
      id="libraryPane"
      className="flex h-full min-h-0 flex-col"
      aria-label={t("library.title")}
    >
      <div className={cn("shrink-0", isDesktop ? "space-y-3 p-3" : "space-y-2 p-2")}>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchRef}
              id="library-search"
              name="library-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("library.searchPlaceholder")}
              aria-label={t("library.searchLabel")}
              className={cn("pl-7", isDesktop ? "text-sm" : "text-base")}
            />
          </div>
          {!isDesktop ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1.5 px-2.5"
              aria-label={
                activeChips.length > 0
                  ? t("library.filtersActiveAria", { count: activeChips.length })
                  : t("library.filters")
              }
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              {t("library.filters")}
              {activeChips.length > 0 ? <Badge>{activeChips.length}</Badge> : null}
            </Button>
          ) : null}
        </div>

        {!isDesktop && activeChips.length > 0 ? (
          <div
            role="group"
            className="-mx-2 overflow-x-auto overscroll-x-contain px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label={t("library.activeFilterRow")}
          >
            <ul className="flex w-max items-center gap-1">
              {activeChips.map((chip) => (
                <li key={chip.key}>
                  <button
                    type="button"
                    aria-label={t("library.removeFilterAria", { filter: chip.label })}
                    onClick={() => patch(chip.clear)}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-input bg-background px-2 py-1 text-xs text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  >
                    <span>{chip.label}</span>
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {isDesktop ? filterControls : null}
      </div>

      <Separator className="my-3 !bg-transparent max-[1199px]:hidden" />

      {isDesktop ? (
        <>
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
        </>
      ) : (
        <div className="flex items-center justify-between gap-2 border-y border-border px-3 py-1.5">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {t("library.results", { count: results.length })}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-1.5 px-2.5"
                aria-label={t("library.actionsTrigger")}
              >
                <MoreHorizontal size={16} aria-hidden="true" />
                {t("library.actions")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem disabled={results.length === 0} onSelect={() => void onAppendAll()}>
                <Sparkles size={15} aria-hidden="true" />
                {t("library.appendAll")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={results.length === 0}
                onSelect={() => setConfirmReplace(true)}
              >
                {t("library.replaceDeck")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreating(true)}>
                <Plus size={15} aria-hidden="true" />
                {t("library.createCustomSpell")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCustomIoOpen(true)}>
                {t("library.customImportExport")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="mt-1 flex min-h-0 flex-1 flex-col">
        <h2
          id="spell-results-heading"
          className={cn(
            "px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
            !isDesktop && "sr-only",
          )}
        >
          {t("library.spellsHeading")}
        </h2>
        <ul
          ref={listRef}
          onScroll={onListScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] [scrollbar-gutter:stable]"
          aria-label={t("library.resultsAria")}
        >
          {results.length === 0 ? (
            <li className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t("library.empty")}
              <Button
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  resetAll();
                  searchRef.current?.focus();
                }}
              >
                {t("library.clearSearchFilters")}
              </Button>
            </li>
          ) : null}
          {results.map((spell) => {
            const contentLanguage = resolveContentLanguage(spell, language);
            return (
              <li key={spell.id}>
                <div
                  className={cn(
                    "flex flex-nowrap items-center justify-between gap-2 rounded px-2 py-1.5",
                    "border-l-2",
                    spell.id === selectedSpellId
                      ? "border-primary bg-accent"
                      : "border-transparent hover:bg-accent/50",
                  )}
                >
                  <button
                    type="button"
                    aria-current={spell.id === selectedSpellId ? "true" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onClick={() => {
                      selectSpell(spell.id);
                      showDetails();
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        lang={contentLanguage}
                        className="line-clamp-2 break-words text-sm font-medium text-foreground"
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
                    className="shrink-0"
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

      {!isDesktop ? (
        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogContent
            variant="sheet"
            title={t("library.filters")}
            description={t("library.filterSheetDescription")}
            footer={
              <>
                <span
                  className="w-full text-xs text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  {t("library.matchCount", { count: results.length })}
                </span>
                <Button
                  variant="outline"
                  className="mr-auto"
                  onClick={resetAll}
                  aria-label={t("library.resetFilters")}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  {t("library.resetFilters")}
                </Button>
                <Button onClick={() => setFiltersOpen(false)}>{t("library.done")}</Button>
              </>
            }
          >
            {filterControls}
          </DialogContent>
        </Dialog>
      ) : null}

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
