import { LIMITS } from "@/domain/spells";
import {
  DECK_TYPE,
  EXPORT_VERSION,
  deckExportPayloadSchema,
  extractRecognizedDeckEntry,
  readType,
  readVersion,
  type DeckExportEntry,
} from "@/domain/payloads";
import { newEntryId } from "@/domain/ids";
import { type ActiveDeckRecord, type DeckEntry, dedupeDeckEntries } from "@/domain/deck";
import { mutateActiveDeck, replaceDeck } from "@/db/active-deck.ts";
import { message, type MessageDescriptor } from "@/locales/messages.ts";

export interface DeckImportPlan {
  version: string | null;
  unknownVersion: boolean;
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
  const version = readVersion(raw);
  const unknownVersion = version !== EXPORT_VERSION;

  if (!unknownVersion) {
    const parsed = deckExportPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        error: message("importExport.error.invalidPayload", {
          version: EXPORT_VERSION,
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
        version,
        unknownVersion,
        name: parsed.data.name,
        entries,
        removedDuplicates: parsed.data.entries.length - entries.length,
      },
    };
  }

  const list = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(list)) {
    return { ok: false, error: message("importExport.error.entriesNotArray") };
  }
  if (list.length > LIMITS.DECK_ENTRIES_MAX) {
    return { ok: false, error: message("importExport.error.deckTooLarge") };
  }
  const entries: DeckExportEntry[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const extracted = extractRecognizedDeckEntry(list[index]);
    if (!extracted) {
      return {
        ok: false,
        error: message("importExport.error.unknownEntryMissing", { index }),
      };
    }
    entries.push(extracted);
  }
  const name =
    typeof (raw as { name?: unknown }).name === "string"
      ? (raw as { name: string }).name.slice(0, 120)
      : "";
  const uniqueEntries = dedupeDeckEntries(entries);
  return {
    ok: true,
    plan: {
      version,
      unknownVersion,
      name,
      entries: uniqueEntries,
      removedDuplicates: entries.length - uniqueEntries.length,
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
