import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  LANGUAGE_PREFERENCE_KEY,
  detectBrowserLanguage,
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
    expect(resolveInitialLanguage(manifest, null, ["en-US"]).code).toBe("en");
  });

  it("detects English and German browser tags regardless of region", () => {
    expect(detectBrowserLanguage(["de-AT", "en-US"])).toBe("de");
    expect(detectBrowserLanguage(["en-GB"])).toBe("en");
    expect(detectBrowserLanguage(["DE"])).toBe("de");
    expect(detectBrowserLanguage(["en_US"])).toBe("en");
  });

  it("falls back to English for unsupported browser languages", () => {
    expect(detectBrowserLanguage(["fr-FR", "it-IT"])).toBe("en");
    expect(detectBrowserLanguage([])).toBe("en");
  });

  it("uses the browser language when no preference is stored", () => {
    expect(resolveInitialLanguage(manifest, null, ["de-DE", "en-US"])).toEqual({
      code: "de",
      fallbackFrom: null,
      storageFailed: false,
    });
    expect(resolveInitialLanguage(manifest, null, ["fr-FR"]).code).toBe("en");
  });

  it("prefers a valid stored preference over the browser language", () => {
    expect(resolveInitialLanguage(manifest, "en", ["de-DE"]).code).toBe("en");
  });

  it("ignores a detected language missing from the manifest", () => {
    const englishOnly: BundledSpellLanguage[] = [
      { code: "en", displayName: "English", dataset: "/spells.srd.json" },
    ];
    expect(resolveInitialLanguage(englishOnly, null, ["de-DE"]).code).toBe("en");
  });
});
