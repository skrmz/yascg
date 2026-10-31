import { describe, expect, it } from "vite-plus/test";
import { CARD_DESIGNS, DEFAULT_CARD_DESIGN, normalizeCardDesign } from "@/cards/design.ts";

describe("card design selection", () => {
  it("provides exactly Classic and Compact with Classic as default", () => {
    expect(CARD_DESIGNS).toEqual(["classic", "compact"]);
    expect(DEFAULT_CARD_DESIGN).toBe("classic");
  });

  it("normalizes absent and invalid selections to Classic", () => {
    expect(normalizeCardDesign(undefined)).toBe("classic");
    expect(normalizeCardDesign(null)).toBe("classic");
    expect(normalizeCardDesign("ornate")).toBe("classic");
    expect(normalizeCardDesign("compact")).toBe("compact");
  });
});
