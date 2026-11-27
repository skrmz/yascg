import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { ShowDetailsContext } from "@/components/workspace-layout.ts";
import { ChevronLeft, ChevronRight, Columns3, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SpellDetailsDialog } from "@/components/details/SpellDetailsDialog.tsx";
import { TablePrintDialog } from "@/components/print/TablePrintDialog.tsx";
import { useApp } from "@/state/AppProvider.tsx";
import { Button } from "@/ui/Button.tsx";
import { Checkbox } from "@/ui/Checkbox.tsx";
import { Dialog, DialogContent, DialogTrigger } from "@/ui/Dialog.tsx";
import { Input, NativeSelect } from "@/ui/Field.tsx";
import { TableFilters, summarizeFilters } from "./TableFilters.tsx";
import { TableRows } from "./TableRows.tsx";
import {
  DATA_COLUMNS,
  OPTIONAL_COLUMNS,
  PAGE_SIZES,
  canSort,
  castingOptions,
  cellText,
  filterTableRows,
  makeTableRows,
  printableCells,
  readTablePreferences,
  reconcileSelection,
  resetTableFilters,
  setMatchingSelection,
  sortTableRows,
  writeTablePreferences,
  type DataColumn,
  type SortColumn,
  type TableFilters as Filters,
  type TableSort,
} from "./model.ts";
import "./deck-table.css";

const SORT_COLUMNS = DATA_COLUMNS.filter(canSort);

interface RemovalRequest {
  ids: string[];
  deckInstance: string;
}

interface DeckTableProps {
  active: boolean;
  deckInstance: string;
  removeEntries: (
    entryIds: readonly string[],
    expectedRevision: number,
  ) => Promise<"ok" | "changed" | "error">;
}

export function DeckTable({ active, deckInstance, removeEntries }: DeckTableProps) {
  const showDetails = useContext(ShowDetailsContext);
  const { t } = useTranslation();
  const {
    activeDeck,
    deckBusy,
    resolvedEntries,
    englishById,
    language,
    dataLoading,
    collectionError,
    applyDeckEntryOrder,
    collectionGeneration,
  } = useApp();
  const [preferences, setPreferences] = useState(readTablePreferences);
  const [page, setPage] = useState(1);
  const [selectionState, setSelectionState] = useState(() => ({
    deckInstance,
    ids: new Set<string>(),
  }));
  const [details, setDetails] = useState<{ deckInstance: string; id: string } | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [removal, setRemoval] = useState<RemovalRequest | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<"error" | "changed" | null>(null);
  const [waitingRevision, setWaitingRevision] = useState<number | null>(null);
  const [applyingSort, setApplyingSort] = useState(false);
  const sortScopeId = useId();
  const returnFocus = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const columnsTrigger = useRef<HTMLButtonElement>(null);
  const outputDisclosure = useRef<HTMLDetailsElement>(null);
  const previewExit = useRef(false);

  useEffect(() => {
    setDetails(null);
    setColumnsOpen(false);
  }, [active, deckInstance, collectionGeneration]);

  useEffect(() => writeTablePreferences(preferences), [preferences]);

  const rows = useMemo(
    () => makeTableRows(resolvedEntries, englishById, language, t),
    [resolvedEntries, englishById, language, t],
  );
  const casting = useMemo(() => castingOptions(rows, language, t), [rows, language, t]);
  const classes = useMemo(
    () => [...new Set(rows.flatMap((row) => row.spell?.classes ?? []))],
    [rows],
  );
  const validIds = useMemo(() => new Set(rows.map(({ id }) => id)), [rows]);
  const matching = useMemo(
    () =>
      sortTableRows(
        filterTableRows(rows, preferences.filters, casting, language),
        preferences.sort,
        language,
      ),
    [rows, preferences.filters, casting, language, preferences.sort],
  );
  const matchingIds = useMemo(() => new Set(matching.map(({ id }) => id)), [matching]);
  const sortChangesDeckOrder =
    preferences.sort !== null &&
    rows.filter(({ id }) => matchingIds.has(id)).some(({ id }, index) => id !== matching[index].id);
  const selection =
    selectionState.deckInstance === deckInstance
      ? reconcileSelection(selectionState.ids, validIds)
      : new Set<string>();
  const matchingSelected = [...selection].filter((id) => matchingIds.has(id)).length;
  const hiddenSelection = selection.size - matchingSelected;
  const pageCount = Math.max(1, Math.ceil(matching.length / preferences.pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * preferences.pageSize;
  const pageRows = matching.slice(start, start + preferences.pageSize);
  const pageIds = new Set(pageRows.map(({ id }) => id));
  const removeIds =
    removal?.deckInstance === deckInstance ? removal.ids.filter((id) => validIds.has(id)) : [];
  const removeHiddenByFilter = removeIds.filter((id) => !matchingIds.has(id)).length;
  const removeHiddenByPage = removeIds.filter(
    (id) => matchingIds.has(id) && !pageIds.has(id),
  ).length;
  const detailsRow =
    details?.deckInstance === deckInstance ? rows.find(({ id }) => id === details.id) : undefined;
  useEffect(() => {
    if (!detailsRow) setDetails(null);
  }, [detailsRow]);
  const disabled = !activeDeck || deckBusy || Boolean(collectionError);

  useEffect(() => {
    setSelectionState((previous) => {
      if (previous.deckInstance !== deckInstance) return { deckInstance, ids: new Set() };
      const ids = reconcileSelection(previous.ids, validIds);
      return previous.ids === ids ? previous : { deckInstance, ids };
    });
  }, [deckInstance, validIds]);

  useEffect(() => setPage((previous) => Math.min(previous, pageCount)), [pageCount]);

  const patchFilters = (patch: Partial<Filters>) => {
    setPreferences((previous) => ({ ...previous, filters: { ...previous.filters, ...patch } }));
    setPage(1);
  };
  const reset = () => {
    setPreferences(resetTableFilters);
    setPage(1);
  };
  const setSort = (sort: TableSort | null) => {
    setPreferences((previous) => ({ ...previous, sort }));
    setPage(1);
  };
  const toggleSort = (column: SortColumn) => {
    const direction = preferences.sort?.column === column ? preferences.sort.direction : null;
    setSort(
      direction === "descending"
        ? null
        : { column, direction: direction === "ascending" ? "descending" : "ascending" },
    );
  };
  const applySort = async () => {
    if (!activeDeck || !sortChangesDeckOrder) return;
    setApplyingSort(true);
    try {
      const result = await applyDeckEntryOrder(
        matching.map(({ id }) => id),
        activeDeck.revision,
      );
      if (result.status === "ok") toast.success(t("deckTable.sortApplied"));
    } finally {
      setApplyingSort(false);
    }
  };
  const toggleSelection = (ids: readonly string[], checked: boolean) => {
    setSelectionState((previous) => ({
      deckInstance,
      ids: setMatchingSelection(
        previous.deckInstance === deckInstance ? previous.ids : new Set(),
        ids,
        checked,
      ),
    }));
  };
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (previewExit.current || !active) {
      if (previewExit.current)
        document.querySelector<HTMLElement>('[data-workspace-pane="details"]')?.focus();
      else
        document
          .querySelector<HTMLElement>('[data-workspace-pane][data-state="active"]:not([hidden])')
          ?.focus({ preventScroll: true });
      previewExit.current = false;
      return;
    }
    const trigger = returnFocus.current;
    if (trigger?.isConnected && !trigger.closest("[hidden]"))
      trigger.focus({ preventScroll: true });
    if (document.activeElement !== trigger) searchRef.current?.focus({ preventScroll: true });
    returnFocus.current = null;
  };
  const openDetails = (id: string, trigger: HTMLElement) => {
    previewExit.current = false;
    returnFocus.current = trigger;
    setDetails({ id, deckInstance });
  };
  const requestRemoval = (ids: string[], trigger: HTMLElement) => {
    if (!activeDeck) return;
    returnFocus.current = trigger;
    setRemoval({ ids, deckInstance });
    setRemoveError(null);
    setWaitingRevision(null);
  };
  const confirmRemoval = async () => {
    if (!activeDeck || !removeIds.length) return;
    const revision = activeDeck.revision;
    setRemoving(true);
    setRemoveError(null);
    try {
      const result = await removeEntries(removeIds, revision);
      if (result === "ok") {
        setSelectionState((previous) =>
          previous.deckInstance === deckInstance
            ? { deckInstance, ids: setMatchingSelection(previous.ids, removeIds, false) }
            : previous,
        );
        returnFocus.current = null;
        setRemoval(null);
      } else {
        setRemoveError(result);
        if (result === "changed") setWaitingRevision(revision);
      }
    } catch {
      setRemoveError("error");
    } finally {
      setRemoving(false);
    }
  };
  const toggleColumn = (column: DataColumn, checked: boolean) => {
    setPreferences((previous) => ({
      ...previous,
      columns: DATA_COLUMNS.filter((item) =>
        item === column ? checked : previous.columns.includes(item),
      ),
    }));
  };
  const sortLabel = ({ column, direction }: TableSort) =>
    t(`deckTable.${direction}`, { column: t(`deckTable.column.${column}`) });
  const currentSort = preferences.sort ? sortLabel(preferences.sort) : t("deckTable.deckOrder");
  const printColumns = useMemo(
    () => preferences.columns.map((id) => ({ id, label: t(`deckTable.column.${id}`) })),
    [preferences.columns, t],
  );
  const printRows = useCallback(
    () =>
      matching.map((row) => ({ id: row.id, cells: printableCells(row, preferences.columns, t) })),
    [matching, preferences.columns, t],
  );
  const filterSummary = summarizeFilters(preferences.filters, casting, t);

  return (
    <section
      className="deck-table-workspace app-no-print"
      hidden={!active}
      data-full-table={preferences.fullTable}
      aria-label={t("deckTable.title")}
    >
      <div className="deck-table-content">
        <div className="deck-table-toolbar">
          <div className="deck-table-tool-row deck-table-query">
            <label className="deck-table-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">{t("deckTable.search")}</span>
              <Input
                ref={searchRef}
                id="deck-table-search-input"
                type="search"
                value={preferences.filters.name}
                placeholder={t("deckTable.search")}
                onChange={(event) => patchFilters({ name: event.target.value })}
              />
            </label>
            <NativeSelect
              aria-label={t("deckTable.sortBy")}
              className="deck-table-sort-field"
              value={preferences.sort?.column ?? ""}
              onChange={(event) => {
                const column = event.target.value;
                setSort(
                  canSort(column)
                    ? { column, direction: preferences.sort?.direction ?? "ascending" }
                    : null,
                );
              }}
            >
              <option value="">{t("deckTable.useDeckOrder")}</option>
              {SORT_COLUMNS.map((column) => (
                <option key={column} value={column}>
                  {t(`deckTable.column.${column}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="deck-table-tool-row deck-table-options">
            <TableFilters
              filters={preferences.filters}
              casting={casting}
              hasUnknown={rows.some((row) => row.spell === null)}
              classes={classes}
              onPatch={patchFilters}
            >
              <div className="deck-table-tool-row px-3 pb-3">
                <Button
                  type="button"
                  variant="outline"
                  className="deck-table-wrap-button"
                  aria-describedby={
                    sortChangesDeckOrder && matching.length < rows.length ? sortScopeId : undefined
                  }
                  disabled={disabled || applyingSort || dataLoading || !sortChangesDeckOrder}
                  onClick={() => void applySort()}
                >
                  {t("deckTable.applySortToDeck")}
                </Button>
                {sortChangesDeckOrder && matching.length < rows.length && (
                  <span id={sortScopeId} className="text-xs text-muted-foreground">
                    {t("deckTable.applySortScope")}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="deck-table-wrap-button"
                  onClick={reset}
                  disabled={filterSummary.length === 0 && !preferences.sort}
                >
                  {t("deckTable.reset")}
                </Button>
              </div>
            </TableFilters>
            {preferences.sort && (
              <NativeSelect
                aria-label={t("deckTable.sortDirection")}
                className="deck-table-sort-direction"
                value={preferences.sort.direction}
                onChange={(event) => {
                  if (preferences.sort)
                    setSort({
                      column: preferences.sort.column,
                      direction: event.target.value === "descending" ? "descending" : "ascending",
                    });
                }}
              >
                <option value="ascending">{t("deckTable.ascendingDirection")}</option>
                <option value="descending">{t("deckTable.descendingDirection")}</option>
              </NativeSelect>
            )}
            <details ref={outputDisclosure} className="deck-table-output">
              <summary>{t("deckTable.viewAndPrint")}</summary>
              <div className="deck-table-tool-row px-3 pb-3">
                <Dialog open={columnsOpen && active} onOpenChange={setColumnsOpen}>
                  <DialogTrigger asChild>
                    <Button
                      ref={columnsTrigger}
                      type="button"
                      variant="outline"
                      className="deck-table-wrap-button"
                    >
                      <Columns3 size={15} aria-hidden="true" />
                      <span className="deck-table-compact-columns">
                        {t("deckTable.fullAndPrintColumns")}
                      </span>
                      <span className="deck-table-wide-columns">{t("deckTable.columns")}</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent
                    title={t("deckTable.columns")}
                    description={t("deckTable.columnsDescription")}
                    onCloseAutoFocus={(event) => {
                      if (!active) {
                        restoreFocus(event);
                        return;
                      }
                      event.preventDefault();
                      columnsTrigger.current?.focus();
                    }}
                  >
                    <div className="deck-table-column-choices">
                      {OPTIONAL_COLUMNS.map((column) => (
                        <Checkbox
                          key={column}
                          label={t(`deckTable.column.${column}`)}
                          checked={preferences.columns.includes(column)}
                          onChange={(event) => toggleColumn(column, event.target.checked)}
                        />
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
                {active ? (
                  <TablePrintDialog
                    columns={printColumns}
                    rows={printRows}
                    rowCount={matching.length}
                    filters={filterSummary}
                    sort={currentSort}
                    deckName={activeDeck?.name ?? ""}
                    onColumns={() => {
                      if (outputDisclosure.current) outputDisclosure.current.open = true;
                      setColumnsOpen(true);
                    }}
                    disabled={disabled || dataLoading}
                  />
                ) : null}
                <div className="deck-table-full-toggle">
                  <Checkbox
                    label={t("deckTable.fullTable")}
                    checked={preferences.fullTable}
                    onChange={(event) =>
                      setPreferences((previous) => ({
                        ...previous,
                        fullTable: event.target.checked,
                      }))
                    }
                  />
                </div>
              </div>
            </details>
          </div>
          <div className="deck-table-tool-row deck-table-summary">
            <p className="deck-table-status" role="status">
              {dataLoading
                ? t("deckTable.loading")
                : t("deckTable.matching", { matching: matching.length, total: rows.length })}
              {" · "}
              {t("common.selectedCount", { count: selection.size })}
              {hiddenSelection > 0
                ? ` · ${t("deckTable.hiddenSelection", { count: hiddenSelection })}`
                : ""}
              {" · "}
              {currentSort}
            </p>
            {selection.size > 0 && (
              <div
                className="deck-table-tool-row"
                role="group"
                aria-label={t("deckTable.selectionActions")}
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSelectionState({ deckInstance, ids: new Set() });
                    searchRef.current?.focus({ preventScroll: true });
                  }}
                >
                  {t("deckTable.clearSelection")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={(event) => requestRemoval([...selection], event.currentTarget)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  {t("deckTable.removeSelected")}
                </Button>
              </div>
            )}
          </div>
        </div>

        {matching.length ? (
          <>
            <TableRows
              rows={pageRows}
              columns={preferences.columns}
              sort={preferences.sort}
              selection={selection}
              matchingCount={matching.length}
              matchingSelected={matchingSelected}
              onSort={toggleSort}
              onToggleMatching={(checked) => toggleSelection([...matchingIds], checked)}
              onToggle={(id, checked) => toggleSelection([id], checked)}
              onOpen={openDetails}
              onRemove={requestRemoval}
              disabled={disabled}
            />
            <nav className="deck-table-pagination" aria-label={t("deckTable.paging")}>
              <label className="deck-table-field">
                {t("deckTable.pageSize")}
                <select
                  name="pageSize"
                  value={preferences.pageSize}
                  onChange={(event) => {
                    const size =
                      PAGE_SIZES.find((value) => value === Number(event.target.value)) ?? 10;
                    setPreferences((previous) => ({ ...previous, pageSize: size }));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <div className="deck-table-tool-row">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t("deckTable.previous")}
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </Button>
                <span role="status">
                  {t("deckTable.page", { page: currentPage, pages: pageCount })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t("deckTable.next")}
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </Button>
              </div>
            </nav>
          </>
        ) : (
          <div className="deck-table-empty">
            {!dataLoading && (
              <p>{t(rows.length ? "deckTable.emptyResults" : "deckTable.emptyDeck")}</p>
            )}
            {rows.length > 0 && !dataLoading ? (
              <Button
                type="button"
                variant="outline"
                className="deck-table-wrap-button"
                onClick={reset}
              >
                {t("deckTable.reset")}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {detailsRow?.spell ? (
        <SpellDetailsDialog
          spell={detailsRow.spell}
          datasetLanguage={detailsRow.language}
          open={active}
          onOpenChange={(open) => !open && setDetails(null)}
          onCloseAutoFocus={restoreFocus}
          onOpenPreview={
            detailsRow.status === "resolved"
              ? () => {
                  previewExit.current = true;
                  setDetails(null);
                  showDetails({ spellId: detailsRow.spellId, source: "table" });
                }
              : undefined
          }
        />
      ) : null}
      {detailsRow && !detailsRow.spell ? (
        <Dialog open={active} onOpenChange={(open) => !open && setDetails(null)}>
          <DialogContent
            title={detailsRow.name}
            description={t("deckTable.unresolved")}
            onCloseAutoFocus={restoreFocus}
          >
            <dl className="space-y-2 break-all">
              <div>
                <dt className="font-semibold">{t("deckTable.spellId")}</dt>
                <dd>{detailsRow.spellId}</dd>
              </div>
              <div>
                <dt className="font-semibold">{t("deckTable.column.source")}</dt>
                <dd>{cellText(detailsRow, "source", t)}</dd>
              </div>
            </dl>
          </DialogContent>
        </Dialog>
      ) : null}
      <Dialog
        open={active && removal?.deckInstance === deckInstance}
        onOpenChange={(open) => !open && !removing && setRemoval(null)}
      >
        <DialogContent
          title={t("deckTable.removeTitle")}
          description={t("deckTable.removeCount", { count: removeIds.length })}
          onCloseAutoFocus={restoreFocus}
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                disabled={removing}
                onClick={() => setRemoval(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  disabled ||
                  removing ||
                  removeIds.length === 0 ||
                  waitingRevision === activeDeck?.revision
                }
                onClick={() => void confirmRemoval()}
              >
                {t("deckTable.remove")}
              </Button>
            </>
          }
        >
          {removeHiddenByFilter > 0 && (
            <p>{t("deckTable.removeHiddenByFilter", { count: removeHiddenByFilter })}</p>
          )}
          {removeHiddenByPage > 0 && (
            <p>{t("deckTable.removeHiddenByPage", { count: removeHiddenByPage })}</p>
          )}
          {removeError === "changed" || (removal && removal.ids.length !== removeIds.length) ? (
            <p role="status">{t("deckTable.removeChanged")}</p>
          ) : null}
          {removeError === "error" ? <p role="alert">{t("deckTable.removeFailed")}</p> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
