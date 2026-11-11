import {
  parseAuthoringFile,
  AuthoringSchemaError,
} from "../../src/tools/short-descriptions/authoring-schema.ts";
import { isRuntimeEligible } from "../../src/tools/short-descriptions/material-shortening.ts";
import {
  buildRuntimeSidecars,
  type TransformWarning,
} from "../../src/tools/short-descriptions/transform.ts";
import { EXIT_FAILURE, EXIT_OK, fail, info, isDirectRun, runCli, warn } from "./cli.ts";
import {
  runDeterministicChecks,
  worstSeverity,
  type CheckFinding,
  type Severity,
} from "./checks.ts";
import {
  autoAcceptanceRatio,
  computeCounts,
  countByLocale,
  serializeReport,
  type ReportEntry,
  type ReportFinding,
  type ReportStatus,
  type ReviewReport,
} from "./report.ts";
import {
  computeFingerprints,
  defaultWorkspace,
  loadAuthoringRaw,
  loadDatasets,
  loadManifest,
  readTextIfExists,
  writeFileAtomic,
  WorkspaceError,
  type SourceText,
  type Workspace,
} from "./files.ts";

export interface ValidateOptions {
  writeReport?: boolean;
  now?: () => Date;
}

export interface ValidateResult {
  report: ReviewReport;
  drift: string[];
  warnings: TransformWarning[];
  exitCode: number;
}

function toReportFindings(findings: readonly CheckFinding[]): ReportFinding[] {
  return findings.map((finding) => ({
    category: finding.category,
    severity: finding.severity,
    evidence: finding.evidence,
    recommendedAction: finding.recommendedAction,
  }));
}

interface EntryValidation {
  status: ReportStatus;
  severity: Severity;
  findings: CheckFinding[];
  reasons: string[];
}

function validateEntry(
  entry: {
    spellId: string;
    description: string;
    higherLevels?: string;
    sourceHash: string;
    status: string;
    acceptance: string;
    origin: string;
  },
  source: SourceText | undefined,
  currentHash: string | undefined,
  locale: string,
): EntryValidation {
  const findings: CheckFinding[] = [];
  const reasons: string[] = [];

  if (!source) {
    findings.push({
      category: "structural",
      severity: "high",
      evidence: `"${entry.spellId}" is not in the "${locale}" dataset`,
      recommendedAction: "Remove the entry or correct the spell ID.",
    });
    return { status: "invalid", severity: "high", findings, reasons: ["Orphaned spell ID."] };
  }
  if (currentHash !== entry.sourceHash) {
    findings.push({
      category: "provenance",
      severity: "high",
      evidence: `sourceHash is stale for "${entry.spellId}"`,
      recommendedAction: "Regenerate the entry or refresh the fingerprint after review.",
    });
  }

  const checks = runDeterministicChecks(source, entry, locale);
  findings.push(...checks.findings);

  if (checks.invalid) {
    return {
      status: "invalid",
      severity: worstSeverity(findings),
      findings,
      reasons: ["Unsafe Markdown."],
    };
  }

  const stale = currentHash !== entry.sourceHash;
  const blocking = findings.some(
    (finding) => finding.severity === "high" && finding.category !== "provenance",
  );
  if (stale) reasons.push("The source fingerprint is stale; the text is not reused.");
  if (blocking) reasons.push("Deterministic checks reported a high-severity mismatch.");
  if (entry.status !== "accepted") reasons.push("The authoring entry is withheld for review.");
  const eligible = isRuntimeEligible(entry, source);
  if (!eligible) {
    findings.push({
      category: "length",
      severity: "medium",
      evidence: `"${entry.spellId}" is not materially shorter and would be omitted at runtime`,
      recommendedAction: "Compress the text or withhold the entry.",
    });
    reasons.push("The entry would be omitted from the runtime sidecar.");
  }

  // Validation mirrors the persisted decision: medium/low findings are reported
  // but do not change an accepted entry's status, matching generation.
  const withheld = stale || blocking || !eligible || entry.status !== "accepted";
  const status: ReportStatus = withheld ? "withheld" : "accepted";
  return { status, severity: worstSeverity(findings), findings, reasons };
}

export async function validateWorkspace(
  workspace: Workspace = defaultWorkspace(),
  options: ValidateOptions = {},
): Promise<ValidateResult> {
  const manifest = await loadManifest(workspace);
  const manifestLocales = manifest.map((entry) => entry.code);
  const datasets = await loadDatasets(workspace, manifest);
  const fingerprints = computeFingerprints(datasets);

  const entries: ReportEntry[] = [];
  const fileIssues: string[] = [];
  const authoringFiles = new Map<string, unknown>();

  for (const locale of manifestLocales) {
    const raw = await loadAuthoringRaw(workspace, locale);
    if (raw === undefined) continue;
    try {
      const parsed = parseAuthoringFile(raw, {
        fileName: `data/short-descriptions/${locale}.json`,
        locale,
        manifestLocales,
      });
      authoringFiles.set(locale, { locale: parsed.locale, entries: parsed.entries });
      for (const entry of parsed.entries) {
        const validation = validateEntry(
          entry,
          datasets.get(locale)?.get(entry.spellId),
          fingerprints.get(locale)?.get(entry.spellId),
          locale,
        );
        entries.push({
          locale,
          spellId: entry.spellId,
          status: validation.status,
          acceptance: entry.acceptance,
          origin: entry.origin,
          severity: validation.severity,
          findings: toReportFindings(validation.findings),
          reasons: validation.reasons,
          written: true,
          usage: "unavailable",
          estimatedCostUsd: "unavailable",
        });
      }
    } catch (error) {
      if (!(error instanceof AuthoringSchemaError)) throw error;
      fileIssues.push(error.message);
      entries.push({
        locale,
        spellId: "(file)",
        status: "invalid",
        acceptance: null,
        origin: null,
        severity: "high",
        findings: error.issues.map((issue) => ({
          category: "structural",
          severity: "high",
          evidence: issue,
          recommendedAction: "Fix the authoring file structure.",
        })),
        reasons: ["Authoring file failed structural validation."],
        written: true,
        usage: "unavailable",
        estimatedCostUsd: "unavailable",
      });
    }
  }

  const drift: string[] = [];
  const warnings: TransformWarning[] = [];
  if (fileIssues.length === 0) {
    const transformed = buildRuntimeSidecars({
      manifestLocales,
      authoringFiles,
      datasets,
      fingerprints,
    });
    warnings.push(...transformed.warnings);
    for (const locale of manifestLocales) {
      const current = await readTextIfExists(workspace.sidecarFile(locale));
      const normalized = current?.replace(/\r\n/g, "\n");
      if (normalized !== transformed.files.get(locale)) {
        drift.push(
          `src/data/spell-short-descriptions.${locale}.json does not match the authoring files; run "pnpm run short-descriptions:build".`,
        );
      }
    }
  }

  const counts = computeCounts(entries, 0);
  const hasFileIssues = fileIssues.length > 0;
  const outcome = hasFileIssues
    ? "failed"
    : counts.withheld + counts.invalid > 0
      ? "partial"
      : "complete";
  const exitCode = hasFileIssues || drift.length > 0 ? EXIT_FAILURE : EXIT_OK;

  const report: ReviewReport = {
    schemaVersion: 1,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    provider: "openrouter",
    baseUrl: "none",
    generationModel: "none",
    judgeModel: "none",
    command: "short-descriptions:validate",
    dryRun: false,
    outcome,
    counts,
    countsByLocale: countByLocale(entries),
    autoAcceptanceRatio: autoAcceptanceRatio(counts),
    exitCode,
    entries,
    failures: entries
      .filter((entry) => entry.status !== "accepted")
      .map((entry) => ({
        locale: entry.locale,
        spellId: entry.spellId,
        status: entry.status as "withheld" | "invalid" | "failed",
        reason: entry.reasons.join(" "),
        committed: entry.written,
      })),
    skipped: [],
    generationUsage: "unavailable",
    judgementUsage: "unavailable",
    usage: "unavailable",
    estimatedCostUsd: "unavailable",
    notes: ["Validation performs no model calls.", ...fileIssues, ...drift],
  };

  if (options.writeReport !== false) {
    await writeFileAtomic(workspace.reportFile, serializeReport(report));
  }

  return { report, drift, warnings, exitCode };
}

async function main(): Promise<number> {
  const result = await validateWorkspace();
  for (const warning of result.warnings) warn(warning.message);
  for (const message of result.drift) fail(message);
  info(
    `short-descriptions:validate ${result.report.outcome}: ${result.report.counts.accepted} accepted, ${result.report.counts.withheld} withheld, ${result.report.counts.invalid} invalid.`,
  );
  return result.exitCode;
}

if (isDirectRun(import.meta.url)) {
  void runCli(async () => {
    try {
      return await main();
    } catch (error) {
      if (error instanceof AuthoringSchemaError || error instanceof WorkspaceError) {
        fail(error.message);
        return EXIT_FAILURE;
      }
      throw error;
    }
  });
}
