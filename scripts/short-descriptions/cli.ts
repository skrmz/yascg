import { parseArgs } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Shared CLI plumbing: flag parsing, model and credential resolution, redacted
 * output, and the documented exit codes. No command accepts the API key as an
 * argument and no helper ever echoes it.
 */

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_PARTIAL = 2;

/** Documented shared default for both the generator and the judge. */
export const DEFAULT_MODEL = "openai/gpt-4o-mini";
export const DEFAULT_JUDGE_MODEL = DEFAULT_MODEL;
export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_MAX_ENTRIES = 25;
export const DEFAULT_MAX_OUTPUT_TOKENS = 1200;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const SMOKE_MAX_IDS = 3;

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = EXIT_FAILURE,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export interface CliOptions {
  dryRun: boolean;
  write: boolean;
  all: boolean;
  regenerate: boolean;
  approve: boolean;
  force: boolean;
  manual: boolean;
  locale?: string;
  ids?: string[];
  limit?: number;
  model?: string;
  judgeModel?: string;
  maxEntries: number;
  maxCost?: number;
  maxOutputTokens: number;
  timeoutMs: number;
  maxAttempts: number;
  outputDir?: string;
}

function positiveInteger(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError(`--${name} must be a positive integer (received "${value}").`);
  }
  return parsed;
}

function positiveNumber(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CliError(`--${name} must be a positive number (received "${value}").`);
  }
  return parsed;
}

export function parseCliOptions(argv: readonly string[]): CliOptions {
  const { values } = parseArgs({
    args: [...argv],
    allowPositionals: false,
    strict: true,
    options: {
      "dry-run": { type: "boolean" },
      write: { type: "boolean" },
      all: { type: "boolean" },
      regenerate: { type: "boolean" },
      approve: { type: "boolean" },
      force: { type: "boolean" },
      manual: { type: "boolean" },
      locale: { type: "string" },
      ids: { type: "string" },
      limit: { type: "string" },
      model: { type: "string" },
      "judge-model": { type: "string" },
      "max-entries": { type: "string" },
      "max-cost": { type: "string" },
      "max-output-tokens": { type: "string" },
      "timeout-ms": { type: "string" },
      "max-attempts": { type: "string" },
      "output-dir": { type: "string" },
    },
  });

  const ids = values.ids
    ?.split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  const uniqueIds = ids ? [...new Set(ids)] : undefined;

  return {
    dryRun: Boolean(values["dry-run"]),
    write: Boolean(values.write),
    all: Boolean(values.all),
    regenerate: Boolean(values.regenerate),
    approve: Boolean(values.approve),
    force: Boolean(values.force),
    manual: Boolean(values.manual),
    ...(values.locale !== undefined ? { locale: values.locale } : {}),
    ...(uniqueIds && uniqueIds.length > 0 ? { ids: uniqueIds } : {}),
    ...(values.limit !== undefined ? { limit: positiveInteger("limit", values.limit) } : {}),
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(values["judge-model"] !== undefined ? { judgeModel: values["judge-model"] } : {}),
    maxEntries: positiveInteger("max-entries", values["max-entries"]) ?? DEFAULT_MAX_ENTRIES,
    ...(values["max-cost"] !== undefined
      ? { maxCost: positiveNumber("max-cost", values["max-cost"]) }
      : {}),
    maxOutputTokens:
      positiveInteger("max-output-tokens", values["max-output-tokens"]) ??
      DEFAULT_MAX_OUTPUT_TOKENS,
    timeoutMs: positiveInteger("timeout-ms", values["timeout-ms"]) ?? DEFAULT_TIMEOUT_MS,
    maxAttempts: positiveInteger("max-attempts", values["max-attempts"]) ?? DEFAULT_MAX_ATTEMPTS,
    ...(values["output-dir"] !== undefined ? { outputDir: values["output-dir"] } : {}),
  };
}

export interface ModelSelection {
  model: string;
  judgeModel: string;
}

/** Flag > environment variable > documented shared default. */
export function resolveModels(
  options: Pick<CliOptions, "model" | "judgeModel">,
  env: NodeJS.ProcessEnv = process.env,
): ModelSelection {
  const model = options.model ?? env.OPENROUTER_MODEL?.trim() ?? DEFAULT_MODEL;
  const judgeModel =
    options.judgeModel ?? env.OPENROUTER_JUDGE_MODEL?.trim() ?? DEFAULT_JUDGE_MODEL;
  return { model, judgeModel };
}

export interface Credentials {
  apiKey: string;
  baseUrl: string;
}

/**
 * Reads the key from `process.env.OPENROUTER_API_KEY` only when a model call is
 * about to happen. There is no `.env` file and no flag for the key.
 */
export function resolveCredentials(env: NodeJS.ProcessEnv = process.env): Credentials {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new CliError(
      "OPENROUTER_API_KEY is not set. Set it for the current PowerShell session (see docs/short-descriptions.md) and retry.",
    );
  }
  return { apiKey, baseUrl: resolveBaseUrl(env.OPENROUTER_BASE_URL) };
}

/** Sanitizes the base URL: credentials, query, and fragment are dropped. */
export function resolveBaseUrl(raw: string | undefined): string {
  const candidate = raw?.trim() || DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new CliError("OPENROUTER_BASE_URL is not a valid absolute URL.");
  }
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

const KEY_PATTERN = /sk-or-[A-Za-z0-9_-]+/g;
const BEARER_PATTERN = /Bearer\s+\S+/gi;

export function redact(value: string): string {
  return value
    .replace(KEY_PATTERN, "sk-or-[redacted]")
    .replace(BEARER_PATTERN, "Bearer [redacted]");
}

export function info(message: string): void {
  console.log(redact(message));
}

export function warn(message: string): void {
  console.warn(redact(message));
}

export function fail(message: string): void {
  console.error(redact(message));
}

export async function runCli(main: () => Promise<number>): Promise<void> {
  try {
    process.exitCode = await main();
  } catch (error) {
    if (error instanceof CliError) {
      fail(error.message);
      process.exitCode = error.exitCode;
      return;
    }
    fail(`Unexpected failure: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = EXIT_FAILURE;
  }
}

export function isDirectRun(moduleUrl: string, argv: readonly string[] = process.argv): boolean {
  const entry = argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(moduleUrl);
}
