import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Spell } from "../src/domain/spells.ts";
import {
  CANONICAL_DAMAGE_TYPES,
  CLASS_BY_INDEX,
  SCHOOL_BY_INDEX,
  SrdSourceError,
  canonicalSubclasses,
  requireArray,
  requireRecord,
  requireString,
} from "./srd/common.ts";
import { isCanonicalSourceShape, isLegacySourceShape, normalizeEnglish } from "./srd/english.ts";
import { normalizeSharedTranslation } from "./srd/shared-translation.ts";
import { validateTranslation } from "./srd/validate.ts";

/**
 * One-time utility that migrates the legacy 5e-bits raw SRD sources to the
 * canonical source shape (string `school`, string[] `classes`, string
 * `damage.damage_type`, no top-level `url`). It is temporary infrastructure and
 * may be deleted once the migration has landed.
 *
 * Default is a dry run; writing requires `--apply`.
 *
 * Unknown or ambiguous mappings, malformed legacy entries and failed baseline
 * verification abort the run with an actionable filename + index diagnostic
 * (thrown before anything is written) rather than being collected in the JSON
 * report; the report therefore only describes successful conversions.
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ENGLISH_BASENAME = "srd-spells-2024.json";
export const DEFAULT_INPUT_DIR = path.join("data", "srd");
export const DEFAULT_FILES = [ENGLISH_BASENAME, "srd-spells-2024_de.json"];
const TRANSLATION_PATTERN = /^srd-spells-2024_(.+)\.json$/;

export interface SourceMigrationReport {
  fileName: string;
  status: "converted" | "no-op";
  entries: number;
  urlsRemoved: number;
  schoolValues: number;
  classValues: number;
  damageTypeValues: number;
  damageAtSlotLevelPreserved: number;
  attackTypePreserved: number;
  subclassesFound: number;
  subclassesOmitted: number;
}

export interface SourceMigration {
  fileName: string;
  content: unknown;
  changed: boolean;
  report: SourceMigrationReport;
}

export interface MigrationRunReport {
  mode: "dry-run" | "applied";
  inputDir: string;
  files: SourceMigrationReport[];
}

export interface MigrationOptions {
  inputDir: string;
  files?: readonly string[];
  apply?: boolean;
}

function newReport(fileName: string): SourceMigrationReport {
  return {
    fileName,
    status: "no-op",
    entries: 0,
    urlsRemoved: 0,
    schoolValues: 0,
    classValues: 0,
    damageTypeValues: 0,
    damageAtSlotLevelPreserved: 0,
    attackTypePreserved: 0,
    subclassesFound: 0,
    subclassesOmitted: 0,
  };
}

function schoolNameFor(value: unknown, fileName: string, index: string): string {
  const school = requireRecord(value, fileName, index, "school");
  const schoolIndex = requireString(school.index, fileName, index, "school.index");
  const canonical = SCHOOL_BY_INDEX.get(schoolIndex.toLowerCase());
  if (!canonical) {
    throw new SrdSourceError(
      `unknown school index "${schoolIndex}"; no canonical school mapping`,
      fileName,
      index,
    );
  }
  return canonical;
}

function classNamesFor(value: unknown, fileName: string, index: string): string[] {
  const list = requireArray(value, fileName, index, "classes");
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const record = requireRecord(item, fileName, index, "classes[]");
    const classIndex = requireString(record.index, fileName, index, "classes[].index");
    const canonical = CLASS_BY_INDEX.get(classIndex.toLowerCase());
    if (!canonical) {
      throw new SrdSourceError(
        `unknown class index "${classIndex}"; no canonical class mapping`,
        fileName,
        index,
      );
    }
    if (seen.has(canonical)) {
      throw new SrdSourceError(`duplicate class "${canonical}"`, fileName, index);
    }
    seen.add(canonical);
    names.push(canonical);
  }
  return names;
}

function damageSlugFor(value: unknown, fileName: string, index: string): string {
  const damageType = requireRecord(value, fileName, index, "damage.damage_type");
  const damageIndex = requireString(damageType.index, fileName, index, "damage.damage_type.index");
  const slug = damageIndex.toLowerCase();
  if (!CANONICAL_DAMAGE_TYPES.has(slug)) {
    throw new SrdSourceError(
      `unknown damage type index "${damageIndex}"; no canonical damage mapping`,
      fileName,
      index,
    );
  }
  return slug;
}

function migrateDamage(
  value: unknown,
  fileName: string,
  index: string,
  report: SourceMigrationReport,
): Record<string, unknown> {
  const damage = requireRecord(value, fileName, index, "damage");
  const converted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(damage)) {
    if (key === "damage_type") {
      converted.damage_type = damageSlugFor(item, fileName, index);
      report.damageTypeValues += 1;
    } else {
      converted[key] = item;
      if (key === "damage_at_slot_level") report.damageAtSlotLevelPreserved += 1;
    }
  }
  return converted;
}

function migrateSourceEntry(
  raw: unknown,
  fileName: string,
  position: number,
  report: SourceMigrationReport,
): Record<string, unknown> {
  const entry = requireRecord(raw, fileName, `#${position}`, "entry");
  const index = requireString(entry.index, fileName, `#${position}`, "index");
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    switch (key) {
      case "url":
        report.urlsRemoved += 1;
        break;
      case "school":
        converted.school = schoolNameFor(value, fileName, index);
        report.schoolValues += 1;
        break;
      case "classes": {
        const names = classNamesFor(value, fileName, index);
        converted.classes = names;
        report.classValues += names.length;
        break;
      }
      case "damage":
        converted.damage = migrateDamage(value, fileName, index, report);
        break;
      case "subclasses": {
        const subclasses = canonicalSubclasses(value, fileName, index);
        if (subclasses) {
          converted.subclasses = subclasses;
          report.subclassesFound += 1;
        } else {
          report.subclassesOmitted += 1;
        }
        break;
      }
      default:
        converted[key] = value;
    }
  }
  if (!Object.hasOwn(entry, "subclasses")) report.subclassesOmitted += 1;
  if (entry.attack_type !== undefined) report.attackTypePreserved += 1;
  return converted;
}

/**
 * Pure legacy → canonical conversion. Already-canonical input is a no-op
 * (`changed: false`) so repeated runs are idempotent. Property and entry order
 * are preserved, `url` is removed in place, `subclasses` is kept only when
 * present and valid, and `damage_at_slot_level`/`attack_type` are copied
 * verbatim.
 */
export function migrateSource(raw: unknown, fileName: string): SourceMigration {
  const report = newReport(fileName);
  if (!Array.isArray(raw)) {
    throw new SrdSourceError(`top-level JSON must be an array of spells`, fileName);
  }
  report.entries = raw.length;
  if (isCanonicalSourceShape(raw)) {
    return { fileName, content: raw, changed: false, report };
  }
  if (!isLegacySourceShape(raw)) {
    throw new SrdSourceError(
      `unrecognized raw source structure; expected the legacy 5e-bits shape (object "school.index") or the canonical source shape`,
      fileName,
    );
  }
  const content = raw.map((entry, position) =>
    migrateSourceEntry(entry, fileName, position, report),
  );
  report.status = "converted";
  return { fileName, content, changed: true, report };
}

/** Deterministic serialization: 2-space indent, LF line endings, trailing newline. */
export function serializeMigrated(content: unknown): string {
  return `${JSON.stringify(content, null, 2)}\n`;
}

function datasetBasenameFor(fileName: string): string | undefined {
  if (fileName === ENGLISH_BASENAME) return "spells.srd.json";
  const match = TRANSLATION_PATTERN.exec(fileName);
  return match ? `spells.srd.${match[1]}.json` : undefined;
}

async function readCommittedDataset(basename: string): Promise<string> {
  const filePath = path.join(rootDir, "src", "data", basename);
  try {
    return await readFile(filePath, "utf8");
  } catch {
    throw new SrdSourceError(
      `missing committed baseline dataset "src/data/${basename}" required to verify the migration`,
      basename,
    );
  }
}

async function readSourceText(filePath: string, fileName: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    throw new SrdSourceError(`source file not found`, fileName);
  }
}

function parseSourceText(text: string, fileName: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new SrdSourceError(
      `malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
      fileName,
    );
  }
}

interface PlannedFile {
  fileName: string;
  filePath: string;
  serialized: string;
}

/**
 * Reads, converts and validates the selected sources. In `apply` mode the
 * converted files are staged and validated in full before any replacement, then
 * swapped in with a backup that is restored if a later replacement fails.
 */
export async function runMigration(options: MigrationOptions): Promise<MigrationRunReport> {
  const files = options.files ?? DEFAULT_FILES;
  const reports: SourceMigrationReport[] = [];
  const planned: PlannedFile[] = [];

  for (const fileName of files) {
    if (path.basename(fileName) !== fileName) {
      throw new SrdSourceError(`"--files" entries must be plain file names`, fileName);
    }
    const filePath = path.join(options.inputDir, fileName);
    const text = await readSourceText(filePath, fileName);
    const migration = migrateSource(parseSourceText(text, fileName), fileName);
    reports.push(migration.report);
    if (!migration.changed) continue;

    const datasetBasename = datasetBasenameFor(fileName);
    if (!datasetBasename) {
      throw new SrdSourceError(
        `cannot verify "${fileName}": unrecognized SRD source file name`,
        fileName,
      );
    }
    const baselineText = await readCommittedDataset(datasetBasename);
    if (fileName === ENGLISH_BASENAME) {
      const normalized = normalizeEnglish(migration.content, fileName);
      if (JSON.stringify(normalized) !== baselineText) {
        throw new SrdSourceError(
          `migrated output does not normalize to the committed dataset "src/data/${datasetBasename}"`,
          fileName,
        );
      }
    } else {
      const englishById = new Map<string, Spell>(
        (JSON.parse(await readCommittedDataset("spells.srd.json")) as Spell[]).map((spell) => [
          spell.id,
          spell,
        ]),
      );
      const translated = normalizeSharedTranslation(migration.content, fileName);
      validateTranslation(englishById, translated, fileName);
      if (JSON.stringify(translated) !== baselineText) {
        throw new SrdSourceError(
          `migrated output does not normalize to the committed dataset "src/data/${datasetBasename}"`,
          fileName,
        );
      }
    }

    planned.push({ fileName, filePath, serialized: serializeMigrated(migration.content) });
  }

  const report: MigrationRunReport = {
    mode: options.apply ? "applied" : "dry-run",
    inputDir: options.inputDir,
    files: reports,
  };
  if (!options.apply || planned.length === 0) return report;

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
  return report;
}

function requireOptionValue(argv: readonly string[], position: number, option: string): string {
  const value = argv[position];
  if (value === undefined || value === "") {
    throw new Error(`option "${option}" requires a value`);
  }
  return value;
}

export function parseArgs(argv: readonly string[]): {
  inputDir: string;
  files: string[];
  apply: boolean;
  reportPath?: string;
} {
  let inputDir = DEFAULT_INPUT_DIR;
  let files = [...DEFAULT_FILES];
  let apply = false;
  let reportPath: string | undefined;
  for (let position = 0; position < argv.length; position += 1) {
    const arg = argv[position];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--input-dir") {
      inputDir = requireOptionValue(argv, position + 1, "--input-dir");
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
  return { inputDir, files, apply, reportPath };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = await runMigration({
    inputDir: path.resolve(process.cwd(), options.inputDir),
    files: options.files,
    apply: options.apply,
  });
  const text = `${JSON.stringify(report, null, 2)}\n`;
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
      console.error(`migrate-srd-source-format failed: ${error.message}`);
    } else {
      console.error("migrate-srd-source-format failed:", error);
    }
    process.exitCode = 1;
  });
}
