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
