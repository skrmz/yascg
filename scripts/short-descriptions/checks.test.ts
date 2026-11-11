import { describe, expect, it } from "vite-plus/test";
import { classifyOutcome, runDeterministicChecks, worstSeverity } from "./checks.ts";
import { HIGHER_LEVELS, LONG_DESCRIPTION } from "./test-helpers.ts";
import type { Judgement } from "./openrouter.ts";
import type { SourceText } from "./files.ts";

const SOURCE = { description: LONG_DESCRIPTION, higherLevels: HIGHER_LEVELS };

const GOOD_TEXT = {
  description:
    "A streak flashes from your finger to a point in range and explodes into flame. Each creature in a 20-foot-radius sphere centered there makes a Dexterity saving throw, taking 8d6 fire damage on a failure or half as much damage on a success.",
  higherLevels: "The damage increases by 1d6 per slot level above 3rd.",
};

describe("deterministic checks", () => {
  it("accepts a mechanically faithful short text", () => {
    const result = runDeterministicChecks(SOURCE, GOOD_TEXT, "en");
    expect(result.invalid).toBe(false);
    expect(result.findings.filter((finding) => finding.severity === "high")).toEqual([]);
    expect(result.unresolvedItems).toEqual([]);
  });

  it("flags changed dice and quantities as high severity", () => {
    const dice = runDeterministicChecks(
      SOURCE,
      { ...GOOD_TEXT, description: GOOD_TEXT.description.replace("8d6", "8d8") },
      "en",
    );
    expect(
      dice.findings.some((finding) => finding.category === "dice" && finding.severity === "high"),
    ).toBe(true);

    const radius = runDeterministicChecks(
      SOURCE,
      { ...GOOD_TEXT, description: GOOD_TEXT.description.replace("20-foot", "30-foot") },
      "en",
    );
    expect(
      radius.findings.some(
        (finding) => finding.category === "quantity" && finding.severity === "high",
      ),
    ).toBe(true);
  });

  it("records unresolved numeric items for explicit review", () => {
    const source = { description: ["Creatures within 1 mile feel it."] };
    const result = runDeterministicChecks(
      source,
      { description: "Creatures within 1 Meile feel it." },
      "en",
    );
    expect(result.findings.some((finding) => finding.severity === "high")).toBe(false);
    expect(result.unresolvedItems).toHaveLength(1);
  });

  it("rejects unsafe Markdown as invalid", () => {
    const result = runDeterministicChecks(
      SOURCE,
      { description: "Deals <script>alert(1)</script> fire damage." },
      "en",
    );
    expect(result.invalid).toBe(true);
    expect(result.findings[0]?.category).toBe("markdown");
  });

  it("flags dropped rules vocabulary at medium severity", () => {
    const result = runDeterministicChecks(
      SOURCE,
      { description: "A streak of fire explodes in a sphere." },
      "en",
    );
    expect(
      result.findings.some(
        (finding) => finding.category === "vocabulary" && finding.severity === "medium",
      ),
    ).toBe(true);
  });

  it("accepts established abbreviations for rules vocabulary", () => {
    const result = runDeterministicChecks(
      SOURCE,
      {
        description:
          "Creatures in a 20 ft sphere make a DEX save, taking 8d6 fire dmg or ½ dmg on a success.",
        higherLevels: "+1d6 dmg per slot above 3rd.",
      },
      "en",
    );
    expect(result.findings.filter((finding) => finding.category === "vocabulary")).toEqual([]);
  });

  it("detects missing, invented, and duplicated higher-level rules", () => {
    const missing = runDeterministicChecks(SOURCE, { description: GOOD_TEXT.description }, "en");
    expect(
      missing.findings.some(
        (finding) => finding.category === "higher-levels" && finding.severity === "medium",
      ),
    ).toBe(true);

    const invented = runDeterministicChecks(
      { description: LONG_DESCRIPTION },
      { description: GOOD_TEXT.description, higherLevels: "Adds 1d6." },
      "en",
    );
    expect(
      invented.findings.some(
        (finding) => finding.category === "higher-levels" && finding.severity === "high",
      ),
    ).toBe(true);

    const duplicated = runDeterministicChecks(
      SOURCE,
      {
        description: `${GOOD_TEXT.description} The damage increases by 1d6 per slot level above 3rd.`,
        higherLevels: "The damage increases by 1d6 per slot level above 3rd.",
      },
      "en",
    );
    expect(
      duplicated.findings.some(
        (finding) => finding.category === "scaling" && finding.severity === "medium",
      ),
    ).toBe(true);
  });

  it("ranks severities", () => {
    expect(worstSeverity([])).toBe("low");
    expect(
      worstSeverity([
        { category: "length", severity: "low", evidence: "", recommendedAction: "" },
        { category: "dice", severity: "high", evidence: "", recommendedAction: "" },
        { category: "vocabulary", severity: "medium", evidence: "", recommendedAction: "" },
      ]),
    ).toBe("high");
  });
});

const DE_HAND: SourceText = {
  description: ["Die Hand bleibt für die Wirkungsdauer bestehen."],
  castingTime: "Aktion",
  range: "36 Meter",
  duration: "bis zu 1 Minute",
};

function highFindings(result: ReturnType<typeof runDeterministicChecks>) {
  return result.findings.filter((finding) => finding.severity === "high");
}

describe("deterministic validation accuracy", () => {
  it("accepts a candidate that restates the spell metadata duration", () => {
    const result = runDeterministicChecks(
      DE_HAND,
      { description: "Die Hand bleibt bis zu 1 min bestehen." },
      "de",
    );
    expect(highFindings(result)).toEqual([]);
    expect(result.unresolvedItems).toEqual([]);
  });

  it("accepts a candidate that restates the spell metadata range next to a description range", () => {
    const source: SourceText = {
      description: ["Du kannst Ziele in bis zu 18 Metern befehligen."],
      range: "3 Meter",
    };
    const result = runDeterministicChecks(
      source,
      { description: "Befehle Ziele in RWt (3 m) bis 18 m." },
      "de",
    );
    expect(highFindings(result)).toEqual([]);
  });

  it("keeps a changed numeric value high severity", () => {
    const source: SourceText = {
      description: ["Ziele in bis zu 18 Metern."],
      range: "3 Meter",
    };
    const result = runDeterministicChecks(source, { description: "Ziele in bis zu 30 m." }, "de");
    expect(highFindings(result).some((finding) => finding.category === "quantity")).toBe(true);
  });

  it("keeps a missing time limit high severity", () => {
    const result = runDeterministicChecks(
      { description: ["Das Ziel ist eine Stunde lang betäubt."] },
      { description: "Das Ziel ist betäubt." },
      "de",
    );
    expect(highFindings(result).some((finding) => finding.category === "quantity")).toBe(true);
  });

  it("keeps a missing creature count high severity", () => {
    const result = runDeterministicChecks(
      { description: ["Du erschaffst bis zu vier Kreaturen."] },
      { description: "Du erschaffst Kreaturen." },
      "de",
    );
    expect(highFindings(result).some((finding) => finding.category === "quantity")).toBe(true);
  });

  it("reports repeated values as unresolved instead of a confirmed mismatch", () => {
    const result = runDeterministicChecks(
      {
        description: [
          "Die Kreatur steht 24 Stunden lang unter deiner Kontrolle. Um für weitere 24 Stunden die Kontrolle zu behalten, musst du den Zauber vor Ablauf der ersten 24 Stunden erneut wirken.",
        ],
      },
      {
        description:
          "Die Kreatur steht 24 h unter deiner Kontrolle; für weitere 24 h erneut wirken.",
      },
      "de",
    );
    expect(highFindings(result)).toEqual([]);
    expect(result.unresolvedItems.some((item) => item.includes("time"))).toBe(true);
  });

  it("recognizes German time abbreviations", () => {
    const result = runDeterministicChecks(
      { description: ["Der Alarm ertönt zehn Sekunden lang."] },
      { description: "Der Alarm ertönt 10 Sek. lang." },
      "de",
    );
    expect(highFindings(result)).toEqual([]);
  });

  it("accepts German compound and English inflected rules vocabulary", () => {
    const compound = runDeterministicChecks(
      { description: ["Bewegung nur zur Vermeidung von Schaden."] },
      { description: "Bewegung nur zur Schadensvermeidung." },
      "de",
    );
    expect(compound.findings.filter((finding) => finding.category === "vocabulary")).toEqual([]);

    const inflected = runDeterministicChecks(
      { description: ["A target takes 8d6 damage."] },
      { description: "A target is damaged for 8d6." },
      "en",
    );
    expect(inflected.findings.filter((finding) => finding.category === "vocabulary")).toEqual([]);
  });

  it("explains relocated higher-level values without lowering severity", () => {
    const source: SourceText = {
      description: [
        "Das Ziel erleidet 1W6 Schaden. Auf höheren Graden steigt der Schaden auf 2W6.",
      ],
    };
    const result = runDeterministicChecks(
      source,
      {
        description: "Das Ziel erleidet 1W6 Schaden.",
        higherLevels: "Der Schaden steigt auf 2W6.",
      },
      "de",
    );
    const finding = result.findings.find((entry) => entry.category === "higher-levels");
    expect(finding?.severity).toBe("high");
    expect(finding?.evidence).toContain("also occurs in the source description");
  });

  it("explains metadata restatement and repetition in unresolved diagnostics", () => {
    const result = runDeterministicChecks(
      { description: ["24 Stunden lang. Weitere 24 Stunden."], duration: "bis zu 1 Minute" },
      { description: "24 h lang; sie bleibt bis zu 1 min." },
      "de",
    );
    const evidence = result.unresolvedItems.join(" ");
    expect(evidence).toContain("restates spell metadata");
    expect(evidence).toContain("different number of times");
  });
});

const EQUIVALENT: Judgement = {
  spellId: "srd-fireball",
  mechanicallyEquivalent: true,
  severity: "none",
  findings: [],
};

describe("acceptance classification", () => {
  it("accepts with no findings and an equivalent judgement", () => {
    const classification = classifyOutcome({
      findings: [],
      unresolvedItems: [],
      judgement: EQUIVALENT,
    });
    expect(classification.status).toBe("accepted");
  });

  it("withholds on any high deterministic finding, regardless of the judgement", () => {
    const classification = classifyOutcome({
      findings: [
        { category: "dice", severity: "high", evidence: "8d6 vs 8d8", recommendedAction: "" },
      ],
      unresolvedItems: [],
      judgement: EQUIVALENT,
    });
    expect(classification.status).toBe("withheld");
  });

  it("withholds when the semantic comparison is not equivalent", () => {
    const classification = classifyOutcome({
      findings: [],
      unresolvedItems: [],
      judgement: { ...EQUIVALENT, mechanicallyEquivalent: false },
    });
    expect(classification.status).toBe("withheld");
  });

  it("withholds medium semantic findings and honours unresolved review", () => {
    const medium = classifyOutcome({
      findings: [],
      unresolvedItems: [],
      judgement: {
        ...EQUIVALENT,
        findings: [
          {
            category: "range",
            severity: "medium",
            sourceEvidence: "",
            candidateEvidence: "",
            explanation: "Range unclear.",
          },
        ],
      },
    });
    expect(medium.status).toBe("withheld");

    const unreviewed = classifyOutcome({
      findings: [],
      unresolvedItems: ["1 mile"],
      judgement: null,
    });
    expect(unreviewed.status).toBe("withheld");

    const reviewed = classifyOutcome({
      findings: [],
      unresolvedItems: ["1 mile"],
      judgement: EQUIVALENT,
    });
    expect(reviewed.status).toBe("accepted");
  });
});
