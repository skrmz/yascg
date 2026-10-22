import type { TFunction } from "i18next";
import type { CharacterClass, CoreClass, DamageType, SpellSchool } from "@/domain/spells";
import { subclassDisplayNameFallback, type SubclassId } from "@/domain/subclasses";

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
  Barbarian: "class.barbarian",
  Bard: "class.bard",
  Cleric: "class.cleric",
  Druid: "class.druid",
  Fighter: "class.fighter",
  Monk: "class.monk",
  Paladin: "class.paladin",
  Ranger: "class.ranger",
  Rogue: "class.rogue",
  Sorcerer: "class.sorcerer",
  Warlock: "class.warlock",
  Wizard: "class.wizard",
} as const satisfies Record<CoreClass, string>;

export type ClassTranslationKey = (typeof CORE_CLASS_KEYS)[CoreClass];

export function classKey(name: CharacterClass): ClassTranslationKey | null {
  return Object.hasOwn(CORE_CLASS_KEYS, name) ? CORE_CLASS_KEYS[name as CoreClass] : null;
}

/**
 * Canonical subclass identifier → translation key for the 48-item catalog.
 * Typed against `SubclassId` so the compiler enforces complete coverage.
 */
export const SUBCLASS_KEYS = {
  "Barbarian: Path of the Berserker": "subclass.barbarian.pathOfTheBerserker",
  "Barbarian: Path of the Wild Heart": "subclass.barbarian.pathOfTheWildHeart",
  "Barbarian: Path of the World Tree": "subclass.barbarian.pathOfTheWorldTree",
  "Barbarian: Path of the Zealot": "subclass.barbarian.pathOfTheZealot",
  "Bard: College of Dance": "subclass.bard.collegeOfDance",
  "Bard: College of Glamour": "subclass.bard.collegeOfGlamour",
  "Bard: College of Lore": "subclass.bard.collegeOfLore",
  "Bard: College of Valor": "subclass.bard.collegeOfValor",
  "Cleric: Life Domain": "subclass.cleric.lifeDomain",
  "Cleric: Light Domain": "subclass.cleric.lightDomain",
  "Cleric: Trickery Domain": "subclass.cleric.trickeryDomain",
  "Cleric: War Domain": "subclass.cleric.warDomain",
  "Druid: Circle of the Land": "subclass.druid.circleOfTheLand",
  "Druid: Circle of the Moon": "subclass.druid.circleOfTheMoon",
  "Druid: Circle of the Sea": "subclass.druid.circleOfTheSea",
  "Druid: Circle of the Stars": "subclass.druid.circleOfTheStars",
  "Fighter: Battle Master": "subclass.fighter.battleMaster",
  "Fighter: Champion": "subclass.fighter.champion",
  "Fighter: Eldritch Knight": "subclass.fighter.eldritchKnight",
  "Fighter: Psi Warrior": "subclass.fighter.psiWarrior",
  "Monk: Warrior of Mercy": "subclass.monk.warriorOfMercy",
  "Monk: Warrior of the Elements": "subclass.monk.warriorOfTheElements",
  "Monk: Warrior of the Open Hand": "subclass.monk.warriorOfTheOpenHand",
  "Monk: Warrior of Shadow": "subclass.monk.warriorOfShadow",
  "Paladin: Oath of Devotion": "subclass.paladin.oathOfDevotion",
  "Paladin: Oath of Glory": "subclass.paladin.oathOfGlory",
  "Paladin: Oath of the Ancients": "subclass.paladin.oathOfTheAncients",
  "Paladin: Oath of Vengeance": "subclass.paladin.oathOfVengeance",
  "Ranger: Beast Master": "subclass.ranger.beastMaster",
  "Ranger: Gloom Stalker": "subclass.ranger.gloomStalker",
  "Ranger: Hunter": "subclass.ranger.hunter",
  "Ranger: Fey Wanderer": "subclass.ranger.feyWanderer",
  "Rogue: Arcane Trickster": "subclass.rogue.arcaneTrickster",
  "Rogue: Assassin": "subclass.rogue.assassin",
  "Rogue: Soulknife": "subclass.rogue.soulknife",
  "Rogue: Thief": "subclass.rogue.thief",
  "Sorcerer: Aberrant Sorcery": "subclass.sorcerer.aberrantSorcery",
  "Sorcerer: Clockwork Sorcery": "subclass.sorcerer.clockworkSorcery",
  "Sorcerer: Draconic Sorcery": "subclass.sorcerer.draconicSorcery",
  "Sorcerer: Wild Magic Sorcery": "subclass.sorcerer.wildMagicSorcery",
  "Warlock: Archfey Patron": "subclass.warlock.archfeyPatron",
  "Warlock: Celestial Patron": "subclass.warlock.celestialPatron",
  "Warlock: Fiend Patron": "subclass.warlock.fiendPatron",
  "Warlock: Great Old One Patron": "subclass.warlock.greatOldOnePatron",
  "Wizard: Abjurer": "subclass.wizard.abjurer",
  "Wizard: Diviner": "subclass.wizard.diviner",
  "Wizard: Evoker": "subclass.wizard.evoker",
  "Wizard: Illusionist": "subclass.wizard.illusionist",
} as const satisfies Record<SubclassId, string>;

export type SubclassTranslationKey = (typeof SUBCLASS_KEYS)[SubclassId];

/**
 * Maps a canonical subclass identifier to its translation key. Non-catalog
 * identifiers (reference-only subclasses, custom spells) return `null` so
 * callers fall back to the English subclass name.
 */
export function subclassKey(id: string): SubclassTranslationKey | null {
  return Object.hasOwn(SUBCLASS_KEYS, id) ? SUBCLASS_KEYS[id as SubclassId] : null;
}

/**
 * Localized subclass label, falling back to the English subclass portion of the
 * identifier when no catalog entry matches. Never returns a translated
 * identifier.
 */
export function subclassLabel(id: string, t: TFunction): string {
  const key = subclassKey(id);
  return key ? t(key) : subclassDisplayNameFallback(id);
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
} as const satisfies Record<DamageType, string>;

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
