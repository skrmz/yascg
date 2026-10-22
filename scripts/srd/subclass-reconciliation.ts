import { CORE_CLASSES } from "../../src/domain/spells.ts";
import { SUBCLASSES, isCatalogSubclass, subclassParentClass } from "../../src/domain/subclasses.ts";
import type { SubclassId } from "../../src/domain/subclasses.ts";

/**
 * Pure reconciliation of the reference file's `subclasses` into canonical
 * identifiers. No fuzzy matching is ever applied: every reference identifier is
 * either mapped through an explicit alias, recognized as a catalog identifier,
 * preserved verbatim as a reference-only identifier (parent class among the 12
 * core classes), or excluded (parent class not among the core classes).
 */

/** Explicit spell-name typo aliases (reference name → canonical source name). */
export const SPELL_NAME_ALIASES: Readonly<Record<string, string>> = {
  "Arance Hand": "Arcane Hand",
};

/** Applies the explicit spell-name aliases; unmatched names are returned as-is. */
export function canonicalSpellName(name: string): string {
  return SPELL_NAME_ALIASES[name] ?? name;
}

/**
 * Explicit reference → canonical identifier aliases (§4.1 of the phase plan).
 * Identity entries (the reference identifier is already canonical) are listed
 * so catalog coverage is complete and auditable. The 12 `Druid: Land (…)`
 * variants all collapse onto `Druid: Circle of the Land`.
 */
export const SUBCLASS_ALIASES: Readonly<Record<string, SubclassId>> = {
  "Barbarian: Wild Heart": "Barbarian: Path of the Wild Heart",
  "Bard: Glamour": "Bard: College of Glamour",
  "Cleric: Life": "Cleric: Life Domain",
  "Cleric: Light": "Cleric: Light Domain",
  "Cleric: Trickery": "Cleric: Trickery Domain",
  "Cleric: War": "Cleric: War Domain",
  "Druid: Land (Arctic)": "Druid: Circle of the Land",
  "Druid: Land (Arid Land)": "Druid: Circle of the Land",
  "Druid: Land (Coast)": "Druid: Circle of the Land",
  "Druid: Land (Desert)": "Druid: Circle of the Land",
  "Druid: Land (Forest)": "Druid: Circle of the Land",
  "Druid: Land (Grassland)": "Druid: Circle of the Land",
  "Druid: Land (Mountain)": "Druid: Circle of the Land",
  "Druid: Land (Polar Land)": "Druid: Circle of the Land",
  "Druid: Land (Swamp)": "Druid: Circle of the Land",
  "Druid: Land (Temperate Land)": "Druid: Circle of the Land",
  "Druid: Land (Tropical Land)": "Druid: Circle of the Land",
  "Druid: Land (Underdark)": "Druid: Circle of the Land",
  "Druid: Moon": "Druid: Circle of the Moon",
  "Druid: Sea": "Druid: Circle of the Sea",
  "Druid: Stars": "Druid: Circle of the Stars",
  "Fighter: Psi Warrior": "Fighter: Psi Warrior",
  "Monk: Elements": "Monk: Warrior of the Elements",
  "Monk: Open Hand": "Monk: Warrior of the Open Hand",
  "Monk: Shadow": "Monk: Warrior of Shadow",
  "Paladin: Ancients": "Paladin: Oath of the Ancients",
  "Paladin: Devotion": "Paladin: Oath of Devotion",
  "Paladin: Glory": "Paladin: Oath of Glory",
  "Paladin: Vengeance": "Paladin: Oath of Vengeance",
  "Ranger: Fey Wanderer": "Ranger: Fey Wanderer",
  "Ranger: Gloom Stalker": "Ranger: Gloom Stalker",
  "Rogue: Arcane Trickster": "Rogue: Arcane Trickster",
  "Sorcerer: Aberrant": "Sorcerer: Aberrant Sorcery",
  "Sorcerer: Aberrant Mind": "Sorcerer: Aberrant Sorcery",
  "Sorcerer: Clockwork": "Sorcerer: Clockwork Sorcery",
  "Sorcerer: Clockwork Soul": "Sorcerer: Clockwork Sorcery",
  "Sorcerer: Draconic": "Sorcerer: Draconic Sorcery",
  "Warlock: Archfey": "Warlock: Archfey Patron",
  "Warlock: Celestial": "Warlock: Celestial Patron",
  "Warlock: Fiend": "Warlock: Fiend Patron",
  "Warlock: Great Old One": "Warlock: Great Old One Patron",
  "Wizard: Abjurer": "Wizard: Abjurer",
  "Wizard: Diviner": "Wizard: Diviner",
  "Wizard: Illusion": "Wizard: Illusionist",
  "Wizard: Illusionist": "Wizard: Illusionist",
};

const CORE_CLASS_SET: ReadonlySet<string> = new Set(CORE_CLASSES);

export type ReconcileKind = "catalog" | "reference-only" | "excluded";

export interface ReconciledSubclass {
  reference: string;
  kind: ReconcileKind;
  /** Canonical catalog id, reference-only id, or excluded id. */
  id: string;
  /** Present only for `excluded` results. */
  reason?: string;
}

/** Classifies one reference subclass identifier. */
export function reconcileSubclass(reference: string): ReconciledSubclass {
  const alias = SUBCLASS_ALIASES[reference];
  if (alias !== undefined) return { reference, kind: "catalog", id: alias };
  if (isCatalogSubclass(reference)) return { reference, kind: "catalog", id: reference };
  if (CORE_CLASS_SET.has(subclassParentClass(reference))) {
    return { reference, kind: "reference-only", id: reference };
  }
  return { reference, kind: "excluded", id: reference, reason: "unsupported-parent-class" };
}

export interface SubclassCollision {
  id: string;
  references: string[];
}

export interface SpellSubclassReconciliation {
  /** Sorted, deduplicated canonical/reference-only identifiers to be stored. */
  assigned: string[];
  /** Canonical catalog identifiers with the reference identifier that produced them. */
  catalog: Array<{ reference: string; canonical: string }>;
  referenceOnly: string[];
  excluded: Array<{ id: string; reason: string }>;
  /** Distinct reference identifiers that collapsed onto one identifier within this spell. */
  collisions: SubclassCollision[];
}

/** Reconciles one spell's reference subclass list (dedupe + collision reporting). */
export function reconcileSubclasses(references: readonly string[]): SpellSubclassReconciliation {
  const groups = new Map<string, { kind: ReconcileKind; references: string[] }>();
  const excluded: Array<{ id: string; reason: string }> = [];
  for (const reference of references) {
    const result = reconcileSubclass(reference);
    if (result.kind === "excluded") {
      excluded.push({ id: result.id, reason: result.reason ?? "unsupported-parent-class" });
      continue;
    }
    const group = groups.get(result.id);
    if (group) group.references.push(reference);
    else groups.set(result.id, { kind: result.kind, references: [reference] });
  }

  const assigned: string[] = [];
  const catalog: Array<{ reference: string; canonical: string }> = [];
  const referenceOnly: string[] = [];
  const collisions: SubclassCollision[] = [];
  for (const [id, group] of groups) {
    assigned.push(id);
    if (group.kind === "catalog") catalog.push({ reference: group.references[0], canonical: id });
    else referenceOnly.push(id);
    if (group.references.length > 1) collisions.push({ id, references: [...group.references] });
  }
  assigned.sort();
  catalog.sort((a, b) => a.canonical.localeCompare(b.canonical));
  referenceOnly.sort();
  collisions.sort((a, b) => a.id.localeCompare(b.id));
  return { assigned, catalog, referenceOnly, excluded, collisions };
}

/** Catalog identifiers with no reference coverage (sorted). */
export function uncoveredCatalog(covered: ReadonlySet<string>): string[] {
  return SUBCLASSES.filter((id) => !covered.has(id)).sort();
}
