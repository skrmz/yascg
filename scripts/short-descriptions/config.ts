import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CliError,
  DEFAULT_JUDGE_MODEL,
  DEFAULT_MODEL,
  resolveBaseUrl,
  type CliOptions,
} from "./cli.ts";

/**
 * Project-local OpenRouter configuration: non-secret defaults committed with the
 * repository. Credentials are never read from this file; the API key comes only
 * from the environment.
 */

export type ConfigSource = "CLI" | "environment" | "config file" | "built-in default";

export interface ResolvedSetting {
  value: string;
  source: ConfigSource;
}

export interface ResolvedOpenRouterConfig {
  model: ResolvedSetting;
  judgeModel: ResolvedSetting;
  baseUrl: ResolvedSetting;
  configPath: string;
  configExists: boolean;
}

export interface OpenRouterConfigValues {
  model?: string;
  judgeModel?: string;
  baseUrl?: string;
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..", "..");
const SECRET_PROPERTY_PATTERN = /api[_-]?key|openrouter_api_key|token|secret|credential|password/i;
const ALLOWED_PROPERTIES = ["model", "judgeModel", "baseUrl"] as const;

export const OPENROUTER_CONFIG_PATH = path.join(MODULE_DIR, "openrouter.config.json");

function configLabel(filePath: string): string {
  const relative = path.relative(REPO_ROOT, filePath);
  const label = relative === "" || relative.startsWith("..") ? filePath : relative;
  return label.split(path.sep).join("/");
}

export const OPENROUTER_CONFIG_LABEL = configLabel(OPENROUTER_CONFIG_PATH);

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Loads and validates the committed configuration. A missing file is not an error. */
export function loadOpenRouterConfig(
  filePath: string = OPENROUTER_CONFIG_PATH,
): OpenRouterConfigValues | undefined {
  const label = configLabel(filePath);
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new CliError(
      `Cannot read OpenRouter configuration ${label}: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    throw new CliError(
      `Invalid JSON in OpenRouter configuration ${label}: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new CliError(
      `OpenRouter configuration ${label} must contain a JSON object with model, judgeModel, and baseUrl.`,
    );
  }

  const values: OpenRouterConfigValues = {};
  for (const [property, value] of Object.entries(raw)) {
    if (!(ALLOWED_PROPERTIES as readonly string[]).includes(property)) {
      if (SECRET_PROPERTY_PATTERN.test(property)) {
        throw new CliError(
          `OpenRouter configuration ${label} contains "${property}". Credentials must never be committed; set OPENROUTER_API_KEY in the environment instead.`,
        );
      }
      throw new CliError(
        `Unknown property "${property}" in OpenRouter configuration ${label}. Allowed properties are model, judgeModel, and baseUrl.`,
      );
    }
    if (!nonEmptyString(value)) {
      throw new CliError(
        `OpenRouter configuration ${label}: "${property}" must be a non-empty string.`,
      );
    }
    values[property as keyof OpenRouterConfigValues] = value.trim();
  }
  return values;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveSetting(
  flag: string,
  cliValue: string | undefined,
  envValue: string | undefined,
  configValue: string | undefined,
  fallback: string,
): ResolvedSetting {
  if (cliValue !== undefined) {
    const trimmed = cliValue.trim();
    if (trimmed === "") throw new CliError(`${flag} must not be empty.`);
    return { value: trimmed, source: "CLI" };
  }
  const fromEnvironment = nonEmpty(envValue);
  if (fromEnvironment) return { value: fromEnvironment, source: "environment" };
  if (configValue !== undefined) return { value: configValue, source: "config file" };
  return { value: fallback, source: "built-in default" };
}

function resolveBaseUrlSetting(
  envValue: string | undefined,
  configValue: string | undefined,
  configName: string,
): ResolvedSetting {
  const fromEnvironment = nonEmpty(envValue);
  if (fromEnvironment) {
    return { value: resolveBaseUrl(fromEnvironment), source: "environment" };
  }
  if (configValue !== undefined) {
    return {
      value: resolveBaseUrl(configValue, `${configName} baseUrl`),
      source: "config file",
    };
  }
  return { value: resolveBaseUrl(undefined), source: "built-in default" };
}

/** Resolves each setting independently; roles never inherit from one another. */
export function resolveOpenRouterConfig(
  options: Pick<CliOptions, "model" | "judgeModel">,
  env: NodeJS.ProcessEnv = process.env,
  configPath: string = OPENROUTER_CONFIG_PATH,
): ResolvedOpenRouterConfig {
  const values = loadOpenRouterConfig(configPath);
  return {
    model: resolveSetting(
      "--model",
      options.model,
      env.OPENROUTER_MODEL,
      values?.model,
      DEFAULT_MODEL,
    ),
    judgeModel: resolveSetting(
      "--judge-model",
      options.judgeModel,
      env.OPENROUTER_JUDGE_MODEL,
      values?.judgeModel,
      DEFAULT_JUDGE_MODEL,
    ),
    baseUrl: resolveBaseUrlSetting(
      env.OPENROUTER_BASE_URL,
      values?.baseUrl,
      configLabel(configPath),
    ),
    configPath,
    configExists: values !== undefined,
  };
}

/** Pure diagnostic output; the API key is reported only as SET or NOT SET. */
export function formatOpenRouterConfiguration(
  resolved: ResolvedOpenRouterConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return [
    "OpenRouter configuration",
    "",
    `Generation model: ${resolved.model.value}`,
    `  Source: ${resolved.model.source}`,
    "",
    `Judge model: ${resolved.judgeModel.value}`,
    `  Source: ${resolved.judgeModel.source}`,
    "",
    `Base URL: ${resolved.baseUrl.value}`,
    `  Source: ${resolved.baseUrl.source}`,
    "",
    `API key: ${env.OPENROUTER_API_KEY?.trim() ? "SET" : "NOT SET"}`,
    "",
    "Configuration file:",
    `  ${configLabel(resolved.configPath)}`,
  ].join("\n");
}
