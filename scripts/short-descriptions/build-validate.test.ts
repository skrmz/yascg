import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import { AuthoringSchemaError } from "../../src/tools/short-descriptions/authoring-schema.ts";
import { sourceFingerprint } from "./fingerprint.ts";
import { buildSidecars } from "./build.ts";
import { validateWorkspace } from "./validate.ts";
import {
  HIGHER_LEVELS,
  LONG_DESCRIPTION,
  createTempWorkspace,
  seedWorkspace,
  writeJsonFile,
} from "./test-helpers.ts";

const FINGERPRINT = sourceFingerprint({
  description: LONG_DESCRIPTION,
  higherLevels: HIGHER_LEVELS,
});

function authoringFile(entries: unknown[]) {
  return { locale: "en", entries };
}

function acceptedEntry(overrides: Record<string, unknown> = {}) {
  return {
    spellId: "srd-fireball",
    description:
      "A streak flashes to a point in range and explodes. Creatures in a 20-foot sphere make a DEX save, taking 8d6 fire damage or half on a success.",
    higherLevels: "+1d6 damage per slot level above 3rd.",
    sourceHash: FINGERPRINT,
    status: "accepted",
    acceptance: "auto",
    origin: "generated",
    ...overrides,
  };
}

describe("build", () => {
  it("writes deterministic sidecars and is idempotent", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace(), {
      authoring: { en: authoringFile([acceptedEntry()]) },
    });

    const first = await buildSidecars(workspace);
    const text = await readFile(workspace.sidecarFile("en"), "utf8");
    expect(text).toBe(first.files.get("en"));
    expect(text).toContain('"srd-fireball"');
    expect(text).not.toContain("sourceHash");
    expect(text.endsWith("}\n")).toBe(true);
    expect(first.written).toEqual(["en"]);

    await buildSidecars(workspace);
    expect(await readFile(workspace.sidecarFile("en"), "utf8")).toBe(text);
  });

  it("omits stale and withheld entries with warnings", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace(), {
      authoring: {
        en: authoringFile([
          acceptedEntry(),
          acceptedEntry({ spellId: "srd-light", sourceHash: `sha256:${"f".repeat(64)}` }),
        ]),
      },
    });

    const result = await buildSidecars(workspace);

    expect(result.warnings.map((warning) => warning.code)).toEqual(["stale"]);
    expect(result.diagnostics).toEqual([{ locale: "en", authored: 2, included: 1 }]);
    expect(await readFile(workspace.sidecarFile("en"), "utf8")).not.toContain("srd-light");
  });

  it("emits an empty sidecar when no authoring file exists", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    await buildSidecars(workspace);
    expect(await readFile(workspace.sidecarFile("en"), "utf8")).toBe("{}\n");
  });

  it("fails structurally on an invalid authoring file", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace(), {
      authoring: { en: authoringFile([acceptedEntry({ status: "invalid" })]) },
    });
    await expect(buildSidecars(workspace)).rejects.toBeInstanceOf(AuthoringSchemaError);
  });
});

describe("validate", () => {
  it("writes a report and exits zero for consistent accepted entries", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace(), {
      authoring: { en: authoringFile([acceptedEntry()]) },
    });
    await buildSidecars(workspace);

    const result = await validateWorkspace(workspace, {
      now: () => new Date("2026-01-01T00:00:00Z"),
    });

    expect(result.exitCode).toBe(0);
    expect(result.drift).toEqual([]);
    expect(result.report.counts.accepted).toBe(1);
    const reportText = await readFile(workspace.reportFile, "utf8");
    expect(reportText).toContain('"generatedAt": "2026-01-01T00:00:00.000Z"');
    expect(reportText).not.toContain("Authorization");
    expect(reportText).not.toContain("sk-or-");
    expect(reportText).not.toContain("sourceHash");
  });

  it("ignores CRLF line endings when checking runtime drift", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace(), {
      authoring: { en: authoringFile([acceptedEntry()]) },
    });
    await buildSidecars(workspace);
    const text = await readFile(workspace.sidecarFile("en"), "utf8");
    await writeFile(workspace.sidecarFile("en"), text.replace(/\n/g, "\r\n"), "utf8");

    const result = await validateWorkspace(workspace);
    expect(result.drift).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it("detects runtime drift and names the build command", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace(), {
      authoring: { en: authoringFile([acceptedEntry()]) },
    });
    await buildSidecars(workspace);
    await writeFile(workspace.sidecarFile("en"), "{}\n", "utf8");

    const result = await validateWorkspace(workspace);
    expect(result.exitCode).toBe(1);
    expect(result.drift[0]).toContain("short-descriptions:build");
  });

  it("reports stale entries as withheld with a provenance finding", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace(), {
      authoring: {
        en: authoringFile([acceptedEntry({ sourceHash: `sha256:${"e".repeat(64)}` })]),
      },
    });

    await buildSidecars(workspace);
    const result = await validateWorkspace(workspace);
    expect(result.report.entries[0]?.status).toBe("withheld");
    expect(
      result.report.entries[0]?.findings.some((finding) => finding.category === "provenance"),
    ).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("exits zero when the only issues are withheld review items", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace(), {
      authoring: { en: authoringFile([acceptedEntry({ status: "withheld" })]) },
    });
    await buildSidecars(workspace);
    const result = await validateWorkspace(workspace);
    expect(result.exitCode).toBe(0);
    expect(result.report.outcome).toBe("partial");
  });

  it("fails on an unparsable authoring file and still writes a report", async () => {
    const workspace = await seedWorkspace(await createTempWorkspace());
    await writeJsonFile(workspace.authoringFile("en"), {
      locale: "en",
      entries: [{ spellId: "x" }],
    });
    const result = await validateWorkspace(workspace);
    expect(result.exitCode).toBe(1);
    expect(result.report.outcome).toBe("failed");
    expect(await readFile(workspace.reportFile, "utf8")).toContain('"status": "invalid"');
  });

  it("reports orphaned and non-shortening entries", async () => {
    const lightDescription =
      "You touch one object that is no larger than 10 feet in any dimension. Until the spell ends, the object sheds bright light in a 20-foot radius and dim light for an additional 20 feet.";
    const workspace = await seedWorkspace(await createTempWorkspace(), {
      authoring: {
        en: authoringFile([
          acceptedEntry({ spellId: "srd-missing", sourceHash: `sha256:${"d".repeat(64)}` }),
          acceptedEntry({
            spellId: "srd-light",
            description: lightDescription,
            higherLevels: undefined,
            sourceHash: sourceFingerprint({ description: [lightDescription] }),
          }),
        ]),
      },
    });

    await buildSidecars(workspace);
    const result = await validateWorkspace(workspace);

    expect(result.report.entries.find((entry) => entry.spellId === "srd-missing")?.status).toBe(
      "invalid",
    );
    const light = result.report.entries.find((entry) => entry.spellId === "srd-light");
    expect(light?.status).toBe("withheld");
    expect(light?.findings.some((finding) => finding.category === "length")).toBe(true);
    expect(result.exitCode).toBe(0);
  });
});
