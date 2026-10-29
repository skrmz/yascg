import { z } from "zod";
import {
  cardFitModeSchema,
  LIMITS,
  spellSchema,
  type CardFitMode,
  type Spell,
  type SpellSource,
} from "./spells.ts";
import { deckReferenceSchema, type DeckEntry } from "./deck.ts";

export const CUSTOM_SPELLS_TYPE = "custom-spells" as const;
export const DECK_TYPE = "deck" as const;

/** Exported override record: identity + descriptions only (`updatedAt` omitted). */
export const srdSpellOverrideExportSchema = z.strictObject({
  spellId: z.string().trim().min(1).max(LIMITS.NAME_MAX),
  locale: z.string().trim().min(2).max(35),
  verbalDescription: z.string().trim().max(LIMITS.META_MAX).optional(),
  somaticDescription: z.string().trim().max(LIMITS.META_MAX).optional(),
});

export const customSpellExportPayloadSchema = z.strictObject({
  type: z.literal(CUSTOM_SPELLS_TYPE),
  spells: z.array(spellSchema),
  srdSpellOverrides: z.array(srdSpellOverrideExportSchema).optional(),
});

/**
 * Import envelope: overrides remain raw so each record can be reported with its
 * own validation error. `validateSrdOverride` enforces the strict override shape.
 */
export const customSpellImportPayloadSchema = customSpellExportPayloadSchema.extend({
  srdSpellOverrides: z.array(z.unknown()).optional(),
});

export const deckExportEntrySchema = z.object({
  spellId: z.string().trim().min(1),
  fitMode: cardFitModeSchema,
  reference: deckReferenceSchema,
});

export const deckExportPayloadSchema = z.strictObject({
  type: z.literal(DECK_TYPE),
  name: z.string().max(120),
  exportedAt: z.number().int().nonnegative(),
  entries: z.array(deckExportEntrySchema),
});

export type SrdSpellOverrideExport = z.infer<typeof srdSpellOverrideExportSchema>;

export interface CustomSpellExportPayload {
  type: typeof CUSTOM_SPELLS_TYPE;
  spells: Spell[];
  srdSpellOverrides?: SrdSpellOverrideExport[];
}

export interface DeckExportEntry {
  spellId: string;
  fitMode: CardFitMode;
  reference: { source: SpellSource; name: string };
}

export interface DeckExportPayload {
  type: typeof DECK_TYPE;
  name: string;
  exportedAt: number;
  entries: DeckExportEntry[];
}

export function readType(value: unknown): string | null {
  if (value && typeof value === "object" && "type" in value) {
    const type = (value as { type?: unknown }).type;
    return typeof type === "string" ? type : null;
  }
  return null;
}

export function deckEntryToExport(entry: DeckEntry): DeckExportEntry {
  return {
    spellId: entry.spellId,
    fitMode: entry.fitMode,
    reference: { source: entry.reference.source, name: entry.reference.name },
  };
}
