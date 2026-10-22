import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Spell } from "@/domain/spells";
import { makeSpell } from "@/test/fixtures/spells.ts";
import { DetailsPane } from "./DetailsPane.tsx";

const holder = vi.hoisted(() => ({ spell: null as Spell | null }));

vi.mock("@/state/AppProvider.tsx", () => ({
  useApp: () => ({
    selectedSpell: holder.spell,
    activeDeck: null,
    language: "en",
    addSpellToDeck: () => Promise.resolve(),
    duplicateSpell: () => Promise.resolve(),
    deleteSpell: () => Promise.resolve(true),
    canUndo: false,
    undoDelete: () => Promise.resolve(true),
  }),
}));

vi.mock("@/cards/fit.tsx", () => ({
  useCardFit: () => ({ result: null, error: null, measureLayer: null }),
  AUTO_SHRINK_MIN_PT: 5,
}));

beforeEach(() => {
  holder.spell = makeSpell();
});

describe("DetailsPane subclasses row", () => {
  it("renders localized labels for catalog and reference-only subclasses", () => {
    holder.spell = makeSpell({ subclasses: ["Cleric: War Domain", "Cleric: Arcana"] });
    render(<DetailsPane />);
    expect(screen.getByText("Subclasses")).not.toBeNull();
    expect(screen.getByText("War Domain, Arcana")).not.toBeNull();
  });

  it("renders an em dash when the spell has no subclasses", () => {
    holder.spell = makeSpell();
    render(<DetailsPane />);
    const value = screen.getByText("Subclasses").nextElementSibling;
    expect(value?.textContent).toBe("\u2014");
  });
});
