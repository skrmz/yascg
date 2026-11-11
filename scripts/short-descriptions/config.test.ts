import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_BASE_URL,
  DEFAULT_JUDGE_MODEL,
  DEFAULT_MODEL,
  CliError,
  EXIT_OK,
  parseCliOptions,
  resolveCredentials,
} from "./cli.ts";
import {
  OPENROUTER_CONFIG_LABEL,
  OPENROUTER_CONFIG_PATH,
  formatOpenRouterConfiguration,
  loadOpenRouterConfig,
  resolveOpenRouterConfig,
} from "./config.ts";
import { runGeneration } from "./generate.ts";
import { createTempWorkspace, seedWorkspace } from "./test-helpers.ts";

async function writeConfig(value: unknown): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "sd-config-"));
  const filePath = path.join(root, "openrouter.config.json");
  const text = typeof value === "string" ? value : JSON.stringify(value);
  await writeFile(filePath, text, "utf8");
  return filePath;
}

async function missingConfig(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "sd-config-missing-"));
  return path.join(root, "openrouter.config.json");
}

describe("OpenRouter configuration loading", () => {
  it("loads a valid configuration with trimmed values", async () => {
    const filePath = await writeConfig({
      model: " config/model ",
      judgeModel: "config/judge",
      baseUrl: " https://proxy.example/api/v1 ",
    });
    expect(loadOpenRouterConfig(filePath)).toEqual({
      model: "config/model",
      judgeModel: "config/judge",
      baseUrl: "https://proxy.example/api/v1",
    });
  });

  it("treats a missing file as absent", async () => {
    expect(loadOpenRouterConfig(await missingConfig())).toBeUndefined();
  });

  it("parses the committed configuration with exactly the allowed keys", () => {
    const values = loadOpenRouterConfig();
    expect(values).toEqual({
      model: "deepseek/deepseek-v4.1-flash-1017",
      judgeModel: "deepseek/deepseek-v4.1-flash-1017",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    expect(Object.keys(values ?? {}).sort()).toEqual(["baseUrl", "judgeModel", "model"]);
    expect(OPENROUTER_CONFIG_LABEL).toBe("scripts/short-descriptions/openrouter.config.json");
    expect(
      OPENROUTER_CONFIG_PATH.endsWith(
        path.join("scripts", "short-descriptions", "openrouter.config.json"),
      ),
    ).toBe(true);
  });

  it("rejects malformed JSON and names the file without echoing contents", async () => {
    const filePath = await writeConfig('{ "model": "x",, }');
    expect(() => loadOpenRouterConfig(filePath)).toThrow(CliError);
    expect(() => loadOpenRouterConfig(filePath)).toThrow(/Invalid JSON.*openrouter\.config\.json/);
  });

  it("rejects non-object roots", async () => {
    for (const value of [[], null, '"model"', 3]) {
      const filePath = await writeConfig(value);
      expect(() => loadOpenRouterConfig(filePath)).toThrow(/must contain a JSON object/);
    }
  });

  it("rejects wrong types and empty identifiers, naming the property", async () => {
    const wrongType = await writeConfig({ model: 3 });
    expect(() => loadOpenRouterConfig(wrongType)).toThrow(/"model" must be a non-empty string/);

    const empty = await writeConfig({ judgeModel: "   " });
    expect(() => loadOpenRouterConfig(empty)).toThrow(/"judgeModel" must be a non-empty string/);

    const emptyBaseUrl = await writeConfig({ baseUrl: "" });
    expect(() => loadOpenRouterConfig(emptyBaseUrl)).toThrow(
      /"baseUrl" must be a non-empty string/,
    );
  });

  it("rejects unknown properties", async () => {
    const filePath = await writeConfig({ temperature: 0.2 });
    expect(() => loadOpenRouterConfig(filePath)).toThrow(/Unknown property "temperature"/);
  });

  it("rejects credential-like properties without echoing their values", async () => {
    for (const property of [
      "apiKey",
      "OPENROUTER_API_KEY",
      "api_key",
      "token",
      "secret",
      "password",
    ]) {
      const filePath = await writeConfig({ [property]: "sk-or-v1-shouldnotappear" });
      let message = "";
      try {
        loadOpenRouterConfig(filePath);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toMatch(/Credentials must never be committed/);
      expect(message).toContain(property);
      expect(message).not.toContain("shouldnotappear");
    }
  });
});

describe("OpenRouter configuration resolution", () => {
  it("uses built-in defaults when no file or overrides exist", async () => {
    const resolved = resolveOpenRouterConfig({}, {}, await missingConfig());
    expect(resolved.model).toEqual({ value: DEFAULT_MODEL, source: "built-in default" });
    expect(resolved.judgeModel).toEqual({
      value: DEFAULT_JUDGE_MODEL,
      source: "built-in default",
    });
    expect(resolved.baseUrl).toEqual({ value: DEFAULT_BASE_URL, source: "built-in default" });
    expect(resolved.configExists).toBe(false);
  });

  it("resolves CLI > environment > config file > built-in default per setting", async () => {
    const filePath = await writeConfig({
      model: "config/model",
      judgeModel: "config/judge",
      baseUrl: "https://config.example/api/v1",
    });
    const env = {
      OPENROUTER_MODEL: "env/model",
      OPENROUTER_JUDGE_MODEL: "env/judge",
      OPENROUTER_BASE_URL: "https://env.example/api/v1",
    };

    expect(resolveOpenRouterConfig({}, env, filePath)).toMatchObject({
      model: { value: "env/model", source: "environment" },
      judgeModel: { value: "env/judge", source: "environment" },
      baseUrl: { value: "https://env.example/api/v1", source: "environment" },
      configExists: true,
    });

    expect(
      resolveOpenRouterConfig({ model: "cli/model", judgeModel: "cli/judge" }, env, filePath),
    ).toMatchObject({
      model: { value: "cli/model", source: "CLI" },
      judgeModel: { value: "cli/judge", source: "CLI" },
      baseUrl: { value: "https://env.example/api/v1", source: "environment" },
    });

    expect(resolveOpenRouterConfig({}, {}, filePath)).toMatchObject({
      model: { value: "config/model", source: "config file" },
      judgeModel: { value: "config/judge", source: "config file" },
      baseUrl: { value: "https://config.example/api/v1", source: "config file" },
    });
  });

  it("keeps generation and judge roles independent", async () => {
    const judgeOnly = await writeConfig({ judgeModel: "config/judge" });
    expect(resolveOpenRouterConfig({}, {}, judgeOnly)).toMatchObject({
      model: { value: DEFAULT_MODEL, source: "built-in default" },
      judgeModel: { value: "config/judge", source: "config file" },
    });

    const generationOnly = await writeConfig({ model: "config/model" });
    expect(resolveOpenRouterConfig({}, {}, generationOnly)).toMatchObject({
      model: { value: "config/model", source: "config file" },
      judgeModel: { value: DEFAULT_JUDGE_MODEL, source: "built-in default" },
    });
  });

  it("ignores empty environment values and rejects explicit empty CLI flags", async () => {
    const filePath = await writeConfig({ model: "config/model", judgeModel: "config/judge" });
    expect(
      resolveOpenRouterConfig(
        {},
        { OPENROUTER_MODEL: "   ", OPENROUTER_JUDGE_MODEL: "" },
        filePath,
      ),
    ).toMatchObject({
      model: { value: "config/model", source: "config file" },
      judgeModel: { value: "config/judge", source: "config file" },
    });

    expect(() => resolveOpenRouterConfig({ model: "" }, {}, filePath)).toThrow(
      /--model must not be empty/,
    );
    expect(() => resolveOpenRouterConfig({ judgeModel: "  " }, {}, filePath)).toThrow(
      /--judge-model must not be empty/,
    );
  });

  it("sanitizes the configured base URL and names the setting when invalid", async () => {
    const sanitized = await writeConfig({
      baseUrl: "https://user:pass@proxy.example/api/v1?token=abc#fragment",
    });
    expect(resolveOpenRouterConfig({}, {}, sanitized).baseUrl).toEqual({
      value: "https://proxy.example/api/v1",
      source: "config file",
    });

    const invalid = await writeConfig({ baseUrl: "not a url" });
    expect(() => resolveOpenRouterConfig({}, {}, invalid)).toThrow(
      /baseUrl is not a valid absolute URL/,
    );

    expect(() =>
      resolveOpenRouterConfig({}, { OPENROUTER_BASE_URL: "not a url" }, sanitized),
    ).toThrow(/OPENROUTER_BASE_URL is not a valid absolute URL/);
  });

  it("reads the API key only from the environment", async () => {
    const filePath = await writeConfig({ apiKey: "sk-or-v1-shouldnotappear" });
    expect(() => loadOpenRouterConfig(filePath)).toThrow(/Credentials must never be committed/);
    expect(() => resolveCredentials({}, DEFAULT_BASE_URL)).toThrow(/OPENROUTER_API_KEY/);
    expect(
      resolveCredentials({ OPENROUTER_API_KEY: "secret" }, "https://proxy.example/api/v1"),
    ).toEqual({ apiKey: "secret", baseUrl: "https://proxy.example/api/v1" });
  });
});

describe("effective configuration output", () => {
  it("formats the resolved settings without a key", async () => {
    const filePath = await writeConfig({ model: "config/model" });
    const output = formatOpenRouterConfiguration(resolveOpenRouterConfig({}, {}, filePath), {});
    expect(output).toContain("OpenRouter configuration");
    expect(output).toContain("Generation model: config/model");
    expect(output).toContain("Source: config file");
    expect(output).toContain(`Judge model: ${DEFAULT_JUDGE_MODEL}`);
    expect(output).toContain("Source: built-in default");
    expect(output).toContain(`Base URL: ${DEFAULT_BASE_URL}`);
    expect(output).toContain("API key: NOT SET");
    expect(output).toContain("Configuration file:");
    expect(output).toContain("openrouter.config.json");
  });

  it("reports SET without exposing the key or its length", async () => {
    const key = "sk-or-v1-supersecretvalue";
    const output = formatOpenRouterConfiguration(
      resolveOpenRouterConfig({}, {}, await missingConfig()),
      { OPENROUTER_API_KEY: key },
    );
    expect(output).toContain("API key: SET");
    expect(output).not.toContain(key);
    expect(output).not.toContain("sk-or");
    expect(output).not.toContain("supersecret");
    expect(output).not.toContain(String(key.length));
  });

  it("supports --show-config without credentials, locale, or ids", () => {
    const options = parseCliOptions(["--show-config"]);
    expect(options.showConfig).toBe(true);
    expect(options.locale).toBeUndefined();
    expect(options.ids).toBeUndefined();
    const output = formatOpenRouterConfiguration(resolveOpenRouterConfig(options, {}), {});
    expect(output).toContain("API key: NOT SET");
  });
});

describe("generation wiring", () => {
  it("fails fast on a malformed configuration even for --dry-run", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    const configPath = await writeConfig("{ not json");
    await expect(
      runGeneration(
        { ...parseCliOptions([]), dryRun: true },
        { workspace, configPath, env: {}, log: () => undefined },
      ),
    ).rejects.toThrow(/Invalid JSON/);
  });

  it("runs a dry-run with a valid configuration and no key", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    const configPath = await writeConfig({ model: "config/model" });
    const result = await runGeneration(
      { ...parseCliOptions([]), dryRun: true },
      { workspace, configPath, env: {}, log: () => undefined },
    );
    expect(result.exitCode).toBe(EXIT_OK);
  });
});
