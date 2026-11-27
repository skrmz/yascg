import "@testing-library/jest-dom/vitest";
import { useContext, type ReactNode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createEmptyActiveDeck } from "@/domain/deck.ts";
import { makeSpell } from "@/test/fixtures/spells.ts";
import { setWorkspaceWidth } from "@/test/setup.ts";
import { ShowDetailsContext } from "./workspace-layout.ts";
import { AppShell } from "./AppShell.tsx";

const selection = vi.hoisted(() => ({ selectSpell: vi.fn() }));
let appState = state();
function state() {
  return {
    selectedSpellId: "srd-test-spell",
    language: "en",
    activeDeck: createEmptyActiveDeck(),
    cardDesign: "classic",
    cardBackground: "none",
    languageNotice: null,
    deckError: null,
    dataError: null,
    collectionError: null,
    pendingLanguageSwitch: null,
    conflict: null,
    collectionGeneration: "initial",
    librarySpells: [makeSpell()],
    selectSpell: selection.selectSpell,
  };
}
vi.mock("@/state/AppProvider.tsx", () => ({ useApp: () => appState }));
vi.mock("./Header.tsx", () => ({ Header: () => null }));
vi.mock("./library/LibraryPane.tsx", () => ({
  LibraryPane: () => {
    const showDetails = useContext(ShowDetailsContext);
    return (
      <>
        <input aria-label="Library search" />
        {appState.librarySpells.map((spell) => (
          <button
            key={spell.id}
            onClick={(event) =>
              showDetails({ spellId: spell.id, trigger: event.currentTarget, source: "library" })
            }
          >
            Inspect candidate
          </button>
        ))}
      </>
    );
  },
}));
vi.mock("./details/DetailsPane.tsx", () => ({ DetailsPane: () => <p>Preview body</p> }));
vi.mock("./deck/DeckPane.tsx", () => ({
  DeckPane: ({
    presentationSwitch,
    presentation,
  }: {
    presentationSwitch: ReactNode;
    presentation: string;
  }) => (
    <>
      {presentationSwitch}
      <p>Deck {presentation}</p>
    </>
  ),
}));

beforeEach(() => {
  localStorage.clear();
  appState = state();
  selection.selectSpell.mockReset();
});

describe("AppShell explicit navigation and incidental Library inspection", () => {
  async function table() {
    const user = userEvent.setup();
    const view = render(<AppShell />);
    await user.click(screen.getByRole("button", { name: "Table" }));
    return { user, ...view };
  }

  it("reads the live language record without changing selected identity or Table", async () => {
    const { user, rerender } = await table();
    await user.click(screen.getByRole("button", { name: "Inspect candidate" }));
    expect(screen.getByRole("dialog", { name: "Test Spell" })).toHaveTextContent("A test spell.");
    appState = {
      ...appState,
      language: "de",
      librarySpells: [makeSpell({ name: "Aktueller Zauber", description: ["Aktueller Text."] })],
    };
    rerender(<AppShell />);
    const reader = screen.getByRole("dialog", { name: "Aktueller Zauber" });
    expect(reader).toHaveTextContent("Aktueller Text.");
    expect(selection.selectSpell).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Table", hidden: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Inspect candidate" })).toHaveFocus(),
    );
  });

  it.each(["deletion", "generation"])(
    "closes a %s reader without reopening a stale candidate",
    async (change) => {
      const { user, rerender } = await table();
      await user.click(screen.getByRole("button", { name: "Inspect candidate" }));
      appState =
        change === "deletion"
          ? { ...appState, librarySpells: [] }
          : { ...appState, collectionGeneration: "replacement" };
      rerender(<AppShell />);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      appState = { ...appState, librarySpells: [makeSpell()] };
      rerender(<AppShell />);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(selection.selectSpell).not.toHaveBeenCalled();
    },
  );

  it("reveals Preview on explicit same-spell selection and reselection", async () => {
    setWorkspaceWidth(390);
    const user = userEvent.setup();
    render(<AppShell />);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await user.click(screen.getByRole("button", { name: "Inspect candidate" }));
      expect(selection.selectSpell).toHaveBeenLastCalledWith("srd-test-spell");
      expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByText("Preview body")).toBeVisible();
      await user.click(screen.getByRole("tab", { name: "Library" }));
    }
    expect(selection.selectSpell).toHaveBeenCalledTimes(2);
  });

  it.each([820, 1440])(
    "keeps ordinary Library inspection focus at %ipx when Library stays visible",
    async (width) => {
      setWorkspaceWidth(width);
      const user = userEvent.setup();
      render(<AppShell />);
      const trigger = screen.getByRole("button", { name: "Inspect candidate" });
      await user.click(trigger);
      expect(selection.selectSpell).toHaveBeenCalledExactlyOnceWith("srd-test-spell");
      expect(trigger).toHaveFocus();
      expect(screen.getByText("Preview body")).toBeVisible();
    },
  );

  it("moves focus to the visible destination when resizing hides the inspection source", async () => {
    setWorkspaceWidth(390);
    const user = userEvent.setup();
    render(<AppShell />);
    await user.click(screen.getByRole("tab", { name: "Deck" }));
    await user.click(screen.getByRole("button", { name: "Table" }));
    act(() => setWorkspaceWidth(1440));
    await user.click(screen.getByRole("button", { name: "Inspect candidate" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    act(() => setWorkspaceWidth(390));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("tabpanel", { name: "Deck" })).toHaveFocus());
  });

  it("exits Table only through the reader's explicit Open Preview action", async () => {
    const { user } = await table();
    await user.click(screen.getByRole("button", { name: "Inspect candidate" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Open Preview" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(selection.selectSpell).toHaveBeenCalledExactlyOnceWith("srd-test-spell");
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByRole("region", { name: "Preview" })).toHaveFocus());
  });
});
