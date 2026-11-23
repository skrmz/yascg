import { db } from "./database.ts";
import {
  CollectionChangedError,
  INITIAL_COLLECTION_GENERATION,
  openCollectionStorage,
  readCollectionMetadata,
  writeCollection,
} from "./collection-state.ts";
import { type Table } from "dexie";
import {
  ACTIVE_DECK_ID,
  DECK_NAME_MAX_LENGTH,
  storedActiveDeckSchema,
  createEmptyActiveDeck,
  dedupeDeckEntries,
  deckEntrySchema,
  hasSpellEntry,
  type ActiveDeckRecord,
  type DeckBaseline,
  type DeckEntry,
} from "@/domain/deck";
import type { CardFitMode, SpellSource } from "@/domain/spells";
import { newEntryId, newUuid } from "@/domain/ids";
import { AppError, message } from "@/locales/messages.ts";

export class DeckConflictError extends AppError {
  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      message("error.deckConflict", {
        expected: expectedRevision,
        actual: actualRevision,
      }),
      `Active deck revision changed (expected ${expectedRevision}, found ${actualRevision}).`,
    );
    this.name = "DeckConflictError";
  }
}

export type ActiveDeckMutator = (current: ActiveDeckRecord) => ActiveDeckRecord;

export async function getActiveDeck(
  generation = INITIAL_COLLECTION_GENERATION,
): Promise<ActiveDeckRecord> {
  return writeCollection(generation, [db.activeDeck], async (markChanged) => {
    const existing = await db.activeDeck.get(ACTIVE_DECK_ID);
    if (existing) return existing;
    const created = createEmptyActiveDeck();
    await db.activeDeck.put(created);
    markChanged();
    return created;
  });
}

/** Read-only accessor safe for reactive (liveQuery) reads. */
export async function readActiveDeck(): Promise<ActiveDeckRecord | undefined> {
  return db.activeDeck.get(ACTIVE_DECK_ID);
}

export async function readCurrentDeck(generation?: string): Promise<ActiveDeckRecord> {
  await openCollectionStorage();
  return db.transaction("r", db.activeDeck, db.collectionMetadata, async () => {
    if (generation !== undefined && (await readCollectionMetadata()).generation !== generation) {
      throw new CollectionChangedError();
    }
    return (await readActiveDeck()) ?? createEmptyActiveDeck();
  });
}

/** Ensures the singleton row exists; safe to call from a mount effect. */
export async function ensureActiveDeck(
  generation = INITIAL_COLLECTION_GENERATION,
): Promise<ActiveDeckRecord> {
  return getActiveDeck(generation);
}

/**
 * Compare-and-swap the active deck inside a single Dexie read-write transaction.
 * Aborts on a stale expected revision instead of overwriting newer work.
 */
export async function mutateActiveDeck(
  expectedRevision: number,
  mutator: ActiveDeckMutator,
  extraTables: Table[] = [],
  generation = INITIAL_COLLECTION_GENERATION,
): Promise<ActiveDeckRecord> {
  return writeCollection(generation, [db.activeDeck, ...extraTables], async (markChanged) => {
    const current = (await db.activeDeck.get(ACTIVE_DECK_ID)) ?? createEmptyActiveDeck();
    if (current.revision !== expectedRevision) {
      throw new DeckConflictError(expectedRevision, current.revision);
    }
    const draft = mutator(current);
    const entries = dedupeDeckEntries(draft.entries);
    const baseline =
      draft.baseline === null
        ? null
        : { ...draft.baseline, entries: dedupeDeckEntries(draft.baseline.entries) };
    const dedupeChangedDraft =
      entries.length !== draft.entries.length ||
      (baseline !== null &&
        draft.baseline !== null &&
        baseline.entries.length !== draft.baseline.entries.length);
    if (draft === current && !dedupeChangedDraft) return current;
    const name = draft.name.trim();
    if (name.length > DECK_NAME_MAX_LENGTH) {
      throw new AppError(message("error.deckNameLength"), "Deck name must be 1-120 characters.");
    }
    const next: ActiveDeckRecord = {
      ...draft,
      id: ACTIVE_DECK_ID,
      name,
      entries,
      baseline,
      revision: current.revision + 1,
    };
    const validated = storedActiveDeckSchema.parse(next);
    await db.activeDeck.put(validated);
    markChanged();
    return validated;
  });
}

// ---------------------------------------------------------------------------
// Pure mutators (unit-testable, no transaction or persistence concerns)
// ---------------------------------------------------------------------------

export function makeEntry(spellId: string, source: SpellSource, name: string): DeckEntry {
  return {
    entryId: newEntryId(),
    spellId,
    fitMode: "auto",
    reference: { source, name },
  };
}

export function addEntry(current: ActiveDeckRecord, entry: DeckEntry): ActiveDeckRecord {
  if (hasSpellEntry(current.entries, entry.spellId)) return current;
  return { ...current, entries: [...current.entries, entry] };
}

export function removeEntry(current: ActiveDeckRecord, entryId: string): ActiveDeckRecord {
  return removeEntries(current, new Set([entryId]));
}

export function removeEntries(
  current: ActiveDeckRecord,
  entryIds: ReadonlySet<string>,
): ActiveDeckRecord {
  return { ...current, entries: current.entries.filter((entry) => !entryIds.has(entry.entryId)) };
}

export function moveEntry(
  current: ActiveDeckRecord,
  entryId: string,
  delta: -1 | 1,
): ActiveDeckRecord {
  const index = current.entries.findIndex((entry) => entry.entryId === entryId);
  if (index === -1) return current;
  const target = index + delta;
  if (target < 0 || target >= current.entries.length) return current;
  return reorderEntries(current, index, target);
}

export function reorderEntries(
  current: ActiveDeckRecord,
  fromIndex: number,
  toIndex: number,
): ActiveDeckRecord {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= current.entries.length ||
    toIndex >= current.entries.length
  ) {
    return current;
  }
  const entries = [...current.entries];
  const [moved] = entries.splice(fromIndex, 1);
  entries.splice(toIndex, 0, moved);
  return { ...current, entries };
}

/** Reorder the given entries within their existing slots, including noncontiguous matches. */
export function reorderMatchingEntries(
  current: ActiveDeckRecord,
  orderedIds: readonly string[],
): ActiveDeckRecord {
  const ids = new Set(orderedIds);
  const matches = current.entries.filter(({ entryId }) => ids.has(entryId));
  if (matches.length !== ids.size || ids.size !== orderedIds.length) return current;
  if (matches.every(({ entryId }, index) => entryId === orderedIds[index])) return current;

  const entriesById = new Map(matches.map((entry) => [entry.entryId, entry]));
  if (entriesById.size !== ids.size) return current;
  let next = 0;
  return {
    ...current,
    entries: current.entries.map((entry) =>
      ids.has(entry.entryId) ? entriesById.get(orderedIds[next++])! : entry,
    ),
  };
}

export function setEntryFitMode(
  current: ActiveDeckRecord,
  entryId: string,
  fitMode: CardFitMode,
): ActiveDeckRecord {
  return {
    ...current,
    entries: current.entries.map((entry) =>
      entry.entryId === entryId ? { ...entry, fitMode } : entry,
    ),
  };
}

export function clearEntries(current: ActiveDeckRecord): ActiveDeckRecord {
  if (current.entries.length === 0) return current;
  return { ...current, entries: [] };
}

export function setDeckName(current: ActiveDeckRecord, name: string): ActiveDeckRecord {
  return { ...current, name };
}

export function repairEntry(
  current: ActiveDeckRecord,
  entryId: string,
  target: { spellId: string; reference: { source: SpellSource; name: string } },
): ActiveDeckRecord {
  const entry = current.entries.find((candidate) => candidate.entryId === entryId);
  if (!entry) return current;
  const targetAlreadyPresent = current.entries.some(
    (candidate) => candidate.entryId !== entryId && candidate.spellId === target.spellId,
  );
  if (targetAlreadyPresent) return current;
  return {
    ...current,
    entries: current.entries.map((candidate) =>
      candidate.entryId === entryId
        ? {
            ...candidate,
            spellId: target.spellId,
            reference: { source: target.reference.source, name: target.reference.name },
          }
        : candidate,
    ),
  };
}

export interface DeckIdentity {
  name: string;
  savedDeckId?: string;
}

export type ReplaceEntryWithSpellResult =
  | { status: "replaced"; deck: ActiveDeckRecord }
  | { status: "deck-changed" }
  | { status: "missing" }
  | { status: "duplicate" };

/**
 * Replaces a single SRD entry with another resolved spell while preserving the
 * entry ID, position, and fit mode. The identity guard rejects a different
 * active deck even when revision and entry IDs happen to match.
 */
export function replaceEntryWithSpell(
  current: ActiveDeckRecord,
  identity: DeckIdentity,
  entryId: string,
  sourceSpellId: string,
  target: { spellId: string; reference: { source: SpellSource; name: string } },
): ReplaceEntryWithSpellResult {
  if (current.name !== identity.name || current.savedDeckId !== identity.savedDeckId) {
    return { status: "deck-changed" };
  }
  const entry = current.entries.find((candidate) => candidate.entryId === entryId);
  if (!entry || entry.spellId !== sourceSpellId || entry.reference.source !== "SRD-5.2.1") {
    return { status: "missing" };
  }
  const targetAlreadyPresent = current.entries.some(
    (candidate) => candidate.entryId !== entryId && candidate.spellId === target.spellId,
  );
  if (targetAlreadyPresent) return { status: "duplicate" };
  return { status: "replaced", deck: repairEntry(current, entryId, target) };
}

export interface DeckSnapshot {
  name: string;
  entries: DeckEntry[];
  savedDeckId?: string;
  baseline: DeckBaseline | null;
}

export function replaceDeck(current: ActiveDeckRecord, snapshot: DeckSnapshot): ActiveDeckRecord {
  const entries = dedupeDeckEntries(snapshot.entries.map((entry) => deckEntrySchema.parse(entry)));
  const next: ActiveDeckRecord = {
    ...current,
    instanceId: newUuid(),
    name: snapshot.name,
    entries,
    baseline:
      snapshot.baseline === null
        ? null
        : {
            name: snapshot.baseline.name,
            entries: dedupeDeckEntries(
              snapshot.baseline.entries.map((entry) => deckEntrySchema.parse(entry)),
            ),
            ...(snapshot.baseline.savedRevision === undefined
              ? {}
              : { savedRevision: snapshot.baseline.savedRevision }),
          },
  };
  if (snapshot.savedDeckId === undefined) {
    delete next.savedDeckId;
  } else {
    next.savedDeckId = snapshot.savedDeckId;
  }
  return next;
}

export function withBaseline(
  current: ActiveDeckRecord,
  name: string,
  entries: readonly DeckEntry[],
  savedRevision?: number,
): ActiveDeckRecord {
  return {
    ...current,
    baseline: {
      name,
      entries: dedupeDeckEntries(cloneEntries(entries)),
      ...(savedRevision === undefined ? {} : { savedRevision }),
    },
  };
}

export function cloneEntries(entries: readonly DeckEntry[]): DeckEntry[] {
  return entries.map((entry) => ({
    ...entry,
    reference: { ...entry.reference },
  }));
}
