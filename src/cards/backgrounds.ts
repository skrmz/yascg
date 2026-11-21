import type { CSSProperties } from "react";

/**
 * Backgrounds are discovered at build time. The deployed app is a static
 * bundle and cannot read the asset folder at runtime, so a new image requires
 * a rebuild; Vite's glob watcher reloads a running dev server on changes.
 */
const BACKGROUND_MODULES = import.meta.glob("../assets/images/card-backgrounds/*.{jpg,jpeg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export const CARD_BACKGROUND_NONE = "none";

export type CardBackground = string | { id: string; url: string };

export interface CardBackgroundOption {
  id: string;
  label: string;
  url: string;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export const CARD_BACKGROUNDS: readonly CardBackgroundOption[] = Object.entries(BACKGROUND_MODULES)
  .map(([path, url]) => {
    const id = fileName(path);
    return { id, label: id, url };
  })
  .sort((left, right) => left.id.localeCompare(right.id, undefined, { sensitivity: "base" }));

const CARD_BACKGROUND_URLS = new Map(CARD_BACKGROUNDS.map((option) => [option.id, option.url]));

const CARD_BACKGROUND_IDS = new Set([CARD_BACKGROUND_NONE, ...CARD_BACKGROUND_URLS.keys()]);

export const DEFAULT_CARD_BACKGROUND = CARD_BACKGROUND_NONE;

export function cardBackgroundLabel(id: string, maxLength = 36): string {
  return id.length <= maxLength ? id : `${id.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function cardBackgroundId(background: CardBackground): string {
  return typeof background === "string" ? background : background.id;
}

export function cardBackgroundUrl(background?: CardBackground | null): string | null {
  if (!background || background === CARD_BACKGROUND_NONE) return null;
  return typeof background === "string"
    ? (CARD_BACKGROUND_URLS.get(background) ?? null)
    : background.url;
}

export function cardBackgroundStyle(background?: CardBackground | null): CSSProperties {
  const url = cardBackgroundUrl(background);
  return url ? { ["--card-background-image" as string]: `url("${url}")` } : {};
}

export function normalizeCardBackground(value: unknown): string {
  return typeof value === "string" && CARD_BACKGROUND_IDS.has(value)
    ? value
    : DEFAULT_CARD_BACKGROUND;
}

/**
 * Resolve once the selected texture is fully decoded, so window.print() does not
 * capture a card before its background is paintable. `decode()` (when available)
 * is stronger than `onload`: it completes only after the image can be rendered.
 * Loading or decoding failure resolves too, so a missing image never blocks
 * printing. The `onload`/`onerror` fallback covers browsers without `decode`.
 */
export function loadCardBackground(background?: CardBackground | null): Promise<void> {
  const url = cardBackgroundUrl(background);
  if (!url || typeof Image === "undefined") return Promise.resolve();

  const image = new Image();
  return new Promise((resolve) => {
    const settle = () => resolve();
    if (typeof image.decode === "function") {
      image.src = url;
      void image.decode().then(settle, settle);
      return;
    }
    image.onload = settle;
    image.onerror = settle;
    image.src = url;
  });
}
