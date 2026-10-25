import { describe, expect, it } from "vite-plus/test";
import {
  AUTO_SHRINK_MIN_PT,
  AUTO_SHRINK_STEPS,
  MULTI_CARD_FONT_PT,
  computeFit,
  type MeasureFit,
} from "@/cards/fit.tsx";
import type { BlockNode, InlineNode } from "@/markdown/parse.ts";

function paragraph(value: string): BlockNode {
  return { type: "paragraph", children: [{ type: "text", value }] };
}

function heading(value: string): BlockNode {
  return { type: "heading", depth: 3, children: [{ type: "text", value }] };
}

function list(items: readonly string[]): BlockNode {
  return {
    type: "list",
    ordered: false,
    items: items.map((value): InlineNode[] => [{ type: "text", value }]),
  };
}

function inlineText(nodes: readonly InlineNode[]): string {
  return nodes.map((node) => node.value).join("");
}

function blockText(block: BlockNode): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return inlineText(block.children);
    case "list":
      return block.items.map(inlineText).join("");
    case "table":
      return [...block.header, ...block.rows.flat()].map(inlineText).join("");
    case "code":
      return block.value;
    default:
      return "";
  }
}

function allText(blocks: readonly BlockNode[]): string {
  return blocks.map(blockText).join("");
}

/** Simulates a fixed physical card height by budgeting visible characters. */
function charBudget(budget: number): MeasureFit {
  return (blocks) => allText(blocks).length <= budget;
}

const longBody: BlockNode[] = [
  heading("Effects"),
  paragraph(
    "The first paragraph describes the initial effect in enough detail that it cannot share a card with everything else. ".repeat(
      3,
    ),
  ),
  paragraph(
    "A second paragraph adds further clauses, saving throws, and conditions that must survive pagination intact. ".repeat(
      2,
    ),
  ),
  list([
    "Each creature in the area makes a Dexterity saving throw.",
    "On a failed save the target takes fire damage and is blinded.",
    "On a successful save the target takes half damage and nothing else.",
  ]),
];

describe("auto-shrink single-card fitting", () => {
  it("uses the largest font size that fits without truncation", () => {
    const fit = computeFit([paragraph("short text")], charBudget(100), "auto-shrink");

    expect(fit.pages).toHaveLength(1);
    expect(fit.fontPt).toBe(AUTO_SHRINK_STEPS[0]);
    expect(fit.truncated).toBe(false);
    expect(fit.overflow).toBe(false);
  });

  it("uses the 6pt minimum when only the smallest size fits", () => {
    const measure: MeasureFit = (page, fontPt) =>
      allText(page).length <= (fontPt <= AUTO_SHRINK_MIN_PT ? 100 : 10);
    const fit = computeFit([paragraph("x".repeat(80))], measure, "auto-shrink");

    expect(fit.pages).toHaveLength(1);
    expect(fit.fontPt).toBe(AUTO_SHRINK_MIN_PT);
    expect(fit.truncated).toBe(false);
  });

  it("measures only the first-card layout", () => {
    const seen: boolean[] = [];
    const measure: MeasureFit = (page, _fontPt, continuation) => {
      seen.push(continuation);
      return page.length <= 100;
    };

    computeFit([paragraph("short")], measure, "auto-shrink");

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((continuation) => continuation === false)).toBe(true);
  });

  it("truncates to one card with a trailing ellipsis when 6pt is not enough", () => {
    const text = "word ".repeat(200).trim();
    const fit = computeFit([paragraph(text)], charBudget(120), "auto-shrink");

    expect(fit.pages).toHaveLength(1);
    expect(fit.fontPt).toBe(AUTO_SHRINK_MIN_PT);
    expect(fit.truncated).toBe(true);
    expect(fit.overflow).toBe(false);

    const page = allText(fit.pages[0] ?? []);
    expect(page.endsWith("\u2026")).toBe(true);
    expect(page.length).toBeLessThanOrEqual(120);
    expect(text.startsWith(page.slice(0, -1))).toBe(true);
  });

  it("counts the ellipsis as part of the fitted prefix", () => {
    const text = "abcdefghijklmnopqrstuvwxyz0123456789";
    const fit = computeFit([paragraph(text)], charBudget(20), "auto-shrink");

    const page = allText(fit.pages[0] ?? []);
    expect(fit.truncated).toBe(true);
    expect(page).toBe(`${text.slice(0, 19)}\u2026`);
    expect(page.length).toBe(20);
  });

  it("drops a trailing heading so the ellipsis stays visible", () => {
    const source: BlockNode[] = [
      paragraph("short body"),
      heading("Trailing heading"),
      { type: "code", value: "x".repeat(120) },
    ];
    const fit = computeFit(source, charBudget(40), "auto-shrink");

    const page = fit.pages[0] ?? [];
    expect(fit.truncated).toBe(true);
    expect(page).toHaveLength(1);
    expect(page[0]?.type).toBe("paragraph");
    expect(allText(page)).toBe("short body\u2026");
  });

  it("keeps list structure when truncating the final item", () => {
    const source = [list(["first item", "second item", "third item"])];
    const fit = computeFit(source, charBudget(20), "auto-shrink");

    const page = fit.pages[0] ?? [];
    expect(fit.truncated).toBe(true);
    expect(page).toHaveLength(1);
    const block = page[0];
    expect(block?.type).toBe("list");
    if (block?.type === "list") {
      expect(block.items.length).toBeGreaterThan(0);
      for (const item of block.items) expect(inlineText(item).length).toBeGreaterThan(0);
    }
    const text = allText(page);
    expect(text.endsWith("\u2026")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(20);
  });

  it("does not append an ellipsis when the content fits", () => {
    const source = [paragraph("complete text")];
    const fit = computeFit(source, charBudget(100), "auto-shrink");

    expect(fit.truncated).toBe(false);
    expect(allText(fit.pages[0] ?? [])).toBe("complete text");
  });
});

describe("multi-card pagination", () => {
  it("keeps all content across continuation cards", () => {
    const fit = computeFit(longBody, charBudget(160), "multi-card");

    expect(fit.pages.length).toBeGreaterThan(1);
    expect(fit.fontPt).toBe(MULTI_CARD_FONT_PT);
    expect(fit.truncated).toBe(false);
    expect(fit.overflow).toBe(false);
    expect(allText(fit.pages.flat())).toBe(allText(longBody));
  });

  it("splits an oversized paragraph without losing or duplicating text", () => {
    const text =
      "Alpha bravo charlie delta echo foxtrot golf hotel india juliett kilo lima mike november. "
        .repeat(4)
        .trim();
    const fit = computeFit([paragraph(text)], charBudget(60), "multi-card");

    expect(fit.pages.length).toBeGreaterThan(1);
    expect(fit.truncated).toBe(false);
    expect(allText(fit.pages.flat())).toBe(text);
    for (const page of fit.pages) {
      expect(page.length).toBeGreaterThan(0);
      expect(allText(page).length).toBeLessThanOrEqual(60);
    }
  });

  it("preserves list items, their order, and a single heading across cards", () => {
    const items = [
      "Burning brands sear the target for one round.",
      "The target's speed is halved until the end of its turn.",
      "A shimmering ward absorbs the next hit.",
      "Flames spread to each creature within five feet.",
      "The caster gains temporary hit points.",
      "Smoke obscures the area until the wind shifts.",
    ];
    const source: BlockNode[] = [heading("Effects"), list(items)];
    const fit = computeFit(source, charBudget(80), "multi-card");

    expect(fit.pages.length).toBeGreaterThan(1);
    expect(fit.truncated).toBe(false);
    expect(allText(fit.pages.flat())).toBe(allText(source));

    const flattened = allText(fit.pages.flat());
    for (const item of items) {
      expect(flattened.split(item)).toHaveLength(2);
    }
    const headings = fit.pages.flat().filter((block) => block.type === "heading");
    expect(headings).toHaveLength(1);
    for (const page of fit.pages) expect(page.length).toBeGreaterThan(0);
  });

  it("splits a list item that cannot fit on any card", () => {
    const item =
      "A single very long list item keeps its words, punctuation, and reading order intact even when it has to span a card boundary.";
    const source: BlockNode[] = [list([item])];
    const fit = computeFit(source, charBudget(40), "multi-card");

    expect(fit.pages.length).toBeGreaterThan(1);
    expect(allText(fit.pages.flat())).toBe(item);
    for (const page of fit.pages) {
      expect(page.length).toBeGreaterThan(0);
      for (const block of page) {
        expect(block.type).toBe("list");
        if (block.type === "list") {
          expect(block.items.length).toBeGreaterThan(0);
          for (const entry of block.items) expect(inlineText(entry).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("reports overflow instead of truncating when the continuation cap is exceeded", () => {
    const fit = computeFit([paragraph("word ".repeat(40).trim())], charBudget(30), "multi-card", 2);

    expect(fit.overflow).toBe(true);
    expect(fit.truncated).toBe(false);
  });
});

describe("fit mode selection", () => {
  it("truncates in auto-shrink while multi-card keeps the same content", () => {
    const source = [paragraph("word ".repeat(80).trim())];

    const auto = computeFit(source, charBudget(60), "auto-shrink");
    const multi = computeFit(source, charBudget(60), "multi-card");

    expect(auto.pages).toHaveLength(1);
    expect(auto.truncated).toBe(true);
    expect(allText(auto.pages[0] ?? []).length).toBeLessThanOrEqual(60);

    expect(multi.pages.length).toBeGreaterThan(1);
    expect(multi.truncated).toBe(false);
    expect(allText(multi.pages.flat())).toBe(allText(source));
  });
});
