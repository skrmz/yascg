import { describe, expect, it } from "vite-plus/test";
import { parseMarkdown, parseSpellBody, type BlockNode } from "@/markdown/parse.ts";
import { BlockList } from "@/markdown/render.tsx";
import { renderToStaticMarkup } from "react-dom/server";

function textOf(blocks: readonly BlockNode[]): string {
  return JSON.stringify(blocks);
}

describe("parseMarkdown safety", () => {
  it("drops raw HTML", () => {
    const blocks = parseMarkdown("<script>alert('x')</script>\n\nSafe text");
    expect(textOf(blocks)).not.toContain("script");
    expect(textOf(blocks)).not.toContain("alert");
    const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
    expect(markup).not.toContain("<script");
    expect(markup).toContain("Safe text");
  });

  it("renders links as non-clickable text", () => {
    const blocks = parseMarkdown("[Click me](https://example.com)");
    const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
    expect(markup).toContain("Click me");
    expect(markup).not.toContain("href");
    expect(markup).not.toContain("<a");
    expect(markup).not.toContain("example.com");
  });

  it("renders images as alt text without remote assets", () => {
    const blocks = parseMarkdown("![alt text](https://example.com/x.png)");
    const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("example.com");
    expect(markup).toContain("alt text");
  });

  it("parses lists into list items", () => {
    const blocks = parseMarkdown("- one\n- two");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("list");
    if (blocks[0].type === "list") {
      expect(blocks[0].items).toHaveLength(2);
    }
  });

  it("parses tables", () => {
    const blocks = parseMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(blocks[0].type).toBe("table");
    if (blocks[0].type === "table") {
      expect(blocks[0].header).toHaveLength(2);
      expect(blocks[0].rows).toHaveLength(1);
    }
  });

  it("keeps emphasis structure", () => {
    const blocks = parseMarkdown("**bold** and *italic*");
    const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
    expect(markup).toContain("<strong>bold</strong>");
    expect(markup).toContain("<em>italic</em>");
  });

  it("appends a Higher Levels heading for higher-level text", () => {
    const blocks = parseSpellBody({
      description: ["Base text"],
      higherLevels: ["Scales up"],
    });
    expect(blocks.some((block) => block.type === "heading")).toBe(true);
    expect(textOf(blocks)).toContain("Scales up");
  });
});
