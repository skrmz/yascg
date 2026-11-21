import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { db } from "@/db/database.ts";
import { createEmptyActiveDeck } from "@/domain/deck";
import * as collectionState from "@/db/collection-state.ts";
import { COMPLETE_BACKUP_TYPE } from "@/io/complete-backup.ts";
import { RestoreBackupDialog } from "./RestoreBackupDialog.tsx";

vi.mock("@/state/AppProvider.tsx", () => ({
  useApp: () => ({ refreshAll: () => undefined }),
}));

const backup = {
  type: COMPLETE_BACKUP_TYPE,
  version: 1,
  activeDeck: { ...createEmptyActiveDeck(), name: "Imported deck" },
  savedDecks: [],
  customSpells: [],
  srdSpellOverrides: [],
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function backupFile(text: string) {
  return new File([text], "backup.json", { type: "application/json" });
}

it("reports a committed restore when refreshing fails and offers reload without replay", async () => {
  const user = userEvent.setup();
  render(<RestoreBackupDialog onClose={() => undefined} />);
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await user.upload(input, backupFile(JSON.stringify(backup)));
  const confirm = await screen.findByRole("button", { name: "Replace entire collection" });
  vi.spyOn(collectionState, "readCollectionSnapshot").mockRejectedValueOnce(
    new Error("Refresh failed"),
  );
  await user.click(confirm);
  expect(
    await screen.findByText(/The backup was restored, but the workspace could not refresh/),
  ).not.toBeNull();
  expect(screen.getByRole("button", { name: "Reload latest" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Replace entire collection" })).toBeNull();
  expect((await collectionState.readCollectionSnapshot()).collection.activeDeck.name).toBe(
    "Imported deck",
  );
});

it("discards a review when a different file is selected and cannot be validated", async () => {
  const user = userEvent.setup();
  render(<RestoreBackupDialog onClose={() => undefined} />);
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await user.upload(input, backupFile(JSON.stringify(backup)));
  expect(await screen.findByRole("button", { name: "Replace entire collection" })).not.toBeNull();
  await user.upload(input, backupFile(JSON.stringify({ type: "deck" })));
  expect(await screen.findByText("Choose a YASCG complete backup file.")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Replace entire collection" })).toBeNull();
  expect((await collectionState.readCollectionSnapshot()).collection.activeDeck).toEqual(
    createEmptyActiveDeck(),
  );
});
