import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isRecord, SrdSourceError } from "./srd/common.ts";
import { normalizeEnglish } from "./srd/english.ts";
import { validateTranslation } from "./srd/validate.ts";

/**
 * Repairs the generated German SRD spell dataset by rewriting it into the
 * canonical upstream source shape that the normalization pipeline expects
 * (the same shape as `5e-SRD-Spells.json`).
 *
 * The generated German file was emitted in the *normalized runtime* shape
 * (`castingTime`, `school` as a string, `classes` as plain names, `components`
 * as a boolean object, `description` as a paragraph array, extra `id`/`source`
 * fields). This utility matches spells by stable `index`, keeps the canonical
 * English entry as the structural reference (identifiers, URLs, nested
 * references and other language-independent data) and preserves the German
 * localized text (name, casting time, range, duration, material, description,
 * higher-level text).
 *
 * The conversion is deterministic and idempotent: running it on an already
 * converted file yields byte-identical output. Running it on the original
 * generated file is the intended repair. It never invents translations; every
 * dropped or conflicting value is reported.
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_ENGLISH_BASENAME = "5e-SRD-Spells.json";
const GERMAN_BASENAME = "5e-SRD-Spells_de.json";

/** Canonical paragraph separator used by the English source dataset. */
export const DESCRIPTION_JOIN = "\n";

/**
 * A canonical upstream source entry. Only the fields the converter reads or
 * writes are declared; the English reference may carry additional fields
 * (kept verbatim).
 */
export interface CanonicalSpellEntry {
  index: string;
  url: string;
  name: string;
  level: number;
  school: Record<string, unknown>;
  classes: Record<string, unknown>[];
  casting_time: string;
  ritual: boolean;
  range: string;
  components: string[];
  material?: string;
  duration: string;
  concentration: boolean;
  description: string;
  damage?: Record<string, unknown>;
  attack_type?: string;
  higher_level?: string;
  [key: string]: unknown;
}

export interface ConversionConflict {
  index: string;
  field: string;
  german: unknown;
  english: unknown;
}

export interface ConversionReport {
  englishEntries: number;
  germanEntries: number;
  convertedEntries: number;
  /** German indices with no matching English spell (entry skipped). */
  unmatchedGermanIndices: string[];
  /** English indices absent from the German dataset (translation gap). */
  missingGermanIndices: string[];
  /** German indices appearing more than once in the source file. */
  duplicateGermanIndices: string[];
  /** Language-independent mechanics where German contradicts English. */
  mechanicConflicts: ConversionConflict[];
  /** German higher-level text kept although English has none. */
  germanOnlyHigherLevelIndices: string[];
  /** English higher-level text dropped because German provides none. */
  englishOnlyHigherLevelIndices: string[];
  /** German entries not supplying a name (English name kept). */
  missingGermanNames: string[];
  /** German entries not supplying a description (English description kept). */
  missingGermanDescriptions: string[];
  /** German material descriptions kept although English has none. */
  germanOnlyMaterialIndices: string[];
  /** English material descriptions dropped because German provides none. */
  missingGermanMaterialIndices: string[];
  /** German `materialConsumed` values with no canonical source field. */
  droppedMaterialConsumed: { index: string; value: boolean }[];
  /** German `materialCost` values with no canonical source field. */
  droppedMaterialCost: { index: string; value: string }[];
  /** How many entries carried a redundant top-level `id`. */
  removedRedundantId: number;
  /** How many entries carried a redundant top-level `source`. */
  removedRedundantSource: number;
}

export interface ConversionResult {
  entries: CanonicalSpellEntry[];
  report: ConversionReport;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** Joins a paragraph array (or passes a plain string through) using `DESCRIPTION_JOIN`. */
function joinParagraphs(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const items = readStringList(value);
  if (items.length === 0) return undefined;
  return items.join(DESCRIPTION_JOIN);
}

function asEntryArray(raw: unknown, fileName: string): Record<string, unknown>[] {
  if (!Array.isArray(raw)) {
    throw new SrdSourceError(`top-level JSON must be an array of spells`, fileName);
  }
  return raw.map((entry) => {
    if (!isRecord(entry)) {
      throw new SrdSourceError(`every spell entry must be an object`, fileName);
    }
    return entry;
  });
}

interface GermanLocalized {
  name?: string;
  castingTime?: string;
  range?: string;
  duration?: string;
  material?: string;
  description?: string;
  higherLevel?: string;
}

/**
 * Extracts the localized (human-readable) fields from a German entry. Handles
 * both the generated runtime-like shape and the canonical source shape so the
 * converter is idempotent.
 */
function localizedFromGerman(entry: Record<string, unknown>): GermanLocalized {
  const components = isRecord(entry.components) ? entry.components : undefined;
  const material = readString(entry.material) ?? readString(components?.materialDescription);
  const higherLevel =
    readString(entry.higher_level) ??
    joinParagraphs(entry.higher_levels) ??
    joinParagraphs(entry.higherLevels) ??
    joinParagraphs(entry.higherLevel);
  return {
    name: readString(entry.name),
    castingTime: readString(entry.casting_time) ?? readString(entry.castingTime),
    range: readString(entry.range),
    duration: readString(entry.duration),
    material: material !== undefined && material.trim() !== "" ? material : undefined,
    description: joinParagraphs(entry.description),
    higherLevel: higherLevel !== undefined && higherLevel.trim() !== "" ? higherLevel : undefined,
  };
}

interface GermanComponents {
  /** Component letters derived from the entry, normalized to V/S/M. */
  letters: Set<string>;
  materialConsumed?: boolean;
  materialCost?: string;
}

function germanComponents(entry: Record<string, unknown>): GermanComponents {
  const raw = entry.components;
  if (Array.isArray(raw)) {
    const letters = new Set(readStringList(raw).map((letter) => (letter === "G" ? "S" : letter)));
    return { letters };
  }
  if (isRecord(raw)) {
    const letters = new Set<string>();
    if (raw.verbal === true) letters.add("V");
    if (raw.somatic === true) letters.add("S");
    if (raw.material === true) letters.add("M");
    return {
      letters,
      materialConsumed: readBoolean(raw.materialConsumed),
      materialCost: readString(raw.materialCost),
    };
  }
  return { letters: new Set() };
}

function schoolKey(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (isRecord(value)) {
    const index = readString(value.index);
    return index?.trim().toLowerCase();
  }
  return undefined;
}

function classKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(value)) return keys;
  for (const item of value) {
    const key =
      typeof item === "string"
        ? item
        : isRecord(item)
          ? (readString(item.index) ?? readString(item.name))
          : undefined;
    if (key) keys.add(key.trim().toLowerCase());
  }
  return keys;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function pushConflict(
  conflicts: ConversionConflict[],
  index: string,
  field: string,
  german: unknown,
  english: unknown,
): void {
  conflicts.push({ index, field, german, english });
}

function compareMechanics(
  german: Record<string, unknown>,
  english: Record<string, unknown>,
  germanLetters: ReadonlySet<string>,
  index: string,
  conflicts: ConversionConflict[],
): void {
  const germanLevel = german.level;
  if (typeof germanLevel === "number" && germanLevel !== english.level) {
    pushConflict(conflicts, index, "level", germanLevel, english.level);
  }

  const deSchool = schoolKey(german.school);
  const enSchool = schoolKey(english.school);
  if (deSchool !== undefined && deSchool !== enSchool) {
    pushConflict(conflicts, index, "school", german.school, english.school);
  }

  if (Array.isArray(german.classes)) {
    const deClasses = classKeys(german.classes);
    const enClasses = classKeys(english.classes);
    if (!sameSet(deClasses, enClasses)) {
      pushConflict(conflicts, index, "classes", german.classes, english.classes);
    }
  }

  if (
    german.concentration !== undefined &&
    Boolean(german.concentration) !== Boolean(english.concentration)
  ) {
    pushConflict(conflicts, index, "concentration", german.concentration, english.concentration);
  }

  if (german.ritual !== undefined && Boolean(german.ritual) !== Boolean(english.ritual)) {
    pushConflict(conflicts, index, "ritual", german.ritual, english.ritual);
  }

  if (Array.isArray(german.components) || isRecord(german.components)) {
    const enLetters = new Set(readStringList(english.components));
    if (!sameSet(germanLetters, enLetters)) {
      pushConflict(
        conflicts,
        index,
        "components",
        [...germanLetters].sort(),
        [...enLetters].sort(),
      );
    }
  }
}

function convertEntry(
  german: Record<string, unknown>,
  english: Record<string, unknown>,
  report: ConversionReport,
): CanonicalSpellEntry {
  const index = readString(english.index);
  if (!index) {
    throw new SrdSourceError(
      `canonical English entry is missing a string "index"`,
      CANONICAL_ENGLISH_BASENAME,
    );
  }

  const localized = localizedFromGerman(german);
  const components = germanComponents(german);
  const base = cloneJson(english) as unknown as CanonicalSpellEntry;

  if (localized.name !== undefined) base.name = localized.name;
  else report.missingGermanNames.push(index);

  if (localized.castingTime !== undefined) base.casting_time = localized.castingTime;
  if (localized.range !== undefined) base.range = localized.range;
  if (localized.duration !== undefined) base.duration = localized.duration;

  if (localized.description !== undefined) base.description = localized.description;
  else report.missingGermanDescriptions.push(index);

  if (localized.material !== undefined) {
    base.material = localized.material;
    if (readString(english.material) === undefined) report.germanOnlyMaterialIndices.push(index);
  } else if (base.material !== undefined) {
    delete base.material;
    report.missingGermanMaterialIndices.push(index);
  }

  const englishHigher = readString(english.higher_level);
  if (localized.higherLevel !== undefined) {
    base.higher_level = localized.higherLevel;
    if (englishHigher === undefined) report.germanOnlyHigherLevelIndices.push(index);
  } else if (base.higher_level !== undefined) {
    delete base.higher_level;
    if (englishHigher !== undefined) report.englishOnlyHigherLevelIndices.push(index);
  }

  if (components.materialConsumed !== undefined) {
    report.droppedMaterialConsumed.push({ index, value: components.materialConsumed });
  }
  if (components.materialCost !== undefined) {
    report.droppedMaterialCost.push({ index, value: components.materialCost });
  }

  if (readString(german.id) !== undefined) report.removedRedundantId += 1;
  if (readString(german.source) !== undefined) report.removedRedundantSource += 1;

  compareMechanics(german, english, components.letters, index, report.mechanicConflicts);

  return base;
}

/**
 * Converts the generated German dataset into the canonical upstream source
 * shape, using the English dataset as the structural reference. Output follows
 * the English dataset order so repeated runs are stable.
 */
export function convertGermanSpells(germanRaw: unknown, englishRaw: unknown): ConversionResult {
  const englishEntries = asEntryArray(englishRaw, CANONICAL_ENGLISH_BASENAME);
  const germanEntries = asEntryArray(germanRaw, GERMAN_BASENAME);

  const englishByIndex = new Map<string, Record<string, unknown>>();
  for (const entry of englishEntries) {
    const index = readString(entry.index);
    if (!index) {
      throw new SrdSourceError(
        `canonical English entry is missing a string "index"`,
        CANONICAL_ENGLISH_BASENAME,
      );
    }
    if (englishByIndex.has(index)) {
      throw new SrdSourceError(
        `duplicate canonical English index "${index}"`,
        CANONICAL_ENGLISH_BASENAME,
      );
    }
    englishByIndex.set(index, entry);
  }

  const germanByIndex = new Map<string, Record<string, unknown>>();
  const duplicateGermanIndices: string[] = [];
  for (const entry of germanEntries) {
    const index = readString(entry.index);
    if (!index) {
      throw new SrdSourceError(`German entry is missing a string "index"`, GERMAN_BASENAME);
    }
    if (germanByIndex.has(index)) duplicateGermanIndices.push(index);
    else germanByIndex.set(index, entry);
  }

  const report: ConversionReport = {
    englishEntries: englishEntries.length,
    germanEntries: germanEntries.length,
    convertedEntries: 0,
    unmatchedGermanIndices: [],
    missingGermanIndices: [],
    duplicateGermanIndices,
    mechanicConflicts: [],
    germanOnlyHigherLevelIndices: [],
    englishOnlyHigherLevelIndices: [],
    missingGermanNames: [],
    missingGermanDescriptions: [],
    germanOnlyMaterialIndices: [],
    missingGermanMaterialIndices: [],
    droppedMaterialConsumed: [],
    droppedMaterialCost: [],
    removedRedundantId: 0,
    removedRedundantSource: 0,
  };

  const entries: CanonicalSpellEntry[] = [];
  for (const english of englishEntries) {
    const index = readString(english.index) as string;
    const german = germanByIndex.get(index);
    if (!german) {
      report.missingGermanIndices.push(index);
      continue;
    }
    entries.push(convertEntry(german, english, report));
  }

  for (const index of germanByIndex.keys()) {
    if (!englishByIndex.has(index)) report.unmatchedGermanIndices.push(index);
  }

  report.convertedEntries = entries.length;
  return { entries, report };
}

function readJson(filePath: string, fileName: string): Promise<unknown> {
  return readFile(filePath, "utf8").then(
    (text) => {
      try {
        return JSON.parse(text) as unknown;
      } catch (error) {
        throw new SrdSourceError(
          `malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
          fileName,
        );
      }
    },
    () => {
      throw new SrdSourceError(`source file not found`, fileName);
    },
  );
}

export function formatReport(report: ConversionReport): string {
  const lines: string[] = [];
  lines.push(
    `converted ${report.convertedEntries}/${report.germanEntries} German spell(s) against ${report.englishEntries} English spell(s)`,
  );
  const section = (label: string, values: readonly unknown[]): void => {
    if (values.length === 0) return;
    lines.push(`- ${label} (${values.length}): ${values.map((v) => JSON.stringify(v)).join(", ")}`);
  };
  section("German spells with no English match (skipped)", report.unmatchedGermanIndices);
  section("English spells missing from the German dataset", report.missingGermanIndices);
  section("duplicate German indices", report.duplicateGermanIndices);
  section(
    "mechanic conflicts resolved from canonical English",
    report.mechanicConflicts.map((c) => `${c.index}:${c.field}`),
  );
  lines.push(`- mechanic conflicts detail:`);
  for (const conflict of report.mechanicConflicts) {
    lines.push(
      `    ${conflict.index}.${conflict.field}: German=${JSON.stringify(conflict.german)} English=${JSON.stringify(conflict.english)}`,
    );
  }
  section("German-only higher-level text kept", report.germanOnlyHigherLevelIndices);
  section("English higher-level text dropped (no German)", report.englishOnlyHigherLevelIndices);
  section("German-only material text kept", report.germanOnlyMaterialIndices);
  section("English material text dropped (no German)", report.missingGermanMaterialIndices);
  section("entries with no German name (English name kept)", report.missingGermanNames);
  section(
    "entries with no German description (English description kept)",
    report.missingGermanDescriptions,
  );
  section(
    "materialConsumed dropped (no canonical source field)",
    report.droppedMaterialConsumed.map((d) => d.index),
  );
  section(
    "materialCost dropped (no canonical source field)",
    report.droppedMaterialCost.map((d) => d.index),
  );
  if (report.removedRedundantId > 0) {
    lines.push(`- redundant top-level "id" removed from ${report.removedRedundantId} entr(ies)`);
  }
  if (report.removedRedundantSource > 0) {
    lines.push(
      `- redundant top-level "source" removed from ${report.removedRedundantSource} entr(ies)`,
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const inputDir = path.join(rootDir, "data", "srd");
  const englishPath = path.join(inputDir, CANONICAL_ENGLISH_BASENAME);
  const germanPath = path.join(inputDir, GERMAN_BASENAME);

  const englishRaw = await readJson(englishPath, CANONICAL_ENGLISH_BASENAME);
  const germanRaw = await readJson(germanPath, GERMAN_BASENAME);

  const { entries, report } = convertGermanSpells(germanRaw, englishRaw);

  const english = normalizeEnglish(englishRaw, CANONICAL_ENGLISH_BASENAME);
  const englishById = new Map(english.map((spell) => [spell.id, spell]));
  const translated = normalizeEnglish(entries, GERMAN_BASENAME);
  validateTranslation(englishById, translated, GERMAN_BASENAME);

  await writeFile(germanPath, `${JSON.stringify(entries, null, "\t")}\n`, "utf8");

  console.log(formatReport(report));
  console.log(
    `convert:german-srd complete — wrote ${entries.length} canonical German spell(s) to data/srd/${GERMAN_BASENAME}`,
  );
}

const isDirectRun =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error: unknown) => {
    if (error instanceof SrdSourceError) {
      console.error(`convert:german-srd failed: ${error.message}`);
    } else {
      console.error("convert:german-srd failed:", error);
    }
    process.exitCode = 1;
  });
}
