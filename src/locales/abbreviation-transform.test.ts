import { describe, expect, it } from "vite-plus/test";
import { transformAbbreviationText, type AbbreviationTextMode } from "./abbreviation-transform.ts";

type Locale = "en" | "de";

function transform(text: string, locale: Locale = "en", mode: AbbreviationTextMode = "markdown") {
  return transformAbbreviationText(text, { locale, mode });
}

function abbreviated(text: string, locale: Locale = "en", mode: AbbreviationTextMode = "markdown") {
  return transform(text, locale, mode).text;
}

describe("abbreviation transformer: required policy terms", () => {
  it("abbreviates standalone action, reaction, and damage terms", () => {
    expect(abbreviated("action")).toBe("A");
    expect(abbreviated("reaction")).toBe("R");
    expect(abbreviated("damage")).toBe("dmg");
    expect(abbreviated("bonus action")).toBe("BA");
  });

  it("abbreviates the localized standalone terms", () => {
    expect(abbreviated("Aktion", "de")).toBe("A");
    expect(abbreviated("Reaktion", "de")).toBe("R");
    expect(abbreviated("Schaden", "de")).toBe("SCH");
    expect(abbreviated("Bonusaktion", "de")).toBe("BA");
  });

  it("keeps longer phrases winning over shorter standalone terms", () => {
    expect(abbreviated("damage resistance")).toBe("RES");
    expect(abbreviated("Schadensresistenz", "de")).toBe("RES");
  });
});

describe("abbreviation transformer: catalog terms", () => {
  it("abbreviates English terms", () => {
    expect(abbreviated("armor class")).toBe("AC");
    expect(abbreviated("temporary hit points")).toBe("temporary HP");
    expect(abbreviated("concentration")).toBe("Conc.");
    expect(abbreviated("until dispelled")).toBe("disp.");
  });

  it("abbreviates German terms", () => {
    expect(abbreviated("Rüstungsklasse", "de")).toBe("RK");
    expect(abbreviated("Konzentration", "de")).toBe("Konz.");
    expect(abbreviated("Bis gebannt", "de")).toBe("bis geb.");
    expect(abbreviated("Berührung", "de")).toBe("Ber.");
  });

  it("matches locale-aware case-insensitively", () => {
    expect(abbreviated("Bonus Action")).toBe("BA");
    expect(abbreviated("BONUS ACTION")).toBe("BA");
    expect(abbreviated("CONCENTRATION")).toBe("Conc.");
    expect(abbreviated("BONUSAKTION", "de")).toBe("BA");
    expect(abbreviated("RÜSTUNGSKLASSE", "de")).toBe("RK");
  });

  it("preserves internal spaces and periods in catalog shorts", () => {
    expect(abbreviated("zum Beispiel", "de")).toBe("z. B.");
    expect(abbreviated("das heißt", "de")).toBe("d. h.");
    expect(abbreviated(abbreviated("zum Beispiel", "de"), "de")).toBe("z. B.");
  });

  it("uses the longest eligible phrase", () => {
    expect(abbreviated("temporary hit points")).toBe("temporary HP");
    expect(abbreviated("damage resistance")).toBe("RES");
  });
});

describe("abbreviation transformer: boundaries and exactness", () => {
  it("rejects matches inside words and hyphenated identifiers", () => {
    expect(abbreviated("unwilling creature")).toBe("unwilling creature");
    expect(abbreviated("creatures")).toBe("creatures");
    expect(abbreviated("12minutes")).toBe("12minutes");
    expect(abbreviated("willing_creature")).toBe("willing_creature");
    expect(abbreviated("creature-type")).toBe("creature-type");
    expect(abbreviated("minimal")).toBe("minimal");
  });

  it("never collapses whitespace or matches a phrase through emphasis", () => {
    expect(abbreviated("bonus  action")).toBe("bonus  action");
    expect(abbreviated("**bonus action**s")).toBe("**bonus action**s");
  });

  it("does not match a phrase across a line break", () => {
    const result = abbreviated("bonus\naction");
    expect(result).toContain("\n");
    expect(result).toBe("bonus\naction");
  });
});

describe("abbreviation transformer: exclusions and no-ops", () => {
  it("leaves English no-op and excluded entries unchanged", () => {
    for (const term of ["spell", "self", "touch", "sight"]) {
      expect(abbreviated(term)).toBe(term);
    }
    for (const term of [
      "round",
      "turn",
      "line",
      "speed",
      "advantage",
      "disadvantage",
      "target",
      "object",
      "objects",
      "bonus",
      "minimum",
      "maximum",
      "example",
      "presumably",
      "compare",
      "possibly",
      "in part",
      "or",
      "between",
    ]) {
      expect(abbreviated(term)).toBe(term);
    }
  });

  it("leaves German no-op and excluded entries unchanged", () => {
    for (const term of ["Selbst", "Sicht"]) {
      expect(abbreviated(term, "de")).toBe(term);
    }
    for (const term of [
      "Runde",
      "Zug",
      "Linie",
      "Vorteil",
      "Nachteil",
      "Ziel",
      "Gegenstand",
      "Gegenstände",
      "Bonus",
      "Minimum",
      "Maximum",
      "vermutlich",
      "vergleiche",
      "oder",
      "zwischen",
      "Durchmesser",
      "Würfel",
    ]) {
      expect(abbreviated(term, "de")).toBe(term);
    }
  });

  it("allows language-specific German forms", () => {
    expect(abbreviated("Bewegungsrate", "de")).toBe("BR");
    expect(abbreviated("Beispiel", "de")).toBe("Bsp.");
    expect(abbreviated("eventuell", "de")).toBe("evtl.");
    expect(abbreviated("zum Teil", "de")).toBe("z. T.");
    expect(abbreviated("sogenannt", "de")).toBe("sog.");
    expect(abbreviated("Zauber", "de")).toBe("Z.");
  });

  it("still applies longer eligible phrases containing excluded words", () => {
    expect(abbreviated("until the end of the next turn")).toBe("EONT");
    expect(abbreviated("point within range")).toBe("point within RNG");
    expect(abbreviated("bonus action")).toBe("BA");
  });
});

describe("abbreviation transformer: result contract", () => {
  it("is idempotent", () => {
    const text = "A willing creature takes damage resistance from a bonus action until dispelled.";
    const once = abbreviated(text);
    expect(abbreviated(once)).toBe(once);
  });

  it("counts each applied catalog entry once with its occurrence count", () => {
    const result = transform("bonus action and damage resistance and bonus action");
    expect(result.changed).toBe(true);
    const bonus = result.applied.find((entry) => entry.id === "bonusAction");
    expect(bonus).toMatchObject({ full: "bonus action", short: "BA", count: 2 });
    const resistance = result.applied.find((entry) => entry.id === "damageResistance");
    expect(resistance).toMatchObject({ full: "damage resistance", short: "RES", count: 1 });
  });

  it("reports excluded matches but not terms covered by an applied longer match", () => {
    const result = transform("round and action");
    expect(result.text).toBe("round and A");
    expect(result.skipped.map((entry) => entry.id)).toEqual(["round"]);
    expect(result.applied.map((entry) => entry.id)).toEqual(["action"]);

    const phrase = transform("bonus action");
    expect(phrase.applied.map((entry) => entry.id)).toEqual(["bonusAction"]);
    expect(phrase.skipped).toEqual([]);
  });

  it("returns unchanged text for an unsupported locale", () => {
    const result = transformAbbreviationText("bonus action", { locale: "fr", mode: "markdown" });
    expect(result).toEqual({ text: "bonus action", applied: [], skipped: [], changed: false });
  });
});

describe("abbreviation transformer: Markdown structures", () => {
  it("transforms prose inside emphasis and block structures", () => {
    expect(abbreviated("**bonus action**")).toBe("**BA**");
    expect(abbreviated("*bonus action*")).toBe("*BA*");
    expect(abbreviated("# bonus action")).toBe("# BA");
    expect(abbreviated("> bonus action")).toBe("> BA");
    expect(abbreviated("- bonus action")).toBe("- BA");
    expect(abbreviated("1. bonus action")).toBe("1. BA");
    expect(abbreviated("| bonus action |")).toBe("| BA |");
  });

  it("preserves inline code, fenced code, and HTML attributes", () => {
    expect(abbreviated("`bonus action`")).toBe("`bonus action`");
    expect(abbreviated("```\nbonus action\n```")).toBe("```\nbonus action\n```");
    expect(abbreviated('<span title="bonus action">bonus action</span>')).toBe(
      '<span title="bonus action">BA</span>',
    );
  });

  it("preserves escapes, entities, and images", () => {
    expect(abbreviated("\\*bonus action\\*")).toBe("\\*BA\\*");
    expect(abbreviated("&amp; bonus action")).toBe("&amp; BA");
    expect(abbreviated("![bonus action](https://example.com)")).toBe(
      "![bonus action](https://example.com)",
    );
  });
});

describe("abbreviation transformer: links and URLs", () => {
  it("transforms link display text without changing destinations or titles", () => {
    expect(abbreviated("[bonus action](https://example.com)")).toBe("[BA](https://example.com)");
    expect(abbreviated('[bonus action](https://example.com "bonus action")')).toBe(
      '[BA](https://example.com "bonus action")',
    );
    expect(abbreviated("[bonus action][ref]")).toBe("[BA][ref]");
    expect(abbreviated("[bonus action](https://example.com/a_(nested))")).toBe(
      "[BA](https://example.com/a_(nested))",
    );
    expect(abbreviated("[bonus action](<https://example.com/bonus action>)")).toBe(
      "[BA](<https://example.com/bonus action>)",
    );
    expect(abbreviated('[ref]: https://example.com "bonus action"')).toBe(
      '[ref]: https://example.com "bonus action"',
    );
  });

  it("preserves collapsed, shortcut, autolink, and bare URL forms", () => {
    expect(abbreviated("[bonus action][]")).toBe("[bonus action][]");
    expect(abbreviated("[bonus action]")).toBe("[bonus action]");
    expect(
      abbreviated("[https://example.com/bonus-action](https://example.com/bonus-action)"),
    ).toBe("[https://example.com/bonus-action](https://example.com/bonus-action)");
    expect(abbreviated("<https://example.com/bonus-action>")).toBe(
      "<https://example.com/bonus-action>",
    );
    expect(abbreviated("https://example.com/bonus-action")).toBe(
      "https://example.com/bonus-action",
    );
  });
});

describe("abbreviation transformer: carets, lines, and units", () => {
  it("preserves carets and newlines", () => {
    expect(abbreviated("bonus action ^")).toBe("BA ^");
    expect(abbreviated("bonus action\nwilling creature")).toBe("BA\nwilling creature");
  });

  it("abbreviates explicit plural unit entries", () => {
    expect(abbreviated("10 minutes")).toBe("10 min");
    expect(abbreviated("2 hours")).toBe("2 h");
    expect(abbreviated("30 meters")).toBe("30 mtr");
    expect(abbreviated("30 feet")).toBe("30 ft");
    expect(abbreviated("10 Minuten", "de")).toBe("10 min");
    expect(abbreviated("2 Stunden", "de")).toBe("2 h");
    expect(abbreviated("30 Meter", "de")).toBe("30 m");
  });
});

describe("abbreviation transformer: plain mode", () => {
  it("protects URLs and email addresses only", () => {
    expect(
      abbreviated("Use a bonus action to open https://example.com/bonus-action", "en", "plain"),
    ).toBe("Use a BA to open https://example.com/bonus-action");
    expect(abbreviated("Write to bonus@example.com about a bonus action", "en", "plain")).toBe(
      "Write to bonus@example.com about a BA",
    );
  });
});
