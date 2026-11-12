import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vite-plus/test";
import { makeEntry } from "@/db/active-deck.ts";
import { makeSpell } from "@/test/fixtures/spells.ts";
import { PrintDialog } from "./PrintDialog.tsx";

const holder = vi.hoisted(() => ({
  resolvedEntries: [] as unknown[],
  activeDeck: null as unknown,
  cardDesign: "classic" as "classic" | "compact",
  cardBackground: "none" as string,
  results: new Map<string, unknown>(),
}));

vi.mock("@/state/AppProvider.tsx", () => ({
  useApp: () => ({
    resolvedEntries: holder.resolvedEntries,
    activeDeck: holder.activeDeck,
    language: "en",
    cardDesign: holder.cardDesign,
    cardBackground: holder.cardBackground,
  }),
}));

vi.mock("@/cards/fit.tsx", () => ({
  useDeckCardFits: () => ({
    results: holder.results,
    ready: true,
    error: false,
    measureLayer: null,
  }),
}));

vi.mock("@/cards/fonts.ts", () => ({
  waitForCardFonts: () => Promise.resolve(),
}));

function resolvedEntry() {
  const spell = makeSpell();
  const entry = makeEntry(spell.id, "SRD-5.2.1", spell.name);
  return { spell, entry, resolution: { status: "resolved" as const, spell } };
}

beforeEach(() => {
  const { entry, resolution } = resolvedEntry();
  holder.resolvedEntries = [{ entry, resolution }];
  holder.activeDeck = { entries: [entry] };
  holder.cardDesign = "classic";
  holder.cardBackground = "none";
  holder.results = new Map([
    [
      entry.entryId,
      {
        fit: { pages: [[]], fontPt: 8, truncated: false, overflow: false },
        presentation: null,
      },
    ],
  ]);
  vi.spyOn(window, "print").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PrintDialog print job design", () => {
  it("keeps the started job's design when the selector changes while it is mounted", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PrintDialog open onOpenChange={() => undefined} />);

    await user.click(screen.getByRole("button", { name: /^Print 1 card/ }));
    await waitFor(() =>
      expect(document.body.querySelector(".print-root .spell-card")).not.toBeNull(),
    );

    // The job was measured as Classic; switching the selector must not re-render
    // its captured cards as Compact without a compact presentation.
    holder.cardDesign = "compact";
    rerender(<PrintDialog open onOpenChange={() => undefined} />);

    expect(document.body.querySelector(".print-root .spell-card")).not.toBeNull();
    expect(document.body.querySelector(".print-root .spell-card-compact")).toBeNull();
  });
});
