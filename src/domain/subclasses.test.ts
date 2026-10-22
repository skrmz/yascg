import { describe, expect, it } from "vite-plus/test";
import { CORE_CLASSES } from "@/domain/spells";
import {
  SUBCLASSES,
  isCatalogSubclass,
  subclassDisplayNameFallback,
  subclassParentClass,
} from "@/domain/subclasses";

describe("core classes", () => {
  it("exposes the 12 core classes in alphabetical order", () => {
    expect(CORE_CLASSES).toHaveLength(12);
    expect([...CORE_CLASSES]).toEqual([...CORE_CLASSES].sort());
    expect(CORE_CLASSES).toEqual([
      "Barbarian",
      "Bard",
      "Cleric",
      "Druid",
      "Fighter",
      "Monk",
      "Paladin",
      "Ranger",
      "Rogue",
      "Sorcerer",
      "Warlock",
      "Wizard",
    ]);
  });
});

describe("subclass catalog", () => {
  it("contains exactly 48 unique identifiers", () => {
    expect(SUBCLASSES).toHaveLength(48);
    expect(new Set(SUBCLASSES).size).toBe(48);
  });

  it('uses the canonical "<Class>: <Sub>" format with a core parent class', () => {
    const core = new Set<string>(CORE_CLASSES);
    for (const id of SUBCLASSES) {
      const separatorIndex = id.indexOf(": ");
      expect(separatorIndex).toBeGreaterThan(-1);
      expect(id.indexOf(": ", separatorIndex + 2)).toBe(-1);
      expect(core.has(subclassParentClass(id))).toBe(true);
      expect(subclassDisplayNameFallback(id)).not.toBe("");
    }
  });

  it("narrows catalog identifiers and rejects non-catalog values", () => {
    expect(isCatalogSubclass("Cleric: War Domain")).toBe(true);
    expect(isCatalogSubclass("Cleric: Arcana")).toBe(false);
    expect(isCatalogSubclass("Artificer: Alchemist")).toBe(false);
    expect(isCatalogSubclass("")).toBe(false);
  });

  it("extracts the parent class and fallback name", () => {
    expect(subclassParentClass("Cleric: War Domain")).toBe("Cleric");
    expect(subclassDisplayNameFallback("Cleric: War Domain")).toBe("War Domain");
    expect(subclassDisplayNameFallback("Sorcerer: Lunar (Full Moon)")).toBe("Lunar (Full Moon)");
  });
});
