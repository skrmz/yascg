import Dexie, { type Table } from "dexie";
import type { Spell } from "@/domain/spells";
import type { ActiveDeckRecord, SavedDeck } from "@/domain/deck";

export const DATABASE_NAME = "spell-cards-generator";

export class SpellCardsDatabase extends Dexie {
  customSpells!: Table<Spell, string>;
  savedDecks!: Table<SavedDeck, string>;
  activeDeck!: Table<ActiveDeckRecord, string>;

  constructor(name: string = DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      customSpells: "id, name, updatedAt",
      savedDecks: "id, updatedAt",
      activeDeck: "id",
    });
  }
}

export const db = new SpellCardsDatabase();
