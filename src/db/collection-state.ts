import type { Table } from "dexie";
import { db, type CollectionMetadata } from "./database.ts";
import { ACTIVE_DECK_ID, createEmptyActiveDeck } from "@/domain/deck";
import { newUuid } from "@/domain/ids";
import { AppError, message } from "@/locales/messages.ts";

export const INITIAL_COLLECTION_GENERATION = "initial";

const initialMetadata: CollectionMetadata = {
  id: "collection",
  generation: INITIAL_COLLECTION_GENERATION,
  changeToken: INITIAL_COLLECTION_GENERATION,
};

export class CollectionChangedError extends AppError {
  constructor() {
    super(message("error.collectionChanged"));
  }
}

let upgradeBlocked = false;
db.on("blocked", () => {
  upgradeBlocked = true;
});
db.on(
  "ready",
  () => {
    upgradeBlocked = false;
  },
  true,
);

export async function openCollectionStorage(): Promise<void> {
  if (db.isOpen()) return;
  const blockedError = () => new AppError(message("error.storageUpgradeBlocked"));
  if (upgradeBlocked) throw blockedError();
  let onBlocked: () => void = () => {};
  const blocked = new Promise<never>((_, reject) => {
    onBlocked = () => reject(blockedError());
    db.on("blocked", onBlocked);
  });
  try {
    await Promise.race([db.open(), blocked]);
  } finally {
    db.on("blocked").unsubscribe(onBlocked);
  }
}

export async function readCollectionMetadata(): Promise<CollectionMetadata> {
  return (await db.collectionMetadata.get("collection")) ?? initialMetadata;
}

/** All user mutations serialize on metadata along with their own stores. */
export async function writeCollection<T>(
  expectedGeneration: string,
  tables: Table[],
  write: (markChanged: () => void) => Promise<T>,
): Promise<T> {
  await openCollectionStorage();
  return db.transaction("rw", [db.collectionMetadata, ...tables], async () => {
    const metadata = await readCollectionMetadata();
    if (metadata.generation !== expectedGeneration) throw new CollectionChangedError();
    let changed = false;
    const result = await write(() => {
      changed = true;
    });
    if (changed) {
      await db.collectionMetadata.put({ ...metadata, changeToken: newUuid() });
    }
    return result;
  });
}

export function collectionTables() {
  return [db.activeDeck, db.savedDecks, db.customSpells, db.srdSpellOverrides];
}

/** Read data and its generation together, for both the workspace and export. */
export async function readCollectionSnapshot() {
  await openCollectionStorage();
  return db.transaction("r", [db.collectionMetadata, ...collectionTables()], async () => {
    const [metadata, activeDeck, savedDecks, customSpells, srdSpellOverrides] = await Promise.all([
      readCollectionMetadata(),
      db.activeDeck.get(ACTIVE_DECK_ID),
      db.savedDecks.toArray(),
      db.customSpells.toArray(),
      db.srdSpellOverrides.toArray(),
    ]);
    return {
      metadata,
      collection: {
        activeDeck: activeDeck ?? createEmptyActiveDeck(),
        savedDecks,
        customSpells,
        srdSpellOverrides,
      },
    };
  });
}
