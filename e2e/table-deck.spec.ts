import {
  openDeckRename,
  openSpellAction,
  openTableFilters,
  openTableOutput,
} from "./workspace-controls";
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

async function importDeck(page: Page, names = deckNames) {
  await page.getByRole("button", { name: "Deck actions" }).click();
  await page.getByRole("menuitem", { name: "Import / export deck" }).click();
  const dialog = page.getByRole("dialog", { name: "Import / export deck" });
  const entries = names.map((name) => ({
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

async function storedActiveDeck(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open("spell-cards-generator");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const read = db
            .transaction("collectionActiveDeck")
            .objectStore("collectionActiveDeck")
            .get("active");
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            db.close();
            resolve(JSON.stringify(read.result));
          };
        };
      }),
  );
}

test("Library reader closes when its source hides, its custom spell is deleted, or the collection is replaced", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await addFireball(page);
  const spell = {
    id: "incidental-reader-custom",
    source: "Custom",
    name: "Incidental reader custom",
    level: 1,
    school: "Evocation",
    castingTime: "1 Action",
    range: "Self",
    duration: "Instantaneous",
    concentration: false,
    ritual: false,
    classes: ["Wizard"],
    components: { verbal: false, somatic: false, material: false },
    description: ["Authored reader text remains unchanged."],
  };
  await page.getByRole("button", { name: "Custom spell import/export", exact: true }).click();
  const importer = page.getByRole("dialog", { name: "Import / export custom spells" });
  await importer.locator('input[type="file"]').setInputFiles({
    name: "reader-spell.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ type: "custom-spells", spells: [spell] })),
  });
  await importer.getByRole("button", { name: "Commit import", exact: true }).click();
  await expect(importer.getByRole("status")).toContainText("Imported 1");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await page.getByLabel("Search spells").fill(spell.name);
  const candidate = page.getByRole("list", { name: "Spell results" }).getByRole("button").first();
  const reader = page.getByRole("dialog", { name: spell.name, exact: true });
  await candidate.click();
  await expect(reader).toContainText(spell.description[0]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(reader).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(reader).toBeHidden();
  await candidate.click();
  await expect(reader).toBeVisible();

  const other = await context.newPage();
  await other.setViewportSize({ width: 1440, height: 900 });
  await other.goto("/");
  await other.getByRole("button", { name: "List", exact: true }).click();
  await other.getByLabel("Search spells").fill(spell.name);
  await other.getByRole("list", { name: "Spell results" }).getByRole("button").first().click();
  await openSpellAction(other, "Delete");
  await other
    .getByRole("dialog", { name: `Delete "${spell.name}"?`, exact: true })
    .getByRole("button", { name: "Delete spell", exact: true })
    .click();
  await expect(reader).toBeHidden();
  await expect(page.getByLabel("Search spells")).toBeFocused();
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("list", { name: "Spell results" })
    .getByRole("button", { name: /^Fireball\b/ })
    .click();
  const fireballReader = page.getByRole("dialog", { name: "Fireball", exact: true });
  await expect(fireballReader).toBeVisible();

  await other.getByRole("button", { name: "Open menu", exact: true }).click();
  await other.getByRole("menuitem", { name: "Restore complete backup", exact: true }).click();
  const restore = other.getByRole("dialog", { name: "Restore complete backup", exact: true });
  await restore.locator('input[type="file"]').setInputFiles({
    name: "empty-collection.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        type: "yascg-complete-backup",
        version: 2,
        activeDeck: { id: "active", name: "", entries: [], revision: 0, baseline: null },
        savedDecks: [],
        customSpells: [],
        srdSpellOverrides: [],
        personalBackgrounds: [],
        personalBackgroundId: null,
      }),
    ),
  });
  await restore.getByRole("button", { name: "Replace entire collection", exact: true }).click();
  await expect(restore.getByRole("status")).toHaveText("Complete backup restored.");
  await expect(fireballReader).toBeHidden();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(fireballReader).toBeHidden();
  await other.close();
});

test("Table inspection preserves candidate selection, filters, page, selection and scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/");
  await importDeck(page, [
    ...deckNames,
    "Animate Dead",
    "Animal Friendship",
    "Antimagic Field",
    "Animal Messenger",
    ...Array.from({ length: 12 }, (_, index) => `Candidate A${index}`),
  ]);
  await page.getByLabel("Search spells").fill("Fireball");
  await page.getByRole("list", { name: "Spell results" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  const table = page.getByRole("table", { name: "Active deck table", exact: true });
  const search = page.getByRole("searchbox", { name: "Search spell names" });
  await openTableOutput(page);
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  const columns = page.getByRole("dialog", { name: "Columns", exact: true });
  await columns.getByRole("checkbox", { name: "Description" }).check();
  await columns.getByRole("checkbox", { name: "Classes" }).check();
  await page.keyboard.press("Escape");
  await page.getByText("Table view & print", { exact: true }).click();
  await search.fill("a");
  await table.getByRole("button", { name: "Spell name", exact: true }).click();
  await table.getByRole("checkbox", { name: "Select Acid Splash", exact: true }).check();
  await page.getByRole("button", { name: "Next page" }).click();
  const pageStatus = page.getByText("Page 2 of 3", { exact: true });
  await expect(pageStatus).toBeVisible();
  const scroll = page.locator(".deck-table-scroll");
  const workspace = page.locator(".deck-table-workspace");
  await scroll.evaluate((element) => {
    element.scrollLeft = 120;
    element.scrollTop = 40;
  });
  const offset = await scroll.evaluate((element) => ({
    x: element.scrollLeft,
    y: element.scrollTop,
  }));
  await workspace.evaluate((element) => {
    element.scrollTop = 80;
  });
  const vertical = await workspace.evaluate((element) => element.scrollTop);
  expect(offset.x).toBeGreaterThan(0);
  expect(vertical).toBeGreaterThan(0);
  const stored = await storedActiveDeck(page);
  const preferences = await page.evaluate(() => localStorage.getItem("spellCards.deckTable"));
  await page.getByLabel("Search spells").fill("Wish");
  const candidate = page.getByRole("list", { name: "Spell results" }).getByRole("button").first();
  await candidate.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Wish", exact: true });
  await expect(dialog).toContainText("unable to cast Wish ever again");
  await expect(page.locator(".deck-table-scroll table")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(candidate).toBeFocused();
  await expect(candidate).not.toHaveAttribute("aria-current", "true");
  expect(
    await scroll.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop })),
  ).toEqual(offset);
  expect(await workspace.evaluate((element) => element.scrollTop)).toBe(vertical);
  await candidate.press("Enter");
  await dialog.getByRole("button", { name: "Open Preview", exact: true }).click();
  await expect(page.locator(".card-preview-page").first()).toBeVisible();
  await expect(page.locator('[data-workspace-pane="details"]')).toBeFocused();
  await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(candidate).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(search).toHaveValue("a");
  await expect(pageStatus).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove selected", exact: true })).toBeEnabled();
  expect(
    await scroll.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop })),
  ).toEqual(offset);
  expect(await workspace.evaluate((element) => element.scrollTop)).toBe(vertical);
  expect(await page.evaluate(() => localStorage.getItem("spellCards.deckTable"))).toBe(preferences);
  expect(await storedActiveDeck(page)).toBe(stored);
});

test("mobile List and Table share deck actions, rename errors and unchanged stored entries", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("spellCards.deckPresentation", "cards"));
  await page.goto("/");
  await addFireball(page);
  await page.getByRole("tab", { name: "Deck", exact: true }).click();
  await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const name = await openDeckRename(page);
  await name.fill("Shared deck");
  await name.press("Enter");
  await page.getByRole("button", { name: "Save as…", exact: true }).click();
  const save = page.getByRole("dialog", { name: "Save deck as" });
  await save.getByRole("button", { name: "Save", exact: true }).click();
  await expect(save).toBeHidden();
  await expect(page.locator("#deck-controls").getByText("Saved", { exact: true })).toBeVisible();
  const stored = await storedActiveDeck(page);
  for (const presentation of ["Table", "List", "Table"]) {
    await page.getByRole("button", { name: presentation, exact: true }).click();
    await expect(name).toHaveValue("Shared deck");
    for (const action of ["Save", "Open…", "Print cards", "Deck actions"]) {
      await expect(
        page.locator("#deck-panel").getByRole("button", { name: action, exact: true }),
      ).toBeVisible();
    }
    await expect(page.locator("#deck-controls").getByText("Saved", { exact: true })).toBeVisible();
    expect(await storedActiveDeck(page)).toBe(stored);
  }
  await name.fill("");
  await name.press("Enter");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#deck-entries > li")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Manage deck" })).toHaveCount(0);
  expect(await storedActiveDeck(page)).toBe(stored);
});

test("table runs in the main workspace and leaves card printing and deck order intact", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/");
  await addFireball(page);
  await page
    .locator("#deck-entries")
    .getByRole("button", { name: "Show Fireball in Preview", exact: true })
    .click();
  await expect(page.locator(".card-preview-page").first()).toBeVisible();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  const table = page.getByRole("table", { name: "Active deck table", exact: true });
  const deck = page.locator("#deck-panel");
  await expect(table).toBeVisible();
  const libraryBox = (await page.locator('[data-workspace-pane="library"]').boundingBox())!;
  const wideDeck = (await deck.boundingBox())!;
  expect(wideDeck.x).toBeCloseTo(libraryBox.x + libraryBox.width, 0);
  expect(wideDeck.x + wideDeck.width).toBeCloseTo(1500, 0);
  await expect(page.locator("#deck-entries")).toBeHidden();
  await expect(page.locator(".card-preview-page").first()).toBeHidden();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".card-preview-page").first()).toBeVisible();
  await expect(table).toBeHidden();
  expect((await deck.boundingBox())!.width).toBeLessThan(wideDeck.width);
  await expect(page.locator("#deck-entries")).toBeVisible();

  await deck.getByRole("button", { name: "Deck actions" }).click();
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
  await deck.getByRole("button", { name: "Print cards" }).click();
  const print = page.getByRole("dialog");
  await expect(print.getByRole("checkbox", { name: "Fireball", exact: true })).toBeChecked();
  await expect(print.getByRole("checkbox", { name: "Acid Splash", exact: true })).toBeChecked();
  const printNames = await print.locator("ul > li > label").allTextContents();
  expect(printNames[0]).toBe("Fireball");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(search).toHaveValue("wish");
  await expect(page.getByText("1 outside the current filters")).toBeVisible();
  await page.reload();
  await expect(table.getByRole("rowheader")).toHaveText("Wish");
  await expect(search).toHaveValue("wish");
  await expect(page.getByRole("button", { name: "Remove selected" })).toHaveCount(0);
  await openTableFilters(page);
  await page.getByRole("button", { name: "Reset filters and sort" }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await deck.getByRole("button", { name: "Move Wish up" }).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
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
  await other.getByRole("button", { name: "List", exact: true }).click();
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
  await expect(page.getByRole("button", { name: "Remove selected" })).toHaveCount(0);
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

  await openTableOutput(page);
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
  await table.getByRole("button", { name: "Read full spell for Wish" }).click();
  await expect(page.getByRole("dialog", { name: "Wish" })).toContainText(
    "unable to cast Wish ever again",
  );
  await page.keyboard.press("Escape");

  await openTableOutput(page);
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
  const sortField = page.getByRole("combobox", { name: "Sort by" });
  const applySort = page.getByRole("button", { name: "Apply table sort to deck" });
  await sortName.click();
  await expect(table.getByRole("rowheader").first()).toHaveText("Acid Splash");
  await sortField.selectOption({ label: "Use deck order" });
  await openTableFilters(page);
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
  const stored = await storedActiveDeck(page);
  const sort = page.getByRole("combobox", { name: "Sort by" });
  await sort.selectOption("school");
  await page.getByRole("combobox", { name: "Sort direction" }).selectOption("descending");
  await expect(page.getByRole("status").filter({ hasText: "School (descending)" })).toBeVisible();
  await sort.selectOption({ label: "Use deck order" });
  await expect(page.getByRole("combobox", { name: "Sort direction" })).toHaveCount(0);
  expect(await storedActiveDeck(page)).toBe(stored);
  const details = list.getByRole("button", { name: "Read full spell for Fireball" });
  await details.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Fireball" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toBeFocused();

  await details.press("Enter");
  await page
    .getByRole("dialog", { name: "Fireball", exact: true })
    .getByRole("button", { name: "Open Preview", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: "Preview", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator('[data-workspace-pane="details"]')).toBeFocused();
  await page.getByRole("tab", { name: "Deck", exact: true }).click();
  await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Table", exact: true }).click();

  await openTableOutput(page);
  await expect(page.getByRole("button", { name: "Full table and print columns" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Full table", exact: true }).check();
  await page.getByText("Table view & print", { exact: true }).click();
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
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator("#deck-panel")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Deck", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("button", { name: "Manage deck" })).toHaveCount(0);
  await page
    .locator("#deck-entries")
    .getByRole("button", { name: "Show Fireball in Preview" })
    .click();
  await expect(page.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".card-preview-page").first()).toBeVisible();
});
