import { describe, expect, it } from "vite-plus/test";
import {
  createEmptyActiveDeck,
  deckEntriesEqual,
  deckMatchesBaseline,
  dedupeDeckEntries,
  getDeckStatus,
  hasSpellEntry,
  isDeckDirty,
  isValidDeckName,
  normalizeDeckName,
  type ActiveDeckRecord,
  type DeckEntry,
} from "@/domain/deck";

function entry(overrides: Partial<DeckEntry> = {}): DeckEntry {
  return {
    entryId: "entry-1",
    spellId: "srd-fireball",
    fitMode: "auto-shrink",
    reference: { source: "SRD-5.2.1", name: "Fireball" },
    ...overrides,
  };
}

describe("deck entry uniqueness", () => {
  it("keeps the first entry for each spell while preserving order", () => {
    const first = entry({ entryId: "a-1" });
    const second = entry({ entryId: "b-1", spellId: "srd-shield" });
    const duplicate = entry({ entryId: "a-2" });
    expect(dedupeDeckEntries([first, second, duplicate])).toEqual([first, second]);
  });

  it("detects whether a spell is already in a deck", () => {
    expect(hasSpellEntry([entry()], "srd-fireball")).toBe(true);
    expect(hasSpellEntry([entry()], "srd-shield")).toBe(false);
  });
});

describe("deck baseline and dirty rules", () => {
  it("treats an empty unnamed deck with null baseline as clean", () => {
    const deck = createEmptyActiveDeck();
    expect(deckMatchesBaseline(deck)).toBe(true);
    expect(isDeckDirty(deck)).toBe(false);
  });

  it("treats null baseline with a name as dirty", () => {
    const deck: ActiveDeckRecord = { ...createEmptyActiveDeck(), name: "Named" };
    expect(isDeckDirty(deck)).toBe(true);
  });

  it("treats null baseline with entries as dirty", () => {
    const deck: ActiveDeckRecord = { ...createEmptyActiveDeck(), entries: [entry()] };
    expect(isDeckDirty(deck)).toBe(true);
  });

  it("ignores revision when comparing to baseline", () => {
    const entries = [entry()];
    const deck: ActiveDeckRecord = {
      ...createEmptyActiveDeck(),
      name: "Deck",
      entries,
      revision: 42,
      baseline: { name: "Deck", entries },
    };
    expect(isDeckDirty(deck)).toBe(false);
  });

  it("is dirty when entry order changes", () => {
    const a = entry({ entryId: "a" });
    const b = entry({ entryId: "b" });
    const deck: ActiveDeckRecord = {
      ...createEmptyActiveDeck(),
      name: "Deck",
      entries: [b, a],
      baseline: { name: "Deck", entries: [a, b] },
    };
    expect(isDeckDirty(deck)).toBe(true);
  });

  it("compares reference, fit mode, spell and entry ids", () => {
    const base = entry();
    expect(deckEntriesEqual([base], [entry()])).toBe(true);
    expect(deckEntriesEqual([base], [entry({ fitMode: "multi-card" })])).toBe(false);
    expect(deckEntriesEqual([base], [entry({ spellId: "srd-other" })])).toBe(false);
    expect(
      deckEntriesEqual([base], [entry({ reference: { source: "Custom", name: "Fireball" } })]),
    ).toBe(false);
    expect(deckEntriesEqual([base], [entry({ entryId: "entry-2" })])).toBe(false);
  });

  it("ignores the saved revision token when computing dirty state", () => {
    const entries = [entry()];
    const deck: ActiveDeckRecord = {
      ...createEmptyActiveDeck(),
      name: "Deck",
      savedDeckId: "saved-1",
      entries,
      baseline: { name: "Deck", entries, savedRevision: 7 },
    };
    expect(isDeckDirty(deck)).toBe(false);
  });
});

describe("deck status matrix", () => {
  it("reports a clean associated deck as saved", () => {
    const entries = [entry()];
    const deck: ActiveDeckRecord = {
      ...createEmptyActiveDeck(),
      name: "Deck",
      savedDeckId: "saved-1",
      entries,
      baseline: { name: "Deck", entries, savedRevision: 1 },
    };
    expect(getDeckStatus(deck)).toBe("saved");
  });

  it("reports a modified associated deck as unsaved", () => {
    const entries = [entry()];
    const deck: ActiveDeckRecord = {
      ...createEmptyActiveDeck(),
      name: "Renamed",
      savedDeckId: "saved-1",
      entries,
      baseline: { name: "Deck", entries, savedRevision: 1 },
    };
    expect(getDeckStatus(deck)).toBe("unsaved");
  });

  it("reports populated unassociated content as not saved", () => {
    const named = { ...createEmptyActiveDeck(), name: "Working" };
    expect(getDeckStatus(named)).toBe("not-saved");
    const populated = { ...createEmptyActiveDeck(), entries: [entry()] };
    expect(getDeckStatus(populated)).toBe("not-saved");
  });

  it("reports an empty unnamed unassociated deck as empty", () => {
    expect(getDeckStatus(createEmptyActiveDeck())).toBe("empty");
  });

  it("reports inconsistent association and baseline combinations as invalid", () => {
    const associatedWithoutBaseline: ActiveDeckRecord = {
      ...createEmptyActiveDeck(),
      name: "Deck",
      savedDeckId: "saved-1",
    };
    expect(getDeckStatus(associatedWithoutBaseline)).toBe("invalid");

    const entries = [entry()];
    const associatedWithoutToken: ActiveDeckRecord = {
      ...createEmptyActiveDeck(),
      name: "Deck",
      savedDeckId: "saved-1",
      entries,
      baseline: { name: "Deck", entries },
    };
    expect(getDeckStatus(associatedWithoutToken)).toBe("invalid");

    const unassociatedWithBaseline: ActiveDeckRecord = {
      ...createEmptyActiveDeck(),
      name: "Deck",
      entries,
      baseline: { name: "Deck", entries },
    };
    expect(getDeckStatus(unassociatedWithBaseline)).toBe("invalid");
  });
});

describe("deck name validation", () => {
  it("trims names", () => {
    expect(normalizeDeckName("  Deck  ")).toBe("Deck");
  });

  it("requires a nonempty name for associated decks", () => {
    expect(isValidDeckName("", { associated: true })).toBe(false);
    expect(isValidDeckName("   ", { associated: true })).toBe(false);
    expect(isValidDeckName("Deck", { associated: true })).toBe(true);
  });

  it("allows the empty name for unassociated decks", () => {
    expect(isValidDeckName("", { associated: false })).toBe(true);
    expect(isValidDeckName("   ", { associated: false })).toBe(true);
  });

  it("rejects names longer than 120 characters after trimming", () => {
    expect(isValidDeckName("x".repeat(120), { associated: false })).toBe(true);
    expect(isValidDeckName("x".repeat(121), { associated: false })).toBe(false);
    expect(isValidDeckName(`  ${"x".repeat(121)}  `, { associated: false })).toBe(false);
  });
});
