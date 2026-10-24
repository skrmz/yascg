import Dexie, { type Table } from "dexie";
import type { Spell, SrdSpellOverride } from "@/domain/spells";
import { dedupeDeckEntries } from "@/domain/deck";
import type { ActiveDeckRecord, SavedDeck } from "@/domain/deck";

export const DATABASE_NAME = "spell-cards-generator";

const DECK_STORES = {
  customSpells: "id, name, updatedAt",
  savedDecks: "id, updatedAt",
  activeDeck: "id",
  srdSpellOverrides: "[spellId+locale], spellId, locale",
};

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
    this.version(2).stores(DECK_STORES);
    this.version(3)
      .stores(DECK_STORES)
      .upgrade(async (tx) => {
        const activeTable = tx.table("activeDeck") as Table<ActiveDeckRecord, string>;
        const savedTable = tx.table("savedDecks") as Table<SavedDeck, string>;
        for (const deck of await activeTable.toArray()) {
          const entries = dedupeDeckEntries(deck.entries);
          const baseline =
            deck.baseline === null
              ? null
              : { ...deck.baseline, entries: dedupeDeckEntries(deck.baseline.entries) };
          if (
            entries.length !== deck.entries.length ||
            (deck.baseline !== null &&
              baseline !== null &&
              baseline.entries.length !== deck.baseline.entries.length)
          ) {
            await activeTable.put({ ...deck, entries, baseline, revision: deck.revision + 1 });
          }
        }
        for (const deck of await savedTable.toArray()) {
          const entries = dedupeDeckEntries(deck.entries);
          if (entries.length !== deck.entries.length) {
            await savedTable.put({ ...deck, entries });
          }
        }
      });
  }
}

export const db = new SpellCardsDatabase();
