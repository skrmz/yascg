import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { discoverSrdInputs } from "../../scripts/srd/discovery.ts";
import {
  isCanonicalSourceShape,
  isLegacySourceShape,
  normalizeEnglish,
} from "../../scripts/srd/english.ts";
import { validateTranslation } from "../../scripts/srd/validate.ts";
import { buildSrdArtifacts } from "../../scripts/normalize-srd.ts";

const canonicalEnglish = [
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
    higher_level: "More damage.",
  },
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
];

const frenchPartial = [
  {
    index: "acid-arrow",
    name: "Flèche acide",
    level: 2,
    school: "Evocation",
    classes: ["Wizard"],
    casting_time: "1 action",
    ritual: false,
    range: "27 mètres",
    components: ["V", "S", "M"],
    material: "feuille de rhubarbe en poudre",
    duration: "Instantanée",
    concentration: false,
    damage: { damage_type: "acid" },
    description: "Une flèche acide file vers une cible.",
  },
];

const germanPartial = [
  {
    index: "command",
    name: "Befehl",
    level: 1,
    school: "Enchantment",
    classes: ["Bard"],
    casting_time: "1 Aktion",
    ritual: false,
    range: "18 Meter",
    components: ["V"],
    duration: "Unmittelbar",
    concentration: false,
    description: "Du gibst einen Ein-Wort-Befehl.",
  },
];

const legacySource = [
  {
    index: "acid-arrow",
    name: "Acid Arrow",
    level: 2,
    school: { index: "evocation", name: "Evocation", url: "/api/2024/magic-schools/evocation" },
    classes: [{ index: "wizard", name: "Wizard", url: "/api/2024/classes/wizard" }],
    casting_time: "Action",
    ritual: false,
    range: "90 feet",
    components: ["V", "S", "M"],
    duration: "Instantaneous",
    concentration: false,
    description: "Acid streaks toward a target.",
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

describe("canonical source adapter", () => {
  it("normalizes canonical data into the application schema", () => {
    const spells = normalizeEnglish(canonicalEnglish, "srd-spells-2024.json");
    const acid = spells[0];
    expect(acid.id).toBe("srd-acid-arrow");
    expect(Array.isArray(acid.description)).toBe(true);
    expect(acid.components.materialDescription).toBe("powdered rhubarb leaf");
    expect(acid.damageTypes).toEqual(["acid"]);
    expect(acid.higherLevels).toEqual(["More damage."]);
    expect(acid.source).toBe("SRD-5.2.1");
  });

  it("maps canonical school and class names", () => {
    const spells = normalizeEnglish(canonicalEnglish, "srd-spells-2024.json");
    expect(spells[0].school).toBe("Evocation");
    expect(spells[0].classes).toEqual(["Wizard"]);
    expect(spells[1].school).toBe("Enchantment");
    expect(spells[1].classes).toEqual(["Bard"]);
  });

  it("keeps subclasses independent of the spell's classes", () => {
    const spells = normalizeEnglish(
      [{ ...canonicalEnglish[1], classes: [], subclasses: ["Cleric: War"] }],
      "srd-spells-2024.json",
    );
    expect(spells[0].subclasses).toEqual(["Cleric: War"]);
    expect(spells[0].classes).toEqual([]);
  });

  it("omits subclasses when the raw entry has none", () => {
    const spells = normalizeEnglish(canonicalEnglish, "srd-spells-2024.json");
    expect("subclasses" in spells[0]).toBe(false);
  });

  it("accepts the four expanded core classes", () => {
    for (const cls of ["Barbarian", "Fighter", "Monk", "Rogue"]) {
      const spells = normalizeEnglish(
        [{ ...canonicalEnglish[1], classes: [cls] }],
        "srd-spells-2024.json",
      );
      expect(spells[0].classes).toEqual([cls]);
    }
  });

  it("stays tolerant of non-catalog subclass identifiers with a core parent", () => {
    const spells = normalizeEnglish(
      [
        {
          ...canonicalEnglish[1],
          subclasses: ["Cleric: Arcana", "Sorcerer: Lunar (Full Moon)"],
        },
      ],
      "srd-spells-2024.json",
    );
    expect(spells[0].subclasses).toEqual(["Cleric: Arcana", "Sorcerer: Lunar (Full Moon)"]);
  });

  it("accepts a German-shaped canonical source", () => {
    const spells = normalizeEnglish(germanPartial, "srd-spells-2024_de.json");
    expect(spells[0].id).toBe("srd-command");
    expect(spells[0].name).toBe("Befehl");
    expect(spells[0].classes).toEqual(["Bard"]);
  });

  it("fails on unknown classes, schools and damage types", () => {
    expect(() =>
      normalizeEnglish(
        [{ ...canonicalEnglish[0], classes: ["Artificer"] }],
        "srd-spells-2024.json",
      ),
    ).toThrow(/unknown class "Artificer"/);
    expect(() =>
      normalizeEnglish([{ ...canonicalEnglish[0], school: "Wild Magic" }], "srd-spells-2024.json"),
    ).toThrow(/unknown school "Wild Magic"/);
    expect(() =>
      normalizeEnglish(
        [{ ...canonicalEnglish[0], damage: { damage_type: "sonic" } }],
        "srd-spells-2024.json",
      ),
    ).toThrow(/unknown damage type "sonic"/);
  });

  it("rejects duplicate class names", () => {
    expect(() =>
      normalizeEnglish(
        [{ ...canonicalEnglish[0], classes: ["Wizard", "wizard"] }],
        "srd-spells-2024.json",
      ),
    ).toThrow(/duplicate class "Wizard"/);
  });

  it("rejects malformed subclass identifiers", () => {
    const base = canonicalEnglish[1];
    expect(() =>
      normalizeEnglish([{ ...base, subclasses: ["Cleric War"] }], "srd-spells-2024.json"),
    ).toThrow(/single ": " separator/);
    expect(() =>
      normalizeEnglish([{ ...base, subclasses: ["Cleric: "] }], "srd-spells-2024.json"),
    ).toThrow(/non-empty class and subclass names/);
    expect(() =>
      normalizeEnglish(
        [{ ...base, subclasses: ["Artificer: Battle Smith"] }],
        "srd-spells-2024.json",
      ),
    ).toThrow(/unknown subclass parent class "Artificer"/);
    expect(() =>
      normalizeEnglish(
        [{ ...base, subclasses: ["Cleric: War", "cleric: War"] }],
        "srd-spells-2024.json",
      ),
    ).toThrow(/duplicate subclass "Cleric: War"/);
    expect(() => normalizeEnglish([{ ...base, subclasses: [] }], "srd-spells-2024.json")).toThrow(
      /must not be empty when present/,
    );
  });

  it("rejects empty component arrays with filename and index context", () => {
    expect(() =>
      normalizeEnglish([{ ...canonicalEnglish[0], components: [] }], "srd-spells-2024.json"),
    ).toThrow(
      /\[srd-spells-2024\.json\] index "acid-arrow": spell must declare at least one component/,
    );
  });

  it("rejects ranges that absorbed a component declaration", () => {
    expect(() =>
      normalizeEnglish(
        [{ ...canonicalEnglish[0], range: "Touch Component: V, S" }],
        "srd-spells-2024.json",
      ),
    ).toThrow(
      /\[srd-spells-2024\.json\] index "acid-arrow": field "range" looks like it contains component data/,
    );
  });

  it("rejects malformed structures with filename and index context", () => {
    expect(() => normalizeEnglish([null], "srd-spells-2024.json")).toThrow(
      /\[srd-spells-2024\.json\] index "\(file\)": field "entry" must be an object/,
    );
    expect(() =>
      normalizeEnglish([{ ...canonicalEnglish[0], level: 1.5 }], "srd-spells-2024.json"),
    ).toThrow(/"level" must be an integer/);
  });

  it("rejects duplicate indices within a file", () => {
    expect(() =>
      normalizeEnglish([canonicalEnglish[0], canonicalEnglish[0]], "srd-spells-2024.json"),
    ).toThrow(/duplicate/);
  });
});

describe("source shape detection", () => {
  it("accepts the canonical shape and rejects the legacy shape", () => {
    expect(isCanonicalSourceShape(canonicalEnglish)).toBe(true);
    expect(isCanonicalSourceShape(legacySource)).toBe(false);
  });

  it("detects the legacy shape and fails with the migration hint", () => {
    expect(isLegacySourceShape(legacySource)).toBe(true);
    expect(isLegacySourceShape(canonicalEnglish)).toBe(false);
    expect(() => normalizeEnglish(legacySource, "srd-spells-2024.json")).toThrow(
      /migrate-srd-source-format\.ts --apply/,
    );
  });
});

describe("discovery", () => {
  it("fails when the canonical English input is missing", async () => {
    await expect(discoverSrdInputs(dir)).rejects.toThrow(/Missing canonical English/);
  });

  it("rejects invalid language tags", async () => {
    await writeSource("srd-spells-2024.json", canonicalEnglish);
    await writeSource("srd-spells-2024_not_a_tag_!.json", []);
    await expect(discoverSrdInputs(dir)).rejects.toThrow(/Invalid BCP 47/);
  });

  it("rejects duplicate canonical tags from distinct filenames", async () => {
    await writeSource("srd-spells-2024.json", canonicalEnglish);
    await writeSource("srd-spells-2024_he.json", germanPartial);
    await writeSource("srd-spells-2024_iw.json", germanPartial);
    await expect(discoverSrdInputs(dir)).rejects.toThrow(/Duplicate language tag/);
  });
});

describe("cross-language validation", () => {
  function englishMap(): Map<string, ReturnType<typeof normalizeEnglish>[number]> {
    return new Map(
      normalizeEnglish(canonicalEnglish, "srd-spells-2024.json").map((spell) => [spell.id, spell]),
    );
  }

  it("rejects translation entries with unknown canonical IDs", () => {
    const translated = normalizeEnglish(
      [{ ...canonicalEnglish[0], index: "made-up-spell" }],
      "srd-spells-2024_fr.json",
    );
    expect(() => validateTranslation(englishMap(), translated, "srd-spells-2024_fr.json")).toThrow(
      /unknown canonical English ID/,
    );
  });

  it("rejects conflicting canonical mechanics", () => {
    const translated = normalizeEnglish(
      [{ ...canonicalEnglish[0], level: 3 }],
      "srd-spells-2024_fr.json",
    );
    expect(() => validateTranslation(englishMap(), translated, "srd-spells-2024_fr.json")).toThrow(
      /conflict/,
    );
  });

  it("rejects conflicting subclasses when the translation provides them", () => {
    const english = new Map(
      normalizeEnglish(
        [{ ...canonicalEnglish[1], subclasses: ["Cleric: War"] }],
        "srd-spells-2024.json",
      ).map((spell) => [spell.id, spell]),
    );
    const translated = normalizeEnglish(
      [{ ...canonicalEnglish[1], subclasses: ["Cleric: Life"] }],
      "srd-spells-2024_fr.json",
    );
    expect(() => validateTranslation(english, translated, "srd-spells-2024_fr.json")).toThrow(
      /conflict.*subclasses/,
    );
  });

  it("inherits English subclasses when the translation omits them", () => {
    const english = new Map(
      normalizeEnglish(
        [{ ...canonicalEnglish[1], subclasses: ["Cleric: War"] }],
        "srd-spells-2024.json",
      ).map((spell) => [spell.id, spell]),
    );
    const translated = normalizeEnglish([canonicalEnglish[1]], "srd-spells-2024_de.json");
    validateTranslation(english, translated, "srd-spells-2024_de.json");
    expect(translated[0].subclasses).toEqual(["Cleric: War"]);
  });
});

describe("buildSrdArtifacts", () => {
  it("discovers a canonical-shape translation without a language allowlist", async () => {
    await writeSource("srd-spells-2024.json", canonicalEnglish);
    await writeSource("srd-spells-2024_fr.json", frenchPartial);
    const outputDir = path.join(dir, "out");
    const result = await buildSrdArtifacts({ inputDir: dir, outputDir });
    expect(result.manifest.map((entry) => entry.code)).toEqual(["en", "fr"]);
    const dataset = JSON.parse(
      await readFile(path.join(outputDir, "spells.srd.fr.json"), "utf8"),
    ) as Array<{ id: string }>;
    expect(dataset).toHaveLength(1);
    expect(dataset[0].id).toBe("srd-acid-arrow");
  });

  it("normalizes a German-shaped canonical translation", async () => {
    await writeSource("srd-spells-2024.json", canonicalEnglish);
    await writeSource("srd-spells-2024_de.json", germanPartial);
    const outputDir = path.join(dir, "out");
    const result = await buildSrdArtifacts({ inputDir: dir, outputDir });
    expect(result.manifest.map((entry) => entry.code)).toEqual(["en", "de"]);
    const dataset = JSON.parse(
      await readFile(path.join(outputDir, "spells.srd.de.json"), "utf8"),
    ) as Array<{ id: string; name: string }>;
    expect(dataset[0].name).toBe("Befehl");
  });

  it("allows incomplete but valid translations", async () => {
    await writeSource("srd-spells-2024.json", canonicalEnglish);
    await writeSource("srd-spells-2024_fr.json", []);
    const outputDir = path.join(dir, "out");
    const result = await buildSrdArtifacts({ inputDir: dir, outputDir });
    expect(result.manifest.map((entry) => entry.code)).toContain("fr");
  });

  it("fails for a legacy translation with the migration hint", async () => {
    await writeSource("srd-spells-2024.json", canonicalEnglish);
    await writeSource("srd-spells-2024_fr.json", legacySource);
    await expect(
      buildSrdArtifacts({ inputDir: dir, outputDir: path.join(dir, "out") }),
    ).rejects.toThrow(/migrate-srd-source-format\.ts --apply/);
  });

  it("fails for an unsupported structure", async () => {
    await writeSource("srd-spells-2024.json", canonicalEnglish);
    await writeSource("srd-spells-2024_fr.json", [
      { index: "acid-arrow", school: 5, classes: [], components: ["V"] },
    ]);
    await expect(
      buildSrdArtifacts({ inputDir: dir, outputDir: path.join(dir, "out") }),
    ).rejects.toThrow(/unsupported translation source structure/);
  });

  it("fails on malformed JSON", async () => {
    await writeSource("srd-spells-2024.json", canonicalEnglish);
    await writeFile(path.join(dir, "srd-spells-2024_fr.json"), "{ not json", "utf8");
    await expect(
      buildSrdArtifacts({ inputDir: dir, outputDir: path.join(dir, "out") }),
    ).rejects.toThrow(/malformed JSON/);
  });
});
