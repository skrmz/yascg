import { z } from "zod";
import {
  cardFitModeSchema,
  spellSchema,
  type CardFitMode,
  type Spell,
  type SpellSource,
} from "./spells.ts";
import { deckReferenceSchema, type DeckEntry } from "./deck.ts";

export const EXPORT_VERSION = "1.0.0" as const;
export const CUSTOM_SPELLS_TYPE = "custom-spells" as const;
export const DECK_TYPE = "deck" as const;

export const spellExportPayloadSchema = z.strictObject({
  version: z.literal(EXPORT_VERSION),
  type: z.literal(CUSTOM_SPELLS_TYPE),
  spells: z.array(spellSchema),
});

export const deckExportEntrySchema = z.object({
  spellId: z.string().trim().min(1),
  fitMode: cardFitModeSchema,
  reference: deckReferenceSchema,
});

export const deckExportPayloadSchema = z.strictObject({
  version: z.literal(EXPORT_VERSION),
  type: z.literal(DECK_TYPE),
  name: z.string().max(120),
  exportedAt: z.number().int().nonnegative(),
  entries: z.array(deckExportEntrySchema),
});

export interface SpellExportPayload {
  version: typeof EXPORT_VERSION;
  type: typeof CUSTOM_SPELLS_TYPE;
  spells: Spell[];
}

export interface DeckExportEntry {
  spellId: string;
  fitMode: CardFitMode;
  reference: { source: SpellSource; name: string };
}

export interface DeckExportPayload {
  version: typeof EXPORT_VERSION;
  type: typeof DECK_TYPE;
  name: string;
  exportedAt: number;
  entries: DeckExportEntry[];
}

export function readVersion(value: unknown): string | null {
  if (value && typeof value === "object" && "version" in value) {
    const version = (value as { version?: unknown }).version;
    return typeof version === "string" ? version : null;
  }
  return null;
}

export function readType(value: unknown): string | null {
  if (value && typeof value === "object" && "type" in value) {
    const type = (value as { type?: unknown }).type;
    return typeof type === "string" ? type : null;
  }
  return null;
}

/**
 * Best-effort extraction for unknown payload versions: keeps only fields the
 * current 1.0.0 schema recognizes and rejects records missing mandatory data.
 */
export function extractRecognizedSpell(value: unknown): Spell | null {
  const result = spellSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function extractRecognizedDeckEntry(value: unknown): DeckExportEntry | null {
  const result = deckExportEntrySchema.safeParse(value);
  return result.success ? result.data : null;
}

export function deckEntryToExport(entry: DeckEntry): DeckExportEntry {
  return {
    spellId: entry.spellId,
    fitMode: entry.fitMode,
    reference: { source: entry.reference.source, name: entry.reference.name },
  };
}
