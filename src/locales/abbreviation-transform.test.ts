import { describe, expect, it } from "vite-plus/test";
import type { AbbreviationEntry, AbbreviationId } from "./abbreviations.ts";
import {
  createLocaleMatcher,
  transformAbbreviationText,
  type AbbreviationTextMode,
} from "./abbreviation-transform.ts";

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
  it("leaves English excluded and locale-specific terms unchanged", () => {
    for (const term of ["turn", "speed", "presumably", "possibly", "in part"]) {
      expect(abbreviated(term)).toBe(term);
    }
    for (const term of ["spell", "self", "touch", "sight"]) {
      expect(abbreviated(term)).toBe(term);
    }
  });

  it("abbreviates formerly excluded rounds", () => {
    expect(abbreviated("round")).toBe("rnd.");
    expect(abbreviated("Round")).toBe("rnd.");
    expect(abbreviated("Runde", "de")).toBe("Rnd.");
  });

  it("leaves German no-op and excluded entries unchanged", () => {
    for (const term of ["Ziel", "Selbst", "Sicht"]) {
      expect(abbreviated(term, "de")).toBe(term);
    }
    for (const term of ["Zug", "vermutlich", "oder", "Durchmesser", "Würfel"]) {
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
    expect(abbreviated("point within range")).toBe("pt. within rng.");
    expect(abbreviated("bonus action")).toBe("BA");
  });
});

describe("abbreviation transformer: configured inflections", () => {
  it("abbreviates every configured German adjective form", () => {
    for (const form of [
      "psychisch",
      "psychische",
      "psychischer",
      "psychisches",
      "psychischem",
      "psychischen",
    ]) {
      expect(abbreviated(form, "de")).toBe("psych.");
    }
    expect(abbreviated("PSYCHISCHER", "de")).toBe("psych.");
    expect(abbreviated("Psychisches", "de")).toBe("psych.");
  });

  it("abbreviates every configured German noun form", () => {
    expect(abbreviated("Meter", "de")).toBe("m");
    expect(abbreviated("Meters", "de")).toBe("m");
    expect(abbreviated("Metern", "de")).toBe("m");
    expect(abbreviated("Minute", "de")).toBe("min");
    expect(abbreviated("Minuten", "de")).toBe("min");
    expect(abbreviated("Stunde", "de")).toBe("h");
    expect(abbreviated("Stunden", "de")).toBe("h");
    expect(abbreviated("Gegenstand", "de")).toBe("Ggst.");
    expect(abbreviated("Gegenstände", "de")).toBe("Ggstd.");
    expect(abbreviated("Gegenständen", "de")).toBe("Ggstd.");
  });

  it("does not infer unconfigured inflections or embedded substrings", () => {
    for (const term of ["psychischste", "MeterX", "Gegenständlichkeit", "Metermaß"]) {
      expect(abbreviated(term, "de")).toBe(term);
    }
  });

  it("does not leak locale-specific definitions across locales", () => {
    expect(abbreviated("spell")).toBe("spell");
    expect(abbreviated("Zauber", "de")).toBe("Z.");
    expect(abbreviated("target")).toBe("tgt.");
    expect(abbreviated("Ziel", "de")).toBe("Ziel");
  });

  it("keeps longest-match precedence across generated forms", () => {
    expect(abbreviated("Psychischer Schaden", "de")).toBe("PSY");
    expect(abbreviated("psychischer Schaden", "de")).toBe("PSY");
  });

  it("aggregates generated variants under the base definition", () => {
    const result = transform("Meter, Meters und Metern", "de");
    expect(result.text).toBe("m, m und m");
    expect(result.applied).toEqual([{ id: "meter", full: "Meter", short: "m", count: 3 }]);
  });

  it("preserves generated forms inside protected Markdown ranges", () => {
    expect(abbreviated("`Meters` and Meters", "de")).toBe("`Meters` and m");
  });

  it("is idempotent with generated forms", () => {
    const text = "Meters und psychische Gegenstände";
    const once = abbreviated(text, "de");
    expect(once).toBe("m und psych. Ggstd.");
    expect(abbreviated(once, "de")).toBe(once);
  });

  it("applies exclusions to every form of an excluded definition", () => {
    const entries: AbbreviationEntry[] = [
      { id: "turn", full: "turn", short: "TURN", forms: ["turn", "turns"] },
    ];
    const matcher = createLocaleMatcher(entries, "en");
    expect(matcher.eligible).toEqual([]);
    expect(matcher.excluded.map((candidate) => candidate.surface).sort()).toEqual([
      "turn",
      "turns",
    ]);
  });

  it("rejects conflicting generated variants during matcher construction", () => {
    const entries: AbbreviationEntry[] = [
      { id: "syntheticA" as AbbreviationId, full: "term", short: "A", forms: ["term"] },
      { id: "syntheticB" as AbbreviationId, full: "term", short: "B", forms: ["term"] },
    ];
    expect(() => createLocaleMatcher(entries, "en")).toThrow(/Ambiguous abbreviation surfaces/);
  });
});

describe("abbreviation transformer: newly eligible prose terms", () => {
  it("abbreviates every English policy term as a standalone word", () => {
    expect(abbreviated("between")).toBe("b/w");
    expect(abbreviated("advantage")).toBe("adv.");
    expect(abbreviated("disadvantage")).toBe("disadv.");
    expect(abbreviated("object")).toBe("obj.");
    expect(abbreviated("objects")).toBe("obj.");
    expect(abbreviated("target")).toBe("tgt.");
    expect(abbreviated("minimum")).toBe("min.");
    expect(abbreviated("maximum")).toBe("max.");
    expect(abbreviated("example")).toBe("ex.");
    expect(abbreviated("compare")).toBe("cf.");
    expect(abbreviated("including")).toBe("incl.");
    expect(abbreviated("condition")).toBe("cond.");
    expect(abbreviated("against")).toBe("vs.");
    expect(abbreviated("obviously")).toBe("obv.");
    expect(abbreviated("obvious")).toBe("obv.");
    expect(abbreviated("range")).toBe("rng.");
    expect(abbreviated("duration")).toBe("dur.");
    expect(abbreviated("spell slot")).toBe("slot");
    expect(abbreviated("point")).toBe("pt.");
    expect(abbreviated("physical")).toBe("phys.");
    expect(abbreviated("following")).toBe("foll.");
    expect(abbreviated("option")).toBe("opt.");
    expect(abbreviated("illusory")).toBe("illus.");
    expect(abbreviated("at least")).toBe("≥");
    expect(abbreviated("strength check")).toBe("STR check");
    expect(abbreviated("strength saving throw")).toBe("STR save");
    expect(abbreviated("dexterity saving throw")).toBe("DEX save");
    expect(abbreviated("constitution saving throw")).toBe("CON save");
    expect(abbreviated("intelligence saving throw")).toBe("INT save");
    expect(abbreviated("wisdom saving throw")).toBe("WIS save");
    expect(abbreviated("charisma saving throw")).toBe("CHA save");
  });

  it("abbreviates every German policy term as a standalone word", () => {
    expect(abbreviated("zwischen", "de")).toBe("zw.");
    expect(abbreviated("Vorteil", "de")).toBe("VT");
    expect(abbreviated("Nachteil", "de")).toBe("NT");
    expect(abbreviated("Gegenstand", "de")).toBe("Ggst.");
    expect(abbreviated("Gegenstände", "de")).toBe("Ggstd.");
    expect(abbreviated("Gegenständen", "de")).toBe("Ggstd.");
    expect(abbreviated("Minimum", "de")).toBe("Min.");
    expect(abbreviated("Maximum", "de")).toBe("Max.");
    expect(abbreviated("Beispiel", "de")).toBe("Bsp.");
    expect(abbreviated("vergleiche", "de")).toBe("vgl.");
    expect(abbreviated("addieren", "de")).toBe("add.");
    expect(abbreviated("Punkt", "de")).toBe("Pkt.");
    expect(abbreviated("für", "de")).toBe("f.");
    expect(abbreviated("mindestens", "de")).toBe("mind.");
    expect(abbreviated("physisch", "de")).toBe("phys.");
    expect(abbreviated("folgenden", "de")).toBe("folg.");
    expect(abbreviated("Option", "de")).toBe("Opt.");
    expect(abbreviated("Zauberwirken-Attributsmodifikator", "de")).toBe("Zauberwirken-Attr.mod.");
    expect(abbreviated("illusionär", "de")).toBe("illus.");
    expect(abbreviated("gegen", "de")).toBe("gg.");
    expect(abbreviated("innerhalb", "de")).toBe("innerh.");
    expect(abbreviated("Stärkewurf", "de")).toBe("ST-Wurf");
    expect(abbreviated("Stärkerettungswurf", "de")).toBe("ST-RW");
    expect(abbreviated("Geschicklichkeitsrettungswurf", "de")).toBe("GE-RW");
    expect(abbreviated("Konstitutionsrettungswurf", "de")).toBe("KO-RW");
    expect(abbreviated("Intelligenzrettungswurf", "de")).toBe("IN-RW");
    expect(abbreviated("Weisheitsrettungswurf", "de")).toBe("WE-RW");
    expect(abbreviated("Charismarettungswurf", "de")).toBe("CH-RW");
  });

  it("abbreviates the terms inside representative spell prose", () => {
    expect(
      abbreviated(
        "A target between two objects has advantage and disadvantage; the minimum and maximum apply, compare this example carefully.",
      ),
    ).toBe(
      "A tgt. b/w 2 obj. has adv. and disadv.; the min. and max. apply, cf. this ex. carefully.",
    );
    expect(
      abbreviated(
        "Zwei Gegenstände liegen zwischen dem Ziel; Vorteil und Nachteil, Minimum und Maximum, vergleiche das Beispiel sorgfältig.",
        "de",
      ),
    ).toBe("2 Ggstd. liegen zw. dem Ziel; VT und NT, Min. und Max., vgl. das Bsp. sorgfältig.");
  });

  it("matches case-insensitively", () => {
    expect(abbreviated("ADVANTAGE and Disadvantage")).toBe("adv. and disadv.");
    expect(abbreviated("VORTEIL und nachteil", "de")).toBe("VT und NT");
    expect(abbreviated("PHYSICAL and Illusory")).toBe("phys. and illus.");
    expect(abbreviated("gegen und innerhalb", "de")).toBe("gg. und innerh.");
  });

  it("keeps longer phrases and related entries winning", () => {
    expect(abbreviated("for example")).toBe("e.g.");
    expect(abbreviated("bonus action")).toBe("BA");
    expect(abbreviated("damage resistance")).toBe("RES");
    expect(abbreviated("objects")).toBe("obj.");
    expect(abbreviated("zum Beispiel", "de")).toBe("z. B.");
    expect(abbreviated("Bonusaktion", "de")).toBe("BA");
  });

  it("does not replace word fragments or infer inflections", () => {
    expect(abbreviated("targeted and objection")).toBe("targeted and objection");
    expect(abbreviated("advantages and minimums")).toBe("advantages and minimums");
    expect(abbreviated("compared and betweenness")).toBe("compared and betweenness");
    expect(abbreviated("zielen und Vorteile", "de")).toBe("zielen und Vorteile");
    expect(abbreviated("Gegenständen und vergleichen", "de")).toBe("Ggstd. und vergleichen");
  });

  it("is idempotent for the newly eligible terms", () => {
    const text = "advantage before a target between objects and example compare minimum maximum";
    const once = abbreviated(text);
    expect(abbreviated(once)).toBe(once);
  });
});

describe("abbreviation transformer: written numbers", () => {
  it("abbreviates standalone English numbers", () => {
    for (const [full, short] of [
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
    ] as const) {
      expect(abbreviated(full)).toBe(short);
    }
  });

  it("abbreviates standalone German numbers", () => {
    for (const [full, short] of [
      ["null", "0"],
      ["eins", "1"],
      ["zwei", "2"],
      ["drei", "3"],
      ["vier", "4"],
      ["fünf", "5"],
      ["sechs", "6"],
      ["sieben", "7"],
      ["acht", "8"],
      ["neun", "9"],
      ["zehn", "10"],
      ["hundert", "100"],
    ] as const) {
      expect(abbreviated(full, "de")).toBe(short);
    }
  });

  it("matches number words case-insensitively", () => {
    expect(abbreviated("One and TEN")).toBe("1 and 10");
    expect(abbreviated("EINS und ZEHN", "de")).toBe("1 und 10");
  });

  it("does not replace embedded, hyphenated, or compound numbers", () => {
    for (const term of [
      "often",
      "someone",
      "one-handed",
      "twenty-one",
      "three-quarters",
      "tenfold",
    ]) {
      expect(abbreviated(term)).toBe(term);
    }
    for (const term of ["einschließlich", "zehnseitiger", "Hundertschaft"]) {
      expect(abbreviated(term, "de")).toBe(term);
    }
  });

  it("keeps longer catalog phrases winning over number words", () => {
    expect(abbreviated("three-quarters cover")).toBe("TQC");
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
    const result = transform("turn and action");
    expect(result.text).toBe("turn and A");
    expect(result.skipped.map((entry) => entry.id)).toEqual(["turn"]);
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
    expect(abbreviated("30 Meters", "de")).toBe("30 m");
    expect(abbreviated("30 Metern", "de")).toBe("30 m");
  });
});

describe("abbreviation transformer: up-to quantities", () => {
  it("abbreviates numeric quantities and compacts time units", () => {
    expect(abbreviated("up to 1 hour")).toBe("≤ 1h");
    expect(abbreviated("up to 10 minutes")).toBe("≤ 10min");
    expect(abbreviated("up to 3 days")).toBe("≤ 3d");
    expect(abbreviated("Up to 1 Day")).toBe("≤ 1d");
  });

  it("keeps spacing for non-time units and nouns", () => {
    expect(abbreviated("up to 30 feet")).toBe("≤ 30 ft");
    expect(abbreviated("up to 2 meters")).toBe("≤ 2 mtr");
    expect(abbreviated("up to 3 creatures")).toBe("≤ 3 creatures");
  });

  it("requires a numeric quantity", () => {
    expect(abbreviated("up to the DM's discretion")).toBe("up to the DM's discretion");
    expect(abbreviated("up to a few hours")).toBe("up to a few h");
    expect(abbreviated("up to 1st level")).toBe("up to 1st level");
  });

  it("accepts written number words as quantities", () => {
    expect(abbreviated("up to one hour")).toBe("≤ 1h");
    expect(abbreviated("up to ten minutes")).toBe("≤ 10min");
    expect(abbreviated("up to hundred days")).toBe("≤ 100d");
    expect(abbreviated("bis zu zwei Stunden", "de")).toBe("≤ 2h");
    expect(abbreviated("bis zu zehn Minuten", "de")).toBe("≤ 10min");
    expect(abbreviated("bis zu drei Tage", "de")).toBe("≤ 3t");
  });

  it("abbreviates German bis-zu quantities", () => {
    expect(abbreviated("bis zu 1 Stunde", "de")).toBe("≤ 1h");
    expect(abbreviated("bis zu 10 Minuten", "de")).toBe("≤ 10min");
    expect(abbreviated("bis zu 1 Tag", "de")).toBe("≤ 1t");
    expect(abbreviated("bis zu 3 Tage", "de")).toBe("≤ 3t");
    expect(abbreviated("Bis zu 1 Tag", "de")).toBe("≤ 1t");
  });

  it("keeps non-time German units and non-numeric phrases spaced", () => {
    expect(abbreviated("bis zu 30 Meter", "de")).toBe("≤ 30 m");
    expect(abbreviated("bis zu 3 Kreaturen", "de")).toBe("≤ 3 Kreaturen");
    expect(abbreviated("bis zur Entscheidung des SL", "de")).toBe("bis zur Entscheidung des SL");
  });

  it("counts the prefix and compacted unit as applied terms", () => {
    const result = transform("up to 1 hour");
    expect(result.text).toBe("≤ 1h");
    expect(result.applied.find((entry) => entry.id === "upTo")).toMatchObject({ count: 1 });
    expect(result.applied.find((entry) => entry.id === "hour")).toMatchObject({ count: 1 });
  });

  it("counts the written number entry as an applied term", () => {
    const result = transform("up to one hour");
    expect(result.text).toBe("≤ 1h");
    expect(result.applied.find((entry) => entry.id === "upTo")).toMatchObject({ count: 1 });
    expect(result.applied.find((entry) => entry.id === "one")).toMatchObject({
      full: "one",
      short: "1",
      count: 1,
    });
    expect(result.applied.find((entry) => entry.id === "hour")).toMatchObject({ count: 1 });
  });

  it("preserves Markdown protections around quantities", () => {
    expect(abbreviated("`up to 1 hour`")).toBe("`up to 1 hour`");
    expect(abbreviated("up to **1 hour**")).toBe("up to **1 h**");
    expect(abbreviated("up to 1 *hour*")).toBe("≤ 1 *h*");
    expect(abbreviated("[up to 1 hour](https://example.com)")).toBe("[≤ 1h](https://example.com)");
  });

  it("is idempotent", () => {
    const once = abbreviated("up to 1 hour and up to 30 feet");
    expect(once).toBe("≤ 1h and ≤ 30 ft");
    expect(abbreviated(once)).toBe(once);
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
