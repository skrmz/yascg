import { db } from "@/db/database.ts";
import { LIMITS, spellSchema, type Spell } from "@/domain/spells";
import {
  CUSTOM_SPELLS_TYPE,
  EXPORT_VERSION,
  extractRecognizedSpell,
  readType,
  readVersion,
  spellExportPayloadSchema,
} from "@/domain/payloads";
import { newUuid } from "@/domain/ids";

export interface CustomImportEntry {
  record: Spell;
  remappedFrom?: string;
  collision?: { id: string; existingName: string };
}

export interface CustomImportCollision {
  id: string;
  existingName: string;
  incomingName: string;
  fingerprint: string;
}

export interface CustomImportPlan {
  version: string | null;
  unknownVersion: boolean;
  entries: CustomImportEntry[];
  remaps: Array<{ from: string; to: string }>;
  collisions: CustomImportCollision[];
}

export type CustomImportAnalysis =
  | { ok: true; plan: CustomImportPlan }
  | { ok: false; error: string };

export type CollisionStrategy = "overwrite" | "keep-both" | "skip";

export interface CustomImportCounts {
  imported: number;
  overwritten: number;
  copied: number;
  skipped: number;
  remapped: number;
}

export class ImportConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportConflictError";
  }
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function fingerprint(spell: Spell): string {
  return JSON.stringify(spell);
}

export function analyzeCustomImport(
  text: string,
  existing: readonly Spell[],
): CustomImportAnalysis {
  if (byteLength(text) > LIMITS.IMPORT_BYTES_MAX) {
    return { ok: false, error: "The file exceeds the 5 MiB custom-spell import limit." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "The payload must be a JSON object." };
  }
  const type = readType(raw);
  if (type !== CUSTOM_SPELLS_TYPE) {
    return {
      ok: false,
      error: `Expected a "custom-spells" payload but found "${type ?? "missing"}".`,
    };
  }
  const version = readVersion(raw);
  const unknownVersion = version !== EXPORT_VERSION;

  let spells: Spell[];
  if (!unknownVersion) {
    const parsed = spellExportPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        error: `Invalid 1.0.0 payload on "${issue?.path.join(".") || "payload"}": ${
          issue?.message ?? "unknown error"
        }.`,
      };
    }
    spells = parsed.data.spells;
  } else {
    const list = (raw as { spells?: unknown }).spells;
    if (!Array.isArray(list)) {
      return { ok: false, error: 'The "spells" field must be an array.' };
    }
    spells = [];
    for (let index = 0; index < list.length; index += 1) {
      const extracted = extractRecognizedSpell(list[index]);
      if (!extracted) {
        return {
          ok: false,
          error: `Unknown-version record at index ${index} is missing required 1.0.0 fields.`,
        };
      }
      spells.push(extracted);
    }
  }

  const existingById = new Map(existing.map((spell) => [spell.id, spell]));
  const entries: CustomImportEntry[] = [];
  const remaps: Array<{ from: string; to: string }> = [];
  const collisions: CustomImportCollision[] = [];
  const seenInputIds = new Set<string>();
  const finalIds = new Set<string>();

  for (const spell of spells) {
    if (spell.source !== "Custom") {
      return {
        ok: false,
        error: `Record "${spell.name}" has source "${spell.source}"; SRD-sourced records cannot be imported as custom spells.`,
      };
    }
    if (seenInputIds.has(spell.id)) {
      return { ok: false, error: `Duplicate spell ID "${spell.id}" inside the import file.` };
    }
    seenInputIds.add(spell.id);

    let record = spell;
    let remappedFrom: string | undefined;
    if (spell.id.startsWith("srd-")) {
      const replacement = newUuid();
      remappedFrom = spell.id;
      record = { ...spell, id: replacement };
      remaps.push({ from: spell.id, to: replacement });
    }
    if (finalIds.has(record.id)) {
      return { ok: false, error: `Duplicate final spell ID "${record.id}" after remapping.` };
    }
    finalIds.add(record.id);

    const entry: CustomImportEntry = { record };
    if (remappedFrom) entry.remappedFrom = remappedFrom;

    const existingMatch = existingById.get(record.id);
    if (existingMatch) {
      entry.collision = { id: record.id, existingName: existingMatch.name };
      collisions.push({
        id: record.id,
        existingName: existingMatch.name,
        incomingName: record.name,
        fingerprint: fingerprint(existingMatch),
      });
    }
    entries.push(entry);
  }

  return {
    ok: true,
    plan: { version, unknownVersion, entries, remaps, collisions },
  };
}

/**
 * Commits an analyzed plan in a single transaction. Collision targets are
 * re-read and verified against the reviewed fingerprints; any change aborts the
 * whole batch so the user must re-run collision review.
 */
export async function applyCustomImport(
  plan: CustomImportPlan,
  strategy: CollisionStrategy,
  reviewedFingerprints: ReadonlyMap<string, string>,
): Promise<CustomImportCounts> {
  const counts: CustomImportCounts = {
    imported: 0,
    overwritten: 0,
    copied: 0,
    skipped: 0,
    remapped: plan.remaps.length,
  };
  return db.transaction("rw", db.customSpells, async () => {
    const finalRecords: Spell[] = [];
    for (const entry of plan.entries) {
      if (entry.collision) {
        const reviewed = reviewedFingerprints.get(entry.collision.id);
        const current = await db.customSpells.get(entry.collision.id);
        if (!current || !reviewed || fingerprint(current) !== reviewed) {
          throw new ImportConflictError(
            `Custom spell "${entry.collision.id}" changed since collision review; re-run the import review.`,
          );
        }
        if (strategy === "skip") {
          counts.skipped += 1;
          continue;
        }
        if (strategy === "keep-both") {
          finalRecords.push(spellSchema.parse({ ...entry.record, id: newUuid() }));
          counts.copied += 1;
          continue;
        }
        finalRecords.push(spellSchema.parse({ ...entry.record, id: entry.collision.id }));
        counts.overwritten += 1;
        continue;
      }
      finalRecords.push(spellSchema.parse(entry.record));
      counts.imported += 1;
    }
    for (const record of finalRecords) {
      await db.customSpells.put(record);
    }
    return counts;
  });
}
