import { afterEach, describe, expect, it } from "vite-plus/test";
import { applyDocumentLanguage, toUiLocale } from "@/i18n.ts";

afterEach(() => {
  applyDocumentLanguage("en");
});

describe("UI locale helpers", () => {
  it("maps resolved dataset languages onto supported UI locales", () => {
    expect(toUiLocale("de")).toBe("de");
    expect(toUiLocale("en")).toBe("en");
    expect(toUiLocale("fr")).toBe("en");
  });

  it("updates the document language", () => {
    applyDocumentLanguage("de");
    expect(document.documentElement.lang).toBe("de");
    applyDocumentLanguage("fr");
    expect(document.documentElement.lang).toBe("en");
  });
});
