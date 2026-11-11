import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isCanonicalFileNameLocale } from "../../src/tools/short-descriptions/authoring-schema.ts";
import { sourceFingerprint } from "./fingerprint.ts";

/**
 * Filesystem boundary for the authoring tooling. Every path is resolved from a
 * workspace root so tests can run against a temporary directory and the CLIs
 * can run against the repository.
 */

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export interface ManifestEntry {
  code: string;
  displayName: string;
  dataset: string;
}

export interface Workspace {
  root: string;
  authoringDir: string;
  dataDir: string;
  referenceDir: string;
  manifestFile: string;
  reportFile: string;
  authoringFile: (locale: string) => string;
  sidecarFile: (locale: string) => string;
  datasetPath: (datasetUrl: string) => string;
}

function insideDirectory(directory: string, filePath: string): string {
  const resolvedDirectory = path.resolve(directory);
  const resolved = path.resolve(filePath);
  if (resolved !== resolvedDirectory && !resolved.startsWith(`${resolvedDirectory}${path.sep}`)) {
    throw new WorkspaceError(
      `refusing to use a path outside ${describePath(directory)}: ${filePath}`,
    );
  }
  return resolved;
}

export function createWorkspace(root: string): Workspace {
  const authoringDir = path.join(root, "data", "short-descriptions");
  const dataDir = path.join(root, "src", "data");
  return {
    root,
    authoringDir,
    dataDir,
    referenceDir: path.join(root, "data", "reference"),
    manifestFile: path.join(dataDir, "spell-languages.json"),
    reportFile: path.join(root, "data", "reference", "short-description-review.json"),
    authoringFile: (locale) =>
      insideDirectory(authoringDir, path.join(authoringDir, `${locale}.json`)),
    sidecarFile: (locale) =>
      insideDirectory(dataDir, path.join(dataDir, `spell-short-descriptions.${locale}.json`)),
    datasetPath: (datasetUrl) =>
      insideDirectory(dataDir, path.join(dataDir, path.basename(datasetUrl))),
  };
}

export function defaultWorkspace(): Workspace {
  return createWorkspace(repoRoot);
}

export async function createStagingWorkspace(): Promise<Workspace> {
  const root = await mkdtemp(path.join(os.tmpdir(), "spell-short-descriptions-"));
  return createWorkspace(root);
}

function describePath(filePath: string): string {
  return path.relative(process.cwd(), filePath) || filePath;
}

export async function readJson(filePath: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw error;
    throw new WorkspaceError(
      `${describePath(filePath)}: cannot read file (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new WorkspaceError(
      `${describePath(filePath)}: malformed JSON (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

export async function readJsonIfExists(filePath: string): Promise<unknown> {
  try {
    return await readJson(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new WorkspaceError(
      `${describePath(filePath)}: cannot read file (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

export interface WriteOperations {
  writeFile: (filePath: string, content: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  remove: (filePath: string) => Promise<void>;
}

const defaultWriteOperations: WriteOperations = {
  writeFile: (filePath, content) => writeFile(filePath, content, "utf8"),
  rename: (from, to) => rename(from, to),
  remove: (filePath) => rm(filePath, { force: true }),
};

/**
 * Per-file atomic replace: write a temporary file in the destination directory,
 * then rename it over the target. The target is never truncated, so an
 * interrupted write leaves either the complete old or the complete new content.
 */
export async function writeFileAtomic(
  destination: string,
  content: string,
  operations: Partial<WriteOperations> = {},
): Promise<void> {
  const ops: WriteOperations = { ...defaultWriteOperations, ...operations };
  await mkdir(path.dirname(destination), { recursive: true });
  const tempPath = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${process.pid}.${Date.now().toString(36)}.tmp`,
  );
  try {
    await ops.writeFile(tempPath, content);
    await ops.rename(tempPath, destination);
  } catch (error) {
    await ops.remove(tempPath).catch(() => undefined);
    throw new WorkspaceError(
      `${describePath(destination)}: atomic write failed (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadManifest(workspace: Workspace): Promise<ManifestEntry[]> {
  const raw = await readJson(workspace.manifestFile);
  if (!Array.isArray(raw)) {
    throw new WorkspaceError(`${describePath(workspace.manifestFile)}: manifest must be an array`);
  }
  const entries: ManifestEntry[] = [];
  for (const [index, value] of raw.entries()) {
    if (!isRecord(value) || typeof value.code !== "string" || typeof value.dataset !== "string") {
      throw new WorkspaceError(
        `${describePath(workspace.manifestFile)}: entry ${index} is not { code, displayName, dataset }`,
      );
    }
    if (!isCanonicalFileNameLocale(value.code)) {
      throw new WorkspaceError(
        `${describePath(workspace.manifestFile)}: entry ${index} has an invalid language code "${value.code}"`,
      );
    }
    entries.push({
      code: value.code,
      displayName: typeof value.displayName === "string" ? value.displayName : value.code,
      dataset: value.dataset,
    });
  }
  return entries;
}

export interface SourceText {
  description: readonly string[];
  higherLevels?: readonly string[];
  name?: string;
  level?: number;
  school?: string;
  castingTime?: string;
  range?: string;
  duration?: string;
}

export async function loadDataset(
  workspace: Workspace,
  entry: ManifestEntry,
): Promise<Map<string, SourceText>> {
  const filePath = workspace.datasetPath(entry.dataset);
  const raw = await readJson(filePath);
  if (!Array.isArray(raw)) {
    throw new WorkspaceError(`${describePath(filePath)}: dataset must be an array of spells`);
  }
  const spells = new Map<string, SourceText>();
  for (const [index, value] of raw.entries()) {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      !Array.isArray(value.description) ||
      !value.description.every((part) => typeof part === "string")
    ) {
      throw new WorkspaceError(`${describePath(filePath)}: spell ${index} is malformed`);
    }
    const higherLevels = Array.isArray(value.higherLevels)
      ? value.higherLevels.filter((part): part is string => typeof part === "string")
      : undefined;
    spells.set(value.id, {
      description: value.description as string[],
      ...(higherLevels && higherLevels.length > 0 ? { higherLevels } : {}),
      ...(typeof value.name === "string" ? { name: value.name } : {}),
      ...(typeof value.level === "number" ? { level: value.level } : {}),
      ...(typeof value.school === "string" ? { school: value.school } : {}),
      ...(typeof value.castingTime === "string" ? { castingTime: value.castingTime } : {}),
      ...(typeof value.range === "string" ? { range: value.range } : {}),
      ...(typeof value.duration === "string" ? { duration: value.duration } : {}),
    });
  }
  return spells;
}

export async function loadDatasets(
  workspace: Workspace,
  manifest: readonly ManifestEntry[],
): Promise<Map<string, Map<string, SourceText>>> {
  const datasets = new Map<string, Map<string, SourceText>>();
  for (const entry of manifest) {
    datasets.set(entry.code, await loadDataset(workspace, entry));
  }
  return datasets;
}

export async function loadAuthoringRaw(workspace: Workspace, locale: string): Promise<unknown> {
  return readJsonIfExists(workspace.authoringFile(locale));
}

export function computeFingerprints(
  datasets: ReadonlyMap<string, ReadonlyMap<string, SourceText>>,
): Map<string, Map<string, string>> {
  const fingerprints = new Map<string, Map<string, string>>();
  for (const [locale, spells] of datasets) {
    const byId = new Map<string, string>();
    for (const [spellId, spell] of spells)
      byId.set(
        spellId,
        sourceFingerprint({ description: spell.description, higherLevels: spell.higherLevels }),
      );
    fingerprints.set(locale, byId);
  }
  return fingerprints;
}
