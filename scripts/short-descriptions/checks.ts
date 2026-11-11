import type { AuthoringStatus } from "../../src/tools/short-descriptions/authoring-schema.ts";
import { checkMarkdownSafety } from "../../src/tools/short-descriptions/markdown-safety.ts";
import {
  isMateriallyShorter,
  joinField,
} from "../../src/tools/short-descriptions/material-shortening.ts";
import {
  compareNumericAtoms,
  type CategoryComparison,
} from "../../src/tools/short-descriptions/normalize.ts";
import { abbreviationCatalog } from "../../src/locales/abbreviations.ts";
import type { SourceText } from "./files.ts";
import type { Judgement } from "./openrouter.ts";

/**
 * Deterministic check orchestrator and acceptance classifier. Checks are ranked
 * by potential mechanical impact and never by model confidence. Only confirmed
 * mismatches, unsafe structures, and judge-reported medium/high findings block
 * automatic acceptance.
 */

export type Severity = "low" | "medium" | "high";

export type CheckCategory =
  | "structural"
  | "markdown"
  | "dice"
  | "quantity"
  | "vocabulary"
  | "scaling"
  | "higher-levels"
  | "length"
  | "provenance"
  | "semantic";

export interface CheckFinding {
  category: CheckCategory;
  severity: Severity;
  evidence: string;
  recommendedAction: string;
}

export interface CandidateText {
  description: string;
  higherLevels?: string;
}

export interface DeterministicCheckResult {
  findings: CheckFinding[];
  /** Items the semantic comparison must review explicitly. */
  unresolvedItems: string[];
  /** True when the candidate must not be written at all (schema or Markdown). */
  invalid: boolean;
}

const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

const RULES_TERMS: Record<string, readonly string[]> = {
  en: [
    "damage",
    "saving throw",
    "hit points",
    "advantage",
    "disadvantage",
    "concentration",
    "bonus action",
    "reaction",
  ],
  de: [
    "Schaden",
    "Rettungswurf",
    "Trefferpunkte",
    "Vorteil",
    "Nachteil",
    "Konzentration",
    "Bonusaktion",
    "Reaktion",
  ],
};

function normalise(value: string): string {
  return value.toLocaleLowerCase("en").normalize("NFC");
}

/**
 * Rules-term matching accepts established catalog abbreviations and ordinary
 * inflection. German compounds carry the rules term as a prefix
 * ("Schadensvermeidung"), so a trailing word is part of the same term there.
 */
function termPattern(term: string, locale: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (locale === "de") {
    return new RegExp(`(?<![\\p{L}])${escaped}[\\p{L}]*(?![\\p{L}])`, "iu");
  }
  // English drops a final "e" before -ed/-ing ("damage" -> "damaged").
  const stem = escaped.endsWith("e") ? escaped.slice(0, -1) : escaped;
  const suffix = escaped.endsWith("e") ? "(?:e|es|ed|ing|s)?" : "(?:s|es|ed|ing)?";
  return new RegExp(`(?<![\\p{L}])${stem}${suffix}(?![\\p{L}])`, "iu");
}

function occurrences(haystack: string, needle: string, locale: string): boolean {
  return termPattern(needle, locale).test(haystack);
}

function vocabularyForms(term: string, locale: string): string[] {
  const forms = [term];
  const catalog = abbreviationCatalog(locale);
  if (catalog) {
    for (const entry of catalog) {
      if (normalise(entry.full) === normalise(term)) forms.push(entry.short);
    }
  }
  return forms;
}

function vocabularyFindings(
  source: SourceText,
  candidate: CandidateText,
  locale: string,
): CheckFinding[] {
  const terms = RULES_TERMS[locale] ?? [];
  if (terms.length === 0) return [];
  const sourceText = `${joinField(source.description)}\n${joinField(source.higherLevels)}`;
  const candidateText = `${candidate.description}\n${candidate.higherLevels ?? ""}`;
  const findings: CheckFinding[] = [];
  for (const term of terms) {
    if (!occurrences(sourceText, term, locale)) continue;
    const forms = vocabularyForms(term, locale);
    if (forms.some((form) => occurrences(candidateText, form, locale))) continue;
    findings.push({
      category: "vocabulary",
      severity: "medium",
      evidence: `rules term "${term}" (or an established form such as ${forms
        .slice(1)
        .map((form) => `"${form}"`)
        .join(", ")}) appears in the source but not in the candidate`,
      recommendedAction: "Preserve the term or its established abbreviation; regenerate or review.",
    });
  }
  return findings;
}

function rawList(atoms: CategoryComparison["source"]): string {
  return `[${atoms.map((atom) => atom.raw).join(", ")}]`;
}

function comparisonEvidence(field: string, comparison: CategoryComparison): string {
  const evidence = `${field} ${comparison.category}: source ${rawList(
    comparison.source,
  )} vs candidate ${rawList(comparison.candidate)}`;
  const details: string[] = [];
  if (comparison.classification === "mismatch" && comparison.missing.length > 0) {
    details.push(`the candidate has no value for ${rawList(comparison.missing)}`);
  }
  if (comparison.classification === "mismatch" && comparison.added.length > 0) {
    details.push(
      `the candidate adds ${rawList(comparison.added)} that the source description does not contain`,
    );
  }
  details.push(...comparison.notes);
  return details.length > 0 ? `${evidence}; ${details.join("; ")}` : evidence;
}

function numericFindings(
  sourceText: string,
  candidateText: string,
  field: string,
  locale: string,
  metadata: string,
): { findings: CheckFinding[]; unresolvedItems: string[] } {
  const findings: CheckFinding[] = [];
  const unresolvedItems: string[] = [];
  const report = compareNumericAtoms(sourceText, candidateText, {
    locale,
    ...(metadata !== "" ? { metadata } : {}),
  });
  for (const comparison of report.comparisons) {
    if (
      comparison.source.length === 0 &&
      comparison.candidate.length === 0 &&
      comparison.metadataRestated.length === 0
    ) {
      continue;
    }
    const category: CheckCategory = comparison.category === "dice" ? "dice" : "quantity";
    const evidence = comparisonEvidence(field, comparison);
    if (comparison.classification === "mismatch") {
      findings.push({
        category,
        severity: "high",
        evidence,
        recommendedAction: "Restore the original value; do not write this entry until it matches.",
      });
    } else if (comparison.classification === "unresolved") {
      unresolvedItems.push(evidence);
      findings.push({
        category,
        severity: "low",
        evidence: `unresolved ${evidence}`,
        recommendedAction:
          "Review the representation against the source; the semantic comparison must clear it.",
      });
    }
  }
  return { findings, unresolvedItems };
}

/** Casting time, range, and duration are displayed separately by the app. */
function metadataText(source: SourceText): string {
  return [source.castingTime, source.range, source.duration]
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .join("\n");
}

/**
 * Values in candidate higher-level text that also occur in the source
 * description suggest relocated source text (inline cantrip scaling or a stat
 * block stored in the source higher-level field) rather than invented rules.
 */
function relocatedValues(source: SourceText, candidateHigher: string, locale: string): string[] {
  const report = compareNumericAtoms(joinField(source.description), candidateHigher, { locale });
  const values = new Set<string>();
  for (const comparison of report.comparisons) {
    const sourceCanonicals = new Set(comparison.source.map((atom) => atom.canonical));
    for (const atom of comparison.candidate) {
      if (sourceCanonicals.has(atom.canonical)) values.add(`"${atom.raw}"`);
    }
  }
  return [...values];
}

function higherLevelFindings(
  source: SourceText,
  candidate: CandidateText,
  locale: string,
): CheckFinding[] {
  const findings: CheckFinding[] = [];
  const sourceHigher = joinField(source.higherLevels).trim();
  const candidateHigher = (candidate.higherLevels ?? "").trim();

  if (sourceHigher !== "" && candidateHigher === "") {
    findings.push({
      category: "higher-levels",
      severity: "medium",
      evidence: "the source has higher-level rules but the candidate omits them",
      recommendedAction: "Supply higher-level text or withhold the entry.",
    });
  }
  if (sourceHigher === "" && candidateHigher !== "") {
    const relocated = relocatedValues(source, candidateHigher, locale);
    findings.push({
      category: "higher-levels",
      severity: "high",
      evidence:
        "the candidate adds higher-level rules the source does not have" +
        (relocated.length > 0
          ? `; ${relocated.join(", ")} also ${relocated.length === 1 ? "occurs" : "occur"} in the source description, so the text may be relocated instead of invented`
          : ""),
      recommendedAction: "Remove the invented scaling; regenerate or withhold.",
    });
  }
  if (
    candidateHigher !== "" &&
    normalise(candidate.description).includes(normalise(candidateHigher))
  ) {
    findings.push({
      category: "scaling",
      severity: "medium",
      evidence: "higher-level text is duplicated inside the candidate description",
      recommendedAction: "Keep scaling only in the higher-levels field.",
    });
  }
  return findings;
}

function lengthFinding(source: SourceText, candidate: CandidateText): CheckFinding | null {
  const descriptionShorter = isMateriallyShorter(
    candidate.description,
    joinField(source.description),
  );
  const higherShorter =
    candidate.higherLevels !== undefined &&
    isMateriallyShorter(candidate.higherLevels, joinField(source.higherLevels));
  if (descriptionShorter || higherShorter) return null;
  return {
    category: "length",
    severity: "low",
    evidence: "neither replaced field is materially shorter than its source text",
    recommendedAction: "Compress further to keep the card useful; not a blocking finding.",
  };
}

export function runDeterministicChecks(
  source: SourceText,
  candidate: CandidateText,
  locale: string,
): DeterministicCheckResult {
  const findings: CheckFinding[] = [];
  let invalid = false;

  for (const [field, text] of [
    ["description", candidate.description],
    ["higherLevels", candidate.higherLevels],
  ] as const) {
    if (text === undefined) continue;
    const safety = checkMarkdownSafety(text);
    if (!safety.safe) {
      invalid = true;
      findings.push({
        category: "markdown",
        severity: "high",
        evidence: `${field}: ${safety.findings
          .map((finding) => `${finding.construct} "${finding.snippet}"`)
          .join(", ")}`,
        recommendedAction: "Reject the candidate; do not write unsafe Markdown.",
      });
    }
  }

  const metadata = metadataText(source);
  const descriptionNumbers = numericFindings(
    joinField(source.description),
    candidate.description,
    "description",
    locale,
    metadata,
  );
  findings.push(...descriptionNumbers.findings);
  const unresolvedItems = [...descriptionNumbers.unresolvedItems];

  const sourceHigher = joinField(source.higherLevels);
  if (sourceHigher !== "" && candidate.higherLevels !== undefined) {
    const higherNumbers = numericFindings(
      sourceHigher,
      candidate.higherLevels,
      "higherLevels",
      locale,
      metadata,
    );
    findings.push(...higherNumbers.findings);
    unresolvedItems.push(...higherNumbers.unresolvedItems);
  }

  findings.push(...vocabularyFindings(source, candidate, locale));
  findings.push(...higherLevelFindings(source, candidate, locale));
  const length = lengthFinding(source, candidate);
  if (length) findings.push(length);

  return { findings, unresolvedItems, invalid };
}

export function worstSeverity(findings: readonly CheckFinding[]): Severity {
  let worst: Severity = "low";
  for (const finding of findings) {
    if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[worst]) worst = finding.severity;
  }
  return worst;
}

export interface ClassificationInput {
  findings: readonly CheckFinding[];
  unresolvedItems: readonly string[];
  judgement: Judgement | null;
}

export interface Classification {
  status: AuthoringStatus;
  severity: Severity;
  reasons: string[];
  findings: CheckFinding[];
}

/**
 * Status is `accepted` only when all severity conditions are none/low:
 * - no deterministic or judged high finding;
 * - no medium/high semantic finding;
 * - every unresolved item was explicitly reviewed by a comparable judgement
 *   that is mechanically equivalent.
 */
export function classifyOutcome(input: ClassificationInput): Classification {
  const findings = [...input.findings];
  const judged = input.judgement;
  if (judged) {
    for (const finding of judged.findings) {
      findings.push({
        category: "semantic",
        severity: finding.severity,
        evidence: `${finding.category}: ${finding.explanation}`,
        recommendedAction: "Review the semantic finding; regenerate or withhold.",
      });
    }
  }

  const reasons: string[] = [];
  if (findings.some((finding) => finding.severity === "high")) {
    reasons.push("A high-severity finding blocks automatic acceptance.");
  }
  if (judged && judged.findings.some((finding) => finding.severity !== "low")) {
    reasons.push("The semantic comparison reported a medium or high finding.");
  }
  if (!judged) {
    if (input.unresolvedItems.length > 0) {
      reasons.push("Deterministic checks reported unresolved items that were not reviewed.");
    }
  } else {
    if (!judged.mechanicallyEquivalent) {
      reasons.push("The semantic comparison did not confirm mechanical equivalence.");
    }
    if (judged.severity === "medium" || judged.severity === "high") {
      reasons.push(`The semantic comparison reported severity "${judged.severity}".`);
    }
  }

  const status: AuthoringStatus = reasons.length === 0 ? "accepted" : "withheld";
  return { status, severity: worstSeverity(findings), reasons, findings };
}
