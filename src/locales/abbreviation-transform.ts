import {
  EXCLUDED_ABBREVIATION_IDS,
  abbreviationCatalog,
  findAbbreviationSurfaceConflicts,
  isAbbreviationEligible,
  type AbbreviationEntry,
  type AbbreviationId,
  type AbbreviationLocale,
} from "./abbreviations.ts";

export type AbbreviationTextMode = "markdown" | "plain";

export interface AppliedAbbreviation {
  id: AbbreviationId;
  full: string;
  short: string;
  count: number;
}

export interface SkippedAbbreviation {
  id: AbbreviationId;
  full: string;
  reason: "excluded";
}

export interface AbbreviationTransformResult {
  text: string;
  applied: readonly AppliedAbbreviation[];
  skipped: readonly SkippedAbbreviation[];
  changed: boolean;
}

export interface MatcherEntry {
  entry: AbbreviationEntry;
  surface: string;
  folded: string;
}

export interface LocaleMatcher {
  eligible: readonly MatcherEntry[];
  excluded: readonly MatcherEntry[];
}

const WORD_CHARACTER = /[\p{L}\p{N}\p{M}_-]/u;
const DELIMITER = /[*_~]/;
const URL_PATTERN = /(?:https?:\/\/|www\.|mailto:)[^\s<>"'`]+/giu;
const EMAIL_PATTERN = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const REFERENCE_DEFINITION_PATTERN = /^ {0,3}\[[^\]\n]+\]:[^\n]*$/gm;
const HORIZONTAL_RULE_PATTERN = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/gm;
const LINE_START_MARKER_PATTERN = /^ {0,3}(?:#{1,6}|>|[-+*]|\d{1,9}[.)])(?=\s|$)/gm;
const HTML_ENTITY_PATTERN = /&[#A-Za-z0-9]+;/g;

const matcherCache = new Map<AbbreviationLocale, LocaleMatcher>();

function foldedSurface(surface: string, locale: AbbreviationLocale): string {
  return surface.toLocaleLowerCase(locale).normalize("NFC");
}

function compareMatcherEntries(a: MatcherEntry, b: MatcherEntry): number {
  const byLength = b.surface.length - a.surface.length;
  if (byLength !== 0) return byLength;
  if (a.folded !== b.folded) return a.folded < b.folded ? -1 : 1;
  if (a.entry.id !== b.entry.id) return a.entry.id < b.entry.id ? -1 : 1;
  if (a.surface === b.surface) return 0;
  return a.surface < b.surface ? -1 : 1;
}

function matcherEntries(catalog: readonly AbbreviationEntry[], locale: AbbreviationLocale) {
  const conflicts = findAbbreviationSurfaceConflicts(catalog, locale);
  if (conflicts.length > 0) {
    const details = conflicts
      .map((conflict) => `${conflict.surface} -> ${conflict.shorts.join(" / ")}`)
      .join("; ");
    throw new Error(`Ambiguous abbreviation surfaces for locale "${locale}": ${details}`);
  }

  const canonical = new Map<string, MatcherEntry>();
  for (const entry of catalog) {
    for (const surface of entry.forms) {
      const folded = foldedSurface(surface, locale);
      const candidate: MatcherEntry = { entry, surface, folded };
      const existing = canonical.get(folded);
      if (!existing || entry.id < existing.entry.id) canonical.set(folded, candidate);
    }
  }
  return [...canonical.values()];
}

export function createLocaleMatcher(
  catalog: readonly AbbreviationEntry[],
  locale: AbbreviationLocale,
): LocaleMatcher {
  const eligible: MatcherEntry[] = [];
  const excluded: MatcherEntry[] = [];
  for (const candidate of matcherEntries(catalog, locale)) {
    if (isAbbreviationEligible(candidate.entry, locale)) eligible.push(candidate);
    else if (EXCLUDED_ABBREVIATION_IDS[locale].has(candidate.entry.id)) excluded.push(candidate);
  }
  eligible.sort(compareMatcherEntries);
  excluded.sort(compareMatcherEntries);
  return { eligible, excluded };
}

function matcherFor(locale: AbbreviationLocale): LocaleMatcher {
  const cached = matcherCache.get(locale);
  if (cached) return cached;

  const matcher = createLocaleMatcher(abbreviationCatalog(locale) ?? [], locale);
  matcherCache.set(locale, matcher);
  return matcher;
}

function markRange(mask: Uint8Array, start: number, end: number): void {
  const from = Math.max(0, start);
  const to = Math.min(mask.length, end);
  for (let index = from; index < to; index += 1) mask[index] = 1;
}

function isWordCharacterAt(text: string, index: number): boolean {
  return index >= 0 && index < text.length && WORD_CHARACTER.test(text[index] ?? "");
}

function boundaryBefore(text: string, index: number): boolean {
  let cursor = index - 1;
  if (cursor < 0) return true;
  if (DELIMITER.test(text[cursor] ?? "")) {
    while (cursor >= 0 && DELIMITER.test(text[cursor] ?? "")) cursor -= 1;
  }
  return !isWordCharacterAt(text, cursor);
}

function boundaryAfter(text: string, index: number): boolean {
  let cursor = index;
  if (cursor >= text.length) return true;
  if (DELIMITER.test(text[cursor] ?? "")) {
    while (cursor < text.length && DELIMITER.test(text[cursor] ?? "")) cursor += 1;
  }
  return !isWordCharacterAt(text, cursor);
}

function matchAt(
  text: string,
  index: number,
  mask: Uint8Array,
  entries: readonly MatcherEntry[],
  locale: AbbreviationLocale,
): MatcherEntry | null {
  if (!boundaryBefore(text, index)) return null;
  for (const candidate of entries) {
    const end = index + candidate.surface.length;
    if (end > text.length) continue;
    if (!boundaryAfter(text, end)) continue;

    let protectedInside = false;
    for (let cursor = index; cursor < end; cursor += 1) {
      if (mask[cursor]) {
        protectedInside = true;
        break;
      }
    }
    if (protectedInside) continue;

    const slice = text.slice(index, end).toLocaleLowerCase(locale).normalize("NFC");
    if (slice === candidate.folded) return candidate;
  }
  return null;
}

function words(value: string): string[] {
  const trimmed = value.trim();
  return trimmed === "" ? [] : trimmed.split(/\s+/);
}

function matchesWordSequence(
  expected: readonly string[],
  actual: readonly string[],
  locale: AbbreviationLocale,
): boolean {
  if (expected.length === 0 || actual.length < expected.length) return false;
  return expected.every(
    (word, index) => actual[index]?.toLocaleLowerCase(locale) === word.toLocaleLowerCase(locale),
  );
}

/**
 * A shorter term must not be abbreviated when it is part of a longer catalog
 * phrase whose whitespace or boundary differs from the catalog spelling. This
 * keeps `bonus  action` and `unwilling creature` unchanged without collapsing
 * whitespace or matching inside words.
 */
function isPartOfLongerPhrase(
  text: string,
  index: number,
  candidate: MatcherEntry,
  entries: readonly MatcherEntry[],
  locale: AbbreviationLocale,
): boolean {
  const candidateWords = words(candidate.surface);
  if (candidateWords.length === 0) return false;

  const beforeWords = words(text.slice(0, index));
  const afterWords = words(text.slice(index + candidate.surface.length));
  const foldedCandidate = candidateWords.map((word) => word.toLocaleLowerCase(locale));

  for (const longer of entries) {
    if (longer.surface.length <= candidate.surface.length) continue;
    const phraseWords = words(longer.surface);
    if (phraseWords.length <= candidateWords.length) continue;
    const foldedPhrase = phraseWords.map((word) => word.toLocaleLowerCase(locale));

    const suffixStart = foldedPhrase.length - foldedCandidate.length;
    const suffixMatches = foldedPhrase
      .slice(suffixStart)
      .every((word, position) => word === foldedCandidate[position]);
    if (suffixMatches) {
      const prefix = foldedPhrase.slice(0, suffixStart);
      if (prefix.length > 0 && beforeWords.length >= prefix.length) {
        const before = beforeWords
          .slice(beforeWords.length - prefix.length)
          .map((word) => word.toLocaleLowerCase(locale));
        const prefixMatches = prefix.every((word, position) =>
          position === 0 ? (before[position] ?? "").endsWith(word) : before[position] === word,
        );
        if (prefixMatches) return true;
      }
    }

    const prefixMatches = foldedPhrase
      .slice(0, foldedCandidate.length)
      .every((word, position) => word === foldedCandidate[position]);
    if (prefixMatches) {
      const suffix = foldedPhrase.slice(foldedCandidate.length);
      if (matchesWordSequence(suffix, afterWords, locale)) return true;
    }
  }
  return false;
}

function htmlTagEnd(text: string, start: number): number {
  let cursor = start + 1;
  if (text[cursor] === "/") cursor += 1;
  if (!/[A-Za-z]/.test(text[cursor] ?? "")) return -1;

  let quote: string | null = null;
  for (; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === "\n") return -1;
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return cursor + 1;
  }
  return -1;
}

function findClosingBracket(text: string, start: number): number {
  let depth = 0;
  for (let cursor = start; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === "\\") {
      cursor += 1;
      continue;
    }
    if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function findLinkDestinationEnd(text: string, start: number): number {
  let depth = 0;
  let angleDepth = 0;
  let quote: string | null = null;

  for (let cursor = start; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === "\\") {
      cursor += 1;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "<") {
      angleDepth += 1;
      continue;
    }
    if (character === ">") {
      if (angleDepth > 0) angleDepth -= 1;
      continue;
    }
    if (angleDepth > 0) continue;
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
  }
  return -1;
}

function protectFencedCode(text: string, mask: Uint8Array): void {
  let open: { character: string; length: number; start: number } | null = null;
  let lineStart = 0;

  while (lineStart <= text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const nextLine = newline === -1 ? text.length + 1 : newline + 1;
    const line = text.slice(lineStart, lineEnd);

    if (open === null) {
      const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (fence) {
        const run = fence[1] ?? "";
        open = { character: run[0] ?? "", length: run.length, start: lineStart };
      }
    } else {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      const run = close?.[1] ?? "";
      if (close && run[0] === open.character && run.length >= open.length) {
        markRange(mask, open.start, lineEnd);
        open = null;
      }
    }

    if (newline === -1) break;
    lineStart = nextLine;
  }

  if (open !== null) markRange(mask, open.start, text.length);
}

function protectInlineCode(text: string, mask: Uint8Array): void {
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] !== "`" || mask[cursor]) {
      cursor += 1;
      continue;
    }

    let openLength = 0;
    while (text[cursor + openLength] === "`") openLength += 1;

    let closeStart = -1;
    let search = cursor + openLength;
    while (search < text.length) {
      if (text[search] !== "`") {
        search += 1;
        continue;
      }
      let closeLength = 0;
      while (text[search + closeLength] === "`") closeLength += 1;
      if (closeLength === openLength) {
        closeStart = search;
        break;
      }
      search += closeLength;
    }

    if (closeStart === -1) {
      const newline = text.indexOf("\n", cursor);
      const lineEnd = newline === -1 ? text.length : newline;
      markRange(mask, cursor, lineEnd);
      cursor = lineEnd;
    } else {
      const end = closeStart + openLength;
      markRange(mask, cursor, end);
      cursor = end;
    }
  }
}

function protectHtmlComments(text: string, mask: Uint8Array): void {
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf("<!--", cursor);
    if (start === -1) break;
    const close = text.indexOf("-->", start + 4);
    const end = close === -1 ? text.length : close + 3;
    markRange(mask, start, end);
    cursor = end;
  }
}

function protectHtmlTags(text: string, mask: Uint8Array): void {
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] !== "<" || mask[cursor]) {
      cursor += 1;
      continue;
    }
    const end = htmlTagEnd(text, cursor);
    if (end === -1) {
      cursor += 1;
      continue;
    }
    markRange(mask, cursor, end);
    cursor = end;
  }
}

function protectBareLinks(text: string, mask: Uint8Array): void {
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    markRange(mask, start, start + match[0].length);
  }
  for (const match of text.matchAll(EMAIL_PATTERN)) {
    const start = match.index ?? 0;
    markRange(mask, start, start + match[0].length);
  }
}

function protectReferenceDefinitions(text: string, mask: Uint8Array): void {
  for (const match of text.matchAll(REFERENCE_DEFINITION_PATTERN)) {
    const start = match.index ?? 0;
    markRange(mask, start, start + match[0].length);
  }
}

function protectLinksAndImages(text: string, mask: Uint8Array): void {
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] !== "[" || mask[cursor]) {
      cursor += 1;
      continue;
    }

    const close = findClosingBracket(text, cursor);
    if (close === -1) {
      cursor += 1;
      continue;
    }

    const isImage = cursor > 0 && text[cursor - 1] === "!" && !mask[cursor - 1];
    const after = close + 1;

    if (text[after] === "(") {
      const end = findLinkDestinationEnd(text, after);
      if (end !== -1) {
        if (isImage) {
          markRange(mask, cursor - 1, end);
        } else {
          markRange(mask, cursor, cursor + 1);
          markRange(mask, close, close + 1);
          markRange(mask, after, end);
        }
        cursor = end;
        continue;
      }
    } else if (text[after] === "[") {
      const identifierClose = findClosingBracket(text, after);
      if (identifierClose !== -1) {
        if (isImage) {
          markRange(mask, cursor - 1, identifierClose + 1);
        } else if (identifierClose === after + 1) {
          markRange(mask, cursor, identifierClose + 1);
        } else {
          markRange(mask, cursor, cursor + 1);
          markRange(mask, close, close + 1);
          markRange(mask, after, identifierClose + 1);
        }
        cursor = identifierClose + 1;
        continue;
      }
    }

    if (isImage) markRange(mask, cursor - 1, close + 1);
    else markRange(mask, cursor, close + 1);
    cursor = close + 1;
  }
}

function protectEscapes(text: string, mask: Uint8Array): void {
  for (let cursor = 0; cursor < text.length - 1; cursor += 1) {
    if (text[cursor] !== "\\") continue;
    markRange(mask, cursor, cursor + 2);
    cursor += 1;
  }
}

function protectStructuralDelimiters(text: string, mask: Uint8Array): void {
  for (const match of text.matchAll(HORIZONTAL_RULE_PATTERN)) {
    const start = match.index ?? 0;
    markRange(mask, start, start + match[0].length);
  }
  for (const match of text.matchAll(LINE_START_MARKER_PATTERN)) {
    const start = match.index ?? 0;
    markRange(mask, start, start + match[0].length);
  }
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === "*" || character === "_" || character === "~" || character === "|") {
      mask[cursor] = 1;
    }
  }
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === "[" || character === "]" || character === "(" || character === ")") {
      mask[cursor] = 1;
    }
  }
  for (let cursor = 0; cursor < text.length - 1; cursor += 1) {
    if (text[cursor] === "!" && text[cursor + 1] === "[") mask[cursor] = 1;
  }
  for (const match of text.matchAll(HTML_ENTITY_PATTERN)) {
    const start = match.index ?? 0;
    markRange(mask, start, start + match[0].length);
  }
}

function markdownProtectedRanges(text: string): Uint8Array {
  const mask = new Uint8Array(text.length);
  protectFencedCode(text, mask);
  protectInlineCode(text, mask);
  protectHtmlComments(text, mask);
  protectHtmlTags(text, mask);
  protectBareLinks(text, mask);
  protectReferenceDefinitions(text, mask);
  protectLinksAndImages(text, mask);
  protectEscapes(text, mask);
  protectStructuralDelimiters(text, mask);
  return mask;
}

function plainProtectedRanges(text: string): Uint8Array {
  const mask = new Uint8Array(text.length);
  protectBareLinks(text, mask);
  return mask;
}

/**
 * Transforms eligible catalog terms in user-authored text. The matcher uses the
 * captured data language, longest-match precedence, Unicode word boundaries, and
 * a single replacement pass so inserted abbreviations are never rescanned.
 */
export function transformAbbreviationText(
  text: string,
  options: { locale: string; mode: AbbreviationTextMode },
): AbbreviationTransformResult {
  if (text === "" || abbreviationCatalog(options.locale) === null) {
    return { text, applied: [], skipped: [], changed: false };
  }

  const locale = options.locale as AbbreviationLocale;
  const matcher = matcherFor(locale);
  const mask =
    options.mode === "markdown" ? markdownProtectedRanges(text) : plainProtectedRanges(text);

  let output = "";
  const applied = new Map<AbbreviationId, AppliedAbbreviation>();
  const skipped = new Map<AbbreviationId, SkippedAbbreviation>();
  let cursor = 0;

  while (cursor < text.length) {
    if (mask[cursor]) {
      output += text[cursor];
      cursor += 1;
      continue;
    }

    const appliedMatch = matchAt(text, cursor, mask, matcher.eligible, locale);
    if (
      appliedMatch &&
      !isPartOfLongerPhrase(text, cursor, appliedMatch, matcher.eligible, locale)
    ) {
      const { id, full, short } = appliedMatch.entry;
      output += short;
      const existing = applied.get(id);
      if (existing) existing.count += 1;
      else applied.set(id, { id, full, short, count: 1 });
      cursor += appliedMatch.surface.length;
      continue;
    }

    const excludedMatch = matchAt(text, cursor, mask, matcher.excluded, locale);
    if (excludedMatch && !skipped.has(excludedMatch.entry.id)) {
      skipped.set(excludedMatch.entry.id, {
        id: excludedMatch.entry.id,
        full: excludedMatch.entry.full,
        reason: "excluded",
      });
    }

    output += text[cursor];
    cursor += 1;
  }

  return {
    text: output,
    applied: [...applied.values()],
    skipped: [...skipped.values()],
    changed: output !== text,
  };
}
