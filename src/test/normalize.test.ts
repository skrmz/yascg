import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { discoverSrdInputs } from "../../scripts/srd/discovery.ts";
import { normalizeEnglish } from "../../scripts/srd/english.ts";
import { normalizeGerman } from "../../scripts/srd/german.ts";
import { validateTranslation } from "../../scripts/srd/validate.ts";
import { buildSrdArtifacts } from "../../scripts/normalize-srd.ts";

const canonicalEnglish = [
  {
    index: "acid-arrow",
    name: "Acid Arrow",
    level: 2,
    school: { index: "evocation" },
    classes: [{ index: "wizard" }],
    casting_time: "Action",
    ritual: false,
    range: "90 feet",
    components: ["V", "S", "M"],
    material: "powdered rhubarb leaf",
    duration: "Instantaneous",
    concentration: false,
    damage: { damage_type: { index: "acid" } },
    description: "Acid streaks toward a target.",
    higher_level: "More damage.",
  },
  {
    index: "command",
    name: "Command",
    level: 1,
    school: { index: "enchantment" },
    classes: [{ index: "bard" }],
    casting_time: "Action",
    ritual: false,
    range: "60 feet",
    components: ["V"],
    duration: "Instantaneous",
    concentration: false,
    description: "You speak a one-word command.",
  },
];

const frenchPartial = [
  {
    index: "acid-arrow",
    name: "Flèche acide",
    level: 2,
    school: { index: "evocation" },
    classes: [{ index: "wizard" }],
    casting_time: "1 action",
    ritual: false,
    range: "27 mètres",
    components: ["V", "S", "M"],
    material: "feuille de rhubarbe en poudre",
    duration: "Instantanée",
    concentration: false,
    description: "Une flèche acide file vers une cible.",
  },
];

const germanEntry = [
  {
    index: "command",
    name: "Befehl",
    level: 1,
    school: { index: "enchantment" },
    casting_time: "1 Aktion",
    range: "18 Meter",
    components: ["V", "G"],
    duration: "Unmittelbar",
    concentration: false,
    ritual: false,
    classes: [{ name: "Barde" }],
    description: "Du gibst einen Ein-Wort-Befehl.",
  },
];

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "srd-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeSource(name: string, value: unknown): Promise<void> {
  await writeFile(path.join(dir, name), JSON.stringify(value), "utf8");
}

describe("English adapter", () => {
  it("normalizes canonical data into the application schema", () => {
    const spells = normalizeEnglish(canonicalEnglish, "5e-SRD-Spells.json");
    const acid = spells[0];
    expect(acid.id).toBe("srd-acid-arrow");
    expect(Array.isArray(acid.description)).toBe(true);
    expect(acid.components.materialDescription).toBe("powdered rhubarb leaf");
    expect(acid.damageTypes).toEqual(["acid"]);
    expect(acid.higherLevels).toEqual(["More damage."]);
    expect(acid.source).toBe("SRD-5.2.1");
  });

  it("fails on unknown classes and schools", () => {
    expect(() =>
      normalizeEnglish(
        [{ ...canonicalEnglish[0], classes: [{ index: "artificer" }] }],
        "5e-SRD-Spells.json",
      ),
    ).toThrow(/unknown class index/);
    expect(() =>
      normalizeEnglish(
        [{ ...canonicalEnglish[0], school: { index: "wild-magic" } }],
        "5e-SRD-Spells.json",
      ),
    ).toThrow(/unknown school index/);
  });

  it("rejects duplicate indices within a file", () => {
    expect(() =>
      normalizeEnglish([canonicalEnglish[0], canonicalEnglish[0]], "5e-SRD-Spells.json"),
    ).toThrow(/duplicate/);
  });
});

describe("German adapter", () => {
  it("maps G components and German class names to canonical values", () => {
    const spells = normalizeGerman(germanEntry, "5e-SRD-Spells_de.json");
    expect(spells[0].id).toBe("srd-command");
    expect(spells[0].components.verbal).toBe(true);
    expect(spells[0].components.somatic).toBe(true);
    expect(spells[0].classes).toEqual(["Bard"]);
  });

  it("fails on unknown German class names", () => {
    expect(() =>
      normalizeGerman(
        [{ ...germanEntry[0], classes: [{ name: "Barde" }, { name: "Unbekannt" }] }],
        "5e-SRD-Spells_de.json",
      ),
    ).toThrow(/unknown German class name/);
  });
});

describe("discovery", () => {
  it("fails when the canonical English input is missing", async () => {
    await expect(discoverSrdInputs(dir)).rejects.toThrow(/Missing canonical English/);
  });

  it("rejects invalid language tags", async () => {
    await writeSource("5e-SRD-Spells.json", canonicalEnglish);
    await writeSource("5e-SRD-Spells_not_a_tag_!.json", []);
    await expect(discoverSrdInputs(dir)).rejects.toThrow(/Invalid BCP 47/);
  });

  it("rejects duplicate canonical tags from distinct filenames", async () => {
    await writeSource("5e-SRD-Spells.json", canonicalEnglish);
    await writeSource("5e-SRD-Spells_he.json", germanEntry);
    await writeSource("5e-SRD-Spells_iw.json", germanEntry);
    await expect(discoverSrdInputs(dir)).rejects.toThrow(/Duplicate language tag/);
  });
});

describe("cross-language validation", () => {
  it("rejects translation entries with unknown canonical IDs", () => {
    const english = new Map(
      normalizeEnglish(canonicalEnglish, "5e-SRD-Spells.json").map((spell) => [spell.id, spell]),
    );
    const translated = normalizeEnglish(
      [{ ...canonicalEnglish[0], index: "made-up-spell" }],
      "5e-SRD-Spells_fr.json",
    );
    expect(() => validateTranslation(english, translated, "5e-SRD-Spells_fr.json")).toThrow(
      /unknown canonical English ID/,
    );
  });

  it("rejects conflicting canonical mechanics", () => {
    const english = new Map(
      normalizeEnglish(canonicalEnglish, "5e-SRD-Spells.json").map((spell) => [spell.id, spell]),
    );
    const translated = normalizeEnglish(
      [{ ...canonicalEnglish[0], level: 3 }],
      "5e-SRD-Spells_fr.json",
    );
    expect(() => validateTranslation(english, translated, "5e-SRD-Spells_fr.json")).toThrow(
      /conflict/,
    );
  });
});

describe("buildSrdArtifacts", () => {
  it("discovers a canonical-shape translation without a language allowlist", async () => {
    await writeSource("5e-SRD-Spells.json", canonicalEnglish);
    await writeSource("5e-SRD-Spells_fr.json", frenchPartial);
    const outputDir = path.join(dir, "out");
    const result = await buildSrdArtifacts({ inputDir: dir, outputDir });
    expect(result.manifest.map((entry) => entry.code)).toEqual(["en", "fr"]);
    const dataset = JSON.parse(
      await readFile(path.join(outputDir, "spells.srd.fr.json"), "utf8"),
    ) as Array<{ id: string }>;
    expect(dataset).toHaveLength(1);
    expect(dataset[0].id).toBe("srd-acid-arrow");
  });

  it("allows incomplete but valid translations", async () => {
    await writeSource("5e-SRD-Spells.json", canonicalEnglish);
    await writeSource("5e-SRD-Spells_fr.json", []);
    const outputDir = path.join(dir, "out");
    const result = await buildSrdArtifacts({ inputDir: dir, outputDir });
    expect(result.manifest.map((entry) => entry.code)).toContain("fr");
  });

  it("fails for an unsupported structure without an explicit adapter", async () => {
    await writeSource("5e-SRD-Spells.json", canonicalEnglish);
    await writeSource("5e-SRD-Spells_fr.json", germanEntry);
    await expect(
      buildSrdArtifacts({ inputDir: dir, outputDir: path.join(dir, "out") }),
    ).rejects.toThrow(/unsupported translation source structure/);
  });

  it("fails on malformed JSON", async () => {
    await writeSource("5e-SRD-Spells.json", canonicalEnglish);
    await writeFile(path.join(dir, "5e-SRD-Spells_fr.json"), "{ not json", "utf8");
    await expect(
      buildSrdArtifacts({ inputDir: dir, outputDir: path.join(dir, "out") }),
    ).rejects.toThrow(/malformed JSON/);
  });
});
