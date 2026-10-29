import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { makeCustomSpell } from "@/test/fixtures/spells.ts";
import { CustomSpellImportExportDialog } from "./CustomSpellImportExportDialog.tsx";

vi.mock("@/state/AppProvider.tsx", () => ({
  useApp: () => ({
    customSpells: [],
    refreshAll: () => undefined,
    srdSpellOverrides: [],
    englishById: new Map([["srd-test-spell", { id: "srd-test-spell" }]]),
    manifest: [{ code: "en" }],
    dataLoading: false,
    dataError: null,
  }),
}));

const customPayload = JSON.stringify({
  type: "custom-spells",
  spells: [makeCustomSpell({ id: "custom-import-1", name: "Imported Spell" })],
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open custom import/export
      </button>
      <CustomSpellImportExportDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

async function openAndAnalyzeCustomFile() {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Open custom import/export" }));
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Custom import file input not found");
  await user.upload(
    input,
    new File([customPayload], "custom-spells.json", { type: "application/json" }),
  );
  await screen.findByText("1 spell record will be applied. 0 override records will be applied.");
  return user;
}

describe("CustomSpellImportExportDialog pending import handling", () => {
  it("asks before closing with an analyzed import and keeps it when canceled", async () => {
    const user = await openAndAnalyzeCustomFile();

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.getByText(
        "An import is ready but has not been applied. Closing the dialog now discards it.",
      ),
    ).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "Import / export custom spells" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Keep reviewing" }));

    expect(screen.queryByText(/Closing the dialog now discards it/)).toBeNull();
    expect(
      screen.getByText("1 spell record will be applied. 0 override records will be applied."),
    ).not.toBeNull();
  });

  it("keeps the pending import when dismissing the dialog", async () => {
    const user = await openAndAnalyzeCustomFile();

    await user.keyboard("{Escape}");

    expect(
      screen.getByText(
        "An import is ready but has not been applied. Closing the dialog now discards it.",
      ),
    ).not.toBeNull();
  });

  it("discards the pending import when closing is confirmed", async () => {
    const user = await openAndAnalyzeCustomFile();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Discard import and close" }));

    expect(screen.queryByRole("dialog", { name: "Import / export custom spells" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open custom import/export" }));

    expect(
      screen.queryByText("1 spell record will be applied. 0 override records will be applied."),
    ).toBeNull();
  });

  it("resets the pending import from inside the dialog", async () => {
    const user = await openAndAnalyzeCustomFile();

    await user.click(screen.getByRole("button", { name: "Reset custom import" }));

    expect(
      screen.queryByText("1 spell record will be applied. 0 override records will be applied."),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog", { name: "Import / export custom spells" })).toBeNull();
  });
});
