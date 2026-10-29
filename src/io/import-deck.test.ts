import { beforeEach, describe, expect, it } from "vite-plus/test";
import { db } from "@/db/database.ts";
import { getActiveDeck, mutateActiveDeck, makeEntry } from "@/db/active-deck.ts";
import { analyzeDeckImport, applyDeckImport } from "@/io/import-deck.ts";
import { buildDeckPayload } from "@/io/export.ts";
import type { DeckEntry } from "@/domain/deck.ts";

function deckPayload(entries: unknown[]): string {
  return JSON.stringify({
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
  it("accepts a valid deck and deduplicates repeated spell IDs", () => {
    const analysis = analyzeDeckImport(deckPayload([validEntry, validEntry]));
    expect(analysis.ok).toBe(true);
    if (analysis.ok) {
      expect(analysis.plan.entries).toHaveLength(1);
      expect(analysis.plan.removedDuplicates).toBe(1);
    }
  });

  it("keeps the first occurrence and relative order when deduplicating", () => {
    const second = {
      ...validEntry,
      spellId: "srd-magic-missile",
      reference: { source: "SRD-5.2.1", name: "Magic Missile" },
    };
    const third = {
      ...validEntry,
      spellId: "srd-shield",
      reference: { source: "SRD-5.2.1", name: "Shield" },
    };
    const analysis = analyzeDeckImport(
      deckPayload([validEntry, second, validEntry, third, second]),
    );
    expect(analysis.ok).toBe(true);
    if (analysis.ok) {
      expect(analysis.plan.entries.map((entry) => entry.spellId)).toEqual([
        "srd-fireball",
        "srd-magic-missile",
        "srd-shield",
      ]);
      expect(analysis.plan.removedDuplicates).toBe(2);
    }
  });

  it("round-trips an exported deck with references and order preserved", () => {
    const entries: DeckEntry[] = [
      {
        entryId: "e1",
        spellId: "srd-fireball",
        fitMode: "auto-shrink",
        reference: { source: "SRD-5.2.1", name: "Fireball" },
      },
      {
        entryId: "e2",
        spellId: "custom-1",
        fitMode: "multi-card",
        reference: { source: "Custom", name: "Homebrew" },
      },
    ];
    const analysis = analyzeDeckImport(JSON.stringify(buildDeckPayload({ name: "Deck", entries })));
    expect(analysis.ok).toBe(true);
    if (analysis.ok) {
      expect(analysis.plan.name).toBe("Deck");
      expect(analysis.plan.entries).toEqual([
        { spellId: "srd-fireball", fitMode: "auto-shrink", reference: validEntry.reference },
        {
          spellId: "custom-1",
          fitMode: "multi-card",
          reference: { source: "Custom", name: "Homebrew" },
        },
      ]);
    }
  });

  it("rejects a wrong type", () => {
    const analysis = analyzeDeckImport(JSON.stringify({ type: "custom-spells", entries: [] }));
    expect(analysis.ok).toBe(false);
  });

  it("rejects invalid fit modes", () => {
    const analysis = analyzeDeckImport(deckPayload([{ ...validEntry, fitMode: "squish" }]));
    expect(analysis.ok).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    const analysis = analyzeDeckImport(
      JSON.stringify({
        type: "deck",
        name: "Imported",
        exportedAt: Date.now(),
        entries: [],
        extra: true,
      }),
    );
    expect(analysis.ok).toBe(false);
  });

  it("rejects missing required fields", () => {
    const analysis = analyzeDeckImport(JSON.stringify({ type: "deck", entries: [] }));
    expect(analysis.ok).toBe(false);
  });

  it("enforces the 2000-entry cap", () => {
    const entries = Array.from({ length: 2001 }, () => validEntry);
    const analysis = analyzeDeckImport(deckPayload(entries));
    expect(analysis.ok).toBe(false);
  });
});

describe("deck import commit", () => {
  it("replaces the active deck, clears baseline, and removes duplicate entries", async () => {
    await mutateActiveDeck(0, (current) => ({
      ...current,
      name: "Old",
      entries: [makeEntry("srd-other", "SRD-5.2.1", "Other")],
    }));
    const analysis = analyzeDeckImport(deckPayload([validEntry, validEntry]));
    if (!analysis.ok) throw new Error("expected ok");
    const active = await applyDeckImport(analysis.plan, 1);
    expect(active.name).toBe("Imported");
    expect(active.entries).toHaveLength(1);
    expect(active.entries[0].spellId).toBe("srd-fireball");
    expect(active.savedDeckId).toBeUndefined();
    expect(Object.hasOwn(active, "savedDeckId")).toBe(false);
    expect(active.baseline).toBeNull();
    expect(active.revision).toBe(2);
    expect((await getActiveDeck()).entries).toHaveLength(1);
  });
});
