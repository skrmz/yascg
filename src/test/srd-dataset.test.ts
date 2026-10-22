import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { normalizeEnglish } from "../../scripts/srd/english.ts";
import { normalizeSharedTranslation } from "../../scripts/srd/shared-translation.ts";
import { validateTranslation } from "../../scripts/srd/validate.ts";
import type { Spell } from "../../src/domain/spells.ts";

/**
 * Drift gate that replaces the removed canonical-English snapshot: freshly
 * normalizing the checked-in raw sources must reproduce the committed generated
 * datasets exactly. The golden datasets are read from the Git object store so a
 * local `pnpm run build` cannot overwrite the expectation and hide a regression.
 */

const root = process.cwd();
const ENGLISH_BASENAME = "srd-spells-2024.json";
const GERMAN_BASENAME = "srd-spells-2024_de.json";
const ENGLISH_DATASET = "src/data/spells.srd.json";
const GERMAN_DATASET = "src/data/spells.srd.de.json";
const EXPECTED_SPELL_COUNT = 339;

function readCommittedDataset(relativePath: string): string {
  try {
    return execFileSync("git", ["show", `HEAD:${relativePath}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    console.warn(
      `[srd-dataset] git baseline unavailable; falling back to the working-tree copy of ${relativePath}`,
    );
    return readFileSync(path.join(root, relativePath), "utf8");
  }
}

function readSource(basename: string): unknown {
  return JSON.parse(readFileSync(path.join(root, "data", "srd", basename), "utf8")) as unknown;
}

describe("SRD dataset drift gate", () => {
  it("normalizes the checked-in English source to the committed dataset", () => {
    const spells = normalizeEnglish(readSource(ENGLISH_BASENAME), ENGLISH_BASENAME);
    const goldenText = readCommittedDataset(ENGLISH_DATASET);
    const golden = JSON.parse(goldenText) as Spell[];

    expect(spells).toHaveLength(EXPECTED_SPELL_COUNT);
    expect(golden).toHaveLength(EXPECTED_SPELL_COUNT);
    expect(new Set(spells.map((spell) => spell.id)).size).toBe(spells.length);
    expect(JSON.stringify(spells)).toBe(goldenText.trimEnd());
    expect(spells).toEqual(golden);
    expect(spells.map((spell) => spell.id).sort()).toEqual(golden.map((spell) => spell.id).sort());
  });

  it("normalizes the checked-in German source and validates it against English", () => {
    const english = normalizeEnglish(readSource(ENGLISH_BASENAME), ENGLISH_BASENAME);
    const englishById = new Map(english.map((spell) => [spell.id, spell]));
    const german = normalizeSharedTranslation(readSource(GERMAN_BASENAME), GERMAN_BASENAME);
    validateTranslation(englishById, german, GERMAN_BASENAME);

    const goldenText = readCommittedDataset(GERMAN_DATASET);
    expect(german).toHaveLength(EXPECTED_SPELL_COUNT);
    expect(JSON.stringify(german)).toBe(goldenText.trimEnd());
    expect(german).toEqual(JSON.parse(goldenText) as Spell[]);
  });
});
