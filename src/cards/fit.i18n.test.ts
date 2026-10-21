import { describe, expect, it } from "vite-plus/test";
import { AUTO_SHRINK_STEPS, computeFit, type MeasureFit } from "@/cards/fit.tsx";
import { parseSpellBody, type BlockNode } from "@/markdown/parse.ts";

const spell = {
  description: ["Base spell text."],
  higherLevels: ["Scales with a higher slot."],
};

function headingText(blocks: readonly BlockNode[]): string | null {
  const heading = blocks.find((block) => block.type === "heading");
  if (!heading || heading.type !== "heading") return null;
  return heading.children.map((child) => child.value).join("");
}

function measureByBlockCount(maxBlocks: number): MeasureFit {
  return (blocks) => blocks.length <= maxBlocks;
}

describe("computeFit across localized headings", () => {
  it("parses the localized Higher Levels heading per locale", () => {
    const english = parseSpellBody(spell, "Higher Levels");
    const german = parseSpellBody(spell, "Höhere Grade");
    expect(headingText(english)).toBe("Higher Levels");
    expect(headingText(german)).toBe("Höhere Grade");
    expect(english).toHaveLength(3);
    expect(german).toHaveLength(3);
  });

  it("auto-shrinks identically for English and German headings", () => {
    const english = computeFit(
      parseSpellBody(spell, "Higher Levels"),
      measureByBlockCount(3),
      "auto-shrink",
    );
    const german = computeFit(
      parseSpellBody(spell, "Höhere Grade"),
      measureByBlockCount(3),
      "auto-shrink",
    );
    expect(english.pages).toHaveLength(1);
    expect(german.pages).toHaveLength(1);
    expect(english.fontPt).toBe(AUTO_SHRINK_STEPS[0]);
    expect(german.fontPt).toBe(AUTO_SHRINK_STEPS[0]);
    expect(english.truncated).toBe(false);
    expect(german.truncated).toBe(false);
    expect(headingText(english.pages[0] ?? [])).toBe("Higher Levels");
    expect(headingText(german.pages[0] ?? [])).toBe("Höhere Grade");
  });

  it("takes the truncation path identically when the heading never fits", () => {
    const english = computeFit(
      parseSpellBody(spell, "Higher Levels"),
      measureByBlockCount(2),
      "auto-shrink",
    );
    const german = computeFit(
      parseSpellBody(spell, "Höhere Grade"),
      measureByBlockCount(2),
      "auto-shrink",
    );
    expect(english.truncated).toBe(true);
    expect(german.truncated).toBe(true);
    expect(english.overflow).toBe(false);
    expect(german.overflow).toBe(false);
  });

  it("reports continuation overflow identically for both locales", () => {
    const english = computeFit(
      parseSpellBody(spell, "Higher Levels"),
      measureByBlockCount(1),
      "multi-card",
      1,
    );
    const german = computeFit(
      parseSpellBody(spell, "Höhere Grade"),
      measureByBlockCount(1),
      "multi-card",
      1,
    );
    expect(english.overflow).toBe(true);
    expect(german.overflow).toBe(true);
  });
});
