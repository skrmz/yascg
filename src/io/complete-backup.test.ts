import Dexie from "dexie";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { db, DATABASE_NAME } from "@/db/database.ts";
import { CollectionChangedError, readCollectionSnapshot } from "@/db/collection-state.ts";
import { getActiveDeck, makeEntry, mutateActiveDeck } from "@/db/active-deck.ts";
import {
  deleteCustomSpell,
  duplicateCustomSpell,
  putCustomSpell,
  restoreDeletedSpell,
  updateCustomSpell,
} from "@/db/custom-spells.ts";
import {
  deleteSavedDeck,
  listSavedDecks,
  loadSavedDeck,
  newActiveDeck,
  renameActiveDeck,
  saveAssociatedDeck,
  saveNewDeck,
  SavedDeckConflictError,
} from "@/db/saved-decks.ts";
import { deleteSrdOverride, putSrdOverride } from "@/db/srd-overrides.ts";
import { createEmptyActiveDeck, getDeckStatus, isDeckDirty } from "@/domain/deck";
import { makeCustomSpell, makeSpell } from "@/test/fixtures/spells.ts";
import { resolveEntry } from "@/services/data/resolution.ts";
import {
  backupFailure,
  COMPLETE_BACKUP_TYPE,
  exportCompleteBackup,
  parseCompleteBackup,
  reviewCompleteBackup,
  type CompleteBackup,
} from "./complete-backup.ts";
import { analyzeCustomImport, applyCustomImport } from "./import-custom.ts";
import { analyzeDeckImport, applyDeckImport } from "./import-deck.ts";
import * as downloads from "./export.ts";

const canonical = makeSpell();
const override = { spellId: canonical.id, locale: "en", verbalDescription: "Notes" };
const context = {
  srdSpellsById: new Map([[canonical.id, canonical]]),
  supportedLocales: ["en", "de"],
};
const loadContext = async () => context;
const emptyBackup = (): CompleteBackup => ({
  type: COMPLETE_BACKUP_TYPE,
  version: 1,
  activeDeck: createEmptyActiveDeck(),
  savedDecks: [],
  customSpells: [],
  srdSpellOverrides: [],
});
const encode = (backup: unknown) =>
  JSON.stringify(backup, (_, value: unknown) => (value === undefined ? null : value));
const review = (backup: CompleteBackup = emptyBackup()) =>
  reviewCompleteBackup(encode(backup), loadContext);

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("complete backup fidelity", () => {
  it("exports one snapshot and restores the exact records after closing and reopening storage", async () => {
    const custom = makeCustomSpell({
      id: "original-id",
      name: "Zauber 🌙",
      description: ["  **Äther**\r\n\n<em>Text</em>  ", "next"],
      higherLevels: undefined,
      components: { ...canonical.components, materialConsumed: false, materialCost: undefined },
      subclasses: ["Wizard: School B", "Wizard: School A"],
      damageTypes: ["cold", "acid"],
    });
    const linked = {
      ...makeEntry(custom.id, "Custom", custom.name),
      fitMode: "multi-card" as const,
    };
    const missing = {
      ...makeEntry("deleted", "Custom", "Stored fallback"),
      fitMode: "auto-shrink" as const,
    };
    const unknownSrd = makeEntry("srd-missing", "SRD-5.2.1", "Unknown SRD");
    const untranslated = makeEntry(canonical.id, "SRD-5.2.1", "Canonical fallback");
    const wrongSource = makeEntry("another-id", "SRD-5.2.1", "Wrong-source fallback");
    const baseline = { name: "Same name", entries: [missing, linked], savedRevision: 2 };
    const a = { id: "a", name: baseline.name, entries: [untranslated], updatedAt: 8, revision: 3 };
    const b = { ...a, id: "b", entries: [], revision: 1 };
    const backup: CompleteBackup = {
      ...emptyBackup(),
      activeDeck: {
        ...createEmptyActiveDeck(),
        name: "Changed name",
        revision: 9,
        entries: [linked, missing, unknownSrd, untranslated, wrongSource],
        savedDeckId: "a",
        baseline,
      },
      savedDecks: [a, b],
      customSpells: [makeCustomSpell({ id: "another-id" }), custom],
      srdSpellOverrides: [
        { ...override, locale: "de", somaticDescription: "  **Geste**  ", updatedAt: 7 },
        { ...override, updatedAt: 17 },
      ],
    };
    await (await review(backup)).commit();
    const download = vi.spyOn(downloads, "downloadText").mockImplementation(() => {});
    await exportCompleteBackup();
    expect(download).toHaveBeenCalledTimes(1);
    const text = download.mock.calls[0][1];
    expect(parseCompleteBackup(text)).toStrictEqual(backup);
    expect(analyzeDeckImport(text).ok).toBe(false);
    expect(analyzeCustomImport(text, []).ok).toBe(false);

    await db.delete();
    const restore = await reviewCompleteBackup(text, loadContext);
    expect((await readCollectionSnapshot()).collection.activeDeck).toEqual(createEmptyActiveDeck());
    await restore.commit();
    db.close();
    const { collection, metadata } = await readCollectionSnapshot();
    expect(collection).toStrictEqual({
      activeDeck: backup.activeDeck,
      savedDecks: backup.savedDecks,
      customSpells: backup.customSpells,
      srdSpellOverrides: backup.srdSpellOverrides,
    });
    expect((await listSavedDecks()).map(({ id }) => id)).toEqual(["a", "b"]);
    expect(isDeckDirty(collection.activeDeck)).toBe(true);
    expect(getDeckStatus(collection.activeDeck)).toBe("unsaved");
    expect(
      collection.activeDeck.entries.map(
        (entry) =>
          resolveEntry(entry, {
            englishSpellsById: context.srdSpellsById,
            languageSpellsById: new Map(),
            customSpellsById: new Map(collection.customSpells.map((spell) => [spell.id, spell])),
          }).status,
      ),
    ).toEqual(["resolved", "missing", "missing", "translation-unavailable", "missing"]);
    await expect(saveAssociatedDeck(9, metadata.generation)).rejects.toBeInstanceOf(
      SavedDeckConflictError,
    );
  });

  it("preserves a migrated association with a missing snapshot and unverified baseline", async () => {
    const backup = emptyBackup();
    backup.activeDeck = {
      ...backup.activeDeck,
      savedDeckId: "legacy-missing",
      baseline: { name: "Baseline", entries: [] },
      name: "Legacy working deck",
    };
    await (await review(backup)).commit();
    const { collection, metadata } = await readCollectionSnapshot();
    expect(collection.activeDeck).toStrictEqual(backup.activeDeck);
    expect(getDeckStatus(collection.activeDeck)).toBe("invalid");
    await expect(saveAssociatedDeck(0, metadata.generation)).rejects.toMatchObject({
      name: "InvalidDeckStateError",
    });
    await expect(saveNewDeck(0, "Recovered", metadata.generation)).resolves.toMatchObject({
      active: { baseline: { savedRevision: 1 } },
    });
  });

  it("preserves a negative zero stored in a spell level", async () => {
    await putCustomSpell(makeCustomSpell({ level: -0 }));
    const download = vi.spyOn(downloads, "downloadText").mockImplementation(() => {});
    await exportCompleteBackup();
    const text = download.mock.calls[0][1];
    expect(parseCompleteBackup(text).customSpells[0].level).toBe(-0);
    await (await reviewCompleteBackup(text)).commit();
    expect((await readCollectionSnapshot()).collection.customSpells[0].level).toBe(-0);
  });

  it("accepts a collection larger than either narrow import limit", async () => {
    const backup = emptyBackup();
    backup.activeDeck.entries = Array.from({ length: 2100 }, (_, i) => ({
      ...makeEntry(`srd-${i}`, "SRD-5.2.1", "Stored name"),
      entryId: `entry-${i}`,
    }));
    backup.customSpells = Array.from({ length: 275 }, (_, i) =>
      makeCustomSpell({ id: `custom-${i}`, description: ["ä".repeat(20_000)] }),
    );
    await (await review(backup)).commit();
    const download = vi.spyOn(downloads, "downloadText").mockImplementation(() => {});
    await exportCompleteBackup();
    expect(new TextEncoder().encode(download.mock.calls[0][1]).length).toBeGreaterThan(
      5 * 1024 * 1024,
    );
    expect(parseCompleteBackup(download.mock.calls[0][1]).activeDeck.entries).toHaveLength(2100);
  });
});

describe("complete backup validation", () => {
  const entry = makeEntry("spell-id", "Custom", "Stored name");
  it.each([
    ["malformed JSON", "{"],
    [
      "duplicate JSON member",
      encode(emptyBackup()).replace('"version":1', '"version":2,"vers\\u0069on":1'),
    ],
    ["deck format", encode({ type: "deck" })],
    ["spell format", encode({ type: "custom-spells" })],
    ["missing version", encode({ ...emptyBackup(), version: undefined })],
    ["fractional version", encode({ ...emptyBackup(), version: 1.5 })],
    ["newer version", encode({ ...emptyBackup(), version: 2 })],
    ["missing section", encode({ ...emptyBackup(), customSpells: undefined })],
    ["unknown field", encode({ ...emptyBackup(), generation: "invalid" })],
    [
      "bad relationship",
      encode({ ...emptyBackup(), activeDeck: { ...createEmptyActiveDeck(), savedDeckId: "x" } }),
    ],
    [
      "bad fit mode",
      encode({
        ...emptyBackup(),
        activeDeck: { ...createEmptyActiveDeck(), entries: [{ ...entry, fitMode: "unknown" }] },
      }),
    ],
    [
      "duplicate entry",
      encode({
        ...emptyBackup(),
        activeDeck: {
          ...createEmptyActiveDeck(),
          entries: [entry, { ...entry, spellId: "other" }],
        },
      }),
    ],
    [
      "duplicate spell reference",
      encode({
        ...emptyBackup(),
        activeDeck: {
          ...createEmptyActiveDeck(),
          entries: [entry, { ...entry, entryId: "other" }],
        },
      }),
    ],
    [
      "duplicate custom definition",
      encode({ ...emptyBackup(), customSpells: [makeCustomSpell(), makeCustomSpell()] }),
    ],
    [
      "duplicate override",
      encode({
        ...emptyBackup(),
        srdSpellOverrides: [
          { ...override, updatedAt: 1 },
          { ...override, updatedAt: 2 },
        ],
      }),
    ],
    [
      "unsupported nested field",
      encode({
        ...emptyBackup(),
        customSpells: [
          { ...makeCustomSpell(), components: { ...canonical.components, unknown: true } },
        ],
      }),
    ],
  ])("rejects %s before review", async (_, text) => {
    const before = await readCollectionSnapshot();
    await expect(reviewCompleteBackup(text, loadContext)).rejects.toThrow();
    expect(await readCollectionSnapshot()).toStrictEqual(before);
  });

  it("reports every incompatible override and keeps the destination intact", async () => {
    const backup = emptyBackup();
    backup.srdSpellOverrides = [
      { ...override, spellId: "srd-unknown", updatedAt: 5 },
      { ...override, locale: "xx", updatedAt: 10 },
      { ...override, locale: "de", updatedAt: 2 },
    ];
    const before = await readCollectionSnapshot();
    await expect(
      reviewCompleteBackup(encode(backup), async () => ({
        ...context,
        srdSpellsById: new Map([
          [canonical.id, { ...canonical, components: { ...canonical.components, verbal: false } }],
        ]),
      })),
    ).rejects.toMatchObject({
      descriptor: { key: "backup.incompatibleOverrides" },
      issues: [
        { key: "backup.overrideIdentity", values: { locale: "en", spellId: "srd-unknown" } },
        { key: "error.srdOverrideUnknownSpell" },
        { key: "backup.overrideIdentity", values: { locale: "xx", spellId: canonical.id } },
        { key: "error.srdOverrideUnsupportedLocale" },
        { key: "error.srdOverrideNoVerbal" },
        { key: "backup.overrideIdentity", values: { locale: "de", spellId: canonical.id } },
        { key: "error.srdOverrideNoVerbal" },
      ],
    });
    expect(await readCollectionSnapshot()).toStrictEqual(before);
  });

  it("allows validation to be retried after the bundled catalog becomes available", async () => {
    const backup = { ...emptyBackup(), srdSpellOverrides: [{ ...override, updatedAt: 15 }] };
    const { configureDataFetch, clearDataCache } = await import("@/services/data/load.ts");
    const before = await readCollectionSnapshot();
    clearDataCache();
    configureDataFetch(async () => {
      throw new Error("Offline cache unavailable");
    });
    try {
      await expect(reviewCompleteBackup(encode(backup))).rejects.toMatchObject({
        descriptor: { key: "backup.catalogUnavailable" },
      });
      expect(await readCollectionSnapshot()).toStrictEqual(before);
      configureDataFetch(
        async (url) =>
          new Response(
            JSON.stringify(
              url === "/spell-languages.json"
                ? [{ code: "en", displayName: "English", dataset: "/spells.srd.json" }]
                : [canonical],
            ),
          ),
      );
      await expect(reviewCompleteBackup(encode(backup))).resolves.toMatchObject({ overrides: 1 });
    } finally {
      configureDataFetch(null);
      clearDataCache();
    }
  });
});

describe("complete backup transactions", () => {
  it("replaces overlapping records and removes destination-only records", async () => {
    const matching = makeCustomSpell({ sourceLabel: "Destination-only field" });
    await putCustomSpell(matching);
    await putCustomSpell(makeCustomSpell({ id: "destination-only" }));
    await saveNewDeck(0, "Destination-only deck");
    await putSrdOverride(override, context);
    const before = await readCollectionSnapshot();
    const replacement = { ...matching, name: "Backed-up name" };
    delete replacement.sourceLabel;
    const backup = { ...emptyBackup(), customSpells: [replacement] };
    const pending = await review(backup);
    expect(await readCollectionSnapshot()).toStrictEqual(before);
    await pending.commit();
    expect((await readCollectionSnapshot()).collection).toStrictEqual({
      activeDeck: backup.activeDeck,
      savedDecks: [],
      customSpells: [replacement],
      srdSpellOverrides: [],
    });
  });

  it.each(["AbortError", "QuotaExceededError"])(
    "rolls back all stores and metadata on %s after replacement begins",
    async (name) => {
      await putCustomSpell(makeCustomSpell());
      await saveNewDeck(0, "Previous deck");
      await putSrdOverride(override, context);
      const before = await readCollectionSnapshot();
      const backup = emptyBackup();
      backup.customSpells = [makeCustomSpell({ id: "replacement" })];
      const pending = await review(backup);
      const failWrite = () => {
        throw new DOMException("Injected write failure", name);
      };
      db.srdSpellOverrides.hook("creating", failWrite);
      backup.srdSpellOverrides = [{ ...override, updatedAt: 9 }];
      const withOverride = await review(backup);
      const error = await withOverride.commit().catch((error: unknown) => error);
      expect(backupFailure(error, "backup.restoreFailed").key).toBe(
        name === "QuotaExceededError" ? "backup.quotaExceeded" : "backup.restoreFailed",
      );
      db.srdSpellOverrides.hook.creating.unsubscribe(failWrite);
      db.close();
      expect(await readCollectionSnapshot()).toStrictEqual(before);
      // The earlier confirmation's token is still valid after the failed transaction.
      await pending.commit();
      expect((await readCollectionSnapshot()).collection).toMatchObject({
        savedDecks: [],
        srdSpellOverrides: [],
      });
    },
  );

  it("never downloads a partial backup when reading or serializing fails", async () => {
    const download = vi.spyOn(downloads, "downloadText").mockImplementation(() => {});
    const read = vi.spyOn(db.savedDecks, "toArray").mockRejectedValueOnce(new Error("read failed"));
    await expect(exportCompleteBackup()).rejects.toThrow("read failed");
    read.mockRestore();
    const stringify = vi.spyOn(JSON, "stringify").mockImplementationOnce(() => {
      throw new RangeError("string too large");
    });
    await expect(exportCompleteBackup()).rejects.toThrow("string too large");
    stringify.mockRestore();
    expect(download).not.toHaveBeenCalled();
  });

  it("exports a consistent pair of records during concurrent cross-store writes", async () => {
    await putCustomSpell(makeCustomSpell());
    const download = vi.spyOn(downloads, "downloadText").mockImplementation(() => {});
    const write = db.transaction("rw", db.customSpells, db.activeDeck, async () => {
      await db.customSpells.clear();
      await db.activeDeck.put({ ...createEmptyActiveDeck(), name: "Updated" });
    });
    await Promise.all([write, exportCompleteBackup()]);
    const exported = parseCompleteBackup(download.mock.calls[0][1]);
    expect([exported.activeDeck.name, exported.customSpells.length]).toEqual(
      exported.activeDeck.name ? ["Updated", 0] : ["", 1],
    );
  });

  it("invalidates review after each store changes, even when values return to their previous state", async () => {
    const actions = [
      () => getActiveDeck(),
      () => renameActiveDeck(0, "Changed"),
      () => saveNewDeck(1, "Snapshot"),
      () => putCustomSpell(makeCustomSpell()),
      () => putSrdOverride(override, context),
      () => deleteSrdOverride(canonical.id, "en"),
    ];
    for (const action of actions) {
      const pending = await review();
      await action();
      const changed = await readCollectionSnapshot();
      await expect(pending.commit()).rejects.toMatchObject({
        descriptor: { key: "backup.staleReview" },
      });
      expect(await readCollectionSnapshot()).toStrictEqual(changed);
    }
    const pending = await review();
    const saved = (await listSavedDecks())[0];
    await deleteSavedDeck(2, saved.id, saved.revision);
    await expect(pending.commit()).rejects.toMatchObject({
      descriptor: { key: "backup.staleReview" },
    });
    const beforeRoundTrip = await review();
    await putSrdOverride(override, context);
    await deleteSrdOverride(canonical.id, "en");
    await expect(beforeRoundTrip.commit()).rejects.toMatchObject({
      descriptor: { key: "backup.staleReview" },
    });
  });

  it("allows only one concurrent restore from a review of the same state", async () => {
    const [a, b] = await Promise.all([review(), review()]);
    const results = await Promise.allSettled([a.commit(), b.commit()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("rejects all stale mutation paths even when IDs and revisions survive an identical restore", async () => {
    const spell = makeCustomSpell();
    await putCustomSpell(spell);
    const snapshot = (await saveNewDeck(0, "Snapshot")).savedDeck;
    const deletion = (await deleteCustomSpell(1, spell.id))!;
    const { metadata, collection } = await readCollectionSnapshot();
    const generation = metadata.generation;
    const revision = collection.activeDeck.revision;
    const backup = { ...emptyBackup(), ...collection };
    const waitingRestore = await review(backup);
    await waitingRestore.commit();
    const deckPlan = { name: "Import", entries: [], removedDuplicates: 0 };
    const customPlan = { entries: [], remaps: [], collisions: [], overrides: [] };
    const actions = [
      () => getActiveDeck(generation),
      () => mutateActiveDeck(revision, (deck) => ({ ...deck, name: "Stale" }), [], generation),
      () => renameActiveDeck(revision, "Stale", generation),
      () => saveNewDeck(revision, "Stale", generation),
      () => saveAssociatedDeck(revision, generation),
      () => loadSavedDeck(revision, snapshot.id, generation),
      () => deleteSavedDeck(revision, snapshot.id, snapshot.revision, generation),
      () => newActiveDeck(revision, generation),
      () => putCustomSpell(spell, generation),
      () => updateCustomSpell(spell, generation),
      () => duplicateCustomSpell(spell.id, generation),
      () => deleteCustomSpell(revision, spell.id, generation),
      () => restoreDeletedSpell(deletion, revision),
      () => putSrdOverride(override, context, generation),
      () => putSrdOverride({ ...override, verbalDescription: "" }, context, generation),
      () => deleteSrdOverride(canonical.id, "en", generation),
      () => applyDeckImport(deckPlan, revision, generation),
      () => applyCustomImport(customPlan, "overwrite", new Map(), generation),
    ];
    const committed = await readCollectionSnapshot();
    for (const action of actions)
      await expect(action()).rejects.toBeInstanceOf(CollectionChangedError);
    expect(await readCollectionSnapshot()).toStrictEqual(committed);
    await expect(putCustomSpell(spell, committed.metadata.generation)).resolves.toMatchObject({
      id: spell.id,
    });
  });

  it("blocks legacy connections and prevents an old Dexie build from modifying restored stores", async () => {
    await db.delete();
    const legacy = new Dexie(DATABASE_NAME);
    legacy.version(5).stores({
      activeDeck: "id",
      savedDecks: "id, updatedAt",
      customSpells: "id, name, updatedAt",
      srdSpellOverrides: "[spellId+locale], spellId, locale",
    });
    legacy.on("versionchange", () => false);
    const spell = makeCustomSpell();
    await legacy.table("customSpells").add(spell);
    try {
      await expect(review()).rejects.toMatchObject({
        descriptor: { key: "error.storageUpgradeBlocked" },
      });
      expect(await legacy.table("customSpells").get(spell.id)).toStrictEqual(spell);
      legacy.close();
      await db.open();
      expect((await readCollectionSnapshot()).collection.customSpells).toStrictEqual([spell]);
      const backup = { ...emptyBackup(), customSpells: [spell] };
      await (await review(backup)).commit();
      await legacy.open();
      await expect(
        legacy.table("customSpells").put({ ...spell, name: "Legacy edit" }),
      ).rejects.toMatchObject({ name: "DataError" });
      expect((await readCollectionSnapshot()).collection.customSpells).toStrictEqual([spell]);
    } finally {
      legacy.close();
    }
  });
});
