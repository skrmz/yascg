import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  buildRuntimeSidecars,
  type SourceTextFields,
  type TransformResult,
} from "../../src/tools/short-descriptions/transform.ts";
import { sourceFingerprint } from "../../scripts/short-descriptions/fingerprint.ts";

/**
 * Drift gate for the generated short-description sidecars.
 *
 * Assertion A recomputes the artifacts from the committed (HEAD) authoring files
 * and HEAD datasets and compares them to the committed sidecars. Reading HEAD
 * means a local `pnpm run build` cannot overwrite the expectation and hide a
 * regression. It also fails loudly with an actionable message when the sidecar
 * baseline has not been committed yet, by design.
 *
 * Assertion B compares the working tree against itself so local authoring edits
 * that were not followed by a build are reported immediately.
 */

const root = process.cwd();

interface ManifestEntry {
  code: string;
  dataset: string;
}

function gitShow(relativePath: string): string {
  try {
    return execFileSync("git", ["show", `HEAD:${relativePath}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    throw new Error(
      `[short-descriptions] git baseline unavailable for ${relativePath}; ` +
        "the drift gate requires the committed authoring/sidecar baseline " +
        "(commit the empty authoring files and sidecars first)",
    );
  }
}

function gitHas(relativePath: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `HEAD:${relativePath}`], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

function readWorktreeJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8")) as unknown;
}

function readWorktreeText(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
}

function readWorktreeIfExists(relativePath: string): unknown {
  try {
    return readWorktreeJson(relativePath);
  } catch {
    return undefined;
  }
}

const sidecarPath = (locale: string) => `src/data/spell-short-descriptions.${locale}.json`;
const authoringPath = (locale: string) => `data/short-descriptions/${locale}.json`;
const datasetPath = (dataset: string) => `src/data/${path.basename(dataset)}`;

function datasetText(spells: unknown): Map<string, SourceTextFields> {
  if (!Array.isArray(spells)) throw new Error("[short-descriptions] dataset is not an array");
  const map = new Map<string, SourceTextFields>();
  for (const spell of spells as Array<Record<string, unknown>>) {
    const id = spell.id;
    const description = spell.description;
    if (typeof id !== "string" || !Array.isArray(description)) {
      throw new Error("[short-descriptions] malformed dataset spell");
    }
    map.set(id, {
      description: description as string[],
      ...(Array.isArray(spell.higherLevels)
        ? { higherLevels: spell.higherLevels as string[] }
        : {}),
    });
  }
  return map;
}

function fingerprintsOf(dataset: ReadonlyMap<string, SourceTextFields>): Map<string, string> {
  return new Map([...dataset].map(([spellId, spell]) => [spellId, sourceFingerprint(spell)]));
}

function recompute(
  manifest: readonly ManifestEntry[],
  datasets: ReadonlyMap<string, ReadonlyMap<string, SourceTextFields>>,
  authoringFiles: ReadonlyMap<string, unknown>,
): TransformResult {
  const fingerprints = new Map(
    [...datasets].map(([locale, dataset]) => [locale, fingerprintsOf(dataset)]),
  );
  return buildRuntimeSidecars({
    manifestLocales: manifest.map((entry) => entry.code),
    authoringFiles,
    datasets,
    fingerprints,
  });
}

describe("short-description sidecar drift", () => {
  it("reproduces the committed sidecars from the committed baseline", () => {
    const manifest = JSON.parse(gitShow("src/data/spell-languages.json")) as ManifestEntry[];
    const datasets = new Map<string, ReadonlyMap<string, SourceTextFields>>();
    const authoringFiles = new Map<string, unknown>();
    const committedSidecars = new Map<string, string>();

    for (const entry of manifest) {
      datasets.set(entry.code, datasetText(JSON.parse(gitShow(datasetPath(entry.dataset)))));
      committedSidecars.set(entry.code, gitShow(sidecarPath(entry.code)));
      const authoring = authoringPath(entry.code);
      if (gitHas(authoring)) authoringFiles.set(entry.code, JSON.parse(gitShow(authoring)));
    }

    const result = recompute(manifest, datasets, authoringFiles);
    for (const entry of manifest) {
      expect(result.files.get(entry.code)).toBe(committedSidecars.get(entry.code));
    }
  });

  it("matches the working-tree sidecars to the working-tree authoring files", () => {
    const manifest = readWorktreeJson("src/data/spell-languages.json") as ManifestEntry[];
    const datasets = new Map<string, ReadonlyMap<string, SourceTextFields>>();
    const authoringFiles = new Map<string, unknown>();

    for (const entry of manifest) {
      datasets.set(entry.code, datasetText(readWorktreeJson(datasetPath(entry.dataset))));
      const authoring = readWorktreeIfExists(authoringPath(entry.code));
      if (authoring !== undefined) authoringFiles.set(entry.code, authoring);
    }

    const result = recompute(manifest, datasets, authoringFiles);
    for (const entry of manifest) {
      expect(result.files.get(entry.code)).toBe(readWorktreeText(sidecarPath(entry.code)));
    }
  });

  it("keeps every committed sidecar free of authoring metadata", () => {
    const manifest = readWorktreeJson("src/data/spell-languages.json") as ManifestEntry[];
    for (const entry of manifest) {
      const text = readWorktreeText(sidecarPath(entry.code));
      for (const forbidden of ["sourceHash", "acceptance", "origin", "status"]) {
        expect(text).not.toContain(forbidden);
      }
    }
  });
});
