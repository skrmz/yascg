import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import i18n from "@/i18n.ts";
import {
  EXCLUDED_ABBREVIATION_IDS,
  abbreviationCatalog,
  isAbbreviationEligible,
  type AbbreviationLocale,
} from "./abbreviations.ts";
import { de } from "./de.ts";
import { en } from "./en.ts";

interface AbbreviationEntry {
  full: string;
  short: string;
}

interface DocumentedPair {
  en: AbbreviationEntry;
  de: AbbreviationEntry;
}

const ENTRY_PATTERN = /^-\s+(.+?) = (.+?) \((.+?) = (.+)\)$/;

function parseDocumentedPairs(): DocumentedPair[] {
  const markdown = readFileSync(resolve(process.cwd(), "docs/abbreviations.md"), "utf8");
  return markdown.split(/\r?\n/).flatMap((line) => {
    const match = ENTRY_PATTERN.exec(line.trim());
    if (!match) return [];
    const [, fullEn, shortEn, fullDe, shortDe] = match;
    return [{ en: { full: fullEn, short: shortEn }, de: { full: fullDe, short: shortDe } }];
  });
}

function signature(pair: DocumentedPair): string {
  return [pair.en.full, pair.en.short, pair.de.full, pair.de.short].join("\u0000");
}

const documented = parseDocumentedPairs();
const catalog = Object.values(en.abbreviations).map((entry, index) => ({
  en: entry,
  de: Object.values(de.abbreviations)[index],
}));

describe("abbreviation catalog", () => {
  it("contains exactly the entries documented in docs/abbreviations.md", () => {
    expect(documented.length).toBeGreaterThan(0);
    expect(catalog).toHaveLength(documented.length);
    expect(catalog.map(signature).sort()).toEqual(documented.map(signature).sort());
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
    expect(i18n.t("abbreviations.range.short", { lng: "en" })).toBe("RNG");
    expect(i18n.t("abbreviations.ranger.short", { lng: "en" })).toBe("RNG-R");
    expect(i18n.t("abbreviations.foot.short", { lng: "en" })).toBe("ft");
    expect(i18n.t("abbreviations.feet.short", { lng: "en" })).toBe("ft");
    expect(i18n.t("abbreviations.object.short", { lng: "en" })).toBe("obj.");
    expect(i18n.t("abbreviations.objects.short", { lng: "de" })).toBe("Ggst.");
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

  it("keeps every exclusion ID present in both catalogs", () => {
    const catalogIds: Record<AbbreviationLocale, Set<string>> = {
      en: new Set(abbreviationCatalog("en")!.map((entry) => entry.id)),
      de: new Set(abbreviationCatalog("de")!.map((entry) => entry.id)),
    };
    for (const locale of ["en", "de"] as const) {
      for (const id of EXCLUDED_ABBREVIATION_IDS[locale]) {
        expect(catalogIds.en.has(id)).toBe(true);
        expect(catalogIds.de.has(id)).toBe(true);
      }
    }
  });

  it("never gives two eligible entries the same normalized full form with different shorts", () => {
    for (const locale of ["en", "de"] as const) {
      const shortsByFull = new Map<string, string>();
      for (const entry of eligibleEntries(locale)) {
        const key = normalizedFull(entry, locale);
        const short = entry.short.trim();
        const existing = shortsByFull.get(key);
        if (existing !== undefined) expect(existing).toBe(short);
        else shortsByFull.set(key, short);
      }
    }
  });

  it("treats no-op entries as ineligible", () => {
    for (const [locale, id] of [
      ["en", "spell"],
      ["en", "self"],
      ["en", "touch"],
      ["en", "sight"],
      ["de", "self"],
      ["de", "sight"],
    ] as const) {
      expect(isAbbreviationEligible(entryById(locale, id), locale)).toBe(false);
    }
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
    ] as const;
    const german = [
      ["between", "zw."],
      ["advantage", "VT"],
      ["disadvantage", "NT"],
      ["object", "Ggst."],
      ["objects", "Ggst."],
      ["minimum", "Min."],
      ["maximum", "Max."],
      ["example", "Bsp."],
      ["compare", "vgl."],
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
    for (const id of [
      "round",
      "turn",
      "line",
      "speed",
      "bonus",
      "presumably",
      "possibly",
      "inPart",
      "or",
    ] as const) {
      expect(isAbbreviationEligible(entryById("en", id), "en")).toBe(false);
    }
    for (const id of [
      "round",
      "turn",
      "line",
      "bonus",
      "presumably",
      "or",
      "diameter",
      "cube",
    ] as const) {
      expect(isAbbreviationEligible(entryById("de", id), "de")).toBe(false);
    }
  });

  it("exposes explicit plural unit entries", () => {
    expect(entryById("en", "minutes")).toMatchObject({ full: "minutes", short: "min" });
    expect(entryById("en", "hours")).toMatchObject({ full: "hours", short: "h" });
    expect(entryById("en", "meters")).toMatchObject({ full: "meters", short: "mtr" });
    expect(entryById("de", "minutes")).toMatchObject({ full: "Minuten", short: "min" });
    expect(entryById("de", "hours")).toMatchObject({ full: "Stunden", short: "h" });
    expect(entryById("de", "meters")).toMatchObject({ full: "Meter", short: "m" });
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

function eligibleEntries(locale: AbbreviationLocale) {
  return abbreviationCatalog(locale)!.filter((entry) => isAbbreviationEligible(entry, locale));
}

function normalizedFull(entry: { full: string }, locale: AbbreviationLocale): string {
  return entry.full.trim().normalize("NFC").toLocaleLowerCase(locale);
}
