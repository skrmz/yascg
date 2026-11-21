import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
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
  failedKeys: new Set<string>(),
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
    failedKeys: holder.failedKeys,
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
  holder.failedKeys = new Set();
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

it("gates printing on selected omissions, overflow and measurement failures", async () => {
  const user = userEvent.setup();
  for (const [name, status] of [
    ["Missing spell", "missing"],
    ["Untranslated spell", "translation-unavailable"],
    ["Overflowing spell", "resolved"],
    ["Broken layout", "resolved"],
  ] as const) {
    const spell = makeSpell({ name });
    const entry = makeEntry(spell.id, "SRD-5.2.1", name);
    holder.resolvedEntries.push({ entry, resolution: { status, spell } });
    if (name === "Overflowing spell")
      holder.results.set(entry.entryId, { fit: { overflow: true } });
    if (name === "Broken layout") holder.failedKeys.add(entry.entryId);
  }
  render(<PrintDialog open onOpenChange={() => undefined} />);
  const print = screen.getByRole("button", { name: /^Print 1 card/ });
  expect(print).toBeDisabled();
  expect(screen.getByText(/1 entry not available.*1 missing reference/)).toBeVisible();
  await user.click(screen.getByRole("checkbox", { name: "Omit these cards and continue" }));
  expect(print).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: "Overflowing spell" }));
  await user.click(screen.getByRole("checkbox", { name: "Broken layout" }));
  expect(print).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: "Missing spell" }));
  await user.click(screen.getByRole("checkbox", { name: "Untranslated spell" }));
  expect(print).toBeEnabled();
  await user.click(screen.getByRole("checkbox", { name: "Missing spell" }));
  expect(print).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: "Omit these cards and continue" }));
  expect(print).toBeEnabled();
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
