import { beforeEach, describe, expect, it } from "vite-plus/test";
import { db } from "@/db/database.ts";
import { getActiveDeck, mutateActiveDeck, makeEntry } from "@/db/active-deck.ts";
import { analyzeDeckImport, applyDeckImport } from "@/io/import-deck.ts";

function deckPayload(entries: unknown[], version = "1.0.0"): string {
  return JSON.stringify({
    version,
    type: "deck",
    name: "Imported",
    exportedAt: Date.now(),
    entries,
  });
}

const validEntry = {
  spellId: "srd-fireball",
  fitMode: "auto-shrink",
  reference: { source: "SRD-5.2.1", name: "Fireball" },
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("deck import analysis", () => {
  it("accepts a valid 1.0.0 deck", () => {
    const analysis = analyzeDeckImport(deckPayload([validEntry, validEntry]));
    expect(analysis.ok).toBe(true);
    if (analysis.ok) expect(analysis.plan.entries).toHaveLength(2);
  });

  it("rejects a wrong type", () => {
    const analysis = analyzeDeckImport(
      JSON.stringify({ version: "1.0.0", type: "custom-spells", entries: [] }),
    );
    expect(analysis.ok).toBe(false);
  });

  it("rejects invalid fit modes", () => {
    const analysis = analyzeDeckImport(deckPayload([{ ...validEntry, fitMode: "squish" }]));
    expect(analysis.ok).toBe(false);
  });

  it("enforces the 2000-entry cap", () => {
    const entries = Array.from({ length: 2001 }, () => validEntry);
    const analysis = analyzeDeckImport(deckPayload(entries));
    expect(analysis.ok).toBe(false);
  });

  it("supports unknown-version opt-in with recognized fields", () => {
    const analysis = analyzeDeckImport(deckPayload([validEntry], "9.9.9"));
    expect(analysis.ok).toBe(true);
    if (analysis.ok) expect(analysis.plan.unknownVersion).toBe(true);
  });
});

describe("deck import commit", () => {
  it("replaces the active deck, clears baseline, and preserves duplicates", async () => {
    await mutateActiveDeck(0, (current) => ({
      ...current,
      name: "Old",
      entries: [makeEntry("srd-other", "SRD-5.2.1", "Other")],
    }));
    const analysis = analyzeDeckImport(deckPayload([validEntry, validEntry]));
    if (!analysis.ok) throw new Error("expected ok");
    const active = await applyDeckImport(analysis.plan, 1);
    expect(active.name).toBe("Imported");
    expect(active.entries).toHaveLength(2);
    expect(active.entries[0].spellId).toBe("srd-fireball");
    expect(active.entries[0].entryId).not.toBe(active.entries[1].entryId);
    expect(active.savedDeckId).toBeUndefined();
    expect(active.baseline).toBeNull();
    expect(active.revision).toBe(2);
    expect((await getActiveDeck()).entries).toHaveLength(2);
  });
});
