import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import { sourceFingerprint } from "./fingerprint.ts";
import { readJson, writeFileAtomic, WorkspaceError } from "./files.ts";
import { createTempWorkspace, writeJsonFile } from "./test-helpers.ts";

describe("source fingerprint", () => {
  const spell = {
    description: ["First paragraph.", "Second paragraph."],
    higherLevels: ["More damage."],
  };

  it("is stable for identical text", () => {
    expect(sourceFingerprint(spell)).toBe(sourceFingerprint({ ...spell }));
    expect(sourceFingerprint(spell)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("changes when replaced text changes", () => {
    expect(sourceFingerprint(spell)).not.toBe(
      sourceFingerprint({ ...spell, description: ["First paragraph changed."] }),
    );
    expect(sourceFingerprint(spell)).not.toBe(
      sourceFingerprint({ ...spell, higherLevels: ["More damage per level."] }),
    );
  });

  it("ignores metadata outside the replaced text", () => {
    expect(sourceFingerprint(spell)).toBe(
      sourceFingerprint({
        name: "Fireball",
        level: 3,
        description: spell.description,
        higherLevels: spell.higherLevels,
      } as unknown as Parameters<typeof sourceFingerprint>[0]),
    );
  });

  it("treats a missing higher-level field like an empty one", () => {
    expect(sourceFingerprint({ description: ["a"] })).toBe(
      sourceFingerprint({ description: ["a"], higherLevels: [] }),
    );
  });
});

describe("workspace file helpers", () => {
  it("reports malformed JSON with the file path", async () => {
    const workspace = await createTempWorkspace();
    const file = `${workspace.reportFile}.bad`;
    await writeJsonFile(file, { ok: true });
    await writeFile(file, "{ not json", "utf8");
    await expect(readJson(file)).rejects.toThrow(/malformed JSON/);
  });

  it("rejects an invalid manifest language code", async () => {
    const workspace = await createTempWorkspace();
    await writeJsonFile(workspace.manifestFile, [
      { code: "../escape", displayName: "x", dataset: "/spells.srd.json" },
    ]);
    const { loadManifest } = await import("./files.ts");
    await expect(loadManifest(workspace)).rejects.toThrow(/invalid language code/);
  });

  it("leaves the target byte-identical when a write or rename fails", async () => {
    const workspace = await createTempWorkspace();
    const target = workspace.sidecarFile("en");
    await writeJsonFile(target, { original: true });
    const before = await readFile(target, "utf8");

    await expect(
      writeFileAtomic(target, "new content", {
        writeFile: async () => {
          throw new Error("disk full");
        },
      }),
    ).rejects.toBeInstanceOf(WorkspaceError);
    expect(await readFile(target, "utf8")).toBe(before);

    await expect(
      writeFileAtomic(target, "new content", {
        rename: async () => {
          throw new Error("rename denied");
        },
      }),
    ).rejects.toBeInstanceOf(WorkspaceError);
    expect(await readFile(target, "utf8")).toBe(before);
  });

  it("replaces the target atomically on success", async () => {
    const workspace = await createTempWorkspace();
    const target = workspace.sidecarFile("en");
    await writeJsonFile(target, { original: true });
    await writeFileAtomic(target, "new content\n");
    expect(await readFile(target, "utf8")).toBe("new content\n");
  });
});
