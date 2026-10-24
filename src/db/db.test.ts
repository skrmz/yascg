import { beforeEach, describe, expect, it } from "vite-plus/test";
import Dexie from "dexie";
import { db, SpellCardsDatabase } from "@/db/database.ts";
import {
  DeckConflictError,
  addEntry,
  getActiveDeck,
  makeEntry,
  mutateActiveDeck,
  removeEntry,
  repairEntry,
  reorderEntries,
} from "@/db/active-deck.ts";
import {
  SavedDeckConflictError,
  deleteSavedDeck,
  listSavedDecks,
  loadSavedDeck,
  overwriteSavedDeck,
  saveNewDeck,
} from "@/db/saved-decks.ts";
import { deleteCustomSpell, putCustomSpell, restoreDeletedSpell } from "@/db/custom-spells.ts";
import { makeCustomSpell } from "@/test/fixtures/spells.ts";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("active deck persistence", () => {
  it("lazily creates the singleton at revision 0", async () => {
    const deck = await getActiveDeck();
    expect(deck.id).toBe("active");
    expect(deck.revision).toBe(0);
    expect(deck.baseline).toBeNull();
  });

  it("increments revision on each successful mutation", async () => {
    const first = await mutateActiveDeck(0, (current) => ({
      ...current,
      entries: [makeEntry("srd-x", "SRD-5.2.1", "X")],
    }));
    expect(first.revision).toBe(1);
    const second = await mutateActiveDeck(1, (current) => removeEntry(current, "nope"));
    expect(second.revision).toBe(2);
  });

  it("aborts stale writes with a conflict error", async () => {
    await mutateActiveDeck(0, (current) => ({
      ...current,
      entries: [makeEntry("srd-a", "SRD-5.2.1", "A")],
    }));
    await expect(mutateActiveDeck(0, (current) => current)).rejects.toBeInstanceOf(
      DeckConflictError,
    );
  });

  it("rolls back when the mutator throws", async () => {
    await mutateActiveDeck(0, (current) => ({
      ...current,
      entries: [makeEntry("srd-a", "SRD-5.2.1", "A")],
    }));
    await expect(
      mutateActiveDeck(1, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const deck = await getActiveDeck();
    expect(deck.revision).toBe(1);
    expect(deck.entries).toHaveLength(1);
  });

  it("reorders entries deterministically", async () => {
    const deck = await mutateActiveDeck(0, (current) => ({
      ...current,
      entries: [
        makeEntry("srd-a", "SRD-5.2.1", "A"),
        makeEntry("srd-b", "SRD-5.2.1", "B"),
        makeEntry("srd-c", "SRD-5.2.1", "C"),
      ],
    }));
    const reordered = reorderEntries(deck, 0, 2);
    expect(reordered.entries.map((entry) => entry.spellId)).toEqual(["srd-b", "srd-c", "srd-a"]);
  });

  it("does not add a second entry for the same spell", async () => {
    const deck = await mutateActiveDeck(0, (current) => ({
      ...current,
      entries: [makeEntry("srd-a", "SRD-5.2.1", "A")],
    }));
    const next = addEntry(deck, makeEntry("srd-a", "SRD-5.2.1", "A copy"));
    expect(next).toBe(deck);
    expect(next.entries).toHaveLength(1);
  });

  it("does not write a new revision for a duplicate add", async () => {
    const deck = await mutateActiveDeck(0, (current) => ({
      ...current,
      entries: [makeEntry("srd-a", "SRD-5.2.1", "A")],
    }));
    const unchanged = await mutateActiveDeck(deck.revision, (current) =>
      addEntry(current, makeEntry("srd-a", "SRD-5.2.1", "A again")),
    );
    expect(unchanged.revision).toBe(deck.revision);
    expect(unchanged.entries).toHaveLength(1);
  });

  it("normalizes duplicate entries before persisting", async () => {
    const deck = await mutateActiveDeck(0, (current) => ({
      ...current,
      entries: [
        makeEntry("srd-a", "SRD-5.2.1", "A"),
        makeEntry("srd-b", "SRD-5.2.1", "B"),
        makeEntry("srd-a", "SRD-5.2.1", "A again"),
      ],
    }));
    expect(deck.entries.map((entry) => entry.spellId)).toEqual(["srd-a", "srd-b"]);
  });

  it("does not repair an entry to a spell already in the deck", async () => {
    const deck = await mutateActiveDeck(0, (current) => ({
      ...current,
      entries: [makeEntry("srd-a", "SRD-5.2.1", "A"), makeEntry("missing", "SRD-5.2.1", "Missing")],
    }));
    const repaired = repairEntry(deck, deck.entries[1].entryId, {
      spellId: "srd-a",
      reference: { source: "SRD-5.2.1", name: "A" },
    });
    expect(repaired).toBe(deck);
  });
});

describe("saved decks", () => {
  it("save-new binds the active deck and baseline", async () => {
    await mutateActiveDeck(0, (current) => ({
      ...current,
      name: "My Deck",
      entries: [makeEntry("srd-a", "SRD-5.2.1", "A")],
    }));
    const result = await saveNewDeck(1, "My Deck", (await getActiveDeck()).entries);
    expect(result.active.savedDeckId).toBe(result.savedDeck.id);
    expect(result.active.baseline?.name).toBe("My Deck");
    expect(result.active.revision).toBe(2);
  });

  it("rejects stale saved-deck overwrites", async () => {
    await mutateActiveDeck(0, (current) => ({ ...current, name: "Deck" }));
    const result = await saveNewDeck(1, "Deck", []);
    await expect(
      overwriteSavedDeck({
        activeExpectedRevision: result.active.revision,
        targetSavedId: result.savedDeck.id,
        expectedSavedRevision: result.savedDeck.revision + 5,
        name: "Deck",
        entries: [],
      }),
    ).rejects.toBeInstanceOf(SavedDeckConflictError);
  });

  it("loads a saved snapshot and replaces the active deck", async () => {
    await mutateActiveDeck(0, (current) => ({
      ...current,
      name: "Saved",
      entries: [makeEntry("srd-a", "SRD-5.2.1", "A")],
    }));
    const result = await saveNewDeck(1, "Saved", (await getActiveDeck()).entries);
    await mutateActiveDeck(result.active.revision, (current) => ({ ...current, name: "Edited" }));
    const loaded = await loadSavedDeck((await getActiveDeck()).revision, result.savedDeck.id);
    expect(loaded.name).toBe("Saved");
    expect(loaded.baseline?.name).toBe("Saved");
  });

  it("deduplicates a saved snapshot when loading it", async () => {
    await db.savedDecks.put({
      id: "saved-duplicates",
      name: "Duplicates",
      updatedAt: 1,
      revision: 0,
      entries: [
        makeEntry("srd-a", "SRD-5.2.1", "A"),
        makeEntry("srd-b", "SRD-5.2.1", "B"),
        makeEntry("srd-a", "SRD-5.2.1", "A again"),
      ],
    });
    const loaded = await loadSavedDeck(0, "saved-duplicates");
    expect(loaded.entries.map((entry) => entry.spellId)).toEqual(["srd-a", "srd-b"]);
    expect(loaded.baseline?.entries.map((entry) => entry.spellId)).toEqual(["srd-a", "srd-b"]);
  });

  it("clears the active association when deleting the linked saved deck", async () => {
    await mutateActiveDeck(0, (current) => ({ ...current, name: "Deck" }));
    const result = await saveNewDeck(1, "Deck", []);
    const after = await deleteSavedDeck(result.active.revision, result.savedDeck.id);
    expect(after.active.savedDeckId).toBeUndefined();
    expect(after.active.baseline).toBeNull();
    expect(await listSavedDecks()).toHaveLength(0);
  });
});

describe("custom spell deletion and undo", () => {
  it("removes the spell and all matching active entries atomically", async () => {
    const spell = makeCustomSpell({ id: "custom-1" });
    await putCustomSpell(spell);
    await mutateActiveDeck(0, (current) => ({
      ...current,
      entries: [
        makeEntry("custom-1", "Custom", "Custom Spell"),
        makeEntry("srd-a", "SRD-5.2.1", "A"),
        makeEntry("custom-1", "Custom", "Custom Spell"),
      ],
    }));
    const deletion = await deleteCustomSpell(1, "custom-1");
    expect(deletion).not.toBeNull();
    expect(deletion?.activeEntries).toHaveLength(1);
    const deck = await getActiveDeck();
    expect(deck.entries.map((entry) => entry.spellId)).toEqual(["srd-a"]);
    expect(deck.revision).toBe(2);
    expect(await db.customSpells.get("custom-1")).toBeUndefined();
  });

  it("restores the spell and entries at original positions", async () => {
    const spell = makeCustomSpell({ id: "custom-1" });
    await putCustomSpell(spell);
    await mutateActiveDeck(0, (current) => ({
      ...current,
      entries: [
        makeEntry("srd-a", "SRD-5.2.1", "A"),
        makeEntry("custom-1", "Custom", "Custom Spell"),
        makeEntry("srd-b", "SRD-5.2.1", "B"),
      ],
    }));
    const deletion = await deleteCustomSpell(1, "custom-1");
    expect(deletion).not.toBeNull();
    if (!deletion) return;
    const restored = await restoreDeletedSpell(deletion, deletion.activeRevisionAfter);
    expect(restored.entries.map((entry) => entry.spellId)).toEqual(["srd-a", "custom-1", "srd-b"]);
    expect(await db.customSpells.get("custom-1")).toBeDefined();
  });

  it("refuses undo after an intervening active-deck edit", async () => {
    const spell = makeCustomSpell({ id: "custom-1" });
    await putCustomSpell(spell);
    await mutateActiveDeck(0, (current) => ({
      ...current,
      entries: [makeEntry("custom-1", "Custom", "Custom Spell")],
    }));
    const deletion = await deleteCustomSpell(1, "custom-1");
    if (!deletion) throw new Error("expected deletion");
    await mutateActiveDeck(deletion.activeRevisionAfter, (current) => ({
      ...current,
      name: "Changed",
    }));
    await expect(
      restoreDeletedSpell(deletion, deletion.activeRevisionAfter),
    ).rejects.toBeInstanceOf(DeckConflictError);
  });
});

describe("database migration", () => {
  it("upgrades a v1 database and removes duplicate deck entries", async () => {
    const name = `spell-cards-migration-${Date.now()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      customSpells: "id, name, updatedAt",
      savedDecks: "id, updatedAt",
      activeDeck: "id",
    });
    await legacy.open();
    await legacy.table("customSpells").put(makeCustomSpell({ id: "c1" }));
    const duplicateEntries = [
      makeEntry("srd-a", "SRD-5.2.1", "A"),
      makeEntry("srd-b", "SRD-5.2.1", "B"),
      makeEntry("srd-a", "SRD-5.2.1", "A again"),
    ];
    await legacy.table("activeDeck").put({
      id: "active",
      name: "Legacy",
      entries: duplicateEntries,
      revision: 3,
      baseline: null,
    });
    await legacy.table("savedDecks").put({
      id: "saved-1",
      name: "Saved legacy",
      updatedAt: 1,
      revision: 0,
      entries: duplicateEntries,
    });
    legacy.close();

    const upgraded = new SpellCardsDatabase(name);
    await upgraded.open();
    try {
      expect(await upgraded.customSpells.get("c1")).toBeDefined();
      expect(await upgraded.srdSpellOverrides.count()).toBe(0);
      const active = await upgraded.activeDeck.get("active");
      expect(active?.entries.map((entry) => entry.spellId)).toEqual(["srd-a", "srd-b"]);
      expect(active?.revision).toBe(4);
      const saved = await upgraded.savedDecks.get("saved-1");
      expect(saved?.entries.map((entry) => entry.spellId)).toEqual(["srd-a", "srd-b"]);
    } finally {
      upgraded.close();
      await Dexie.delete(name);
    }
  });
});
