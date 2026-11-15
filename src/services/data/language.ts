import type { BundledSpellLanguage } from "./load.ts";

export const LANGUAGE_PREFERENCE_KEY = "spellCards.language";

export interface LanguagePreferenceResult {
  code: string;
  /** The stale preference that was overridden, when a fallback happened. */
  fallbackFrom: string | null;
  /** True when a preference value existed but could not be persisted. */
  storageFailed: boolean;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readLanguagePreference(): string | null {
  try {
    return storage()?.getItem(LANGUAGE_PREFERENCE_KEY) ?? null;
  } catch {
    return null;
  }
}

export interface WriteResult {
  persisted: boolean;
}

export function writeLanguagePreference(code: string): WriteResult {
  try {
    const target = storage();
    if (!target) return { persisted: false };
    target.setItem(LANGUAGE_PREFERENCE_KEY, code);
    return { persisted: true };
  } catch {
    return { persisted: false };
  }
}

export function clearLanguagePreference(): void {
  try {
    storage()?.removeItem(LANGUAGE_PREFERENCE_KEY);
  } catch {
    // Ignore; clearing a preference is best-effort.
  }
}

function readBrowserLanguages(): readonly string[] {
  try {
    const nav = globalThis.navigator;
    if (!nav) return [];
    if (nav.languages && nav.languages.length > 0) return nav.languages;
    return nav.language ? [nav.language] : [];
  } catch {
    return [];
  }
}

/**
 * Picks the first browser language tag backed by a UI catalog, ignoring region and
 * script subtags. Unsupported languages fall back to English.
 */
export function detectBrowserLanguage(
  candidates: readonly string[] = readBrowserLanguages(),
): "en" | "de" {
  for (const tag of candidates) {
    const base = tag.trim().toLowerCase().split(/[-_]/)[0];
    if (base === "en" || base === "de") return base;
  }
  return "en";
}

/**
 * Resolves the language to use at startup. A persisted tag is restored only when
 * it exists in the current manifest; otherwise the browser language is used when
 * it is English or German, falling back to English. A stale preference is reported
 * so the UI can explain the change.
 */
export function resolveInitialLanguage(
  manifest: readonly BundledSpellLanguage[],
  preference: string | null = readLanguagePreference(),
  browserLanguages: readonly string[] = readBrowserLanguages(),
): LanguagePreferenceResult {
  const available = new Set(manifest.map((entry) => entry.code));
  if (preference && available.has(preference)) {
    return { code: preference, fallbackFrom: null, storageFailed: false };
  }
  const detected = detectBrowserLanguage(browserLanguages);
  return {
    code: available.has(detected) ? detected : "en",
    fallbackFrom: preference,
    storageFailed: false,
  };
}
