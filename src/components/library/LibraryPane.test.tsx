import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { CORE_CLASSES, type Spell } from "@/domain/spells";
import { makeCustomSpell, makeSpell } from "@/test/fixtures/spells.ts";
import { LibraryPane } from "./LibraryPane.tsx";

const holder = vi.hoisted(() => ({
  spells: [] as unknown[],
  activeDeck: null as unknown,
  selectedSpellId: null as string | null,
  addSpellToDeck: vi.fn(),
  addSpellsToDeck: vi.fn(),
  selectSpell: vi.fn(),
  saveCustomSpell: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/state/AppProvider.tsx", () => ({
  useApp: () => ({
    librarySpells: holder.spells,
    languageSpells: holder.spells,
    language: "en",
    activeDeck: holder.activeDeck,
    addSpellToDeck: holder.addSpellToDeck,
    addSpellsToDeck: holder.addSpellsToDeck,
    replaceDeckWithSpells: () => Promise.resolve(),
    selectSpell: holder.selectSpell,
    selectedSpellId: holder.selectedSpellId,
    saveCustomSpell: holder.saveCustomSpell,
  }),
}));

beforeEach(async () => {
  holder.spells = [];
  holder.activeDeck = null;
  holder.selectedSpellId = null;
  holder.addSpellToDeck.mockReset().mockResolvedValue("added");
  holder.addSpellsToDeck.mockReset().mockResolvedValue({ added: 0, skipped: 0, ok: true });
  holder.selectSpell.mockReset();
  holder.saveCustomSpell.mockReset();
  toastMock.info.mockReset();
  toastMock.success.mockReset();
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("LibraryPane class filter", () => {
  it("only lists the 12 core classes even with unsupported custom classes", async () => {
    holder.spells = [
      makeCustomSpell({ id: "custom-1", name: "Homebrew", classes: ["Wizard", "Artificer"] }),
    ];
    const user = userEvent.setup();
    render(<LibraryPane />);
    await user.click(screen.getByRole("button", { name: "Class" }));
    const popover = screen.getByRole("dialog");
    expect(within(popover).getAllByRole("checkbox")).toHaveLength(CORE_CLASSES.length);
    for (const cls of CORE_CLASSES) {
      expect(within(popover).getByRole("checkbox", { name: cls })).not.toBeNull();
    }
    expect(within(popover).queryByRole("checkbox", { name: "Artificer" })).toBeNull();
  });

  it("localizes class filter labels while keeping canonical identifiers", async () => {
    await i18n.changeLanguage("de");
    const user = userEvent.setup();
    render(<LibraryPane />);
    await user.click(screen.getByRole("button", { name: "Class" }));
    const popover = screen.getByRole("dialog");
    await user.click(within(popover).getByRole("checkbox", { name: "Magier" }));
    expect(within(popover).getAllByRole("checkbox")).toHaveLength(CORE_CLASSES.length);
    expect(within(popover).queryByRole("checkbox", { name: "Wizard" })).toBeNull();
    expect(within(popover).getByRole("checkbox", { name: "Kämpfer" })).not.toBeNull();
  });
});

describe("LibraryPane advanced filters", () => {
  const selfOnly = makeSpell({
    id: "srd-self",
    name: "Self Spell",
    range: "Self",
    duration: "Instantaneous",
    components: { verbal: true, somatic: false, material: false },
  });
  const touchAll = makeSpell({
    id: "srd-touch",
    name: "Touch Spell",
    range: "Touch",
    duration: "1 minute",
    components: { verbal: true, somatic: true, material: true },
  });

  it("filters by the selected range", async () => {
    holder.spells = [selfOnly, touchAll];
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.click(screen.getByRole("button", { name: /Advanced Filters/ }));
    await user.click(screen.getByLabelText("Range"));
    await user.click(screen.getByRole("option", { name: "Self" }));

    expect(screen.getByText("Self Spell")).not.toBeNull();
    expect(screen.queryByText("Touch Spell")).toBeNull();
  });

  it("filters by the selected duration", async () => {
    holder.spells = [selfOnly, touchAll];
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.click(screen.getByRole("button", { name: /Advanced Filters/ }));
    await user.click(screen.getByLabelText("Duration"));
    await user.click(screen.getByRole("option", { name: "1 minute" }));

    expect(screen.getByText("Touch Spell")).not.toBeNull();
    expect(screen.queryByText("Self Spell")).toBeNull();
  });

  it("requires every selected component", async () => {
    holder.spells = [selfOnly, touchAll];
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.click(screen.getByRole("button", { name: /Advanced Filters/ }));
    await user.click(screen.getByRole("button", { name: "Components" }));
    await user.click(screen.getByRole("checkbox", { name: "Somatic" }));
    await user.keyboard("{Escape}");

    expect(screen.getByText("Touch Spell")).not.toBeNull();
    expect(screen.queryByText("Self Spell")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Components" }));
    await user.click(screen.getByRole("checkbox", { name: "Verbal" }));
    await user.keyboard("{Escape}");

    expect(screen.getByText("Touch Spell")).not.toBeNull();
    expect(screen.queryByText("Self Spell")).toBeNull();
  });
});

describe("LibraryPane deck additions", () => {
  it("shows a toast instead of adding a duplicate spell", async () => {
    holder.spells = [makeCustomSpell({ id: "custom-1", name: "Shield" })];
    holder.addSpellToDeck.mockResolvedValueOnce("duplicate");
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.click(screen.getByRole("button", { name: "Add Shield to active deck" }));

    expect(toastMock.info).toHaveBeenCalledWith("Already in deck", {
      description: "Shield is already in the active deck.",
    });
    expect(holder.selectSpell).not.toHaveBeenCalled();
  });

  it("summarizes added and skipped spells for Append all", async () => {
    holder.spells = [
      makeCustomSpell({ id: "custom-1", name: "Fireball" }),
      makeCustomSpell({ id: "custom-2", name: "Shield" }),
    ];
    holder.addSpellsToDeck.mockResolvedValueOnce({ added: 1, skipped: 1, ok: true });
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.click(screen.getByRole("button", { name: "Append all" }));

    expect(holder.addSpellsToDeck).toHaveBeenCalledWith(holder.spells);
    expect(toastMock.success).toHaveBeenCalledWith("Added 1 spell to the active deck.", {
      description: "Skipped 1 already in the active deck.",
    });
  });

  it("reports when every Append all result is already in the deck", async () => {
    holder.spells = [makeCustomSpell({ id: "custom-1", name: "Fireball" })];
    holder.addSpellsToDeck.mockResolvedValueOnce({ added: 0, skipped: 1, ok: true });
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.click(screen.getByRole("button", { name: "Append all" }));

    expect(toastMock.info).toHaveBeenCalledWith("No spells added", {
      description: "1 matching spell is already in the active deck.",
    });
  });
});

describe("LibraryPane custom spell creation", () => {
  const createButton = () => screen.getByRole("button", { name: "Create custom spell" });

  it("is visible for an empty library, an empty deck, and no selection", () => {
    render(<LibraryPane />);
    expect(createButton()).not.toBeNull();
  });

  it("stays visible with SRD spells in the library and deck", () => {
    holder.spells = [makeSpell({ id: "srd-fireball", name: "Fireball" })];
    holder.activeDeck = { entries: [{ spellId: "srd-fireball" }] };
    holder.selectedSpellId = "srd-fireball";
    render(<LibraryPane />);
    expect(createButton()).not.toBeNull();
  });

  it("stays visible with custom spells in the library and deck", () => {
    holder.spells = [makeCustomSpell({ id: "custom-1", name: "Homebrew" })];
    holder.activeDeck = { entries: [{ spellId: "custom-1" }] };
    holder.selectedSpellId = "custom-1";
    render(<LibraryPane />);
    expect(createButton()).not.toBeNull();
  });

  it("stays visible when the search query hides every result", async () => {
    holder.spells = [makeSpell({ id: "srd-fireball", name: "Fireball" })];
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.type(screen.getByLabelText("Search spells"), "zzzz");

    expect(screen.getByText("No spells match the current search and filters.")).not.toBeNull();
    expect(createButton()).not.toBeNull();
  });

  it("opens the existing creation dialog", async () => {
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.click(createButton());

    expect(screen.getByRole("dialog", { name: "New custom spell" })).not.toBeNull();
  });

  it("saves the new spell without adding it to the deck", async () => {
    holder.saveCustomSpell.mockImplementation(async (spell: Spell) => {
      holder.spells = [...holder.spells, spell];
      return spell;
    });
    const user = userEvent.setup();
    const { rerender } = render(<LibraryPane />);

    await user.click(createButton());
    await user.type(screen.getByLabelText("Name"), "Moonbeam Deluxe");
    await user.click(screen.getByRole("button", { name: "Save spell" }));

    expect(holder.saveCustomSpell).toHaveBeenCalledTimes(1);
    const saved = holder.saveCustomSpell.mock.calls[0][0] as Spell;
    expect(saved.name).toBe("Moonbeam Deluxe");
    expect(saved.source).toBe("Custom");
    expect(holder.selectSpell).toHaveBeenCalledWith(saved.id);
    expect(holder.addSpellToDeck).not.toHaveBeenCalled();
    expect(holder.addSpellsToDeck).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "New custom spell" })).toBeNull();

    rerender(<LibraryPane />);
    expect(screen.getByText("Moonbeam Deluxe")).not.toBeNull();
    expect(holder.activeDeck).toBeNull();
  });

  it("does not bypass the active search query for the new spell", async () => {
    holder.saveCustomSpell.mockImplementation(async (spell: Spell) => {
      holder.spells = [...holder.spells, spell];
      return spell;
    });
    const user = userEvent.setup();
    const { rerender } = render(<LibraryPane />);
    await user.type(screen.getByLabelText("Search spells"), "zzzz");

    await user.click(createButton());
    await user.type(screen.getByLabelText("Name"), "Moonbeam Deluxe");
    await user.click(screen.getByRole("button", { name: "Save spell" }));
    rerender(<LibraryPane />);

    expect(screen.queryByText("Moonbeam Deluxe")).toBeNull();
  });

  it("creates nothing when the dialog is canceled", async () => {
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.click(createButton());
    await user.type(screen.getByLabelText("Name"), "Discarded");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(holder.saveCustomSpell).not.toHaveBeenCalled();
    expect(holder.addSpellToDeck).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "New custom spell" })).toBeNull();
  });

  it("lets the user add the newly created spell to the deck afterwards", async () => {
    holder.saveCustomSpell.mockImplementation(async (spell: Spell) => {
      holder.spells = [...holder.spells, spell];
      return spell;
    });
    const user = userEvent.setup();
    const { rerender } = render(<LibraryPane />);

    await user.click(createButton());
    await user.type(screen.getByLabelText("Name"), "Moonbeam Deluxe");
    await user.click(screen.getByRole("button", { name: "Save spell" }));
    rerender(<LibraryPane />);

    await user.click(screen.getByRole("button", { name: "Add Moonbeam Deluxe to active deck" }));

    expect(holder.addSpellToDeck).toHaveBeenCalledTimes(1);
    expect((holder.addSpellToDeck.mock.calls[0][0] as Spell).name).toBe("Moonbeam Deluxe");
  });
});
