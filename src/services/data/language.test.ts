import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  LANGUAGE_PREFERENCE_KEY,
  readLanguagePreference,
  resolveInitialLanguage,
  writeLanguagePreference,
} from "@/services/data/language.ts";
import type { BundledSpellLanguage } from "@/services/data/load.ts";

const manifest: BundledSpellLanguage[] = [
  { code: "en", displayName: "English", dataset: "/spells.srd.json" },
  { code: "de", displayName: "Deutsch", dataset: "/spells.srd.de.json" },
];

beforeEach(() => {
  localStorage.clear();
});

describe("language preference", () => {
  it("round-trips a written preference", () => {
    const result = writeLanguagePreference("de");
    expect(result.persisted).toBe(true);
    expect(readLanguagePreference()).toBe("de");
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_KEY)).toBe("de");
  });

  it("keeps the selection in memory and reports failure when storage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const result = writeLanguagePreference("de");
    expect(result.persisted).toBe(false);
    spy.mockRestore();
  });

  it("restores a preference that exists in the manifest", () => {
    expect(resolveInitialLanguage(manifest, "de")).toEqual({
      code: "de",
      fallbackFrom: null,
      storageFailed: false,
    });
  });

  it("falls back to English and reports a stale preference", () => {
    expect(resolveInitialLanguage(manifest, "fr")).toEqual({
      code: "en",
      fallbackFrom: "fr",
      storageFailed: false,
    });
  });

  it("defaults to English with no preference", () => {
    expect(resolveInitialLanguage(manifest, null).code).toBe("en");
  });
});
