import { isReservedSrdId } from "./ids.ts";
import { LIMITS, type Spell } from "./spells.ts";

/**
 * Shared validation for SRD component-text overrides. Used by both UI writes
 * (`putSrdOverride`) and imports so the two paths cannot diverge.
 */
export interface SrdOverrideValidationContext {
  /** Canonical SRD spells keyed by stable id (English is sufficient). */
  srdSpellsById: ReadonlyMap<string, Spell>;
  /** Locales that may hold overrides (from the language manifest). */
  supportedLocales: readonly string[];
}

export interface SrdSpellOverrideInput {
  spellId: string;
  locale: string;
  verbalDescription?: string;
  somaticDescription?: string;
}

export type SrdOverrideInput = SrdSpellOverrideInput;

export type SrdOverrideValidationResult =
  | { ok: true; value: SrdSpellOverrideInput }
  | { ok: false; errors: string[] };

const ALLOWED_KEYS = new Set(["spellId", "locale", "verbalDescription", "somaticDescription"]);

function normalizeDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Validates an override against canonical SRD identity, the supported-locale
 * list, the component eligibility of the target spell, and field bounds.
 * Descriptions are trimmed and empty values dropped. An override with neither
 * description is valid (the caller decides between delete and no-op).
 */
export function validateSrdOverride(
  input: SrdOverrideInput,
  context: SrdOverrideValidationContext,
): SrdOverrideValidationResult {
  const errors: string[] = [];

  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`Unsupported override field "${key}".`);
  }

  const spellId = typeof input.spellId === "string" ? input.spellId.trim() : "";
  if (spellId === "") {
    errors.push("spellId must not be empty.");
  } else if (!isReservedSrdId(spellId)) {
    errors.push(`"${spellId}" is not a canonical SRD spell id.`);
  }
  const canonical = spellId ? context.srdSpellsById.get(spellId) : undefined;
  if (spellId !== "" && isReservedSrdId(spellId) && !canonical) {
    errors.push(`Unknown SRD spell "${spellId}".`);
  }

  const locale = typeof input.locale === "string" ? input.locale.trim() : "";
  if (locale === "") {
    errors.push("locale must not be empty.");
  } else if (!context.supportedLocales.includes(locale)) {
    errors.push(`Unsupported locale "${locale}".`);
  }

  const verbalDescription = normalizeDescription(input.verbalDescription);
  const somaticDescription = normalizeDescription(input.somaticDescription);

  if (verbalDescription && verbalDescription.length > LIMITS.META_MAX) {
    errors.push(`verbalDescription exceeds ${LIMITS.META_MAX} characters.`);
  }
  if (somaticDescription && somaticDescription.length > LIMITS.META_MAX) {
    errors.push(`somaticDescription exceeds ${LIMITS.META_MAX} characters.`);
  }

  if (canonical) {
    if (verbalDescription && !canonical.components.verbal) {
      errors.push(`Spell "${spellId}" has no verbal component.`);
    }
    if (somaticDescription && !canonical.components.somatic) {
      errors.push(`Spell "${spellId}" has no somatic component.`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: SrdSpellOverrideInput = { spellId, locale };
  if (verbalDescription) value.verbalDescription = verbalDescription;
  if (somaticDescription) value.somaticDescription = somaticDescription;
  return { ok: true, value };
}
