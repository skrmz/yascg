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

export interface ActiveDeck {
  name: string;
  savedDeckId?: string;
  entries: DeckEntry[];
  revision: number;
  baseline: { name: string; entries: DeckEntry[] } | null;
}

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

export const deckBaselineSchema = z.object({
  name: z.string(),
  entries: z.array(deckEntrySchema),
});

export const activeDeckSchema = z.object({
  name: z.string().max(120),
  savedDeckId: z.string().trim().min(1).optional(),
  entries: z.array(deckEntrySchema),
  revision: z.number().int().nonnegative(),
  baseline: deckBaselineSchema.nullable(),
});

export const activeDeckRecordSchema = activeDeckSchema.extend({
  id: z.literal(ACTIVE_DECK_ID),
});

export const savedDeckSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  updatedAt: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  entries: z.array(deckEntrySchema),
});

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
