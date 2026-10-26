import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Button } from "./Button.tsx";
import { Checkbox } from "./Checkbox.tsx";
import { Input } from "./Field.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover.tsx";
import { cn } from "./cn.ts";

export interface MultiSelectProps<T extends string> {
  label?: string;
  options: readonly T[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  allLabel?: string;
  getLabel?: (option: T) => string;
  "aria-label"?: string;
  className?: string;
}

export function MultiSelect<T extends string>({
  label,
  options,
  selected,
  onChange,
  searchable = false,
  searchPlaceholder,
  allLabel,
  getLabel,
  className,
  "aria-label": ariaLabel,
}: MultiSelectProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const labelFor = (option: T): string => (getLabel ? getLabel(option) : option);
  const accessibleLabel = label ?? ariaLabel ?? t("common.options");

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!searchable || needle === "") return options;
    const label = (option: T) => (getLabel ? getLabel(option) : option);
    return options.filter((option) => label(option).toLocaleLowerCase().includes(needle));
  }, [options, search, searchable, getLabel]);

  const summary =
    selected.length === 0
      ? (allLabel ?? t("common.all"))
      : selected.length === 1
        ? labelFor(selected[0])
        : t("common.selectedCount", { count: selected.length });
  const fullSummary = selected.map(labelFor).join(", ");
  const toggle = (value: T) => {
    onChange(
      selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
    );
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel ?? label ?? accessibleLabel}
          className={cn("w-full justify-between gap-2 font-normal", className)}
        >
          <span className="flex min-w-0 items-baseline gap-1.5 text-sm">
            {label ? <span className="shrink-0 text-muted-foreground">{label}</span> : null}
            <span
              className="truncate text-foreground"
              title={selected.length > 1 ? fullSummary : undefined}
            >
              {summary}
            </span>
          </span>
          <ChevronDown size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        {searchable ? (
          <div className="border-b border-border p-2">
            <Input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder ?? t("common.searchPlaceholder")}
              aria-label={t("common.searchOptions", { label: accessibleLabel })}
              className="h-8"
            />
          </div>
        ) : null}
        <div className="max-h-64 overflow-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">{t("common.noOptions")}</p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((option) => (
                <li key={option}>
                  <Checkbox
                    label={labelFor(option)}
                    checked={selected.includes(option)}
                    onChange={() => toggle(option)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border p-2 text-xs text-muted-foreground">
          <span>{t("common.selectedCount", { count: selected.length })}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={selected.length === 0}
            onClick={() => onChange([])}
          >
            {t("common.clear")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
