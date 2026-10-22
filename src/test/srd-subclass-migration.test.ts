import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  applySubclassesToSource,
  buildReconciliation,
  parseReference,
  runSubclassMigration,
} from "../../scripts/migrate-srd-subclasses.ts";
import { ENGLISH_BASENAME, serializeMigrated } from "../../scripts/migrate-srd-source-format.ts";
import {
  canonicalSpellName,
  reconcileSubclass,
  reconcileSubclasses,
} from "../../scripts/srd/subclass-reconciliation.ts";
import { normalizeEnglish } from "../../scripts/srd/english.ts";
import { normalizeSharedTranslation } from "../../scripts/srd/shared-translation.ts";
import type { Spell } from "../../src/domain/spells.ts";

const GERMAN_BASENAME = "srd-spells-2024_de.json";

const englishSource = [
  {
    index: "command",
    name: "Command",
    level: 1,
    school: "Enchantment",
    classes: ["Bard"],
    casting_time: "Action",
    ritual: false,
    range: "60 feet",
    components: ["V"],
    duration: "Instantaneous",
    concentration: false,
    description: "You speak a one-word command.",
  },
  {
    index: "acid-arrow",
    name: "Acid Arrow",
    level: 2,
    school: "Evocation",
    classes: ["Wizard"],
    casting_time: "Action",
    ritual: false,
    range: "90 feet",
    components: ["V", "S", "M"],
    material: "powdered rhubarb leaf",
    duration: "Instantaneous",
    concentration: false,
    damage: { damage_type: "acid" },
    description: "Acid streaks toward a target.",
  },
];

const germanSource = [
  {
    ...englishSource[0],
    name: "Befehl",
    casting_time: "1 Aktion",
    range: "18 Meter",
    duration: "Unmittelbar",
    description: "Du gibst einen Ein-Wort-Befehl.",
  },
  {
    ...englishSource[1],
    name: "Säurepfeil",
    casting_time: "1 Aktion",
    range: "27 Meter",
    material: "ein zerstoßenes Rhabarberblatt",
    duration: "Unmittelbar",
    description: "Ein Säurestrahl schießt auf ein Ziel.",
  },
];

const reference = [
  { name: "Command", subclasses: ["Cleric: War", "Cleric: Arcana"] },
  { name: "Acid Arrow", subclasses: ["Artificer: Battle Smith"] },
  { name: "Arance Hand" },
];

let dir: string;
let inputDir: string;
let baselineDir: string;
let referencePath: string;

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "srd-subclass-"));
  inputDir = path.join(dir, "srd");
  baselineDir = path.join(dir, "data");
  referencePath = path.join(dir, "reference.json");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(inputDir, { recursive: true });
  await mkdir(baselineDir, { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeInputs(): Promise<void> {
  await writeJson(path.join(inputDir, ENGLISH_BASENAME), englishSource);
  await writeJson(path.join(inputDir, GERMAN_BASENAME), germanSource);
  await writeJson(referencePath, reference);
}

async function writeBaseline(): Promise<void> {
  const english = normalizeEnglish(englishSource, ENGLISH_BASENAME);
  const german = normalizeSharedTranslation(germanSource, GERMAN_BASENAME);
  await writeBaselineText(english, german);
}

async function writeBaselineText(english: Spell[], german: Spell[]): Promise<void> {
  await writeFile(path.join(baselineDir, "spells.srd.json"), JSON.stringify(english), "utf8");
  await writeFile(path.join(baselineDir, "spells.srd.de.json"), JSON.stringify(german), "utf8");
}

describe("reference parsing", () => {
  it("reads names and subclasses and rejects duplicates or blanks", () => {
    const entries = parseReference(reference, "reference.json");
    expect(entries.map((entry) => entry.name)).toEqual(["Command", "Acid Arrow", "Arance Hand"]);
    expect(entries[0].subclasses).toEqual(["Cleric: War", "Cleric: Arcana"]);
    expect(entries[2].subclasses).toEqual([]);

    expect(() => parseReference([{ name: "A" }, { name: "A" }], "reference.json")).toThrow(
      /duplicate spell name/,
    );
    expect(() => parseReference([{ name: "   " }], "reference.json")).toThrow(/must not be blank/);
    expect(() => parseReference({}, "reference.json")).toThrow(/must be an array/);
  });
});

describe("subclass reconciliation", () => {
  it("maps aliases, preserves reference-only ids, and excludes unknown parents", () => {
    expect(reconcileSubclass("Cleric: War")).toEqual({
      reference: "Cleric: War",
      kind: "catalog",
      id: "Cleric: War Domain",
    });
    expect(reconcileSubclass("Cleric: War Domain")).toEqual({
      reference: "Cleric: War Domain",
      kind: "catalog",
      id: "Cleric: War Domain",
    });
    expect(reconcileSubclass("Cleric: Arcana")).toEqual({
      reference: "Cleric: Arcana",
      kind: "reference-only",
      id: "Cleric: Arcana",
    });
    expect(reconcileSubclass("Artificer: Battle Smith")).toEqual({
      reference: "Artificer: Battle Smith",
      kind: "excluded",
      id: "Artificer: Battle Smith",
      reason: "unsupported-parent-class",
    });
  });

  it("deduplicates collapsed aliases and reports collisions", () => {
    const result = reconcileSubclasses([
      "Sorcerer: Aberrant",
      "Sorcerer: Aberrant Mind",
      "Sorcerer: Draconic",
      "Artificer: Alchemist",
    ]);
    expect(result.assigned).toEqual(["Sorcerer: Aberrant Sorcery", "Sorcerer: Draconic Sorcery"]);
    expect(result.catalog).toEqual([
      { reference: "Sorcerer: Aberrant", canonical: "Sorcerer: Aberrant Sorcery" },
      { reference: "Sorcerer: Draconic", canonical: "Sorcerer: Draconic Sorcery" },
    ]);
    expect(result.collisions).toEqual([
      {
        id: "Sorcerer: Aberrant Sorcery",
        references: ["Sorcerer: Aberrant", "Sorcerer: Aberrant Mind"],
      },
    ]);
    expect(result.excluded).toEqual([
      { id: "Artificer: Alchemist", reason: "unsupported-parent-class" },
    ]);
  });

  it("applies the explicit typo alias to spell names", () => {
    expect(canonicalSpellName("Arance Hand")).toBe("Arcane Hand");
    expect(canonicalSpellName("Command")).toBe("Command");
  });

  it("aggregates the reference inventory deterministically", () => {
    const data = buildReconciliation(parseReference(reference, "reference.json"));
    expect(data.byName.get("Command")).toEqual(["Cleric: Arcana", "Cleric: War Domain"]);
    expect(data.byName.get("Acid Arrow")).toEqual([]);
    expect(data.referenceSpellsWithSubclasses).toBe(2);
    expect(data.catalogAssignments).toBe(1);
    expect(data.referenceOnlyAssignments).toBe(1);
    expect(data.excludedAssignments).toBe(1);
    expect(data.totalAssignments).toBe(2);
    expect(data.excluded).toEqual([
      { id: "Artificer: Battle Smith", reason: "unsupported-parent-class", spells: 1 },
    ]);
  });
});

describe("applySubclassesToSource", () => {
  function dataByName() {
    return buildReconciliation(parseReference(reference, "reference.json")).byName;
  }

  it("inserts sorted subclasses immediately after classes and preserves other fields", () => {
    const application = applySubclassesToSource(
      englishSource,
      ENGLISH_BASENAME,
      dataByName(),
      "name",
    );
    expect(application.changed).toBe(true);
    const command = application.content[0] as Record<string, unknown>;
    expect(command.subclasses).toEqual(["Cleric: Arcana", "Cleric: War Domain"]);
    expect(Object.keys(command)).toEqual([
      "index",
      "name",
      "level",
      "school",
      "classes",
      "subclasses",
      "casting_time",
      "ritual",
      "range",
      "components",
      "duration",
      "concentration",
      "description",
    ]);
    // Excluded-only assignments are omitted, not stored.
    const acid = application.content[1] as Record<string, unknown>;
    expect("subclasses" in acid).toBe(false);
    // Non-subclass fields are byte-for-byte unchanged.
    expect(acid.description).toBe(englishSource[1].description);
    expect(application.spellsPopulated).toBe(1);
    expect(application.totalAssignments).toBe(2);
    expect(application.unmatched).toEqual([]);
  });

  it("is a no-op when subclasses are already populated identically", () => {
    const first = applySubclassesToSource(englishSource, ENGLISH_BASENAME, dataByName(), "name");
    const second = applySubclassesToSource(first.content, ENGLISH_BASENAME, dataByName(), "name");
    expect(second.changed).toBe(false);
    expect(second.content).toEqual(first.content);
  });

  it("aborts when an existing value differs from the reconciled expectation", () => {
    const conflicting = [{ ...englishSource[0], subclasses: ["Cleric: Life"] }];
    expect(() =>
      applySubclassesToSource(conflicting, ENGLISH_BASENAME, dataByName(), "name"),
    ).toThrow(/does not match the reconciled expectation/);
  });

  it("matches translations by index", () => {
    const byIndex = new Map<string, readonly string[]>([
      ["command", ["Cleric: Arcana", "Cleric: War Domain"]],
      ["acid-arrow", []],
    ]);
    const application = applySubclassesToSource(germanSource, GERMAN_BASENAME, byIndex, "index");
    expect((application.content[0] as Record<string, unknown>).subclasses).toEqual([
      "Cleric: Arcana",
      "Cleric: War Domain",
    ]);
    expect(application.unmatched).toEqual([]);
  });
});

describe("runSubclassMigration", () => {
  it("writes nothing during a dry run and migrates atomically on --apply", async () => {
    await writeInputs();
    await writeBaseline();
    const englishBefore = await readFile(path.join(inputDir, ENGLISH_BASENAME), "utf8");
    const germanBefore = await readFile(path.join(inputDir, GERMAN_BASENAME), "utf8");

    const dryRun = await runSubclassMigration({ inputDir, referencePath, baselineDir });
    expect(dryRun.report.mode).toBe("dry-run");
    expect(dryRun.changedFiles).toEqual([ENGLISH_BASENAME, GERMAN_BASENAME]);
    expect(dryRun.report.unmatchedSpellNames).toEqual({
      [ENGLISH_BASENAME]: { source: [], reference: ["Arcane Hand"] },
    });
    expect(await readFile(path.join(inputDir, ENGLISH_BASENAME), "utf8")).toBe(englishBefore);
    expect(await readFile(path.join(inputDir, GERMAN_BASENAME), "utf8")).toBe(germanBefore);

    const applied = await runSubclassMigration({
      inputDir,
      referencePath,
      baselineDir,
      apply: true,
    });
    expect(applied.report.mode).toBe("applied");
    const englishAfter = await readFile(path.join(inputDir, ENGLISH_BASENAME), "utf8");
    expect(englishAfter).not.toBe(englishBefore);
    const parsed = JSON.parse(englishAfter) as Array<Record<string, unknown>>;
    expect(parsed[0].subclasses).toEqual(["Cleric: Arcana", "Cleric: War Domain"]);
    expect(serializeMigrated(parsed)).toBe(englishAfter);

    const germanAfter = await readFile(path.join(inputDir, GERMAN_BASENAME), "utf8");
    const parsedGerman = JSON.parse(germanAfter) as Array<Record<string, unknown>>;
    expect(parsedGerman[0].subclasses).toEqual(["Cleric: Arcana", "Cleric: War Domain"]);
    expect(germanAfter).toBe(serializeMigrated(parsedGerman));

    const secondRun = await runSubclassMigration({ inputDir, referencePath, baselineDir });
    expect(secondRun.changedFiles).toEqual([]);
    expect(secondRun.report.files.map((file) => file.status)).toEqual(["no-op", "no-op"]);
  });

  it("aborts without modifying inputs when the baseline is unavailable", async () => {
    await writeInputs();
    const english = normalizeEnglish(englishSource, ENGLISH_BASENAME);
    await writeFile(path.join(baselineDir, "spells.srd.json"), JSON.stringify(english), "utf8");
    const before = await readFile(path.join(inputDir, ENGLISH_BASENAME), "utf8");

    await expect(
      runSubclassMigration({ inputDir, referencePath, baselineDir, apply: true }),
    ).rejects.toThrow(/missing committed baseline dataset/);
    expect(await readFile(path.join(inputDir, ENGLISH_BASENAME), "utf8")).toBe(before);
    const leftovers = await readdir(inputDir);
    expect(leftovers.some((name) => name.endsWith(".migrate-tmp"))).toBe(false);
    expect(leftovers.some((name) => name.endsWith(".migrate-bak"))).toBe(false);
  });

  it("rejects file names that are not plain basenames", async () => {
    await writeInputs();
    await writeBaseline();
    await expect(
      runSubclassMigration({
        inputDir,
        referencePath,
        baselineDir,
        files: [ENGLISH_BASENAME, path.join("nested", GERMAN_BASENAME)],
      }),
    ).rejects.toThrow(/must be plain file names/);
  });
});
