import Dexie, { type Table } from "dexie";
import type { Spell, SrdSpellOverride } from "@/domain/spells";
import type { ActiveDeckRecord, SavedDeck } from "@/domain/deck";

export const DATABASE_NAME = "spell-cards-generator";

export class SpellCardsDatabase extends Dexie {
  customSpells!: Table<Spell, string>;
  savedDecks!: Table<SavedDeck, string>;
  activeDeck!: Table<ActiveDeckRecord, string>;
  srdSpellOverrides!: Table<SrdSpellOverride, [string, string]>;

  constructor(name: string = DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      customSpells: "id, name, updatedAt",
      savedDecks: "id, updatedAt",
      activeDeck: "id",
    });
    this.version(2).stores({
      customSpells: "id, name, updatedAt",
      savedDecks: "id, updatedAt",
      activeDeck: "id",
      srdSpellOverrides: "[spellId+locale], spellId, locale",
    });
  }
}

export const db = new SpellCardsDatabase();
