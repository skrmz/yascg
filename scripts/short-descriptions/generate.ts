import type {
  AuthoringAcceptance,
  AuthoringEntry,
  AuthoringFile,
  AuthoringOrigin,
} from "../../src/tools/short-descriptions/authoring-schema.ts";
import {
  authoringEntrySchema,
  parseAuthoringFile,
  sortAuthoringEntries,
} from "../../src/tools/short-descriptions/authoring-schema.ts";
import { isRuntimeEligible } from "../../src/tools/short-descriptions/material-shortening.ts";
import { serializeAuthoringFile } from "../../src/tools/short-descriptions/serialize.ts";
import {
  classifyOutcome,
  runDeterministicChecks,
  worstSeverity,
  type CheckFinding,
} from "./checks.ts";
import {
  CliError,
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_PARTIAL,
  isDirectRun,
  parseCliOptions,
  resolveCredentials,
  redact,
  runCli,
  type CliOptions,
  info,
  warn,
} from "./cli.ts";
import { formatOpenRouterConfiguration, resolveOpenRouterConfig } from "./config.ts";
import {
  computeFingerprints,
  defaultWorkspace,
  loadAuthoringRaw,
  loadDatasets,
  loadManifest,
  writeFileAtomic,
  type ManifestEntry,
  type SourceText,
  type Workspace,
} from "./files.ts";
import {
  OpenRouterAdapter,
  type CallResult,
  type GeneratedCandidate,
  type Judgement,
  type ModelPricing,
  type Usage,
} from "./openrouter.ts";
import type { JudgePromptInput } from "./prompt.ts";
import {
  autoAcceptanceRatio,
  combineUsage,
  computeCounts,
  countByLocale,
  estimateCost,
  serializeReport,
  sumKnownCosts,
  type ReportEntry,
  type ReportFinding,
  type ReportStatus,
  type ReviewReport,
} from "./report.ts";

/**
 * Generation pipeline: deterministic selection, candidate generation, local
 * structural checks, semantic comparison, classification, and a two-phase
 * commit (authoring files first, report last).
 */

export interface ShortDescriptionAdapter {
  readonly generationModel: string;
  readonly judgeModel: string;
  generateCandidate(
    locale: string,
    spell: SourceText & { id: string },
  ): Promise<CallResult<GeneratedCandidate>>;
  compareCandidate(input: JudgePromptInput): Promise<CallResult<Judgement>>;
  loadPricing(): Promise<Map<string, ModelPricing> | null>;
}

export type SelectionMode = "missing" | "stale" | "regenerate" | "manual";

export interface SelectionItem {
  locale: string;
  spellId: string;
  mode: SelectionMode;
  source: SourceText;
  entry?: AuthoringEntry;
}

export interface SkippedItem {
  locale: string;
  spellId: string;
  reason: string;
}

export interface SelectionResult {
  items: SelectionItem[];
  skipped: SkippedItem[];
  truncated: number;
}

export interface SelectionInput {
  manifest: readonly ManifestEntry[];
  datasets: ReadonlyMap<string, ReadonlyMap<string, SourceText>>;
  fingerprints: ReadonlyMap<string, ReadonlyMap<string, string>>;
  authoringByLocale: ReadonlyMap<string, AuthoringFile>;
  options: Pick<
    CliOptions,
    "locale" | "ids" | "all" | "regenerate" | "limit" | "maxEntries" | "force" | "approve"
  >;
}

export function selectEntries(input: SelectionInput): SelectionResult {
  const locales = input.options.locale
    ? [input.options.locale]
    : input.manifest.map((entry) => entry.code);
  const ids = input.options.ids ? new Set(input.options.ids) : null;
  const includeExisting =
    input.options.regenerate || Boolean(ids && (input.options.force || input.options.approve));
  const isProtected = (entry: AuthoringEntry) =>
    entry.acceptance === "human" || entry.origin === "manual";

  const items: SelectionItem[] = [];
  const skipped: SkippedItem[] = [];

  for (const locale of locales) {
    const dataset = input.datasets.get(locale);
    if (!dataset) continue;
    const existingById = new Map(
      (input.authoringByLocale.get(locale)?.entries ?? []).map((entry) => [entry.spellId, entry]),
    );
    const hashes = input.fingerprints.get(locale) ?? new Map<string, string>();

    for (const spellId of [...dataset.keys()].sort()) {
      if (ids && !ids.has(spellId)) continue;
      const source = dataset.get(spellId) as SourceText;
      const existing = existingById.get(spellId);
      const currentHash = hashes.get(spellId);

      if (!existing) {
        items.push({ locale, spellId, mode: "missing", source });
        continue;
      }
      if (existing.sourceHash !== currentHash) {
        items.push({ locale, spellId, mode: "stale", source, entry: existing });
        continue;
      }
      if (includeExisting && isProtected(existing) && !input.options.force) {
        skipped.push({
          locale,
          spellId,
          reason: "entry is human-approved or manual; pass --force to overwrite reviewed content",
        });
      } else if (includeExisting) {
        items.push({ locale, spellId, mode: "regenerate", source, entry: existing });
      } else if (ids) {
        skipped.push({
          locale,
          spellId,
          reason: "entry is up to date; pass --regenerate to redo it",
        });
      }
    }

    if (ids) {
      for (const spellId of ids) {
        if (!dataset.has(spellId)) {
          skipped.push({ locale, spellId, reason: "spell ID is not in the locale dataset" });
        }
      }
    }
  }

  const limited = input.options.limit ? items.slice(0, input.options.limit) : items;
  const truncated = items.length - limited.length;

  if (
    !input.options.all &&
    !input.options.ids &&
    !input.options.limit &&
    limited.length > input.options.maxEntries
  ) {
    throw new CliError(
      `selection of ${limited.length} entries exceeds --max-entries ${input.options.maxEntries}; pass --ids or --limit to bound it, or --all for a full-dataset run.`,
    );
  }

  return { items: limited, skipped, truncated };
}

export interface ProcessedItem {
  locale: string;
  spellId: string;
  status: ReportStatus;
  acceptance: AuthoringAcceptance | null;
  origin: AuthoringOrigin | null;
  severity: ReturnType<typeof worstSeverity>;
  findings: CheckFinding[];
  reasons: string[];
  entry?: AuthoringEntry;
  written: boolean;
  generationUsage: Usage | null;
  judgementUsage: Usage | null;
  estimatedCostUsd: number | "unavailable";
}

export interface GenerationDependencies {
  workspace?: Workspace;
  adapter?: ShortDescriptionAdapter;
  now?: () => Date;
  log?: (message: string) => void;
  writeAuthoring?: (filePath: string, text: string) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  configPath?: string;
}

export interface GenerationResult {
  exitCode: number;
  selection: SelectionResult;
  report?: ReviewReport;
}

const MANUAL_PLACEHOLDER = (locale: string) =>
  `TODO: write the short description in locale "${locale}" and review it before setting status to accepted.`;

function normalizeHigherLevels(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.trim() === "" ? undefined : value;
}

function toReportFindings(findings: readonly CheckFinding[]): ReportFinding[] {
  return findings.map((finding) => ({
    category: finding.category,
    severity: finding.severity,
    evidence: finding.evidence,
    recommendedAction: finding.recommendedAction,
  }));
}

function entryCost(
  generation: Usage | null,
  judgement: Usage | null,
  pricing: Map<string, ModelPricing> | null,
  models: { model: string; judgeModel: string },
): number | "unavailable" {
  const generationCost = estimateCost(generation, pricing?.get(models.model));
  const judgementCost = estimateCost(judgement, pricing?.get(models.judgeModel));
  if (generationCost === "unavailable" || judgementCost === "unavailable") return "unavailable";
  return Math.round((generationCost + judgementCost) * 1e6) / 1e6;
}

function redactError(error: unknown): string {
  return redact(error instanceof Error ? error.message : String(error));
}

interface CostContext {
  pricing: Map<string, ModelPricing> | null;
  models: { model: string; judgeModel: string };
}

async function generateEntry(
  adapter: ShortDescriptionAdapter,
  item: SelectionItem,
  currentHash: string,
  costContext: CostContext,
): Promise<ProcessedItem> {
  const base: ProcessedItem = {
    locale: item.locale,
    spellId: item.spellId,
    status: "failed",
    acceptance: null,
    origin: null,
    severity: "high",
    findings: [],
    reasons: [],
    written: false,
    generationUsage: null,
    judgementUsage: null,
    estimatedCostUsd: "unavailable",
  };

  let generated: CallResult<GeneratedCandidate>;
  try {
    generated = await adapter.generateCandidate(item.locale, { id: item.spellId, ...item.source });
  } catch (error) {
    return { ...base, reasons: [redactError(error)] };
  }
  const genUsage = generated.usage;

  const candidate = generated.value;
  if (candidate.spellId !== item.spellId) {
    return {
      ...base,
      generationUsage: genUsage,
      reasons: [
        `generation returned spellId "${candidate.spellId}" for requested "${item.spellId}"; treated as invalid output.`,
      ],
    };
  }

  const text = {
    description: candidate.description,
    higherLevels: normalizeHigherLevels(candidate.higherLevels),
  };
  const checks = runDeterministicChecks(item.source, text, item.locale);
  if (checks.invalid) {
    return {
      ...base,
      status: "invalid",
      findings: checks.findings,
      reasons: ["Candidate failed structural or Markdown checks; not written."],
      generationUsage: genUsage,
      estimatedCostUsd: entryCost(genUsage, null, costContext.pricing, costContext.models),
    };
  }

  let judgement: Judgement | null = null;
  let judgementUsage: Usage | null = null;
  try {
    const compared = await adapter.compareCandidate({
      locale: item.locale,
      spellId: item.spellId,
      source: item.source,
      candidate: text,
      unresolvedItems: checks.unresolvedItems,
    });
    judgement = compared.value;
    judgementUsage = compared.usage;
  } catch (error) {
    return {
      ...base,
      findings: checks.findings,
      reasons: [`semantic comparison failed: ${redactError(error)}`],
      generationUsage: genUsage,
      estimatedCostUsd: entryCost(genUsage, null, costContext.pricing, costContext.models),
    };
  }

  const classification = classifyOutcome({
    findings: checks.findings,
    unresolvedItems: checks.unresolvedItems,
    judgement,
  });
  const cost = entryCost(genUsage, judgementUsage, costContext.pricing, costContext.models);

  const parsedEntry = authoringEntrySchema.safeParse({
    spellId: item.spellId,
    description: text.description,
    ...(text.higherLevels !== undefined ? { higherLevels: text.higherLevels } : {}),
    sourceHash: currentHash,
    status: classification.status,
    acceptance: "auto",
    origin: "generated",
  });
  if (!parsedEntry.success) {
    return {
      ...base,
      status: "invalid",
      findings: classification.findings,
      reasons: ["candidate failed authoring schema validation; not written."],
      generationUsage: genUsage,
      judgementUsage,
      estimatedCostUsd: cost,
    };
  }

  return {
    ...base,
    status: classification.status,
    acceptance: "auto",
    origin: "generated",
    severity: classification.severity,
    findings: classification.findings,
    reasons: classification.reasons,
    entry: parsedEntry.data,
    written: true,
    generationUsage: genUsage,
    judgementUsage,
    estimatedCostUsd: cost,
  };
}

async function revalidateEntry(
  item: SelectionItem,
  currentHash: string,
  adapter: ShortDescriptionAdapter | undefined,
  costContext: CostContext,
): Promise<ProcessedItem> {
  const base: ProcessedItem = {
    locale: item.locale,
    spellId: item.spellId,
    status: "invalid",
    acceptance: null,
    origin: null,
    severity: "high",
    findings: [],
    reasons: [],
    written: false,
    generationUsage: null,
    judgementUsage: null,
    estimatedCostUsd: "unavailable",
  };
  const existing = item.entry;
  if (!existing) {
    return { ...base, reasons: ["revalidation requires an existing authoring entry."] };
  }

  const checks = runDeterministicChecks(item.source, existing, item.locale);
  if (checks.invalid) {
    return {
      ...base,
      findings: checks.findings,
      reasons: ["The existing entry has unsafe Markdown; the text was not rewritten."],
    };
  }

  let judgement: Judgement | null = null;
  let judgementUsage: Usage | null = null;
  if (existing.status === "accepted" && checks.unresolvedItems.length > 0) {
    if (!adapter) {
      return {
        ...base,
        findings: checks.findings,
        reasons: [
          "Unresolved items require the semantic comparison, but no adapter is configured.",
        ],
      };
    }
    try {
      const compared = await adapter.compareCandidate({
        locale: item.locale,
        spellId: item.spellId,
        source: item.source,
        candidate: existing,
        unresolvedItems: checks.unresolvedItems,
      });
      judgement = compared.value;
      judgementUsage = compared.usage;
    } catch (error) {
      return {
        ...base,
        findings: checks.findings,
        reasons: [`revalidation comparison failed: ${redactError(error)}`],
      };
    }
  }

  const classification = classifyOutcome({
    findings: checks.findings,
    unresolvedItems: checks.unresolvedItems,
    judgement,
  });
  const status: "accepted" | "withheld" =
    existing.status === "withheld"
      ? "withheld"
      : classification.status === "accepted"
        ? "accepted"
        : "withheld";

  const parsed = authoringEntrySchema.safeParse({ ...existing, sourceHash: currentHash, status });
  if (!parsed.success) {
    return {
      ...base,
      findings: classification.findings,
      reasons: ["The existing entry failed schema validation; the text was not rewritten."],
    };
  }

  const reasons =
    existing.status === "withheld"
      ? ["Revalidated in place; withheld entries are never promoted by revalidation."]
      : status === "accepted"
        ? ["Revalidated in place; text retained."]
        : classification.reasons;

  return {
    ...base,
    status,
    acceptance: existing.acceptance,
    origin: existing.origin,
    severity: classification.severity,
    findings: classification.findings,
    reasons,
    entry: parsed.data,
    written: true,
    judgementUsage,
    estimatedCostUsd: estimateCost(
      judgementUsage,
      costContext.pricing?.get(costContext.models.judgeModel),
    ),
  };
}
function approveEntry(item: SelectionItem, currentHash: string, locale: string): ProcessedItem {
  const base: ProcessedItem = {
    locale,
    spellId: item.spellId,
    status: "invalid",
    acceptance: null,
    origin: null,
    severity: "high",
    findings: [],
    reasons: [],
    written: false,
    generationUsage: null,
    judgementUsage: null,
    estimatedCostUsd: "unavailable",
  };
  if (!item.entry) {
    return { ...base, reasons: ["--approve requires an existing authoring entry."] };
  }
  const checks = runDeterministicChecks(item.source, item.entry, locale);
  const findings = [...checks.findings];
  const blocked = checks.invalid || findings.some((finding) => finding.severity === "high");
  if (blocked) {
    return {
      ...base,
      findings,
      reasons: ["entry has blocking deterministic findings; approval refused."],
    };
  }
  if (!isRuntimeEligible(item.entry, item.source)) {
    return {
      ...base,
      findings,
      reasons: ["entry is not materially shorter; approval refused."],
    };
  }
  const parsed = authoringEntrySchema.safeParse({
    ...item.entry,
    sourceHash: currentHash,
    status: "accepted",
    acceptance: "human",
    origin: "manual",
  });
  if (!parsed.success) {
    return { ...base, findings, reasons: ["entry failed schema validation; approval refused."] };
  }
  return {
    ...base,
    status: "accepted",
    acceptance: "human",
    origin: "manual",
    severity: worstSeverity(findings),
    findings,
    reasons: ["Approved after human review."],
    entry: parsed.data,
    written: true,
  };
}

function manualEntry(item: SelectionItem, currentHash: string): ProcessedItem {
  const parsed = authoringEntrySchema.safeParse({
    spellId: item.spellId,
    description: MANUAL_PLACEHOLDER(item.locale),
    sourceHash: currentHash,
    status: "withheld",
    acceptance: "auto",
    origin: "manual",
  });
  return {
    locale: item.locale,
    spellId: item.spellId,
    status: "withheld",
    acceptance: "auto",
    origin: "manual",
    severity: "medium",
    findings: [],
    reasons: parsed.success
      ? ["Manual stub written for hand authoring; withheld until reviewed."]
      : ["Manual stub failed schema validation."],
    ...(parsed.success ? { entry: parsed.data } : {}),
    written: parsed.success,
    generationUsage: null,
    judgementUsage: null,
    estimatedCostUsd: "unavailable",
  };
}

interface LoadedInput {
  workspace: Workspace;
  manifest: ManifestEntry[];
  datasets: Map<string, Map<string, SourceText>>;
  fingerprints: Map<string, Map<string, string>>;
  authoringByLocale: Map<string, AuthoringFile>;
}

async function loadInput(workspace: Workspace): Promise<LoadedInput> {
  const manifest = await loadManifest(workspace);
  const manifestLocales = manifest.map((entry) => entry.code);
  const datasets = await loadDatasets(workspace, manifest);
  const authoringByLocale = new Map<string, AuthoringFile>();
  for (const locale of manifestLocales) {
    const raw = await loadAuthoringRaw(workspace, locale);
    if (raw === undefined) continue;
    const parsed = parseAuthoringFile(raw, {
      fileName: `data/short-descriptions/${locale}.json`,
      locale,
      manifestLocales,
    });
    authoringByLocale.set(locale, { locale: parsed.locale, entries: parsed.entries });
  }
  return {
    workspace,
    manifest,
    datasets,
    fingerprints: computeFingerprints(datasets),
    authoringByLocale,
  };
}

interface CommitResult {
  committed: Set<string>;
  error?: Error;
}

async function commit(
  workspace: Workspace,
  processed: readonly ProcessedItem[],
  authoringByLocale: ReadonlyMap<string, AuthoringFile>,
  manifestLocales: readonly string[],
  writeAuthoring: (filePath: string, text: string) => Promise<void>,
): Promise<CommitResult> {
  const byLocale = new Map<string, Map<string, AuthoringEntry>>();
  for (const [locale, file] of authoringByLocale) {
    byLocale.set(locale, new Map(file.entries.map((entry) => [entry.spellId, entry])));
  }
  for (const item of processed) {
    if (!item.entry || !item.written) continue;
    const entries = byLocale.get(item.locale) ?? new Map<string, AuthoringEntry>();
    entries.set(item.spellId, item.entry);
    byLocale.set(item.locale, entries);
  }

  const committed = new Set<string>();
  for (const locale of manifestLocales) {
    const entries = byLocale.get(locale);
    if (!entries) continue;
    const text = serializeAuthoringFile(locale, sortAuthoringEntries([...entries.values()]));
    try {
      await writeAuthoring(workspace.authoringFile(locale), text);
    } catch (error) {
      return { committed, error: error instanceof Error ? error : new Error(String(error)) };
    }
    committed.add(locale);
  }
  return { committed };
}

function buildReport(input: {
  options: CliOptions;
  models: { model: string; judgeModel: string };
  baseUrl: string;
  processed: readonly ProcessedItem[];
  skipped: readonly SkippedItem[];
  committed: ReadonlySet<string>;
  aborted: boolean;
  commitError?: Error;
  now: Date;
  notes: string[];
}): ReviewReport {
  const { options, models, processed, skipped, committed, aborted, commitError } = input;
  const entries: ReportEntry[] = processed.map((item) => ({
    locale: item.locale,
    spellId: item.spellId,
    status: item.status,
    acceptance: item.acceptance,
    origin: item.origin,
    severity: item.severity,
    findings: toReportFindings(item.findings),
    reasons: item.reasons.map(redact),
    written: item.written && committed.has(item.locale),
    usage: combineUsage([item.generationUsage, item.judgementUsage]),
    estimatedCostUsd: item.estimatedCostUsd,
  }));
  const statuses = entries.map((entry) => entry.status);
  const counts = computeCounts(entries, skipped.length);
  const anyFailure = statuses.some((status) => status === "failed" || status === "invalid");
  const allFailure =
    statuses.length > 0 && statuses.every((status) => status === "failed" || status === "invalid");
  const outcome = commitError
    ? committed.size > 0
      ? "partial"
      : "failed"
    : allFailure
      ? "failed"
      : aborted || anyFailure || counts.withheld > 0
        ? "partial"
        : "complete";
  const exitCode = commitError
    ? committed.size > 0
      ? EXIT_PARTIAL
      : EXIT_FAILURE
    : anyFailure || aborted
      ? EXIT_PARTIAL
      : EXIT_OK;
  const notes = [...input.notes];
  if (commitError) {
    notes.push(
      `Authoring commit failed after ${committed.size} locale(s): ${redact(commitError.message)}`,
    );
  }

  const generationUsage = combineUsage(processed.map((item) => item.generationUsage));
  const judgementUsage = combineUsage(processed.map((item) => item.judgementUsage));
  const usage = combineUsage([
    generationUsage === "unavailable" ? null : generationUsage,
    judgementUsage === "unavailable" ? null : judgementUsage,
  ]);

  return {
    schemaVersion: 1,
    generatedAt: input.now.toISOString(),
    provider: "openrouter",
    baseUrl: redact(input.baseUrl),
    generationModel: models.model,
    judgeModel: models.judgeModel,
    command: options.approve
      ? "short-descriptions:generate --approve"
      : options.manual
        ? "short-descriptions:generate --manual"
        : "short-descriptions:generate",
    dryRun: options.dryRun,
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
    skipped: [...skipped],
    generationUsage,
    judgementUsage,
    usage,
    estimatedCostUsd: sumKnownCosts(entries.map((entry) => entry.estimatedCostUsd)),
    notes,
  };
}

function printSummary(log: (message: string) => void, report: ReviewReport): void {
  log(
    `selection: ${report.counts.accepted + report.counts.withheld + report.counts.invalid + report.counts.failed} entries ` +
      `(${report.counts.accepted} accepted, ${report.counts.withheld} withheld, ${report.counts.invalid} invalid, ${report.counts.failed} failed)`,
  );
  log(
    `usage: ${report.usage === "unavailable" ? "unavailable" : `${report.usage.totalTokens} tokens`}; cost: ${
      report.estimatedCostUsd === "unavailable"
        ? "unavailable"
        : `$${report.estimatedCostUsd.toFixed(6)}`
    }`,
  );
}

export async function runGeneration(
  options: CliOptions,
  deps: GenerationDependencies = {},
): Promise<GenerationResult> {
  const workspace = deps.workspace ?? defaultWorkspace();
  const log = deps.log ?? info;
  const now = deps.now ?? (() => new Date());
  const settings = resolveOpenRouterConfig(options, deps.env, deps.configPath);

  if (options.manual && options.approve) {
    throw new CliError("--manual and --approve cannot be combined.");
  }
  if (options.approve && !options.ids && !options.all) {
    throw new CliError("--approve requires --ids or --all to select entries.");
  }
  if (options.write) {
    throw new CliError(
      "short-descriptions:generate never writes runtime sidecars; run short-descriptions:build after generating (--write is only for the smoke command).",
    );
  }

  const loaded = await loadInput(workspace);
  const manifestLocales = loaded.manifest.map((entry) => entry.code);
  if (options.locale && !manifestLocales.includes(options.locale)) {
    throw new CliError(
      `locale "${options.locale}" is not a manifest language (${manifestLocales.join(", ")}).`,
    );
  }

  const selection = selectEntries({
    manifest: loaded.manifest,
    datasets: loaded.datasets,
    fingerprints: loaded.fingerprints,
    authoringByLocale: loaded.authoringByLocale,
    options,
  });

  if (selection.items.length === 0) {
    log("nothing to do: no missing or stale entries match the selection.");
    return { exitCode: EXIT_OK, selection };
  }

  if (options.dryRun) {
    for (const item of selection.items) {
      log(`${item.locale} ${item.spellId} (${item.mode})`);
    }
    log(
      `${selection.items.length} entr${selection.items.length === 1 ? "y" : "ies"} would be processed.`,
    );
    return { exitCode: EXIT_OK, selection };
  }

  const needsModel = !options.approve && !options.manual;
  let adapter = deps.adapter;
  let baseUrl = needsModel ? settings.baseUrl.value : "none";
  let pricing: Map<string, ModelPricing> | null = null;
  let activeModels = {
    model: settings.model.value,
    judgeModel: settings.judgeModel.value,
  };

  if (needsModel) {
    if (!adapter) {
      const credentials = resolveCredentials(deps.env, settings.baseUrl.value);
      baseUrl = credentials.baseUrl;
      adapter = new OpenRouterAdapter({
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        model: settings.model.value,
        judgeModel: settings.judgeModel.value,
        maxOutputTokens: options.maxOutputTokens,
        timeoutMs: options.timeoutMs,
        maxAttempts: options.maxAttempts,
      });
    }
    activeModels = { model: adapter.generationModel, judgeModel: adapter.judgeModel };
    pricing = await adapter.loadPricing().catch(() => null);

    if (
      options.maxCost !== undefined &&
      (!pricing || !pricing.get(activeModels.model) || !pricing.get(activeModels.judgeModel))
    ) {
      throw new CliError(
        "--max-cost requires pricing for both the generation and judge models; the cost cannot be estimated or enforced, so no model call was made.",
      );
    }
  }

  const processed: ProcessedItem[] = [];
  const skipped = [...selection.skipped];
  const notes: string[] = [];
  if (selection.truncated > 0) {
    notes.push(
      `${selection.truncated} entr${selection.truncated === 1 ? "y was" : "ies were"} left for a later run by --limit.`,
    );
  }

  let cumulativeCost = 0;
  let aborted = false;
  const costContext = { pricing, models: activeModels };
  for (const item of selection.items) {
    if (options.maxCost !== undefined && cumulativeCost >= options.maxCost) {
      skipped.push({ locale: item.locale, spellId: item.spellId, reason: "cost cap reached" });
      notes.push(`Cost cap of $${options.maxCost} reached; remaining entries were skipped.`);
      aborted = true;
      break;
    }

    const currentHash = loaded.fingerprints.get(item.locale)?.get(item.spellId) ?? "";
    let result: ProcessedItem;
    if (options.manual) {
      if (item.entry) {
        skipped.push({
          locale: item.locale,
          spellId: item.spellId,
          reason: "existing entry left unchanged; use --approve for existing entries",
        });
        continue;
      }
      result = manualEntry(item, currentHash);
    } else if (options.approve) {
      result = approveEntry(item, currentHash, item.locale);
    } else if (item.mode === "stale") {
      result = await revalidateEntry(item, currentHash, adapter, costContext);
      if (result.estimatedCostUsd !== "unavailable") cumulativeCost += result.estimatedCostUsd;
    } else {
      if (!adapter) throw new CliError("model adapter is not configured.");
      result = await generateEntry(adapter, item, currentHash, costContext);
      if (result.estimatedCostUsd !== "unavailable") cumulativeCost += result.estimatedCostUsd;
    }
    processed.push(result);
    log(
      `${item.locale} ${item.spellId}: ${result.status}${result.reasons.length > 0 ? ` (${result.reasons[0]})` : ""}`,
    );
  }

  const commitResult = await commit(
    workspace,
    processed,
    loaded.authoringByLocale,
    manifestLocales,
    deps.writeAuthoring ?? writeFileAtomic,
  );
  const committed = commitResult.committed;

  const report = buildReport({
    options,
    models: activeModels,
    baseUrl,
    processed,
    skipped,
    committed,
    aborted,
    ...(commitResult.error ? { commitError: commitResult.error } : {}),
    now: now(),
    notes,
  });

  let exitCode = report.exitCode;
  try {
    await writeFileAtomic(workspace.reportFile, serializeReport(report));
  } catch (error) {
    warn(
      `Authoring files were committed (${committed.size} locale(s)) but the review report could not be written: ${redactError(error)}`,
    );
    exitCode = EXIT_PARTIAL;
  }
  printSummary(log, report);
  return { exitCode, selection, report };
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseCliOptions(argv);
  if (options.showConfig) {
    info(formatOpenRouterConfiguration(resolveOpenRouterConfig(options)));
    return EXIT_OK;
  }
  const result = await runGeneration(options);
  if (result.report) {
    for (const skipped of result.report.skipped) {
      warn(`${skipped.locale} ${skipped.spellId}: skipped (${skipped.reason})`);
    }
  }
  return result.exitCode;
}

if (isDirectRun(import.meta.url)) {
  void runCli(() => main(process.argv.slice(2)));
}
