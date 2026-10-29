import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { DeckImportExportDialog } from "./DeckImportExportDialog.tsx";

const holder = vi.hoisted(() => ({
  importDeck: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/state/AppProvider.tsx", () => ({
  useApp: () => ({
    activeDeck: {
      id: "active",
      name: "Working deck",
      entries: [],
      revision: 1,
      baseline: null,
    },
    dirty: false,
    importDeck: holder.importDeck,
  }),
}));

const deckPayload = JSON.stringify({
  type: "deck",
  name: "Imported",
  exportedAt: 1,
  entries: [
    {
      spellId: "srd-a",
      fitMode: "auto-shrink",
      reference: { source: "SRD-5.2.1", name: "A" },
    },
  ],
});

function Harness({ dirty = false }: { dirty?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open deck import/export
      </button>
      <DeckImportExportDialog open={open} onOpenChange={setOpen} dirty={dirty} />
    </>
  );
}

async function openAndAnalyzeDeckFile(dirty = false) {
  const user = userEvent.setup();
  render(<Harness dirty={dirty} />);
  await user.click(screen.getByRole("button", { name: "Open deck import/export" }));
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Deck import file input not found");
  await user.upload(input, new File([deckPayload], "deck.json", { type: "application/json" }));
  await screen.findByRole("button", { name: "Replace active deck…" });
  return user;
}

describe("DeckImportExportDialog", () => {
  it("protects a pending deck import when closing", async () => {
    const user = await openAndAnalyzeDeckFile();

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.getByText(
        "An import is ready but has not been applied. Closing the dialog now discards it.",
      ),
    ).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "Import / export deck" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Keep reviewing" }));

    expect(screen.getByRole("button", { name: "Replace active deck…" })).not.toBeNull();
  });

  it("warns when importing over a dirty active deck", async () => {
    await openAndAnalyzeDeckFile(true);

    expect(
      screen.getByText(
        "The active deck has unsaved changes. Importing replaces them; saved decks are not changed.",
      ),
    ).not.toBeNull();
  });

  it("commits the confirmed import through the provider", async () => {
    holder.importDeck.mockReset().mockResolvedValue({ status: "ok" });
    const user = await openAndAnalyzeDeckFile();

    await user.click(screen.getByRole("button", { name: "Replace active deck…" }));

    expect(holder.importDeck).toHaveBeenCalledTimes(1);
    expect(holder.importDeck.mock.calls[0][0]).toMatchObject({ name: "Imported" });
    expect(screen.queryByRole("dialog", { name: "Import / export deck" })).toBeNull();
  });

  it("states that deck exports are not custom-spell or override backups", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open deck import/export" }));

    expect(
      screen.getByText("Deck JSON is not a backup of custom spells or SRD overrides."),
    ).not.toBeNull();
  });
});
