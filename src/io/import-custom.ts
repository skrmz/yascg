import { z } from "zod";
import { db } from "@/db/database.ts";
import { LIMITS, spellSchema, type Spell } from "@/domain/spells";
import { validateSrdOverride, type SrdOverrideInput } from "@/domain/srd-overrides.ts";
import {
  CUSTOM_SPELLS_TYPE,
  CUSTOM_SPELL_EXPORT_VERSION,
  EXPORT_VERSION,
  customSpellExportPayloadSchemaV1,
  extractRecognizedSpell,
  readType,
  readVersion,
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

export interface CustomImportOverride {
  spellId: string;
  locale: string;
  verbalDescription?: string;
  somaticDescription?: string;
}

export interface OverrideImportError {
  index: number;
  spellId: string;
  locale: string;
  reason: string;
}

export interface CustomImportPlan {
  version: string | null;
  unknownVersion: boolean;
  entries: CustomImportEntry[];
  remaps: Array<{ from: string; to: string }>;
  collisions: CustomImportCollision[];
  overrides: CustomImportOverride[];
  lossy: boolean;
  lossyFields: string[];
  droppedOverrides: number;
}

export type CustomImportAnalysis =
  | { ok: true; plan: CustomImportPlan }
  | { ok: false; error: string; overrideErrors?: OverrideImportError[] };

export interface CustomImportOptions {
  srdSpellsById?: ReadonlyMap<string, Spell>;
  supportedLocales?: readonly string[];
}

export type CollisionStrategy = "overwrite" | "keep-both" | "skip";

export interface CustomImportCounts {
  imported: number;
  overwritten: number;
  copied: number;
  skipped: number;
  remapped: number;
  overrides: number;
}

export class ImportConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportConflictError";
  }
}

const RECOGNIZED_SPELL_KEYS = new Set([
  "id",
  "name",
  "level",
  "school",
  "castingTime",
  "range",
  "components",
  "duration",
  "concentration",
  "ritual",
  "classes",
  "subclasses",
  "savingThrow",
  "damageTypes",
  "description",
  "higherLevels",
  "source",
  "sourceLabel",
  "updatedAt",
]);

const RECOGNIZED_TOP_KEYS = new Set(["version", "type", "spells", "srdSpellOverrides"]);

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function fingerprint(spell: Spell): string {
  return JSON.stringify(spell);
}

function collectUnknownSpellFields(record: unknown, index: number, into: string[]): void {
  if (!record || typeof record !== "object") return;
  for (const key of Object.keys(record as Record<string, unknown>)) {
    if (!RECOGNIZED_SPELL_KEYS.has(key)) into.push(`spells[${index}].${key}`);
  }
}

export function analyzeCustomImport(
  text: string,
  existing: readonly Spell[],
  options: CustomImportOptions = {},
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
  const isV1 = version === EXPORT_VERSION;
  const isV2 = version === CUSTOM_SPELL_EXPORT_VERSION;
  const unknownVersion = !isV1 && !isV2;

  let spells: Spell[];
  let rawOverrides: unknown[] = [];
  const lossyFields: string[] = [];
  let droppedOverrides = 0;

  if (isV1) {
    const parsed = customSpellExportPayloadSchemaV1.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        error: `Invalid ${EXPORT_VERSION} payload on "${issue?.path.join(".") || "payload"}": ${
          issue?.message ?? "unknown error"
        }.`,
      };
    }
    spells = parsed.data.spells;
  } else if (isV2) {
    const spellsResult = z.array(spellSchema).safeParse((raw as { spells?: unknown }).spells);
    if (!spellsResult.success) {
      const issue = spellsResult.error.issues[0];
      return {
        ok: false,
        error: `Invalid ${CUSTOM_SPELL_EXPORT_VERSION} payload on "spells.${
          issue?.path.join(".") || "?"
        }": ${issue?.message ?? "unknown error"}.`,
      };
    }
    spells = spellsResult.data;
    const maybeOverrides = (raw as { srdSpellOverrides?: unknown }).srdSpellOverrides;
    if (maybeOverrides === undefined) {
      rawOverrides = [];
    } else if (Array.isArray(maybeOverrides)) {
      rawOverrides = maybeOverrides;
    } else {
      return { ok: false, error: 'The "srdSpellOverrides" field must be an array.' };
    }
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
      collectUnknownSpellFields(list[index], index, lossyFields);
    }
    for (const key of Object.keys(raw as Record<string, unknown>)) {
      if (!RECOGNIZED_TOP_KEYS.has(key)) lossyFields.push(key);
    }
    const dropped = (raw as { srdSpellOverrides?: unknown }).srdSpellOverrides;
    if (Array.isArray(dropped)) droppedOverrides = dropped.length;
    else if (dropped !== undefined) lossyFields.push("srdSpellOverrides");
  }

  const overrides: CustomImportOverride[] = [];
  if (rawOverrides.length > 0) {
    const srdSpellsById = options.srdSpellsById;
    const supportedLocales = options.supportedLocales;
    if (
      !srdSpellsById ||
      srdSpellsById.size === 0 ||
      !supportedLocales ||
      supportedLocales.length === 0
    ) {
      return {
        ok: false,
        error:
          "SRD validation data is not loaded yet; reload the spell data before importing overrides.",
      };
    }
    const overrideErrors: OverrideImportError[] = [];
    const byKey = new Map<string, number>();
    rawOverrides.forEach((record, index) => {
      const candidate: SrdOverrideInput =
        record && typeof record === "object"
          ? (record as SrdOverrideInput)
          : { spellId: "", locale: "" };
      const result = validateSrdOverride(candidate, { srdSpellsById, supportedLocales });
      if (!result.ok) {
        overrideErrors.push({
          index,
          spellId: typeof candidate.spellId === "string" ? candidate.spellId : "",
          locale: typeof candidate.locale === "string" ? candidate.locale : "",
          reason: result.errors.join(" "),
        });
        return;
      }
      const { value } = result;
      // Empty override records are no-ops: never stored, existing record untouched.
      if (!value.verbalDescription && !value.somaticDescription) return;
      const key = `${value.spellId}\u0000${value.locale}`;
      const seen = byKey.get(key);
      if (seen !== undefined) {
        overrides[seen] = value;
        return;
      }
      byKey.set(key, overrides.length);
      overrides.push(value);
    });
    if (overrideErrors.length > 0) {
      return {
        ok: false,
        error: `Invalid SRD override record(s): ${overrideErrors
          .map(
            (entry) =>
              `#${entry.index} (${entry.spellId || "?"}/${entry.locale || "?"}): ${entry.reason}`,
          )
          .join("; ")}`,
        overrideErrors,
      };
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
    plan: {
      version,
      unknownVersion,
      entries,
      remaps,
      collisions,
      overrides,
      lossy: lossyFields.length > 0 || droppedOverrides > 0,
      lossyFields,
      droppedOverrides,
    },
  };
}

/**
 * Commits an analyzed plan in a single transaction over both stores. Collision
 * targets are re-read and verified against the reviewed fingerprints; any change
 * aborts the whole batch so the user must re-run collision review.
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
    overrides: 0,
  };
  return db.transaction("rw", db.customSpells, db.srdSpellOverrides, async () => {
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
    for (const override of plan.overrides) {
      await db.srdSpellOverrides.put({ ...override, updatedAt: Date.now() });
      counts.overrides += 1;
    }
    return counts;
  });
}
