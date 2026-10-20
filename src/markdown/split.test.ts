import { describe, expect, it } from "vite-plus/test";
import type { BlockNode, InlineNode } from "@/markdown/parse.ts";
import {
  appendEllipsis,
  flattenInline,
  paginateBlocks,
  segmentGraphemes,
  splitFragmentsAt,
  truncateBlocksToFit,
} from "@/markdown/split.ts";

function text(value: string): InlineNode {
  return { type: "text", value };
}

function paragraph(value: string): BlockNode {
  return { type: "paragraph", children: [text(value)] };
}

function heading(value: string): BlockNode {
  return { type: "heading", depth: 3, children: [text(value)] };
}

function blockTextLength(block: BlockNode): number {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return block.children.reduce((sum, node) => sum + node.value.length, 0);
    case "list":
      return block.items.reduce(
        (sum, item) => sum + item.reduce((inner, node) => inner + node.value.length, 0),
        0,
      );
    default:
      return 1;
  }
}

function fitsWithin(capacity: number) {
  return (page: readonly BlockNode[]) =>
    page.reduce((sum, block) => sum + blockTextLength(block), 0) <= capacity;
}

function pageText(page: readonly BlockNode[]): string {
  return page
    .map((block) => {
      if (block.type === "paragraph" || block.type === "heading") {
        return block.children.map((node) => node.value).join("");
      }
      if (block.type === "list") {
        return block.items.map((item) => item.map((n) => n.value).join("")).join("|");
      }
      return "";
    })
    .join("");
}

describe("grapheme segmentation", () => {
  it("keeps emoji ZWJ sequences intact", () => {
    expect(segmentGraphemes("👨‍👩‍👧")).toHaveLength(1);
  });

  it("keeps combining marks with their base", () => {
    expect(segmentGraphemes("e\u0301")).toHaveLength(1);
  });
});

describe("splitFragmentsAt", () => {
  it("preserves both sides and formatting", () => {
    const fragments = flattenInline([
      { type: "text", value: "Hello " },
      { type: "strong", value: "world" },
    ]);
    const { prefix, rest } = splitFragmentsAt(fragments, 6);
    expect(prefix.map((f) => f.text).join("")).toBe("Hello ");
    expect(rest.map((f) => f.text).join("")).toBe("world");
    expect(rest[0].strong).toBe(true);
  });
});

describe("paginateBlocks", () => {
  it("prevents orphaning a heading at the bottom of a page", () => {
    const blocks = [paragraph("A".repeat(10)), heading("H"), paragraph("B".repeat(10))];
    const result = paginateBlocks(blocks, fitsWithin(12));
    expect(result.overflow).toBe(false);
    expect(result.pages).toHaveLength(2);
    expect(pageText(result.pages[0])).toBe("A".repeat(10));
    expect(pageText(result.pages[1])).toBe(`H${"B".repeat(10)}`);
  });

  it("splits an over-long block at grapheme boundaries without dropping text", () => {
    const blocks = [paragraph("abcdefghij")];
    const result = paginateBlocks(blocks, fitsWithin(5));
    expect(result.pages).toHaveLength(2);
    expect(pageText(result.pages[0])).toBe("abcde");
    expect(pageText(result.pages[1])).toBe("fghij");
  });

  it("flags overflow when an unbreakable block cannot fit", () => {
    const blocks = [paragraph("abcdefghij")];
    const result = paginateBlocks(blocks, fitsWithin(0));
    expect(result.overflow).toBe(true);
  });

  it("caps at the continuation-card limit", () => {
    const blocks = [paragraph("ab"), paragraph("cd"), paragraph("ef")];
    const result = paginateBlocks(blocks, fitsWithin(2), 2);
    expect(result.pages).toHaveLength(2);
    expect(result.overflow).toBe(true);
  });

  it("keeps ordered list items", () => {
    const blocks: BlockNode[] = [
      { type: "list", ordered: true, items: [[text("one")], [text("two")]] },
    ];
    const result = paginateBlocks(blocks, fitsWithin(3));
    const all = result.pages.flat();
    const items = all.flatMap((block) =>
      block.type === "list" ? block.items.map((item) => item[0].value) : [],
    );
    expect(items).toEqual(["one", "two"]);
  });
});

describe("truncateBlocksToFit", () => {
  it("returns the largest safe prefix and marks truncation", () => {
    const blocks = [paragraph("aa"), paragraph("bb"), paragraph("cc")];
    const result = truncateBlocksToFit(blocks, fitsWithin(4));
    expect(result.truncated).toBe(true);
    expect(result.blocks).toHaveLength(2);
    const withEllipsis = appendEllipsis(result.blocks);
    const last = withEllipsis[withEllipsis.length - 1];
    const lastValue = last.type === "paragraph" ? last.children.map((n) => n.value).join("") : "";
    expect(lastValue.endsWith("\u2026")).toBe(true);
  });
});
