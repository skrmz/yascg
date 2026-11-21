import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const emptyBackup = {
  type: "yascg-complete-backup",
  version: 1,
  activeDeck: { id: "active", name: "", entries: [], revision: 0, baseline: null },
  savedDecks: [],
  customSpells: [],
  srdSpellOverrides: [],
};

async function menuAction(page: Page, name: string, menuName = "Open menu") {
  await page.getByRole("button", { name: menuName, exact: true }).press("Enter");
  await page.getByRole("menuitem", { name, exact: true }).press("Enter");
}

async function reviewFile(page: Page, backup: unknown) {
  await menuAction(page, "Restore complete backup");
  const dialog = page.getByRole("dialog", { name: "Restore complete backup" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "collection.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(dialog.getByRole("alert")).toContainText("replaces this entire collection");
  return dialog;
}

async function exportBackup(page: Page) {
  const downloaded = page.waitForEvent("download");
  await menuAction(page, "Export complete backup");
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^yascg-complete-backup-.*\.json$/);
  return JSON.parse(await readFile(await download.path(), "utf8")) as typeof emptyBackup;
}

async function renameDeck(page: Page, name: string) {
  const field = page.getByLabel("Active deck name");
  await expect(field).toBeEditable();
  await field.fill(name);
  await field.press("Enter");
  await expect(field).toHaveValue(name);
}

async function addFireball(page: Page) {
  await page.getByLabel("Search spells").fill("Fireball");
  await page.getByRole("button", { name: "Add Fireball to active deck", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Active deck" }).getByText("Fireball"),
  ).toBeVisible();
}

test("exports only committed data and requires confirmation to replace a populated collection", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await addFireball(page);
  await renameDeck(page, "Committed");
  await page.getByRole("button", { name: "Save as…" }).click();
  await page
    .getByRole("dialog", { name: "Save deck as" })
    .getByRole("button", { name: "Save" })
    .click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await renameDeck(page, "Working deck");
  const name = page.getByLabel("Active deck name");
  await name.fill("Uncommitted draft");

  // A pointer activation starts at the focused inline name editor.
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export complete backup", exact: true }).click();
  const file = await downloadEvent;
  const backup = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(backup.activeDeck.name).toBe("Working deck");
  expect(backup.activeDeck.baseline.name).toBe("Committed");
  expect(backup.savedDecks).toHaveLength(1);
  await name.press("Escape");
  expect(await exportBackup(page)).toEqual(backup);

  const destination = await browser.newContext();
  try {
    const target = await destination.newPage();
    await target.goto("/");
    let dialog = await reviewFile(target, backup);
    await expect(dialog).toContainText("Working deck: Working deck (1 entry)");
    await expect(dialog).toContainText("Saved decks: 1");
    await dialog.getByRole("button", { name: "Cancel" }).press("Enter");
    expect(await exportBackup(target)).toEqual(emptyBackup);

    dialog = await reviewFile(target, backup);
    await dialog.getByRole("button", { name: "Replace entire collection" }).press("Enter");
    await expect(dialog.getByRole("status")).toHaveText("Complete backup restored.");
    await dialog.getByRole("button", { name: "Close", exact: true }).last().press("Enter");
    await expect(target.getByLabel("Active deck name")).toHaveValue("Working deck");
    await expect(target.getByText("Unsaved changes", { exact: true })).toBeVisible();
    await target.reload();
    expect(await exportBackup(target)).toEqual(backup);
    expect(await target.evaluate(() => localStorage.getItem("spellCards.language"))).toBeNull();

    dialog = await reviewFile(target, emptyBackup);
    await expect(dialog).toContainText("Saved decks: 0");
    await target.keyboard.press("Escape");
    expect(await exportBackup(target)).toEqual(backup);
    dialog = await reviewFile(target, emptyBackup);
    await dialog.getByRole("button", { name: "Replace entire collection" }).press("Enter");
    await expect(dialog.getByRole("status")).toHaveText("Complete backup restored.");
    await target.reload();
    expect(await exportBackup(target)).toEqual(emptyBackup);
  } finally {
    await destination.close();
  }
});

test("rejects stale cross-tab reviews and delayed editor saves without notifications", async ({
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", { value: undefined });
  });
  const a = await context.newPage();
  const b = await context.newPage();
  await Promise.all([a.goto("/"), b.goto("/")]);
  const staleReview = await reviewFile(a, emptyBackup);
  await renameDeck(b, "Other tab");
  await expect.poll(async () => (await exportBackup(b)).activeDeck.name).toBe("Other tab");
  await staleReview.getByRole("button", { name: "Replace entire collection" }).click();
  await expect(staleReview.getByRole("status")).toContainText(
    "The collection changed after this review",
  );
  await expect(staleReview.getByRole("button", { name: "Replace entire collection" })).toHaveCount(
    0,
  );
  await staleReview.getByRole("button", { name: "Review file again" }).click();
  await expect(
    staleReview.getByRole("button", { name: "Replace entire collection" }),
  ).toBeEnabled();

  await b.getByLabel("Search spells").fill("Fireball");
  await b
    .getByRole("list", { name: "Spell results" })
    .getByRole("button", { name: /^Fireball/ })
    .first()
    .click();
  await b.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = b.getByRole("dialog");
  await editor.getByLabel("Verbal description").fill("Stale note");
  await staleReview.getByRole("button", { name: "Replace entire collection" }).click();
  await expect(staleReview.getByRole("status")).toHaveText("Complete backup restored.");

  await editor.getByRole("button", { name: "Save spell" }).click();
  await expect(
    b
      .getByText("The collection was restored after this action started.", { exact: false })
      .or(b.getByText("The collection was restored. Reopen any editor", { exact: false })),
  ).toBeVisible();
  await expect(editor).toHaveCount(0);
  expect((await exportBackup(b)).srdSpellOverrides).toEqual([]);
  await expect(b.getByLabel("Active deck name")).toHaveValue("");
  await renameDeck(b, "New intent");
  expect((await exportBackup(b)).activeDeck.name).toBe("New intent");
});

test("validates, restores and downloads offline in the receiving language", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => localStorage.setItem("spellCards.language", "de"));
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Offline bereit");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel("Zauber suchen")).toBeVisible();
  await menuAction(page, "Vollständiges Backup wiederherstellen", "Menü öffnen");
  const dialog = page.getByRole("dialog", { name: "Vollständiges Backup wiederherstellen" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "offline.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        ...emptyBackup,
        srdSpellOverrides: [
          {
            spellId: "srd-fireball",
            locale: "de",
            verbalDescription: "Offline-Notiz",
            updatedAt: 12,
          },
        ],
      }),
    ),
  });
  await expect(dialog.getByRole("alert")).toContainText("ersetzt die gesamte Sammlung");
  await dialog.getByRole("button", { name: "Gesamte Sammlung ersetzen" }).press("Enter");
  await expect(dialog.getByRole("status")).toHaveText(
    "Das vollständige Backup wurde wiederhergestellt.",
  );
  await page.keyboard.press("Escape");
  const downloaded = page.waitForEvent("download");
  await menuAction(page, "Vollständiges Backup exportieren", "Menü öffnen");
  const contents = JSON.parse(await readFile(await (await downloaded).path(), "utf8"));
  expect(contents.srdSpellOverrides).toEqual([
    { spellId: "srd-fireball", locale: "de", verbalDescription: "Offline-Notiz", updatedAt: 12 },
  ]);
  expect(await page.evaluate(() => localStorage.getItem("spellCards.language"))).toBe("de");
});

test("keeps deck and custom-spell import and export working after restore", async ({ page }) => {
  await page.goto("/");
  const restore = await reviewFile(page, emptyBackup);
  await restore.getByRole("button", { name: "Replace entire collection" }).click();
  await expect(restore.getByRole("status")).toHaveText("Complete backup restored.");
  await page.keyboard.press("Escape");

  const spell = {
    id: "narrow-custom",
    source: "Custom",
    name: "Imported custom spell",
    level: 1,
    school: "Evocation",
    castingTime: "1 Action",
    range: "60 feet",
    duration: "Instantaneous",
    concentration: false,
    ritual: false,
    classes: ["Wizard"],
    components: { verbal: false, somatic: false, material: false },
    description: ["Custom **text**"],
  };
  await page.getByRole("button", { name: "Custom spell import/export" }).click();
  const spells = page.getByRole("dialog", { name: "Import / export custom spells" });
  await spells.locator('input[type="file"]').setInputFiles({
    name: "spells.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ type: "custom-spells", spells: [spell] })),
  });
  await spells.getByRole("button", { name: "Commit import" }).click();
  await expect(spells.getByRole("status")).toContainText("Imported 1");
  const spellDownload = page.waitForEvent("download");
  await spells.getByRole("button", { name: "Export custom spells" }).click();
  expect(JSON.parse(await readFile(await (await spellDownload).path(), "utf8"))).toMatchObject({
    type: "custom-spells",
    spells: [spell],
  });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Deck actions" }).click();
  await page.getByRole("menuitem", { name: "Import / export deck" }).click();
  const deck = page.getByRole("dialog", { name: "Import / export deck" });
  const entry = {
    spellId: spell.id,
    fitMode: "auto",
    reference: { name: spell.name, source: spell.source },
  };
  await deck.locator('input[type="file"]').setInputFiles({
    name: "deck.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ type: "deck", name: "Narrow deck", exportedAt: 0, entries: [entry] }),
    ),
  });
  await deck.getByRole("button", { name: "Replace active deck…" }).click();
  await expect(
    page.getByRole("region", { name: "Active deck" }).getByText(spell.name),
  ).toBeVisible();
  await page.getByRole("button", { name: "Deck actions" }).click();
  await page.getByRole("menuitem", { name: "Import / export deck" }).click();
  const deckDownload = page.waitForEvent("download");
  await deck.getByRole("button", { name: "Export active deck" }).click();
  expect(JSON.parse(await readFile(await (await deckDownload).path(), "utf8"))).toMatchObject({
    type: "deck",
    name: "Narrow deck",
    entries: [entry],
  });
});
