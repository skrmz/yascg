import { describe, expect, it } from "vite-plus/test";
import { checkMarkdownSafety } from "./markdown-safety.ts";

function constructs(markdown: string): string[] {
  return checkMarkdownSafety(markdown).findings.map((finding) => finding.construct);
}

describe("markdown safety", () => {
  it("allows the constructs the card renderer needs", () => {
    for (const markdown of [
      "A **strong** and *emphasized* sentence.",
      "## Heading",
      "- one\n- two",
      "1. first\n2. second",
      "> A quoted rule.",
      "Use `code span` and **bold**.",
      "```\ncode block\n```",
    ]) {
      const result = checkMarkdownSafety(markdown);
      expect(result.findings).toEqual([]);
      expect(result.safe).toBe(true);
    }
  });

  it("rejects raw HTML and scripts", () => {
    expect(constructs("Deal damage <br> now.")).toEqual(["html"]);
    expect(constructs("<script>alert(1)</script>")).toEqual(["html"]);
  });

  it("rejects links, images, and bare URLs", () => {
    expect(constructs("[rules](https://example.com)")).toEqual(["link"]);
    expect(constructs("![image](https://example.com/a.png)")).toEqual(["image"]);
    expect(constructs("See https://example.com for rules.")).toEqual(["link"]);
    expect(constructs("<https://example.com>")).toEqual(["link"]);
    expect(constructs("[ref]: https://example.com")).toEqual(["def"]);
  });

  it("rejects tables", () => {
    expect(constructs("| a | b |\n| - | - |\n| 1 | 2 |")).toEqual(["table"]);
  });

  it("reports the offending construct with a token path", () => {
    const result = checkMarkdownSafety("Intro text.\n\nA [link](https://example.com) here.");
    expect(result.safe).toBe(false);
    expect(result.findings[0]?.path).toContain("[1]");
    expect(result.findings[0]?.snippet).toContain("link");
  });

  it("treats empty text as safe", () => {
    expect(checkMarkdownSafety("   ")).toEqual({ safe: true, findings: [] });
  });
});
