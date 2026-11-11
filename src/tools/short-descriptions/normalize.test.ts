import { describe, expect, it } from "vite-plus/test";
import { compareNumericAtoms, parseNumberToken } from "./normalize.ts";

function classification(source: string, candidate: string, category: string): string | undefined {
  return compareNumericAtoms(source, candidate).comparisons.find(
    (comparison) => comparison.category === category,
  )?.classification;
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
