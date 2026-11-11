import type { ShortDescription } from "@/domain/short-descriptions";
import type { AuthoringEntry } from "./authoring-schema.ts";

/**
 * Deterministic JSON serialization for generated artifacts: 2-space indent,
 * LF line endings, sorted object keys, and a trailing newline. Platform line
 * endings are never introduced because `JSON.stringify` emits `\n` only.
 */

export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function entryRecord(entry: ShortDescription): Record<string, string> {
  const record: Record<string, string> = { description: entry.description };
  if (entry.higherLevels !== undefined) record.higherLevels = entry.higherLevels;
  return record;
}

/** Serializes one runtime sidecar keyed by canonical spell id. */
export function serializeRuntimeSidecar(
  entries: Iterable<readonly [string, ShortDescription]>,
): string {
  const record: Record<string, Record<string, string>> = {};
  for (const [spellId, entry] of [...entries].sort((a, b) => compareCodeUnits(a[0], b[0]))) {
    record[spellId] = entryRecord(entry);
  }
  return `${JSON.stringify(record, null, 2)}\n`;
}

/** Serializes an authoring file with sorted entries and a stable field order. */
export function serializeAuthoringFile(locale: string, entries: readonly AuthoringEntry[]): string {
  const record = {
    locale,
    entries: [...entries]
      .sort((a, b) => compareCodeUnits(a.spellId, b.spellId))
      .map((entry) => ({
        spellId: entry.spellId,
        description: entry.description,
        ...(entry.higherLevels !== undefined ? { higherLevels: entry.higherLevels } : {}),
        sourceHash: entry.sourceHash,
        status: entry.status,
        acceptance: entry.acceptance,
        origin: entry.origin,
      })),
  };
  return `${JSON.stringify(record, null, 2)}\n`;
}
