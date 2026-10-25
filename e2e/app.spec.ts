import { expect, test } from "@playwright/test";

test("loads the library and adds a spell to the active deck", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Spell Card Generator" })).toBeVisible();

  const search = page.getByLabel("Search spells");
  await search.fill("Fireball");

  const addButton = page.getByRole("button", { name: /Add Fireball to active deck/ });
  await expect(addButton).toBeVisible();
  await addButton.click();

  const deck = page.getByRole("region", { name: "Active deck" });
  await expect(deck.getByText("Fireball")).toBeVisible();
});

test("rejects a duplicate spell with a bottom-right notification", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Fireball");

  const addButton = page.getByRole("button", { name: /Add Fireball to active deck/ });
  await addButton.click();
  const deck = page.getByRole("region", { name: "Active deck" });
  await expect(deck.getByText("1 entries")).toBeVisible();

  await addButton.click();
  await expect(page.getByText("Fireball is already in the active deck.")).toBeVisible();
  await expect(deck.getByText("1 entries")).toBeVisible();
});

test("renders a physical-size card preview", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();

  const card = page.locator(".card-preview-page").first();
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  // 2.5in x 3.5in at 96dpi.
  expect(Math.abs(box.width - 240)).toBeLessThan(3);
  expect(Math.abs(box.height - 336)).toBeLessThan(3);
});

test("saves a named deck", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();

  const deck = page.getByRole("region", { name: "Active deck" });
  await page.getByLabel("Active deck name").fill("Test Deck");
  await deck.getByRole("button", { name: "Save as new" }).click();

  await page.getByLabel("Saved deck to load").click();
  await expect(page.getByRole("option", { name: /Test Deck/ })).toBeVisible();
});

test("opens spell details from the persistent header button", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();

  const details = page.getByRole("region", { name: "Spell preview and details" });
  await details.getByRole("button", { name: "Show details" }).click();

  const dialog = page.getByRole("dialog", { name: "Fireball" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Casting Time")).toBeVisible();
  await expect(dialog.getByText("Level 3 \u00b7 Evocation")).toBeVisible();

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
});

test("opens card actions from the ellipsis menu and the context menu", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();

  const details = page.getByRole("region", { name: "Spell preview and details" });
  await details.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Show details" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Show details" })).toHaveCount(0);

  await page.locator(".card-preview-frame").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Show details" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();

  await page.getByRole("menuitem", { name: "Show details" }).click();
  await expect(page.getByRole("dialog", { name: "Fireball" })).toBeVisible();
});

test("does not open details from a single click on the card", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();

  await page.locator(".card-preview-page").first().click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("menuitem")).toHaveCount(0);
});
