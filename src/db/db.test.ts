import { beforeEach, describe, expect, it } from "vite-plus/test";
import Dexie from "dexie";
import { db, SpellCardsDatabase } from "@/db/database.ts";
import {
  DeckConflictError,
  addEntry,
  clearEntries,
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
  newActiveDeck,
  renameActiveDeck,
  saveAssociatedDeck,
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

  it("trims names without silently slicing overlong values", async () => {
    const deck = await mutateActiveDeck(0, (current) => ({ ...current, name: "  Trimmed  " }));
    expect(deck.name).toBe("Trimmed");
    await expect(
      mutateActiveDeck(deck.revision, (current) => ({ ...current, name: "x".repeat(121) })),
    ).rejects.toThrow("Deck name must be 1-120 characters.");
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

  it("does not write a new revision when clearing an empty deck", async () => {
    const deck = await getActiveDeck();
    const unchanged = await mutateActiveDeck(deck.revision, (current) => clearEntries(current));
    expect(unchanged.revision).toBe(deck.revision);
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
    const result = await saveNewDeck(1, "My Deck");
    expect(result.savedDeck.revision).toBe(1);
    expect(result.active.savedDeckId).toBe(result.savedDeck.id);
    expect(result.active.baseline?.name).toBe("My Deck");
    expect(result.active.baseline?.savedRevision).toBe(1);
    expect(result.active.revision).toBe(2);
  });

  it("associated Save updates only the associated snapshot and advances both revisions", async () => {
    const created = await saveNewDeck(0, "Deck");
    await mutateActiveDeck(created.active.revision, (current) => ({
      ...current,
      entries: [makeEntry("srd-a", "SRD-5.2.1", "A")],
    }));
    const activeBefore = await getActiveDeck();
    const result = await saveAssociatedDeck(activeBefore.revision);
    expect(result.changed).toBe(true);
    expect(result.savedDeck?.id).toBe(created.savedDeck.id);
    expect(result.savedDeck?.revision).toBe(2);
    expect(result.active.baseline?.savedRevision).toBe(2);
    expect(result.active.revision).toBe(activeBefore.revision + 1);
    expect((await db.savedDecks.get(created.savedDeck.id))?.revision).toBe(2);
  });

  it("associated Save leaves another snapshot with the same name unchanged", async () => {
    const first = await saveNewDeck(0, "Same name");
    const second = await saveNewDeck(first.active.revision, "Same name");
    await mutateActiveDeck(second.active.revision, (current) => ({
      ...current,
      entries: [makeEntry("srd-a", "SRD-5.2.1", "A")],
    }));
    await saveAssociatedDeck((await getActiveDeck()).revision);
    expect((await db.savedDecks.get(first.savedDeck.id))?.revision).toBe(1);
    expect((await db.savedDecks.get(second.savedDeck.id))?.revision).toBe(2);
  });

  it("associated Save is a no-op when the deck is clean", async () => {
    const created = await saveNewDeck(0, "Deck");
    const result = await saveAssociatedDeck(created.active.revision);
    expect(result.changed).toBe(false);
    expect(result.savedDeck).toBeNull();
    expect(result.active.revision).toBe(created.active.revision);
  });

  it("rejects stale saved-snapshot revisions", async () => {
    const created = await saveNewDeck(0, "Deck");
    await mutateActiveDeck(created.active.revision, (current) => ({
      ...current,
      name: "Changed",
    }));
    const external = await db.savedDecks.get(created.savedDeck.id);
    if (!external) throw new Error("expected saved deck");
    await db.savedDecks.put({ ...external, revision: 2 });
    await expect(saveAssociatedDeck((await getActiveDeck()).revision)).rejects.toBeInstanceOf(
      SavedDeckConflictError,
    );
  });

  it("rejects saving when the associated snapshot was deleted", async () => {
    const created = await saveNewDeck(0, "Deck");
    await mutateActiveDeck(created.active.revision, (current) => ({
      ...current,
      name: "Changed",
    }));
    await db.savedDecks.delete(created.savedDeck.id);
    await expect(saveAssociatedDeck((await getActiveDeck()).revision)).rejects.toBeInstanceOf(
      SavedDeckConflictError,
    );
  });

  it("loads a saved snapshot and replaces the active deck", async () => {
    await mutateActiveDeck(0, (current) => ({
      ...current,
      name: "Saved",
      entries: [makeEntry("srd-a", "SRD-5.2.1", "A")],
    }));
    const created = await saveNewDeck(1, "Saved");
    await mutateActiveDeck(created.active.revision, (current) => ({ ...current, name: "Edited" }));
    const loaded = await loadSavedDeck((await getActiveDeck()).revision, created.savedDeck.id);
    expect(loaded.changed).toBe(true);
    expect(loaded.active.name).toBe("Saved");
    expect(loaded.active.baseline?.name).toBe("Saved");
    expect(loaded.active.baseline?.savedRevision).toBe(1);
  });

  it("reopening an identical snapshot is a no-op", async () => {
    const created = await saveNewDeck(0, "Saved");
    const loaded = await loadSavedDeck(created.active.revision, created.savedDeck.id);
    expect(loaded.changed).toBe(false);
    expect(loaded.active.revision).toBe(created.active.revision);
  });

  it("reopening a changed snapshot refreshes the active deck", async () => {
    const created = await saveNewDeck(0, "Saved");
    const stored = await db.savedDecks.get(created.savedDeck.id);
    if (!stored) throw new Error("expected saved deck");
    await db.savedDecks.put({ ...stored, revision: 2, name: "Renamed externally" });
    const loaded = await loadSavedDeck(created.active.revision, created.savedDeck.id);
    expect(loaded.changed).toBe(true);
    expect(loaded.active.name).toBe("Renamed externally");
    expect(loaded.active.baseline?.savedRevision).toBe(2);
  });

  it("deduplicates a saved snapshot when loading it", async () => {
    await db.savedDecks.put({
      id: "saved-duplicates",
      name: "Duplicates",
      updatedAt: 1,
      revision: 1,
      entries: [
        makeEntry("srd-a", "SRD-5.2.1", "A"),
        makeEntry("srd-b", "SRD-5.2.1", "B"),
        makeEntry("srd-a", "SRD-5.2.1", "A again"),
      ],
    });
    const loaded = await loadSavedDeck(0, "saved-duplicates");
    expect(loaded.active.entries.map((entry) => entry.spellId)).toEqual(["srd-a", "srd-b"]);
    expect(loaded.active.baseline?.entries.map((entry) => entry.spellId)).toEqual([
      "srd-a",
      "srd-b",
    ]);
  });

  it("clears the active association when deleting the linked saved deck", async () => {
    const created = await saveNewDeck(0, "Deck");
    const after = await deleteSavedDeck(
      created.active.revision,
      created.savedDeck.id,
      created.savedDeck.revision,
    );
    expect(after.changed).toBe(true);
    expect(after.active.savedDeckId).toBeUndefined();
    expect(Object.hasOwn(after.active, "savedDeckId")).toBe(false);
    expect(after.active.baseline).toBeNull();
    expect(after.active.revision).toBe(created.active.revision + 1);
    expect(await listSavedDecks()).toHaveLength(0);
  });

  it("deleting a non-associated snapshot leaves the active deck unchanged", async () => {
    const first = await saveNewDeck(0, "First");
    const second = await saveNewDeck(first.active.revision, "Second");
    const after = await deleteSavedDeck(
      second.active.revision,
      first.savedDeck.id,
      first.savedDeck.revision,
    );
    expect(after.changed).toBe(false);
    expect(after.active.savedDeckId).toBe(second.savedDeck.id);
    expect(after.active.revision).toBe(second.active.revision);
    expect(await db.savedDecks.get(first.savedDeck.id)).toBeUndefined();
    expect(await db.savedDecks.get(second.savedDeck.id)).toBeDefined();
  });

  it("aborts deletion for a stale saved revision", async () => {
    const created = await saveNewDeck(0, "Deck");
    await expect(
      deleteSavedDeck(
        created.active.revision,
        created.savedDeck.id,
        created.savedDeck.revision + 1,
      ),
    ).rejects.toBeInstanceOf(SavedDeckConflictError);
    expect(await db.savedDecks.get(created.savedDeck.id)).toBeDefined();
  });

  it("new deck blanks the workspace and retains saved snapshots", async () => {
    const created = await saveNewDeck(0, "Keep me");
    await mutateActiveDeck(created.active.revision, (current) => ({
      ...current,
      entries: [makeEntry("srd-a", "SRD-5.2.1", "A")],
    }));
    const result = await newActiveDeck((await getActiveDeck()).revision);
    expect(result.changed).toBe(true);
    expect(result.active.name).toBe("");
    expect(result.active.entries).toHaveLength(0);
    expect(result.active.savedDeckId).toBeUndefined();
    expect(Object.hasOwn(result.active, "savedDeckId")).toBe(false);
    expect(result.active.baseline).toBeNull();
    expect(await db.savedDecks.get(created.savedDeck.id)).toBeDefined();
  });

  it("new deck is a no-op on an already blank workspace", async () => {
    const deck = await getActiveDeck();
    const result = await newActiveDeck(deck.revision);
    expect(result.changed).toBe(false);
    expect(result.active.revision).toBe(deck.revision);
  });

  it("renames unassociated decks, allowing the empty name", async () => {
    const named = await renameActiveDeck(0, "  Named  ");
    expect(named.changed).toBe(true);
    expect(named.active.name).toBe("Named");
    const blank = await renameActiveDeck(named.active.revision, "   ");
    expect(blank.active.name).toBe("");
    const unchanged = await renameActiveDeck(blank.active.revision, "");
    expect(unchanged.changed).toBe(false);
  });

  it("rejects invalid associated renames without writing", async () => {
    const created = await saveNewDeck(0, "Deck");
    await expect(renameActiveDeck(created.active.revision, "  ")).rejects.toThrow(
      "Deck name must be 1-120 characters.",
    );
    await expect(renameActiveDeck(created.active.revision, "x".repeat(121))).rejects.toThrow(
      "Deck name must be 1-120 characters.",
    );
    const deck = await getActiveDeck();
    expect(deck.name).toBe("Deck");
    expect(deck.revision).toBe(created.active.revision);
  });

  it("rename keeps the baseline and saved snapshot untouched", async () => {
    const created = await saveNewDeck(0, "Deck");
    const renamed = await renameActiveDeck(created.active.revision, "Renamed");
    expect(renamed.active.baseline?.name).toBe("Deck");
    expect(renamed.active.baseline?.savedRevision).toBe(1);
    expect((await db.savedDecks.get(created.savedDeck.id))?.name).toBe("Deck");
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

async function createLegacyDatabase(name: string): Promise<Dexie> {
  const legacy = new Dexie(name);
  legacy.version(1).stores({
    customSpells: "id, name, updatedAt",
    savedDecks: "id, updatedAt",
    activeDeck: "id",
  });
  await legacy.open();
  return legacy;
}

describe("database migration", () => {
  it("upgrades a v1 database, dedupes entries, and normalizes saved revisions", async () => {
    const name = `spell-cards-migration-${Date.now()}`;
    const legacy = await createLegacyDatabase(name);
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
      expect(saved?.revision).toBe(1);
    } finally {
      upgraded.close();
      await Dexie.delete(name);
    }
  });

  it("verifies a legacy association whose baseline matches its snapshot", async () => {
    const name = `spell-cards-migration-match-${Date.now()}`;
    const legacy = await createLegacyDatabase(name);
    const entries = [makeEntry("srd-a", "SRD-5.2.1", "A")];
    await legacy.table("savedDecks").put({
      id: "saved-match",
      name: "Legacy",
      updatedAt: 1,
      revision: 0,
      entries,
    });
    await legacy.table("activeDeck").put({
      id: "active",
      name: "Legacy",
      savedDeckId: "saved-match",
      entries,
      revision: 3,
      baseline: { name: "Legacy", entries },
    });
    legacy.close();

    const upgraded = new SpellCardsDatabase(name);
    await upgraded.open();
    try {
      const active = await upgraded.activeDeck.get("active");
      expect(active?.baseline?.savedRevision).toBe(1);
      expect(active?.revision).toBe(3);
    } finally {
      upgraded.close();
      await Dexie.delete(name);
    }
  });

  it("leaves the token absent when a legacy association cannot be verified", async () => {
    const name = `spell-cards-migration-mismatch-${Date.now()}`;
    const legacy = await createLegacyDatabase(name);
    await legacy.table("savedDecks").put({
      id: "saved-mismatch",
      name: "Current snapshot",
      updatedAt: 1,
      revision: 2,
      entries: [makeEntry("srd-a", "SRD-5.2.1", "A")],
    });
    await legacy.table("activeDeck").put({
      id: "active",
      name: "Legacy baseline",
      savedDeckId: "saved-mismatch",
      entries: [makeEntry("srd-b", "SRD-5.2.1", "B")],
      revision: 3,
      baseline: { name: "Legacy baseline", entries: [makeEntry("srd-b", "SRD-5.2.1", "B")] },
    });
    legacy.close();

    const upgraded = new SpellCardsDatabase(name);
    await upgraded.open();
    try {
      const active = await upgraded.activeDeck.get("active");
      expect(active?.baseline?.savedRevision).toBeUndefined();
      expect(active?.revision).toBe(3);
      expect(active?.savedDeckId).toBe("saved-mismatch");
    } finally {
      upgraded.close();
      await Dexie.delete(name);
    }
  });
});
