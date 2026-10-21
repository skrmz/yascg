import type { CharacterClass, CoreClass, SpellSchool } from "@/domain/spells";

export const SCHOOL_KEYS = {
  Abjuration: "school.abjuration",
  Conjuration: "school.conjuration",
  Divination: "school.divination",
  Enchantment: "school.enchantment",
  Evocation: "school.evocation",
  Illusion: "school.illusion",
  Necromancy: "school.necromancy",
  Transmutation: "school.transmutation",
} as const satisfies Record<SpellSchool, string>;

export type SchoolTranslationKey = (typeof SCHOOL_KEYS)[SpellSchool];

export function schoolKey(school: SpellSchool): SchoolTranslationKey {
  return SCHOOL_KEYS[school];
}

export const CORE_CLASS_KEYS = {
  Bard: "class.bard",
  Cleric: "class.cleric",
  Druid: "class.druid",
  Paladin: "class.paladin",
  Ranger: "class.ranger",
  Sorcerer: "class.sorcerer",
  Warlock: "class.warlock",
  Wizard: "class.wizard",
} as const satisfies Record<CoreClass, string>;

export type ClassTranslationKey = (typeof CORE_CLASS_KEYS)[CoreClass];

export function classKey(name: CharacterClass): ClassTranslationKey | null {
  return Object.hasOwn(CORE_CLASS_KEYS, name) ? CORE_CLASS_KEYS[name as CoreClass] : null;
}

export const COMPONENT_KEYS = {
  verbal: "component.verbal",
  somatic: "component.somatic",
  material: "component.material",
} as const;

export type ComponentKind = keyof typeof COMPONENT_KEYS;
export type ComponentTranslationKey = (typeof COMPONENT_KEYS)[ComponentKind];

export function componentKey(component: ComponentKind): ComponentTranslationKey {
  return COMPONENT_KEYS[component];
}

export const DAMAGE_TYPE_KEYS = {
  acid: "damageType.acid",
  bludgeoning: "damageType.bludgeoning",
  cold: "damageType.cold",
  fire: "damageType.fire",
  force: "damageType.force",
  lightning: "damageType.lightning",
  necrotic: "damageType.necrotic",
  piercing: "damageType.piercing",
  poison: "damageType.poison",
  psychic: "damageType.psychic",
  radiant: "damageType.radiant",
  slashing: "damageType.slashing",
  thunder: "damageType.thunder",
} as const;

export type DamageTypeTranslationKey = (typeof DAMAGE_TYPE_KEYS)[keyof typeof DAMAGE_TYPE_KEYS];

/**
 * Maps a canonical damage-type identifier to its translation key. Unknown types
 * (e.g. from imported custom spells) return `null` so callers fall back to the
 * raw value rather than attempting a translation.
 */
export function damageTypeKey(type: string): DamageTypeTranslationKey | null {
  return Object.hasOwn(DAMAGE_TYPE_KEYS, type)
    ? DAMAGE_TYPE_KEYS[type as keyof typeof DAMAGE_TYPE_KEYS]
    : null;
}

export function levelLabelKey(level: number): "spell.level.cantrip" | "spell.level.level" {
  return level === 0 ? "spell.level.cantrip" : "spell.level.level";
}
