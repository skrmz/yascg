import { describe, expect, it } from "vite-plus/test";
import { classifyOutcome, runDeterministicChecks, worstSeverity } from "./checks.ts";
import { HIGHER_LEVELS, LONG_DESCRIPTION } from "./test-helpers.ts";
import type { Judgement } from "./openrouter.ts";

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
