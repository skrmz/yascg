import { describe, expect, it } from "vite-plus/test";
import { compareNumericAtoms, parseNumberToken, type ComparisonOptions } from "./normalize.ts";

function classification(
  source: string,
  candidate: string,
  category: string,
  options: ComparisonOptions = {},
): string | undefined {
  return compareNumericAtoms(source, candidate, options).comparisons.find(
    (comparison) => comparison.category === category,
  )?.classification;
}

function categoryNotes(
  source: string,
  candidate: string,
  category: string,
  options: ComparisonOptions = {},
): string[] {
  return (
    compareNumericAtoms(source, candidate, options).comparisons.find(
      (comparison) => comparison.category === category,
    )?.notes ?? []
  );
}

describe("numeric normalization", () => {
  it("treats equivalent time representations as equivalent", () => {
    for (const [source, candidate] of [
      ["1 minute", "10 rounds"],
      ["1 round", "6 seconds"],
      ["1 hour", "60 minutes"],
      ["1 day", "24 hours"],
      ["one minute", "1 minute"],
      ["zwei Runden", "2 rounds"],
    ]) {
      expect(classification(source, candidate, "time")).toBe("equivalent");
    }
  });

  it("treats equivalent dice notations as equivalent", () => {
    for (const [source, candidate] of [
      ["1W8", "1d8"],
      ["1d8", "d8"],
      ["1d8 + 2", "1d8+2"],
      ["2d6 - 1", "2d6-1"],
    ]) {
      expect(classification(source, candidate, "dice")).toBe("equivalent");
    }
  });

  it("treats number words as equal to digits in both locales", () => {
    expect(classification("one creature", "1 creature", "count")).toBe("equivalent");
    expect(classification("zwei Ziele", "2 targets", "count")).toBe("equivalent");
    expect(classification("three Kreaturen", "3 creatures", "count")).toBe("equivalent");
  });

  it("normalizes thousands separators, decimals, and unit conversion", () => {
    expect(classification("1,000 feet", "1000 feet", "distance")).toBe("equivalent");
    expect(classification("5 feet", "1.5 meters", "distance")).toBe("equivalent");
    expect(classification("5 feet", "1,5 Meter", "distance")).toBe("equivalent");
    expect(classification("1 pound", "0.45 kg", "weight")).toBe("equivalent");
  });

  it("keeps half as a relative marker", () => {
    expect(classification("half damage", "halb Schaden", "relative")).toBe("equivalent");
    expect(classification("one-half damage", "½ Schaden", "relative")).toBe("equivalent");
    expect(classification("half damage", "10 damage", "relative")).toBe("mismatch");
  });

  it("reports confirmed mismatches", () => {
    const cases: Array<[string, string, string]> = [
      ["1d8", "1d6", "dice"],
      ["10 feet", "30 feet", "distance"],
      ["1 minute", "1 hour", "time"],
      ["5 feet", "no distance stated", "distance"],
    ];
    for (const [source, candidate, category] of cases) {
      expect(classification(source, candidate, category)).toBe("mismatch");
    }

    const report = compareNumericAtoms("Deal 1d8 damage.", "Deal 2d6 damage.");
    expect(report.equivalent).toBe(false);
    expect(report.mismatches.map((comparison) => comparison.category)).toEqual(["dice"]);
  });

  it("reports atoms outside the table as unresolved", () => {
    expect(classification("1 mile", "1 Meile", "distance")).toBe("unresolved");
    expect(classification("10 square feet", "10 Quadratmeter", "distance")).toBe("unresolved");
    expect(classification("2 stone", "2 stone", "weight")).toBe("unresolved");
    expect(classification("1 mile", "2 miles", "distance")).not.toBe("equivalent");
  });

  it("treats absent categories as equivalent", () => {
    const report = compareNumericAtoms("A calm description.", "A quiet description.");
    expect(report.equivalent).toBe(true);
    expect(report.mismatches).toEqual([]);
    expect(report.unresolved).toEqual([]);
  });

  it("parses locale number formatting", () => {
    expect(parseNumberToken("1,000")).toBe(1000);
    expect(parseNumberToken("1.000")).toBe(1000);
    expect(parseNumberToken("1,5")).toBe(1.5);
    expect(parseNumberToken("1.50")).toBe(1.5);
  });
});

const DE = { locale: "de" } as const;

describe("locale abbreviations from the catalog", () => {
  it("recognizes established German time abbreviations", () => {
    for (const [source, candidate] of [
      ["zehn Sekunden lang", "10 Sek. lang"],
      ["24 Stunden lang", "24 h lang"],
      ["30 Tage lang", "30 t lang"],
      ["eine Minute lang", "1 min lang"],
    ]) {
      expect(classification(source, candidate, "time", DE)).toBe("equivalent");
    }
  });

  it("recognizes English catalog abbreviations", () => {
    expect(classification("1 hour", "1 h", "time", { locale: "en" })).toBe("equivalent");
    expect(classification("2 days", "2 d", "time", { locale: "en" })).toBe("equivalent");
  });

  it("converts kilometers", () => {
    expect(classification("1,6 Kilometern", "1,6 km", "distance", DE)).toBe("equivalent");
    expect(classification("40 Kilometer", "40 km", "distance", DE)).toBe("equivalent");
    expect(classification("1 km", "1000 m", "distance", DE)).toBe("equivalent");
  });

  it("accepts inflected German numerals for quantities but not counts", () => {
    expect(classification("eine Minute lang", "1 min lang", "time", DE)).toBe("equivalent");
    expect(classification("im Abstand von einem Meter", "im Abstand von 1 m", "distance", DE)).toBe(
      "equivalent",
    );
    expect(
      compareNumericAtoms("Eine Kreatur ist bezaubert.", "Bezaubert.", DE).comparisons.find(
        (comparison) => comparison.category === "count",
      )?.source,
    ).toEqual([]);
  });

  it("does not split a German article into a unit", () => {
    const report = compareNumericAtoms("du berührst einem Gegner", "du berührst einen Gegner", DE);
    expect(
      report.comparisons.find((comparison) => comparison.category === "distance")?.source,
    ).toEqual([]);
  });

  it("compares catalog count-noun abbreviations", () => {
    expect(classification("zwei Gegenstände", "2 Ggstd.", "count", DE)).toBe("equivalent");
    expect(classification("one object", "1 obj.", "count", { locale: "en" })).toBe("equivalent");
  });
});

describe("count extraction", () => {
  it("matches a count separated from its noun by modifiers", () => {
    expect(
      classification("bis zu vier Kreaturen", "≤ 4 von dir erschaffene Kreaturen", "count", DE),
    ).toBe("equivalent");
    expect(
      classification("two additional creatures", "up to 2 additional undead creatures", "count", {
        locale: "en",
      }),
    ).toBe("equivalent");
  });

  it("matches higher-level scaling values", () => {
    expect(
      classification(
        "zwei zusätzliche untote Kreaturen",
        "pro Grad zwei zusätzliche untote Kreaturen",
        "count",
        DE,
      ),
    ).toBe("equivalent");
  });

  it("still reports a missing count", () => {
    expect(
      classification("bis zu vier Kreaturen", "von dir erschaffene Kreaturen", "count", DE),
    ).toBe("mismatch");
    expect(classification("zwei Gegenstände", "ein einzelner Gegenstand", "count", DE)).toBe(
      "mismatch",
    );
  });

  it("does not associate a value with a noun across a capitalized word", () => {
    const tier = compareNumericAtoms("x", "1 weiteres Tier als Ziel", DE);
    expect(
      tier.comparisons.find((comparison) => comparison.category === "count")?.candidate,
    ).toEqual([]);
    const hitPoints = compareNumericAtoms("x", "Bei 0 TP kehrt das Ziel zurück", DE);
    expect(
      hitPoints.comparisons.find((comparison) => comparison.category === "count")?.candidate,
    ).toEqual([]);
  });

  it("leaves a separated value unresolved when the noun appears elsewhere", () => {
    expect(
      classification(
        "zwei Gegenstände, drei Gegenstände",
        "Größe zählt: ≤ mittelgroß = 1, groß = 2, riesig = 3. Ein nichtmagisches Ggstd.",
        "count",
        DE,
      ),
    ).toBe("unresolved");
  });
});

describe("spell metadata scope", () => {
  it("treats a candidate value that restates metadata as whole-spell equivalent", () => {
    expect(
      classification("Die Hand bleibt bestehen.", "Sie bleibt bis zu 1 min bestehen.", "time", {
        ...DE,
        metadata: "Aktion\n36 Meter\nbis zu 1 Minute",
      }),
    ).toBe("equivalent");
    expect(
      classification("Ziele in bis zu 18 Metern.", "Ziele in RWt (3 m) bis 18 m.", "distance", {
        ...DE,
        metadata: "Aktion\n3 Meter\nUnmittelbar",
      }),
    ).toBe("equivalent");
  });

  it("does not treat the same candidate value as equivalent without metadata", () => {
    expect(
      classification("Die Hand bleibt bestehen.", "Sie bleibt bis zu 1 min.", "time", DE),
    ).toBe("mismatch");
  });

  it("never uses metadata to excuse a missing source value", () => {
    expect(
      classification("eine Minute lang", "keine Dauer angegeben", "time", {
        ...DE,
        metadata: "1 Minute",
      }),
    ).toBe("mismatch");
  });

  it("reports a changed value even when metadata holds a third value", () => {
    expect(
      classification("bis zu 18 Metern", "bis zu 30 m", "distance", {
        ...DE,
        metadata: "3 Meter",
      }),
    ).toBe("mismatch");
  });

  it("records which candidate value restated metadata", () => {
    expect(
      categoryNotes("Die Hand bleibt bestehen.", "Sie bleibt bis zu 1 min.", "time", {
        ...DE,
        metadata: "bis zu 1 Minute",
      }).join(" "),
    ).toContain("restates spell metadata");
  });
});

describe("repeated values", () => {
  it("treats fewer repetitions of the same value as unresolved, not as a mismatch", () => {
    expect(
      classification(
        "24 Stunden lang. Für weitere 24 Stunden. Ehe die ersten 24 Stunden ablaufen.",
        "24 h lang; für weitere 24 h.",
        "time",
        DE,
      ),
    ).toBe("unresolved");
  });

  it("keeps a repeated value equivalent and a different value a mismatch", () => {
    expect(classification("1 Minute. 1 Stunde.", "1 min. 1 Stunde.", "time", DE)).toBe(
      "equivalent",
    );
    expect(classification("1 Minute. 1 Stunde.", "1 min. 2 Stunden.", "time", DE)).toBe("mismatch");
    expect(classification("1 Minute. Danach 1 Stunde.", "1 min.", "time", DE)).toBe("mismatch");
  });
});
