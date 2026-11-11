import { describe, expect, it } from "vite-plus/test";
import { OpenRouterAdapter, OpenRouterError } from "./openrouter.ts";
import { buildJudgePrompt, buildGenerationPrompt } from "./prompt.ts";

const SPELL = {
  id: "srd-fireball",
  name: "Fireball",
  level: 3,
  description: ["A bright streak flashes."],
  higherLevels: ["More damage."],
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

function chatBody(
  content: unknown,
  usage: Record<string, number> | null = {
    prompt_tokens: 12,
    completion_tokens: 8,
    total_tokens: 20,
  },
): unknown {
  return {
    choices: [
      { message: { content: typeof content === "string" ? content : JSON.stringify(content) } },
    ],
    ...(usage ? { usage } : {}),
  };
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
}

function assertStrictObjectSchemas(schema: JsonSchema): void {
  if (schema.type === "object") {
    expect(schema.additionalProperties).toBe(false);
    const propertyNames = Object.keys(schema.properties ?? {});
    expect(new Set(schema.required ?? [])).toEqual(new Set(propertyNames));
    for (const property of Object.values(schema.properties ?? {})) {
      assertStrictObjectSchemas(property);
    }
  }
  if (schema.type === "array" && schema.items) {
    assertStrictObjectSchemas(schema.items);
  }
}

interface Recorded {
  url: string;
  init: RequestInit;
}

function makeAdapter(
  handler: (url: string, init: RequestInit, call: number) => Promise<Response> | Response,
  overrides: Partial<ConstructorParameters<typeof OpenRouterAdapter>[0]> = {},
) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  }) as unknown as typeof fetch;
  const adapter = new OpenRouterAdapter({
    apiKey: "test-key",
    model: "test/model",
    judgeModel: "test/judge",
    fetchImpl,
    sleep: async () => undefined,
    random: () => 0,
    maxAttempts: 3,
    ...overrides,
  });
  return { adapter, calls };
}

describe("OpenRouter adapter generation", () => {
  it("sends a structured request and returns the candidate with usage", async () => {
    const { adapter, calls } = makeAdapter(() =>
      jsonResponse(
        chatBody({ spellId: "srd-fireball", description: "Short text.", higherLevels: "More." }),
      ),
    );

    const result = await adapter.generateCandidate("en", SPELL);

    expect(result.value).toEqual({
      spellId: "srd-fireball",
      description: "Short text.",
      higherLevels: "More.",
    });
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 8, totalTokens: 20 });
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse((calls[0] as Recorded).init.body as string) as Record<string, unknown>;
    expect(body.model).toBe("test/model");
    expect(body.response_format).toMatchObject({ type: "json_schema" });
    expect(body.reasoning).toEqual({ effort: "none" });
    const schema = (body.response_format as { json_schema?: { schema?: JsonSchema } }).json_schema
      ?.schema;
    expect(schema).toBeDefined();
    if (schema) assertStrictObjectSchemas(schema);
    expect(((calls[0] as Recorded).init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key",
    );
  });

  it("reads OpenAI content-part arrays", async () => {
    const { adapter } = makeAdapter(() =>
      jsonResponse({
        choices: [
          {
            message: {
              content: [
                { type: "text", text: '{"spellId":"srd-fireball",' },
                { type: "text", text: '"description":"Short text."}' },
              ],
            },
            finish_reason: "stop",
          },
        ],
      }),
    );

    const result = await adapter.generateCandidate("en", SPELL);
    expect(result.value).toEqual({ spellId: "srd-fireball", description: "Short text." });
  });

  it("reports an incomplete reasoning-limited response without exposing response text", async () => {
    const { adapter, calls } = makeAdapter(() =>
      jsonResponse({
        choices: [
          {
            message: { content: null, reasoning: "private chain of thought" },
            finish_reason: "length",
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 1200,
          total_tokens: 1300,
          completion_tokens_details: { reasoning_tokens: 1200 },
        },
      }),
    );

    const error = await adapter.generateCandidate("en", SPELL).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OpenRouterError);
    expect(error).toMatchObject({ kind: "incomplete", stage: "generation", status: 200 });
    const failure = error as OpenRouterError;
    expect(failure.message).toContain("finish reason: length");
    expect(failure.message).toContain("reasoning tokens: 1200");
    expect(failure.nextAction).toContain("--max-output-tokens");
    expect(failure.message).not.toContain("private chain of thought");
    expect(calls).toHaveLength(1);
  });

  it("reports truncated JSON as incomplete when the finish reason is length", async () => {
    const { adapter } = makeAdapter(() =>
      jsonResponse({
        choices: [{ message: { content: '{"spellId":"srd-fireball",' }, finish_reason: "length" }],
      }),
    );

    await expect(adapter.generateCandidate("en", SPELL)).rejects.toMatchObject({
      kind: "incomplete",
      stage: "generation",
    });
  });

  it("surfaces a provider error returned with HTTP 200", async () => {
    const { adapter } = makeAdapter(() =>
      jsonResponse({
        error: { code: 400, message: "Invalid schema for response_format 'short_description'" },
      }),
    );

    await expect(adapter.generateCandidate("en", SPELL)).rejects.toMatchObject({
      kind: "response-format",
      status: 200,
    });
  });

  it("retries a rate limit and then succeeds", async () => {
    const { adapter, calls } = makeAdapter((_url, _init, call) =>
      call === 1
        ? jsonResponse({ error: "slow down" }, 429)
        : jsonResponse(chatBody({ spellId: "srd-fireball", description: "Short." })),
    );

    const result = await adapter.generateCandidate("en", SPELL);

    expect(calls).toHaveLength(2);
    expect(result.value.description).toBe("Short.");
  });

  it("does not retry authentication failures", async () => {
    const { adapter, calls } = makeAdapter(() => jsonResponse({ error: "no" }, 401));
    await expect(adapter.generateCandidate("en", SPELL)).rejects.toMatchObject({ kind: "auth" });
    expect(calls).toHaveLength(1);
  });

  it("classifies response-format and model-not-found failures", async () => {
    const format = makeAdapter(() =>
      jsonResponse({ error: "response_format json_schema unsupported" }, 400),
    );
    await expect(format.adapter.generateCandidate("en", SPELL)).rejects.toMatchObject({
      kind: "response-format",
    });

    const notFound = makeAdapter(() => jsonResponse({ error: "nope" }, 404));
    await expect(notFound.adapter.generateCandidate("en", SPELL)).rejects.toMatchObject({
      kind: "model-not-found",
    });
  });

  it("gives up after bounded retries on server errors", async () => {
    const { adapter, calls } = makeAdapter(() => jsonResponse({ error: "boom" }, 500), {
      maxAttempts: 2,
    });
    await expect(adapter.generateCandidate("en", SPELL)).rejects.toMatchObject({ kind: "server" });
    expect(calls).toHaveLength(2);
  });

  it("classifies timeouts without retrying past the attempt bound", async () => {
    const { adapter, calls } = makeAdapter(
      async () => {
        throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
      },
      { maxAttempts: 1 },
    );
    await expect(adapter.generateCandidate("en", SPELL)).rejects.toMatchObject({ kind: "timeout" });
    expect(calls).toHaveLength(1);
  });

  it("rejects malformed model output instead of guessing", async () => {
    const { adapter } = makeAdapter(() => jsonResponse(chatBody("not json at all")));
    await expect(adapter.generateCandidate("en", SPELL)).rejects.toMatchObject({
      kind: "invalid-output",
      stage: "generation",
    });

    const wrongShape = makeAdapter(() => jsonResponse(chatBody({ spellId: "srd-fireball" })));
    await expect(wrongShape.adapter.generateCandidate("en", SPELL)).rejects.toMatchObject({
      kind: "invalid-output",
    });
  });

  it("reports missing usage as null", async () => {
    const { adapter } = makeAdapter(() =>
      jsonResponse(chatBody({ spellId: "srd-fireball", description: "Short." }, null)),
    );
    const result = await adapter.generateCandidate("en", SPELL);
    expect(result.usage).toBeNull();
  });

  it("redacts credentials echoed by the provider", async () => {
    const { adapter } = makeAdapter(() =>
      jsonResponse("Authorization: Bearer sk-or-v1-secretvalue rejected", 400),
    );
    const error = await adapter.generateCandidate("en", SPELL).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OpenRouterError);
    expect(String((error as OpenRouterError).message)).not.toContain("secretvalue");
  });

  it("requires a key at construction", () => {
    expect(() => new OpenRouterAdapter({ apiKey: "", model: "m", judgeModel: "j" })).toThrow(
      OpenRouterError,
    );
  });
});

describe("OpenRouter adapter judgement and pricing", () => {
  it("validates the judgement schema", async () => {
    const { adapter, calls } = makeAdapter(() =>
      jsonResponse(
        chatBody({
          spellId: "srd-fireball",
          mechanicallyEquivalent: true,
          severity: "none",
          findings: [],
        }),
      ),
    );
    const result = await adapter.compareCandidate({
      locale: "en",
      spellId: "srd-fireball",
      source: SPELL,
      candidate: { description: "Short." },
      unresolvedItems: [],
    });
    expect(result.value.mechanicallyEquivalent).toBe(true);
    const body = JSON.parse((calls[0] as Recorded).init.body as string) as Record<string, unknown>;
    expect(body.model).toBe("test/judge");
    expect(body.reasoning).toEqual({ effort: "none" });
    const schema = (body.response_format as { json_schema?: { schema?: JsonSchema } }).json_schema
      ?.schema;
    expect(schema).toBeDefined();
    if (schema) assertStrictObjectSchemas(schema);
  });

  it("rejects a judgement with an unknown severity", async () => {
    const { adapter } = makeAdapter(() =>
      jsonResponse(
        chatBody({
          spellId: "srd-fireball",
          mechanicallyEquivalent: true,
          severity: "critical",
          findings: [],
        }),
      ),
    );
    await expect(
      adapter.compareCandidate({
        locale: "en",
        spellId: "srd-fireball",
        source: SPELL,
        candidate: { description: "Short." },
        unresolvedItems: [],
      }),
    ).rejects.toMatchObject({ kind: "invalid-output", stage: "judgement" });
  });

  it("loads per-token pricing and tolerates malformed responses", async () => {
    const ok = makeAdapter(() =>
      jsonResponse({
        data: [{ id: "test/model", pricing: { prompt: "0.000001", completion: "0.000002" } }],
      }),
    );
    const pricing = await ok.adapter.loadPricing();
    expect(pricing?.get("test/model")).toEqual({
      promptPerToken: 0.000001,
      completionPerToken: 0.000002,
    });

    const notOk = makeAdapter(() => jsonResponse({ error: "no" }, 500));
    expect(await notOk.adapter.loadPricing()).toBeNull();

    const malformed = makeAdapter(() => jsonResponse({ data: "nope" }));
    expect(await malformed.adapter.loadPricing()).toBeNull();
  });
});

describe("prompt construction", () => {
  it("includes locale, source text, and the JSON instruction", () => {
    const prompt = buildGenerationPrompt("en", SPELL);
    expect(prompt).toContain('locale "en"');
    expect(prompt).toContain("A bright streak flashes.");
    expect(prompt).toContain('"spellId":"srd-fireball"');
    expect(prompt).toContain("No raw HTML");
    expect(prompt).toContain("empty string");
  });

  it("lists unresolved items in the judge prompt", () => {
    const prompt = buildJudgePrompt({
      locale: "en",
      spellId: "srd-fireball",
      source: SPELL,
      candidate: { description: "Short." },
      unresolvedItems: ["distance: source [1 mile] vs candidate [1 Meile]"],
    });
    expect(prompt).toContain("1 mile");
    expect(prompt).toContain("mechanicallyEquivalent");
  });

  it("gives the judge the spell metadata that the app displays separately", () => {
    const prompt = buildJudgePrompt({
      locale: "de",
      spellId: "srd-animate-dead",
      source: {
        ...SPELL,
        castingTime: "1 Minute",
        range: "3 Meter",
        duration: "Unmittelbar",
      },
      candidate: { description: "Kurz." },
      unresolvedItems: [],
    });
    expect(prompt).toContain("Spell metadata");
    expect(prompt).toContain("Casting time: 1 Minute");
    expect(prompt).toContain("Range: 3 Meter");
    expect(prompt).toContain("Duration: Unmittelbar");
    expect(prompt).toContain("restates this metadata is not a mechanical change");
  });
});
