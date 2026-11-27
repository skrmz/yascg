import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { message } from "@/locales/messages.ts";
import { CARD_BACKGROUNDS, cardBackgroundLabel } from "@/cards/backgrounds.ts";
import { DeckPane } from "./DeckPane.tsx";
import { CardAppearance } from "../details/CardAppearance.tsx";
import { WorkspaceLayoutContext } from "../workspace-layout.ts";
import { makeSpell } from "@/test/fixtures/spells.ts";

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
  cardBackground: "none" as string,
  setCardBackground: vi.fn(),
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
    englishById: new Map(),
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
    cardBackground: holder.cardBackground,
    personalBackgrounds: [],
    collectionGeneration: "initial",
    setCardBackground: holder.setCardBackground,
    removeDeckEntries: vi.fn(),
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
  holder.setDeckEntryFitMode.mockReset();
  holder.cardDesign = "classic";
  holder.setCardDesign.mockReset();
  holder.cardBackground = "none";
  holder.setCardBackground.mockReset();
  toastMock.success.mockReset();
  toastMock.info.mockReset();
  toastMock.error.mockReset();
});

describe("DeckPane status and save", () => {
  it.each(["list", "table"] as const)(
    "keeps shared guarded actions in %s",
    async (presentation) => {
      holder.activeDeck = { ...associatedDeck, revision: 2 };
      holder.dirty = true;
      holder.deckStatus = "unsaved";
      const user = userEvent.setup();
      const show = (value: "list" | "table") => (
        <WorkspaceLayoutContext.Provider value="split">
          <DeckPane presentation={value} />
        </WorkspaceLayoutContext.Provider>
      );
      const view = render(show(presentation));
      await user.click(screen.getByRole("button", { name: "Rename deck Deck" }));
      const input = screen.getByRole("textbox", { name: "Active deck name" });
      await user.clear(input);
      await user.type(input, "Renamed");
      view.rerender(show(presentation === "list" ? "table" : "list"));
      expect(screen.getByLabelText("Active deck name")).toBe(input);
      expect(input).toHaveValue("Renamed");
      expect(screen.getByRole("button", { name: "Print cards" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Open…" })).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(holder.renameActiveDeck).toHaveBeenCalledExactlyOnceWith("Renamed");
      expect(holder.saveActiveDeck).toHaveBeenCalledTimes(1);
    },
  );
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

    await user.click(screen.getByRole("button", { name: "Rename deck Deck" }));
    const input = screen.getByRole("textbox", { name: "Active deck name" });
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

    await user.click(screen.getByRole("button", { name: "Rename deck Deck" }));
    const input = screen.getByRole("textbox", { name: "Active deck name" });
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

    await user.click(screen.getByRole("button", { name: "Rename deck Deck" }));
    const input = screen.getByRole("textbox", { name: "Active deck name" });
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

    await user.click(screen.getByRole("button", { name: "Rename deck Deck" }));
    const input = screen.getByRole("textbox", { name: "Active deck name" });
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

describe("DeckPane single-card checkbox", () => {
  it.each([
    { name: "A", fitMode: "auto", nextMode: "auto-shrink", checked: false },
    {
      name: "Protection from Evil and Good",
      fitMode: "auto-shrink",
      nextMode: "auto",
      checked: true,
    },
  ] as const)("updates the fit mode for $name", async ({ name, fitMode, nextMode, checked }) => {
    const entry = {
      entryId: "e1",
      spellId: "srd-a",
      fitMode,
      reference: { source: "SRD-5.2.1" as const, name },
    };
    holder.activeDeck = { ...associatedDeck, entries: [entry] };
    holder.resolvedEntries = [
      {
        entry,
        resolution: {
          status: "resolved",
          spell: makeSpell({ id: "srd-a", name, source: "SRD-5.2.1" }),
        },
      },
    ];
    const user = userEvent.setup();
    render(<DeckPane />);

    expect(screen.queryByRole("combobox", { name: `Fit mode for ${name}` })).toBeNull();
    expect(screen.queryByText("About fit modes")).toBeNull();
    expect(screen.getByText("Single card only")).toBeVisible();
    const checkbox = screen.getByRole<HTMLInputElement>("checkbox", {
      name: `Single card only for ${name}`,
    });
    expect(checkbox.checked).toBe(checked);

    await user.click(checkbox);

    expect(holder.setDeckEntryFitMode).toHaveBeenCalledExactlyOnceWith("e1", nextMode);
  });

  it("keeps the checkbox available when a spell is missing", async () => {
    const entry = {
      entryId: "e1",
      spellId: "srd-a",
      fitMode: "auto" as const,
      reference: { source: "SRD-5.2.1" as const, name: "Missing spell" },
    };
    holder.activeDeck = { ...associatedDeck, entries: [entry] };
    holder.resolvedEntries = [
      { entry, resolution: { status: "missing", referenceName: entry.reference.name } },
    ];
    const user = userEvent.setup();
    render(<DeckPane />);

    const checkbox = screen.getByRole("checkbox", { name: "Single card only for Missing spell" });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);

    expect(holder.setDeckEntryFitMode).toHaveBeenCalledExactlyOnceWith("e1", "auto-shrink");
  });
});

describe("DeckPane disclosures", () => {
  it("keeps identity, status and actions visible with rename and help collapsed", async () => {
    holder.activeDeck = { ...associatedDeck };
    holder.deckStatus = "saved";
    const user = userEvent.setup();
    const view = render(<DeckPane />);
    const rename = screen.getByRole("button", { name: "Rename deck Deck" });
    const help = screen.getByRole("button", { name: /Deck persistence help/ });
    expect(screen.getByRole("heading", { name: "Deck" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Print cards" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Active deck name" })).toBeNull();
    expect(screen.queryByLabelText("Card design")).toBeNull();
    expect(help).toHaveAttribute("aria-expanded", "false");

    await user.click(rename);
    await user.click(help);
    expect(help).toHaveAttribute("aria-expanded", "true");
    view.rerender(<DeckPane presentation="table" />);
    expect(screen.getByRole("textbox", { name: "Active deck name" })).toBeVisible();
    expect(help).toHaveAttribute("aria-expanded", "true");
    await user.click(rename);
    expect(screen.queryByRole("textbox", { name: "Active deck name" })).toBeNull();
  });
});

describe("CardAppearance design selector", () => {
  it("starts collapsed and offers both designs", async () => {
    const user = userEvent.setup();
    render(<CardAppearance />);
    const select = screen.getByLabelText("Card design") as HTMLSelectElement;
    expect(select.closest("details")).not.toHaveAttribute("open");
    await user.click(screen.getByText("Card appearance"));
    expect(Array.from(select.options, (option) => option.textContent)).toEqual([
      "Classic",
      "Compact",
    ]);
    expect(select.value).toBe("classic");
  });

  it("calls setCardDesign when Compact is selected", async () => {
    const user = userEvent.setup();
    render(<CardAppearance />);
    await user.selectOptions(screen.getByLabelText("Card design"), "compact");
    expect(holder.setCardDesign).toHaveBeenCalledWith("compact");
  });

  it.each(["classic", "compact"] as const)(
    "opens the localized legend with %s cards",
    async (design) => {
      holder.cardDesign = design;
      const user = userEvent.setup();
      render(<CardAppearance />);
      await user.click(screen.getByText("Card appearance"));
      await user.click(screen.getByRole("button", { name: "Legend" }));
      const dialog = screen.getByRole("dialog", { name: "Card legend" });
      expect(within(dialog).getByText(/editable spell text in either card design/)).not.toBeNull();
      expect(within(dialog).getByText("TRN")).not.toBeNull();
      expect(within(dialog).getByText("WIZ")).not.toBeNull();
    },
  );
});

describe("CardAppearance background selector", () => {
  it("offers None followed by the discovered images", () => {
    render(<CardAppearance />);
    const select = screen.getByLabelText("Card background") as HTMLSelectElement;
    expect(Array.from(select.options, (option) => option.textContent)).toEqual([
      "None",
      ...CARD_BACKGROUNDS.map((option) => cardBackgroundLabel(option.id)),
    ]);
    expect(select.options).toHaveLength(CARD_BACKGROUNDS.length + 1);
    expect(select.options[1]?.value).toBe(CARD_BACKGROUNDS[0].id);
    expect(select.value).toBe("none");
  });

  it("calls setCardBackground when an image is selected", async () => {
    const user = userEvent.setup();
    const id = CARD_BACKGROUNDS[0].id;
    render(<CardAppearance />);
    await user.selectOptions(screen.getByLabelText("Card background"), id);
    expect(holder.setCardBackground).toHaveBeenCalledWith(id);
  });

  it("keeps a background write error visible after closing appearance", async () => {
    const user = userEvent.setup();
    holder.setCardBackground.mockRejectedValueOnce(new Error("Storage failed"));
    render(<CardAppearance />);
    const appearance = screen.getByText("Card appearance");
    await user.click(appearance);
    await user.selectOptions(screen.getByLabelText("Card background"), CARD_BACKGROUNDS[0].id);
    await user.click(appearance);
    expect(screen.getByRole("alert")).toHaveTextContent("The background change could not be saved");
  });
});
