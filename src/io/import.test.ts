import { beforeEach, describe, expect, it } from "vite-plus/test";
import { db } from "@/db/database.ts";
import { analyzeCustomImport, applyCustomImport, ImportConflictError } from "@/io/import-custom.ts";
import { putCustomSpell } from "@/db/custom-spells.ts";
import { makeCustomSpell } from "@/test/fixtures/spells.ts";

function payload(spells: unknown[], version = "1.0.0"): string {
  return JSON.stringify({ version, type: "custom-spells", spells });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("custom spell import analysis", () => {
  it("accepts a valid 1.0.0 payload", () => {
    const analysis = analyzeCustomImport(payload([makeCustomSpell({ id: "c1" })]), []);
    expect(analysis.ok).toBe(true);
    if (analysis.ok) {
      expect(analysis.plan.entries).toHaveLength(1);
      expect(analysis.plan.unknownVersion).toBe(false);
    }
  });

  it("rejects a wrong payload type", () => {
    const analysis = analyzeCustomImport(
      JSON.stringify({ version: "1.0.0", type: "deck", spells: [] }),
      [],
    );
    expect(analysis.ok).toBe(false);
  });

  it("rejects duplicate IDs inside the file", () => {
    const analysis = analyzeCustomImport(
      payload([makeCustomSpell({ id: "c1" }), makeCustomSpell({ id: "c1" })]),
      [],
    );
    expect(analysis.ok).toBe(false);
    if (!analysis.ok) expect(analysis.error).toContain("Duplicate");
  });

  it("rejects SRD-sourced records", () => {
    const srd = makeCustomSpell({ id: "c1", source: "SRD-5.2.1" });
    const analysis = analyzeCustomImport(payload([srd]), []);
    expect(analysis.ok).toBe(false);
    if (!analysis.ok) expect(analysis.error).toContain("SRD");
  });

  it("rejects class identifiers outside the 12 core classes", () => {
    const analysis = analyzeCustomImport(
      payload([makeCustomSpell({ id: "c1", classes: ["Artificer"] })]),
      [],
    );
    expect(analysis.ok).toBe(false);
  });

  it("rejects unknown-version records with unsupported classes", () => {
    const analysis = analyzeCustomImport(
      payload([makeCustomSpell({ id: "c1", classes: ["Artificer"] })], "2.0.0"),
      [],
    );
    expect(analysis.ok).toBe(false);
  });

  it("remaps reserved srd- custom IDs to UUIDs", () => {
    const analysis = analyzeCustomImport(payload([makeCustomSpell({ id: "srd-forged" })]), []);
    expect(analysis.ok).toBe(true);
    if (analysis.ok) {
      expect(analysis.plan.remaps).toHaveLength(1);
      expect(analysis.plan.entries[0].record.id.startsWith("srd-")).toBe(false);
    }
  });

  it("flags unknown versions for opt-in Try Import", () => {
    const analysis = analyzeCustomImport(
      payload([{ ...makeCustomSpell({ id: "c1" }), extra: true }], "2.0.0"),
      [],
    );
    expect(analysis.ok).toBe(true);
    if (analysis.ok) {
      expect(analysis.plan.unknownVersion).toBe(true);
      expect(analysis.plan.entries).toHaveLength(1);
    }
  });

  it("rejects unknown-version records missing required fields", () => {
    const analysis = analyzeCustomImport(payload([{ id: "c1", name: "Incomplete" }], "2.0.0"), []);
    expect(analysis.ok).toBe(false);
  });

  it("detects collisions with existing custom spells", () => {
    const existing = makeCustomSpell({ id: "c1", name: "Existing" });
    const analysis = analyzeCustomImport(
      payload([makeCustomSpell({ id: "c1", name: "Incoming" })]),
      [existing],
    );
    expect(analysis.ok).toBe(true);
    if (analysis.ok) {
      expect(analysis.plan.collisions).toHaveLength(1);
      expect(analysis.plan.collisions[0].existingName).toBe("Existing");
    }
  });
});

describe("custom spell import commit", () => {
  it("imports and reports counts", async () => {
    const analysis = analyzeCustomImport(payload([makeCustomSpell({ id: "c1" })]), []);
    if (!analysis.ok) throw new Error("expected ok");
    const counts = await applyCustomImport(analysis.plan, "skip", new Map());
    expect(counts.imported).toBe(1);
    expect(await db.customSpells.get("c1")).toBeDefined();
  });

  it("aborts when a collision target changed since review", async () => {
    const existing = await putCustomSpell(makeCustomSpell({ id: "c1", name: "Existing" }));
    const analysis = analyzeCustomImport(
      payload([makeCustomSpell({ id: "c1", name: "Incoming" })]),
      [existing],
    );
    if (!analysis.ok) throw new Error("expected ok");
    const fingerprints = new Map(
      analysis.plan.collisions.map((collision) => [collision.id, collision.fingerprint]),
    );
    await putCustomSpell({ ...existing, name: "Changed elsewhere" });
    await expect(
      applyCustomImport(analysis.plan, "overwrite", fingerprints),
    ).rejects.toBeInstanceOf(ImportConflictError);
    expect((await db.customSpells.get("c1"))?.name).toBe("Changed elsewhere");
  });

  it("keeps both by assigning a fresh UUID", async () => {
    const existing = await putCustomSpell(makeCustomSpell({ id: "c1", name: "Existing" }));
    const analysis = analyzeCustomImport(
      payload([makeCustomSpell({ id: "c1", name: "Incoming" })]),
      [existing],
    );
    if (!analysis.ok) throw new Error("expected ok");
    const fingerprints = new Map(
      analysis.plan.collisions.map((collision) => [collision.id, collision.fingerprint]),
    );
    const counts = await applyCustomImport(analysis.plan, "keep-both", fingerprints);
    expect(counts.copied).toBe(1);
    expect((await db.customSpells.get("c1"))?.name).toBe("Existing");
    expect(await db.customSpells.toArray()).toHaveLength(2);
  });
});
