import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_MAX_ENTRIES,
  CliError,
  parseCliOptions,
  redact,
  resolveBaseUrl,
  resolveCredentials,
} from "./cli.ts";

describe("short-descriptions CLI options", () => {
  it("parses flags and defaults", () => {
    const options = parseCliOptions([]);
    expect(options.dryRun).toBe(false);
    expect(options.maxEntries).toBe(DEFAULT_MAX_ENTRIES);
    expect(options.ids).toBeUndefined();
    expect(options.locale).toBeUndefined();
    expect(options.showConfig).toBe(false);
    expect(options.timings).toBe(false);
  });

  it("parses ids, locale, limits, and numeric options", () => {
    const options = parseCliOptions([
      "--ids",
      "srd-a, srd-b,srd-a",
      "--locale",
      "de",
      "--limit",
      "2",
      "--max-cost",
      "0.5",
      "--max-output-tokens",
      "800",
      "--timeout-ms",
      "1000",
      "--max-attempts",
      "2",
      "--regenerate",
      "--dry-run",
    ]);
    expect(options.ids).toEqual(["srd-a", "srd-b"]);
    expect(options.locale).toBe("de");
    expect(options.limit).toBe(2);
    expect(options.maxCost).toBe(0.5);
    expect(options.maxOutputTokens).toBe(800);
    expect(options.timeoutMs).toBe(1000);
    expect(options.maxAttempts).toBe(2);
    expect(options.regenerate).toBe(true);
    expect(options.dryRun).toBe(true);
  });

  it("rejects invalid numeric and unknown flags", () => {
    expect(() => parseCliOptions(["--limit", "0"])).toThrow(CliError);
    expect(() => parseCliOptions(["--limit", "two"])).toThrow(/--limit/);
    expect(() => parseCliOptions(["--max-cost", "-1"])).toThrow(/--max-cost/);
    expect(() => parseCliOptions(["--unknown"])).toThrow();
  });

  it("parses --show-config", () => {
    expect(parseCliOptions(["--show-config"]).showConfig).toBe(true);
    expect(parseCliOptions(["--", "--show-config"]).showConfig).toBe(true);
  });

  it("parses --timings", () => {
    expect(parseCliOptions(["--timings"]).timings).toBe(true);
    expect(parseCliOptions([]).timings).toBe(false);
  });

  it("requires the API key from the environment only", () => {
    expect(() => resolveCredentials({})).toThrow(/OPENROUTER_API_KEY/);
    expect(resolveCredentials({ OPENROUTER_API_KEY: "secret" }).apiKey).toBe("secret");
  });

  it("returns the already-resolved base URL with the key", () => {
    expect(resolveCredentials({ OPENROUTER_API_KEY: "secret" }).baseUrl).toBe(
      "https://openrouter.ai/api/v1",
    );
    expect(
      resolveCredentials({ OPENROUTER_API_KEY: "secret" }, "https://proxy.example/api/v1").baseUrl,
    ).toBe("https://proxy.example/api/v1");
  });

  it("strips credentials, query, and fragment from the base URL", () => {
    expect(resolveBaseUrl("https://user:pass@proxy.example/api/v1?token=abc#x")).toBe(
      "https://proxy.example/api/v1",
    );
    expect(resolveBaseUrl(undefined)).toBe("https://openrouter.ai/api/v1");
    expect(() => resolveBaseUrl("not a url")).toThrow(/OPENROUTER_BASE_URL/);
    expect(() => resolveBaseUrl("not a url", "config baseUrl")).toThrow(/config baseUrl/);
  });

  it("redacts keys and bearer tokens", () => {
    const text = "Authorization: Bearer sk-or-v1-abcdef and sk-or-v1-xyz";
    const redacted = redact(text);
    expect(redacted).not.toContain("abcdef");
    expect(redacted).not.toContain("xyz");
    expect(redacted).toContain("[redacted]");
  });
});
