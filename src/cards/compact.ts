import type { TFunction } from "i18next";
import type { Spell } from "@/domain/spells";
import type { BlockNode, InlineNode } from "@/markdown/parse.ts";
import { abbreviationFull, abbreviationShort } from "@/locales/abbreviations.ts";

export interface CompactNote {
  number: number;
  owner: "castingTime" | "duration";
  label: string;
  children: InlineNode[];
}

export interface CompactPresentation {
  displayCastingTime: string;
  displayDuration: string;
  castingNoteNumber?: number;
  durationNoteNumber?: number;
  notes: readonly CompactNote[];
  blocks: BlockNode[];
}

export type CastingTimeBase =
  | { kind: "action" | "bonus" | "reaction" }
  | { kind: "quantity"; amount: string; unit: "minute" | "hour" };

export type CastingTimeParse =
  | {
      kind: "base";
      base: CastingTimeBase;
      qualifier: string | null;
      caret: boolean;
      raw: string;
    }
  | { kind: "fallback"; caret: boolean; raw: string };

export interface DurationParse {
  value: string;
  caret: boolean;
}

const ACTION_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  kind: "action" | "bonus" | "reaction";
}> = [
  { pattern: /^(?:1\s+)?bonus action\b/i, kind: "bonus" },
  { pattern: /^(?:1\s+)?bonusaktion\b/i, kind: "bonus" },
  { pattern: /^(?:1\s+)?reaction\b/i, kind: "reaction" },
  { pattern: /^(?:1\s+)?reaktion\b/i, kind: "reaction" },
  { pattern: /^(?:1\s+)?action\b/i, kind: "action" },
  { pattern: /^(?:1\s+)?aktion\b/i, kind: "action" },
  { pattern: /^(?:1\s+)?BA\b/i, kind: "bonus" },
  { pattern: /^(?:1\s+)?B\b/i, kind: "bonus" },
  { pattern: /^(?:1\s+)?A\b/i, kind: "action" },
  { pattern: /^(?:1\s+)?R\b/i, kind: "reaction" },
];

const QUANTITY_PATTERN =
  /^(\d+)\s+(minutes|minuten|stunden|minute|stunde|hours|mins|hour|std\.?|hrs|min|hr)(?![\p{L}\p{N}\p{M}])(.*)$/isu;

function splitQualifier(remainder: string): { qualifier: string | null } | { invalid: true } {
  const trimmed = remainder.trim();
  if (trimmed === "") return { qualifier: null };
  if (!/^[,;]/.test(trimmed)) return { invalid: true };
  const qualifier = trimmed.replace(/^[,;\s]+/, "").trim();
  return { qualifier: qualifier === "" ? null : qualifier };
}

/**
 * Parses a casting-time string into a recognized compact base plus an optional
 * qualifier, or a lossless fallback. The original string is never mutated.
 */
export function parseCastingTime(raw: string): CastingTimeParse {
  const value = raw.trim();
  const caret = value.endsWith("^");
  const withoutCaret = caret ? value.slice(0, -1).trimEnd() : value;

  for (const entry of ACTION_PATTERNS) {
    const match = entry.pattern.exec(withoutCaret);
    if (!match) continue;
    const remainder = withoutCaret.slice(match[0].length);
    const parsed = splitQualifier(remainder);
    if ("invalid" in parsed) return { kind: "fallback", caret, raw: value };
    if (parsed.qualifier !== null && caret) {
      return { kind: "fallback", caret, raw: value };
    }
    return {
      kind: "base",
      base: { kind: entry.kind },
      qualifier: parsed.qualifier,
      caret,
      raw: value,
    };
  }

  const quantity = QUANTITY_PATTERN.exec(withoutCaret);
  if (quantity) {
    const [, amount, unitText, remainder] = quantity;
    const parsed = splitQualifier(remainder);
    if ("invalid" in parsed) return { kind: "fallback", caret, raw: value };
    if (parsed.qualifier !== null && caret) {
      return { kind: "fallback", caret, raw: value };
    }
    const unit = /^min/i.test(unitText) ? "minute" : "hour";
    return {
      kind: "base",
      base: { kind: "quantity", amount, unit },
      qualifier: parsed.qualifier,
      caret,
      raw: value,
    };
  }

  return { kind: "fallback", caret, raw: value };
}

/** Lexical duration parse. `value` keeps the raw caret; `caret` reports it. */
export function parseDuration(raw: string): DurationParse {
  const value = raw.trim();
  return { value, caret: value.endsWith("^") };
}

export function castingBaseDisplay(base: CastingTimeBase, t: TFunction): string {
  switch (base.kind) {
    case "action":
      return "A";
    case "bonus":
      return "B";
    case "reaction":
      return "R";
    case "quantity":
      return `${base.amount} ${abbreviationShort(base.unit, t)}`;
  }
}

export function castingTimeFullLabel(parse: CastingTimeParse, t: TFunction): string {
  if (parse.kind === "fallback") return parse.raw;
  if (parse.base.kind === "quantity") {
    return `${parse.base.amount} ${abbreviationFull(parse.base.unit, t)}`;
  }
  return abbreviationFull(parse.base.kind === "bonus" ? "bonusAction" : parse.base.kind, t);
}

export function normalizeQualifier(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function textOf(nodes: readonly InlineNode[]): string {
  return nodes.map((node) => node.value).join("");
}

function stripLeadingCaret(nodes: readonly InlineNode[]): InlineNode[] {
  const stripped: InlineNode[] = [];
  let removed = false;
  for (const node of nodes) {
    if (!removed) {
      const match = /^\s*\^\s*/.exec(node.value);
      if (match) {
        removed = true;
        const value = node.value.slice(match[0].length);
        if (value !== "") stripped.push({ ...node, value });
        continue;
      }
      if (node.value.trim() === "") continue;
    }
    stripped.push({ ...node });
  }
  return stripped;
}

function caretNoteChildren(block: BlockNode): InlineNode[] | null {
  if (block.type !== "paragraph" || block.section !== undefined) return null;
  const text = textOf(block.children).replace(/^\s+/, "");
  if (!text.startsWith("^")) return null;
  if (text.slice(1).trim() === "") return null;
  return stripLeadingCaret(block.children);
}

function isCaretParagraph(block: BlockNode): boolean {
  return caretNoteChildren(block) !== null;
}

function blockText(block: BlockNode): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return textOf(block.children);
    case "list":
      return [...block.items.map(textOf), ...(block.sublists?.flat().map(blockText) ?? [])].join(
        " ",
      );
    case "blockquote":
      return block.children.map(blockText).join(" ");
    case "table":
      return [...block.header, ...block.rows.flat()].map(textOf).join(" ");
    case "code":
      return block.value;
    default:
      return "";
  }
}

/**
 * Builds the Compact-only presentation: display metadata, numbered notes, an
 * atomic notes block, and the remaining description/higher-level blocks.
 * Pure: never mutates the spell, its strings, or the parsed block arrays.
 */
export function buildCompactPresentation(
  spell: Spell,
  blocks: readonly BlockNode[],
  t: TFunction,
): CompactPresentation {
  const casting = parseCastingTime(spell.castingTime);
  const duration = parseDuration(spell.duration);

  const caretFieldOwners: Array<"castingTime" | "duration"> = [];
  if (casting.kind === "base" && casting.caret) caretFieldOwners.push("castingTime");
  if (duration.caret) caretFieldOwners.push("duration");

  let componentTailCount = 0;
  if (spell.components.verbal && spell.components.verbalDescription?.trim()) {
    componentTailCount += 1;
  }
  if (spell.components.somatic && spell.components.somaticDescription?.trim()) {
    componentTailCount += 1;
  }
  const descriptionEnd = Math.max(0, blocks.length - componentTailCount);

  const caretParagraphs = blocks
    .map((block, index) => ({ block, index }))
    .filter(
      (entry) =>
        entry.index < descriptionEnd &&
        entry.block.section === undefined &&
        isCaretParagraph(entry.block),
    );

  let caretOwner: "castingTime" | "duration" | null = null;
  let caretIndex = -1;
  let caretChildren: InlineNode[] | null = null;
  if (caretFieldOwners.length === 1 && caretParagraphs.length === 1) {
    caretOwner = caretFieldOwners[0] ?? null;
    const match = caretParagraphs[0];
    if (match) {
      caretIndex = match.index;
      caretChildren = caretNoteChildren(match.block);
    }
  }

  const remainingBlocks = blocks.filter((_block, index) => index !== caretIndex);
  const bodyText = normalizeQualifier(remainingBlocks.map(blockText).join(" "));

  const notes: CompactNote[] = [];
  const addNote = (owner: "castingTime" | "duration", children: InlineNode[]): number => {
    const number = notes.length + 1;
    notes.push({
      number,
      owner,
      label: t(owner === "castingTime" ? "spell.metadata.castingTime" : "spell.metadata.duration"),
      children,
    });
    return number;
  };

  let castingNoteNumber: number | undefined;
  let durationNoteNumber: number | undefined;

  if (caretOwner === "castingTime" && caretChildren) {
    castingNoteNumber = addNote("castingTime", caretChildren);
  } else if (
    casting.kind === "base" &&
    !casting.caret &&
    casting.qualifier !== null &&
    !bodyText.includes(normalizeQualifier(casting.qualifier))
  ) {
    castingNoteNumber = addNote("castingTime", [{ type: "text", value: casting.qualifier }]);
  }

  if (caretOwner === "duration" && caretChildren) {
    durationNoteNumber = addNote("duration", caretChildren);
  }

  let displayCastingTime: string;
  if (casting.kind === "fallback") {
    displayCastingTime = casting.raw;
  } else if (casting.caret) {
    displayCastingTime =
      caretOwner === "castingTime" ? castingBaseDisplay(casting.base, t) : casting.raw;
  } else {
    displayCastingTime = castingBaseDisplay(casting.base, t);
  }

  const displayDuration =
    caretOwner === "duration" ? duration.value.slice(0, -1).trimEnd() : duration.value;

  const presentationBlocks: BlockNode[] = [];
  if (notes.length > 0) {
    presentationBlocks.push({
      type: "list",
      ordered: false,
      role: "notes",
      items: notes.map((note) => note.children),
    });
  }
  presentationBlocks.push(...remainingBlocks);

  return {
    displayCastingTime,
    displayDuration,
    ...(castingNoteNumber !== undefined ? { castingNoteNumber } : {}),
    ...(durationNoteNumber !== undefined ? { durationNoteNumber } : {}),
    notes,
    blocks: presentationBlocks,
  };
}

/** Renders a note number as a superscript glyph. */
export function superscriptNumber(value: number): string {
  const digits: Record<string, string> = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
  };
  return Array.from(String(value))
    .map((digit) => digits[digit] ?? digit)
    .join("");
}

export function compactNoteId(prefix: string, number: number): string {
  return `${prefix}-note-${number}`;
}
