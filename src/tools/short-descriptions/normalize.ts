/**
 * Bounded, equivalence-aware numeric and dice comparison (TOOL-17).
 *
 * This is a literal pattern-to-canonical-value normalization table plus a
 * multiset comparison. It performs no inference about spell semantics and
 * never resolves a value that the table does not explicitly cover. Additions
 * are allowed only as literal equivalences that hold in the game's rules, and
 * each addition requires a unit test.
 */

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
 * uses the literal factor 0.3 meters per foot. Miles are outside the table.
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

const NUMBER_SOURCE = `\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d+)?|${sortedAlternation(Object.keys(NUMBER_WORDS))}`;
const COUNT_NOUN_SOURCE = sortedAlternation(Object.keys(COUNT_NOUN_CLASSES));

function quantityPattern(units: readonly string[]): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\d])(${NUMBER_SOURCE})\\s*[-–—]?\\s*(${sortedAlternation(units)})(?![\\p{L}])`,
    "giu",
  );
}

const DICE_PATTERN = new RegExp(
  `(?<![\\p{L}\\d])(\\d{0,3})\\s*([dws])\\s*(\\d{1,3})(?:\\s*([+-])\\s*(\\d{1,3}))?(?![\\p{L}\\d])`,
  "giu",
);

const TIME_PATTERN = quantityPattern(Object.keys(TIME_UNITS));
const DISTANCE_PATTERN = quantityPattern(Object.keys(DISTANCE_UNITS));
const WEIGHT_PATTERN = quantityPattern(Object.keys(WEIGHT_UNITS));
const UNRESOLVED_WEIGHT_UNIT_SET = new Set(UNRESOLVED_WEIGHT_UNITS);
const UNRESOLVED_PATTERN = quantityPattern([
  ...UNRESOLVED_DISTANCE_UNITS,
  ...UNRESOLVED_WEIGHT_UNITS,
]);

const COUNT_PATTERN = new RegExp(
  `(?<![\\p{L}\\d])(${NUMBER_SOURCE})\\s+(${COUNT_NOUN_SOURCE})(?![\\p{L}])`,
  "giu",
);

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
  const word = NUMBER_WORDS[token.trim().toLowerCase()];
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

function extractAtoms(text: string): Map<NormalizationCategory, NormalizedAtom[]> {
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
    collect(TIME_PATTERN, text, claimed, (match, raw) => {
      const unit = (match[2] ?? "").toLowerCase();
      const value = numericValue(match[1] ?? "");
      const factor = TIME_UNITS[unit];
      if (factor === undefined || !Number.isFinite(value)) return null;
      return { raw, canonical: `time:${canonicalNumber(value * factor)}`, resolved: true };
    }),
  );

  push(
    "distance",
    collect(DISTANCE_PATTERN, text, claimed, (match, raw) => {
      const unit = (match[2] ?? "").toLowerCase();
      const value = numericValue(match[1] ?? "");
      const factor = DISTANCE_UNITS[unit];
      if (factor === undefined || !Number.isFinite(value)) return null;
      return { raw, canonical: `distance:${canonicalNumber(value * factor)}`, resolved: true };
    }),
  );

  push(
    "weight",
    collect(WEIGHT_PATTERN, text, claimed, (match, raw) => {
      const unit = (match[2] ?? "").toLowerCase();
      const value = numericValue(match[1] ?? "");
      const factor = WEIGHT_UNITS[unit];
      if (factor === undefined || !Number.isFinite(value)) return null;
      return { raw, canonical: `weight:${canonicalNumber(value * factor)}`, resolved: true };
    }),
  );

  const unresolved = collect(UNRESOLVED_PATTERN, text, claimed, (match, raw) => ({
    raw,
    canonical: `unresolved:${(match[2] ?? "").toLowerCase()}`,
    resolved: false,
  }));
  for (const atom of unresolved) {
    const unit = atom.canonical.replace("unresolved:", "");
    push(UNRESOLVED_WEIGHT_UNIT_SET.has(unit) ? "weight" : "distance", [atom]);
  }

  push(
    "count",
    collect(COUNT_PATTERN, text, claimed, (match, raw) => {
      const value = numericValue(match[1] ?? "");
      if (!Number.isFinite(value)) return null;
      const nounClass = COUNT_NOUN_CLASSES[(match[2] ?? "").toLowerCase()];
      if (!nounClass) return null;
      return { raw, canonical: `count:${canonicalNumber(value)}:${nounClass}`, resolved: true };
    }),
  );

  push(
    "relative",
    collect(RELATIVE_PATTERN, text, claimed, (_match, raw) => ({
      raw,
      canonical: "half",
      resolved: true,
    })),
  );

  return collected;
}

function classify(
  category: NormalizationCategory,
  sourceAtoms: NormalizedAtom[],
  candidateAtoms: NormalizedAtom[],
): CategoryComparison {
  const sourceResolved = sourceAtoms
    .filter((atom) => atom.resolved)
    .map((atom) => atom.canonical)
    .sort();
  const candidateResolved = candidateAtoms
    .filter((atom) => atom.resolved)
    .map((atom) => atom.canonical)
    .sort();
  const unresolvedPresent = [...sourceAtoms, ...candidateAtoms].some((atom) => !atom.resolved);

  let classification: EquivalenceClassification;
  if (sourceResolved.join("|") !== candidateResolved.join("|")) {
    classification = "mismatch";
  } else if (unresolvedPresent) {
    classification = "unresolved";
  } else {
    classification = "equivalent";
  }
  return { category, classification, source: sourceAtoms, candidate: candidateAtoms };
}

export function compareNumericAtoms(source: string, candidate: string): NumericComparisonReport {
  const sourceAtoms = extractAtoms(source);
  const candidateAtoms = extractAtoms(candidate);
  const categories: NormalizationCategory[] = [
    "dice",
    "time",
    "distance",
    "weight",
    "count",
    "relative",
  ];
  const comparisons = categories.map((category) =>
    classify(category, sourceAtoms.get(category) ?? [], candidateAtoms.get(category) ?? []),
  );
  return {
    comparisons,
    equivalent: comparisons.every((comparison) => comparison.classification === "equivalent"),
    mismatches: comparisons.filter((comparison) => comparison.classification === "mismatch"),
    unresolved: comparisons.filter((comparison) => comparison.classification === "unresolved"),
  };
}
