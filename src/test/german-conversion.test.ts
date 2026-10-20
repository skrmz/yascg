import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { convertGermanSpells } from "../../scripts/convert-german-srd.ts";
import { normalizeEnglish } from "../../scripts/srd/english.ts";
import { validateTranslation } from "../../scripts/srd/validate.ts";

function englishEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    index: "mislead",
    url: "/api/2024/spells/mislead",
    name: "Mislead",
    level: 5,
    school: { index: "illusion", name: "Illusion", url: "/api/2024/magic-schools/illusion" },
    classes: [
      { index: "bard", name: "Bard", url: "/api/2024/classes/bard" },
      { index: "wizard", name: "Wizard", url: "/api/2024/classes/wizard" },
    ],
    casting_time: "Action",
    ritual: false,
    range: "Self",
    components: ["S"],
    duration: "up to 1 hour",
    concentration: true,
    damage: { damage_type: { index: "psychic", name: "Psychic" } },
    higher_level: "You can also see through the double's senses.",
    description: "English description.",
    ...overrides,
  };
}

function germanEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    index: "mislead",
    id: "mislead",
    name: "Ablenkung",
    level: 5,
    school: "Illusion",
    castingTime: "Aktion",
    range: "Selbst",
    components: { verbal: false, somatic: false, material: false },
    duration: "Konzentration, bis zu 1 Stunde",
    concentration: true,
    ritual: false,
    classes: ["Bard", "Wizard"],
    description: [
      "Du wirst unsichtbar.",
      "Als magische Aktion kannst du den Doppelgänger bewegen.",
    ],
    higherLevels: ["Zusätzliche Effekte."],
    source: "SRD-5.2.1",
    ...overrides,
  };
}

describe("convertGermanSpells", () => {
  it("rewrites the runtime-shaped German entry into the canonical source shape", () => {
    const { entries, report } = convertGermanSpells([germanEntry()], [englishEntry()]);
    expect(entries).toHaveLength(1);
    const converted = entries[0] as Record<string, unknown>;

    expect(converted.index).toBe("mislead");
    expect(converted.url).toBe("/api/2024/spells/mislead");
    expect(converted.school).toEqual(englishEntry().school);
    expect(converted.classes).toEqual(englishEntry().classes);
    expect(converted.components).toEqual(["S"]);
    expect(converted.attack_type).toBeUndefined();
    expect(converted.damage).toEqual(englishEntry().damage);

    expect(converted.name).toBe("Ablenkung");
    expect(converted.casting_time).toBe("Aktion");
    expect(converted.range).toBe("Selbst");
    expect(converted.duration).toBe("Konzentration, bis zu 1 Stunde");
    expect(converted.description).toBe(
      "Du wirst unsichtbar.\nAls magische Aktion kannst du den Doppelgänger bewegen.",
    );
    expect(converted.higher_level).toBe("Zusätzliche Effekte.");

    expect(converted.id).toBeUndefined();
    expect(converted.source).toBeUndefined();
    expect(report.removedRedundantId).toBe(1);
    expect(report.removedRedundantSource).toBe(1);
  });

  it("resolves conflicting components from the canonical English entry and reports the conflict", () => {
    const german = germanEntry({
      components: { verbal: true, somatic: true, material: true, materialDescription: "Pulver" },
    });
    const { entries, report } = convertGermanSpells([german], [englishEntry()]);
    expect(entries[0].components).toEqual(["S"]);
    expect(report.mechanicConflicts).toEqual([
      { index: "mislead", field: "components", german: ["M", "S", "V"], english: ["S"] },
    ]);
  });

  it("ignores a contradictory German concentration flag and keeps the canonical value", () => {
    const german = germanEntry({ concentration: false });
    const { entries, report } = convertGermanSpells([german], [englishEntry()]);
    expect(entries[0].concentration).toBe(true);
    expect(report.mechanicConflicts).toContainEqual({
      index: "mislead",
      field: "concentration",
      german: false,
      english: true,
    });
  });

  it("preserves German material text and higher-level text", () => {
    const english = englishEntry({ components: ["V", "S", "M"], material: "powdered rhubarb" });
    const german = germanEntry({
      components: {
        verbal: true,
        somatic: true,
        material: true,
        materialDescription: "zerstoßenes Rhabarberblatt",
      },
      higherLevels: ["Erste Stufe.", "Zweite Stufe."],
    });
    const { entries } = convertGermanSpells([german], [english]);
    expect(entries[0].material).toBe("zerstoßenes Rhabarberblatt");
    expect(entries[0].higher_level).toBe("Erste Stufe.\nZweite Stufe.");
  });

  it("drops English-only higher-level and material text and reports the gap", () => {
    const english = englishEntry({ components: ["S", "M"], material: "english only" });
    const german = germanEntry({
      components: { verbal: false, somatic: true, material: true },
      higherLevels: undefined,
    });
    delete (german as Record<string, unknown>).higherLevels;
    const { entries, report } = convertGermanSpells([german], [english]);
    expect(entries[0].higher_level).toBeUndefined();
    expect(entries[0].material).toBeUndefined();
    expect(report.englishOnlyHigherLevelIndices).toEqual(["mislead"]);
    expect(report.missingGermanMaterialIndices).toEqual(["mislead"]);
  });

  it("keeps German-only higher-level text and reports it", () => {
    const english = englishEntry({ higher_level: undefined });
    delete (english as Record<string, unknown>).higher_level;
    const { entries, report } = convertGermanSpells([germanEntry()], [english]);
    expect(entries[0].higher_level).toBe("Zusätzliche Effekte.");
    expect(report.germanOnlyHigherLevelIndices).toEqual(["mislead"]);
  });

  it("reports unsupported materialConsumed/materialCost values instead of silently storing them", () => {
    const german = germanEntry({
      components: {
        verbal: false,
        somatic: true,
        material: true,
        materialDescription: "Diamant",
        materialConsumed: true,
        materialCost: "300 GM",
      },
    });
    const english = englishEntry({ components: ["S", "M"], material: "diamond" });
    const { report } = convertGermanSpells([german], [english]);
    expect(report.droppedMaterialConsumed).toEqual([{ index: "mislead", value: true }]);
    expect(report.droppedMaterialCost).toEqual([{ index: "mislead", value: "300 GM" }]);
  });

  it("skips and reports unmatched German entries and missing German coverage", () => {
    const english = [englishEntry(), englishEntry({ index: "misty-step", name: "Misty Step" })];
    const german = [germanEntry(), germanEntry({ index: "invented-spell", name: "Erfunden" })];
    const { entries, report } = convertGermanSpells(german, english);
    expect(entries.map((entry) => entry.index)).toEqual(["mislead"]);
    expect(report.unmatchedGermanIndices).toEqual(["invented-spell"]);
    expect(report.missingGermanIndices).toEqual(["misty-step"]);
    expect(report.convertedEntries).toBe(1);
    expect(report.germanEntries).toBe(2);
    expect(report.englishEntries).toBe(2);
  });

  it("is idempotent across repeated execution", () => {
    const english = [englishEntry()];
    const first = convertGermanSpells([germanEntry()], english);
    const second = convertGermanSpells(first.entries, english);
    expect(second.entries).toEqual(first.entries);
    expect(second.report.mechanicConflicts).toEqual([]);
    expect(second.report.removedRedundantId).toBe(0);
    expect(second.report.removedRedundantSource).toBe(0);
  });

  it("produces entries that pass the normalization pipeline and cross-language validation", () => {
    const englishRaw = [englishEntry()];
    const { entries } = convertGermanSpells([germanEntry()], englishRaw);
    const english = normalizeEnglish(englishRaw, "5e-SRD-Spells.json");
    const englishById = new Map(english.map((spell) => [spell.id, spell]));
    const translated = normalizeEnglish(entries, "5e-SRD-Spells_de.json");
    const mislead = translated[0];
    expect(mislead.name).toBe("Ablenkung");
    expect(mislead.components.somatic).toBe(true);
    expect(mislead.components.verbal).toBe(false);
    expect(mislead.classes).toEqual(["Bard", "Wizard"]);
    expect(() =>
      validateTranslation(englishById, translated, "5e-SRD-Spells_de.json"),
    ).not.toThrow();
  });
});

describe("convertGermanSpells (checked-in dataset)", () => {
  it("converts every real German spell and validates against the canonical English set", async () => {
    const read = (name: string): Promise<unknown> =>
      readFile(path.resolve(process.cwd(), "data", "srd", name), "utf8").then(
        (text) => JSON.parse(text) as unknown,
      );
    const englishRaw = await read("5e-SRD-Spells.json");
    const germanRawBefore = await read("5e-SRD-Spells_de.json");

    const { entries, report } = convertGermanSpells(germanRawBefore, englishRaw);
    expect(report.unmatchedGermanIndices).toEqual([]);
    expect(report.missingGermanIndices).toEqual([]);
    expect(report.duplicateGermanIndices).toEqual([]);
    expect(report.missingGermanNames).toEqual([]);
    expect(report.missingGermanDescriptions).toEqual([]);
    expect(entries).toHaveLength(339);

    const english = normalizeEnglish(englishRaw, "5e-SRD-Spells.json");
    const englishById = new Map(english.map((spell) => [spell.id, spell]));
    const translated = normalizeEnglish(entries, "5e-SRD-Spells_de.json");
    expect(() =>
      validateTranslation(englishById, translated, "5e-SRD-Spells_de.json"),
    ).not.toThrow();

    const second = convertGermanSpells(entries, englishRaw);
    expect(second.entries).toEqual(entries);
  });
});
