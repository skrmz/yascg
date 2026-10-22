import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { normalizeEnglish } from "../../scripts/srd/english.ts";
import { normalizeSharedTranslation } from "../../scripts/srd/shared-translation.ts";
import { validateTranslation } from "../../scripts/srd/validate.ts";
import { CORE_CLASSES, type Spell } from "../../src/domain/spells.ts";

/**
 * Drift gate that replaces the removed canonical-English snapshot: freshly
 * normalizing the checked-in raw sources must reproduce the committed generated
 * datasets exactly. The golden datasets are read from the Git object store so a
 * local `pnpm run build` cannot overwrite the expectation and hide a regression.
 *
 * The Git baseline is required: there is no working-tree fallback, because a
 * fallback would let the working tree compare generated output against itself.
 */

const root = process.cwd();
const ENGLISH_BASENAME = "srd-spells-2024.json";
const GERMAN_BASENAME = "srd-spells-2024_de.json";
const ENGLISH_DATASET = "src/data/spells.srd.json";
const GERMAN_DATASET = "src/data/spells.srd.de.json";
const EXPECTED_SPELL_COUNT = 339;
const EXPECTED_POPULATED = 204;
const EXPECTED_ASSIGNMENTS = 698;
const PARENT_CLASSES = new Set<string>(CORE_CLASSES);

function readCommittedDataset(relativePath: string): string {
  try {
    return execFileSync("git", ["show", `HEAD:${relativePath}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    throw new Error(
      `[srd-dataset] git baseline unavailable for ${relativePath}; the drift gate requires the committed dataset (run in a git checkout whose HEAD contains the generated datasets)`,
    );
  }
}

function readSource(basename: string): unknown {
  return JSON.parse(readFileSync(path.join(root, "data", "srd", basename), "utf8")) as unknown;
}

/** Removes `subclasses` to compare all other (mechanics) fields. */
function stripSubclasses(spells: readonly Spell[]): unknown[] {
  return spells.map((spell) => {
    if (!Object.hasOwn(spell, "subclasses")) return spell;
    const { subclasses: _omitted, ...rest } = spell;
    return rest;
  });
}

function assignmentsOf(spells: readonly Spell[]): Map<string, string[]> {
  return new Map(spells.map((spell) => [spell.id, [...(spell.subclasses ?? [])].sort()]));
}

describe("SRD dataset drift gate", () => {
  it("normalizes the checked-in English source to the committed dataset", () => {
    const spells = normalizeEnglish(readSource(ENGLISH_BASENAME), ENGLISH_BASENAME);
    const goldenText = readCommittedDataset(ENGLISH_DATASET);
    const golden = JSON.parse(goldenText) as Spell[];

    expect(spells).toHaveLength(EXPECTED_SPELL_COUNT);
    expect(golden).toHaveLength(EXPECTED_SPELL_COUNT);
    expect(new Set(spells.map((spell) => spell.id)).size).toBe(spells.length);
    // Only `subclasses` differs from the pre-subclass baseline (mechanics unchanged).
    expect(JSON.stringify(stripSubclasses(spells))).toBe(JSON.stringify(stripSubclasses(golden)));
    expect(JSON.stringify(spells)).toBe(goldenText.trimEnd());
    expect(spells).toEqual(golden);
    expect(spells.map((spell) => spell.id).sort()).toEqual(golden.map((spell) => spell.id).sort());
  });

  it("populates canonical subclasses whose parent is a core class", () => {
    const spells = normalizeEnglish(readSource(ENGLISH_BASENAME), ENGLISH_BASENAME);
    const populated = spells.filter((spell) => (spell.subclasses ?? []).length > 0);
    expect(populated).toHaveLength(EXPECTED_POPULATED);
    expect(populated.reduce((total, spell) => total + (spell.subclasses?.length ?? 0), 0)).toBe(
      EXPECTED_ASSIGNMENTS,
    );
    for (const spell of spells) {
      for (const id of spell.subclasses ?? []) {
        const separatorIndex = id.indexOf(": ");
        expect(separatorIndex).toBeGreaterThan(-1);
        expect(PARENT_CLASSES.has(id.slice(0, separatorIndex))).toBe(true);
      }
    }
  });

  it("normalizes the checked-in German source and validates it against English", () => {
    const english = normalizeEnglish(readSource(ENGLISH_BASENAME), ENGLISH_BASENAME);
    const englishById = new Map(english.map((spell) => [spell.id, spell]));
    const german = normalizeSharedTranslation(readSource(GERMAN_BASENAME), GERMAN_BASENAME);
    validateTranslation(englishById, german, GERMAN_BASENAME);

    const goldenText = readCommittedDataset(GERMAN_DATASET);
    const goldenGerman = JSON.parse(goldenText) as Spell[];
    expect(german).toHaveLength(EXPECTED_SPELL_COUNT);
    // Identical canonical identifiers in English and German.
    expect(assignmentsOf(german)).toEqual(assignmentsOf(english));
    // Only `subclasses` differs from the pre-subclass baseline (mechanics unchanged).
    expect(JSON.stringify(stripSubclasses(german))).toBe(
      JSON.stringify(stripSubclasses(goldenGerman)),
    );
    expect(JSON.stringify(german)).toBe(goldenText.trimEnd());
    expect(german).toEqual(goldenGerman);
  });
});
