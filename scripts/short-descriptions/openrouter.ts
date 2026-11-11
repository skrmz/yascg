import { z } from "zod";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TIMEOUT_MS,
} from "./cli.ts";
import type { SourceText } from "./files.ts";
import { buildGenerationPrompt, buildJudgePrompt, type JudgePromptInput } from "./prompt.ts";

/**
 * Minimal OpenRouter adapter built on the platform `fetch`. It is authoring-only
 * and is never imported by `src/`, `index.html`, or `vite.config.ts`.
 */

export type FailureKind =
  | "missing-key"
  | "auth"
  | "model-not-found"
  | "response-format"
  | "request"
  | "invalid-output"
  | "rate-limit"
  | "server"
  | "timeout"
  | "network";

export type AdapterStage = "generation" | "judgement" | "pricing";

export class OpenRouterError extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly stage: AdapterStage,
    message: string,
    readonly nextAction: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CallResult<T> {
  value: T;
  usage: Usage | null;
}

export const generatedCandidateSchema = z.strictObject({
  spellId: z.string().trim().min(1),
  description: z.string(),
  higherLevels: z.string().optional(),
});

export type GeneratedCandidate = z.infer<typeof generatedCandidateSchema>;

export const SEVERITIES = ["none", "low", "medium", "high"] as const;
export const FINDING_SEVERITIES = ["low", "medium", "high"] as const;

export const judgementFindingSchema = z.strictObject({
  category: z.string().trim().min(1),
  severity: z.enum(FINDING_SEVERITIES),
  sourceEvidence: z.string(),
  candidateEvidence: z.string(),
  explanation: z.string(),
});

export const judgementSchema = z.strictObject({
  spellId: z.string().trim().min(1),
  mechanicallyEquivalent: z.boolean(),
  severity: z.enum(SEVERITIES),
  findings: z.array(judgementFindingSchema),
});

export type Judgement = z.infer<typeof judgementSchema>;
export type JudgementFinding = z.infer<typeof judgementFindingSchema>;

export interface ModelPricing {
  promptPerToken: number;
  completionPerToken: number;
}

export interface OpenRouterAdapterOptions {
  apiKey: string;
  model: string;
  judgeModel: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  maxOutputTokens?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

interface ChatSchema {
  name: string;
  schema: Record<string, unknown>;
}

const CANDIDATE_JSON_SCHEMA: ChatSchema = {
  name: "short_description",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["spellId", "description"],
    properties: {
      spellId: { type: "string" },
      description: { type: "string" },
      higherLevels: { type: "string" },
    },
  },
};

const JUDGEMENT_JSON_SCHEMA: ChatSchema = {
  name: "semantic_comparison",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["spellId", "mechanicallyEquivalent", "severity", "findings"],
    properties: {
      spellId: { type: "string" },
      mechanicallyEquivalent: { type: "boolean" },
      severity: { type: "string", enum: [...SEVERITIES] },
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "severity", "sourceEvidence", "candidateEvidence", "explanation"],
          properties: {
            category: { type: "string" },
            severity: { type: "string", enum: [...FINDING_SEVERITIES] },
            sourceEvidence: { type: "string" },
            candidateEvidence: { type: "string" },
            explanation: { type: "string" },
          },
        },
      },
    },
  },
};

interface ParsedUsageSource {
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
}

function parseUsage(body: unknown): Usage | null {
  if (typeof body !== "object" || body === null) return null;
  const usage = (body as ParsedUsageSource).usage;
  if (!usage || typeof usage !== "object") return null;
  const prompt = usage.prompt_tokens;
  const completion = usage.completion_tokens;
  if (typeof prompt !== "number" || typeof completion !== "number") return null;
  const total = typeof usage.total_tokens === "number" ? usage.total_tokens : prompt + completion;
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

function contentOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" ? message.content : null;
}

function excerpt(text: string): string {
  const cleaned = text.replace(/sk-or-[A-Za-z0-9_-]+/g, "sk-or-[redacted]").trim();
  return cleaned.length > 200 ? `${cleaned.slice(0, 197)}...` : cleaned;
}

function classifyStatus(status: number, bodyText: string): FailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "model-not-found";
  if (status === 429) return "rate-limit";
  if (status === 408 || status >= 500) return "server";
  if (status === 400 || status === 422) {
    return /response_?format|json_schema|schema/i.test(bodyText) ? "response-format" : "request";
  }
  return "request";
}

function nextActionFor(kind: FailureKind, status?: number): string {
  switch (kind) {
    case "missing-key":
      return "Set OPENROUTER_API_KEY for the current PowerShell session and retry.";
    case "auth":
      return "Check that the key is valid and authorized for this model; authentication failures are not retried.";
    case "model-not-found":
      return "Check the model id (--model/--judge-model) and that the account can access it.";
    case "response-format":
      return "The provider rejected JSON-schema response formatting; choose a model that supports structured output.";
    case "request":
      return `The provider rejected the request${status ? ` (HTTP ${status})` : ""}; review the model and request shape.`;
    case "invalid-output":
      return "The model returned text that is not the required JSON schema; the entry was not written.";
    case "rate-limit":
      return "Rate limited after bounded retries; wait and rerun the selection.";
    case "server":
      return "Provider-side server error or timeout after bounded retries; rerun later.";
    case "timeout":
      return "The request exceeded the configured timeout after bounded retries; rerun or raise --timeout-ms.";
    case "network":
      return "A transient network error occurred after bounded retries; check connectivity and rerun.";
  }
}

const RETRYABLE: ReadonlySet<FailureKind> = new Set(["rate-limit", "server", "timeout", "network"]);

const DEFAULT_SLEEP = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class OpenRouterAdapter {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly maxOutputTokens: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly options: OpenRouterAdapterOptions) {
    if (!options.apiKey) {
      throw new OpenRouterError(
        "missing-key",
        "generation",
        "OPENROUTER_API_KEY is not set.",
        nextActionFor("missing-key"),
      );
    }
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    this.sleep = options.sleep ?? DEFAULT_SLEEP;
    this.random = options.random ?? Math.random;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  get generationModel(): string {
    return this.options.model;
  }

  get judgeModel(): string {
    return this.options.judgeModel;
  }

  private backoffDelay(attempt: number): number {
    const base = 400 * 2 ** (attempt - 1);
    return Math.round(base + this.random() * base * 0.5);
  }

  private async postChat(
    stage: AdapterStage,
    model: string,
    prompt: string,
    chatSchema: ChatSchema,
  ): Promise<CallResult<unknown>> {
    const url = `${this.baseUrl}/chat/completions`;
    let lastError: OpenRouterError | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/yascg/spell-cards-generator",
            "X-Title": "spell-cards-generator short descriptions",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: this.maxOutputTokens,
            response_format: {
              type: "json_schema",
              json_schema: { name: chatSchema.name, strict: true, schema: chatSchema.schema },
            },
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        const aborted =
          error instanceof Error && /abort|timeout/i.test(`${error.name} ${error.message}`);
        const kind: FailureKind = aborted ? "timeout" : "network";
        lastError = new OpenRouterError(
          kind,
          stage,
          `${stage} request failed: ${error instanceof Error ? error.message : String(error)}`,
          nextActionFor(kind),
        );
        if (RETRYABLE.has(kind) && attempt < this.maxAttempts) {
          await this.sleep(this.backoffDelay(attempt));
          continue;
        }
        throw lastError;
      }

      const bodyText = await response.text().catch(() => "");
      if (!response.ok) {
        const kind = classifyStatus(response.status, bodyText);
        lastError = new OpenRouterError(
          kind,
          stage,
          `${stage} request failed (HTTP ${response.status}): ${excerpt(bodyText)}`,
          nextActionFor(kind, response.status),
          response.status,
        );
        if (RETRYABLE.has(kind) && attempt < this.maxAttempts) {
          await this.sleep(this.backoffDelay(attempt));
          continue;
        }
        throw lastError;
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(bodyText) as unknown;
      } catch {
        throw new OpenRouterError(
          "invalid-output",
          stage,
          `${stage} response was not valid JSON.`,
          nextActionFor("invalid-output"),
          response.status,
        );
      }
      const content = contentOf(parsedBody);
      if (content === null) {
        throw new OpenRouterError(
          "invalid-output",
          stage,
          `${stage} response contained no message content.`,
          nextActionFor("invalid-output"),
          response.status,
        );
      }
      let json: unknown;
      try {
        json = JSON.parse(content) as unknown;
      } catch {
        throw new OpenRouterError(
          "invalid-output",
          stage,
          `${stage} response content was not valid JSON.`,
          nextActionFor("invalid-output"),
          response.status,
        );
      }
      return { value: json, usage: parseUsage(parsedBody) };
    }

    throw (
      lastError ?? new OpenRouterError("server", stage, `${stage} failed.`, nextActionFor("server"))
    );
  }

  async generateCandidate(
    locale: string,
    spell: SourceText & { id: string },
  ): Promise<CallResult<GeneratedCandidate>> {
    const prompt = buildGenerationPrompt(locale, spell);
    const result = await this.postChat(
      "generation",
      this.options.model,
      prompt,
      CANDIDATE_JSON_SCHEMA,
    );
    const parsed = generatedCandidateSchema.safeParse(result.value);
    if (!parsed.success) {
      throw new OpenRouterError(
        "invalid-output",
        "generation",
        `generation response failed local schema validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        nextActionFor("invalid-output"),
      );
    }
    return { value: parsed.data, usage: result.usage };
  }

  async compareCandidate(input: JudgePromptInput): Promise<CallResult<Judgement>> {
    const prompt = buildJudgePrompt(input);
    const result = await this.postChat(
      "judgement",
      this.options.judgeModel,
      prompt,
      JUDGEMENT_JSON_SCHEMA,
    );
    const parsed = judgementSchema.safeParse(result.value);
    if (!parsed.success) {
      throw new OpenRouterError(
        "invalid-output",
        "judgement",
        `judgement response failed local schema validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        nextActionFor("invalid-output"),
      );
    }
    return { value: parsed.data, usage: result.usage };
  }

  /** Reads per-token pricing once per run. Returns `null` when unavailable. */
  async loadPricing(): Promise<Map<string, ModelPricing> | null> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        body === null ||
        !Array.isArray((body as { data?: unknown }).data)
      ) {
        return null;
      }
      const pricing = new Map<string, ModelPricing>();
      for (const model of (body as { data: unknown[] }).data) {
        if (typeof model !== "object" || model === null) continue;
        const record = model as {
          id?: unknown;
          pricing?: { prompt?: unknown; completion?: unknown };
        };
        if (typeof record.id !== "string" || !record.pricing) continue;
        const prompt = Number(record.pricing.prompt);
        const completion = Number(record.pricing.completion);
        if (!Number.isFinite(prompt) || !Number.isFinite(completion)) continue;
        pricing.set(record.id, { promptPerToken: prompt, completionPerToken: completion });
      }
      return pricing.size > 0 ? pricing : null;
    } catch {
      return null;
    }
  }
}
