import { LIMITS } from "@/domain/spells";
import {
  DECK_TYPE,
  deckExportPayloadSchema,
  readType,
  type DeckExportEntry,
} from "@/domain/payloads";
import { newEntryId } from "@/domain/ids";
import { type ActiveDeckRecord, type DeckEntry, dedupeDeckEntries } from "@/domain/deck";
import { mutateActiveDeck, replaceDeck } from "@/db/active-deck.ts";
import { message, type MessageDescriptor } from "@/locales/messages.ts";

export interface DeckImportPlan {
  name: string;
  entries: DeckExportEntry[];
  removedDuplicates: number;
}

export type DeckImportAnalysis =
  | { ok: true; plan: DeckImportPlan }
  | { ok: false; error: MessageDescriptor };

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function analyzeDeckImport(text: string): DeckImportAnalysis {
  if (byteLength(text) > LIMITS.IMPORT_BYTES_MAX) {
    return { ok: false, error: message("importExport.error.fileTooLargeDeck") };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: message("importExport.error.invalidJson") };
  }
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: message("importExport.error.payloadObject") };
  }
  const type = readType(raw);
  if (type !== DECK_TYPE) {
    return {
      ok: false,
      error: type
        ? message("importExport.error.expectedType", { expected: DECK_TYPE, actual: type })
        : message("importExport.error.expectedTypeMissing", { expected: DECK_TYPE }),
    };
  }
  const parsed = deckExportPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: message("importExport.error.invalidPayload", {
        path: issue?.path.join(".") || "payload",
      }),
    };
  }
  if (parsed.data.entries.length > LIMITS.DECK_ENTRIES_MAX) {
    return { ok: false, error: message("importExport.error.deckTooLarge") };
  }
  const entries = dedupeDeckEntries(parsed.data.entries);
  return {
    ok: true,
    plan: {
      name: parsed.data.name,
      entries,
      removedDuplicates: parsed.data.entries.length - entries.length,
    },
  };
}

export function planToEntries(plan: DeckImportPlan): DeckEntry[] {
  return dedupeDeckEntries(
    plan.entries.map((entry) => ({
      entryId: newEntryId(),
      spellId: entry.spellId,
      fitMode: entry.fitMode,
      reference: { source: entry.reference.source, name: entry.reference.name },
    })),
  );
}

/** Replaces the active deck after confirmation; validation happens before commit. */
export async function applyDeckImport(
  plan: DeckImportPlan,
  activeExpectedRevision: number,
): Promise<ActiveDeckRecord> {
  const entries = planToEntries(plan);
  return mutateActiveDeck(activeExpectedRevision, (current) =>
    replaceDeck(current, {
      name: plan.name,
      entries,
      baseline: null,
      savedDeckId: undefined,
    }),
  );
}
