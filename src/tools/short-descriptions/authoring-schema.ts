import { z } from "zod";
import { LIMITS } from "@/domain/spells";
import { SRD_SPELL_ID_PATTERN } from "@/domain/short-descriptions";
import { checkMarkdownSafety } from "./markdown-safety.ts";

/**
 * Strict authoring schema for `data/short-descriptions/<locale>.json`.
 *
 * There is deliberately no `invalid` status: every content constraint the
 * loader or transform relies on (non-empty text, limits, safe Markdown) is a
 * structural error here. Runtime ineligibility (unknown dataset id, no material
 * shortening) is a separate, non-fatal concern handled by the transform.
 */

export const AUTHORING_STATUSES = ["accepted", "withheld"] as const;
export const AUTHORING_ACCEPTANCES = ["auto", "human"] as const;
export const AUTHORING_ORIGINS = ["generated", "manual"] as const;

export const authoringStatusSchema = z.enum(AUTHORING_STATUSES);
export const authoringAcceptanceSchema = z.enum(AUTHORING_ACCEPTANCES);
export const authoringOriginSchema = z.enum(AUTHORING_ORIGINS);

export type AuthoringStatus = z.infer<typeof authoringStatusSchema>;
export type AuthoringAcceptance = z.infer<typeof authoringAcceptanceSchema>;
export type AuthoringOrigin = z.infer<typeof authoringOriginSchema>;

const SHA256_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

const nonEmptyText = (max: number, label: string) =>
  z
    .string()
    .max(max)
    .refine((value) => value.trim() !== "", { message: `${label} must not be empty` });

function markdownIssues(field: string, markdown: string): string[] {
  const result = checkMarkdownSafety(markdown);
  return result.findings.map(
    (finding) => `${field}: unsafe Markdown construct "${finding.construct}" (${finding.snippet})`,
  );
}

export const authoringEntrySchema = z
  .strictObject({
    spellId: z
      .string()
      .regex(SRD_SPELL_ID_PATTERN, "spellId must be a canonical srd-<slug> identifier"),
    description: nonEmptyText(LIMITS.DESCRIPTION_ITEM_MAX, "description"),
    higherLevels: nonEmptyText(LIMITS.DESCRIPTION_ITEM_MAX, "higherLevels").optional(),
    sourceHash: z
      .string()
      .regex(SHA256_HASH_PATTERN, "sourceHash must be sha256:<64 lowercase hex>"),
    status: authoringStatusSchema,
    acceptance: authoringAcceptanceSchema,
    origin: authoringOriginSchema,
  })
  .superRefine((entry, ctx) => {
    const total = entry.description.length + (entry.higherLevels?.length ?? 0);
    if (total > LIMITS.DESCRIPTION_TOTAL_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `combined description and higherLevels length must be at most ${LIMITS.DESCRIPTION_TOTAL_MAX} characters`,
        path: ["description"],
      });
    }
    for (const issue of markdownIssues("description", entry.description)) {
      ctx.addIssue({ code: "custom", message: issue, path: ["description"] });
    }
    if (entry.higherLevels !== undefined) {
      for (const issue of markdownIssues("higherLevels", entry.higherLevels)) {
        ctx.addIssue({ code: "custom", message: issue, path: ["higherLevels"] });
      }
    }
  });

export type AuthoringEntry = z.infer<typeof authoringEntrySchema>;

export const authoringFileSchema = z
  .strictObject({
    locale: z.string().trim().min(2).max(35),
    entries: z.array(authoringEntrySchema),
  })
  .superRefine((file, ctx) => {
    const seen = new Map<string, number>();
    file.entries.forEach((entry, index) => {
      const previous = seen.get(entry.spellId);
      if (previous !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate spellId "${entry.spellId}" (also at entries[${previous}])`,
          path: ["entries", index, "spellId"],
        });
        return;
      }
      seen.set(entry.spellId, index);
    });
  });

export type AuthoringFile = z.infer<typeof authoringFileSchema>;

export class AuthoringSchemaError extends Error {
  readonly issues: readonly string[];

  constructor(
    readonly fileName: string,
    issues: readonly string[],
  ) {
    super(
      `${fileName}: ${
        issues.length === 1 ? issues[0] : `${issues.length} problems:\n  - ${issues.join("\n  - ")}`
      }`,
    );
    this.name = "AuthoringSchemaError";
    this.issues = [...issues];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whitespace-only `higherLevels` is treated as omitted before validation. */
function normalizeEntryInput(entry: unknown): unknown {
  if (!isRecord(entry)) return entry;
  if (typeof entry.higherLevels !== "string" || entry.higherLevels.trim() !== "") return entry;
  const { higherLevels: _omitted, ...rest } = entry;
  return rest;
}

function normalizeFileInput(raw: unknown): unknown {
  if (!isRecord(raw) || !Array.isArray(raw.entries)) return raw;
  return { ...raw, entries: raw.entries.map(normalizeEntryInput) };
}

function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((segment, index) =>
      typeof segment === "number"
        ? `[${String(segment)}]`
        : index === 0
          ? String(segment)
          : `.${String(segment)}`,
    )
    .join("");
}

export interface ParsedAuthoringFile extends AuthoringFile {
  /** Entries sorted by `spellId` for stable diffs and serialization. */
  readonly sortedEntries: readonly AuthoringEntry[];
}

export interface ValidateAuthoringFileOptions {
  fileName: string;
  /** Locale required by the file name; must match the file when present. */
  locale?: string;
  /** Manifest locales; the file locale must be one of them when present. */
  manifestLocales?: readonly string[];
}

export function parseAuthoringFile(
  raw: unknown,
  options: ValidateAuthoringFileOptions,
): ParsedAuthoringFile {
  const result = authoringFileSchema.safeParse(normalizeFileInput(raw));
  if (!result.success) {
    throw new AuthoringSchemaError(
      options.fileName,
      result.error.issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`),
    );
  }
  const file = result.data;
  const issues: string[] = [];
  if (options.locale !== undefined && file.locale !== options.locale) {
    issues.push(`locale "${file.locale}" does not match file name "${options.locale}.json"`);
  }
  if (options.manifestLocales && !options.manifestLocales.includes(file.locale)) {
    issues.push(`locale "${file.locale}" is not a manifest language`);
  }
  if (issues.length > 0) throw new AuthoringSchemaError(options.fileName, issues);
  return { ...file, sortedEntries: sortAuthoringEntries(file.entries) };
}

export function isCanonicalFileNameLocale(locale: string): boolean {
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(locale);
}

export function sortAuthoringEntries<T extends { spellId: string }>(
  entries: readonly T[],
): readonly T[] {
  return [...entries].sort((a, b) => (a.spellId < b.spellId ? -1 : a.spellId > b.spellId ? 1 : 0));
}

export function createEmptyAuthoringFile(locale: string): AuthoringFile {
  return { locale, entries: [] };
}
