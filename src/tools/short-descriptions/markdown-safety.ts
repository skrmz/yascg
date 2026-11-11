import type { Token } from "marked";
import { marked } from "marked";

/**
 * Bounded Markdown safety check for generated short descriptions. It permits
 * the constructs the card renderer supports for spell prose and rejects the
 * ones the content conventions forbid (raw HTML, links, images, URLs, tables).
 *
 * This is a deterministic guard, not a semantic check.
 */

export type UnsafeMarkdownConstruct = "html" | "link" | "image" | "url" | "def" | "table";

export interface MarkdownSafetyFinding {
  construct: UnsafeMarkdownConstruct;
  /** Token path such as `[0].tokens[2]`. */
  path: string;
  /** Short excerpt of the offending source. */
  snippet: string;
  detail: string;
}

export interface MarkdownSafetyResult {
  safe: boolean;
  findings: MarkdownSafetyFinding[];
}

function snippetOf(token: Token): string {
  const raw = (token as { raw?: unknown }).raw;
  const text = typeof raw === "string" ? raw : "";
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function tokenChildren(token: Token): Token[] {
  const value = (token as { tokens?: Token[] }).tokens;
  return Array.isArray(value) ? value : [];
}

interface NestedChild {
  tokens: Token[];
  path: string;
}

function nestedChildren(token: Token, path: string): NestedChild[] {
  const children: NestedChild[] = [];
  const tokens = tokenChildren(token);
  if (tokens.length > 0) children.push({ tokens, path: `${path}.tokens` });

  if (token.type === "list") {
    const items = (token as { items?: Token[] }).items;
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      const itemTokens = tokenChildren(item);
      if (itemTokens.length > 0)
        children.push({ tokens: itemTokens, path: `${path}.items[${index}]` });
      (Array.isArray(itemTokens) ? itemTokens : []).forEach((inner, innerIndex) => {
        if (inner.type === "list") {
          const innerTokens = tokenChildren(inner);
          if (innerTokens.length > 0) {
            children.push({
              tokens: innerTokens,
              path: `${path}.items[${index}].items[${innerIndex}]`,
            });
          }
        }
      });
    });
  }

  if (token.type === "table") {
    const table = token as {
      header?: Array<{ tokens?: Token[] }>;
      rows?: Array<Array<{ tokens?: Token[] }>>;
    };
    (table.header ?? []).forEach((cell, index) => {
      if (cell.tokens) children.push({ tokens: cell.tokens, path: `${path}.header[${index}]` });
    });
    (table.rows ?? []).forEach((row, rowIndex) => {
      row.forEach((cell, cellIndex) => {
        if (cell.tokens) {
          children.push({ tokens: cell.tokens, path: `${path}.rows[${rowIndex}][${cellIndex}]` });
        }
      });
    });
  }

  return children;
}

function unsafeConstruct(token: Token): UnsafeMarkdownConstruct | null {
  switch (token.type) {
    case "html":
      return "html";
    case "link":
      return "link";
    case "image":
      return "image";
    case "autolink":
    case "url":
      return "url";
    case "def":
      return "def";
    case "table":
      return "table";
    default:
      return null;
  }
}

export function checkMarkdownSafety(markdown: string): MarkdownSafetyResult {
  const findings: MarkdownSafetyFinding[] = [];
  if (markdown.trim() === "") return { safe: true, findings };

  const walk = (tokens: readonly Token[], path: string): void => {
    tokens.forEach((token, index) => {
      const tokenPath = `${path}[${index}]`;
      const construct = unsafeConstruct(token);
      if (construct) {
        findings.push({
          construct,
          path: tokenPath,
          snippet: snippetOf(token),
          detail: `unsafe Markdown construct: ${construct}`,
        });
      }
      for (const child of nestedChildren(token, tokenPath)) {
        walk(child.tokens, child.path);
      }
    });
  };

  walk(marked.lexer(markdown, { gfm: true }), "");
  return { safe: findings.length === 0, findings };
}
