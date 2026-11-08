import { fireEvent, render as renderUI, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { CORE_CLASSES, type Spell } from "@/domain/spells";
import { makeCustomSpell, makeSpell } from "@/test/fixtures/spells.ts";
import { WorkspaceLayoutContext } from "../workspace-layout.ts";
import { LibraryPane } from "./LibraryPane.tsx";

let desktopLayout = true;
function setDesktopViewport(value: boolean) {
  desktopLayout = value;
}
function render(ui: ReactNode) {
  return renderUI(ui, {
    wrapper: ({ children }) => (
      <WorkspaceLayoutContext.Provider value={desktopLayout ? "wide" : "compact"}>
        {children}
      </WorkspaceLayoutContext.Provider>
    ),
  });
}

const holder = vi.hoisted(() => ({
  spells: [] as unknown[],
  activeDeck: null as unknown,
  selectedSpellId: null as string | null,
  language: "en",
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
    language: holder.language,
    activeDeck: holder.activeDeck,
    addSpellToDeck: holder.addSpellToDeck,
    addSpellsToDeck: holder.addSpellsToDeck,
    replaceDeckWithSpells: () => Promise.resolve(),
    selectSpell: holder.selectSpell,
    selectedSpellId: holder.selectedSpellId,
    saveCustomSpell: holder.saveCustomSpell,
    customSpells: [],
    srdSpellOverrides: [],
    englishById: new Map(),
    manifest: [],
    dataLoading: false,
    dataError: null,
    refreshAll: () => undefined,
  }),
}));

beforeEach(async () => {
  holder.spells = [];
  holder.activeDeck = null;
  holder.selectedSpellId = null;
  holder.language = "en";
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
    await user.click(screen.getByRole("button", { name: /^Class:/ }));
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
    await user.click(screen.getByRole("button", { name: /^Klasse:/ }));
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
    await user.click(screen.getByRole("button", { name: /^Components:/ }));
    await user.click(screen.getByRole("checkbox", { name: "Somatic" }));
    await user.keyboard("{Escape}");

    expect(screen.getByText("Touch Spell")).not.toBeNull();
    expect(screen.queryByText("Self Spell")).toBeNull();

    await user.click(screen.getByRole("button", { name: /^Components:/ }));
    await user.click(screen.getByRole("checkbox", { name: "Verbal" }));
    await user.keyboard("{Escape}");

    expect(screen.getByText("Touch Spell")).not.toBeNull();
    expect(screen.queryByText("Self Spell")).toBeNull();
  });
});

describe("LibraryPane subclass filter", () => {
  const war = makeSpell({
    id: "srd-war",
    name: "War Spell",
    classes: ["Cleric"],
    subclasses: ["Cleric: War Domain"],
  });
  const life = makeSpell({
    id: "srd-life",
    name: "Life Spell",
    classes: ["Cleric"],
    subclasses: ["Cleric: Life Domain"],
  });
  const evoker = makeCustomSpell({
    id: "custom-evoker",
    name: "Evoker Copy",
    subclasses: ["Wizard: Evoker"],
  });
  const arcana = makeCustomSpell({
    id: "custom-arcana",
    name: "Arcana Copy",
    subclasses: ["Cleric: Arcana"],
  });

  it("groups unique subclass options by parent class and ORs selections", async () => {
    holder.spells = [
      war,
      { ...war, id: "srd-war-2", name: "Second War Spell" },
      life,
      evoker,
      arcana,
    ];
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.click(screen.getByRole("button", { name: /Advanced Filters/ }));
    await user.click(screen.getByRole("button", { name: /^Subclass:/ }));

    const popover = screen.getByRole("dialog");
    const clericGroup = within(popover).getByRole("group", { name: "Cleric" });
    expect(within(clericGroup).getAllByRole("checkbox", { name: "War Domain" })).toHaveLength(1);
    expect(within(clericGroup).getByRole("checkbox", { name: "Life Domain" })).not.toBeNull();
    expect(within(clericGroup).getByRole("checkbox", { name: "Arcana" })).not.toBeNull();

    const wizardGroup = within(popover).getByRole("group", { name: "Wizard" });
    expect(within(wizardGroup).getByRole("checkbox", { name: "Evoker" })).not.toBeNull();

    await user.click(within(clericGroup).getByRole("checkbox", { name: "War Domain" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: "Evoker" }));
    await user.keyboard("{Escape}");

    expect(screen.getByText("War Spell")).not.toBeNull();
    expect(screen.getByText("Second War Spell")).not.toBeNull();
    expect(screen.getByText("Evoker Copy")).not.toBeNull();
    expect(screen.queryByText("Life Spell")).toBeNull();
    expect(screen.queryByText("Arcana Copy")).toBeNull();
  });

  it("localizes catalog labels and falls back for reference-only subclasses", async () => {
    holder.spells = [war, arcana];
    await i18n.changeLanguage("de");
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.click(screen.getByRole("button", { name: /Erweiterte Filter/ }));
    await user.click(screen.getByRole("button", { name: /^Unterklasse:/ }));

    const popover = screen.getByRole("dialog");
    const clericGroup = within(popover).getByRole("group", { name: "Kleriker" });
    expect(
      within(clericGroup).getByRole("checkbox", { name: "Domäne des Krieges" }),
    ).not.toBeNull();
    expect(within(clericGroup).getByRole("checkbox", { name: "Arcana" })).not.toBeNull();
    expect(within(clericGroup).queryByRole("checkbox", { name: "War Domain" })).toBeNull();
  });

  it("preserves canonical subclass selections across language changes", async () => {
    holder.spells = [war, life];
    const user = userEvent.setup();
    const { rerender } = render(<LibraryPane />);

    await user.click(screen.getByRole("button", { name: /Advanced Filters/ }));
    await user.click(screen.getByRole("button", { name: /^Subclass:/ }));
    await user.click(screen.getByRole("checkbox", { name: "War Domain" }));
    await user.keyboard("{Escape}");

    expect(screen.getByText("War Spell")).not.toBeNull();
    expect(screen.queryByText("Life Spell")).toBeNull();

    holder.language = "de";
    await i18n.changeLanguage("de");
    rerender(<LibraryPane />);

    expect(screen.getByText("War Spell")).not.toBeNull();
    expect(screen.queryByText("Life Spell")).toBeNull();

    await user.click(screen.getByRole("button", { name: /^Unterklasse:/ }));
    const checkbox = screen.getByRole("checkbox", {
      name: "Domäne des Krieges",
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
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

describe("LibraryPane custom spell import/export", () => {
  it("opens the focused custom-spell import/export dialog from the library", async () => {
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.click(screen.getByRole("button", { name: "Custom spell import/export" }));

    expect(screen.getByRole("dialog", { name: "Import / export custom spells" })).not.toBeNull();
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

describe("LibraryPane mobile layout", () => {
  beforeEach(() => setDesktopViewport(false));
  afterEach(() => setDesktopViewport(true));

  it("shows search and the mobile affordances without desktop controls", () => {
    holder.spells = [makeSpell({ id: "srd-fireball", name: "Fireball" })];
    render(<LibraryPane />);

    expect(screen.getByLabelText("Search spells")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Filters" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Library actions" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Advanced Filters/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Append all" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Replace deck" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create custom spell" })).toBeNull();
  });

  it("opens the filter sheet with filter controls and footer actions", async () => {
    holder.spells = [makeSpell({ id: "srd-fireball", name: "Fireball" })];
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.click(screen.getByRole("button", { name: "Filters" }));

    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(within(sheet).getByRole("slider", { name: "Minimum level" })).not.toBeNull();
    expect(within(sheet).getByRole("button", { name: /^Class:/ })).not.toBeNull();
    expect(within(sheet).getByRole("button", { name: /Reset Filters/i })).not.toBeNull();

    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();
  });

  it("adds and removes a filter chip without clearing the search query", async () => {
    holder.spells = [makeSpell({ id: "srd-fireball", name: "Fireball", classes: ["Wizard"] })];
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.type(screen.getByLabelText("Search spells"), "Fire");
    await user.click(screen.getByRole("button", { name: "Filters" }));

    const sheet = screen.getByRole("dialog", { name: "Filters" });
    await user.click(within(sheet).getByRole("button", { name: /^Class:/ }));
    await user.click(screen.getByRole("checkbox", { name: "Wizard" }));
    await user.keyboard("{Escape}");
    await user.click(within(sheet).getByRole("button", { name: "Done" }));

    const chip = screen.getByRole("button", { name: "Remove Class: Wizard filter" });
    await user.click(chip);

    expect(screen.queryByRole("button", { name: "Remove Class: Wizard filter" })).toBeNull();
    expect((screen.getByLabelText("Search spells") as HTMLInputElement).value).toBe("Fire");
  });

  it("resets the search query from the filter sheet", async () => {
    holder.spells = [makeSpell({ id: "srd-fireball", name: "Fireball" })];
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.type(screen.getByLabelText("Search spells"), "zzzz");
    await user.click(screen.getByRole("button", { name: "Filters" }));

    const sheet = screen.getByRole("dialog", { name: "Filters" });
    await user.click(within(sheet).getByRole("button", { name: /Reset Filters/i }));

    expect((screen.getByLabelText("Search spells") as HTMLInputElement).value).toBe("");
  });

  it("reopens active advanced filters expanded and updates the live match count", async () => {
    holder.spells = [
      makeSpell({ id: "srd-a", name: "Alpha", ritual: true }),
      makeSpell({ id: "srd-b", name: "Beta", ritual: false }),
    ];
    const user = userEvent.setup();
    render(<LibraryPane />);
    await user.click(screen.getByRole("button", { name: "Filters" }));
    let sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(within(sheet).queryByRole("combobox", { name: "Ritual" })).toBeNull();
    expect(within(sheet).getByRole("status").textContent).toBe("2 spells match");
    await user.click(within(sheet).getByRole("button", { name: /Advanced Filters/ }));
    await user.click(within(sheet).getByRole("combobox", { name: "Ritual" }));
    await user.click(screen.getByRole("option", { name: "Yes" }));
    expect(within(sheet).getByRole("status").textContent).toBe("1 spell matches");
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Filters, 1 active" }));
    sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(
      within(sheet)
        .getByRole("button", { name: /Advanced Filters/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(within(sheet).getByRole("combobox", { name: "Ritual" })).not.toBeNull();
  });

  it("keeps Create custom spell available from the actions menu with no results", async () => {
    const user = userEvent.setup();
    render(<LibraryPane />);

    await user.click(screen.getByRole("button", { name: "Library actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Append all" }).getAttribute("data-disabled"),
    ).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Replace deck" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Custom spell import/export" })).not.toBeNull();

    await user.click(screen.getByRole("menuitem", { name: "Create custom spell" }));
    expect(screen.getByRole("dialog", { name: "New custom spell" })).not.toBeNull();
  });
});

describe("LibraryPane desktop layout", () => {
  it("shows explicit source scope and keeps a selected specific source selected", async () => {
    holder.spells = [
      makeSpell({ id: "srd-a", name: "SRD spell" }),
      makeCustomSpell({ id: "custom-a", name: "Custom spell" }),
    ];
    const user = userEvent.setup();
    render(<LibraryPane />);
    const sources = screen.getByRole("group", { name: "Source" });
    expect(within(sources).getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    await user.click(within(sources).getByRole("button", { name: "SRD" }));
    expect(screen.queryByText("Custom spell")).toBeNull();
    await user.click(within(sources).getByRole("button", { name: "Custom" }));
    await user.click(within(sources).getByRole("button", { name: "Custom" }));
    expect(screen.queryByText("SRD spell")).toBeNull();
    await user.click(within(sources).getByRole("button", { name: "All" }));
    expect(screen.getByText("SRD spell")).not.toBeNull();
    expect(screen.getByText("Custom spell")).not.toBeNull();
  });
  it("exposes current selection and clears empty search with focus recovery", async () => {
    holder.spells = [
      makeSpell({ id: "srd-a", name: "Alpha" }),
      makeSpell({ id: "srd-b", name: "Beta" }),
    ];
    holder.selectedSpellId = "srd-a";
    const user = userEvent.setup();
    render(<LibraryPane />);
    const list = screen.getByRole("list", { name: "Spell results" });
    expect(within(list).getByRole("button", { name: /Alpha/, current: true })).not.toBeNull();
    expect(within(list).getByRole("button", { name: /^Beta/, current: false })).not.toBeNull();
    await user.type(screen.getByLabelText("Search spells"), "zzzz");
    await user.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Search spells"));
    expect(screen.getByText("Alpha")).not.toBeNull();
    expect(holder.selectedSpellId).toBe("srd-a");
  });
  it("keeps the inline filters and desktop controls without mobile affordances", () => {
    holder.spells = [makeSpell({ id: "srd-fireball", name: "Fireball" })];
    render(<LibraryPane />);

    expect(screen.getByRole("button", { name: /Advanced Filters/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Append all" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Replace deck" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Create custom spell" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Custom spell import/export" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Library actions" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Filters/ })).toBeNull();
  });
});

describe("LibraryPane view state", () => {
  it("restores the list scroll position when the pane becomes active again", () => {
    holder.spells = Array.from({ length: 30 }, (_, index) =>
      makeSpell({ id: `srd-${index}`, name: `Spell ${index}` }),
    );
    const { rerender } = render(<LibraryPane active />);

    const list = screen.getByRole("list", { name: "Spell results" });
    list.scrollTop = 120;
    fireEvent.scroll(list);

    rerender(<LibraryPane active={false} />);
    list.scrollTop = 0;
    rerender(<LibraryPane active />);

    expect(list.scrollTop).toBe(120);
  });

  it("keeps the search query when the pane is hidden and shown again", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LibraryPane active />);

    await user.type(screen.getByLabelText("Search spells"), "Fire");

    rerender(<LibraryPane active={false} />);
    rerender(<LibraryPane active />);

    expect((screen.getByLabelText("Search spells") as HTMLInputElement).value).toBe("Fire");
  });
});
