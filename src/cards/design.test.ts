import { describe, expect, it } from "vite-plus/test";
import { CARD_DESIGNS, DEFAULT_CARD_DESIGN, normalizeCardDesign } from "@/cards/design.ts";

describe("card design selection", () => {
  it("provides exactly Classic and Compact with Compact as default", () => {
    expect(CARD_DESIGNS).toEqual(["classic", "compact"]);
    expect(DEFAULT_CARD_DESIGN).toBe("compact");
  });

  it("normalizes absent and invalid selections to Compact", () => {
    expect(normalizeCardDesign(undefined)).toBe("compact");
    expect(normalizeCardDesign(null)).toBe("compact");
    expect(normalizeCardDesign("ornate")).toBe("compact");
    expect(normalizeCardDesign("classic")).toBe("classic");
    expect(normalizeCardDesign("compact")).toBe("compact");
  });
});
