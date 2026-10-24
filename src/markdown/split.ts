import type { BlockNode, InlineNode } from "./parse.ts";

export interface InlineFragment {
  text: string;
  strong: boolean;
  em: boolean;
  code: boolean;
}

// ---------------------------------------------------------------------------
// Grapheme / sentence / word segmentation (Unicode-aware, `Intl.Segmenter`)
// ---------------------------------------------------------------------------

const graphemeSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

export function segmentGraphemes(text: string): string[] {
  if (graphemeSegmenter) {
    return [...graphemeSegmenter.segment(text)].map((part) => part.segment);
  }
  return Array.from(text);
}

function segmentBoundaryCounts(text: string, granularity: "sentence" | "word"): number[] {
  if (!text) return [];
  const segmenter =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? new Intl.Segmenter(undefined, { granularity })
      : null;
  const graphemes = segmentGraphemes(text);
  if (!segmenter) {
    return granularity === "word" ? [graphemes.length] : [graphemes.length];
  }
  const counts: number[] = [];
  for (const part of segmenter.segment(text)) {
    if (part.index === 0) continue;
    const endIndex = part.index + part.segment.length;
    // Convert UTF-16 index to a grapheme count.
    counts.push(segmentGraphemes(text.slice(0, endIndex)).length);
  }
  return counts.filter((count) => count > 0 && count < graphemes.length);
}

// ---------------------------------------------------------------------------
// Inline flattening / regrouping
// ---------------------------------------------------------------------------

export function flattenInline(nodes: readonly InlineNode[]): InlineFragment[] {
  const fragments: InlineFragment[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        fragments.push({ text: node.value, strong: false, em: false, code: false });
        break;
      case "strong":
      case "em":
        fragments.push({
          text: node.value,
          strong: node.type === "strong",
          em: node.type === "em",
          code: false,
        });
        break;
      case "code":
        fragments.push({ text: node.value, strong: false, em: false, code: true });
        break;
    }
  }
  return mergeAdjacent(fragments);
}

function sameMarks(a: InlineFragment, b: InlineFragment): boolean {
  return a.strong === b.strong && a.em === b.em && a.code === b.code;
}

function mergeAdjacent(fragments: readonly InlineFragment[]): InlineFragment[] {
  const merged: InlineFragment[] = [];
  for (const fragment of fragments) {
    const last = merged[merged.length - 1];
    if (last && sameMarks(last, fragment)) {
      last.text += fragment.text;
    } else {
      merged.push({ ...fragment });
    }
  }
  return merged;
}

export function groupFragments(fragments: readonly InlineFragment[]): InlineNode[] {
  const nodes: InlineNode[] = [];
  for (const fragment of mergeAdjacent(fragments)) {
    if (fragment.text === "") continue;
    if (fragment.code) nodes.push({ type: "code", value: fragment.text });
    else if (fragment.strong) nodes.push({ type: "strong", value: fragment.text });
    else if (fragment.em) nodes.push({ type: "em", value: fragment.text });
    else nodes.push({ type: "text", value: fragment.text });
  }
  return nodes;
}

export function fragmentGraphemeLength(fragments: readonly InlineFragment[]): number {
  let total = 0;
  for (const fragment of fragments) total += segmentGraphemes(fragment.text).length;
  return total;
}

/** Splits fragments after `count` graphemes, preserving formatting on both sides. */
export function splitFragmentsAt(
  fragments: readonly InlineFragment[],
  count: number,
): { prefix: InlineFragment[]; rest: InlineFragment[] } {
  const prefix: InlineFragment[] = [];
  const rest: InlineFragment[] = [];
  let remaining = count;
  for (const fragment of fragments) {
    if (remaining <= 0) {
      rest.push({ ...fragment });
      continue;
    }
    const graphemes = segmentGraphemes(fragment.text);
    if (graphemes.length <= remaining) {
      prefix.push({ ...fragment });
      remaining -= graphemes.length;
    } else {
      prefix.push({ ...fragment, text: graphemes.slice(0, remaining).join("") });
      rest.push({ ...fragment, text: graphemes.slice(remaining).join("") });
      remaining = 0;
    }
  }
  return { prefix, rest: mergeAdjacent(rest) };
}

// ---------------------------------------------------------------------------
// Boundary-ordered splitting
// ---------------------------------------------------------------------------

/**
 * Finds the largest prefix (preferring sentence, then word, then grapheme
 * boundaries) that satisfies `fits`, returning the prefix and the remainder.
 */
export function splitFragmentsToFit(
  fragments: readonly InlineFragment[],
  fits: (prefix: readonly InlineFragment[]) => boolean,
): { prefix: InlineFragment[]; rest: InlineFragment[] } | null {
  const text = fragments.map((fragment) => fragment.text).join("");
  const total = segmentGraphemes(text).length;
  if (total <= 1) return null;

  const candidates: { counts: number[]; level: number }[] = [
    { counts: segmentBoundaryCounts(text, "sentence"), level: 0 },
    { counts: segmentBoundaryCounts(text, "word"), level: 1 },
  ];
  const seen = new Set<number>();
  for (const group of candidates) {
    for (const count of [...group.counts].sort((a, b) => b - a)) {
      if (count <= 0 || count >= total || seen.has(count)) continue;
      seen.add(count);
      const split = splitFragmentsAt(fragments, count);
      if (split.rest.length === 0) continue;
      if (fits(split.prefix)) return split;
    }
  }
  // Grapheme fallback: largest single-grapheme prefix that fits.
  for (let count = total - 1; count >= 1; count -= 1) {
    if (seen.has(count)) continue;
    const split = splitFragmentsAt(fragments, count);
    if (split.rest.length === 0) continue;
    if (fits(split.prefix)) return split;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Block splitting
// ---------------------------------------------------------------------------

export function isHeading(block: BlockNode): boolean {
  return block.type === "heading";
}

export function splitBlockToFit(
  block: BlockNode,
  fits: (candidate: BlockNode) => boolean,
): [BlockNode, BlockNode] | null {
  switch (block.type) {
    case "paragraph":
    case "heading": {
      const fragments = flattenInline(block.children);
      const split = splitFragmentsToFit(fragments, (prefix) =>
        fits({ ...block, children: groupFragments(prefix) }),
      );
      if (!split) return null;
      return [
        { ...block, children: groupFragments(split.prefix) },
        { ...block, children: groupFragments(split.rest) },
      ];
    }
    case "code": {
      const lines = block.value.split("\n");
      if (lines.length <= 1) return null;
      for (let count = lines.length - 1; count >= 1; count -= 1) {
        const head: BlockNode = { type: "code", value: lines.slice(0, count).join("\n") };
        if (fits(head)) {
          return [head, { type: "code", value: lines.slice(count).join("\n") }];
        }
      }
      return null;
    }
    case "list": {
      if (block.items.length > 1) {
        for (let count = block.items.length - 1; count >= 1; count -= 1) {
          const head: BlockNode = { ...block, items: block.items.slice(0, count) };
          if (fits(head)) {
            return [head, { ...block, items: block.items.slice(count) }];
          }
        }
      }
      const firstItem = block.items[0];
      if (!firstItem) return null;
      const fragments = flattenInline(firstItem);
      const split = splitFragmentsToFit(fragments, (prefix) =>
        fits({ ...block, items: [groupFragments(prefix)] }),
      );
      if (!split) return null;
      return [
        { ...block, items: [groupFragments(split.prefix)] },
        { ...block, items: [groupFragments(split.rest)] },
      ];
    }
    case "table": {
      if (block.rows.length > 1) {
        for (let count = block.rows.length - 1; count >= 1; count -= 1) {
          const head: BlockNode = { ...block, rows: block.rows.slice(0, count) };
          if (fits(head)) {
            return [head, { type: "table", header: block.header, rows: block.rows.slice(count) }];
          }
        }
      }
      return null;
    }
    default:
      return null;
  }
}

export function appendEllipsis(blocks: readonly BlockNode[]): BlockNode[] {
  const clone = blocks.map(cloneBlock);
  const last = clone[clone.length - 1];
  if (!last) return clone;
  switch (last.type) {
    case "paragraph":
    case "heading":
      last.children = [...last.children, { type: "text", value: "\u2026" }];
      break;
    case "list": {
      const lastItem = last.items[last.items.length - 1];
      if (lastItem) lastItem.push({ type: "text", value: "\u2026" });
      break;
    }
    case "table": {
      const lastRow = last.rows[last.rows.length - 1];
      const lastCell = lastRow?.[lastRow.length - 1];
      if (lastCell) lastCell.push({ type: "text", value: "\u2026" });
      break;
    }
    case "code":
      last.value = `${last.value}\u2026`;
      break;
    default:
      break;
  }
  return clone;
}

export function cloneBlock(block: BlockNode): BlockNode {
  switch (block.type) {
    case "heading":
      return { ...block, children: block.children.map((node) => ({ ...node })) };
    case "paragraph":
      return { ...block, children: block.children.map((node) => ({ ...node })) };
    case "list":
      return {
        ...block,
        items: block.items.map((item) => item.map((node) => ({ ...node }))),
      };
    case "table":
      return {
        ...block,
        header: block.header.map((cell) => cell.map((node) => ({ ...node }))),
        rows: block.rows.map((row) => row.map((cell) => cell.map((node) => ({ ...node })))),
      };
    case "code":
      return { ...block };
    default:
      return { ...block };
  }
}

// ---------------------------------------------------------------------------
// Pagination and truncation over measured heights
// ---------------------------------------------------------------------------

export interface PaginationResult {
  pages: BlockNode[][];
  /** True when a single unbreakable block did not fit and was allowed to overflow. */
  overflow: boolean;
}

export type PageFit = (page: readonly BlockNode[], pageIndex: number) => boolean;

/**
 * Greedy paginator using a caller-supplied page-fit predicate. The predicate
 * receives the zero-based page index so first-card and continuation-card
 * layouts can be measured differently. Prevents orphaning a heading at the
 * bottom of a page when the following block can move with it.
 */
export function paginateBlocks(
  blocks: readonly BlockNode[],
  fitsPage: PageFit,
  maxPages = 100,
): PaginationResult {
  const queue = blocks.map(cloneBlock);
  const pages: BlockNode[][] = [];
  let current: BlockNode[] = [];
  let overflow = false;
  let index = 0;

  while (index < queue.length) {
    if (pages.length >= maxPages) {
      overflow = true;
      break;
    }
    const block = queue[index];
    const candidate = [...current, block];
    if (fitsPage(candidate, pages.length)) {
      current = candidate;
      index += 1;
      continue;
    }

    if (current.length > 0) {
      const previous = current;
      const last = previous[previous.length - 1];
      current = [];
      if (isHeading(last) && block.type !== "heading" && previous.length > 1) {
        // Move the heading to the next page so it is not orphaned.
        pages.push(previous.slice(0, -1));
        current = [last];
        continue;
      }
      pages.push(previous);
      continue;
    }

    const split = splitBlockToFit(block, (candidateBlock) =>
      fitsPage([candidateBlock], pages.length),
    );
    if (!split) {
      overflow = true;
      pages.push([block]);
      index += 1;
      continue;
    }
    pages.push([split[0]]);
    queue[index] = split[1];
  }

  if (current.length > 0) pages.push(current);
  return { pages: pages.length > 0 ? pages : [[]], overflow };
}

export function paginateToPages(
  blocks: readonly BlockNode[],
  fitsPage: PageFit,
  maxPages = 100,
): PaginationResult {
  return paginateBlocks(blocks, fitsPage, maxPages);
}

export function truncateBlocksToFit(
  blocks: readonly BlockNode[],
  fitsPage: (page: readonly BlockNode[]) => boolean,
): { blocks: BlockNode[]; truncated: boolean } {
  const current: BlockNode[] = [];
  for (const block of blocks) {
    if (fitsPage([...current, block])) {
      current.push(cloneBlock(block));
      continue;
    }
    const partial = splitBlockToFit(block, (candidate) => fitsPage([...current, candidate]));
    if (partial && partial[0]) current.push(partial[0]);
    return { blocks: current, truncated: true };
  }
  return { blocks: current, truncated: false };
}
