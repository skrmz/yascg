import { describe, expect, it } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { SUBCLASSES } from "@/domain/subclasses";
import { SUBCLASS_KEYS, damageTypeKey, subclassKey, subclassLabel } from "./labels.ts";
import { en } from "./en.ts";
import { de } from "./de.ts";

function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      leafPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

describe("locale catalogs", () => {
  it("German mirrors the English key shape exactly", () => {
    expect(leafPaths(de).sort()).toEqual(leafPaths(en).sort());
  });

  it("English is the fallback for unknown locales", () => {
    expect(i18n.t("spell.level.cantrip", { lng: "fr" })).toBe("Cantrip");
  });

  it("localizes spell terminology in German", () => {
    expect(i18n.t("spell.level.cantrip", { lng: "de" })).toBe("Zaubertrick");
    expect(i18n.t("spell.level.level", { lng: "de", level: 3 })).toBe("Grad 3");
    expect(i18n.t("spell.metadata.castingTime", { lng: "de" })).toBe("Zeitaufwand");
    expect(i18n.t("spell.higherLevels", { lng: "de" })).toBe("Höhere Grade");
    expect(i18n.t("school.evocation", { lng: "de" })).toBe("Hervorrufung");
    expect(i18n.t("class.ranger", { lng: "de" })).toBe("Waldläufer");
    expect(i18n.t("component.somatic", { lng: "de" })).toBe("G");
    expect(i18n.t("card.truncated", { lng: "de" })).toBe("Inhalt gekürzt");
  });

  it("localizes damage-type names in German", () => {
    expect(i18n.t("damageType.fire", { lng: "en" })).toBe("Fire");
    expect(i18n.t("damageType.fire", { lng: "de" })).toBe("Feuer");
    expect(i18n.t("damageType.thunder", { lng: "de" })).toBe("Schall");
    expect(i18n.t("damageType.force", { lng: "de" })).toBe("Energie");
    expect(i18n.t("damageType.radiant", { lng: "de" })).toBe("Gleißend");
  });

  it("maps canonical damage types and falls back to null for unknown values", () => {
    expect(damageTypeKey("acid")).toBe("damageType.acid");
    expect(damageTypeKey("psychic")).toBe("damageType.psychic");
    expect(damageTypeKey("bludgeoning-unknown")).toBeNull();
    expect(damageTypeKey("constructor")).toBeNull();
    expect(damageTypeKey("")).toBeNull();
  });

  it("interpolates card continuation counts", () => {
    expect(i18n.t("card.continuation", { lng: "de", index: 2, count: 3 })).toBe("Karte 2 von 3");
    expect(i18n.t("card.continuedFrom", { lng: "de", index: 1 })).toBe("Fortgesetzt von Karte 1");
  });

  it("localizes the class and subclass metadata labels in German", () => {
    expect(i18n.t("class.barbarian", { lng: "de" })).toBe("Barbar");
    expect(i18n.t("class.fighter", { lng: "de" })).toBe("Kämpfer");
    expect(i18n.t("class.monk", { lng: "de" })).toBe("Mönch");
    expect(i18n.t("class.rogue", { lng: "de" })).toBe("Schurke");
    expect(i18n.t("spell.metadata.subclasses", { lng: "de" })).toBe("Unterklassen");
  });
});

describe("subclass localization", () => {
  it("maps every catalog identifier to a key present in English", () => {
    const paths = new Set(leafPaths(en));
    expect(Object.keys(SUBCLASS_KEYS)).toHaveLength(48);
    for (const id of SUBCLASSES) {
      const key = subclassKey(id);
      expect(key).not.toBeNull();
      expect(paths.has(key as string)).toBe(true);
    }
  });

  it("localizes official catalog subclasses in German", () => {
    const label = (id: (typeof SUBCLASSES)[number]): string =>
      i18n.t(subclassKey(id)!, { lng: "de" });
    expect(label("Cleric: War Domain")).toBe("Domäne des Krieges");
    expect(label("Barbarian: Path of the Berserker")).toBe("Pfad des Berserkers");
    expect(label("Rogue: Soulknife")).toBe("Seelenmesser");
    expect(label("Sorcerer: Aberrant Sorcery")).toBe("Abnorme Zaubermacht");
    expect(label("Warlock: Archfey Patron")).toBe("Schirmherr: Die Erzfee");
    expect(label("Wizard: Illusionist")).toBe("Illusionist");
  });

  it("falls back to the English subclass name for non-catalog identifiers", () => {
    expect(subclassKey("Cleric: Arcana")).toBeNull();
    expect(subclassLabel("Cleric: Arcana", i18n.t)).toBe("Arcana");
    expect(subclassLabel("Sorcerer: Lunar (Full Moon)", i18n.t)).toBe("Lunar (Full Moon)");
    expect(subclassLabel("Artificer: Alchemist", i18n.t)).toBe("Alchemist");
  });
});
