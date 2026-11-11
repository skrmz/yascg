/**
 * Bounded, equivalence-aware numeric and dice comparison (TOOL-17).
 *
 * This is a literal pattern-to-canonical-value normalization table plus a
 * multiset comparison. It performs no inference about spell semantics and
 * never resolves a value that the table does not explicitly cover. Additions
 * are allowed only as literal equivalences that hold in the game's rules, and
 * each addition requires a unit test.
 *
 * Scope: the source side is the replaceable description text, while the spell's
 * casting time, range, and duration metadata is passed separately. A candidate
 * atom that only restates that metadata is whole-spell equivalent, but a
 * source-description atom that disappears is still a mismatch: metadata never
 * excuses an omission from the description.
 */

import { abbreviationCatalog } from "../../locales/abbreviations.ts";

export type NormalizationCategory = "dice" | "time" | "distance" | "weight" | "count" | "relative";

export type EquivalenceClassification = "equivalent" | "mismatch" | "unresolved";

export interface NormalizedAtom {
  /** Matched source text, trimmed. */
  raw: string;
  /** Canonical comparable representation. */
  canonical: string;
  /** False when the unit or role is outside the table. */
  resolved: boolean;
}

export interface CategoryComparison {
  category: NormalizationCategory;
  classification: EquivalenceClassification;
  source: NormalizedAtom[];
  candidate: NormalizedAtom[];
  /** Atoms extracted from the spell's casting time, range, and duration metadata. */
  metadata: NormalizedAtom[];
  /** Candidate atoms that restate a value the spell metadata already provides. */
  metadataRestated: NormalizedAtom[];
  /** Source values with no counterpart in the candidate. */
  missing: NormalizedAtom[];
  /** Candidate values that appear in neither the source description nor the metadata. */
  added: NormalizedAtom[];
  /** Short, actionable explanations of an `unresolved` classification. */
  notes: string[];
}

export interface ComparisonOptions {
  /** Enables the locale's catalog abbreviations for time units and count nouns. */
  locale?: string;
  /**
   * Casting time, range, and duration text. The app displays these fields
   * separately, so a candidate may legitimately restate them.
   */
  metadata?: string;
}

export interface NumericComparisonReport {
  comparisons: CategoryComparison[];
  /** True when every populated category is equivalent. */
  equivalent: boolean;
  /** Confirmed mismatches: high severity, never auto-overridable. */
  mismatches: CategoryComparison[];
  /** Ambiguous items the semantic comparison must review explicitly. */
  unresolved: CategoryComparison[];
}

/**
 * Time: 1 minute = 10 rounds = 60 seconds; 1 round = 6 seconds;
 * 1 hour = 60 minutes; 1 day = 24 hours.
 */
const TIME_UNITS: Record<string, number> = {
  second: 1,
  seconds: 1,
  sec: 1,
  secs: 1,
  sekunde: 1,
  sekunden: 1,
  sek: 1,
  round: 6,
  rounds: 6,
  runde: 6,
  runden: 6,
  minute: 60,
  minutes: 60,
  min: 60,
  mins: 60,
  minuten: 60,
  hour: 3600,
  hours: 3600,
  hr: 3600,
  hrs: 3600,
  stunde: 3600,
  stunden: 3600,
  std: 3600,
  day: 86400,
  days: 86400,
  tag: 86400,
  tage: 86400,
  tagen: 86400,
};

/**
 * Distance/area: 5 feet = 1.5 meters is a labeled approximation, so the table
 * uses the literal factor 0.3 meters per foot. 1 kilometer = 1000 meters.
 */
const DISTANCE_UNITS: Record<string, number> = {
  foot: 0.3,
  feet: 0.3,
  ft: 0.3,
  fuß: 0.3,
  fuss: 0.3,
  meter: 1,
  meters: 1,
  metern: 1,
  m: 1,
  kilometer: 1000,
  kilometers: 1000,
  kilometern: 1000,
  kilometres: 1000,
  km: 1000,
};

/** Weight: 1 pound = 0.45 kilograms (labeled approximation). */
const WEIGHT_UNITS: Record<string, number> = {
  pound: 0.45,
  pounds: 0.45,
  lb: 0.45,
  lbs: 0.45,
  pfund: 0.45,
  kilogram: 1,
  kilograms: 1,
  kilogramm: 1,
  kg: 1,
};

/** Known units without a table factor: reported as `unresolved`. */
const UNRESOLVED_DISTANCE_UNITS = [
  "square feet",
  "square foot",
  "square meters",
  "square meter",
  "quadratmeter",
  "ft²",
  "m²",
  "miles",
  "mile",
  "meilen",
  "meile",
  "inch",
  "inches",
  "zoll",
  "yard",
  "yards",
];

const UNRESOLVED_WEIGHT_UNITS = ["stone", "stones", "ton", "tons", "tonne", "tonnen"];

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  null: 0,
  eins: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
  dreizehn: 13,
  vierzehn: 14,
  fünfzehn: 15,
  sechzehn: 16,
  siebzehn: 17,
  achtzehn: 18,
  neunzehn: 19,
  zwanzig: 20,
  dreißig: 30,
  dreissig: 30,
  vierzig: 40,
  fünfzig: 50,
  sechzig: 60,
  siebzig: 70,
  achtzig: 80,
  neunzig: 90,
  hundert: 100,
};

/**
 * Inflected German numerals ("eine Minute", "einem Meter") are quantities, not
 * counts. They are deliberately excluded from count extraction so an article
 * such as "ein Ziel" never becomes a one-target requirement.
 */
const ARTICLE_NUMBER_WORDS: Record<string, number> = {
  ein: 1,
  eine: 1,
  einen: 1,
  einem: 1,
  einer: 1,
  eines: 1,
};

const COUNT_NOUN_CLASSES: Record<string, string> = {
  creature: "creature",
  creatures: "creature",
  kreatur: "creature",
  kreaturen: "creature",
  target: "target",
  targets: "target",
  ziel: "target",
  ziele: "target",
  zielen: "target",
  object: "object",
  objects: "object",
  objekt: "object",
  objekte: "object",
  gegenstand: "object",
  gegenstände: "object",
  spell: "spell",
  spells: "spell",
  zauber: "spell",
};

/**
 * Catalogue entries whose surfaces denote a count noun. Their short forms
 * ("Ggstd.", "obj.") are legitimate authoring surfaces and must compare equal
 * to the full noun.
 */
const COUNT_NOUN_CATALOG_CLASSES: Record<string, string> = {
  target: "target",
  object: "object",
  objects: "object",
};

/** Catalogue entries that carry a time dimension, with their literal factor. */
const CATALOG_TIME_FACTORS: Record<string, number> = {
  minute: 60,
  minutes: 60,
  hour: 3600,
  hours: 3600,
  day: 86400,
  days: 86400,
};

const RELATIVE_PATTERN = /(?<![\p{L}])(one-half|half|hälfte|halb)(?![\p{L}])|½/giu;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sortedAlternation(keys: readonly string[]): string {
  return [...keys]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
}

const DIGIT_NUMBER_SOURCE = `\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d+)?`;
const NUMBER_SOURCE = `${DIGIT_NUMBER_SOURCE}|${sortedAlternation(Object.keys(NUMBER_WORDS))}`;
const QUANTITY_WORD_NUMBER_SOURCE = sortedAlternation([
  ...Object.keys(NUMBER_WORDS),
  ...Object.keys(ARTICLE_NUMBER_WORDS),
]);

interface ExtractionTables {
  timePattern: RegExp;
  distancePattern: RegExp;
  weightPattern: RegExp;
  timeFactors: Record<string, number>;
  countNouns: Record<string, string>;
  countPattern: RegExp;
  countSurfaces: Map<string, string[]>;
}

const tableCache = new Map<string, ExtractionTables>();

const DICE_PATTERN = new RegExp(
  `(?<![\\p{L}\\d])(\\d{0,3})\\s*([dws])\\s*(\\d{1,3})(?:\\s*([+-])\\s*(\\d{1,3}))?(?![\\p{L}\\d])`,
  "giu",
);

/**
 * Quantities accept digits with an optional space ("20-foot", "1,5m") and
 * number words only when a separator follows ("eine Minute"). Requiring the
 * separator prevents an inflected numeral from absorbing the next unit
 * ("einem" must not parse as "eine" + "m").
 */
function quantityPattern(wordNumbers: string, units: readonly string[]): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\d])(?:(${DIGIT_NUMBER_SOURCE})\\s*|(${wordNumbers})\\s+)[-–—]?\\s*(${sortedAlternation(units)})(?![\\p{L}])`,
    "giu",
  );
}

/** Catalogue surfaces compare as written without their trailing period. */
function catalogSurface(value: string): string {
  return value.trim().toLocaleLowerCase("en").normalize("NFC").replace(/\.$/, "");
}

function catalogDerivedTables(locale: string | undefined): {
  timeUnits: Record<string, number>;
  countNouns: Record<string, string>;
} {
  const catalog = locale ? abbreviationCatalog(locale) : null;
  if (!catalog) return { timeUnits: {}, countNouns: {} };
  const timeUnits: Record<string, number> = {};
  const countNouns: Record<string, string> = {};
  for (const entry of catalog) {
    const factor = CATALOG_TIME_FACTORS[entry.id];
    if (entry.timeUnit && factor !== undefined) {
      for (const form of [entry.short, ...entry.forms]) {
        const surface = catalogSurface(form);
        if (surface !== "") timeUnits[surface] = factor;
      }
    }
    const nounClass = COUNT_NOUN_CATALOG_CLASSES[entry.id];
    if (nounClass) {
      for (const form of [entry.short, ...entry.forms]) {
        const surface = catalogSurface(form);
        if (surface !== "") countNouns[surface] = nounClass;
      }
    }
  }
  return { timeUnits, countNouns };
}

function countSurfacesFor(countNouns: Readonly<Record<string, string>>): Map<string, string[]> {
  const byClass = new Map<string, string[]>();
  for (const [surface, nounClass] of Object.entries(countNouns)) {
    const list = byClass.get(nounClass) ?? [];
    list.push(surface);
    byClass.set(nounClass, list);
  }
  return byClass;
}

function tablesFor(locale: string | undefined): ExtractionTables {
  const key = locale ?? "";
  const cached = tableCache.get(key);
  if (cached) return cached;
  const derived = catalogDerivedTables(locale);
  const timeUnits = { ...TIME_UNITS, ...derived.timeUnits };
  const countNouns = { ...COUNT_NOUN_CLASSES, ...derived.countNouns };
  const countNounSource = sortedAlternation(Object.keys(countNouns));
  const tables: ExtractionTables = {
    timePattern: quantityPattern(QUANTITY_WORD_NUMBER_SOURCE, Object.keys(timeUnits)),
    distancePattern: quantityPattern(QUANTITY_WORD_NUMBER_SOURCE, Object.keys(DISTANCE_UNITS)),
    weightPattern: quantityPattern(QUANTITY_WORD_NUMBER_SOURCE, Object.keys(WEIGHT_UNITS)),
    timeFactors: timeUnits,
    countNouns,
    countPattern: new RegExp(
      `(?<![\\p{L}\\d])(${NUMBER_SOURCE})\\s+(${countNounSource})(?![\\p{L}])`,
      "giu",
    ),
    countSurfaces: countSurfacesFor(countNouns),
  };
  tableCache.set(key, tables);
  return tables;
}

const UNRESOLVED_WEIGHT_UNIT_SET = new Set(UNRESOLVED_WEIGHT_UNITS);
const UNRESOLVED_PATTERN = quantityPattern(QUANTITY_WORD_NUMBER_SOURCE, [
  ...UNRESOLVED_DISTANCE_UNITS,
  ...UNRESOLVED_WEIGHT_UNITS,
]);

const COUNT_WINDOW_TOKENS = 3;

interface Span {
  start: number;
  end: number;
}

function overlaps(spans: readonly Span[], start: number, end: number): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

/** Parses digits with thousands separators and locale decimal commas. */
export function parseNumberToken(token: string): number {
  const trimmed = token.trim().replace(/[−–—]/g, "-");
  if (/^\d{1,3}(?:,\d{3})+$/.test(trimmed)) return Number(trimmed.replace(/,/g, ""));
  if (/^\d{1,3}(?:\.\d{3})+$/.test(trimmed)) return Number(trimmed.replace(/\./g, ""));
  return Number(trimmed.replace(",", "."));
}

function numericValue(token: string): number {
  const key = token.trim().toLowerCase();
  const word = NUMBER_WORDS[key] ?? ARTICLE_NUMBER_WORDS[key];
  return word !== undefined ? word : parseNumberToken(token);
}

function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return String(Math.round(value * 1e6) / 1e6);
}

function collect(
  pattern: RegExp,
  text: string,
  claimed: Span[],
  build: (match: RegExpExecArray, raw: string) => NormalizedAtom | null,
): NormalizedAtom[] {
  const atoms: NormalizedAtom[] = [];
  for (const match of text.matchAll(pattern)) {
    const raw = (match[0] ?? "").trim();
    const start = match.index ?? 0;
    const end = start + (match[0] ?? "").length;
    if (overlaps(claimed, start, end)) continue;
    const atom = build(match, raw);
    if (!atom) continue;
    claimed.push({ start, end });
    atoms.push(atom);
  }
  return atoms;
}

/**
 * Second count pass for compression such as "≤ 4 von dir erschaffene
 * Kreaturen", where up to three words separate the value from its noun. It
 * never crosses punctuation, another number, or an already claimed atom, so it
 * cannot steal a value that belongs to a unit or dice expression. A capitalized
 * word in the gap is another noun or an abbreviation ("1 weiteres Tier als
 * Ziel", "0 TP kehrt das Ziel"), so such an association is rejected instead of
 * guessed.
 */
function collectSeparatedCounts(
  table: ExtractionTables,
  text: string,
  claimed: Span[],
): NormalizedAtom[] {
  const atoms: NormalizedAtom[] = [];
  const numberPattern = new RegExp(`(?<![\\p{L}\\d])(${NUMBER_SOURCE})(?![\\p{L}\\d])`, "giu");
  const gapPattern = new RegExp(
    `^[\\s-]*(?<gap>(?:[\\p{L}][\\p{L}-]*[\\s-]+){0,${COUNT_WINDOW_TOKENS}})(${sortedAlternation(
      Object.keys(table.countNouns),
    )})(?![\\p{L}])`,
    "iu",
  );
  for (const match of text.matchAll(numberPattern)) {
    const start = match.index ?? 0;
    const end = start + (match[0] ?? "").length;
    if (overlaps(claimed, start, end)) continue;
    const gap = gapPattern.exec(text.slice(end));
    if (!gap) continue;
    if (/\p{Lu}/u.test(gap.groups?.gap ?? "")) continue;
    const nounText = gap[2] ?? "";
    const nounEnd = end + gap[0].length;
    const nounStart = nounEnd - nounText.length;
    if (overlaps(claimed, nounStart, nounEnd)) continue;
    const value = numericValue(match[1] ?? "");
    const nounClass = table.countNouns[nounText.toLowerCase()];
    if (!Number.isFinite(value) || !nounClass) continue;
    claimed.push({ start, end }, { start: nounStart, end: nounEnd });
    atoms.push({
      raw: text.slice(start, nounEnd).trim(),
      canonical: `count:${canonicalNumber(value)}:${nounClass}`,
      resolved: true,
    });
  }
  return atoms;
}

interface ExtractedText {
  categories: Map<NormalizationCategory, NormalizedAtom[]>;
  /** Numeric values that no atom claimed; their role is outside the table. */
  bareNumbers: Set<number>;
  text: string;
}

function extractAtoms(text: string, locale: string | undefined): ExtractedText {
  const table = tablesFor(locale);
  const collected = new Map<NormalizationCategory, NormalizedAtom[]>([
    ["dice", []],
    ["time", []],
    ["distance", []],
    ["weight", []],
    ["count", []],
    ["relative", []],
  ]);
  const claimed: Span[] = [];
  const push = (category: NormalizationCategory, atoms: NormalizedAtom[]) => {
    collected.get(category)?.push(...atoms);
  };
  const factors = (units: Record<string, number>, match: RegExpExecArray): number | undefined =>
    units[(match[3] ?? "").toLowerCase()];

  push(
    "dice",
    collect(DICE_PATTERN, text, claimed, (match, raw) => {
      const count = match[1] ? Number(match[1]) : 1;
      const sides = Number(match[3]);
      const modifier = match[4] && match[5] ? Number(match[5]) * (match[4] === "-" ? -1 : 1) : 0;
      if (!Number.isFinite(count) || !Number.isFinite(sides)) return null;
      const signed =
        modifier === 0
          ? ""
          : modifier > 0
            ? `+${canonicalNumber(modifier)}`
            : canonicalNumber(modifier);
      return {
        raw,
        canonical: `${canonicalNumber(count)}d${canonicalNumber(sides)}${signed}`,
        resolved: true,
      };
    }),
  );

  push(
    "time",
    collect(table.timePattern, text, claimed, (match, raw) => {
      const value = numericValue(match[1] ?? match[2] ?? "");
      const factor = factors(table.timeFactors, match);
      if (factor === undefined || !Number.isFinite(value)) return null;
      return { raw, canonical: `time:${canonicalNumber(value * factor)}`, resolved: true };
    }),
  );

  push(
    "distance",
    collect(table.distancePattern, text, claimed, (match, raw) => {
      const value = numericValue(match[1] ?? match[2] ?? "");
      const factor = factors(DISTANCE_UNITS, match);
      if (factor === undefined || !Number.isFinite(value)) return null;
      return { raw, canonical: `distance:${canonicalNumber(value * factor)}`, resolved: true };
    }),
  );

  push(
    "weight",
    collect(table.weightPattern, text, claimed, (match, raw) => {
      const value = numericValue(match[1] ?? match[2] ?? "");
      const factor = factors(WEIGHT_UNITS, match);
      if (factor === undefined || !Number.isFinite(value)) return null;
      return { raw, canonical: `weight:${canonicalNumber(value * factor)}`, resolved: true };
    }),
  );

  const unresolved = collect(UNRESOLVED_PATTERN, text, claimed, (match, raw) => ({
    raw,
    canonical: `unresolved:${(match[3] ?? "").toLowerCase()}`,
    resolved: false,
  }));
  for (const atom of unresolved) {
    const unit = atom.canonical.replace("unresolved:", "");
    push(UNRESOLVED_WEIGHT_UNIT_SET.has(unit) ? "weight" : "distance", [atom]);
  }

  push(
    "count",
    collect(table.countPattern, text, claimed, (match, raw) => {
      const value = numericValue(match[1] ?? "");
      if (!Number.isFinite(value)) return null;
      const nounClass = table.countNouns[(match[2] ?? "").toLowerCase()];
      if (!nounClass) return null;
      return { raw, canonical: `count:${canonicalNumber(value)}:${nounClass}`, resolved: true };
    }),
  );
  push("count", collectSeparatedCounts(table, text, claimed));

  push(
    "relative",
    collect(RELATIVE_PATTERN, text, claimed, (_match, raw) => ({
      raw,
      canonical: "half",
      resolved: true,
    })),
  );

  const bareNumbers = new Set<number>();
  const numberPattern = new RegExp(`(?<![\\p{L}\\d])(${NUMBER_SOURCE})(?![\\p{L}\\d])`, "giu");
  for (const match of text.matchAll(numberPattern)) {
    const start = match.index ?? 0;
    const end = start + (match[0] ?? "").length;
    if (overlaps(claimed, start, end)) continue;
    const value = numericValue(match[1] ?? "");
    if (Number.isFinite(value)) bareNumbers.add(value);
  }

  return { categories: collected, bareNumbers, text };
}

/** Multiset subtraction over resolved canonical values; keeps concrete atoms. */
function difference(
  atoms: readonly NormalizedAtom[],
  remove: readonly NormalizedAtom[],
): NormalizedAtom[] {
  const remaining = new Map<string, number>();
  for (const atom of remove) {
    if (!atom.resolved) continue;
    remaining.set(atom.canonical, (remaining.get(atom.canonical) ?? 0) + 1);
  }
  const result: NormalizedAtom[] = [];
  for (const atom of atoms) {
    if (!atom.resolved) continue;
    const count = remaining.get(atom.canonical) ?? 0;
    if (count > 0) remaining.set(atom.canonical, count - 1);
    else result.push(atom);
  }
  return result;
}

function resolvedCanonicals(atoms: readonly NormalizedAtom[]): string[] {
  return atoms
    .filter((atom) => atom.resolved)
    .map((atom) => atom.canonical)
    .sort();
}

function listValues(atoms: readonly NormalizedAtom[]): string {
  return atoms.map((atom) => `"${atom.raw}"`).join(", ");
}

function countClassCorroborated(
  atom: NormalizedAtom,
  extracted: ExtractedText,
  surfaces: ReadonlyMap<string, readonly string[]>,
): boolean {
  const [, value, nounClass] = atom.canonical.split(":");
  if (value === undefined || nounClass === undefined) return false;
  if (!extracted.bareNumbers.has(Number(value))) return false;
  const candidates = surfaces.get(nounClass) ?? [];
  return candidates.some((surface) =>
    new RegExp(`(?<![\\p{L}])${escapeRegExp(surface)}(?![\\p{L}])`, "iu").test(extracted.text),
  );
}

function classify(
  category: NormalizationCategory,
  sourceAtoms: readonly NormalizedAtom[],
  candidateAtoms: readonly NormalizedAtom[],
  metadataAtoms: readonly NormalizedAtom[],
  candidateText: ExtractedText,
  countSurfaces: ReadonlyMap<string, readonly string[]>,
): CategoryComparison {
  const sourceResolved = resolvedCanonicals(sourceAtoms);
  const candidateResolved = resolvedCanonicals(candidateAtoms);
  const unresolvedPresent = [...sourceAtoms, ...candidateAtoms].some((atom) => !atom.resolved);
  const missing = difference(sourceAtoms, candidateAtoms);
  const extra = difference(candidateAtoms, sourceAtoms);
  const residualExtra = difference(extra, metadataAtoms);
  const metadataRestated = difference(extra, residualExtra);
  const notes: string[] = [];

  const candidateSet = new Set(candidateResolved);
  const sourceSet = new Set(sourceResolved);
  const repetitionOnly =
    missing.every((atom) => candidateSet.has(atom.canonical)) &&
    residualExtra.every((atom) => sourceSet.has(atom.canonical));
  const repeated = missing.length > 0 || residualExtra.length > 0;
  const corroborated = missing.every((atom) =>
    countClassCorroborated(atom, candidateText, countSurfaces),
  );

  let classification: EquivalenceClassification;
  if (!repeated) {
    classification = unresolvedPresent ? "unresolved" : "equivalent";
    if (unresolvedPresent) {
      notes.push("a unit or role is outside the normalization table");
    }
  } else if (repetitionOnly) {
    classification = "unresolved";
    notes.push(
      `the same ${category} values appear a different number of times (${listValues([
        ...missing,
        ...residualExtra,
      ])}); the table cannot tell whether a repetition denotes a separate rule`,
    );
  } else if (corroborated && residualExtra.length === 0) {
    classification = "unresolved";
    notes.push(
      `the candidate states the value of ${listValues(missing)} separately from its count noun; the association needs semantic review`,
    );
  } else {
    classification = "mismatch";
  }

  if (metadataRestated.length > 0) {
    const metadataValues = metadataRestated
      .map((atom) => {
        const match = metadataAtoms.find((candidate) => candidate.canonical === atom.canonical);
        return match ? `"${match.raw}"` : `"${atom.raw}"`;
      })
      .join(", ");
    notes.push(`${listValues(metadataRestated)} restates spell metadata (${metadataValues})`);
  }

  return {
    category,
    classification,
    source: [...sourceAtoms],
    candidate: [...candidateAtoms],
    metadata: [...metadataAtoms],
    metadataRestated,
    missing,
    added: residualExtra,
    notes,
  };
}

export function compareNumericAtoms(
  source: string,
  candidate: string,
  options: ComparisonOptions = {},
): NumericComparisonReport {
  const sourceExtracted = extractAtoms(source, options.locale);
  const candidateExtracted = extractAtoms(candidate, options.locale);
  const metadataExtracted =
    options.metadata !== undefined && options.metadata.trim() !== ""
      ? extractAtoms(options.metadata, options.locale)
      : null;
  const countSurfaces = tablesFor(options.locale).countSurfaces;
  const categories: NormalizationCategory[] = [
    "dice",
    "time",
    "distance",
    "weight",
    "count",
    "relative",
  ];
  const comparisons = categories.map((category) =>
    classify(
      category,
      sourceExtracted.categories.get(category) ?? [],
      candidateExtracted.categories.get(category) ?? [],
      metadataExtracted?.categories.get(category) ?? [],
      candidateExtracted,
      countSurfaces,
    ),
  );
  return {
    comparisons,
    equivalent: comparisons.every((comparison) => comparison.classification === "equivalent"),
    mismatches: comparisons.filter((comparison) => comparison.classification === "mismatch"),
    unresolved: comparisons.filter((comparison) => comparison.classification === "unresolved"),
  };
}
