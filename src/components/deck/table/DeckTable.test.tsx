import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createEmptyActiveDeck } from "@/domain/deck.ts";
import i18n from "@/i18n.ts";
import type { ResolvedDeckEntry } from "@/state/AppProvider.tsx";
import { makeSpell } from "@/test/fixtures/spells.ts";
import { DeckTable } from "./DeckTable.tsx";
import { ShowDetailsContext } from "../../workspace-layout.ts";

vi.mock("@/state/AppProvider.tsx", () => ({ useApp: () => appState }));
vi.mock("@/components/print/TablePrintDialog.tsx", () => ({ TablePrintDialog: () => null }));

function workspace(revision: number, indexes: number[]) {
  const resolvedEntries: ResolvedDeckEntry[] = indexes.map((index) => {
    const name = `Spell ${String(index).padStart(2, "0")}`;
    const spell = makeSpell({ id: `srd-spell-${index}`, name });
    return {
      entry: {
        entryId: `entry-${index}`,
        spellId: spell.id,
        fitMode: "auto",
        reference: { name, source: spell.source },
      },
      resolution: { status: "resolved", spell },
    };
  });
  return {
    activeDeck: {
      ...createEmptyActiveDeck(),
      entries: resolvedEntries.map(({ entry }) => entry),
      revision,
    },
    deckBusy: false,
    resolvedEntries,
    englishById: new Map(),
    language: "en",
    dataLoading: false,
    collectionError: null,
    collectionGeneration: "initial",
  };
}

const indexes = Array.from({ length: 12 }, (_, index) => index + 1);
let appState: ReturnType<typeof workspace>;
const table = () => within(screen.getByRole("table", { name: "Active deck table" }));

beforeEach(async () => {
  localStorage.clear();
  appState = workspace(1, indexes);
  await i18n.changeLanguage("en");
});

describe("DeckTable", () => {
  it("uses the new German default columns and exposes both boolean values accessibly", async () => {
    await i18n.changeLanguage("de");
    const resolution = appState.resolvedEntries[0].resolution;
    if (resolution.status === "resolved") resolution.spell.concentration = true;
    render(<DeckTable active deckInstance="first" removeEntries={async () => "ok"} />);
    const grid = within(screen.getByRole("table", { name: "Tabelle des aktiven Decks" }));
    expect(
      grid
        .getAllByRole("columnheader")
        .slice(1)
        .map((header) => header.textContent),
    ).toEqual([
      "Zaubername",
      "Grad",
      "Komponenten",
      "Zeitaufwand",
      "Reichweite",
      "Wirkungsdauer",
      "Konzentration",
      "Aktionen",
    ]);
    const [yes, no] = grid.getAllByRole("cell", { name: /^(Ja|Nein)$/ });
    expect(yes).toHaveAccessibleName("Ja");
    expect(yes.querySelector("svg")).not.toBeNull();
    expect(no).toHaveAccessibleName("Nein");
    expect(no.querySelector("svg")).toBeNull();
  });

  it("retains all-page selection through presentation, filters, sorting and paging", async () => {
    const user = userEvent.setup();
    const removeEntries = vi.fn(async () => "ok" as const);
    const show = (active: boolean, deckInstance = "first") => (
      <DeckTable {...{ active, deckInstance, removeEntries }} />
    );
    const { rerender } = render(show(true));
    const matching = table().getByRole("checkbox", {
      name: "Select all matching entries across all pages",
    });

    expect(table().getAllByRole("rowheader")).toHaveLength(10);
    await user.click(table().getByRole("checkbox", { name: "Select Spell 01" }));
    expect(matching).toHaveProperty("indeterminate", true);
    await user.click(matching);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(table().getByRole("checkbox", { name: "Select Spell 12" })).toBeChecked();
    await user.click(screen.getByRole("searchbox"));
    await user.paste("  sPeLL   12  ");
    expect(screen.getByText(/11 outside the current filters/)).toBeVisible();
    expect(screen.getByText("Page 1 of 1")).toBeVisible();
    await user.click(matching);
    expect(screen.getByText(/11 selected/)).toBeVisible();

    rerender(show(false));
    expect(screen.queryByRole("table")).toBeNull();
    rerender(show(true));
    expect(screen.getByRole("searchbox")).toHaveValue("  sPeLL   12  ");
    expect(table().getByRole("checkbox", { name: "Select Spell 12" })).not.toBeChecked();
    await user.click(screen.getByText("Filters", { exact: true }));
    await user.click(screen.getByRole("button", { name: "Reset filters and sort" }));
    expect(table().getByRole("checkbox", { name: "Select Spell 01" })).toBeChecked();
    await user.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "25");
    expect(table().getAllByRole("rowheader")).toHaveLength(12);
    const sortField = screen.getByRole("combobox", { name: "Sort by" });
    expect(within(sortField).getByRole("option", { name: "School" })).toBeVisible();
    expect(within(sortField).queryByRole("option", { name: "Description" })).toBeNull();
    await user.selectOptions(sortField, "name");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort direction" }),
      "descending",
    );
    expect(table().getByRole("columnheader", { name: "Spell name" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(table().getAllByRole("rowheader")[0]).toHaveTextContent("Spell 12");
    await user.click(table().getByRole("button", { name: "Spell name" }));
    expect(sortField).toHaveValue("");

    rerender(show(true, "replaced"));
    expect(screen.queryByRole("button", { name: "Remove selected" })).toBeNull();
    expect(table().getByRole("checkbox", { name: "Select Spell 01" })).not.toBeChecked();
    expect(removeEntries).not.toHaveBeenCalled();
  }, 10_000);

  it("updates confirmation after concurrent removal and retains selection on a failed attempt", async () => {
    const user = userEvent.setup();
    const removeEntries = vi
      .fn<() => Promise<"ok" | "changed" | "error">>()
      .mockResolvedValueOnce("error")
      .mockResolvedValueOnce("ok");
    const show = () => <DeckTable active deckInstance="same-deck" removeEntries={removeEntries} />;
    const { rerender } = render(show());

    await user.click(
      table().getByRole("checkbox", { name: "Select all matching entries across all pages" }),
    );
    await user.click(screen.getByRole("button", { name: "Remove selected" }));
    const confirmation = within(screen.getByRole("dialog", { name: "Remove deck entries?" }));
    expect(confirmation.getByText("Remove 12 entries from the active deck?")).toBeVisible();
    expect(confirmation.getByText("2 on other pages.")).toBeVisible();

    appState = workspace(2, indexes.slice(1));
    rerender(show());
    expect(confirmation.getByText("Remove 11 entries from the active deck?")).toBeVisible();
    expect(confirmation.getByRole("status")).toHaveTextContent("confirm again");
    expect(confirmation.getByText("1 on other pages.")).toBeVisible();
    const confirm = confirmation.getByRole("button", { name: /^Remove$/ });
    await user.click(confirm);
    expect(removeEntries).toHaveBeenCalledWith(
      indexes.slice(1).map((index) => `entry-${index}`),
      2,
    );
    expect(confirmation.getByRole("alert")).toHaveTextContent("Try again");

    await user.click(confirm);
    expect(removeEntries).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Remove selected" })).toBeNull();
  });

  it("opens full spell details by keyboard and restores focus to the same row", async () => {
    const user = userEvent.setup();
    render(<DeckTable active deckInstance="first" removeEntries={async () => "ok"} />);
    const trigger = table().getByRole("button", { name: "Read full spell for Spell 01" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Spell 01" });
    expect(dialog).toHaveTextContent("A test spell.");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("opens Preview only on explicit request with the inspected identity", async () => {
    const user = userEvent.setup();
    const showDetails = vi.fn();
    render(
      <ShowDetailsContext.Provider value={showDetails}>
        <DeckTable active deckInstance="first" removeEntries={async () => "ok"} />
      </ShowDetailsContext.Provider>,
    );
    await user.click(table().getByRole("checkbox", { name: "Select Spell 01" }));
    await user.click(table().getByRole("button", { name: "Read full spell for Spell 02" }));
    expect(showDetails).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Open Preview" }),
    );
    expect(showDetails).toHaveBeenCalledExactlyOnceWith({
      spellId: "srd-spell-2",
      source: "table",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(table().getByRole("checkbox", { name: "Select Spell 01" })).toBeChecked();
  });

  it("resolves live text when the inspected row changes language", async () => {
    const user = userEvent.setup();
    const show = () => <DeckTable active deckInstance="first" removeEntries={async () => "ok"} />;
    const { rerender } = render(show());
    await user.click(table().getByRole("button", { name: "Read full spell for Spell 01" }));
    appState = workspace(2, indexes);
    appState.language = "de";
    appState.resolvedEntries[0].resolution = {
      status: "resolved",
      spell: makeSpell({
        id: "srd-spell-1",
        name: "Zauber Eins",
        description: ["Aktueller Zaubertext."],
      }),
    };
    rerender(show());
    const dialog = screen.getByRole("dialog", { name: "Zauber Eins" });
    expect(dialog).toHaveTextContent("Aktueller Zaubertext.");
    expect(dialog).not.toHaveTextContent("A test spell.");
  });

  it.each(["hidden", "generation", "deleted"])(
    "closes inspection after the source becomes %s and does not reopen it on return",
    async (change) => {
      const user = userEvent.setup();
      const show = (active = true) => (
        <DeckTable active={active} deckInstance="first" removeEntries={async () => "ok"} />
      );
      const { rerender } = render(show());
      await user.click(table().getByRole("button", { name: "Read full spell for Spell 01" }));
      expect(screen.getByRole("dialog")).toBeVisible();
      if (change === "generation") appState = { ...appState, collectionGeneration: "replacement" };
      if (change === "deleted") appState = workspace(2, indexes.slice(1));
      rerender(show(change !== "hidden"));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      appState = workspace(3, indexes);
      rerender(show());
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it.each(["translation-unavailable", "missing"] as const)(
    "retains %s inspection without offering an unavailable Preview",
    async (status) => {
      const user = userEvent.setup();
      const fallback = makeSpell({ id: "srd-spell-1", name: "Spell 01" });
      appState.resolvedEntries[0].resolution = { status, referenceName: "Spell 01" };
      if (status === "translation-unavailable") appState.englishById.set(fallback.id, fallback);
      render(<DeckTable active deckInstance="first" removeEntries={async () => "ok"} />);
      await user.click(table().getByRole("button", { name: "Read full spell for Spell 01" }));
      const dialog = screen.getByRole("dialog", { name: "Spell 01" });
      expect(within(dialog).queryByRole("button", { name: "Open Preview" })).toBeNull();
      if (status === "translation-unavailable") expect(dialog).toHaveTextContent("A test spell.");
      else expect(dialog).toHaveTextContent("srd-spell-1");
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
});
