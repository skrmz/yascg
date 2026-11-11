import { abbreviationCatalog } from "../../src/locales/abbreviations.ts";
import type { SourceText } from "./files.ts";

/**
 * Prompt construction. Prompts contain only bundled public SRD text, the
 * locale's abbreviation catalog, and authoring instructions. They never contain
 * user data, credentials, or request headers, and they are never written to the
 * report or logs.
 */

export interface PromptCandidate {
  description: string;
  higherLevels?: string;
}

function abbreviationLines(locale: string): string {
  const catalog = abbreviationCatalog(locale);
  if (!catalog) return "(none)";
  return catalog.map((entry) => `- ${entry.full} => ${entry.short}`).join("\n");
}

function joined(items: readonly string[] | undefined): string {
  return (items ?? []).filter((part) => part.trim() !== "").join("\n\n");
}

export function buildGenerationPrompt(locale: string, spell: SourceText & { id: string }): string {
  const metadata = [
    `Spell ID: ${spell.id}`,
    spell.name ? `Name: ${spell.name}` : null,
    spell.level !== undefined ? `Level: ${spell.level}` : null,
    spell.school ? `School: ${spell.school}` : null,
    spell.castingTime ? `Casting time: ${spell.castingTime}` : null,
    spell.range ? `Range: ${spell.range}` : null,
    spell.duration ? `Duration: ${spell.duration}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const higherLevels = joined(spell.higherLevels);

  return [
    `You write a short form of a Dungeons & Dragons SRD spell description in locale "${locale}".`,
    "",
    "Content conventions:",
    "- Paraphrase meaning-preserving and compress substantially (target about 30% fewer characters).",
    "- Preserve every gameplay mechanic: numbers, dice, targets, areas, ranges, durations, timing, conditions, saves, action economy, restrictions, exceptions, scaling, and component-dependent effects.",
    "- Remove flavor text, redundant restatement, and rules-irrelevant examples.",
    "- Safe Markdown only: paragraphs, headings, lists, blockquotes, bold, italic, and code. No raw HTML, links, images, URLs, or tables.",
    "- Use the locale's established abbreviations where natural; do not invent terminology.",
    higherLevels !== ""
      ? "- Put higher-level scaling in the separate `higherLevels` field and do not duplicate it in `description`."
      : "- The source has no higher-level rules, so do not add any.",
    "",
    "Locale abbreviations (full => short):",
    abbreviationLines(locale),
    "",
    "Spell metadata:",
    metadata,
    "",
    "Source description:",
    joined(spell.description),
  ]
    .concat(higherLevels !== "" ? ["", "Source higher levels:", higherLevels] : [])
    .concat([
      "",
      "Return only JSON matching this shape:",
      `{"spellId":"${spell.id}","description":"...","higherLevels":"..."}`,
      "- `spellId` must equal the requested spell ID.",
      "- Set `higherLevels` to an empty string when the source has none.",
    ])
    .join("\n");
}

export interface JudgePromptInput {
  locale: string;
  spellId: string;
  source: SourceText;
  candidate: PromptCandidate;
  unresolvedItems: readonly string[];
}

export function buildJudgePrompt(input: JudgePromptInput): string {
  const unresolved =
    input.unresolvedItems.length > 0
      ? input.unresolvedItems.map((item) => `- ${item}`).join("\n")
      : "(none)";
  const metadata = [
    input.source.name ? `Name: ${input.source.name}` : null,
    input.source.level !== undefined ? `Level: ${input.source.level}` : null,
    input.source.school ? `School: ${input.source.school}` : null,
    input.source.castingTime ? `Casting time: ${input.source.castingTime}` : null,
    input.source.range ? `Range: ${input.source.range}` : null,
    input.source.duration ? `Duration: ${input.source.duration}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return [
    `You compare a source spell description with a shortened candidate in locale "${input.locale}".`,
    "Do not rewrite the text. Judge whether the candidate preserves the mechanics of the source.",
    "",
    "Severity rubric (based on potential mechanical impact, never on model confidence):",
    "- high: damage, dice or quantities, targets or areas, range, duration or timing, action economy, conditions, saves, scaling, restrictions, exceptions, or component requirements change, or uncertainty about a serious rule change.",
    "- medium: possible ambiguity or omission, incomplete higher-level text, or significant compression with uncertain effect.",
    "- low: wording, style, readability, or non-mechanical formatting.",
    "",
    "Spell metadata (the app displays these fields separately from the description):",
    metadata || "(none)",
    "A value that only restates this metadata is not a mechanical change. A candidate value that contradicts the metadata, or that drops or changes a value stated in the source description, is.",
    "",
    "The following deterministic items are unresolved and require an explicit finding (or no finding only when you are certain the representations are equivalent):",
    unresolved,
    "",
    "Source description:",
    joined(input.source.description),
    "",
    "Source higher levels:",
    joined(input.source.higherLevels) || "(none)",
    "",
    "Candidate description:",
    input.candidate.description,
    "",
    "Candidate higher levels:",
    input.candidate.higherLevels ?? "(none)",
    "",
    "Return only JSON matching this shape:",
    JSON.stringify(
      {
        spellId: input.spellId,
        mechanicallyEquivalent: true,
        severity: "none",
        findings: [
          {
            category: "damage",
            severity: "low",
            sourceEvidence: "...",
            candidateEvidence: "...",
            explanation: "...",
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");
}
