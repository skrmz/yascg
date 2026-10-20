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

/**
 * Resolves the language to use at startup. A persisted tag is restored only when
 * it exists in the current manifest; otherwise we fall back to English and report
 * the stale value so the UI can explain the change.
 */
export function resolveInitialLanguage(
  manifest: readonly BundledSpellLanguage[],
  preference: string | null = readLanguagePreference(),
): LanguagePreferenceResult {
  const available = new Set(manifest.map((entry) => entry.code));
  if (preference && available.has(preference)) {
    return { code: preference, fallbackFrom: null, storageFailed: false };
  }
  return {
    code: "en",
    fallbackFrom: preference,
    storageFailed: false,
  };
}
