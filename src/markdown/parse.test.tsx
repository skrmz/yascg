import { describe, expect, it } from "vite-plus/test";
import {
  componentDescriptionBlocks,
  parseMarkdown,
  parseSpellBody,
  type BlockNode,
} from "@/markdown/parse.ts";
import { BlockList } from "@/markdown/render.tsx";
import { renderToStaticMarkup } from "react-dom/server";

const markers = { verbal: "ⓥ", somatic: "ⓢ" };

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
    const blocks = parseSpellBody(
      {
        description: ["Base text"],
        higherLevels: ["Scales up"],
      },
      "Higher Levels",
      markers,
    );
    expect(blocks.some((block) => block.type === "heading")).toBe(true);
    expect(textOf(blocks)).toContain("Scales up");
  });
});

describe("component description blocks", () => {
  it("appends verbal then somatic blocks after description and higher levels", () => {
    const blocks = parseSpellBody(
      {
        description: ["Base text"],
        higherLevels: ["Scales up"],
        components: {
          verbal: true,
          verbalDescription: "Speak the word",
          somatic: true,
          somaticDescription: "Trace a sigil",
          material: false,
        },
      },
      "Higher Levels",
      markers,
    );
    const joined = textOf(blocks);
    expect(joined.indexOf("Scales up")).toBeLessThan(joined.indexOf("Speak the word"));
    expect(joined.indexOf("Speak the word")).toBeLessThan(joined.indexOf("Trace a sigil"));
    expect(joined).toContain("ⓥ Speak the word");
    expect(joined).toContain("ⓢ Trace a sigil");
  });

  it("omits blocks for disabled or empty components", () => {
    const blocks = componentDescriptionBlocks(
      {
        components: {
          verbal: false,
          verbalDescription: "Hidden",
          somatic: true,
          somaticDescription: "   ",
          material: false,
        },
      },
      markers,
    );
    expect(blocks).toHaveLength(0);
  });

  it("returns no blocks when the spell has no components", () => {
    expect(componentDescriptionBlocks({}, markers)).toHaveLength(0);
  });

  it("builds the marker text without markdown interpretation", () => {
    const blocks = componentDescriptionBlocks(
      {
        components: {
          verbal: true,
          verbalDescription: "**bold** stays literal",
          somatic: false,
          material: false,
        },
      },
      markers,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].children).toEqual([{ type: "text", value: "ⓥ **bold** stays literal" }]);
  });
});
