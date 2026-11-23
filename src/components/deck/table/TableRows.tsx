import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Info, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { componentLabelKey, levelLabelKey } from "@/locales/labels.ts";
import { Button } from "@/ui/Button.tsx";
import { Checkbox } from "@/ui/Checkbox.tsx";
import {
  activeComponents,
  canSort,
  cellText,
  rowNote,
  type DataColumn,
  type SortColumn,
  type TableRow,
  type TableSort,
} from "./model.ts";

interface TableRowsProps {
  rows: TableRow[];
  matchingCount: number;
  matchingSelected: number;
  selection: ReadonlySet<string>;
  columns: DataColumn[];
  sort: TableSort | null;
  onSort: (column: SortColumn) => void;
  onToggleMatching: (checked: boolean) => void;
  onToggle: (id: string, checked: boolean) => void;
  onOpen: (id: string, trigger: HTMLElement) => void;
  onRemove: (ids: string[], trigger: HTMLElement) => void;
  disabled: boolean;
}

function RowName({ row }: { row: TableRow }) {
  const { t } = useTranslation();
  const note = rowNote(row, t);
  return (
    <>
      <span
        lang={row.contentLanguage}
        className={row.spell ? "deck-table-clamp" : "deck-table-reference-name"}
      >
        {row.name}
      </span>
      {note ? <span className="deck-table-row-note">{note}</span> : null}
    </>
  );
}

function RowCell({
  row,
  column,
  onOpen,
}: {
  row: TableRow;
  column: DataColumn;
  onOpen: TableRowsProps["onOpen"];
}) {
  const { t } = useTranslation();
  const value = cellText(row, column, t);
  if (column === "concentration" || column === "ritual") {
    const flag = row.values[column];
    if (flag !== null)
      return (
        <>
          {flag ? <Check size={16} aria-hidden="true" /> : null}
          <span className="sr-only">{value}</span>
        </>
      );
  }
  if (column === "description" ? !row.spell : row.values[column] === null) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t("deckTable.unknown")}</span>
      </>
    );
  }
  if (column === "components" && row.spell) {
    const labels = activeComponents(row.spell).map((key) => t(componentLabelKey(key)));
    return labels.length ? (
      <>
        <span aria-hidden="true">{value}</span>
        <span className="sr-only">{labels.join(", ")}</span>
      </>
    ) : (
      value
    );
  }
  const isSpellText =
    column === "castingTime" ||
    column === "range" ||
    column === "duration" ||
    column === "description";
  const content = (
    <span
      className={column === "classes" ? "deck-table-class-value" : "deck-table-clamp"}
      lang={isSpellText ? row.contentLanguage : undefined}
    >
      {column === "description" && value.length > 240 ? `${value.slice(0, 239)}…` : value}
    </span>
  );
  if (column !== "description") return content;
  return (
    <>
      {content}
      <Button
        type="button"
        variant="link"
        className="deck-table-description-button"
        aria-label={t("deckTable.showRowDescription", { name: row.name })}
        onClick={(event) => onOpen(row.id, event.currentTarget)}
      >
        {t("deckTable.showDescription")}
      </Button>
    </>
  );
}

export function TableRows({
  rows,
  matchingCount,
  matchingSelected,
  selection,
  columns,
  sort,
  onSort,
  onToggleMatching,
  onToggle,
  onOpen,
  onRemove,
  disabled,
}: TableRowsProps) {
  const { t } = useTranslation();
  const all = matchingCount > 0 && matchingSelected === matchingCount;
  const mixed = matchingSelected > 0 && !all;
  const selectMatching = (compact: boolean) => (
    <Checkbox
      label={
        compact ? (
          t("deckTable.selectMatching")
        ) : (
          <span className="sr-only">{t("deckTable.selectMatching")}</span>
        )
      }
      checked={all}
      ref={(input) => {
        if (input) input.indeterminate = mixed;
      }}
      onChange={(event) => onToggleMatching(event.target.checked)}
      disabled={matchingCount === 0 || disabled}
    />
  );
  const selectRow = (row: TableRow) => (
    <Checkbox
      label={<span className="sr-only">{t("deckTable.selectRow", { name: row.name })}</span>}
      checked={selection.has(row.id)}
      disabled={disabled}
      onChange={(event) => onToggle(row.id, event.target.checked)}
    />
  );
  const actions = (row: TableRow, compact: boolean) => (
    <div className="deck-table-row-actions">
      <Button
        type="button"
        variant="ghost"
        size={compact ? "sm" : "icon"}
        aria-label={t("deckTable.openRowDetails", { name: row.name })}
        title={compact ? undefined : t("deckTable.openDetails")}
        onClick={(event) => onOpen(row.id, event.currentTarget)}
      >
        <Info size={16} aria-hidden="true" />
        {compact ? t("deckTable.openDetails") : null}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={compact ? "sm" : "icon"}
        aria-label={t("deckTable.removeRow", { name: row.name })}
        title={compact ? undefined : t("deckTable.remove")}
        disabled={disabled}
        onClick={(event) => onRemove([row.id], event.currentTarget)}
      >
        <Trash2 size={16} aria-hidden="true" />
        {compact ? t("deckTable.remove") : null}
      </Button>
    </div>
  );
  const header = (column: DataColumn): ReactNode => {
    const label = t(`deckTable.column.${column}`);
    if (!canSort(column)) return label;
    const direction = sort?.column === column ? sort.direction : undefined;
    const Icon =
      direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ArrowUpDown;
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="deck-table-sort-heading"
        onClick={() => onSort(column)}
      >
        {label}
        <Icon size={13} aria-hidden="true" />
      </Button>
    );
  };

  return (
    <>
      <div className="deck-table-full">
        <div
          className="deck-table-scroll"
          tabIndex={0}
          aria-label={t("deckTable.title")}
          role="region"
        >
          <table>
            <caption className="sr-only">{t("deckTable.title")}</caption>
            <thead>
              <tr>
                <th scope="col" className="deck-table-check">
                  {selectMatching(false)}
                </th>
                {columns.map((column) => (
                  <th
                    scope="col"
                    key={column}
                    data-column={column}
                    aria-sort={sort?.column === column ? sort.direction : undefined}
                  >
                    {header(column)}
                  </th>
                ))}
                <th scope="col">{t("deckTable.column.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-selected={selection.has(row.id) || undefined}>
                  <td className="deck-table-check">{selectRow(row)}</td>
                  <th scope="row" data-column="name">
                    <RowName row={row} />
                  </th>
                  {columns
                    .filter((column) => column !== "name")
                    .map((column) => (
                      <td key={column} data-column={column}>
                        <RowCell row={row} column={column} onOpen={onOpen} />
                      </td>
                    ))}
                  <td>{actions(row, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="deck-table-compact">
        <div className="deck-table-compact-select">{selectMatching(true)}</div>
        <ul role="list" aria-label={t("deckTable.compactList")}>
          {rows.map((row) => (
            <li key={row.id} data-selected={selection.has(row.id) || undefined}>
              {selectRow(row)}
              <div className="deck-table-compact-entry">
                <div className="font-semibold">
                  <RowName row={row} />
                </div>
                {row.spell ? (
                  <p className="deck-table-row-note">
                    {t(levelLabelKey(row.spell.level), { level: row.spell.level })}
                    {" · "}
                    {row.values.school}
                    {row.values.concentration ? ` · ${t("deckTable.column.concentration")}` : ""}
                  </p>
                ) : null}
                {actions(row, true)}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
