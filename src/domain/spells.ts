import { z } from "zod";

export const SPELL_SCHOOLS = [
  "Abjuration",
  "Conjuration",
  "Divination",
  "Enchantment",
  "Evocation",
  "Illusion",
  "Necromancy",
  "Transmutation",
] as const;

export const CORE_CLASSES = [
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard",
] as const;

export const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;

export const ABILITY_SCORES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;

export const SPELL_SOURCES = ["SRD-5.2.1", "Custom"] as const;

export const CARD_FIT_MODES = ["auto-shrink", "multi-card"] as const;

export type SpellSchool = (typeof SPELL_SCHOOLS)[number];
export type CoreClass = (typeof CORE_CLASSES)[number];
export type DamageType = (typeof DAMAGE_TYPES)[number];
export type CharacterClass = CoreClass | (string & {});
export type AbilityScore = (typeof ABILITY_SCORES)[number];
export type SpellSource = (typeof SPELL_SOURCES)[number];
export type CardFitMode = (typeof CARD_FIT_MODES)[number];

export interface SpellComponents {
  verbal: boolean;
  verbalDescription?: string;
  somatic: boolean;
  somaticDescription?: string;
  material: boolean;
  materialDescription?: string;
  materialCost?: string;
  materialConsumed?: boolean;
  componentsDisplayOverride?: string;
}

export interface Spell {
  id: string;
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  components: SpellComponents;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  classes: CharacterClass[];
  subclasses?: string[];
  savingThrow?: AbilityScore;
  damageTypes?: string[];
  description: string[];
  higherLevels?: string[];
  source: SpellSource;
  sourceLabel?: string;
  updatedAt?: number;
}

export const LIMITS = {
  NAME_MAX: 120,
  /**
   * Schema ceiling for casting time / range / duration. The specification's
   * authoring guideline is 120 characters (FREETEXT_AUTHORED_MAX), but official
   * SRD 5.2.1 rules text such as Counterspell's reaction trigger exceeds that.
   * Bundled data must never be truncated, so the runtime schema admits up to
   * METADATA_MAX while custom-spell authoring is limited to FREETEXT_AUTHORED_MAX.
   */
  FREETEXT_MAX: 500,
  FREETEXT_AUTHORED_MAX: 120,
  CLASS_NAME_MAX: 80,
  DESCRIPTION_ITEM_MAX: 20_000,
  DESCRIPTION_TOTAL_MAX: 50_000,
  META_MAX: 500,
  IMPORT_BYTES_MAX: 5 * 1024 * 1024,
  DECK_ENTRIES_MAX: 2_000,
  CONTINUATION_CARDS_MAX: 100,
} as const;

export const spellSchoolSchema = z.enum(SPELL_SCHOOLS);
export const abilityScoreSchema = z.enum(ABILITY_SCORES);
export const spellSourceSchema = z.enum(SPELL_SOURCES);
export const cardFitModeSchema = z.enum(CARD_FIT_MODES);

const trimmedNonEmpty = (max: number) => z.string().trim().min(1).max(max);

const optionalMeta = z.string().trim().max(LIMITS.META_MAX).optional();

export const spellComponentsSchema = z.object({
  verbal: z.boolean(),
  verbalDescription: optionalMeta,
  somatic: z.boolean(),
  somaticDescription: optionalMeta,
  material: z.boolean(),
  materialDescription: optionalMeta,
  materialCost: optionalMeta,
  materialConsumed: z.boolean().optional(),
  componentsDisplayOverride: optionalMeta,
});

export const spellIdSchema = trimmedNonEmpty(LIMITS.NAME_MAX);

export const spellSchema = z
  .object({
    id: spellIdSchema,
    name: trimmedNonEmpty(LIMITS.NAME_MAX),
    level: z.number().int().min(0).max(9),
    school: spellSchoolSchema,
    castingTime: trimmedNonEmpty(LIMITS.FREETEXT_MAX),
    range: trimmedNonEmpty(LIMITS.FREETEXT_MAX),
    components: spellComponentsSchema,
    duration: trimmedNonEmpty(LIMITS.FREETEXT_MAX),
    concentration: z.boolean(),
    ritual: z.boolean(),
    classes: z
      .array(trimmedNonEmpty(LIMITS.CLASS_NAME_MAX))
      .refine((values) => new Set(values).size === values.length, {
        message: "class names must be unique",
      }),
    /**
     * Canonical `"<ClassName>: <SubclassName>"` identifiers for SRD data. The
     * runtime schema intentionally only enforces non-empty unique strings so that
     * custom spells and imports stay tolerant; the raw SRD adapter enforces the
     * `"<CORE_CLASS>: <Sub>"` prefix rule.
     */
    subclasses: z
      .array(trimmedNonEmpty(LIMITS.META_MAX))
      .refine((values) => new Set(values).size === values.length, {
        message: "subclass identifiers must be unique",
      })
      .optional(),
    savingThrow: abilityScoreSchema.optional(),
    damageTypes: z.array(trimmedNonEmpty(LIMITS.META_MAX)).optional(),
    description: z.array(z.string().max(LIMITS.DESCRIPTION_ITEM_MAX)).min(1),
    higherLevels: z.array(z.string().max(LIMITS.DESCRIPTION_ITEM_MAX)).optional(),
    source: spellSourceSchema,
    sourceLabel: optionalMeta,
    updatedAt: z.number().int().nonnegative().optional(),
  })
  .refine(
    (spell) =>
      combinedDescriptionLength(spell.description, spell.higherLevels) <=
      LIMITS.DESCRIPTION_TOTAL_MAX,
    {
      message: `combined description and higher-level text must be at most ${LIMITS.DESCRIPTION_TOTAL_MAX} characters`,
      path: ["description"],
    },
  );

export function combinedDescriptionLength(
  description: readonly string[],
  higherLevels?: readonly string[],
): number {
  let total = 0;
  for (const part of description) total += part.length;
  if (higherLevels) for (const part of higherLevels) total += part.length;
  return total;
}

export function isCustomSpell(spell: Pick<Spell, "source">): boolean {
  return spell.source === "Custom";
}
