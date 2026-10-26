import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_FILES,
  ENGLISH_BASENAME,
  migrateSource,
  runMigration,
  serializeMigrated,
} from "../../scripts/migrate-srd-source-format.ts";
import { isCanonicalSourceShape, normalizeEnglish } from "../../scripts/srd/english.ts";
import { normalizeSharedTranslation } from "../../scripts/srd/shared-translation.ts";
import { validateTranslation } from "../../scripts/srd/validate.ts";
import type { Spell } from "../../src/domain/spells.ts";

const legacyAcidArrow = {
  index: "acid-arrow",
  url: "/api/2024/spells/acid-arrow",
  name: "Acid Arrow",
  level: 2,
  school: { index: "evocation", name: "Evocation", url: "/api/2024/magic-schools/evocation" },
  classes: [{ index: "wizard", name: "Wizard", url: "/api/2024/classes/wizard" }],
  casting_time: "Action",
  ritual: false,
  range: "90 feet",
  components: ["V", "S", "M"],
  material: "powdered rhubarb leaf",
  duration: "Instantaneous",
  concentration: false,
  attack_type: "ranged",
  damage: {
    damage_type: { index: "acid", name: "Acid", url: "/api/2024/damage-types/acid" },
    damage_at_slot_level: { 2: "4d4" },
  },
  description: "A shimmering green arrow streaks toward a target.",
  higher_level: "The damage increases by 1d4 per slot level above 2.",
};

const legacyGerman = {
  ...legacyAcidArrow,
  name: "Säurepfeil",
  casting_time: "Aktion",
  range: "27 Meter",
  material: "ein zerstoßenes Rhabarberblatt",
  duration: "Unmittelbar",
  description: "Auf ein Ziel in Reichweite schießt ein schimmernder grüner Pfeil.",
};

const committedEnglishText = readFile(
  path.join(process.cwd(), "src", "data", "spells.srd.json"),
  "utf8",
);
const committedGermanText = readFile(
  path.join(process.cwd(), "src", "data", "spells.srd.de.json"),
  "utf8",
);

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "srd-migrate-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function copyRealSources(targetDir: string): Promise<void> {
  for (const name of DEFAULT_FILES) {
    const text = await readFile(path.join(process.cwd(), "data", "srd", name), "utf8");
    await writeFile(path.join(targetDir, name), text, "utf8");
  }
}

describe("migrateSource", () => {
  it("converts the legacy English structure", () => {
    const { content, changed, report } = migrateSource([legacyAcidArrow], "srd-spells-2024.json");
    expect(changed).toBe(true);
    const entry = (content as Array<Record<string, unknown>>)[0];
    expect(entry.school).toBe("Evocation");
    expect(entry.classes).toEqual(["Wizard"]);
    expect(entry.damage).toEqual({ damage_type: "acid", damage_at_slot_level: { 2: "4d4" } });
    expect(entry.attack_type).toBe("ranged");
    expect("url" in entry).toBe(false);
    expect("subclasses" in entry).toBe(false);
    expect(report).toMatchObject({
      status: "converted",
      entries: 1,
      urlsRemoved: 1,
      schoolValues: 1,
      classValues: 1,
      damageTypeValues: 1,
      damageAtSlotLevelPreserved: 1,
      attackTypePreserved: 1,
      subclassesFound: 0,
      subclassesOmitted: 1,
    });
  });

  it("preserves entry and property order", () => {
    const { content } = migrateSource([legacyAcidArrow], "srd-spells-2024.json");
    const entry = (content as Array<Record<string, unknown>>)[0];
    expect(Object.keys(entry)).toEqual([
      "index",
      "name",
      "level",
      "school",
      "classes",
      "casting_time",
      "ritual",
      "range",
      "components",
      "material",
      "duration",
      "concentration",
      "attack_type",
      "damage",
      "description",
      "higher_level",
    ]);
    expect(Object.keys(entry.damage as Record<string, unknown>)).toEqual([
      "damage_type",
      "damage_at_slot_level",
    ]);
  });

  it("converts the legacy German structure identically", () => {
    const { content } = migrateSource([legacyGerman], "srd-spells-2024_de.json");
    expect(content).toEqual([
      {
        index: "acid-arrow",
        name: "Säurepfeil",
        level: 2,
        school: "Evocation",
        classes: ["Wizard"],
        casting_time: "Aktion",
        ritual: false,
        range: "27 Meter",
        components: ["V", "S", "M"],
        material: "ein zerstoßenes Rhabarberblatt",
        duration: "Unmittelbar",
        concentration: false,
        attack_type: "ranged",
        damage: { damage_type: "acid", damage_at_slot_level: { 2: "4d4" } },
        description: "Auf ein Ziel in Reichweite schießt ein schimmernder grüner Pfeil.",
        higher_level: "The damage increases by 1d4 per slot level above 2.",
      },
    ]);
  });

  it("preserves valid subclasses and reports them", () => {
    const { content, report } = migrateSource(
      [{ ...legacyAcidArrow, subclasses: ["Cleric: War"] }],
      "srd-spells-2024.json",
    );
    const entry = (content as Array<Record<string, unknown>>)[0];
    expect(entry.subclasses).toEqual(["Cleric: War"]);
    expect(report.subclassesFound).toBe(1);
    expect(report.subclassesOmitted).toBe(0);
  });

  it("is idempotent: migrating migrated output is a no-op", () => {
    const first = migrateSource([legacyAcidArrow], "srd-spells-2024.json");
    const second = migrateSource(first.content, "srd-spells-2024.json");
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
    expect(second.report.status).toBe("no-op");
    expect(second.report.urlsRemoved).toBe(0);
  });

  it("fails on unknown class, school and damage mappings", () => {
    expect(() =>
      migrateSource(
        [{ ...legacyAcidArrow, classes: [{ index: "artificer" }] }],
        "srd-spells-2024.json",
      ),
    ).toThrow(/unknown class index "artificer"/);
    expect(() =>
      migrateSource(
        [{ ...legacyAcidArrow, school: { index: "wild-magic" } }],
        "srd-spells-2024.json",
      ),
    ).toThrow(/unknown school index "wild-magic"/);
    expect(() =>
      migrateSource(
        [{ ...legacyAcidArrow, damage: { damage_type: { index: "sonic" } } }],
        "srd-spells-2024.json",
      ),
    ).toThrow(/unknown damage type index "sonic"/);
  });

  it("rejects duplicate legacy classes", () => {
    expect(() =>
      migrateSource(
        [
          {
            ...legacyAcidArrow,
            classes: [{ index: "wizard" }, { index: "wizard" }],
          },
        ],
        "srd-spells-2024.json",
      ),
    ).toThrow(/duplicate class "Wizard"/);
  });

  it("fails on unrecognized or non-array input", () => {
    expect(() => migrateSource({}, "srd-spells-2024.json")).toThrow(
      /top-level JSON must be an array/,
    );
    expect(() =>
      migrateSource([{ index: "acid-arrow", school: 5, classes: [], components: ["V"] }], "x.json"),
    ).toThrow(/unrecognized raw source structure/);
  });
});

describe("serializeMigrated", () => {
  it("writes 2-space indented LF output with compact short arrays", () => {
    const { content } = migrateSource([legacyAcidArrow], "srd-spells-2024.json");
    const text = serializeMigrated(content);
    expect(text.startsWith("[\n  {\n    ")).toBe(true);
    expect(text.endsWith("}\n]\n")).toBe(true);
    expect(text.includes("\r")).toBe(false);
    expect(text).toContain('"classes": ["Wizard"]');
    expect(text).toContain('"components": ["V", "S", "M"]');
    expect(JSON.parse(text)).toEqual(content);
  });

  it("wraps arrays that do not fit on one 80-column line", () => {
    const text = serializeMigrated({
      name: "Long list",
      values: [
        "Cleric: Life Domain",
        "Cleric: Peace",
        "Cleric: Solidarity (PSA)",
        "Paladin: Oath of Devotion",
        "Sorcerer: Clockwork Sorcery",
      ],
    });
    expect(text).toContain('"values": [\n');
    expect(text).toContain('  "values": [\n    "Cleric: Life Domain",');
  });

  it("is deterministic", () => {
    const { content } = migrateSource([legacyGerman], "srd-spells-2024_de.json");
    expect(serializeMigrated(content)).toBe(
      serializeMigrated(JSON.parse(serializeMigrated(content))),
    );
  });
});

describe("migration against the checked-in sources", () => {
  it("normalizes to the committed datasets after migration", async () => {
    const [englishText, germanText] = await Promise.all([
      committedEnglishText,
      committedGermanText,
    ]);
    const englishRaw = JSON.parse(
      await readFile(path.join(process.cwd(), "data", "srd", ENGLISH_BASENAME), "utf8"),
    ) as unknown;
    const germanRaw = JSON.parse(
      await readFile(path.join(process.cwd(), "data", "srd", DEFAULT_FILES[1]), "utf8"),
    ) as unknown;

    const englishMigrated = migrateSource(englishRaw, ENGLISH_BASENAME).content;
    const normalizedEnglish = normalizeEnglish(englishMigrated, ENGLISH_BASENAME);
    expect(JSON.stringify(normalizedEnglish)).toBe(englishText);

    const germanMigrated = migrateSource(germanRaw, DEFAULT_FILES[1]).content;
    const normalizedGerman = normalizeSharedTranslation(germanMigrated, DEFAULT_FILES[1]);
    const englishById = new Map(
      (JSON.parse(englishText) as Spell[]).map((spell) => [spell.id, spell]),
    );
    validateTranslation(englishById, normalizedGerman, DEFAULT_FILES[1]);
    expect(JSON.stringify(normalizedGerman)).toBe(germanText);
  });

  it("writes nothing during a dry run and migrates atomically on --apply", async () => {
    await copyRealSources(dir);
    const before = new Map<string, string>();
    for (const name of DEFAULT_FILES) {
      before.set(name, await readFile(path.join(dir, name), "utf8"));
    }

    const dryRun = await runMigration({ inputDir: dir, apply: false });
    expect(dryRun.mode).toBe("dry-run");
    for (const name of DEFAULT_FILES) {
      expect(await readFile(path.join(dir, name), "utf8")).toBe(before.get(name));
    }

    const applied = await runMigration({ inputDir: dir, apply: true });
    expect(applied.mode).toBe("applied");
    for (const name of DEFAULT_FILES) {
      const expected = serializeMigrated(
        migrateSource(JSON.parse(before.get(name) as string), name).content,
      );
      const written = await readFile(path.join(dir, name), "utf8");
      expect(written).toBe(expected);
      expect(isCanonicalSourceShape(JSON.parse(written))).toBe(true);
    }

    const secondRun = await runMigration({ inputDir: dir, apply: false });
    expect(secondRun.files.map((file) => file.status)).toEqual(["no-op", "no-op"]);
  });

  it("aborts without modifying inputs when a later file fails validation", async () => {
    const englishText = await readFile(
      path.join(process.cwd(), "data", "srd", ENGLISH_BASENAME),
      "utf8",
    );
    await writeFile(path.join(dir, ENGLISH_BASENAME), englishText, "utf8");
    await writeFile(
      path.join(dir, "srd-spells-2024_fr.json"),
      JSON.stringify([{ ...legacyAcidArrow, name: "Flèche acide" }]),
      "utf8",
    );

    await expect(
      runMigration({
        inputDir: dir,
        files: [ENGLISH_BASENAME, "srd-spells-2024_fr.json"],
        apply: true,
      }),
    ).rejects.toThrow(/missing committed baseline dataset/);
    expect(await readFile(path.join(dir, ENGLISH_BASENAME), "utf8")).toBe(englishText);
    const leftovers = await readdir(dir);
    expect(leftovers.some((name) => name.endsWith(".migrate-tmp"))).toBe(false);
    expect(leftovers.some((name) => name.endsWith(".migrate-bak"))).toBe(false);
  });
});
