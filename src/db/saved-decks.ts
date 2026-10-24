import { db } from "./database.ts";
import {
  ACTIVE_DECK_ID,
  createEmptyActiveDeck,
  dedupeDeckEntries,
  savedDeckSchema,
  type ActiveDeckRecord,
  type DeckEntry,
  type SavedDeck,
} from "@/domain/deck";
import { cloneEntries } from "./active-deck.ts";
import { DeckConflictError } from "./active-deck.ts";
import { newUuid } from "@/domain/ids";

export class SavedDeckConflictError extends Error {
  constructor(
    readonly savedDeckId: string,
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      `Saved deck "${savedDeckId}" revision changed (expected ${expectedRevision}, found ${actualRevision}).`,
    );
    this.name = "SavedDeckConflictError";
  }
}

export async function listSavedDecks(): Promise<SavedDeck[]> {
  const decks = await db.savedDecks.toArray();
  return decks
    .map((deck) => ({ ...deck, entries: dedupeDeckEntries(deck.entries) }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface SavedDeckWriteResult {
  savedDeck: SavedDeck;
  active: ActiveDeckRecord;
}

function readActiveOrEmpty(): Promise<ActiveDeckRecord | undefined> {
  return db.activeDeck.get(ACTIVE_DECK_ID);
}

function assertActiveRevision(
  current: ActiveDeckRecord | undefined,
  expectedRevision: number,
): ActiveDeckRecord {
  const deck = current ?? createEmptyActiveDeck();
  if (deck.revision !== expectedRevision) {
    throw new DeckConflictError(expectedRevision, deck.revision);
  }
  return deck;
}

function withBaseline(
  deck: ActiveDeckRecord,
  name: string,
  entries: readonly DeckEntry[],
  savedDeckId: string,
): ActiveDeckRecord {
  return {
    ...deck,
    name,
    entries: dedupeDeckEntries(cloneEntries(entries)),
    savedDeckId,
    baseline: { name, entries: dedupeDeckEntries(cloneEntries(entries)) },
    revision: deck.revision + 1,
  };
}

/** Save New / Save As: creates a brand-new saved snapshot and binds the active deck to it. */
export async function saveNewDeck(
  activeExpectedRevision: number,
  name: string,
  entries: readonly DeckEntry[],
): Promise<SavedDeckWriteResult> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 120) {
    throw new Error("Deck name must be 1-120 characters.");
  }
  const id = newUuid();
  const now = Date.now();
  return db.transaction("rw", db.activeDeck, db.savedDecks, async () => {
    const current = assertActiveRevision(await readActiveOrEmpty(), activeExpectedRevision);
    const savedDeck: SavedDeck = savedDeckSchema.parse({
      id,
      name: trimmed,
      updatedAt: now,
      revision: 0,
      entries: dedupeDeckEntries(cloneEntries(entries)),
    });
    await db.savedDecks.put(savedDeck);
    const active = withBaseline(current, trimmed, entries, id);
    await db.activeDeck.put(active);
    return { savedDeck, active };
  });
}

/** Overwrite Saved: replaces an existing snapshot after explicit target choice. */
export async function overwriteSavedDeck(options: {
  activeExpectedRevision: number;
  targetSavedId: string;
  expectedSavedRevision: number;
  name: string;
  entries: readonly DeckEntry[];
}): Promise<SavedDeckWriteResult> {
  const trimmed = options.name.trim();
  if (trimmed.length === 0 || trimmed.length > 120) {
    throw new Error("Deck name must be 1-120 characters.");
  }
  return db.transaction("rw", db.activeDeck, db.savedDecks, async () => {
    const existing = await db.savedDecks.get(options.targetSavedId);
    if (!existing) {
      throw new SavedDeckConflictError(options.targetSavedId, options.expectedSavedRevision, -1);
    }
    if (existing.revision !== options.expectedSavedRevision) {
      throw new SavedDeckConflictError(
        options.targetSavedId,
        options.expectedSavedRevision,
        existing.revision,
      );
    }
    const current = assertActiveRevision(await readActiveOrEmpty(), options.activeExpectedRevision);
    const savedDeck: SavedDeck = {
      ...existing,
      name: trimmed,
      updatedAt: Date.now(),
      revision: existing.revision + 1,
      entries: dedupeDeckEntries(cloneEntries(options.entries)),
    };
    await db.savedDecks.put(savedDeck);
    const active = withBaseline(current, trimmed, options.entries, options.targetSavedId);
    await db.activeDeck.put(active);
    return { savedDeck, active };
  });
}

/** Load Saved: replaces the active deck with a saved snapshot (never merges). */
export async function loadSavedDeck(
  activeExpectedRevision: number,
  savedId: string,
): Promise<ActiveDeckRecord> {
  return db.transaction("rw", db.activeDeck, db.savedDecks, async () => {
    const current = assertActiveRevision(await readActiveOrEmpty(), activeExpectedRevision);
    const saved = await db.savedDecks.get(savedId);
    if (!saved) throw new Error(`Saved deck "${savedId}" was not found.`);
    const entries = dedupeDeckEntries(cloneEntries(saved.entries));
    const active: ActiveDeckRecord = {
      ...current,
      name: saved.name,
      entries,
      savedDeckId: saved.id,
      baseline: { name: saved.name, entries: dedupeDeckEntries(cloneEntries(entries)) },
      revision: current.revision + 1,
    };
    await db.activeDeck.put(active);
    return active;
  });
}

/** Delete a saved snapshot; when it is the active association, clear it. */
export async function deleteSavedDeck(
  activeExpectedRevision: number,
  savedId: string,
): Promise<{ active: ActiveDeckRecord }> {
  return db.transaction("rw", db.activeDeck, db.savedDecks, async () => {
    const current = assertActiveRevision(await readActiveOrEmpty(), activeExpectedRevision);
    await db.savedDecks.delete(savedId);
    let active = current;
    if (current.savedDeckId === savedId) {
      active = {
        ...current,
        baseline: null,
        revision: current.revision + 1,
      };
      delete active.savedDeckId;
      await db.activeDeck.put(active);
    }
    return { active };
  });
}
