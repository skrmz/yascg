import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { CORE_CLASSES } from "@/domain/spells";
import { makeCustomSpell } from "@/test/fixtures/spells.ts";
import { LibraryPane } from "./LibraryPane.tsx";

const holder = vi.hoisted(() => ({ spells: [] as unknown[] }));

vi.mock("@/state/AppProvider.tsx", () => ({
  useApp: () => ({
    librarySpells: holder.spells,
    language: "en",
    addSpellToDeck: () => Promise.resolve(),
    addSpellsToDeck: () => Promise.resolve(),
    replaceDeckWithSpells: () => Promise.resolve(),
    selectSpell: () => {},
    selectedSpellId: null,
  }),
}));

beforeEach(async () => {
  holder.spells = [];
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
