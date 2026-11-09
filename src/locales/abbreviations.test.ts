import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import i18n from "@/i18n.ts";
import {
  CLASS_ABBREVIATION_IDS,
  COMPONENT_ABBREVIATION_IDS,
  EXCLUDED_ABBREVIATION_IDS,
  SCHOOL_ABBREVIATION_IDS,
  abbreviationCatalog,
  findAbbreviationSurfaceConflicts,
  isAbbreviationEligible,
  type AbbreviationEntry,
  type AbbreviationId,
  type AbbreviationLocale,
} from "./abbreviations.ts";
import { en } from "./en.ts";

interface DocumentedEntry {
  full: string;
  short: string;
}

interface DocumentedInventory {
  en: DocumentedEntry[];
  de: DocumentedEntry[];
}

const MISSING_SIDE = "\u2014";
const ENTRY_LINE_PATTERN = /^-\s+(.*?)\s*\(([^()]*)\)\s*$/;

function parseDocumentedEntries(value: string): DocumentedEntry | null {
  const separator = value.indexOf(" = ");
  if (separator === -1) return null;
  return { full: value.slice(0, separator), short: value.slice(separator + 3) };
}

function parseDocumentedInventories(): DocumentedInventory {
  const markdown = readFileSync(resolve(process.cwd(), "docs/abbreviations.md"), "utf8");
  const inventory: DocumentedInventory = { en: [], de: [] };
  for (const rawLine of markdown.split(/\r?\n/)) {
    const match = ENTRY_LINE_PATTERN.exec(rawLine.trim());
    if (!match) continue;
    const left = (match[1] ?? "").trim();
    const right = (match[2] ?? "").trim();
    const english = left === MISSING_SIDE ? null : parseDocumentedEntries(left);
    const german = right === MISSING_SIDE ? null : parseDocumentedEntries(right);
    if (left !== MISSING_SIDE && english === null) {
      throw new Error(`Unparseable English abbreviation documentation line: ${rawLine}`);
    }
    if (right !== MISSING_SIDE && german === null) {
      throw new Error(`Unparseable German abbreviation documentation line: ${rawLine}`);
    }
    if (english) inventory.en.push(english);
    if (german) inventory.de.push(german);
  }
  return inventory;
}

function documentedSignature(entry: DocumentedEntry): string {
  return [entry.full, entry.short].join("\u0000");
}

function catalogSignature(entry: AbbreviationEntry): string {
  return [entry.full, entry.short].join("\u0000");
}

const documented = parseDocumentedInventories();

describe("abbreviation catalog", () => {
  it("contains exactly the entries documented for each locale", () => {
    expect(documented.en.length).toBeGreaterThan(0);
    expect(documented.de.length).toBeGreaterThan(0);
    for (const locale of ["en", "de"] as const) {
      expect(abbreviationCatalog(locale)!.map(catalogSignature).sort()).toEqual(
        documented[locale].map(documentedSignature).sort(),
      );
    }
  });

  it("exposes full and short values through the i18n runtime", () => {
    expect(i18n.t("abbreviations.armorClass.full", { lng: "en" })).toBe("armor class");
    expect(i18n.t("abbreviations.armorClass.short", { lng: "en" })).toBe("AC");
    expect(i18n.t("abbreviations.armorClass.full", { lng: "de" })).toBe("Rüstungsklasse");
    expect(i18n.t("abbreviations.armorClass.short", { lng: "de" })).toBe("RK");
    expect(i18n.t("abbreviations.castingAtHigherLevels.full", { lng: "de" })).toBe(
      "Verwenden von Zauberplätzen höheren Grades",
    );
    expect(i18n.t("abbreviations.threeQuartersCover.short", { lng: "de" })).toBe("DVD");
  });

  it("keeps intentionally reused abbreviations distinct", () => {
    expect(i18n.t("abbreviations.reaction.short", { lng: "en" })).toBe("R");
    expect(i18n.t("abbreviations.ritual.short", { lng: "en" })).toBe("RIT");
    expect(i18n.t("abbreviations.range.short", { lng: "en" })).toBe("rng.");
    expect(i18n.t("abbreviations.duration.short", { lng: "en" })).toBe("dur.");
    expect(i18n.t("abbreviations.spellSlot.short", { lng: "en" })).toBe("slot");
    expect(i18n.t("abbreviations.round.short", { lng: "en" })).toBe("rnd.");
    expect(i18n.t("abbreviations.round.short", { lng: "de" })).toBe("Rnd.");
    expect(i18n.t("abbreviations.ranger.short", { lng: "en" })).toBe("RNG-R");
    expect(i18n.t("abbreviations.foot.short", { lng: "en" })).toBe("ft");
    expect(i18n.t("abbreviations.feet.short", { lng: "en" })).toBe("ft");
    expect(i18n.t("abbreviations.object.short", { lng: "en" })).toBe("obj.");
    expect(i18n.t("abbreviations.object.short", { lng: "de" })).toBe("Ggst.");
    expect(en.abbreviations.foot.full).toBe("foot");
    expect(en.abbreviations.feet.full).toBe("feet");
    expect(en.abbreviations.object.full).toBe("object");
    expect(en.abbreviations.objects.full).toBe("objects");
  });

  it("returns catalogs only for exact en and de locale codes", () => {
    expect(abbreviationCatalog("en")).not.toBeNull();
    expect(abbreviationCatalog("de")).not.toBeNull();
    expect(abbreviationCatalog("fr")).toBeNull();
    expect(abbreviationCatalog("EN")).toBeNull();
    expect(abbreviationCatalog("en-US")).toBeNull();
  });

  it("keeps every exclusion ID present in its own catalog and ineligible", () => {
    for (const locale of ["en", "de"] as const) {
      const ids = new Set(abbreviationCatalog(locale)!.map((entry) => entry.id));
      for (const id of EXCLUDED_ABBREVIATION_IDS[locale]) {
        expect(ids.has(id)).toBe(true);
        expect(isAbbreviationEligible(entryById(locale, id), locale)).toBe(false);
      }
    }
  });

  it("never generates a surface with different shorts", () => {
    for (const locale of ["en", "de"] as const) {
      expect(findAbbreviationSurfaceConflicts(abbreviationCatalog(locale)!, locale)).toEqual([]);
    }
  });

  it("reports conflicting generated surfaces instead of resolving them by order", () => {
    const entries: AbbreviationEntry[] = [
      { id: "syntheticA" as AbbreviationId, full: "term", short: "A", forms: ["term", "terms"] },
      { id: "syntheticB" as AbbreviationId, full: "term", short: "B", forms: ["term"] },
    ];
    expect(findAbbreviationSurfaceConflicts(entries, "en")).toEqual([
      { surface: "term", shorts: ["A", "B"], ids: ["syntheticA", "syntheticB"] },
    ]);
  });

  it("treats retained no-op entries as ineligible", () => {
    for (const entry of abbreviationCatalog("de")!) {
      if (entry.full.trim() === entry.short.trim()) {
        expect(isAbbreviationEligible(entry, "de")).toBe(false);
      }
    }
    expect(entryById("de", "target")).toMatchObject({ full: "Ziel", short: "Ziel" });
  });

  it("makes the approved policy terms eligible for prose replacement", () => {
    const english = [
      ["between", "b/w"],
      ["advantage", "adv."],
      ["disadvantage", "disadv."],
      ["object", "obj."],
      ["objects", "obj."],
      ["target", "tgt."],
      ["minimum", "min."],
      ["maximum", "max."],
      ["example", "ex."],
      ["compare", "cf."],
      ["range", "rng."],
      ["duration", "dur."],
      ["spellSlot", "slot"],
      ["including", "incl."],
      ["condition", "cond."],
      ["against", "vs."],
      ["obviously", "obv."],
      ["obvious", "obv."],
      ["point", "pt."],
      ["physical", "phys."],
      ["following", "foll."],
      ["option", "opt."],
      ["illusory", "illus."],
      ["atLeast", "≥"],
      ["strengthCheck", "STR check"],
      ["strengthSavingThrow", "STR save"],
      ["dexteritySavingThrow", "DEX save"],
      ["constitutionSavingThrow", "CON save"],
      ["intelligenceSavingThrow", "INT save"],
      ["wisdomSavingThrow", "WIS save"],
      ["charismaSavingThrow", "CHA save"],
    ] as const;
    const german = [
      ["between", "zw."],
      ["advantage", "VT"],
      ["disadvantage", "NT"],
      ["object", "Ggst."],
      ["objects", "Ggstd."],
      ["minimum", "Min."],
      ["maximum", "Max."],
      ["example", "Bsp."],
      ["compare", "vgl."],
      ["add", "add."],
      ["point", "Pkt."],
      ["for", "f."],
      ["atLeast", "mind."],
      ["physical", "phys."],
      ["following", "folg."],
      ["option", "Opt."],
      ["spellcastingAbilityModifier", "Zauberwirken-Attr.mod."],
      ["illusory", "illus."],
      ["against", "gg."],
      ["within", "innerh."],
      ["strengthCheck", "ST-Wurf"],
      ["strengthSavingThrow", "ST-RW"],
      ["dexteritySavingThrow", "GE-RW"],
      ["constitutionSavingThrow", "KO-RW"],
      ["intelligenceSavingThrow", "IN-RW"],
      ["wisdomSavingThrow", "WE-RW"],
      ["charismaSavingThrow", "CH-RW"],
    ] as const;

    for (const [id, short] of english) {
      const entry = entryById("en", id);
      expect(entry.short).toBe(short);
      expect(isAbbreviationEligible(entry, "en")).toBe(true);
    }
    for (const [id, short] of german) {
      const entry = entryById("de", id);
      expect(entry.short).toBe(short);
      expect(isAbbreviationEligible(entry, "de")).toBe(true);
    }
  });

  it("keeps the remaining policy terms excluded", () => {
    for (const id of ["turn", "speed", "presumably", "possibly", "inPart"] as const) {
      expect(isAbbreviationEligible(entryById("en", id), "en")).toBe(false);
    }
    for (const id of ["turn", "presumably", "or", "diameter", "cube"] as const) {
      expect(isAbbreviationEligible(entryById("de", id), "de")).toBe(false);
    }
  });

  it("makes round eligible in both locales", () => {
    expect(entryById("en", "round")).toMatchObject({ full: "round", short: "rnd." });
    expect(entryById("de", "round")).toMatchObject({ full: "Runde", short: "Rnd." });
    expect(isAbbreviationEligible(entryById("en", "round"), "en")).toBe(true);
    expect(isAbbreviationEligible(entryById("de", "round"), "de")).toBe(true);
  });

  it("defines eligible written numbers from zero through ten and hundred", () => {
    const numbers = [
      ["zero", "0"],
      ["one", "1"],
      ["two", "2"],
      ["three", "3"],
      ["four", "4"],
      ["five", "5"],
      ["six", "6"],
      ["seven", "7"],
      ["eight", "8"],
      ["nine", "9"],
      ["ten", "10"],
      ["hundred", "100"],
    ] as const;
    for (const locale of ["en", "de"] as const) {
      for (const [id, short] of numbers) {
        const entry = entryById(locale, id);
        expect(entry.short).toBe(short);
        expect(isAbbreviationEligible(entry, locale)).toBe(true);
      }
    }
    expect(entryById("en", "one").full).toBe("one");
    expect(entryById("de", "one").full).toBe("eins");
    expect(entryById("de", "hundred").full).toBe("hundert");
  });

  it("generates configured inflection forms", () => {
    expect(entryById("de", "psychic").forms).toEqual([
      "psychisch",
      "psychische",
      "psychischer",
      "psychisches",
      "psychischem",
      "psychischen",
    ]);
    expect(entryById("de", "meter").forms).toEqual(["Meter", "Meters", "Metern"]);
    expect(entryById("de", "minute").forms).toEqual(["Minute", "Minuten"]);
    expect(entryById("de", "hour").forms).toEqual(["Stunde", "Stunden"]);
    expect(entryById("de", "day").forms).toEqual(["Tag", "Tage"]);
    expect(entryById("de", "object").forms).toEqual(["Gegenstand"]);
    expect(entryById("de", "objects")).toMatchObject({
      full: "Gegenstände",
      short: "Ggstd.",
    });
    expect(entryById("de", "objects").forms).toEqual(["Gegenstände", "Gegenständen"]);
    expect(entryById("de", "physical").forms).toEqual([
      "physisch",
      "physische",
      "physischer",
      "physisches",
      "physischem",
      "physischen",
    ]);
  });

  it("marks quantity prefixes and compact time units", () => {
    for (const locale of ["en", "de"] as const) {
      const prefix = entryById(locale, "upTo");
      expect(prefix).toMatchObject({ short: "≤", quantityPrefix: true });
      expect(isAbbreviationEligible(prefix, locale)).toBe(true);
      for (const id of ["minute", "hour", "day"] as const) {
        expect(entryById(locale, id).timeUnit).toBe(true);
      }
    }
    expect(entryById("en", "days")).toMatchObject({ full: "days", short: "d", timeUnit: true });
  });

  it("keeps locale-specific inventories without parity-only duplicates", () => {
    const english = new Set<string>(abbreviationCatalog("en")!.map((entry) => entry.id));
    const german = new Set<string>(abbreviationCatalog("de")!.map((entry) => entry.id));

    for (const id of [
      "spell",
      "touch",
      "sphere",
      "cube",
      "or",
      "soCalled",
      "hit",
      "add",
      "for",
      "within",
      "spellcastingAbilityModifier",
    ] as const) {
      expect(english.has(id)).toBe(false);
      expect(german.has(id)).toBe(true);
    }
    for (const id of ["psychic2", "psychic3"] as const) {
      expect(english.has(id)).toBe(false);
      expect(german.has(id)).toBe(false);
    }
    for (const id of [
      "self",
      "sight",
      "cone",
      "line",
      "bonus",
      "foot",
      "feet",
      "meters",
      "minutes",
      "hours",
      "days",
    ] as const) {
      expect(german.has(id)).toBe(false);
    }
  });

  it("keeps every structured lookup ID shared by both catalogs", () => {
    const english = new Set<string>(abbreviationCatalog("en")!.map((entry) => entry.id));
    const german = new Set<string>(abbreviationCatalog("de")!.map((entry) => entry.id));
    const shared = [
      ...Object.values(SCHOOL_ABBREVIATION_IDS),
      ...Object.values(CLASS_ABBREVIATION_IDS),
      ...Object.values(COMPONENT_ABBREVIATION_IDS),
      "action",
      "bonusAction",
      "reaction",
      "concentration",
      "ritual",
      "range",
      "duration",
      "minute",
      "hour",
    ] as const;
    for (const id of shared) {
      expect(english.has(id)).toBe(true);
      expect(german.has(id)).toBe(true);
    }
  });

  it("exposes explicit English plural unit entries", () => {
    expect(entryById("en", "minutes")).toMatchObject({ full: "minutes", short: "min" });
    expect(entryById("en", "hours")).toMatchObject({ full: "hours", short: "h" });
    expect(entryById("en", "meters")).toMatchObject({ full: "meters", short: "mtr" });
    expect(entryById("en", "minutes").forms).toEqual(["minutes"]);
  });

  it("uses the approved lowercase English damage short", () => {
    expect(entryById("en", "damage").short).toBe("dmg");
  });
});

function entryById(locale: AbbreviationLocale, id: string) {
  const entry = abbreviationCatalog(locale)!.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Missing ${locale} abbreviation entry: ${id}`);
  return entry;
}
