import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Spell } from "../src/domain/spells.ts";
import { CORE_CLASSES } from "../src/domain/spells.ts";
import { SrdSourceError, requireArray, requireRecord, requireString } from "./srd/common.ts";
import { normalizeEnglish } from "./srd/english.ts";
import { normalizeSharedTranslation } from "./srd/shared-translation.ts";
import { validateTranslation } from "./srd/validate.ts";
import { ENGLISH_BASENAME, serializeMigrated } from "./migrate-srd-source-format.ts";
import {
  canonicalSpellName,
  reconcileSubclasses,
  uncoveredCatalog,
} from "./srd/subclass-reconciliation.ts";

/**
 * One-time, deterministic tool that populates the optional raw `subclasses`
 * field from `data/reference/srd-spells-2024_extended-props.json` into the
 * canonical raw SRD sources. Default is a dry run; writing requires `--apply`.
 *
 * Reuses the Phase-1 migration patterns: pure exported functions, deterministic
 * 2-space/LF/trailing-newline serialization, staged atomic writes with
 * backup/rollback, and filename + index diagnostics. The reference file is
 * never modified; only its `name` and `subclasses` fields are read.
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_SUBCLASS_INPUT_DIR = path.join("data", "srd");
export const DEFAULT_REFERENCE_PATH = path.join(
  "data",
  "reference",
  "srd-spells-2024_extended-props.json",
);
export const DEFAULT_SUBCLASS_FILES = [ENGLISH_BASENAME, "srd-spells-2024_de.json"] as const;
const TRANSLATION_PATTERN = /^srd-spells-2024_(.+)\.json$/;
const CORE_CLASS_SET: ReadonlySet<string> = new Set(CORE_CLASSES);

export interface ReferenceSubclassEntry {
  name: string;
  subclasses: string[];
}

export interface CatalogMappingReport {
  reference: string;
  canonical: string;
  spells: number;
}

export interface SubclassCountReport {
  id: string;
  spells: number;
}

export interface ExcludedSubclassReport {
  id: string;
  reason: string;
  spells: number;
}

export interface DedupCollisionReport {
  canonical: string;
  references: string[];
  spells: number;
}

export interface FilePopulationReport {
  fileName: string;
  totalSpells: number;
  spellsPopulated: number;
  totalAssignments: number;
  status: "populated" | "no-op";
}

export interface SubclassReconciliationReport {
  reference: string;
  mode: "dry-run" | "applied";
  catalog: { total: number; covered: string[]; uncovered: string[] };
  catalogMapped: CatalogMappingReport[];
  referenceOnly: SubclassCountReport[];
  excluded: ExcludedSubclassReport[];
  dedupCollisions: DedupCollisionReport[];
  unmatchedSpellNames: Record<string, { source: string[]; reference: string[] }>;
  files: FilePopulationReport[];
  totals: {
    referenceSpells: number;
    referenceSpellsWithSubclasses: number;
    spellsPopulated: number;
    totalAssignments: number;
    catalogAssignments: number;
    referenceOnlyAssignments: number;
    excludedAssignments: number;
  };
}

export interface ReconciliationData {
  /** Canonical spell name → sorted, deduplicated identifiers to store. */
  byName: Map<string, string[]>;
  catalogMapped: CatalogMappingReport[];
  referenceOnly: SubclassCountReport[];
  excluded: ExcludedSubclassReport[];
  dedupCollisions: DedupCollisionReport[];
  covered: Set<string>;
  referenceSpellsWithSubclasses: number;
  totalAssignments: number;
  catalogAssignments: number;
  referenceOnlyAssignments: number;
  excludedAssignments: number;
}

export interface FileApplication {
  content: unknown[];
  changed: boolean;
  totalSpells: number;
  spellsPopulated: number;
  totalAssignments: number;
  /** Lookup keys (canonical names or indices) with no matching reference entry. */
  unmatched: string[];
  /** Lookup keys encountered in the source (canonical names for English, indices otherwise). */
  keys: string[];
}

/** Name matching applies explicit spelling aliases; translation sources match by index. */
export type SubclassMatchMode = "name" | "index";

export interface SubclassMigrationOptions {
  inputDir: string;
  referencePath: string;
  files?: readonly string[];
  apply?: boolean;
  /** Directory holding the committed generated datasets used for self-validation. */
  baselineDir?: string;
}

export interface SubclassMigrationResult {
  report: SubclassReconciliationReport;
  changedFiles: string[];
}

function byCanonical(a: { canonical: string }, b: { canonical: string }): number {
  return a.canonical.localeCompare(b.canonical);
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

/** Parses the reference file, reading only `name` and `subclasses`. */
export function parseReference(raw: unknown, fileName: string): ReferenceSubclassEntry[] {
  if (!Array.isArray(raw)) {
    throw new SrdSourceError(`top-level JSON must be an array of spells`, fileName);
  }
  const entries: ReferenceSubclassEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const index = `#${entries.length}`;
    const entry = requireRecord(item, fileName, index, "entry");
    const name = requireString(entry.name, fileName, index, "name").trim();
    if (name === "") throw new SrdSourceError(`field "name" must not be blank`, fileName, index);
    if (seen.has(name)) {
      throw new SrdSourceError(`duplicate spell name "${name}"`, fileName, index);
    }
    seen.add(name);
    const subclasses: string[] = [];
    const rawSubclasses = entry.subclasses;
    if (rawSubclasses !== undefined && rawSubclasses !== null) {
      const list = requireArray(rawSubclasses, fileName, name, "subclasses");
      for (const value of list) {
        const text = requireString(value, fileName, name, "subclasses[]").trim();
        if (text === "") {
          throw new SrdSourceError(`field "subclasses[]" must not be blank`, fileName, name);
        }
        subclasses.push(text);
      }
    }
    entries.push({ name, subclasses });
  }
  return entries;
}

/** Pure aggregation of the reference subclass inventory used by the tool. */
export function buildReconciliation(
  entries: readonly ReferenceSubclassEntry[],
): ReconciliationData {
  const byName = new Map<string, string[]>();
  const catalogMapped = new Map<string, CatalogMappingReport>();
  const referenceOnlyCounts = new Map<string, number>();
  const excludedCounts = new Map<string, ExcludedSubclassReport>();
  const collisions = new Map<string, { references: Set<string>; spells: number }>();
  const covered = new Set<string>();
  let referenceSpellsWithSubclasses = 0;
  let catalogAssignments = 0;
  let referenceOnlyAssignments = 0;
  let excludedAssignments = 0;

  for (const entry of entries) {
    const key = canonicalSpellName(entry.name);
    if (byName.has(key)) {
      throw new SrdSourceError(`duplicate spell name "${entry.name}"`, "(reference)", entry.name);
    }
    if (entry.subclasses.length === 0) {
      byName.set(key, []);
      continue;
    }
    referenceSpellsWithSubclasses += 1;
    const reconciled = reconcileSubclasses(entry.subclasses);
    byName.set(key, reconciled.assigned);
    catalogAssignments += reconciled.catalog.length;
    referenceOnlyAssignments += reconciled.referenceOnly.length;
    excludedAssignments += reconciled.excluded.length;
    for (const pair of reconciled.catalog) {
      covered.add(pair.canonical);
      const current = catalogMapped.get(pair.canonical);
      if (current) current.spells += 1;
      else
        catalogMapped.set(pair.canonical, {
          reference: pair.reference,
          canonical: pair.canonical,
          spells: 1,
        });
    }
    for (const id of reconciled.referenceOnly) {
      referenceOnlyCounts.set(id, (referenceOnlyCounts.get(id) ?? 0) + 1);
    }
    for (const item of reconciled.excluded) {
      const current = excludedCounts.get(item.id);
      if (current) current.spells += 1;
      else excludedCounts.set(item.id, { id: item.id, reason: item.reason, spells: 1 });
    }
    for (const collision of reconciled.collisions) {
      const current = collisions.get(collision.id);
      if (current) {
        current.spells += 1;
        for (const reference of collision.references) current.references.add(reference);
      } else {
        collisions.set(collision.id, {
          references: new Set(collision.references),
          spells: 1,
        });
      }
    }
  }

  return {
    byName,
    catalogMapped: [...catalogMapped.values()].sort(byCanonical),
    referenceOnly: [...referenceOnlyCounts].map(([id, spells]) => ({ id, spells })).sort(byId),
    excluded: [...excludedCounts.values()].sort(byId),
    dedupCollisions: [...collisions]
      .map(([canonical, value]) => ({
        canonical,
        references: [...value.references].sort(),
        spells: value.spells,
      }))
      .sort(byCanonical),
    covered,
    referenceSpellsWithSubclasses,
    totalAssignments: catalogAssignments + referenceOnlyAssignments,
    catalogAssignments,
    referenceOnlyAssignments,
    excludedAssignments,
  };
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const item of b) if (!set.has(item)) return false;
  return true;
}

/** Inserts `subclasses` immediately after `classes`, preserving all other fields/order. */
function withSubclassesAfterClasses(
  entry: Record<string, unknown>,
  subclasses: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let inserted = false;
  for (const [key, value] of Object.entries(entry)) {
    if (key === "subclasses") continue;
    result[key] = value;
    if (key === "classes") {
      result.subclasses = [...subclasses];
      inserted = true;
    }
  }
  if (!inserted) {
    throw new SrdSourceError(
      `cannot populate "subclasses": the entry has no "classes" field to insert after`,
      "(unknown)",
    );
  }
  return result;
}

/**
 * Applies the reconciled assignments to one raw source. Entries without a
 * reference match are left untouched and reported; an existing `subclasses`
 * value that differs from the expectation aborts the run (no silent overwrite).
 */
export function applySubclassesToSource(
  raw: unknown,
  fileName: string,
  lookup: ReadonlyMap<string, readonly string[]>,
  mode: SubclassMatchMode = "name",
): FileApplication {
  if (!Array.isArray(raw)) {
    throw new SrdSourceError(`top-level JSON must be an array of spells`, fileName);
  }
  const content: unknown[] = [];
  const unmatched: string[] = [];
  const keys: string[] = [];
  const seen = new Set<string>();
  let spellsPopulated = 0;
  let totalAssignments = 0;

  for (const item of raw) {
    const entry = requireRecord(item, fileName, "(source)", "entry");
    const name = requireString(entry.name, fileName, "(source)", "name").trim();
    if (seen.has(name)) {
      throw new SrdSourceError(`duplicate spell name "${name}"`, fileName, name);
    }
    seen.add(name);

    const key =
      mode === "name"
        ? canonicalSpellName(name)
        : requireString(entry.index, fileName, name, "index");
    keys.push(key);
    const expected = lookup.get(key);
    if (expected === undefined) unmatched.push(key);

    const hasSubclasses = Object.hasOwn(entry, "subclasses");
    if (hasSubclasses) {
      const existing = requireArray(entry.subclasses, fileName, name, "subclasses").map((value) =>
        requireString(value, fileName, name, "subclasses[]"),
      );
      if (expected === undefined || !sameStringSet(existing, expected)) {
        throw new SrdSourceError(
          `existing "subclasses" does not match the reconciled expectation (existing=${JSON.stringify(
            existing,
          )}, expected=${JSON.stringify(expected ?? [])})`,
          fileName,
          name,
        );
      }
      totalAssignments += existing.length;
      if (existing.length > 0) spellsPopulated += 1;
      content.push(entry);
      continue;
    }

    if (expected !== undefined && expected.length > 0) {
      content.push(withSubclassesAfterClasses(entry, expected));
      totalAssignments += expected.length;
      spellsPopulated += 1;
    } else {
      content.push(entry);
    }
  }

  const changed = content.some((entry, index) => {
    const original = (raw as unknown[])[index] as Record<string, unknown>;
    return (
      Object.hasOwn(entry as Record<string, unknown>, "subclasses") !==
      Object.hasOwn(original, "subclasses")
    );
  });

  return {
    content,
    changed,
    totalSpells: raw.length,
    spellsPopulated,
    totalAssignments,
    unmatched,
    keys,
  };
}

/**
 * Maps each canonical index to the reconciled assignment of the matching
 * English spell. Translations are matched by index because their spell names are
 * localized free text.
 */
function indexAssignments(
  raw: unknown,
  fileName: string,
  byName: ReadonlyMap<string, readonly string[]>,
): Map<string, readonly string[]> {
  const map = new Map<string, readonly string[]>();
  if (!Array.isArray(raw)) {
    throw new SrdSourceError(`top-level JSON must be an array of spells`, fileName);
  }
  for (const item of raw) {
    const entry = requireRecord(item, fileName, "(source)", "entry");
    const index = requireString(entry.index, fileName, "(source)", "index");
    const name = requireString(entry.name, fileName, index, "name").trim();
    map.set(index, byName.get(canonicalSpellName(name)) ?? []);
  }
  return map;
}

/** Removes `subclasses` from normalized spells for the mechanics-unchanged comparison. */
export function stripSubclasses(spells: readonly Spell[]): unknown[] {
  return spells.map((spell) => {
    if (!Object.hasOwn(spell, "subclasses")) return spell;
    const { subclasses: _omitted, ...rest } = spell;
    return rest;
  });
}

function datasetBasenameFor(fileName: string): string | undefined {
  if (fileName === ENGLISH_BASENAME) return "spells.srd.json";
  const match = TRANSLATION_PATTERN.exec(fileName);
  return match ? `spells.srd.${match[1]}.json` : undefined;
}

async function readBaseline(baselineDir: string, basename: string): Promise<string> {
  try {
    return await readFile(path.join(baselineDir, basename), "utf8");
  } catch {
    throw new SrdSourceError(
      `missing committed baseline dataset "${basename}" required to verify the migration`,
      basename,
    );
  }
}

function assertSubclassShape(spells: readonly Spell[], fileName: string): void {
  for (const spell of spells) {
    for (const id of spell.subclasses ?? []) {
      const separatorIndex = id.indexOf(": ");
      if (separatorIndex === -1 || id.indexOf(": ", separatorIndex + 2) !== -1) {
        throw new SrdSourceError(
          `subclass "${id}" must have a single ": " separator`,
          fileName,
          spell.id,
        );
      }
      const parent = id.slice(0, separatorIndex);
      if (!CORE_CLASS_SET.has(parent)) {
        throw new SrdSourceError(
          `subclass "${id}" has an unsupported parent class "${parent}"`,
          fileName,
          spell.id,
        );
      }
    }
  }
}

/**
 * Normalizes the migrated sources in memory and verifies that (a) every field
 * except `subclasses` matches the committed datasets, (b) subclasses match the
 * reconciled expectation, (c) EN/DE assignments are identical, and (d) every
 * identifier's parent class is a core class.
 */
export async function verifyMigratedSources(
  applications: ReadonlyMap<string, FileApplication>,
  data: ReconciliationData,
  baselineDir: string,
): Promise<void> {
  const englishApplication = applications.get(ENGLISH_BASENAME);
  if (!englishApplication) {
    throw new SrdSourceError(
      `verification requires the canonical English source "${ENGLISH_BASENAME}"`,
      ENGLISH_BASENAME,
    );
  }
  const english = normalizeEnglish(englishApplication.content, ENGLISH_BASENAME);
  assertSubclassShape(english, ENGLISH_BASENAME);
  assertSubclassExpectation(english, data, ENGLISH_BASENAME);

  const englishBaseline = await readBaseline(baselineDir, "spells.srd.json");
  if (JSON.stringify(stripSubclasses(english)) !== englishBaseline.trimEnd()) {
    throw new SrdSourceError(
      `migrated English source changes fields other than "subclasses" relative to "spells.srd.json"`,
      ENGLISH_BASENAME,
    );
  }

  const englishById = new Map<string, Spell>(english.map((spell) => [spell.id, spell]));

  for (const [fileName, application] of applications) {
    if (fileName === ENGLISH_BASENAME) continue;
    const basename = datasetBasenameFor(fileName);
    if (!basename) {
      throw new SrdSourceError(`cannot verify unrecognized SRD source file name`, fileName);
    }
    const translated = normalizeSharedTranslation(application.content, fileName);
    validateTranslation(englishById, translated, fileName);
    assertSubclassShape(translated, fileName);
    for (const spell of translated) {
      const reference = englishById.get(spell.id);
      const expected = reference?.subclasses ?? [];
      const actual = spell.subclasses ?? [];
      if (!sameStringSet(actual, expected)) {
        throw new SrdSourceError(
          `subclass assignments differ from English (English=${JSON.stringify(
            expected,
          )}, translated=${JSON.stringify(actual)})`,
          fileName,
          spell.id,
        );
      }
    }
    const baseline = await readBaseline(baselineDir, basename);
    if (JSON.stringify(stripSubclasses(translated)) !== baseline.trimEnd()) {
      throw new SrdSourceError(
        `migrated source changes fields other than "subclasses" relative to "${basename}"`,
        fileName,
      );
    }
  }
}

function assertSubclassExpectation(
  spells: readonly Spell[],
  data: ReconciliationData,
  fileName: string,
): void {
  for (const spell of spells) {
    const expected = data.byName.get(canonicalSpellName(spell.name)) ?? [];
    const actual = spell.subclasses ?? [];
    if (!sameStringSet(actual, expected)) {
      throw new SrdSourceError(
        `subclass assignments do not match the reconciled reference (expected=${JSON.stringify(
          expected,
        )}, actual=${JSON.stringify(actual)})`,
        fileName,
        spell.id,
      );
    }
  }
}

function parseJson(text: string, fileName: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new SrdSourceError(
      `malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
      fileName,
    );
  }
}

async function readText(filePath: string, fileName: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    throw new SrdSourceError(`source file not found`, fileName);
  }
}

interface PlannedFile {
  fileName: string;
  filePath: string;
  serialized: string;
}

async function writeAtomically(planned: readonly PlannedFile[]): Promise<void> {
  const staged: { filePath: string; tempPath: string }[] = [];
  const backups: { filePath: string; backupPath: string }[] = [];
  try {
    for (const item of planned) {
      const tempPath = `${item.filePath}.migrate-tmp`;
      await writeFile(tempPath, item.serialized, "utf8");
      const verify = await readFile(tempPath, "utf8");
      if (verify !== item.serialized) {
        throw new SrdSourceError(`staged temp file failed verification`, item.fileName);
      }
      staged.push({ filePath: item.filePath, tempPath });
    }
    for (const item of staged) {
      const backupPath = `${item.filePath}.migrate-bak`;
      await rm(backupPath, { force: true });
      await rename(item.filePath, backupPath);
      backups.push({ filePath: item.filePath, backupPath });
      await rename(item.tempPath, item.filePath);
    }
  } catch (error) {
    for (const backup of backups) {
      try {
        await rename(backup.backupPath, backup.filePath);
      } catch {
        // Restoring best-effort; the original error is reported below.
      }
    }
    for (const item of staged) {
      try {
        await rm(item.tempPath, { force: true });
      } catch {
        // Cleanup best-effort.
      }
    }
    throw error;
  }
  for (const backup of backups) {
    await rm(backup.backupPath, { force: true });
  }
}

export async function runSubclassMigration(
  options: SubclassMigrationOptions,
): Promise<SubclassMigrationResult> {
  const files = options.files ?? [...DEFAULT_SUBCLASS_FILES];
  const baselineDir = options.baselineDir ?? path.join(rootDir, "src", "data");
  const referenceFileName = path.basename(options.referencePath);
  const referenceRaw = parseJson(
    await readText(options.referencePath, referenceFileName),
    referenceFileName,
  );
  const referenceEntries = parseReference(referenceRaw, referenceFileName);
  const data = buildReconciliation(referenceEntries);

  const applications = new Map<string, FileApplication>();
  const referenceNames = new Set(referenceEntries.map((entry) => canonicalSpellName(entry.name)));
  let byIndex: Map<string, readonly string[]> | undefined;
  for (const fileName of files) {
    if (path.basename(fileName) !== fileName) {
      throw new SrdSourceError(`"--files" entries must be plain file names`, fileName);
    }
    const filePath = path.join(options.inputDir, fileName);
    const raw = parseJson(await readText(filePath, fileName), fileName);
    if (fileName === ENGLISH_BASENAME) {
      applications.set(fileName, applySubclassesToSource(raw, fileName, data.byName, "name"));
      byIndex = indexAssignments(raw, fileName, data.byName);
    } else {
      if (!byIndex) {
        throw new SrdSourceError(
          `verification requires the canonical English source "${ENGLISH_BASENAME}" first`,
          fileName,
        );
      }
      applications.set(fileName, applySubclassesToSource(raw, fileName, byIndex, "index"));
    }
  }

  const unmatchedSpellNames: Record<string, { source: string[]; reference: string[] }> = {};
  const englishApplication = applications.get(ENGLISH_BASENAME);
  if (englishApplication) {
    const present = new Set(englishApplication.keys);
    const reference = [...referenceNames].filter((name) => !present.has(name)).sort();
    if (englishApplication.unmatched.length > 0 || reference.length > 0) {
      unmatchedSpellNames[ENGLISH_BASENAME] = {
        source: [...englishApplication.unmatched].sort(),
        reference,
      };
    }
  }
  for (const [fileName, application] of applications) {
    if (fileName === ENGLISH_BASENAME || application.unmatched.length === 0) continue;
    unmatchedSpellNames[fileName] = { source: [...application.unmatched].sort(), reference: [] };
  }

  await verifyMigratedSources(applications, data, baselineDir);

  const changedFiles = [...applications]
    .filter(([, application]) => application.changed)
    .map(([fileName]) => fileName)
    .sort();

  if (options.apply && changedFiles.length > 0) {
    const planned: PlannedFile[] = [];
    for (const fileName of changedFiles) {
      const application = applications.get(fileName);
      if (!application) continue;
      planned.push({
        fileName,
        filePath: path.join(options.inputDir, fileName),
        serialized: serializeMigrated(application.content),
      });
    }
    await writeAtomically(planned);
  }

  const report: SubclassReconciliationReport = {
    reference: options.referencePath,
    mode: options.apply ? "applied" : "dry-run",
    catalog: {
      total: uncoveredCatalog(data.covered).length + data.covered.size,
      covered: [...data.covered].sort(),
      uncovered: uncoveredCatalog(data.covered),
    },
    catalogMapped: data.catalogMapped,
    referenceOnly: data.referenceOnly,
    excluded: data.excluded,
    dedupCollisions: data.dedupCollisions,
    unmatchedSpellNames,
    files: [...applications].map(([fileName, application]) => ({
      fileName,
      totalSpells: application.totalSpells,
      spellsPopulated: application.spellsPopulated,
      totalAssignments: application.totalAssignments,
      status: application.changed ? "populated" : "no-op",
    })),
    totals: {
      referenceSpells: referenceEntries.length,
      referenceSpellsWithSubclasses: data.referenceSpellsWithSubclasses,
      spellsPopulated: englishApplication?.spellsPopulated ?? 0,
      totalAssignments: data.totalAssignments,
      catalogAssignments: data.catalogAssignments,
      referenceOnlyAssignments: data.referenceOnlyAssignments,
      excludedAssignments: data.excludedAssignments,
    },
  };

  return { report, changedFiles };
}

function requireOptionValue(argv: readonly string[], position: number, option: string): string {
  const value = argv[position];
  if (value === undefined || value === "") {
    throw new Error(`option "${option}" requires a value`);
  }
  return value;
}

export function parseSubclassArgs(argv: readonly string[]): {
  inputDir: string;
  referencePath: string;
  files: string[];
  apply: boolean;
  reportPath?: string;
} {
  let inputDir = DEFAULT_SUBCLASS_INPUT_DIR;
  let referencePath = DEFAULT_REFERENCE_PATH;
  let files: string[] = [...DEFAULT_SUBCLASS_FILES];
  let apply = false;
  let reportPath: string | undefined;
  for (let position = 0; position < argv.length; position += 1) {
    const arg = argv[position];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--input-dir") {
      inputDir = requireOptionValue(argv, position + 1, "--input-dir");
      position += 1;
    } else if (arg === "--reference") {
      referencePath = requireOptionValue(argv, position + 1, "--reference");
      position += 1;
    } else if (arg === "--files") {
      files = requireOptionValue(argv, position + 1, "--files")
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== "");
      position += 1;
    } else if (arg === "--report") {
      reportPath = requireOptionValue(argv, position + 1, "--report");
      position += 1;
    } else {
      throw new Error(`unknown option "${arg}"`);
    }
  }
  return { inputDir, referencePath, files, apply, reportPath };
}

async function main(): Promise<void> {
  const options = parseSubclassArgs(process.argv.slice(2));
  const result = await runSubclassMigration({
    inputDir: path.resolve(process.cwd(), options.inputDir),
    referencePath: path.resolve(process.cwd(), options.referencePath),
    files: options.files,
    apply: options.apply,
  });
  const text = `${JSON.stringify(result.report, null, 2)}\n`;
  if (options.reportPath) {
    await writeFile(path.resolve(process.cwd(), options.reportPath), text, "utf8");
  }
  console.log(text);
  if (!options.apply) {
    console.log("dry-run: no files were modified (pass --apply to write)");
  }
}

const isDirectRun =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error: unknown) => {
    if (error instanceof SrdSourceError) {
      console.error(`migrate-srd-subclasses failed: ${error.message}`);
    } else {
      console.error("migrate-srd-subclasses failed:", error);
    }
    process.exitCode = 1;
  });
}
