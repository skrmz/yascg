import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Spell } from "@/domain/spells";
import { makeSpell } from "@/test/fixtures/spells.ts";
import { DetailsPane } from "./DetailsPane.tsx";

const holder = vi.hoisted(() => ({
  spell: null as Spell | null,
  addSpellToDeck: vi.fn(),
  canUndo: false,
  undoDelete: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/state/AppProvider.tsx", () => ({
  useApp: () => ({
    selectedSpell: holder.spell,
    activeDeck: null,
    language: "en",
    manifest: [],
    englishById: new Map(),
    srdSpellOverrides: [],
    addSpellToDeck: holder.addSpellToDeck,
    duplicateSpell: () => Promise.resolve(),
    deleteSpell: () => Promise.resolve(true),
    saveCustomSpell: () => Promise.resolve(null),
    saveSrdOverride: () => Promise.resolve(null),
    resetSrdOverride: () => Promise.resolve(true),
    selectSpell: () => {},
    canUndo: holder.canUndo,
    undoDelete: holder.undoDelete,
  }),
}));

vi.mock("@/cards/fit.tsx", () => ({
  useCardFit: () => ({ result: null, error: null, measureLayer: null }),
  AUTO_SHRINK_MIN_PT: 5,
}));

beforeEach(() => {
  holder.spell = makeSpell();
  holder.addSpellToDeck.mockReset().mockResolvedValue("added");
  holder.canUndo = false;
  holder.undoDelete.mockReset().mockResolvedValue(true);
  toastMock.info.mockReset();
});

describe("DetailsPane empty selection", () => {
  it("keeps the placeholder without offering custom spell creation", () => {
    holder.spell = null;
    render(<DetailsPane />);
    expect(screen.getByText("Select a spell to preview its card and details.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /New custom spell/ })).toBeNull();
  });

  it("still offers Undo delete for a pending deletion", async () => {
    holder.spell = null;
    holder.canUndo = true;
    const user = userEvent.setup();
    render(<DetailsPane />);

    await user.click(screen.getByRole("button", { name: "Undo delete" }));

    expect(holder.undoDelete).toHaveBeenCalledTimes(1);
  });
});

describe("DetailsPane deck additions", () => {
  it("shows a toast when the selected spell is already in the active deck", async () => {
    holder.spell = makeSpell({ id: "srd-fireball", name: "Fireball" });
    holder.addSpellToDeck.mockResolvedValueOnce("duplicate");
    const user = userEvent.setup();
    render(<DetailsPane />);

    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(toastMock.info).toHaveBeenCalledWith("Already in deck", {
      description: "Fireball is already in the active deck.",
    });
  });
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

describe("DetailsPane SRD editing and component text", () => {
  it("offers Edit for SRD spells while keeping Duplicate/Delete custom-only", () => {
    holder.spell = makeSpell();
    render(<DetailsPane />);
    expect(screen.getByRole("button", { name: /Edit/ })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Duplicate/ })).toBeNull();
  });

  it("renders component descriptions in the textual section", () => {
    holder.spell = makeSpell({
      components: {
        verbal: true,
        verbalDescription: "Speak the word",
        somatic: true,
        somaticDescription: "Trace a sigil",
        material: false,
      },
    });
    render(<DetailsPane />);
    expect(screen.getByText("ⓥ Speak the word")).not.toBeNull();
    expect(screen.getByText("ⓢ Trace a sigil")).not.toBeNull();
  });

  it("marks an overridden SRD spell with an asterisk", () => {
    holder.spell = makeSpell({ overridden: true });
    render(<DetailsPane />);
    expect(screen.getByText("SRD 5.2.1 *")).not.toBeNull();
  });

  it("renders the material detail line from description, cost and consumed", () => {
    holder.spell = makeSpell({
      components: {
        verbal: false,
        somatic: false,
        material: true,
        materialDescription: "A ruby",
        materialCost: "100 gp",
        materialConsumed: true,
      },
    });
    render(<DetailsPane />);
    expect(screen.getByText("A ruby (100 gp, consumed)")).not.toBeNull();
  });
});
