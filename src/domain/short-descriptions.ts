import { z } from "zod";
import { LIMITS } from "@/domain/spells";

/** Canonical bundled SRD identifier, for example `srd-fireball`. */
export const SRD_SPELL_ID_PATTERN = /^srd-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isCanonicalSrdSpellId(value: string): boolean {
  return SRD_SPELL_ID_PATTERN.test(value);
}

/**
 * Non-empty Markdown text that keeps its exact bytes (no surrounding-whitespace
 * trimming) so applied text matches the authored content.
 */
const nonEmptyText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => value.trim() !== "", { message: "must not be empty" });

/**
 * Runtime sidecar entry. Authoring-only fields (`sourceHash`, `status`,
 * `acceptance`, `origin`) never reach the runtime artifact.
 */
export const shortDescriptionSchema = z.strictObject({
  description: nonEmptyText(LIMITS.DESCRIPTION_ITEM_MAX),
  higherLevels: nonEmptyText(LIMITS.DESCRIPTION_ITEM_MAX).optional(),
});

export type ShortDescription = z.infer<typeof shortDescriptionSchema>;

export type ShortDescriptionMap = ReadonlyMap<string, ShortDescription>;
