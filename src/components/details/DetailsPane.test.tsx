import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import type { Spell } from "@/domain/spells";
import { createEmptyActiveDeck, type ActiveDeckRecord } from "@/domain/deck";
import { makeEntry } from "@/db/active-deck.ts";
import { makeCustomSpell, makeSpell } from "@/test/fixtures/spells.ts";
import { CARD_BACKGROUNDS } from "@/cards/backgrounds.ts";
import { TooltipProvider } from "@/ui/Tooltip.tsx";
import { DetailsPane } from "./DetailsPane.tsx";

interface FitResultStub {
  pages: unknown[][];
  fontPt: number;
  truncated: boolean;
  overflow: boolean;
  overflowReason?: "continuation-limit" | "notes" | "table";
}

const holder = vi.hoisted(() => ({
  spell: null as Spell | null,
  activeDeck: null as ActiveDeckRecord | null,
  addSpellToDeck: vi.fn(),
  canUndo: false,
  undoDelete: vi.fn(),
  fit: null as FitResultStub | null,
  presentation: null as unknown,
  cardDesign: "classic" as "classic" | "compact",
  cardBackground: "none" as string,
  selectSpell: vi.fn(),
  saveCustomSpell: vi.fn(),
  replaceDeckEntryWithCopy: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/state/AppProvider.tsx", () => ({
  useApp: () => ({
    selectedSpell: holder.spell,
    activeDeck: holder.activeDeck,
    language: "en",
    cardDesign: holder.cardDesign,
    cardBackground: holder.cardBackground,
    manifest: [],
    englishById: new Map(),
    srdSpellOverrides: [],
    addSpellToDeck: holder.addSpellToDeck,
    duplicateSpell: () => Promise.resolve(),
    deleteSpell: () => Promise.resolve(true),
    saveCustomSpell: holder.saveCustomSpell,
    saveSrdOverride: () => Promise.resolve(null),
    resetSrdOverride: () => Promise.resolve(true),
    selectSpell: holder.selectSpell,
    replaceDeckEntryWithCopy: holder.replaceDeckEntryWithCopy,
    canUndo: holder.canUndo,
    undoDelete: holder.undoDelete,
  }),
}));

vi.mock("@/cards/fit.tsx", () => ({
  useCardFit: () => ({
    result: holder.fit,
    presentation: holder.presentation,
    error: null,
    measureLayer: null,
  }),
  AUTO_SHRINK_MIN_PT: 5,
}));

beforeEach(() => {
  holder.spell = makeSpell();
  holder.addSpellToDeck.mockReset().mockResolvedValue("added");
  holder.canUndo = false;
  holder.undoDelete.mockReset().mockResolvedValue(true);
  holder.fit = null;
  holder.presentation = null;
  holder.cardDesign = "classic";
  holder.cardBackground = "none";
  holder.activeDeck = null;
  holder.selectSpell.mockReset();
  holder.saveCustomSpell.mockReset().mockResolvedValue(null);
  holder.replaceDeckEntryWithCopy.mockReset().mockResolvedValue({ status: "replaced" });
  toastMock.info.mockReset();
  toastMock.success.mockReset();
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
    expect(screen.getByRole("button", { name: "Edit" })).not.toBeNull();
  });

  it("opens the edit flow from the header action bar", async () => {
    const user = userEvent.setup();
    render(<DetailsPane />);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("dialog", { name: "Edit custom spell" })).not.toBeNull();
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

  it("applies the selected card background to the preview", () => {
    const background = CARD_BACKGROUNDS[0].id;
    holder.cardBackground = background;
    holder.fit = {
      pages: [[]],
      fontPt: 8.5,
      truncated: false,
      overflow: false,
    };
    const { container } = render(<DetailsPane />);
    expect(
      container.querySelector(`.card-preview-page[data-card-background="${background}"]`),
    ).not.toBeNull();
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
    expect(within(dialog).getByText("Speak the word")).not.toBeNull();
    expect(within(dialog).getByText("Trace a sigil")).not.toBeNull();
    expect(within(dialog).getByLabelText("Verbal").textContent).toBe("V");
    expect(within(dialog).getByLabelText("Somatic").textContent).toBe("S");
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
  it("explains truncation and points to automatic or multi-card mode", () => {
    holder.fit = {
      pages: [[]],
      fontPt: 6,
      truncated: true,
      overflow: false,
    };
    render(<DetailsPane />);
    expect(
      screen.getByText(
        "Description truncated to fit on one card at 5pt. Switch to Best fit or multi-card mode to display the full description.",
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

  it("shows the notes-specific overflow warning", () => {
    holder.fit = {
      pages: [[]],
      fontPt: 6,
      truncated: false,
      overflow: true,
      overflowReason: "notes",
    };
    render(<DetailsPane />);
    expect(screen.getByText(/card notes cannot fit at the minimum size/)).not.toBeNull();
  });

  it("shows a table-specific overflow warning", () => {
    holder.fit = {
      pages: [[]],
      fontPt: 6,
      truncated: false,
      overflow: true,
      overflowReason: "table",
    };
    render(<DetailsPane />);
    expect(screen.getByText(/Markdown table is too large/)).not.toBeNull();
  });

  it("renders the preview with the selected compact design", () => {
    holder.cardDesign = "compact";
    holder.presentation = {
      displayCastingTime: "A",
      displayDuration: "Instantaneous",
      notes: [],
      blocks: [],
    };
    holder.fit = {
      pages: [[]],
      fontPt: 8.5,
      truncated: false,
      overflow: false,
    };
    const { container } = render(
      <TooltipProvider>
        <DetailsPane />
      </TooltipProvider>,
    );
    expect(container.querySelector(".spell-card-compact")).not.toBeNull();
  });
});

describe("DetailsPane editable SRD copies", () => {
  function makeDeck(spellId = "srd-test-spell"): ActiveDeckRecord {
    return {
      ...createEmptyActiveDeck(),
      name: "Deck A",
      revision: 5,
      entries: [makeEntry(spellId, "SRD-5.2.1", "Test Spell")],
    };
  }

  async function openCopyEditor(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Create editable copy" }));
    return screen.getByRole("dialog", { name: "Create editable copy" });
  }

  async function saveAndOpenConfirmation(
    user: ReturnType<typeof userEvent.setup>,
    name = "Test Spell",
  ) {
    await openCopyEditor(user);
    await user.click(screen.getByRole("button", { name: "Save spell" }));
    return screen.getByRole("dialog", { name: `Replace the deck entry with "${name}"?` });
  }

  it("hides the action for custom spells and SRD spells outside the active deck", () => {
    holder.spell = makeCustomSpell({ id: "custom-1" });
    holder.activeDeck = makeDeck("custom-1");
    const { rerender } = render(<DetailsPane />);
    expect(screen.queryByRole("button", { name: "Create editable copy" })).toBeNull();

    holder.spell = makeSpell({ id: "srd-other" });
    holder.activeDeck = makeDeck("srd-test-spell");
    rerender(<DetailsPane />);
    expect(screen.queryByRole("button", { name: "Create editable copy" })).toBeNull();
  });

  it("shows the action for an SRD spell present in the active deck", () => {
    holder.spell = makeSpell({ id: "srd-test-spell" });
    holder.activeDeck = makeDeck();
    render(<DetailsPane />);
    expect(screen.getByRole("button", { name: "Create editable copy" })).not.toBeNull();
  });

  it("cancelling the editor writes nothing", async () => {
    holder.spell = makeSpell({ id: "srd-test-spell" });
    holder.activeDeck = makeDeck();
    const user = userEvent.setup();
    render(<DetailsPane />);

    await openCopyEditor(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(holder.saveCustomSpell).not.toHaveBeenCalled();
    expect(holder.replaceDeckEntryWithCopy).not.toHaveBeenCalled();
  });

  it("does not open the confirmation when saving fails", async () => {
    holder.spell = makeSpell({ id: "srd-test-spell" });
    holder.activeDeck = makeDeck();
    holder.saveCustomSpell.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<DetailsPane />);

    await openCopyEditor(user);
    await user.click(screen.getByRole("button", { name: "Save spell" }));

    expect(screen.queryByRole("dialog", { name: /Replace the deck entry/ })).toBeNull();
    expect(holder.replaceDeckEntryWithCopy).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Create editable copy" })).not.toBeNull();
  });

  it("cancelling the confirmation keeps the copy and leaves the deck unchanged", async () => {
    holder.spell = makeSpell({ id: "srd-test-spell" });
    holder.activeDeck = makeDeck();
    const copy = makeCustomSpell({ id: "copy-1", name: "Test Spell" });
    holder.saveCustomSpell.mockResolvedValue(copy);
    const user = userEvent.setup();
    render(<DetailsPane />);

    await saveAndOpenConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(holder.replaceDeckEntryWithCopy).not.toHaveBeenCalled();
    expect(holder.selectSpell).toHaveBeenCalledWith("copy-1");
    expect(toastMock.info).toHaveBeenCalledWith(
      "The custom copy was saved. The active deck was not changed.",
    );
  });

  it("confirms the replacement with the captured deck state and selects the copy", async () => {
    holder.spell = makeSpell({ id: "srd-test-spell" });
    holder.activeDeck = makeDeck();
    const entryId = holder.activeDeck.entries[0].entryId;
    const copy = makeCustomSpell({ id: "copy-1", name: "Test Spell" });
    holder.saveCustomSpell.mockResolvedValue(copy);
    holder.replaceDeckEntryWithCopy.mockResolvedValue({ status: "replaced" });
    const user = userEvent.setup();
    render(<DetailsPane />);

    await saveAndOpenConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Replace entry" }));

    expect(holder.replaceDeckEntryWithCopy).toHaveBeenCalledWith(
      5,
      { name: "Deck A" },
      entryId,
      "srd-test-spell",
      { id: "copy-1", name: "Test Spell", source: "Custom" },
    );
    expect(holder.selectSpell).toHaveBeenCalledWith("copy-1");
    expect(toastMock.success).toHaveBeenCalledWith(
      "The active deck entry now uses your custom copy.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("submits only once when confirm is clicked twice", async () => {
    holder.spell = makeSpell({ id: "srd-test-spell" });
    holder.activeDeck = makeDeck();
    holder.saveCustomSpell.mockResolvedValue(makeCustomSpell({ id: "copy-1", name: "Test Spell" }));
    let resolveReplace: (value: { status: "replaced" }) => void = () => {};
    holder.replaceDeckEntryWithCopy.mockReturnValue(
      new Promise((resolve) => {
        resolveReplace = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<DetailsPane />);

    await saveAndOpenConfirmation(user);
    const confirm = screen.getByRole("button", { name: "Replace entry" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(holder.replaceDeckEntryWithCopy).toHaveBeenCalledTimes(1);
    resolveReplace({ status: "replaced" });
  });

  it("keeps the dialog open on a conflict and retries with the actual revision", async () => {
    holder.spell = makeSpell({ id: "srd-test-spell" });
    holder.activeDeck = makeDeck();
    holder.saveCustomSpell.mockResolvedValue(makeCustomSpell({ id: "copy-1", name: "Test Spell" }));
    holder.replaceDeckEntryWithCopy.mockResolvedValueOnce({
      status: "conflict",
      actualRevision: 9,
    });
    const user = userEvent.setup();
    render(<DetailsPane />);

    await saveAndOpenConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Replace entry" }));

    expect(screen.getByText(/The active deck changed before the replacement/)).not.toBeNull();

    holder.replaceDeckEntryWithCopy.mockResolvedValueOnce({ status: "replaced" });
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(holder.replaceDeckEntryWithCopy).toHaveBeenLastCalledWith(
      9,
      { name: "Deck A" },
      holder.activeDeck.entries[0].entryId,
      "srd-test-spell",
      { id: "copy-1", name: "Test Spell", source: "Custom" },
    );
    expect(holder.selectSpell).toHaveBeenCalledWith("copy-1");
  });

  it("does not offer retry when the active deck identity changed", async () => {
    holder.spell = makeSpell({ id: "srd-test-spell" });
    holder.activeDeck = makeDeck();
    holder.saveCustomSpell.mockResolvedValue(makeCustomSpell({ id: "copy-1", name: "Test Spell" }));
    holder.replaceDeckEntryWithCopy.mockResolvedValue({ status: "deck-changed" });
    const user = userEvent.setup();
    render(<DetailsPane />);

    await saveAndOpenConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Replace entry" }));

    expect(screen.getByText(/A different deck is active now/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeNull();
  });

  it.each([
    ["missing", /no longer in the active deck/],
    ["duplicate", /already contains this custom copy/],
    ["error", /could not be replaced/],
  ] as const)("explains the %s outcome and offers retry", async (status, messagePattern) => {
    holder.spell = makeSpell({ id: "srd-test-spell" });
    holder.activeDeck = makeDeck();
    holder.saveCustomSpell.mockResolvedValue(makeCustomSpell({ id: "copy-1", name: "Test Spell" }));
    holder.replaceDeckEntryWithCopy.mockResolvedValue({ status });
    const user = userEvent.setup();
    render(<DetailsPane />);

    await saveAndOpenConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Replace entry" }));

    expect(screen.getByText(messagePattern)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
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
