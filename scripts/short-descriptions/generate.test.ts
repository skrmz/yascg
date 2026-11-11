import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import { sourceFingerprint } from "./fingerprint.ts";
import { EXIT_FAILURE, EXIT_OK, EXIT_PARTIAL, parseCliOptions, type CliOptions } from "./cli.ts";
import { runGeneration, selectEntries, type ShortDescriptionAdapter } from "./generate.ts";
import type { GeneratedCandidate, Judgement, ModelPricing, Usage } from "./openrouter.ts";
import {
  HIGHER_LEVELS,
  LONG_DESCRIPTION,
  createTempWorkspace,
  seedWorkspace,
} from "./test-helpers.ts";
import type { SourceText, Workspace } from "./files.ts";

const USAGE: Usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
const FINGERPRINT = sourceFingerprint({
  description: LONG_DESCRIPTION,
  higherLevels: HIGHER_LEVELS,
});

const GOOD_CANDIDATE: GeneratedCandidate = {
  spellId: "srd-fireball",
  description:
    "A streak flashes to a point in range and explodes. Each creature in a 20-foot sphere makes a DEX save, taking 8d6 fire damage or half as much on a success.",
  higherLevels: "The damage increases by 1d6 per slot level above 3rd.",
};

const EQUIVALENT: Judgement = {
  spellId: "srd-fireball",
  mechanicallyEquivalent: true,
  severity: "none",
  findings: [],
};

interface StubOptions {
  candidate?: (spell: SourceText & { id: string }) => GeneratedCandidate;
  judgement?: (spell: SourceText & { id: string }) => Judgement;
  generateError?: Error;
  judgeError?: Error;
  pricing?: Map<string, ModelPricing> | null;
  calls: string[];
}

function stubAdapter(options: StubOptions): ShortDescriptionAdapter {
  return {
    generationModel: "stub/generate",
    judgeModel: "stub/judge",
    async generateCandidate(locale: string, spell: SourceText & { id: string }) {
      options.calls.push(`generate:${locale}:${spell.id}`);
      if (options.generateError) throw options.generateError;
      return {
        value: options.candidate
          ? options.candidate(spell)
          : { ...GOOD_CANDIDATE, spellId: spell.id },
        usage: USAGE,
      };
    },
    async compareCandidate() {
      options.calls.push("judge");
      if (options.judgeError) throw options.judgeError;
      return {
        value: options.judgement
          ? options.judgement({ id: "srd-fireball", ...GOOD_TEXT })
          : EQUIVALENT,
        usage: USAGE,
      };
    },
    async loadPricing() {
      return options.pricing ?? null;
    },
  };
}

const GOOD_TEXT: SourceText = {
  description: LONG_DESCRIPTION,
  higherLevels: HIGHER_LEVELS,
};

function options(overrides: Partial<CliOptions> = {}): CliOptions {
  return { ...parseCliOptions([]), ...overrides };
}

async function readAuthoring(workspace: Workspace, locale = "en"): Promise<unknown> {
  return JSON.parse(await readFile(workspace.authoringFile(locale), "utf8")) as unknown;
}

function entriesOf(file: unknown): Array<Record<string, unknown>> {
  return (file as { entries: Array<Record<string, unknown>> }).entries;
}

async function fileExists(workspace: Workspace): Promise<boolean> {
  try {
    await readFile(workspace.reportFile, "utf8");
    return true;
  } catch {
    return false;
  }
}

describe("generation selection", () => {
  it("selects missing entries by default and existing entries only when asked", async () => {
    const datasets = new Map([
      [
        "en",
        new Map([
          ["srd-fireball", GOOD_TEXT],
          ["srd-light", GOOD_TEXT],
        ]),
      ],
    ]);
    const fingerprints = new Map([
      [
        "en",
        new Map([
          ["srd-fireball", FINGERPRINT],
          ["srd-light", FINGERPRINT],
        ]),
      ],
    ]);
    const manifest = [{ code: "en", displayName: "en", dataset: "/spells.srd.json" }];
    const authoringByLocale = new Map([
      [
        "en",
        {
          locale: "en",
          entries: [
            {
              spellId: "srd-fireball",
              description: "Short.",
              sourceHash: FINGERPRINT,
              status: "accepted" as const,
              acceptance: "auto" as const,
              origin: "generated" as const,
            },
          ],
        },
      ],
    ]);

    const byDefault = selectEntries({
      manifest,
      datasets,
      fingerprints,
      authoringByLocale,
      options: options(),
    });
    expect(byDefault.items.map((item) => `${item.spellId}:${item.mode}`)).toEqual([
      "srd-light:missing",
    ]);

    const withIds = selectEntries({
      manifest,
      datasets,
      fingerprints,
      authoringByLocale,
      options: options({ ids: ["srd-fireball"], approve: true }),
    });
    expect(withIds.items.map((item) => item.mode)).toEqual(["regenerate"]);

    const upToDate = selectEntries({
      manifest,
      datasets,
      fingerprints,
      authoringByLocale,
      options: options({ ids: ["srd-fireball"] }),
    });
    expect(upToDate.items).toEqual([]);
    expect(upToDate.skipped[0]?.reason).toContain("--regenerate");

    const withAll = selectEntries({
      manifest,
      datasets,
      fingerprints,
      authoringByLocale,
      options: options({ all: true, maxEntries: 1 }),
    });
    expect(withAll.items.map((item) => `${item.spellId}:${item.mode}`)).toEqual([
      "srd-light:missing",
    ]);

    expect(() =>
      selectEntries({
        manifest,
        datasets,
        fingerprints,
        authoringByLocale: new Map(),
        options: options({ maxEntries: 1 }),
      }),
    ).toThrow(/--all for a full-dataset run/);

    const protectedEntry = {
      spellId: "srd-fireball",
      description: "Short.",
      sourceHash: FINGERPRINT,
      status: "accepted" as const,
      acceptance: "human" as const,
      origin: "manual" as const,
    };
    const protectedAuthoring = new Map([["en", { locale: "en", entries: [protectedEntry] }]]);
    const skippedProtected = selectEntries({
      manifest,
      datasets,
      fingerprints,
      authoringByLocale: protectedAuthoring,
      options: options({ regenerate: true }),
    });
    expect(skippedProtected.items.map((item) => item.spellId)).toEqual(["srd-light"]);
    expect(skippedProtected.skipped[0]?.reason).toContain("--force");

    const forced = selectEntries({
      manifest,
      datasets,
      fingerprints,
      authoringByLocale: protectedAuthoring,
      options: options({ regenerate: true, force: true }),
    });
    expect(forced.items.map((item) => `${item.spellId}:${item.mode}`)).toEqual([
      "srd-fireball:regenerate",
      "srd-light:missing",
    ]);
  });
});

describe("generation pipeline", () => {
  it("dry run makes no calls and no writes and needs no credentials", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    const messages: string[] = [];

    const result = await runGeneration(options({ dryRun: true }), {
      workspace,
      log: (message) => messages.push(message),
    });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.selection.items).toHaveLength(2);
    expect(await fileExists(workspace)).toBe(false);
    expect(messages.join("\n")).toContain("srd-fireball");
  });

  it("commits an accepted generated entry and writes the report last", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    const calls: string[] = [];

    const result = await runGeneration(options({ ids: ["srd-fireball"] }), {
      workspace,
      adapter: stubAdapter({ calls }),
      now: () => new Date("2026-02-02T00:00:00Z"),
      log: () => undefined,
    });

    expect(result.exitCode).toBe(EXIT_OK);
    const entries = entriesOf(await readAuthoring(workspace));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      spellId: "srd-fireball",
      status: "accepted",
      acceptance: "auto",
      origin: "generated",
      sourceHash: FINGERPRINT,
    });
    expect(calls).toEqual(["generate:en:srd-fireball", "judge"]);

    const report = JSON.parse(await readFile(workspace.reportFile, "utf8")) as Record<
      string,
      unknown
    >;
    expect(report.prompt).toBeUndefined();
    expect(report.generatedAt).toBe("2026-02-02T00:00:00.000Z");
    expect(report.counts).toMatchObject({ accepted: 1, autoAccepted: 1, humanAccepted: 0 });
    expect(report.countsByLocale).toEqual({
      en: { accepted: 1, withheld: 0, invalid: 0, failed: 0 },
    });
    expect(report.exitCode).toBe(EXIT_OK);
    expect(report.autoAcceptanceRatio).toBe(1);
    expect(report.usage).toEqual({ promptTokens: 20, completionTokens: 10, totalTokens: 30 });
  });

  it("prints per-entry and pipeline timings only when requested", async () => {
    let tick = 0;
    const clock = () => (tick += 25);

    const workspace = await seedWorkspace(await createTempWorkspace());
    const messages: string[] = [];
    await runGeneration(options({ ids: ["srd-fireball"], timings: true }), {
      workspace,
      adapter: stubAdapter({ calls: [] }),
      clock,
      log: (message) => messages.push(message),
    });
    const output = messages.join("\n");
    expect(output).toContain("generation API:");
    expect(output).toContain("deterministic checks:");
    expect(output).toContain("judge API:");
    expect(output).toContain("authoring files:");
    expect(output).toContain("review report:");
    expect(output).toContain("total run:");
    expect(output).not.toContain("You write a short form");

    const quietWorkspace = await seedWorkspace(await createTempWorkspace());
    const quiet: string[] = [];
    await runGeneration(options({ ids: ["srd-fireball"] }), {
      workspace: quietWorkspace,
      adapter: stubAdapter({ calls: [] }),
      clock,
      log: (message) => quiet.push(message),
    });
    expect(quiet.join("\n")).not.toContain("generation API:");
  });

  it("commits withheld review items for confirmed mismatches", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    const calls: string[] = [];

    const result = await runGeneration(options({ ids: ["srd-fireball"] }), {
      workspace,
      adapter: stubAdapter({
        calls,
        candidate: (spell) => ({
          ...GOOD_CANDIDATE,
          spellId: spell.id,
          description: GOOD_CANDIDATE.description.replace("8d6", "8d8"),
        }),
      }),
      log: () => undefined,
    });

    expect(result.exitCode).toBe(EXIT_OK);
    const entries = entriesOf(await readAuthoring(workspace));
    expect(entries[0]?.status).toBe("withheld");
    const report = JSON.parse(await readFile(workspace.reportFile, "utf8")) as {
      outcome: string;
      failures: unknown[];
      entries: Array<{ findings: Array<{ category: string; severity: string }> }>;
    };
    expect(report.outcome).toBe("partial");
    expect(report.failures).toHaveLength(1);
    expect(
      report.entries[0]?.findings.some(
        (finding) => finding.category === "dice" && finding.severity === "high",
      ),
    ).toBe(true);
  });

  it("rejects unsafe Markdown without writing the entry", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    const calls: string[] = [];

    const result = await runGeneration(options({ ids: ["srd-fireball"] }), {
      workspace,
      adapter: stubAdapter({
        calls,
        candidate: (spell) => ({
          ...GOOD_CANDIDATE,
          spellId: spell.id,
          description: "Deals <script>alert(1)</script> damage.",
        }),
      }),
      log: () => undefined,
    });

    expect(result.exitCode).toBe(EXIT_PARTIAL);
    expect(calls).toEqual(["generate:en:srd-fireball"]);
    const report = JSON.parse(await readFile(workspace.reportFile, "utf8")) as {
      entries: Array<{ status: string; written: boolean }>;
    };
    expect(report.entries[0]).toMatchObject({ status: "invalid", written: false });
    await expect(readAuthoring(workspace)).rejects.toThrow();
  });

  it("records provider failures and exits with a partial code", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    const calls: string[] = [];

    const result = await runGeneration(options({ ids: ["srd-fireball", "srd-light"], limit: 2 }), {
      workspace,
      adapter: stubAdapter({ calls, judgeError: new Error("provider down") }),
      log: () => undefined,
    });

    expect(result.exitCode).toBe(EXIT_PARTIAL);
    const report = JSON.parse(await readFile(workspace.reportFile, "utf8")) as {
      counts: { failed: number };
    };
    expect(report.counts.failed).toBe(2);
  });

  it("treats a mismatched spell id as invalid output", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    const calls: string[] = [];

    const result = await runGeneration(options({ ids: ["srd-fireball"] }), {
      workspace,
      adapter: stubAdapter({
        calls,
        candidate: () => ({ ...GOOD_CANDIDATE, spellId: "srd-light" }),
      }),
      log: () => undefined,
    });

    expect(result.exitCode).toBe(EXIT_PARTIAL);
    const report = JSON.parse(await readFile(workspace.reportFile, "utf8")) as {
      entries: Array<{ reasons: string[] }>;
    };
    expect(report.entries[0]?.reasons[0]).toContain("invalid output");
  });

  it("revalidates stale entries in place without rewriting or promoting them", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace(), {
      authoring: {
        en: {
          locale: "en",
          entries: [
            {
              spellId: "srd-fireball",
              description: "Old text.",
              sourceHash: `sha256:${"a".repeat(64)}`,
              status: "withheld",
              acceptance: "auto",
              origin: "generated",
            },
          ],
        },
      },
    });
    const calls: string[] = [];

    await runGeneration(options({ ids: ["srd-fireball"] }), {
      workspace,
      adapter: stubAdapter({ calls }),
      log: () => undefined,
    });

    const entries = entriesOf(await readAuthoring(workspace));
    expect(entries[0]?.sourceHash).toBe(FINGERPRINT);
    expect(entries[0]?.status).toBe("withheld");
    expect(entries[0]?.description).toBe("Old text.");
    expect(calls).toEqual([]);
  });

  it("keeps an accepted stale entry accepted after revalidation", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace(), {
      authoring: {
        en: {
          locale: "en",
          entries: [
            {
              spellId: "srd-fireball",
              description: GOOD_CANDIDATE.description,
              higherLevels: GOOD_CANDIDATE.higherLevels,
              sourceHash: `sha256:${"a".repeat(64)}`,
              status: "accepted",
              acceptance: "auto",
              origin: "generated",
            },
          ],
        },
      },
    });
    const calls: string[] = [];

    const result = await runGeneration(options({ ids: ["srd-fireball"] }), {
      workspace,
      adapter: stubAdapter({ calls }),
      log: () => undefined,
    });

    const entries = entriesOf(await readAuthoring(workspace));
    expect(entries[0]?.status).toBe("accepted");
    expect(entries[0]?.description).toBe(GOOD_CANDIDATE.description);
    expect(entries[0]?.sourceHash).toBe(FINGERPRINT);
    expect(calls).toEqual([]);
    expect(result.exitCode).toBe(EXIT_OK);
  });

  it("aborts with the partial-success code when the cost cap is reached", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    const pricing = new Map([
      ["stub/generate", { promptPerToken: 0.001, completionPerToken: 0.002 }],
      ["stub/judge", { promptPerToken: 0.001, completionPerToken: 0.002 }],
    ]);
    const calls: string[] = [];

    const result = await runGeneration(
      options({ ids: ["srd-fireball", "srd-light"], limit: 2, maxCost: 0.01 }),
      { workspace, adapter: stubAdapter({ calls, pricing }), log: () => undefined },
    );

    expect(result.exitCode).toBe(EXIT_PARTIAL);
    expect(result.report?.outcome).toBe("partial");
    expect(result.report?.exitCode).toBe(EXIT_PARTIAL);
    expect(result.report?.skipped.some((entry) => entry.reason === "cost cap reached")).toBe(true);
  });

  it("refuses --max-cost when the judge model has no pricing", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    const pricing = new Map([
      ["stub/generate", { promptPerToken: 0.001, completionPerToken: 0.002 }],
    ]);

    await expect(
      runGeneration(options({ ids: ["srd-fireball"], maxCost: 1 }), {
        workspace,
        adapter: stubAdapter({ calls: [], pricing }),
        log: () => undefined,
      }),
    ).rejects.toThrow(/generation and judge models/);
  });

  it("reports a failed authoring commit as a failure", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());

    const result = await runGeneration(options({ ids: ["srd-fireball"] }), {
      workspace,
      adapter: stubAdapter({ calls: [] }),
      log: () => undefined,
      writeAuthoring: async () => {
        throw new Error("permission denied");
      },
    });

    expect(result.exitCode).toBe(EXIT_FAILURE);
    expect(result.report?.outcome).toBe("failed");
    expect(result.report?.exitCode).toBe(EXIT_FAILURE);
    expect(result.report?.notes.join(" ")).toContain("commit failed");
  });

  it("computes per-entry and aggregate cost when pricing is available", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    const pricing = new Map([
      ["stub/generate", { promptPerToken: 0.001, completionPerToken: 0.002 }],
      ["stub/judge", { promptPerToken: 0.001, completionPerToken: 0.002 }],
    ]);

    const result = await runGeneration(options({ ids: ["srd-fireball"] }), {
      workspace,
      adapter: stubAdapter({ calls: [], pricing }),
      log: () => undefined,
    });

    expect(result.report?.entries[0]?.estimatedCostUsd).toBeCloseTo(0.04);
    expect(result.report?.estimatedCostUsd).toBeCloseTo(0.04);
  });

  it("writes manual stubs that stay withheld", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());

    const result = await runGeneration(options({ manual: true, ids: ["srd-fireball"] }), {
      workspace,
      log: () => undefined,
    });

    expect(result.exitCode).toBe(EXIT_OK);
    const entries = entriesOf(await readAuthoring(workspace));
    expect(entries[0]).toMatchObject({ status: "withheld", origin: "manual", acceptance: "auto" });
    expect(String(entries[0]?.description)).toContain("TODO");
  });

  it("approves only clean selected entries and records human review", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace(), {
      authoring: {
        en: {
          locale: "en",
          entries: [
            {
              spellId: "srd-fireball",
              description: GOOD_CANDIDATE.description,
              higherLevels: GOOD_CANDIDATE.higherLevels,
              sourceHash: FINGERPRINT,
              status: "withheld",
              acceptance: "auto",
              origin: "generated",
            },
          ],
        },
      },
    });

    await runGeneration(options({ approve: true, ids: ["srd-fireball"] }), {
      workspace,
      log: () => undefined,
    });

    const entries = entriesOf(await readAuthoring(workspace));
    expect(entries[0]).toMatchObject({ status: "accepted", acceptance: "human", origin: "manual" });
  });

  it("refuses approval of an entry with a mechanical mismatch", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace(), {
      authoring: {
        en: {
          locale: "en",
          entries: [
            {
              spellId: "srd-fireball",
              description: GOOD_CANDIDATE.description.replace("8d6", "8d8"),
              higherLevels: GOOD_CANDIDATE.higherLevels,
              sourceHash: FINGERPRINT,
              status: "withheld",
              acceptance: "auto",
              origin: "generated",
            },
          ],
        },
      },
    });

    const result = await runGeneration(options({ approve: true, ids: ["srd-fireball"] }), {
      workspace,
      log: () => undefined,
    });

    expect(result.exitCode).toBe(EXIT_PARTIAL);
    expect(entriesOf(await readAuthoring(workspace))[0]?.status).toBe("withheld");
  });

  it("does not write any credential or prompt text into the report", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    await runGeneration(options({ ids: ["srd-fireball"] }), {
      workspace,
      adapter: stubAdapter({ calls: [] }),
      log: () => undefined,
    });
    const text = await readFile(workspace.reportFile, "utf8");
    expect(text).not.toContain("sk-or-");
    expect(text).not.toContain("Authorization");
    expect(text).not.toContain("You write a short form");
    expect(text).not.toContain(LONG_DESCRIPTION[0]);
  });
});
