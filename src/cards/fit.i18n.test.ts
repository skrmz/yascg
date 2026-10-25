import { describe, expect, it } from "vite-plus/test";
import {
  AUTO_SHRINK_STEPS,
  MULTI_CARD_FONT_PT,
  computeFit,
  type MeasureFit,
} from "@/cards/fit.tsx";
import { parseSpellBody, type BlockNode } from "@/markdown/parse.ts";

const spell = {
  description: ["Base spell text."],
  higherLevels: ["Scales with a higher slot."],
};

const markers = { verbal: "ⓥ", somatic: "ⓢ" };

const richSpell = {
  description: ["Base spell text."],
  higherLevels: ["Scales with a higher slot."],
  components: {
    verbal: true,
    verbalDescription: "A very long verbal description ".repeat(8).trim(),
    somatic: true,
    somaticDescription: "A very long somatic description ".repeat(8).trim(),
    material: false,
  },
};

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function headingText(blocks: readonly BlockNode[]): string | null {
  const heading = blocks.find((block) => block.type === "heading");
  if (!heading || heading.type !== "heading") return null;
  return heading.children.map((child) => child.value).join("");
}

function lastBlockText(blocks: readonly BlockNode[]): string | null {
  const last = blocks[blocks.length - 1];
  if (!last) return null;
  if (last.type !== "paragraph" && last.type !== "heading") return null;
  return last.children.map((child) => child.value).join("");
}

function measureByBlockCount(maxBlocks: number): MeasureFit {
  return (blocks) => blocks.length <= maxBlocks;
}

function paragraph(value: string): BlockNode {
  return { type: "paragraph", children: [{ type: "text", value }] };
}

describe("multi-card pagination layout", () => {
  it("measures pages after the first with the continuation-card layout", () => {
    const blocks = ["a", "b", "c", "d", "e", "f"].map(paragraph);
    const measure: MeasureFit = (page, _fontPt, continuation) =>
      page.length <= (continuation ? 4 : 2);

    const fit = computeFit(blocks, measure, "multi-card");

    expect(fit.pages.map((page) => page.length)).toEqual([2, 4]);
    expect(fit.pages.flat()).toHaveLength(blocks.length);
    expect(fit.fontPt).toBe(MULTI_CARD_FONT_PT);
    expect(fit.overflow).toBe(false);
  });

  it("keeps auto-shrink on the first-card layout", () => {
    const continuations: boolean[] = [];
    const measure: MeasureFit = (_page, _fontPt, continuation) => {
      continuations.push(continuation);
      return continuation === false;
    };

    const fit = computeFit([paragraph("Short")], measure, "auto-shrink");

    expect(fit.pages).toHaveLength(1);
    expect(continuations.every((continuation) => continuation === false)).toBe(true);
  });
});

describe("computeFit across localized headings", () => {
  it("parses the localized Higher Levels heading per locale", () => {
    const english = parseSpellBody(spell, "Higher Levels", markers);
    const german = parseSpellBody(spell, "Höhere Grade", markers);
    expect(headingText(english)).toBe("Higher Levels");
    expect(headingText(german)).toBe("Höhere Grade");
    expect(english).toHaveLength(3);
    expect(german).toHaveLength(3);
  });

  it("auto-shrinks identically for English and German headings", () => {
    const english = computeFit(
      parseSpellBody(spell, "Higher Levels", markers),
      measureByBlockCount(3),
      "auto-shrink",
    );
    const german = computeFit(
      parseSpellBody(spell, "Höhere Grade", markers),
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

  it("truncates with a visible ellipsis identically when no single card fits", () => {
    const english = computeFit(
      parseSpellBody(spell, "Higher Levels", markers),
      measureByBlockCount(2),
      "auto-shrink",
    );
    const german = computeFit(
      parseSpellBody(spell, "Höhere Grade", markers),
      measureByBlockCount(2),
      "auto-shrink",
    );
    expect(english.truncated).toBe(true);
    expect(german.truncated).toBe(true);
    expect(english.pages).toHaveLength(1);
    expect(german.pages).toHaveLength(1);
    expect(lastBlockText(english.pages[0] ?? [])).toBe("Base spell text.\u2026");
    expect(lastBlockText(german.pages[0] ?? [])).toBe("Base spell text.\u2026");
    expect(headingText(english.pages[0] ?? [])).toBeNull();
    expect(headingText(german.pages[0] ?? [])).toBeNull();
  });

  it("reports continuation overflow identically for both locales", () => {
    const english = computeFit(
      parseSpellBody(spell, "Higher Levels", markers),
      measureByBlockCount(1),
      "multi-card",
      1,
    );
    const german = computeFit(
      parseSpellBody(spell, "Höhere Grade", markers),
      measureByBlockCount(1),
      "multi-card",
      1,
    );
    expect(english.overflow).toBe(true);
    expect(german.overflow).toBe(true);
  });
});

describe("component blocks through the fit pipeline", () => {
  it("keeps component blocks in order in auto-shrink mode", () => {
    const blocks = parseSpellBody(richSpell, "Higher Levels", markers);
    const fit = computeFit(blocks, measureByBlockCount(blocks.length), "auto-shrink");
    expect(fit.pages).toHaveLength(1);
    const text = JSON.stringify(fit.pages);
    expect(countOccurrences(text, "ⓥ ")).toBe(1);
    expect(countOccurrences(text, "ⓢ ")).toBe(1);
    expect(text.indexOf("Scales with a higher slot.")).toBeLessThan(text.indexOf("ⓥ "));
    expect(text.indexOf("ⓥ ")).toBeLessThan(text.indexOf("ⓢ "));
  });

  it("emits each component block exactly once across continuation cards", () => {
    const blocks = parseSpellBody(richSpell, "Higher Levels", markers);
    const fit = computeFit(blocks, measureByBlockCount(2), "multi-card");
    expect(fit.pages.length).toBeGreaterThan(1);
    const text = JSON.stringify(fit.pages);
    expect(countOccurrences(text, "ⓥ ")).toBe(1);
    expect(countOccurrences(text, "ⓢ ")).toBe(1);
    expect(text.indexOf("ⓥ ")).toBeLessThan(text.indexOf("ⓢ "));
    const total = fit.pages.reduce((sum, page) => sum + page.length, 0);
    expect(total).toBe(blocks.length);
  });
});
