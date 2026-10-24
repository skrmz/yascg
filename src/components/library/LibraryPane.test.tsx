import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { CORE_CLASSES } from "@/domain/spells";
import { makeCustomSpell } from "@/test/fixtures/spells.ts";
import { LibraryPane } from "./LibraryPane.tsx";

const holder = vi.hoisted(() => ({
  spells: [] as unknown[],
  addSpellToDeck: vi.fn(),
  addSpellsToDeck: vi.fn(),
  selectSpell: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/state/AppProvider.tsx", () => ({
  useApp: () => ({
    librarySpells: holder.spells,
    language: "en",
    addSpellToDeck: holder.addSpellToDeck,
    addSpellsToDeck: holder.addSpellsToDeck,
    replaceDeckWithSpells: () => Promise.resolve(),
    selectSpell: holder.selectSpell,
    selectedSpellId: null,
  }),
}));

beforeEach(async () => {
  holder.spells = [];
  holder.addSpellToDeck.mockReset().mockResolvedValue("added");
  holder.addSpellsToDeck.mockReset().mockResolvedValue({ added: 0, skipped: 0, ok: true });
  holder.selectSpell.mockReset();
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
