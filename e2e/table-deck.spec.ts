import { expect, test, type Page } from "@playwright/test";

const deckNames = [
  "Fireball",
  "Wish",
  "Magic Missile",
  "Light",
  "Mage Armor",
  "Arcane Eye",
  "Acid Splash",
  "Aid",
  "Bane",
  "Bless",
  "Alarm",
  "Missing Test Spell",
];

async function importDeck(page: Page) {
  await page.getByRole("button", { name: "Deck actions" }).click();
  await page.getByRole("menuitem", { name: "Import / export deck" }).click();
  const dialog = page.getByRole("dialog", { name: "Import / export deck" });
  const entries = deckNames.map((name) => ({
    spellId: `srd-${name.toLowerCase().replaceAll(" ", "-")}`,
    fitMode: "auto",
    reference: { name, source: "SRD-5.2.1" },
  }));
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "table-deck.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ type: "deck", name: "Table Test", exportedAt: 0, entries }),
    ),
  });
  await dialog.getByRole("button", { name: "Replace active deck…" }).click();
  await expect(dialog).toBeHidden();
}

async function addFireball(page: Page) {
  await page.getByLabel("Search spells").fill("Fireball");
  await page.getByRole("button", { name: "Add Fireball to active deck" }).click();
}

test("table runs in the main workspace and leaves card printing and deck order intact", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/");
  await addFireball(page);
  await page
    .locator("#deck-entries")
    .getByRole("button", { name: /Fireball/ })
    .first()
    .click();
  await expect(page.locator(".card-preview-page").first()).toBeVisible();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  const table = page.getByRole("table", { name: "Active deck table", exact: true });
  const sidebar = page.locator("#deck-panel");
  await expect(table).toBeVisible();
  await expect(sidebar).toBeVisible();
  const tableBox = await table.boundingBox();
  const sidebarBox = await sidebar.boundingBox();
  expect(tableBox!.x).toBeLessThan(sidebarBox!.x);
  await sidebar
    .locator("#deck-entries")
    .getByRole("button", { name: /Show Fireball/ })
    .click();
  await expect(page.locator(".card-preview-page").first()).toBeVisible();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await page.getByRole("button", { name: "Spell Cards", exact: true }).click();
  await expect(page.locator(".card-preview-page").first()).toBeVisible();
  await expect(table).toBeHidden();

  await sidebar.getByRole("button", { name: "Deck actions" }).click();
  await page.getByRole("menuitem", { name: "Clear entries" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Clear entries" }).click();
  await importDeck(page);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await expect(table.getByRole("rowheader").first()).toHaveText("Fireball");
  await table.getByRole("button", { name: "Spell name" }).click();
  await expect(table.getByRole("columnheader", { name: "Spell name" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(table.getByRole("rowheader").first()).toHaveText("Acid Splash");
  await table.getByRole("checkbox", { name: "Select Aid", exact: true }).check();
  const search = page.getByRole("searchbox", { name: "Search spell names" });
  await search.fill("wish");
  await expect(table.getByRole("rowheader")).toHaveText("Wish");
  await sidebar.getByRole("button", { name: "Print cards" }).click();
  const print = page.getByRole("dialog");
  await expect(print.getByRole("checkbox", { name: "Fireball", exact: true })).toBeChecked();
  await expect(print.getByRole("checkbox", { name: "Acid Splash", exact: true })).toBeChecked();
  const printNames = await print.locator("ul > li > label").allTextContents();
  expect(printNames[0]).toBe("Fireball");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Spell Cards", exact: true }).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(search).toHaveValue("wish");
  await expect(page.getByText("1 outside the current filters")).toBeVisible();
  await page.reload();
  await expect(table.getByRole("rowheader")).toHaveText("Wish");
  await expect(search).toHaveValue("wish");
  await expect(page.getByRole("button", { name: "Remove selected" })).toBeDisabled();
  await page.getByRole("button", { name: "Reset filters and sort" }).click();
  await sidebar.getByRole("button", { name: "Move Wish up" }).click();
  await expect(table.getByRole("rowheader").first()).toHaveText("Wish");
});

test("bulk removal reconciles all selected pages with a concurrent deck edit", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/");
  await importDeck(page);
  await page.getByRole("button", { name: "Save as…" }).click();
  await page
    .getByRole("dialog", { name: "Save deck as" })
    .getByRole("button", { name: "Save" })
    .click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  const table = page.getByRole("table", { name: "Active deck table" });
  const all = table.getByRole("checkbox", { name: "Select all matching entries across all pages" });
  await table.getByRole("checkbox", { name: "Select Fireball" }).check();
  await expect(all).toHaveJSProperty("indeterminate", true);
  await all.click();
  await expect(all).toBeChecked();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(table.getByRole("checkbox", { name: "Select Missing Test Spell" })).toBeChecked();
  await expect(table.getByText("Spell unavailable")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search spell names" }).fill("wish");
  await page.getByRole("button", { name: "Remove selected" }).click();
  const remove = page.getByRole("dialog", { name: "Remove deck entries?" });
  await expect(remove).toContainText("Remove 12 entries");
  await expect(remove).toContainText("11 outside the current filters");

  const other = await context.newPage();
  await other.setViewportSize({ width: 1500, height: 900 });
  await other.goto("/");
  await other
    .locator("#deck-panel")
    .getByRole("button", { name: "Remove Light", exact: true })
    .click();
  await expect(remove).toContainText("Remove 11 entries");
  await expect(remove).toContainText("confirm again");
  await remove.getByRole("button", { name: /Remove/ }).click();
  await expect(table).toBeHidden();
  await expect(page.locator("#deck-panel")).toContainText("Unsaved changes");
  await page.locator("#deck-panel").getByRole("button", { name: "Open…" }).click();
  const open = page.getByRole("dialog", { name: "Open deck" });
  await open.getByRole("button", { name: "Open Table Test", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Replace the active deck?" })
    .getByRole("button", { name: /Replace|Open/ })
    .click();
  await expect(page.locator("#deck-entries > li")).toHaveCount(12);
  await expect(page.getByRole("button", { name: "Remove selected" })).toBeDisabled();
});

test("table printing uses every matching page and full values in enabled column order", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => {
      document.body.dataset.printedTable =
        document.querySelector(".table-print-output")?.textContent ?? "";
    };
  });
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/");
  await importDeck(page);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  const table = page.getByRole("table", { name: "Active deck table" });
  await table.getByRole("button", { name: "Spell name" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(10);

  await page.getByRole("button", { name: "Print table", exact: true }).click();
  const print = page.getByRole("dialog", { name: "Table print preview" });
  const preview = print.locator(".table-print-preview");
  const printNames = preview.locator("tbody th");
  await expect(printNames).toHaveCount(12);
  await expect(printNames.first()).toHaveText("Acid Splash");
  await expect(preview.getByRole("columnheader")).toHaveText([
    "Spell name",
    "Level",
    "Components",
    "Casting time",
    "Range",
    "Duration",
    "Concentration",
  ]);
  await print.getByRole("button", { name: "Change visible columns" }).click();
  const columns = page.getByRole("dialog", { name: "Columns" });
  await columns.getByRole("checkbox", { name: "Description" }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("searchbox", { name: "Search spell names" }).fill("wish");
  await table.getByRole("button", { name: "Show full description of Wish" }).click();
  await expect(page.getByRole("dialog", { name: "Wish" })).toContainText(
    "unable to cast Wish ever again",
  );
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Print table", exact: true }).click();
  await print.getByLabel("Paper size").selectOption("A4");
  await print.getByLabel("Orientation").selectOption("landscape");
  await expect(print).toContainText("Spell name: wish");
  await expect(preview).toContainText("unable to cast Wish ever again");
  await expect(preview.getByRole("columnheader", { name: "Description" }).first()).toBeVisible();
  await print.getByRole("button", { name: "Print table", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-printed-table",
    /unable to cast Wish ever again/,
  );
  await expect(page.locator("body")).not.toHaveAttribute("data-printed-table", /Acid Splash/);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
});

test("applies a filtered table sort to the deck and restores deck order without clearing search", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/");
  await importDeck(page);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  const table = page.getByRole("table", { name: "Active deck table" });
  const search = page.getByRole("searchbox", { name: "Search spell names" });
  await search.fill("a");
  const sortName = table.getByRole("button", { name: "Spell name" });
  const useDeckOrder = page.getByRole("button", { name: "Use deck order" });
  const applySort = page.getByRole("button", { name: "Apply table sort to deck" });
  await sortName.click();
  await expect(table.getByRole("rowheader").first()).toHaveText("Acid Splash");
  await useDeckOrder.click();
  await expect(search).toHaveValue("a");
  await expect(table.getByRole("rowheader").first()).toHaveText("Fireball");
  await expect(applySort).toBeDisabled();
  await sortName.click();
  await expect(applySort).toHaveAccessibleDescription(/Other spells keep their positions/);
  await applySort.click();
  await expect(applySort).toBeDisabled();
  const deckRows = page.locator("#deck-entries > li");
  await expect(deckRows.nth(0)).toContainText("Acid Splash");
  await expect(deckRows.nth(1)).toContainText("Wish");
  await expect(deckRows.nth(2)).toContainText("Aid");
  await expect(deckRows.nth(3)).toContainText("Light");
  await expect(deckRows.nth(4)).toContainText("Alarm");
});

test("mobile keeps one Deck tab with accessible compact rows and a scrollable full table", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await addFireball(page);
  await page.getByRole("tab", { name: "Deck", exact: true }).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(3);
  const list = page.getByRole("list", { name: "Deck entries" });
  await expect(list.getByText("Fireball", { exact: true })).toBeVisible();
  const details = list.getByRole("button", { name: "Open details for Fireball" });
  await details.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Fireball" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toBeFocused();

  await page.getByText("Full table", { exact: true }).click();
  const table = page.getByRole("table", { name: "Active deck table" });
  await expect(table).toBeVisible();
  expect(
    await table.evaluate(
      (node) => node.parentElement!.scrollWidth > node.parentElement!.clientWidth,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({ width: 320, height: 420 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "125%";
  });
  await page.getByLabel("Rows per page").selectOption("25");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole("button", { name: "Manage deck" }).click();
  await expect(page.locator("#deck-panel")).toBeVisible();
  await page.getByRole("button", { name: "Spell Cards", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".card-preview-page").first()).toBeVisible();
});
