import type {
  AuthoringAcceptance,
  AuthoringOrigin,
} from "../../src/tools/short-descriptions/authoring-schema.ts";
import type { Severity } from "./checks.ts";
import type { ModelPricing, Usage } from "./openrouter.ts";

/**
 * Review report model. The report contains no prompts, responses, headers, or
 * credentials: only provider, models, per-entry status, severity, and evidence.
 */

export type ReportStatus = "accepted" | "withheld" | "invalid" | "skipped" | "failed";
export type ReportOutcome = "complete" | "partial" | "failed";

export interface ReportFinding {
  category: string;
  severity: Severity;
  evidence: string;
  recommendedAction: string;
}

export interface ReportEntry {
  locale: string;
  spellId: string;
  status: ReportStatus;
  acceptance: AuthoringAcceptance | null;
  origin: AuthoringOrigin | null;
  severity: Severity;
  findings: ReportFinding[];
  reasons: string[];
  written: boolean;
  usage: Usage | "unavailable";
  estimatedCostUsd: number | "unavailable";
}

export interface ReportSkipped {
  locale: string;
  spellId: string;
  reason: string;
}

export interface ReportFailure {
  locale: string;
  spellId: string;
  status: "withheld" | "invalid" | "failed";
  reason: string;
  committed: boolean;
}

export interface ReportCounts {
  selected: number;
  accepted: number;
  autoAccepted: number;
  humanAccepted: number;
  withheld: number;
  invalid: number;
  failed: number;
  skipped: number;
}

export interface LocaleCounts {
  accepted: number;
  withheld: number;
  invalid: number;
  failed: number;
}

export interface ReviewReport {
  schemaVersion: 1;
  generatedAt: string;
  provider: "openrouter";
  baseUrl: string;
  generationModel: string;
  judgeModel: string;
  command: string;
  dryRun: boolean;
  outcome: ReportOutcome;
  counts: ReportCounts;
  countsByLocale: Record<string, LocaleCounts>;
  /** Automatic acceptance / (automatic acceptance + withheld). */
  autoAcceptanceRatio: number | "unavailable";
  exitCode: number;
  entries: ReportEntry[];
  failures: ReportFailure[];
  skipped: ReportSkipped[];
  generationUsage: Usage | "unavailable";
  judgementUsage: Usage | "unavailable";
  usage: Usage | "unavailable";
  estimatedCostUsd: number | "unavailable";
  notes: string[];
}

export function serializeReport(report: ReviewReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function combineUsage(usages: readonly (Usage | null)[]): Usage | "unavailable" {
  if (usages.length === 0) return "unavailable";
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  for (const usage of usages) {
    if (!usage) return "unavailable";
    promptTokens += usage.promptTokens;
    completionTokens += usage.completionTokens;
    totalTokens += usage.totalTokens;
  }
  return { promptTokens, completionTokens, totalTokens };
}

export function estimateCost(
  usage: Usage | null | "unavailable",
  pricing: ModelPricing | undefined,
): number | "unavailable" {
  if (usage === null || usage === "unavailable" || !pricing) return "unavailable";
  const cost =
    usage.promptTokens * pricing.promptPerToken +
    usage.completionTokens * pricing.completionPerToken;
  return Math.round(cost * 1e6) / 1e6;
}

export function sumKnownCosts(costs: readonly (number | "unavailable")[]): number | "unavailable" {
  let total = 0;
  for (const cost of costs) {
    if (cost === "unavailable") return "unavailable";
    total += cost;
  }
  return Math.round(total * 1e6) / 1e6;
}

export interface CountableEntry {
  status: ReportStatus;
  acceptance: AuthoringAcceptance | null;
}

export function computeCounts(entries: readonly CountableEntry[], skipped: number): ReportCounts {
  const acceptedEntries = entries.filter((entry) => entry.status === "accepted");
  return {
    selected: entries.length,
    accepted: acceptedEntries.length,
    autoAccepted: acceptedEntries.filter((entry) => entry.acceptance === "auto").length,
    humanAccepted: acceptedEntries.filter((entry) => entry.acceptance === "human").length,
    withheld: entries.filter((entry) => entry.status === "withheld").length,
    invalid: entries.filter((entry) => entry.status === "invalid").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    skipped,
  };
}

export function countByLocale(
  entries: readonly { locale: string; status: ReportStatus }[],
): Record<string, LocaleCounts> {
  const byLocale: Record<string, LocaleCounts> = {};
  for (const entry of entries) {
    const counts = (byLocale[entry.locale] ??= {
      accepted: 0,
      withheld: 0,
      invalid: 0,
      failed: 0,
    });
    if (entry.status === "accepted") counts.accepted += 1;
    else if (entry.status === "withheld") counts.withheld += 1;
    else if (entry.status === "invalid") counts.invalid += 1;
    else if (entry.status === "failed") counts.failed += 1;
  }
  return byLocale;
}

/** Automatic acceptance among automatically processed entries only. */
export function autoAcceptanceRatio(counts: ReportCounts): number | "unavailable" {
  const denominator = counts.autoAccepted + counts.withheld;
  if (denominator === 0) return "unavailable";
  return Math.round((counts.autoAccepted / denominator) * 1000) / 1000;
}
