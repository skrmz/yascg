import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Spell } from "../src/domain/spells.ts";
import {
  CANONICAL_ENGLISH_BASENAME,
  discoverSrdInputs,
  displayNameForTag,
} from "./srd/discovery.ts";
import { SrdSourceError } from "./srd/common.ts";
import { isCanonicalSourceShape, normalizeEnglish } from "./srd/english.ts";
import { normalizeGerman } from "./srd/german.ts";
import { normalizeSharedTranslation } from "./srd/shared-translation.ts";
import { validateTranslation } from "./srd/validate.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface ManifestEntry {
  code: string;
  displayName: string;
  dataset: string;
}

export interface BuildOptions {
  inputDir: string;
  outputDir: string;
  /** Directory holding static assets copied next to the datasets (favicon etc.). */
  staticSourceDir?: string;
  staticAssets?: readonly string[];
  /** Overrides the snapshot path (defaults to <inputDir>/canonical-english.snapshot.json). */
  snapshotPath?: string;
  /** Create the snapshot instead of failing when it is absent. */
  allowSnapshotCreation?: boolean;
  log?: (message: string) => void;
}

export interface BuildResult {
  english: Spell[];
  manifest: ManifestEntry[];
}

async function readJson(filePath: string, fileName: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    throw new SrdSourceError(`source file not found`, fileName);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new SrdSourceError(
      `malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
      fileName,
    );
  }
}

async function verifyOrCreateSnapshot(
  english: readonly Spell[],
  snapshotPath: string,
  allowCreation: boolean,
): Promise<void> {
  const serialized = JSON.stringify(english, null, 2);
  let existing: string | null = null;
  try {
    existing = await readFile(snapshotPath, "utf8");
  } catch {
    existing = null;
  }
  if (existing === null) {
    if (!allowCreation) {
      throw new SrdSourceError(
        `missing reviewed canonical snapshot at ${snapshotPath}`,
        CANONICAL_ENGLISH_BASENAME,
      );
    }
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, serialized, "utf8");
    return;
  }
  const normalizedExisting = JSON.stringify(JSON.parse(existing) as Spell[], null, 2);
  if (normalizedExisting !== serialized) {
    throw new SrdSourceError(
      `normalized English differs from the reviewed canonical snapshot; review the source update intentionally and regenerate the snapshot`,
      CANONICAL_ENGLISH_BASENAME,
    );
  }
}

export async function buildSrdArtifacts(options: BuildOptions): Promise<BuildResult> {
  const log = options.log ?? (() => undefined);
  const inputs = await discoverSrdInputs(options.inputDir);
  await mkdir(options.outputDir, { recursive: true });

  const englishRaw = await readJson(inputs.english.filePath, inputs.english.fileName);
  const english = normalizeEnglish(englishRaw, inputs.english.fileName);
  if (english.length === 0) {
    throw new SrdSourceError(`canonical English dataset is empty`, inputs.english.fileName);
  }

  const snapshotPath =
    options.snapshotPath ?? path.join(options.inputDir, "canonical-english.snapshot.json");
  await verifyOrCreateSnapshot(english, snapshotPath, options.allowSnapshotCreation ?? true);

  const englishById = new Map(english.map((spell) => [spell.id, spell]));
  const manifest: ManifestEntry[] = [
    { code: "en", displayName: displayNameForTag("en"), dataset: "/spells.srd.json" },
  ];

  for (const language of inputs.languages) {
    const raw = await readJson(language.filePath, language.fileName);
    const sharedShape = isCanonicalSourceShape(raw);
    let adapterName: string;
    let translated: Spell[];
    if (sharedShape) {
      adapterName = "shared";
      translated = normalizeSharedTranslation(raw, language.fileName);
    } else if (language.tag === "de") {
      adapterName = "german";
      translated = normalizeGerman(raw, language.fileName);
    } else {
      throw new SrdSourceError(
        `unsupported translation source structure; a language-specific adapter is required (checked-in data must match the canonical upstream shape)`,
        language.fileName,
      );
    }
    validateTranslation(englishById, translated, language.fileName);

    const datasetFile = `spells.srd.${language.tag}.json`;
    await writeFile(path.join(options.outputDir, datasetFile), JSON.stringify(translated), "utf8");
    manifest.push({
      code: language.tag,
      displayName: displayNameForTag(language.tag),
      dataset: `/${datasetFile}`,
    });
    log(`normalized ${language.fileName} (${adapterName} adapter): ${translated.length} spell(s)`);
  }

  await writeFile(path.join(options.outputDir, "spells.srd.json"), JSON.stringify(english), "utf8");
  await writeFile(
    path.join(options.outputDir, "spell-languages.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  if (options.staticSourceDir) {
    for (const asset of options.staticAssets ?? []) {
      try {
        await copyFile(
          path.join(options.staticSourceDir, asset),
          path.join(options.outputDir, asset),
        );
      } catch {
        // Optional static assets only trigger PWA build warnings when absent.
      }
    }
  }

  return { english, manifest };
}

async function main(): Promise<void> {
  const result = await buildSrdArtifacts({
    inputDir: path.join(rootDir, "data", "srd"),
    outputDir: path.join(rootDir, "src", "data"),
    staticSourceDir: path.join(rootDir, "public"),
    staticAssets: ["favicon.svg"],
    log: (message) => console.log(message),
  });
  console.log(
    `normalize:srd complete — ${result.english.length} English spells, ${result.manifest.length} language(s).`,
  );
}

const isDirectRun =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error: unknown) => {
    if (error instanceof SrdSourceError) {
      console.error(`normalize:srd failed: ${error.message}`);
    } else {
      console.error("normalize:srd failed:", error);
    }
    process.exitCode = 1;
  });
}
