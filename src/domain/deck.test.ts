import { describe, expect, it } from "vite-plus/test";
import {
  createEmptyActiveDeck,
  deckEntriesEqual,
  deckMatchesBaseline,
  isDeckDirty,
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
});
