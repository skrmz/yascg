import { db } from "./database.ts";
import { type Spell, type SrdSpellOverride } from "@/domain/spells";
import {
  validateSrdOverride,
  type SrdOverrideInput,
  type SrdOverrideValidationContext,
} from "@/domain/srd-overrides.ts";
import { AppError, message } from "@/locales/messages.ts";

export type { SrdOverrideInput, SrdOverrideValidationContext };

export async function listSrdOverrides(): Promise<SrdSpellOverride[]> {
  return db.srdSpellOverrides.toArray();
}

export async function getSrdOverride(
  spellId: string,
  locale: string,
): Promise<SrdSpellOverride | null> {
  const record = await db.srdSpellOverrides.get([spellId, locale]);
  return record ?? null;
}

export async function deleteSrdOverride(spellId: string, locale: string): Promise<void> {
  await db.srdSpellOverrides.delete([spellId, locale]);
}

/**
 * Validates then persists an override. Invalid input throws (never stored).
 * When both descriptions are empty after trimming, an existing record is
 * deleted (UI clearing) and `null` is returned.
 */
export async function putSrdOverride(
  input: SrdOverrideInput,
  context: SrdOverrideValidationContext,
): Promise<SrdSpellOverride | null> {
  const result = validateSrdOverride(input, context);
  if (!result.ok) {
    throw new AppError(
      message("error.srdOverrideInvalid"),
      result.errors.map((descriptor) => descriptor.key).join(" "),
    );
  }
  const { value } = result;
  if (!value.verbalDescription && !value.somaticDescription) {
    await deleteSrdOverride(value.spellId, value.locale);
    return null;
  }
  const record: SrdSpellOverride = { ...value, updatedAt: Date.now() };
  await db.srdSpellOverrides.put(record);
  return record;
}

/** Groups overrides by locale, then by spell id. */
export function indexOverridesByLocale(
  overrides: readonly SrdSpellOverride[],
): Map<string, Map<string, SrdSpellOverride>> {
  const byLocale = new Map<string, Map<string, SrdSpellOverride>>();
  for (const override of overrides) {
    let byId = byLocale.get(override.locale);
    if (!byId) {
      byId = new Map();
      byLocale.set(override.locale, byId);
    }
    byId.set(override.spellId, override);
  }
  return byLocale;
}

function mergeOverride(spell: Spell, override: SrdSpellOverride): Spell {
  const components = { ...spell.components };
  let applied = false;
  if (spell.components.verbal && override.verbalDescription) {
    components.verbalDescription = override.verbalDescription;
    applied = true;
  }
  if (spell.components.somatic && override.somaticDescription) {
    components.somaticDescription = override.somaticDescription;
    applied = true;
  }
  if (!applied) return spell;
  return { ...spell, components, overridden: true };
}

/**
 * Pure read-time merge. Returns the same array reference when nothing matches so
 * callers can keep `useMemo` identities stable. Inputs are never mutated
 * (protects the shared `load.ts` dataset cache).
 */
export function applySrdOverrides(
  spells: readonly Spell[],
  overrides: ReadonlyMap<string, SrdSpellOverride> | undefined,
): Spell[] {
  if (!overrides || overrides.size === 0) return spells as Spell[];
  let changed = false;
  const merged = spells.map((spell) => {
    const override = overrides.get(spell.id);
    if (!override) return spell;
    const next = mergeOverride(spell, override);
    if (next !== spell) changed = true;
    return next;
  });
  return changed ? merged : (spells as Spell[]);
}
