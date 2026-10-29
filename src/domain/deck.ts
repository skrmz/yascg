import { z } from "zod";
import {
  cardFitModeSchema,
  spellSourceSchema,
  type CardFitMode,
  type SpellSource,
} from "./spells.ts";

export const ACTIVE_DECK_ID = "active";

export interface DeckEntry {
  entryId: string;
  spellId: string;
  fitMode: CardFitMode;
  reference: { source: SpellSource; name: string };
}

export interface SavedDeck {
  id: string;
  name: string;
  updatedAt: number;
  revision: number;
  entries: DeckEntry[];
}

export interface DeckBaseline {
  name: string;
  entries: DeckEntry[];
  /** Saved-snapshot revision observed at the last Open/Save/Save As. */
  savedRevision?: number;
}

export interface ActiveDeck {
  name: string;
  savedDeckId?: string;
  entries: DeckEntry[];
  revision: number;
  baseline: DeckBaseline | null;
}

export type DeckStatus = "saved" | "unsaved" | "not-saved" | "empty" | "invalid";

export const DECK_NAME_MAX_LENGTH = 120;

export interface ActiveDeckRecord extends ActiveDeck {
  id: typeof ACTIVE_DECK_ID;
}

export const deckReferenceSchema = z.object({
  source: spellSourceSchema,
  name: z.string().trim().min(1).max(200),
});

export const deckEntrySchema = z.object({
  entryId: z.string().trim().min(1),
  spellId: z.string().trim().min(1),
  fitMode: cardFitModeSchema,
  reference: deckReferenceSchema,
});

/** At most one deck entry per spell, regardless of how the deck was assembled. */
export const uniqueDeckEntriesSchema = z
  .array(deckEntrySchema)
  .refine((entries) => new Set(entries.map((entry) => entry.spellId)).size === entries.length, {
    message: "Deck entries must have unique spell IDs.",
  });

export const deckBaselineSchema = z.object({
  name: z.string().max(DECK_NAME_MAX_LENGTH),
  entries: uniqueDeckEntriesSchema,
  savedRevision: z.number().int().positive().optional(),
});

export const activeDeckSchema = z.object({
  name: z.string().max(DECK_NAME_MAX_LENGTH),
  savedDeckId: z.string().trim().min(1).optional(),
  entries: uniqueDeckEntriesSchema,
  revision: z.number().int().nonnegative(),
  baseline: deckBaselineSchema.nullable(),
});

export const activeDeckRecordSchema = activeDeckSchema.extend({
  id: z.literal(ACTIVE_DECK_ID),
});

export const savedDeckSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(DECK_NAME_MAX_LENGTH),
  updatedAt: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  entries: uniqueDeckEntriesSchema,
});

export function dedupeDeckEntries<T extends { spellId: string }>(entries: readonly T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.spellId)) return false;
    seen.add(entry.spellId);
    return true;
  });
}

export function hasSpellEntry(
  entries: readonly Pick<DeckEntry, "spellId">[],
  spellId: string,
): boolean {
  return entries.some((entry) => entry.spellId === spellId);
}

export function createEmptyActiveDeck(): ActiveDeckRecord {
  return {
    id: ACTIVE_DECK_ID,
    name: "",
    entries: [],
    revision: 0,
    baseline: null,
  };
}

export function deckEntriesEqual(a: readonly DeckEntry[], b: readonly DeckEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.entryId !== y.entryId ||
      x.spellId !== y.spellId ||
      x.fitMode !== y.fitMode ||
      x.reference.source !== y.reference.source ||
      x.reference.name !== y.reference.name
    ) {
      return false;
    }
  }
  return true;
}

export function deckMatchesBaseline(
  active: Pick<ActiveDeck, "name" | "entries" | "baseline">,
): boolean {
  const { baseline } = active;
  if (baseline === null) {
    return active.name.trim() === "" && active.entries.length === 0;
  }
  return active.name === baseline.name && deckEntriesEqual(active.entries, baseline.entries);
}

export function isDeckDirty(active: Pick<ActiveDeck, "name" | "entries" | "baseline">): boolean {
  return !deckMatchesBaseline(active);
}

export function normalizeDeckName(raw: string): string {
  return raw.trim();
}

/**
 * Associated decks require a trimmed 1-120 character name. Unassociated decks may
 * also commit the empty name as a working deck.
 */
export function isValidDeckName(raw: string, options: { associated: boolean }): boolean {
  const length = normalizeDeckName(raw).length;
  if (length === 0) return !options.associated;
  return length <= DECK_NAME_MAX_LENGTH;
}

export function getDeckStatus(
  active: Pick<ActiveDeck, "name" | "entries" | "baseline" | "savedDeckId">,
): DeckStatus {
  const associated = active.savedDeckId !== undefined;
  if (associated) {
    if (active.baseline === null || active.baseline.savedRevision === undefined) return "invalid";
  } else if (active.baseline !== null) {
    return "invalid";
  }
  if (!isDeckDirty(active)) return associated ? "saved" : "empty";
  return associated ? "unsaved" : "not-saved";
}
