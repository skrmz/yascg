import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useApp } from "@/state/AppProvider.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/Popover.tsx";
import { cn } from "@/ui/cn.ts";

export function LanguagePicker() {
  const { manifest, language, requestLanguageSwitch } = useApp();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  const current = manifest.find((entry) => entry.code === language);
  const currentLabel = current ? `${current.displayName} (${current.code})` : language;

  useEffect(() => {
    if (!open) return;
    const index = manifest.findIndex((entry) => entry.code === language);
    setActiveIndex(index >= 0 ? index : 0);
  }, [open, manifest, language]);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  const choose = useCallback(
    async (code: string) => {
      setOpen(false);
      await requestLanguageSwitch(code);
    },
    [requestLanguageSwitch],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (manifest.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % manifest.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + manifest.length) % manifest.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(manifest.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const entry = manifest[activeIndex];
      if (entry) void choose(entry.code);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Spell data language: ${currentLabel}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="font-medium">{current ? current.displayName : language}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-50 w-60 rounded-md border border-border bg-popover p-1 shadow-lg">
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Spell data languages"
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="max-h-64 overflow-auto outline-none"
        >
          {manifest.map((entry, index) => {
            const selected = entry.code === language;
            const active = index === activeIndex;
            return (
              <li
                key={entry.code}
                role="option"
                aria-selected={selected}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm",
                  active ? "bg-accent text-accent-foreground" : "text-foreground",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  void choose(entry.code);
                }}
              >
                <span>
                  {entry.displayName}{" "}
                  <span className="text-xs text-muted-foreground">({entry.code})</span>
                </span>
                {selected ? <Check size={14} aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
