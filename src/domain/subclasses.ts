/**
 * Canonical catalog of the 48 official 2024 subclasses, each stored as the
 * canonical English identifier `"<ClassName>: <SubclassName>"`.
 *
 * This is a shared registry for the build layer and localization, not a
 * validation enum: the raw SRD adapter intentionally stays tolerant of
 * non-catalog identifiers (reference-only subclasses, custom spells, imports).
 * German labels live in `src/locales/` and never appear in stored identifiers.
 */
export const SUBCLASSES = [
  "Barbarian: Path of the Berserker",
  "Barbarian: Path of the Wild Heart",
  "Barbarian: Path of the World Tree",
  "Barbarian: Path of the Zealot",
  "Bard: College of Dance",
  "Bard: College of Glamour",
  "Bard: College of Lore",
  "Bard: College of Valor",
  "Cleric: Life Domain",
  "Cleric: Light Domain",
  "Cleric: Trickery Domain",
  "Cleric: War Domain",
  "Druid: Circle of the Land",
  "Druid: Circle of the Moon",
  "Druid: Circle of the Sea",
  "Druid: Circle of the Stars",
  "Fighter: Battle Master",
  "Fighter: Champion",
  "Fighter: Eldritch Knight",
  "Fighter: Psi Warrior",
  "Monk: Warrior of Mercy",
  "Monk: Warrior of the Elements",
  "Monk: Warrior of the Open Hand",
  "Monk: Warrior of Shadow",
  "Paladin: Oath of Devotion",
  "Paladin: Oath of Glory",
  "Paladin: Oath of the Ancients",
  "Paladin: Oath of Vengeance",
  "Ranger: Beast Master",
  "Ranger: Gloom Stalker",
  "Ranger: Hunter",
  "Ranger: Fey Wanderer",
  "Rogue: Arcane Trickster",
  "Rogue: Assassin",
  "Rogue: Soulknife",
  "Rogue: Thief",
  "Sorcerer: Aberrant Sorcery",
  "Sorcerer: Clockwork Sorcery",
  "Sorcerer: Draconic Sorcery",
  "Sorcerer: Wild Magic Sorcery",
  "Warlock: Archfey Patron",
  "Warlock: Celestial Patron",
  "Warlock: Fiend Patron",
  "Warlock: Great Old One Patron",
  "Wizard: Abjurer",
  "Wizard: Diviner",
  "Wizard: Evoker",
  "Wizard: Illusionist",
] as const;

export type SubclassId = (typeof SUBCLASSES)[number];

const SUBCLASS_SET: ReadonlySet<string> = new Set(SUBCLASSES);

/** Narrows a canonical identifier to a member of the 48-item catalog. */
export function isCatalogSubclass(id: string): id is SubclassId {
  return SUBCLASS_SET.has(id);
}

/** Parent class name of a `"<ClassName>: <SubclassName>"` identifier. */
export function subclassParentClass(id: string): string {
  const separatorIndex = id.indexOf(": ");
  return separatorIndex === -1 ? id : id.slice(0, separatorIndex);
}

/**
 * English subclass name for display fallback: the portion after the single
 * `": "` separator. Used for reference-only identifiers that have no locale
 * catalog entry.
 */
export function subclassDisplayNameFallback(id: string): string {
  const separatorIndex = id.indexOf(": ");
  return separatorIndex === -1 ? id : id.slice(separatorIndex + 2);
}
