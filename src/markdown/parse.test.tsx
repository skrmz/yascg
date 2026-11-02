import { describe, expect, it } from "vite-plus/test";
import {
  componentDescriptionBlocks,
  parseMarkdown,
  parseSpellBody,
  type BlockNode,
} from "@/markdown/parse.ts";
import { BlockList } from "@/markdown/render.tsx";
import { renderToStaticMarkup } from "react-dom/server";

const markers = { verbal: "V", somatic: "S" };

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

  it("renders safe external links when anchor mode is enabled", () => {
    const blocks = parseMarkdown("[Click me](https://example.com/path)", { links: "anchor" });
    const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
    expect(markup).toContain('<a href="https://example.com/path"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("Click me");
  });

  it("keeps unsafe and cross-origin relative links as text in anchor mode", () => {
    for (const target of ["javascript:alert(1)", "data:text/html,hello", "//evil.test"]) {
      const blocks = parseMarkdown(`[Click me](${target})`, { links: "anchor" });
      const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
      expect(markup).toContain("Click me");
      expect(markup).not.toContain("href");
      expect(markup).not.toContain("<a");
    }
  });

  it("renders same-origin root-relative links in anchor mode", () => {
    const blocks = parseMarkdown("[Click me](/asset.json)", { links: "anchor" });
    const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
    expect(markup).toContain('<a href="/asset.json"');
    expect(markup).toContain("Click me");
  });

  it("requests a download when the link title is download", () => {
    const blocks = parseMarkdown('[JSON Schema](/schema.json "download")', { links: "anchor" });
    const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
    expect(markup).toContain('<a href="/schema.json"');
    expect(markup).toContain('download=""');
    expect(markup).not.toContain('target="_blank"');
  });

  it("keeps spell description links as plain text after parsing", () => {
    const blocks = parseSpellBody(
      { description: ["Read [the source](https://example.com) for details."] },
      "Higher Levels",
      markers,
    );
    const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
    expect(markup).toContain("Read the source for details.");
    expect(markup).not.toContain("href");
    expect(markup).not.toContain("<a");
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

  it("keeps nested lists as children of their parent item", () => {
    const blocks = parseMarkdown("- one\n  - nested\n  - nested two\n- two");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("list");
    if (blocks[0].type !== "list") return;
    expect(blocks[0].sublists?.[0]?.[0]).toMatchObject({
      type: "list",
      ordered: false,
      items: [[{ type: "text", value: "nested" }], [{ type: "text", value: "nested two" }]],
    });
    expect(blocks[0].sublists?.[1]).toEqual([]);
  });

  it("keeps ordered list starts and renders visible list structure", () => {
    const blocks = parseMarkdown("3. third\n4. fourth\n\n- bullet");
    const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
    expect(markup).toContain('<ol class="card-ol" start="3">');
    expect(markup).toContain('<ul class="card-ul">');
    expect(markup).toContain("<li>third</li>");
    expect(markup).toContain("<li>bullet</li>");
  });

  it("renders nested list containers inside the parent item", () => {
    const blocks = parseMarkdown("- parent\n  - child");
    const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
    expect(markup).toContain('<li>parent<ul class="card-ul"><li>child</li></ul></li>');
  });

  it("renders headings with depth classes", () => {
    const blocks = parseMarkdown("# First\n\n## Second\n\n### Third");
    const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
    expect(markup).toContain('<h3 class="card-h card-h-level-1">First</h3>');
    expect(markup).toContain('<h3 class="card-h card-h-level-2">Second</h3>');
    expect(markup).toContain('<div class="card-h card-h-sub card-h-level-3">Third</div>');
  });

  it("renders blockquotes as a distinct container", () => {
    const blocks = parseMarkdown("> Quoted text\n>\n> - quoted item");
    expect(blocks[0]).toMatchObject({ type: "blockquote" });
    const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
    expect(markup).toContain('<blockquote class="card-blockquote">');
    expect(markup).toContain("Quoted text");
    expect(markup).toContain("quoted item");
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
    expect(joined).toContain('"type":"component"');
    expect(joined).toContain('"component":"verbal","value":"V"');
    expect(joined).toContain('"component":"somatic","value":"S"');
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
    expect(blocks[0].children).toEqual([
      { type: "component", component: "verbal", value: "V" },
      { type: "text", value: " **bold** stays literal" },
    ]);
  });

  it("renders component markers with localized accessible labels", () => {
    const blocks = componentDescriptionBlocks(
      {
        components: {
          verbal: true,
          verbalDescription: "Speak",
          somatic: true,
          somaticDescription: "Trace",
          material: false,
        },
      },
      markers,
    );
    const markup = renderToStaticMarkup(<BlockList blocks={blocks} />);
    expect(markup).toContain('class="component-marker"');
    expect(markup).toContain('aria-label="Verbal"');
    expect(markup).toContain('aria-label="Somatic"');
    expect(markup).toContain(">V</span>");
    expect(markup).toContain(">S</span>");
  });
});
