import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import type { Spell } from "@/domain/spells";
import { makeSpell } from "@/test/fixtures/spells.ts";
import { DetailsPane } from "./DetailsPane.tsx";

interface FitResultStub {
  pages: unknown[][];
  fontPt: number;
  truncated: boolean;
  overflow: boolean;
}

const holder = vi.hoisted(() => ({
  spell: null as Spell | null,
  addSpellToDeck: vi.fn(),
  canUndo: false,
  undoDelete: vi.fn(),
  fit: null as FitResultStub | null,
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
  useCardFit: () => ({ result: holder.fit, error: null, measureLayer: null }),
  AUTO_SHRINK_MIN_PT: 5,
}));

beforeEach(() => {
  holder.spell = makeSpell();
  holder.addSpellToDeck.mockReset().mockResolvedValue("added");
  holder.canUndo = false;
  holder.undoDelete.mockReset().mockResolvedValue(true);
  holder.fit = null;
  toastMock.info.mockReset();
});

afterEach(async () => {
  await i18n.changeLanguage("en");
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

describe("DetailsPane preview-only default layout", () => {
  it("renders the persistent Show details button", () => {
    render(<DetailsPane />);
    expect(screen.getByRole("button", { name: "Show details" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "More actions" })).not.toBeNull();
  });

  it("does not duplicate metadata or description in the default layout", () => {
    holder.fit = {
      pages: [[]],
      fontPt: 8.5,
      truncated: false,
      overflow: false,
    };
    const { container } = render(<DetailsPane />);

    expect(screen.getByText("1 physical card at 8.5pt.")).not.toBeNull();
    expect(container.querySelector(".spell-details-content")).toBeNull();
    expect(screen.queryByText("Subclasses")).toBeNull();
    expect(screen.queryByText("A test spell.")).toBeNull();
  });

  it("remounts the card preview when the selected spell changes so the reveal animation restarts", () => {
    holder.spell = makeSpell({ id: "srd-fireball", name: "Fireball" });
    holder.fit = {
      pages: [[]],
      fontPt: 8.5,
      truncated: false,
      overflow: false,
    };
    const { container, rerender } = render(<DetailsPane />);
    const first = container.querySelector(".card-preview-page");
    expect(first).not.toBeNull();

    holder.spell = makeSpell({ id: "srd-light", name: "Light" });
    rerender(<DetailsPane />);

    const second = container.querySelector(".card-preview-page");
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  it("opens the details dialog without mutating deck state", async () => {
    holder.spell = makeSpell({
      id: "srd-fireball",
      name: "Fireball",
      description: ["A test spell."],
    });
    const user = userEvent.setup();
    render(<DetailsPane />);

    await user.click(screen.getByRole("button", { name: "Show details" }));

    const dialog = screen.getByRole("dialog", { name: "Fireball" });
    expect(within(dialog).getByText("A test spell.")).not.toBeNull();
    expect(holder.addSpellToDeck).not.toHaveBeenCalled();
  });

  it("closes the dialog when the selected spell changes and shows the new spell", async () => {
    holder.spell = makeSpell({
      id: "srd-fireball",
      name: "Fireball",
      description: ["First spell."],
    });
    const user = userEvent.setup();
    const { rerender } = render(<DetailsPane />);

    await user.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByRole("dialog", { name: "Fireball" })).not.toBeNull();

    holder.spell = makeSpell({ id: "srd-light", name: "Light", description: ["Second spell."] });
    rerender(<DetailsPane />);

    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show details" }));
    const dialog = screen.getByRole("dialog", { name: "Light" });
    expect(within(dialog).getByText("Second spell.")).not.toBeNull();
    expect(within(dialog).queryByText("First spell.")).toBeNull();
  });

  it("does not open details from a single click on the card", async () => {
    holder.fit = {
      pages: [[]],
      fontPt: 8.5,
      truncated: false,
      overflow: false,
    };
    const user = userEvent.setup();
    const { container } = render(<DetailsPane />);

    const card = container.querySelector(".spell-card");
    expect(card).not.toBeNull();
    await user.click(card as HTMLElement);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("menuitem")).toBeNull();
  });
});

describe("DetailsPane card actions menu", () => {
  it("exposes Show details and Edit from the ellipsis dropdown", async () => {
    const user = userEvent.setup();
    render(<DetailsPane />);

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Show details" })).not.toBeNull();

    await user.click(screen.getByRole("menuitem", { name: "Show details" }));
    expect(screen.getByRole("dialog", { name: "Test Spell" })).not.toBeNull();
  });

  it("opens the existing edit flow from the ellipsis dropdown", async () => {
    const user = userEvent.setup();
    render(<DetailsPane />);

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(screen.getByRole("dialog", { name: "Edit custom spell" })).not.toBeNull();
  });

  it("opens the same actions from the preview context menu", async () => {
    const user = userEvent.setup();
    const { container } = render(<DetailsPane />);

    fireEvent.contextMenu(container.querySelector(".card-preview-frame") as HTMLElement, {
      clientX: 20,
      clientY: 20,
    });

    const showDetails = await screen.findByRole("menuitem", { name: "Show details" });
    expect(screen.getByRole("menuitem", { name: "Edit" })).not.toBeNull();

    await user.click(showDetails);
    expect(screen.getByRole("dialog", { name: "Test Spell" })).not.toBeNull();
  });
});

describe("DetailsPane dialog content", () => {
  it("renders localized labels for catalog and reference-only subclasses", async () => {
    holder.spell = makeSpell({ subclasses: ["Cleric: War Domain", "Cleric: Arcana"] });
    const user = userEvent.setup();
    render(<DetailsPane />);

    await user.click(screen.getByRole("button", { name: "Show details" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Subclasses")).not.toBeNull();
    expect(within(dialog).getByText("War Domain, Arcana")).not.toBeNull();
  });

  it("renders an em dash when the spell has no subclasses", async () => {
    holder.spell = makeSpell();
    const user = userEvent.setup();
    render(<DetailsPane />);

    await user.click(screen.getByRole("button", { name: "Show details" }));
    const dialog = screen.getByRole("dialog");
    const value = within(dialog).getByText("Subclasses").nextElementSibling;
    expect(value?.textContent).toBe("\u2014");
  });

  it("renders component descriptions", async () => {
    holder.spell = makeSpell({
      components: {
        verbal: true,
        verbalDescription: "Speak the word",
        somatic: true,
        somaticDescription: "Trace a sigil",
        material: false,
      },
    });
    const user = userEvent.setup();
    render(<DetailsPane />);

    await user.click(screen.getByRole("button", { name: "Show details" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("ⓥ Speak the word")).not.toBeNull();
    expect(within(dialog).getByText("ⓢ Trace a sigil")).not.toBeNull();
  });

  it("renders the material detail line from description, cost and consumed", async () => {
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
    const user = userEvent.setup();
    render(<DetailsPane />);

    await user.click(screen.getByRole("button", { name: "Show details" }));
    expect(
      within(screen.getByRole("dialog")).getByText("A ruby (100 gp, consumed)"),
    ).not.toBeNull();
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

describe("DetailsPane fit notices", () => {
  it("explains truncation and points to multi-card mode", () => {
    holder.fit = {
      pages: [[]],
      fontPt: 6,
      truncated: true,
      overflow: false,
    };
    render(<DetailsPane />);
    expect(
      screen.getByText(
        "Description truncated to fit on one card at 5pt. Switch to multi-card mode to display the full description.",
      ),
    ).not.toBeNull();
  });

  it("shows no truncation notice when the content fits", () => {
    holder.fit = {
      pages: [[]],
      fontPt: 8.5,
      truncated: false,
      overflow: false,
    };
    render(<DetailsPane />);
    expect(screen.queryByText(/Description truncated/)).toBeNull();
  });

  it("keeps the blocking notice when the continuation limit is exceeded", () => {
    holder.fit = {
      pages: [[], []],
      fontPt: 8,
      truncated: false,
      overflow: true,
    };
    render(<DetailsPane />);
    expect(screen.getByText(/cannot be printed/)).not.toBeNull();
  });
});

describe("DetailsPane SRD editing and source", () => {
  it("offers Edit for SRD spells while keeping Duplicate/Delete custom-only", () => {
    holder.spell = makeSpell();
    render(<DetailsPane />);
    expect(screen.getByRole("button", { name: /Edit/ })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Duplicate/ })).toBeNull();
  });

  it("marks an overridden SRD spell with an asterisk", () => {
    holder.spell = makeSpell({ overridden: true });
    render(<DetailsPane />);
    expect(screen.getByText("SRD 5.2.1 *")).not.toBeNull();
  });
});
