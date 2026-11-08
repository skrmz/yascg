import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { message } from "@/locales/messages.ts";
import { DeckPane } from "./DeckPane.tsx";

const holder = vi.hoisted(() => ({
  activeDeck: null as unknown,
  dirty: false,
  deckStatus: "empty" as string,
  savedDecks: [] as unknown[],
  resolvedEntries: [] as unknown[],
  renameActiveDeck: vi.fn(),
  saveActiveDeck: vi.fn(),
  saveDeckAs: vi.fn(),
  openSavedDeck: vi.fn(),
  deleteSavedDeck: vi.fn(),
  newActiveDeck: vi.fn(),
  importDeck: vi.fn(),
  removeFromDeck: vi.fn(),
  moveDeckEntry: vi.fn(),
  reorderDeckEntries: vi.fn(),
  setDeckEntryFitMode: vi.fn(),
  clearDeck: vi.fn(),
  repairDeckEntry: vi.fn(),
  undoDelete: vi.fn(),
  selectSpell: vi.fn(),
  cardDesign: "classic" as "classic" | "compact",
  setCardDesign: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/state/AppProvider.tsx", () => ({
  useApp: () => ({
    activeDeck: holder.activeDeck,
    dirty: holder.dirty,
    deckStatus: holder.deckStatus,
    deckBusy: false,
    savedDecks: holder.savedDecks,
    resolvedEntries: holder.resolvedEntries,
    language: "en",
    librarySpells: [],
    canUndo: false,
    renameActiveDeck: holder.renameActiveDeck,
    saveActiveDeck: holder.saveActiveDeck,
    saveDeckAs: holder.saveDeckAs,
    openSavedDeck: holder.openSavedDeck,
    deleteSavedDeck: holder.deleteSavedDeck,
    newActiveDeck: holder.newActiveDeck,
    importDeck: holder.importDeck,
    removeFromDeck: holder.removeFromDeck,
    moveDeckEntry: holder.moveDeckEntry,
    reorderDeckEntries: holder.reorderDeckEntries,
    setDeckEntryFitMode: holder.setDeckEntryFitMode,
    clearDeck: holder.clearDeck,
    repairDeckEntry: holder.repairDeckEntry,
    undoDelete: holder.undoDelete,
    selectSpell: holder.selectSpell,
    cardDesign: holder.cardDesign,
    setCardDesign: holder.setCardDesign,
  }),
}));

const emptyDeck = {
  id: "active",
  name: "",
  entries: [],
  revision: 0,
  baseline: null,
};

const associatedDeck = {
  id: "active",
  name: "Deck",
  savedDeckId: "saved-1",
  entries: [],
  revision: 1,
  baseline: { name: "Deck", entries: [], savedRevision: 1 },
};

beforeEach(() => {
  holder.activeDeck = emptyDeck;
  holder.dirty = false;
  holder.deckStatus = "empty";
  holder.savedDecks = [];
  holder.resolvedEntries = [];
  holder.renameActiveDeck.mockReset().mockResolvedValue({ status: "ok" });
  holder.saveActiveDeck.mockReset().mockResolvedValue({ status: "saved" });
  holder.saveDeckAs.mockReset().mockResolvedValue({ status: "ok" });
  holder.openSavedDeck.mockReset().mockResolvedValue({ status: "ok" });
  holder.deleteSavedDeck.mockReset().mockResolvedValue({ status: "ok" });
  holder.newActiveDeck.mockReset().mockResolvedValue({ status: "ok" });
  holder.importDeck.mockReset().mockResolvedValue({ status: "ok" });
  holder.cardDesign = "classic";
  holder.setCardDesign.mockReset();
  toastMock.success.mockReset();
  toastMock.info.mockReset();
  toastMock.error.mockReset();
});

describe("DeckPane status and save", () => {
  it("disables Save for a clean empty deck and performs no write", async () => {
    const user = userEvent.setup();
    render(<DeckPane />);

    const save = screen.getByRole("button", { name: "Save as…" });
    expect(save).toHaveProperty("disabled", true);
    expect(screen.getByText("New deck")).not.toBeNull();

    await user.click(save);
    expect(holder.saveActiveDeck).not.toHaveBeenCalled();
  });

  it("saves an associated dirty deck through Save", async () => {
    holder.activeDeck = {
      ...associatedDeck,
      entries: [
        {
          entryId: "e1",
          spellId: "srd-a",
          fitMode: "auto-shrink",
          reference: { source: "SRD-5.2.1", name: "A" },
        },
      ],
    };
    holder.dirty = true;
    holder.deckStatus = "unsaved";
    const user = userEvent.setup();
    render(<DeckPane />);

    expect(screen.getByText("Unsaved changes")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(holder.saveActiveDeck).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith("Deck saved.");
  });

  it("offers a visible Save as action for an unassociated deck", async () => {
    holder.activeDeck = { ...emptyDeck, name: "Working", revision: 1 };
    holder.dirty = true;
    holder.deckStatus = "not-saved";
    holder.saveActiveDeck.mockResolvedValue({ status: "needs-save-as" });
    const user = userEvent.setup();
    render(<DeckPane />);

    await user.click(screen.getByRole("button", { name: "Save as…" }));

    expect(screen.getByRole("dialog", { name: "Save deck as" })).not.toBeNull();
  });

  it("shows a recoverable dialog when the associated snapshot conflicts", async () => {
    holder.activeDeck = { ...associatedDeck, revision: 2 };
    holder.dirty = true;
    holder.deckStatus = "unsaved";
    holder.saveActiveDeck.mockResolvedValue({
      status: "conflict",
      message: message("error.savedDeckUnavailable"),
    });
    const user = userEvent.setup();
    render(<DeckPane />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("dialog", { name: "This deck could not be saved" })).not.toBeNull();
  });
});

describe("DeckPane inline name editing", () => {
  it("commits a trimmed name on Enter", async () => {
    holder.activeDeck = { ...associatedDeck };
    holder.deckStatus = "saved";
    const user = userEvent.setup();
    render(<DeckPane />);

    const input = screen.getByLabelText("Active deck name");
    await user.clear(input);
    await user.type(input, "  Renamed  ");
    await user.keyboard("{Enter}");

    expect(holder.renameActiveDeck).toHaveBeenCalledWith("  Renamed  ");
  });

  it("reverts a blank associated name without writing", async () => {
    holder.activeDeck = { ...associatedDeck };
    holder.deckStatus = "saved";
    const user = userEvent.setup();
    render(<DeckPane />);

    const input = screen.getByLabelText("Active deck name");
    await user.clear(input);
    await user.keyboard("{Enter}");

    expect(holder.renameActiveDeck).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("Deck");
    expect(screen.getByText("Enter a name of 1–120 characters.")).not.toBeNull();
  });

  it("flushes a pending name edit only once before Save", async () => {
    holder.activeDeck = { ...associatedDeck, revision: 2 };
    holder.dirty = true;
    holder.deckStatus = "unsaved";
    const user = userEvent.setup();
    render(<DeckPane />);

    const input = screen.getByLabelText("Active deck name");
    await user.clear(input);
    await user.type(input, "Renamed");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(holder.renameActiveDeck).toHaveBeenCalledTimes(1);
    expect(holder.saveActiveDeck).toHaveBeenCalledTimes(1);
  });

  it("shows a stale message when the deck changed during editing", async () => {
    holder.activeDeck = { ...associatedDeck };
    holder.deckStatus = "saved";
    holder.renameActiveDeck.mockResolvedValue({ status: "stale" });
    const user = userEvent.setup();
    render(<DeckPane />);

    const input = screen.getByLabelText("Active deck name");
    await user.clear(input);
    await user.type(input, "Renamed");
    await user.keyboard("{Enter}");

    expect(
      screen.getByText("This deck changed while you were editing. The name was not applied."),
    ).not.toBeNull();
    expect((input as HTMLInputElement).value).toBe("Deck");
  });
});

describe("DeckPane actions", () => {
  it("shows the secondary actions menu", async () => {
    const user = userEvent.setup();
    render(<DeckPane />);

    await user.click(screen.getByRole("button", { name: "Deck actions" }));

    expect(screen.getByRole("menuitem", { name: "Save as…" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Start new deck" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Import / export deck" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Clear entries" })).not.toBeNull();
  });

  it("confirms New deck only when dirty", async () => {
    holder.activeDeck = { ...associatedDeck, revision: 2 };
    holder.dirty = true;
    holder.deckStatus = "unsaved";
    const user = userEvent.setup();
    render(<DeckPane />);

    await user.click(screen.getByRole("button", { name: "Deck actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Start new deck" }));

    const dialog = screen.getByRole("dialog", { name: "Start a new deck?" });
    await user.click(within(dialog).getByRole("button", { name: "Start new deck" }));

    expect(holder.newActiveDeck).toHaveBeenCalledTimes(1);
  });

  it("creates a named snapshot from a blank workspace with Save As", async () => {
    const user = userEvent.setup();
    render(<DeckPane />);

    await user.click(screen.getByRole("button", { name: "Deck actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Save as…" }));

    const dialog = screen.getByRole("dialog", { name: "Save deck as" });
    await user.type(within(dialog).getByLabelText("Active deck name"), "Fresh deck");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(holder.saveDeckAs).toHaveBeenCalledWith("Fresh deck");
  });

  it("confirms Clear entries when populated", async () => {
    holder.activeDeck = {
      ...associatedDeck,
      revision: 2,
      entries: [
        {
          entryId: "e1",
          spellId: "srd-a",
          fitMode: "auto-shrink",
          reference: { source: "SRD-5.2.1", name: "A" },
        },
      ],
    };
    holder.dirty = true;
    holder.deckStatus = "unsaved";
    const user = userEvent.setup();
    render(<DeckPane />);

    await user.click(screen.getByRole("button", { name: "Deck actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Clear entries" }));

    const dialog = screen.getByRole("dialog", { name: "Clear all entries?" });
    await user.click(within(dialog).getByRole("button", { name: "Clear entries" }));

    expect(holder.clearDeck).toHaveBeenCalledTimes(1);
  });

  it("lists saved decks and opens the selected snapshot", async () => {
    holder.savedDecks = [
      {
        id: "saved-1",
        name: "Same",
        updatedAt: 2,
        revision: 2,
        entries: [],
      },
      {
        id: "saved-2",
        name: "Same",
        updatedAt: 1,
        revision: 1,
        entries: [],
      },
    ];
    const user = userEvent.setup();
    render(<DeckPane />);

    await user.click(screen.getByRole("button", { name: "Open…" }));

    expect(screen.getByRole("dialog", { name: "Open deck" })).not.toBeNull();
    expect(screen.getByText(/ID saved-1/)).not.toBeNull();
    expect(screen.getByText(/ID saved-2/)).not.toBeNull();

    await user.click(screen.getAllByRole("button", { name: "Open Same" })[0]);
    expect(holder.openSavedDeck).toHaveBeenCalledTimes(1);
  });

  it("asks for confirmation before opening while dirty", async () => {
    holder.dirty = true;
    holder.deckStatus = "not-saved";
    holder.activeDeck = { ...emptyDeck, name: "Working", revision: 1 };
    holder.savedDecks = [{ id: "saved-1", name: "Saved", updatedAt: 1, revision: 1, entries: [] }];
    const user = userEvent.setup();
    render(<DeckPane />);

    await user.click(screen.getByRole("button", { name: "Open…" }));
    await user.click(screen.getByRole("button", { name: "Open Saved" }));

    expect(screen.getByRole("dialog", { name: "Replace the active deck?" })).not.toBeNull();
    expect(holder.openSavedDeck).not.toHaveBeenCalled();
  });
});

describe("DeckPane fit mode selector", () => {
  it("defaults to best fit and updates the entry fit mode", async () => {
    const entry = {
      entryId: "e1",
      spellId: "srd-a",
      fitMode: "auto" as const,
      reference: { source: "SRD-5.2.1" as const, name: "A" },
    };
    holder.activeDeck = { ...associatedDeck, entries: [entry] };
    holder.resolvedEntries = [
      {
        entry,
        resolution: { status: "resolved", spell: { id: "srd-a", name: "A", source: "SRD-5.2.1" } },
      },
    ];
    const user = userEvent.setup();
    render(<DeckPane />);

    const select = screen.getByLabelText("Fit mode for A") as HTMLSelectElement;
    expect(select.getAttribute("aria-description")).toContain("6pt");
    expect(select.value).toBe("auto");
    expect(within(select).getByRole("option", { name: "Best fit" })).not.toBeNull();
    expect(within(select).getByRole("option", { name: "Auto-shrink" })).not.toBeNull();
    expect(within(select).getByRole("option", { name: "Multi-card" })).not.toBeNull();

    await user.selectOptions(select, "multi-card");

    expect(holder.setDeckEntryFitMode).toHaveBeenCalledWith("e1", "multi-card");
  });
});

describe("DeckPane card design selector", () => {
  it("sits between deck controls and deck entries with both designs", () => {
    const { container } = render(<DeckPane />);
    const controls = container.querySelector("#deck-controls");
    const design = container.querySelector("#deck-design");
    const entries = container.querySelector("#deck-entries-container");
    expect(controls).not.toBeNull();
    expect(design).not.toBeNull();
    expect(entries).not.toBeNull();
    expect(controls!.nextElementSibling).toBe(design);
    expect(design!.nextElementSibling).toBe(entries);

    const select = within(design as HTMLElement).getByLabelText("Card design") as HTMLSelectElement;
    expect(Array.from(select.options, (option) => option.textContent)).toEqual([
      "Classic",
      "Compact",
    ]);
    expect(select.value).toBe("classic");
  });

  it("calls setCardDesign when Compact is selected", async () => {
    const user = userEvent.setup();
    render(<DeckPane />);
    await user.selectOptions(screen.getByLabelText("Card design"), "compact");
    expect(holder.setCardDesign).toHaveBeenCalledWith("compact");
  });

  it.each(["classic", "compact"] as const)(
    "opens the localized legend with %s cards",
    async (design) => {
      holder.cardDesign = design;
      const user = userEvent.setup();
      render(<DeckPane />);
      await user.click(screen.getByRole("button", { name: "Legend" }));
      const dialog = screen.getByRole("dialog", { name: "Card legend" });
      expect(within(dialog).getByText(/editable spell text in either card design/)).not.toBeNull();
      expect(within(dialog).getByText("TRN")).not.toBeNull();
      expect(within(dialog).getByText("WIZ")).not.toBeNull();
    },
  );
});
