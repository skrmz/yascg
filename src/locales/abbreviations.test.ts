import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import i18n from "@/i18n.ts";
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
    expect(documented).toHaveLength(121);
    expect(catalog).toHaveLength(121);
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
    expect(i18n.t("abbreviations.foot.short", { lng: "en" })).toBe("FT");
    expect(i18n.t("abbreviations.feet.short", { lng: "en" })).toBe("FT");
    expect(en.abbreviations.foot.full).toBe("foot");
    expect(en.abbreviations.feet.full).toBe("feet");
  });
});
