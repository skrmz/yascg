import { db } from "./database.ts";
import {
  ACTIVE_DECK_ID,
  createEmptyActiveDeck,
  dedupeDeckEntries,
  deckMatchesBaseline,
  deckEntriesEqual,
  isValidDeckName,
  normalizeDeckName,
  savedDeckSchema,
  activeDeckRecordSchema,
  type ActiveDeckRecord,
  type SavedDeck,
} from "@/domain/deck";
import { cloneEntries } from "./active-deck.ts";
import { DeckConflictError } from "./active-deck.ts";
import { newUuid } from "@/domain/ids";
import { AppError, message } from "@/locales/messages.ts";

export class SavedDeckConflictError extends AppError {
  constructor(
    readonly savedDeckId: string,
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      message("error.savedDeckConflict", {
        id: savedDeckId,
        expected: expectedRevision,
        actual: actualRevision,
      }),
      `Saved deck "${savedDeckId}" revision changed (expected ${expectedRevision}, found ${actualRevision}).`,
    );
    this.name = "SavedDeckConflictError";
  }
}

export class InvalidDeckStateError extends AppError {
  constructor() {
    super(
      message("error.deckStateInvalid"),
      "The active deck association and baseline are inconsistent.",
    );
    this.name = "InvalidDeckStateError";
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

export interface ActiveDeckWriteResult {
  active: ActiveDeckRecord;
  changed: boolean;
}

export interface SaveAssociatedResult extends ActiveDeckWriteResult {
  savedDeck: SavedDeck | null;
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

function assertDeckName(raw: string, associated: boolean): string {
  const name = normalizeDeckName(raw);
  if (!isValidDeckName(name, { associated })) {
    throw new AppError(message("error.deckNameLength"), "Deck name must be 1-120 characters.");
  }
  return name;
}

function persisted(active: ActiveDeckRecord): ActiveDeckRecord {
  return activeDeckRecordSchema.parse(active);
}

/** Save As: creates a brand-new saved snapshot and binds the active deck to it. */
export async function saveNewDeck(
  activeExpectedRevision: number,
  name: string,
): Promise<SavedDeckWriteResult> {
  const trimmed = assertDeckName(name, true);
  const id = newUuid();
  const now = Date.now();
  return db.transaction("rw", db.activeDeck, db.savedDecks, async () => {
    const current = assertActiveRevision(await readActiveOrEmpty(), activeExpectedRevision);
    const entries = dedupeDeckEntries(cloneEntries(current.entries));
    const savedDeck = savedDeckSchema.parse({
      id,
      name: trimmed,
      updatedAt: now,
      revision: 1,
      entries: dedupeDeckEntries(cloneEntries(entries)),
    });
    const active = persisted({
      ...current,
      name: trimmed,
      entries,
      savedDeckId: id,
      baseline: {
        name: trimmed,
        entries: dedupeDeckEntries(cloneEntries(entries)),
        savedRevision: savedDeck.revision,
      },
      revision: current.revision + 1,
    });
    await db.savedDecks.put(savedDeck);
    await db.activeDeck.put(active);
    return { savedDeck, active };
  });
}

/**
 * Save: updates only the associated saved snapshot, using the expected saved
 * revision captured in the active baseline as the saved-snapshot CAS token.
 */
export async function saveAssociatedDeck(
  activeExpectedRevision: number,
): Promise<SaveAssociatedResult> {
  return db.transaction("rw", db.activeDeck, db.savedDecks, async () => {
    const current = assertActiveRevision(await readActiveOrEmpty(), activeExpectedRevision);
    const savedDeckId = current.savedDeckId;
    const baseline = current.baseline;
    if (!savedDeckId || baseline === null || baseline.savedRevision === undefined) {
      throw new InvalidDeckStateError();
    }
    if (deckMatchesBaseline(current)) {
      return { active: current, savedDeck: null, changed: false };
    }
    const name = assertDeckName(current.name, true);
    const existing = await db.savedDecks.get(savedDeckId);
    if (!existing) {
      throw new SavedDeckConflictError(savedDeckId, baseline.savedRevision, -1);
    }
    if (existing.revision !== baseline.savedRevision) {
      throw new SavedDeckConflictError(savedDeckId, baseline.savedRevision, existing.revision);
    }
    const entries = dedupeDeckEntries(cloneEntries(current.entries));
    const savedDeck = savedDeckSchema.parse({
      ...existing,
      name,
      updatedAt: Date.now(),
      revision: existing.revision + 1,
      entries: dedupeDeckEntries(cloneEntries(entries)),
    });
    const active = persisted({
      ...current,
      name,
      entries,
      baseline: {
        name,
        entries: dedupeDeckEntries(cloneEntries(entries)),
        savedRevision: savedDeck.revision,
      },
      revision: current.revision + 1,
    });
    await db.savedDecks.put(savedDeck);
    await db.activeDeck.put(active);
    return { active, savedDeck, changed: true };
  });
}

/** Open: replaces the active deck with a saved snapshot (never merges). */
export async function loadSavedDeck(
  activeExpectedRevision: number,
  savedId: string,
): Promise<ActiveDeckWriteResult> {
  return db.transaction("rw", db.activeDeck, db.savedDecks, async () => {
    const current = assertActiveRevision(await readActiveOrEmpty(), activeExpectedRevision);
    const saved = await db.savedDecks.get(savedId);
    if (!saved) {
      throw new AppError(
        message("error.savedDeckMissing", { id: savedId }),
        `Saved deck "${savedId}" was not found.`,
      );
    }
    const entries = dedupeDeckEntries(cloneEntries(saved.entries));
    const baselineMatches =
      current.savedDeckId === saved.id &&
      current.baseline !== null &&
      current.baseline.savedRevision === saved.revision &&
      current.baseline.name === saved.name &&
      deckEntriesEqual(current.baseline.entries, entries);
    const contentMatches =
      current.name === saved.name && deckEntriesEqual(current.entries, entries);
    if (baselineMatches && contentMatches) {
      return { active: current, changed: false };
    }
    const active = persisted({
      ...current,
      name: saved.name,
      entries,
      savedDeckId: saved.id,
      baseline: {
        name: saved.name,
        entries: dedupeDeckEntries(cloneEntries(entries)),
        savedRevision: saved.revision,
      },
      revision: current.revision + 1,
    });
    await db.activeDeck.put(active);
    return { active, changed: true };
  });
}

/** Delete a saved snapshot; when it is the active association, clear it. */
export async function deleteSavedDeck(
  activeExpectedRevision: number,
  savedId: string,
  expectedSavedRevision: number,
): Promise<ActiveDeckWriteResult> {
  return db.transaction("rw", db.activeDeck, db.savedDecks, async () => {
    const current = assertActiveRevision(await readActiveOrEmpty(), activeExpectedRevision);
    const existing = await db.savedDecks.get(savedId);
    if (!existing) {
      throw new SavedDeckConflictError(savedId, expectedSavedRevision, -1);
    }
    if (existing.revision !== expectedSavedRevision) {
      throw new SavedDeckConflictError(savedId, expectedSavedRevision, existing.revision);
    }
    await db.savedDecks.delete(savedId);
    if (current.savedDeckId !== savedId) {
      return { active: current, changed: false };
    }
    const active: ActiveDeckRecord = {
      ...current,
      baseline: null,
      revision: current.revision + 1,
    };
    delete active.savedDeckId;
    const next = persisted(active);
    await db.activeDeck.put(next);
    return { active: next, changed: true };
  });
}

/** New deck: blanks the active singleton without touching any saved snapshot. */
export async function newActiveDeck(
  activeExpectedRevision: number,
): Promise<ActiveDeckWriteResult> {
  return db.transaction("rw", db.activeDeck, async () => {
    const current = assertActiveRevision(await readActiveOrEmpty(), activeExpectedRevision);
    if (
      current.name === "" &&
      current.entries.length === 0 &&
      current.savedDeckId === undefined &&
      current.baseline === null
    ) {
      return { active: current, changed: false };
    }
    const active = persisted({
      id: ACTIVE_DECK_ID,
      name: "",
      entries: [],
      baseline: null,
      revision: current.revision + 1,
    });
    await db.activeDeck.put(active);
    return { active, changed: true };
  });
}

/** Rename only the committed active name; never touches the saved snapshot. */
export async function renameActiveDeck(
  activeExpectedRevision: number,
  rawName: string,
): Promise<ActiveDeckWriteResult> {
  return db.transaction("rw", db.activeDeck, async () => {
    const current = assertActiveRevision(await readActiveOrEmpty(), activeExpectedRevision);
    const name = assertDeckName(rawName, current.savedDeckId !== undefined);
    if (name === current.name) {
      return { active: current, changed: false };
    }
    const active = persisted({ ...current, name, revision: current.revision + 1 });
    await db.activeDeck.put(active);
    return { active, changed: true };
  });
}
