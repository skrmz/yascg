import { marked, type Token } from "marked";
import type { SpellComponents } from "@/domain/spells";

export interface InlineNode {
  type: "text" | "strong" | "em" | "code";
  value: string;
}

export type TextInline = Extract<InlineNode, { type: "text" } | { type: "code" }>;
export type ContainerInline = Extract<InlineNode, { type: "strong" } | { type: "em" }>;

export interface ListBlock {
  type: "list";
  ordered: boolean;
  items: InlineNode[][];
}

export interface TableBlock {
  type: "table";
  header: InlineNode[][];
  rows: InlineNode[][][];
}

export interface HeadingBlock {
  type: "heading";
  depth: number;
  children: InlineNode[];
}

export interface ParagraphBlock {
  type: "paragraph";
  children: InlineNode[];
}

export interface CodeBlock {
  type: "code";
  value: string;
}

export interface RuleBlock {
  type: "hr";
}

export type BlockNode =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | TableBlock
  | CodeBlock
  | RuleBlock;

function tokenChildren(token: Token): Token[] {
  const value = (token as { tokens?: Token[] }).tokens;
  return Array.isArray(value) ? value : [];
}

function plainText(token: Token): string {
  const raw = (token as { text?: string; raw?: string }).text;
  if (typeof raw === "string") return raw;
  const tokens = tokenChildren(token);
  if (tokens.length > 0) return tokens.map(plainText).join("");
  const fallback = (token as { raw?: string }).raw;
  return typeof fallback === "string" ? fallback : "";
}

/** Converts inline markdown tokens into a safe, allowlisted inline AST. */
export function parseInline(tokens: readonly Token[] | undefined): InlineNode[] {
  if (!tokens) return [];
  const nodes: InlineNode[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "strong":
        nodes.push(...wrapInlines("strong", parseInline(tokenChildren(token))));
        break;
      case "em":
        nodes.push(...wrapInlines("em", parseInline(tokenChildren(token))));
        break;
      case "codespan":
        nodes.push({ type: "code", value: plainText(token) });
        break;
      case "del":
      case "link":
        nodes.push(...parseInline(tokenChildren(token)));
        break;
      case "image":
        nodes.push({ type: "text", value: plainText(token) });
        break;
      case "br":
        nodes.push({ type: "text", value: "\n" });
        break;
      case "escape":
      case "text":
      case "url":
      case "autolink":
      case "html":
        if (token.type === "html") break;
        nodes.push(...inlineFromTextToken(token));
        break;
      default:
        if (tokenChildren(token).length > 0) {
          nodes.push(...parseInline(tokenChildren(token)));
        } else {
          nodes.push({ type: "text", value: plainText(token) });
        }
    }
  }
  return nodes;
}

function inlineFromTextToken(token: Token): InlineNode[] {
  const children = tokenChildren(token);
  if (children.length > 0) return parseInline(children);
  return [{ type: "text", value: plainText(token) }];
}

function wrapInlines(kind: "strong" | "em", nodes: readonly InlineNode[]): InlineNode[] {
  return nodes.map((node) => ({ type: kind, value: node.value }));
}

function parseBlocks(tokens: readonly Token[]): BlockNode[] {
  const blocks: BlockNode[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "space":
        break;
      case "heading":
        blocks.push({
          type: "heading",
          depth: (token as { depth?: number }).depth ?? 1,
          children: parseInline(tokenChildren(token)),
        });
        break;
      case "paragraph":
        blocks.push({ type: "paragraph", children: parseInline(tokenChildren(token)) });
        break;
      case "text":
        blocks.push({ type: "paragraph", children: parseInline(tokenChildren(token)) });
        break;
      case "code":
        blocks.push({ type: "code", value: (token as { text?: string }).text ?? "" });
        break;
      case "hr":
        blocks.push({ type: "hr" });
        break;
      case "blockquote":
        blocks.push(...parseBlocks(tokenChildren(token)));
        break;
      case "list":
        blocks.push(parseList(token));
        break;
      case "table":
        blocks.push(parseTable(token));
        break;
      default:
        if (tokenChildren(token).length > 0) {
          blocks.push(...parseBlocks(tokenChildren(token)));
        }
        break;
    }
  }
  return blocks;
}

function parseList(token: Token): ListBlock {
  const listToken = token as { ordered?: boolean; items?: Token[] };
  const items = Array.isArray(listToken.items) ? listToken.items : [];
  const parsed: InlineNode[][] = [];
  for (const item of items) {
    const itemTokens = tokenChildren(item);
    const inline: InlineNode[] = [];
    for (const inner of itemTokens) {
      if (inner.type === "list") {
        const nested = parseList(inner);
        for (const nestedItem of nested.items) {
          inline.push({ type: "text", value: "\n" }, ...nestedItem);
        }
        continue;
      }
      if (inner.type === "paragraph" || inner.type === "text") {
        inline.push(...parseInline(tokenChildren(inner)));
      } else if (inner.type === "code") {
        inline.push({ type: "code", value: (inner as { text?: string }).text ?? "" });
      }
    }
    if (inline.length === 0) inline.push({ type: "text", value: plainText(item) });
    parsed.push(inline);
  }
  return { type: "list", ordered: Boolean(listToken.ordered), items: parsed };
}

function parseTable(token: Token): TableBlock {
  const tableToken = token as {
    header?: Array<{ tokens?: Token[] }>;
    rows?: Array<Array<{ tokens?: Token[] }>>;
  };
  const header = (tableToken.header ?? []).map((cell) => parseInline(cell.tokens));
  const rows = (tableToken.rows ?? []).map((row) => row.map((cell) => parseInline(cell.tokens)));
  return { type: "table", header, rows };
}

/** Parses untrusted Markdown into a safe AST. Raw HTML is dropped and links are text. */
export function parseMarkdown(markdown: string): BlockNode[] {
  if (markdown.trim() === "") return [];
  const tokens = marked.lexer(markdown, { gfm: true });
  return parseBlocks(tokens);
}

export const HIGHER_LEVELS_HEADING: HeadingBlock = {
  type: "heading",
  depth: 3,
  children: [{ type: "text", value: "Higher Levels" }],
};

export interface ComponentMarkers {
  verbal: string;
  somatic: string;
}

/**
 * Builds component-description blocks (verbal then somatic) for a spell. A block
 * is emitted only when the matching component boolean is enabled and the trimmed
 * description is non-empty. Built directly (not via `marked`) so author text is
 * never re-interpreted as Markdown.
 */
export function componentDescriptionBlocks(
  spell: { components?: SpellComponents },
  markers: ComponentMarkers,
): ParagraphBlock[] {
  const blocks: ParagraphBlock[] = [];
  const components = spell.components;
  if (!components) return blocks;
  const verbal = components.verbalDescription?.trim();
  if (components.verbal && verbal) {
    blocks.push({
      type: "paragraph",
      children: [{ type: "text", value: `${markers.verbal} ${verbal}` }],
    });
  }
  const somatic = components.somaticDescription?.trim();
  if (components.somatic && somatic) {
    blocks.push({
      type: "paragraph",
      children: [{ type: "text", value: `${markers.somatic} ${somatic}` }],
    });
  }
  return blocks;
}

export function parseSpellBody(
  spell: {
    description: readonly string[];
    higherLevels?: readonly string[];
    components?: SpellComponents;
  },
  higherLevelsHeading: string,
  markers: ComponentMarkers,
): BlockNode[] {
  const blocks: BlockNode[] = [];
  blocks.push(...parseMarkdown(spell.description.join("\n\n")));
  if (spell.higherLevels && spell.higherLevels.length > 0) {
    const higher = spell.higherLevels.filter((part) => part.trim() !== "");
    if (higher.length > 0) {
      blocks.push({
        type: "heading",
        depth: HIGHER_LEVELS_HEADING.depth,
        children: [{ type: "text", value: higherLevelsHeading }],
      });
      blocks.push(...parseMarkdown(higher.join("\n\n")));
    }
  }
  blocks.push(...componentDescriptionBlocks(spell, markers));
  return blocks;
}
