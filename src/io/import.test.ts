import { beforeEach, describe, expect, it } from "vite-plus/test";
import { db } from "@/db/database.ts";
import { analyzeCustomImport, applyCustomImport, ImportConflictError } from "@/io/import-custom.ts";
import { buildCustomSpellsPayload } from "@/io/export.ts";
import { customSpellExportPayloadSchemaV2 } from "@/domain/payloads.ts";
import { putCustomSpell } from "@/db/custom-spells.ts";
import { getSrdOverride, putSrdOverride } from "@/db/srd-overrides.ts";
import type { SrdOverrideValidationContext } from "@/domain/srd-overrides.ts";
import { makeCustomSpell, makeSpell } from "@/test/fixtures/spells.ts";

function payload(spells: unknown[], version = "1.0.0"): string {
  return JSON.stringify({ version, type: "custom-spells", spells });
}

function payloadV2(spells: unknown[], overrides?: unknown[]): string {
  const body: Record<string, unknown> = { version: "1.1.0", type: "custom-spells", spells };
  if (overrides !== undefined) body.srdSpellOverrides = overrides;
  return JSON.stringify(body);
}

const srdFireball = makeSpell({
  id: "srd-fireball",
  components: { verbal: true, somatic: false, material: false },
});

const overrideOptions = {
  srdSpellsById: new Map([[srdFireball.id, srdFireball]]),
  supportedLocales: ["en", "de"],
};

const overrideContext: SrdOverrideValidationContext = {
  srdSpellsById: overrideOptions.srdSpellsById,
  supportedLocales: overrideOptions.supportedLocales,
};

const overrideRecord = { spellId: "srd-fireball", locale: "en", verbalDescription: "Speak" };

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

describe("custom-spell export/import with SRD overrides", () => {
  it("stamps 1.1.0 on new custom-spell exports and omits updatedAt", () => {
    const body = buildCustomSpellsPayload(
      [makeCustomSpell({ id: "c1" })],
      [{ spellId: "srd-fireball", locale: "en", verbalDescription: "Speak", updatedAt: 5 }],
    );
    expect(body.version).toBe("1.1.0");
    expect(body.srdSpellOverrides).toHaveLength(1);
    expect(body.srdSpellOverrides[0]).not.toHaveProperty("updatedAt");
    // The writer output validates against the declared version-aware wire schema.
    expect(customSpellExportPayloadSchemaV2.safeParse(body).success).toBe(true);
  });

  it("rejects a 1.1.0 payload whose override carries updatedAt (strict wire shape)", () => {
    const malformed = {
      version: "1.1.0",
      type: "custom-spells",
      spells: [],
      srdSpellOverrides: [{ spellId: "srd-fireball", locale: "en", updatedAt: 1 }],
    };
    expect(customSpellExportPayloadSchemaV2.safeParse(malformed).success).toBe(false);
  });

  it("round-trips overrides through export and import", async () => {
    const text = JSON.stringify(
      buildCustomSpellsPayload(
        [makeCustomSpell({ id: "c1" })],
        [{ spellId: "srd-fireball", locale: "en", verbalDescription: "Speak", updatedAt: 1 }],
      ),
    );
    const analysis = analyzeCustomImport(text, [], overrideOptions);
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    expect(analysis.plan.overrides).toHaveLength(1);
    const counts = await applyCustomImport(analysis.plan, "skip", new Map());
    expect(counts.overrides).toBe(1);
    expect((await getSrdOverride("srd-fireball", "en"))?.verbalDescription).toBe("Speak");
  });

  it("leaves local overrides unchanged when importing a legacy 1.0.0 payload", async () => {
    await putSrdOverride(
      { spellId: "srd-fireball", locale: "en", verbalDescription: "Keep" },
      overrideContext,
    );
    const analysis = analyzeCustomImport(payload([makeCustomSpell({ id: "c1" })]), []);
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    await applyCustomImport(analysis.plan, "skip", new Map());
    expect((await getSrdOverride("srd-fireball", "en"))?.verbalDescription).toBe("Keep");
  });

  it("treats absent and empty override arrays as no-ops", async () => {
    await putSrdOverride(
      { spellId: "srd-fireball", locale: "en", verbalDescription: "Keep" },
      overrideContext,
    );
    for (const text of [payloadV2([], undefined), payloadV2([], [])]) {
      const analysis = analyzeCustomImport(text, [], overrideOptions);
      expect(analysis.ok).toBe(true);
      if (!analysis.ok) return;
      expect(analysis.plan.overrides).toHaveLength(0);
      await applyCustomImport(analysis.plan, "skip", new Map());
    }
    expect((await getSrdOverride("srd-fireball", "en"))?.verbalDescription).toBe("Keep");
  });

  it("drops empty override records as no-ops", () => {
    const analysis = analyzeCustomImport(
      payloadV2([], [{ spellId: "srd-fireball", locale: "en" }]),
      [],
      overrideOptions,
    );
    expect(analysis.ok).toBe(true);
    if (analysis.ok) expect(analysis.plan.overrides).toHaveLength(0);
  });

  it("refuses to validate overrides when SRD data is not loaded", () => {
    const analysis = analyzeCustomImport(payloadV2([], [overrideRecord]), []);
    expect(analysis.ok).toBe(false);
    if (!analysis.ok) expect(analysis.error).toContain("not loaded");
  });

  it("collects every invalid override record and aborts", () => {
    const analysis = analyzeCustomImport(
      payloadV2(
        [],
        [
          { spellId: "srd-unknown", locale: "en", verbalDescription: "x" },
          { spellId: "srd-fireball", locale: "fr", verbalDescription: "x" },
          { spellId: "srd-fireball", locale: "en", somaticDescription: "x" },
          { spellId: "srd-fireball", locale: "en", verbalDescription: "x".repeat(501) },
        ],
      ),
      [],
      overrideOptions,
    );
    expect(analysis.ok).toBe(false);
    if (!analysis.ok) expect(analysis.overrideErrors).toHaveLength(4);
  });

  it("flags unknown versions with overrides as lossy", () => {
    const analysis = analyzeCustomImport(
      JSON.stringify({
        version: "2.0.0",
        type: "custom-spells",
        spells: [makeCustomSpell({ id: "c1" })],
        srdSpellOverrides: [overrideRecord],
      }),
      [],
    );
    expect(analysis.ok).toBe(true);
    if (analysis.ok) {
      expect(analysis.plan.lossy).toBe(true);
      expect(analysis.plan.droppedOverrides).toBe(1);
      expect(analysis.plan.overrides).toHaveLength(0);
    }
  });

  it("aborts the whole batch, including overrides, when a collision target changed", async () => {
    const existing = await putCustomSpell(makeCustomSpell({ id: "c1", name: "Existing" }));
    const analysis = analyzeCustomImport(
      payloadV2([makeCustomSpell({ id: "c1", name: "Incoming" })], [overrideRecord]),
      [existing],
      overrideOptions,
    );
    if (!analysis.ok) throw new Error("expected ok");
    const fingerprints = new Map(
      analysis.plan.collisions.map((collision) => [collision.id, collision.fingerprint]),
    );
    await putCustomSpell({ ...existing, name: "Changed elsewhere" });
    await expect(
      applyCustomImport(analysis.plan, "overwrite", fingerprints),
    ).rejects.toBeInstanceOf(ImportConflictError);
    expect(await getSrdOverride("srd-fireball", "en")).toBeNull();
  });
});
