import { describe, expect, it } from "vite-plus/test";
import { printDocumentTitle } from "./document-title.ts";

describe("printDocumentTitle", () => {
  it("uses the trimmed deck name", () => {
    expect(printDocumentTitle("  My Spell Deck  ")).toBe("My Spell Deck");
  });

  it("sanitizes characters that are invalid in filenames", () => {
    expect(printDocumentTitle('Fire: Ice / "Storm" <Core> | Test? *')).toBe(
      "Fire Ice Storm Core Test",
    );
  });

  it("falls back to a dated generic name when the deck is unnamed", () => {
    expect(printDocumentTitle("", new Date(2026, 10, 5))).toBe("spell-cards-deck-2026-11-05");
  });

  it("falls back when the name contains only invalid characters", () => {
    expect(printDocumentTitle("...", new Date(2026, 10, 5))).toBe("spell-cards-deck-2026-11-05");
  });
});
