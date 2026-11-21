import { z } from "zod";
import { db } from "@/db/database.ts";
import {
  collectionTables,
  openCollectionStorage,
  readCollectionMetadata,
  readCollectionSnapshot,
} from "@/db/collection-state.ts";
import {
  DECK_NAME_MAX_LENGTH,
  activeDeckRecordSchema,
  deckBaselineSchema,
  deckEntrySchema,
  savedDeckSchema,
} from "@/domain/deck";
import { isReservedSrdId, newUuid } from "@/domain/ids";
import {
  LIMITS,
  combinedDescriptionLength,
  spellComponentsSchema,
  spellSchema,
  srdSpellOverrideSchema,
} from "@/domain/spells";
import type { SrdOverrideValidationContext } from "@/domain/srd-overrides.ts";
import { AppError, message, type MessageDescriptor } from "@/locales/messages.ts";
import { loadLanguageDataset, loadManifest } from "@/services/data/load.ts";
import { downloadText, exportDateStamp } from "./export.ts";

export const COMPLETE_BACKUP_TYPE = "yascg-complete-backup";
export const COMPLETE_BACKUP_VERSION = 1;

// IndexedDB distinguishes an absent optional field from an own property set
// to undefined. V1 uses JSON null for the latter on known optional fields.
function optional<T extends z.ZodType>(schema: T) {
  return z.union([schema, z.null().transform(() => undefined)]).optional();
}

const nonblank = (max?: number) =>
  (max === undefined ? z.string() : z.string().max(max)).refine((value) => value.trim() !== "");
const metadataText = z.string().max(LIMITS.META_MAX);

function unique<T>(records: readonly T[], key: (record: T) => string): boolean {
  return new Set(records.map(key)).size === records.length;
}

const entriesSchema = z
  .array(
    deckEntrySchema.strict().extend({
      entryId: nonblank(),
      spellId: nonblank(),
      reference: deckEntrySchema.shape.reference.strict().extend({ name: nonblank(200) }),
    }),
  )
  .refine(
    (entries) =>
      unique(entries, (entry) => entry.entryId) && unique(entries, (entry) => entry.spellId),
  );

const baselineSchema = deckBaselineSchema.strict().extend({
  entries: entriesSchema,
  savedRevision: optional(deckBaselineSchema.shape.savedRevision.unwrap()),
});

const activeSchema = activeDeckRecordSchema
  .strict()
  .extend({
    savedDeckId: optional(nonblank()),
    entries: entriesSchema,
    baseline: baselineSchema.nullable(),
  })
  .refine((deck) => (deck.savedDeckId === undefined) === (deck.baseline === null), {
    path: ["baseline"],
  });

const savedSchema = savedDeckSchema.strict().extend({
  id: nonblank(),
  name: nonblank(DECK_NAME_MAX_LENGTH),
  entries: entriesSchema,
});

const customSchema = z
  .strictObject({
    ...spellSchema.shape,
    id: nonblank(LIMITS.NAME_MAX).refine((id) => !isReservedSrdId(id)),
    source: z.literal("Custom"),
    name: nonblank(LIMITS.NAME_MAX),
    castingTime: nonblank(LIMITS.FREETEXT_MAX),
    range: nonblank(LIMITS.FREETEXT_MAX),
    duration: nonblank(LIMITS.FREETEXT_MAX),
    components: spellComponentsSchema.strict().extend({
      verbalDescription: optional(metadataText),
      somaticDescription: optional(metadataText),
      materialDescription: optional(metadataText),
      materialCost: optional(metadataText),
      componentsDisplayOverride: optional(metadataText),
      materialConsumed: optional(z.boolean()),
    }),
    subclasses: optional(
      z.array(nonblank(LIMITS.META_MAX)).refine((items) => unique(items, (item) => item)),
    ),
    savingThrow: optional(spellSchema.shape.savingThrow.unwrap()),
    damageTypes: optional(z.array(nonblank(LIMITS.META_MAX))),
    higherLevels: optional(spellSchema.shape.higherLevels.unwrap()),
    sourceLabel: optional(metadataText),
    updatedAt: optional(spellSchema.shape.updatedAt.unwrap()),
  })
  .refine(
    (spell) =>
      combinedDescriptionLength(spell.description, spell.higherLevels) <=
      LIMITS.DESCRIPTION_TOTAL_MAX,
    { path: ["description"] },
  );

const overrideSchema = srdSpellOverrideSchema.strict().extend({
  spellId: z.string(),
  locale: z.string(),
  verbalDescription: optional(metadataText),
  somaticDescription: optional(metadataText),
});

const backupSchema = z.strictObject({
  type: z.literal(COMPLETE_BACKUP_TYPE),
  version: z.literal(COMPLETE_BACKUP_VERSION),
  activeDeck: activeSchema,
  savedDecks: z.array(savedSchema).refine((records) => unique(records, (record) => record.id)),
  customSpells: z.array(customSchema).refine((records) => unique(records, (record) => record.id)),
  srdSpellOverrides: z
    .array(overrideSchema)
    .refine((records) =>
      unique(records, ({ spellId, locale }) => JSON.stringify([spellId, locale])),
    ),
});

export type CompleteBackup = Awaited<ReturnType<typeof readCollectionSnapshot>>["collection"] & {
  type: typeof COMPLETE_BACKUP_TYPE;
  version: typeof COMPLETE_BACKUP_VERSION;
};

export class BackupCompatibilityError extends AppError {
  constructor(readonly issues: MessageDescriptor[]) {
    super(message("backup.incompatibleOverrides"));
  }
}

export function backupFailure(
  error: unknown,
  fallback: "backup.exportFailed" | "backup.readFailed" | "backup.restoreFailed",
): MessageDescriptor {
  if (error instanceof AppError) return error.descriptor;
  if (error instanceof RangeError) return message("backup.resourceLimit");
  if (error && typeof error === "object") {
    if (
      ("name" in error && error.name === "QuotaExceededError") ||
      ("failures" in error &&
        Array.isArray(error.failures) &&
        error.failures.some(
          (failure: unknown) => failure instanceof Error && failure.name === "QuotaExceededError",
        ))
    ) {
      return message("backup.quotaExceeded");
    }
    if (
      "name" in error &&
      (error.name === "DatabaseClosedError" ||
        error.name === "MissingAPIError" ||
        error.name === "OpenFailedError" ||
        error.name === "InvalidStateError" ||
        error.name === "SecurityError")
    ) {
      return message("error.storageUnavailable");
    }
  }
  console.error("Complete backup operation failed:", error);
  return message(fallback);
}

export function parseCompleteBackup(text: string): CompleteBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    if (error instanceof RangeError) throw new AppError(message("backup.resourceLimit"));
    throw new AppError(message("importExport.error.invalidJson"));
  }
  if (!raw || typeof raw !== "object" || !("type" in raw) || raw.type !== COMPLETE_BACKUP_TYPE) {
    throw new AppError(message("backup.wrongType"));
  }
  if (!("version" in raw) || typeof raw.version !== "number" || !Number.isInteger(raw.version)) {
    throw new AppError(message("backup.invalidVersion"));
  }
  if (raw.version !== COMPLETE_BACKUP_VERSION) {
    throw new AppError(message("backup.unsupportedVersion", { version: raw.version }));
  }
  const result = backupSchema.safeParse(raw);
  if (!result.success) {
    throw new AppError(
      message("backup.invalidData", {
        path: result.error.issues[0]?.path.join(".") || "backup",
      }),
    );
  }
  assertUniqueJsonMembers(text);
  return result.data;
}

/** JSON.parse silently keeps the last value for a repeated object member. */
function assertUniqueJsonMembers(text: string): void {
  const objects: Set<string>[] = [];
  const colon = /\s*:/y;
  for (const token of text.matchAll(/[{}]|"[^"\\]*(?:\\.[^"\\]*)*"/g)) {
    const value = token[0];
    if (value === "{") {
      objects.push(new Set());
    } else if (value === "}") {
      objects.pop();
    } else {
      colon.lastIndex = token.index + value.length;
      if (!colon.test(text)) continue;
      const key: string = JSON.parse(value);
      const members = objects[objects.length - 1];
      if (members.has(key)) {
        throw new AppError(message("backup.invalidData", { path: key }));
      }
      members.add(key);
    }
  }
}

export function validateBackupOverrides(
  backup: CompleteBackup,
  { srdSpellsById, supportedLocales }: SrdOverrideValidationContext,
): void {
  const issues: MessageDescriptor[] = [];
  for (const {
    spellId,
    locale,
    verbalDescription,
    somaticDescription,
  } of backup.srdSpellOverrides) {
    const spell = srdSpellsById.get(spellId);
    const reasons: MessageDescriptor[] = [];
    if (!isReservedSrdId(spellId) || spell?.source !== "SRD-5.2.1") {
      reasons.push(message("error.srdOverrideUnknownSpell", { spellId }));
    }
    if (!supportedLocales.includes(locale)) {
      reasons.push(message("error.srdOverrideUnsupportedLocale", { locale }));
    }
    if (spell && verbalDescription !== undefined && !spell.components.verbal) {
      reasons.push(message("error.srdOverrideNoVerbal", { spellId }));
    }
    if (spell && somaticDescription !== undefined && !spell.components.somatic) {
      reasons.push(message("error.srdOverrideNoSomatic", { spellId }));
    }
    if (reasons.length) {
      issues.push(message("backup.overrideIdentity", { spellId, locale }), ...reasons);
    }
  }
  if (issues.length) throw new BackupCompatibilityError(issues);
}

async function loadOverrideContext(): Promise<SrdOverrideValidationContext> {
  try {
    const manifest = await loadManifest();
    const english = await loadLanguageDataset("en");
    return {
      srdSpellsById: new Map(english.map((spell) => [spell.id, spell])),
      supportedLocales: manifest.map(({ code }) => code),
    };
  } catch {
    throw new AppError(message("backup.catalogUnavailable"));
  }
}

export async function exportCompleteBackup(): Promise<void> {
  const { collection } = await readCollectionSnapshot();
  const backup: CompleteBackup = {
    type: COMPLETE_BACKUP_TYPE,
    version: COMPLETE_BACKUP_VERSION,
    ...collection,
  };
  let hasNegativeZero = false;
  const text = JSON.stringify(backup, (_, value: unknown) => {
    if (Object.is(value, -0)) hasNegativeZero = true;
    return value === undefined ? null : value;
  });
  downloadText(
    `yascg-complete-backup-${exportDateStamp()}.json`,
    hasNegativeZero ? stringifyWithSignedZero(backup) : text,
  );
}

// JSON.stringify emits 0 for -0, which IndexedDB can retain in numeric fields.
function stringifyWithSignedZero(value: unknown): string {
  if (value === undefined) return "null";
  if (Object.is(value, -0)) return "-0";
  if (Array.isArray(value)) return `[${value.map(stringifyWithSignedZero).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const members = Object.entries(value).map(
      ([key, entry]) => `${JSON.stringify(key)}:${stringifyWithSignedZero(entry)}`,
    );
    return `{${members.join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface RestoreReview {
  activeName: string;
  activeEntries: number;
  savedDecks: number;
  customSpells: number;
  overrides: number;
  commit: () => Promise<void>;
}

export async function reviewCompleteBackup(
  text: string,
  loadContext = loadOverrideContext,
): Promise<RestoreReview> {
  const backup = parseCompleteBackup(text);
  if (backup.srdSpellOverrides.length > 0) {
    validateBackupOverrides(backup, await loadContext());
  }
  await openCollectionStorage();
  const { changeToken } = await readCollectionMetadata();
  return {
    activeName: backup.activeDeck.name,
    activeEntries: backup.activeDeck.entries.length,
    savedDecks: backup.savedDecks.length,
    customSpells: backup.customSpells.length,
    overrides: backup.srdSpellOverrides.length,
    commit: () => replaceCollection(backup, changeToken),
  };
}

async function replaceCollection(backup: CompleteBackup, reviewedToken: string): Promise<void> {
  await openCollectionStorage();
  const tables = collectionTables();
  await db.transaction("rw", [db.collectionMetadata, ...tables], async () => {
    const metadata = await readCollectionMetadata();
    if (metadata.changeToken !== reviewedToken) throw new AppError(message("backup.staleReview"));
    for (const table of tables) await table.clear();
    await db.activeDeck.add(backup.activeDeck);
    await db.savedDecks.bulkAdd(backup.savedDecks);
    await db.customSpells.bulkAdd(backup.customSpells);
    await db.srdSpellOverrides.bulkAdd(backup.srdSpellOverrides);
    await db.collectionMetadata.put({
      ...metadata,
      generation: newUuid(),
      changeToken: newUuid(),
    });
  });
}
