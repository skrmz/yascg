import { db } from "./database.ts";
import { DeckConflictError } from "./active-deck.ts";
import {
  ACTIVE_DECK_ID,
  createEmptyActiveDeck,
  dedupeDeckEntries,
  type ActiveDeckRecord,
  type DeckEntry,
} from "@/domain/deck";
import { spellSchema, type Spell } from "@/domain/spells";
import { newUuid, isReservedSrdId } from "@/domain/ids";
import { customSpellDraftDefaults } from "@/locales/labels.ts";

export interface CustomSpellDeletion {
  spell: Spell;
  spellId: string;
  activeEntries: Array<{ index: number; entry: DeckEntry }>;
  activeRevisionAfter: number;
  at: number;
}

export function createCustomSpellDraft(language: string = "en"): Spell {
  const defaults = customSpellDraftDefaults(language);
  return {
    id: newUuid(),
    name: "",
    level: 0,
    school: "Evocation",
    castingTime: defaults.castingTime,
    range: defaults.range,
    duration: defaults.duration,
    components: {
      verbal: false,
      somatic: false,
      material: false,
    },
    concentration: false,
    ritual: false,
    classes: [],
    description: [""],
    source: "Custom",
  };
}

function validateCustomSpell(spell: Spell): Spell {
  if (isReservedSrdId(spell.id)) {
    throw new Error(`Custom spell IDs must not use the reserved "srd-" prefix.`);
  }
  const result = spellSchema.safeParse({
    ...spell,
    updatedAt: Date.now(),
  });
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(
      `Custom spell is invalid on "${first?.path.join(".") || "spell"}": ${first?.message ?? "unknown error"}`,
    );
  }
  return result.data;
}

export async function listCustomSpells(): Promise<Spell[]> {
  const spells = await db.customSpells.toArray();
  return spells.sort((a, b) => a.name.localeCompare(b.name));
}

export async function putCustomSpell(spell: Spell): Promise<Spell> {
  const validated = validateCustomSpell(spell);
  await db.customSpells.put(validated);
  return validated;
}

export async function updateCustomSpell(spell: Spell): Promise<Spell> {
  const existing = await db.customSpells.get(spell.id);
  if (!existing) throw new Error(`Custom spell "${spell.id}" was not found.`);
  return putCustomSpell({ ...spell, id: existing.id });
}

export async function duplicateCustomSpell(id: string): Promise<Spell> {
  const existing = await db.customSpells.get(id);
  if (!existing) throw new Error(`Custom spell "${id}" was not found.`);
  const copy: Spell = {
    ...existing,
    id: newUuid(),
    name: `${existing.name} (Copy)`.slice(0, 120),
    updatedAt: Date.now(),
  };
  const validated = spellSchema.parse(copy);
  await db.customSpells.put(validated);
  return validated;
}

/**
 * Atomically deletes a custom spell and removes every matching active-deck entry,
 * checking and incrementing the active-deck revision in the same transaction.
 * Saved decks are never touched.
 */
export async function deleteCustomSpell(
  activeExpectedRevision: number,
  spellId: string,
): Promise<CustomSpellDeletion | null> {
  return db.transaction("rw", db.customSpells, db.activeDeck, async () => {
    const spell = await db.customSpells.get(spellId);
    if (!spell) return null;
    const active = (await db.activeDeck.get(ACTIVE_DECK_ID)) ?? createEmptyActiveDeck();
    if (active.revision !== activeExpectedRevision) {
      throw new DeckConflictError(activeExpectedRevision, active.revision);
    }
    const activeEntries: Array<{ index: number; entry: DeckEntry }> = [];
    active.entries.forEach((entry, index) => {
      if (entry.spellId === spellId) activeEntries.push({ index, entry });
    });
    const remaining = active.entries.filter((entry) => entry.spellId !== spellId);
    const next: ActiveDeckRecord = {
      ...active,
      entries: remaining,
      revision: active.revision + 1,
    };
    await db.customSpells.delete(spellId);
    await db.activeDeck.put(next);
    return {
      spell,
      spellId,
      activeEntries,
      activeRevisionAfter: next.revision,
      at: Date.now(),
    };
  });
}

/**
 * Session-only Undo: restores the deleted spell and its active entries at their
 * original positions. Refuses when the spell ID is reallocated or the active deck
 * revision no longer matches, preserving newer work.
 */
export async function restoreDeletedSpell(
  deletion: CustomSpellDeletion,
  activeExpectedRevision: number,
): Promise<ActiveDeckRecord> {
  return db.transaction("rw", db.customSpells, db.activeDeck, async () => {
    const existing = await db.customSpells.get(deletion.spellId);
    if (existing) {
      throw new Error(`Cannot undo: the spell ID "${deletion.spellId}" is already in use.`);
    }
    const active = (await db.activeDeck.get(ACTIVE_DECK_ID)) ?? createEmptyActiveDeck();
    if (active.revision !== activeExpectedRevision) {
      throw new DeckConflictError(activeExpectedRevision, active.revision);
    }
    await db.customSpells.put(deletion.spell);
    const entries = [...active.entries];
    for (const { index, entry } of deletion.activeEntries) {
      const bounded = Math.min(index, entries.length);
      entries.splice(bounded, 0, entry);
    }
    const next: ActiveDeckRecord = {
      ...active,
      entries: dedupeDeckEntries(entries),
      revision: active.revision + 1,
    };
    await db.activeDeck.put(next);
    return next;
  });
}
