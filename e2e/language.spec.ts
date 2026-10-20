import { expect, test } from "@playwright/test";

async function switchLanguage(page: import("@playwright/test").Page, option: RegExp) {
  await page.getByRole("button", { name: /Spell data language/ }).click();
  await page
    .getByRole("listbox", { name: "Spell data languages" })
    .getByRole("option", { name: option })
    .click();
}

// The bundled German dataset is a complete 339-spell translation, so switching
// languages never makes an SRD deck entry unavailable and never prompts.
test("switching to the complete German dataset keeps deck spells available and printable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();

  await switchLanguage(page, /Deutsch/);

  // A complete translation has no unavailable entries, so no confirmation shows.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Deutsch/ })).toBeVisible();

  const deck = page.getByRole("region", { name: "Active deck" });
  await expect(deck.getByText("Feuerball")).toBeVisible();
  await expect(deck.getByText(/1 printable/)).toBeVisible();
  await expect(deck.getByText(/Not available in de/)).toHaveCount(0);
});

test("the complete German library exposes all 339 spells under German names", async ({ page }) => {
  await page.goto("/");
  await switchLanguage(page, /Deutsch/);

  const library = page.getByRole("region", { name: "Spell library" });
  await expect(library).toBeVisible();
  await expect(page.getByText("339 results")).toBeVisible();

  const search = page.getByLabel("Search spells");
  await search.fill("Befehl");
  await expect(library.getByText("Befehl", { exact: true })).toBeVisible();
  await search.fill("Feuerball");
  await expect(library.getByText("Feuerball", { exact: true })).toBeVisible();
});
