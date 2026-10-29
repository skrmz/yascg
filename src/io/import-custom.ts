import { db } from "@/db/database.ts";
import { LIMITS, spellSchema, type Spell } from "@/domain/spells";
import { validateSrdOverride, type SrdOverrideInput } from "@/domain/srd-overrides.ts";
import { CUSTOM_SPELLS_TYPE, customSpellImportPayloadSchema, readType } from "@/domain/payloads";
import { newUuid } from "@/domain/ids";
import { AppError, message, type MessageDescriptor } from "@/locales/messages.ts";

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
  reason: MessageDescriptor;
}

export interface CustomImportPlan {
  entries: CustomImportEntry[];
  remaps: Array<{ from: string; to: string }>;
  collisions: CustomImportCollision[];
  overrides: CustomImportOverride[];
}

export type CustomImportAnalysis =
  | { ok: true; plan: CustomImportPlan }
  | { ok: false; error: MessageDescriptor; overrideErrors?: OverrideImportError[] };

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

export class ImportConflictError extends AppError {
  constructor(message: MessageDescriptor, diagnostic?: string) {
    super(message, diagnostic);
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
  options: CustomImportOptions = {},
): CustomImportAnalysis {
  if (byteLength(text) > LIMITS.IMPORT_BYTES_MAX) {
    return { ok: false, error: message("importExport.error.fileTooLargeCustom") };
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
  if (type !== CUSTOM_SPELLS_TYPE) {
    return {
      ok: false,
      error: type
        ? message("importExport.error.expectedType", {
            expected: CUSTOM_SPELLS_TYPE,
            actual: type,
          })
        : message("importExport.error.expectedTypeMissing", { expected: CUSTOM_SPELLS_TYPE }),
    };
  }
  const parsed = customSpellImportPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: message("importExport.error.invalidPayload", {
        path: issue?.path.join(".") || "payload",
      }),
    };
  }
  const spells = parsed.data.spells;
  const rawOverrides = parsed.data.srdSpellOverrides ?? [];

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
        error: message("importExport.error.overridesValidationUnavailable"),
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
          reason:
            result.errors.length === 1
              ? result.errors[0]
              : message("importExport.error.overrideInvalidSummary"),
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
        error: message("importExport.error.overrideInvalidSummary"),
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
        error: message("importExport.error.sourceNotCustom", {
          name: spell.name,
          source: spell.source,
        }),
      };
    }
    if (seenInputIds.has(spell.id)) {
      return {
        ok: false,
        error: message("importExport.error.duplicateId", { id: spell.id }),
      };
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
      return {
        ok: false,
        error: message("importExport.error.duplicateFinalId", { id: record.id }),
      };
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
      entries,
      remaps,
      collisions,
      overrides,
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
            message("importExport.error.collisionChanged", { id: entry.collision.id }),
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
