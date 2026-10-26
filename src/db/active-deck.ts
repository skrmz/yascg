import { db } from "./database.ts";
import { type Table } from "dexie";
import {
  ACTIVE_DECK_ID,
  activeDeckRecordSchema,
  createEmptyActiveDeck,
  dedupeDeckEntries,
  deckEntrySchema,
  hasSpellEntry,
  type ActiveDeckRecord,
  type DeckEntry,
} from "@/domain/deck";
import type { CardFitMode, SpellSource } from "@/domain/spells";
import { newEntryId } from "@/domain/ids";
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

export async function getActiveDeck(): Promise<ActiveDeckRecord> {
  return db.transaction("rw", db.activeDeck, async () => {
    const existing = await db.activeDeck.get(ACTIVE_DECK_ID);
    if (existing) return existing;
    const created = createEmptyActiveDeck();
    await db.activeDeck.put(created);
    return created;
  });
}

/** Read-only accessor safe for reactive (liveQuery) reads. */
export async function readActiveDeck(): Promise<ActiveDeckRecord | undefined> {
  return db.activeDeck.get(ACTIVE_DECK_ID);
}

/** Ensures the singleton row exists; safe to call from a mount effect. */
export async function ensureActiveDeck(): Promise<ActiveDeckRecord> {
  return getActiveDeck();
}

/**
 * Compare-and-swap the active deck inside a single Dexie read-write transaction.
 * Aborts on a stale expected revision instead of overwriting newer work.
 */
export async function mutateActiveDeck(
  expectedRevision: number,
  mutator: ActiveDeckMutator,
  extraTables: Table[] = [],
): Promise<ActiveDeckRecord> {
  return db.transaction("rw", [db.activeDeck, ...extraTables], async () => {
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
    const next: ActiveDeckRecord = {
      ...draft,
      id: ACTIVE_DECK_ID,
      name: draft.name.trim().slice(0, 120),
      entries,
      baseline,
      revision: current.revision + 1,
    };
    const validated = activeDeckRecordSchema.parse(next);
    await db.activeDeck.put(validated);
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
    fitMode: "auto-shrink",
    reference: { source, name },
  };
}

export function addEntry(current: ActiveDeckRecord, entry: DeckEntry): ActiveDeckRecord {
  if (hasSpellEntry(current.entries, entry.spellId)) return current;
  return { ...current, entries: [...current.entries, entry] };
}

export function removeEntry(current: ActiveDeckRecord, entryId: string): ActiveDeckRecord {
  return {
    ...current,
    entries: current.entries.filter((entry) => entry.entryId !== entryId),
  };
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

export interface DeckSnapshot {
  name: string;
  entries: DeckEntry[];
  savedDeckId?: string;
  baseline: { name: string; entries: DeckEntry[] } | null;
}

export function replaceDeck(current: ActiveDeckRecord, snapshot: DeckSnapshot): ActiveDeckRecord {
  const entries = dedupeDeckEntries(snapshot.entries.map((entry) => deckEntrySchema.parse(entry)));
  const next: ActiveDeckRecord = {
    ...current,
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
): ActiveDeckRecord {
  return {
    ...current,
    baseline: {
      name,
      entries: dedupeDeckEntries(cloneEntries(entries)),
    },
  };
}

export function cloneEntries(entries: readonly DeckEntry[]): DeckEntry[] {
  return entries.map((entry) => ({
    ...entry,
    reference: { ...entry.reference },
  }));
}
