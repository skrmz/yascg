import { expect, test, type Page } from "@playwright/test";

async function switchLanguage(page: Page, option: RegExp) {
  await page.getByRole("button", { name: /Spell data language/ }).click();
  await page
    .getByRole("listbox", { name: "Spell data languages" })
    .getByRole("option", { name: option })
    .click();
}

async function selectFireball(page: Page) {
  const library = page.getByRole("region", { name: "Spell library" });
  await page.getByLabel("Search spells").fill("Fireball");
  await library.getByRole("button", { name: /^Fireball Level 3/ }).click();
}

/** Snapshot of layout-derived state that must survive a locale round trip. */
async function layoutState(page: Page) {
  return {
    cards: await page.locator(".card-preview-page").count(),
    status: (await page.getByText(/physical card/).textContent()) ?? "",
    truncated: await page.getByText(/Content was truncated/).count(),
    overflow: await page.getByText(/exceeds the \d+-card continuation limit/).count(),
  };
}

test("cycles card terminology EN to DE and back without stale fit or overflow", async ({
  page,
}) => {
  await page.goto("/");
  await selectFireball(page);

  const card = page.locator(".card-preview-page").first();
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("lang", "en");
  await expect(card.getByText(/Level 3/)).toBeVisible();
  await expect(card.getByText(/Evocation/)).toBeVisible();
  await expect(card.getByText("Casting Time")).toBeVisible();
  await expect(card.getByText("V, S, M")).toBeVisible();
  const english = await layoutState(page);

  await switchLanguage(page, /Deutsch/);

  await expect(card).toHaveAttribute("lang", "de");
  await expect(card.getByText(/Grad 3/)).toBeVisible();
  await expect(card.getByText(/Hervorrufung/)).toBeVisible();
  await expect(card.getByText("Zeitaufwand")).toBeVisible();
  await expect(card.getByText("V, G, M")).toBeVisible();
  await expect(card.getByText("Zauberer, Magier")).toBeVisible();
  const german = await layoutState(page);
  expect(german).toEqual(english);

  await switchLanguage(page, /English/);

  await expect(card).toHaveAttribute("lang", "en");
  await expect(card.getByText(/Level 3/)).toBeVisible();
  await expect(card.getByText("Casting Time")).toBeVisible();
  await expect(card.getByText("V, S, M")).toBeVisible();
  const reverted = await layoutState(page);
  expect(reverted).toEqual(english);
});

test("localizes damage-type badges and falls back to the raw English value", async ({ page }) => {
  await page.goto("/");
  const library = page.getByRole("region", { name: "Spell library" });
  await page.getByLabel("Search spells").fill("Fire Bolt");
  await library.getByRole("button", { name: /^Fire Bolt Cantrip/ }).click();

  const details = page.getByRole("region", { name: "Spell preview and details" });
  await expect(details.getByText("Fire", { exact: true })).toBeVisible();

  await switchLanguage(page, /Deutsch/);
  await expect(details.getByText("Feuer", { exact: true })).toBeVisible();
  await expect(details.getByText("Fire", { exact: true })).toHaveCount(0);

  await switchLanguage(page, /English/);
  await expect(details.getByText("Fire", { exact: true })).toBeVisible();
});
