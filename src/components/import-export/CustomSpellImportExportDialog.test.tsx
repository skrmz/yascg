import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { makeCustomSpell } from "@/test/fixtures/spells.ts";
import { CustomSpellImportExportDialog } from "./CustomSpellImportExportDialog.tsx";

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

const importCustomMock = vi.hoisted(() => ({
  applyCustomImport: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/io/import-custom.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/io/import-custom.ts")>();
  return { ...actual, applyCustomImport: importCustomMock.applyCustomImport };
});

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

const twoSpellPayload = JSON.stringify({
  type: "custom-spells",
  spells: [
    makeCustomSpell({ id: "custom-import-1", name: "Imported Spell" }),
    makeCustomSpell({ id: "custom-import-2", name: "Skipped Spell" }),
  ],
});

beforeEach(() => {
  toastMock.success.mockReset();
  toastMock.info.mockReset();
  toastMock.error.mockReset();
  importCustomMock.applyCustomImport.mockReset();
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

async function openAndAnalyzeCustomFile(
  payload = customPayload,
  expectedText = "1 spell record will be applied. 0 override records will be applied.",
) {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Open custom import/export" }));
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Custom import file input not found");
  await user.upload(input, new File([payload], "custom-spells.json", { type: "application/json" }));
  await screen.findByText(expectedText);
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

    await user.click(screen.getByRole("button", { name: "Reset import" }));

    expect(
      screen.queryByText("1 spell record will be applied. 0 override records will be applied."),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog", { name: "Import / export custom spells" })).toBeNull();
  });
});

describe("CustomSpellImportExportDialog commit feedback", () => {
  const commit = () => screen.getByRole("button", { name: "Commit import" });

  it("shows a success toast with the number of imported spells", async () => {
    importCustomMock.applyCustomImport.mockResolvedValue({
      imported: 2,
      overwritten: 0,
      copied: 0,
      skipped: 0,
      remapped: 0,
      overrides: 0,
    });
    const user = await openAndAnalyzeCustomFile(
      twoSpellPayload,
      "2 spell records will be applied. 0 override records will be applied.",
    );

    await user.click(commit());

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1));
    expect(toastMock.success).toHaveBeenCalledWith("2 spells imported.", undefined);
  });

  it("reports partial imports with the applied and total spell counts", async () => {
    importCustomMock.applyCustomImport.mockResolvedValue({
      imported: 1,
      overwritten: 0,
      copied: 0,
      skipped: 1,
      remapped: 0,
      overrides: 0,
    });
    const user = await openAndAnalyzeCustomFile(
      twoSpellPayload,
      "2 spell records will be applied. 0 override records will be applied.",
    );

    await user.click(commit());

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1));
    expect(toastMock.success).toHaveBeenCalledWith(
      "1 of 2 spells imported.",
      expect.objectContaining({ description: expect.stringContaining("skipped 1") }),
    );
  });

  it("shows an error toast when the import fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    importCustomMock.applyCustomImport.mockRejectedValue(new Error("boom"));
    const user = await openAndAnalyzeCustomFile();

    await user.click(commit());

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(toastMock.error).toHaveBeenCalledWith("Custom spell import failed", {
      description: "Something went wrong. Please try again.",
    });
    consoleError.mockRestore();
  });
});
