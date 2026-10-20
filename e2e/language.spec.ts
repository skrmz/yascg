import { expect, test } from "@playwright/test";

async function switchLanguage(page: import("@playwright/test").Page, option: RegExp) {
  await page.getByRole("button", { name: /Spell data language/ }).click();
  await page
    .getByRole("listbox", { name: "Spell data languages" })
    .getByRole("option", { name: option })
    .click();
}

test("non-destructive language switch with confirmation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();

  await switchLanguage(page, /Deutsch/);

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/not available in this language/i)).toBeVisible();
  await expect(dialog.getByText(/1 deck entry/)).toBeVisible();
  await expect(dialog.getByText(/1 distinct spell/)).toBeVisible();

  // Cancel changes neither language nor deck.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: /English/ })).toBeVisible();
  const deck = page.getByRole("region", { name: "Active deck" });
  await expect(deck.getByText("Fireball")).toBeVisible();

  // Confirm keeps the entry as a non-printable placeholder.
  await switchLanguage(page, /Deutsch/);
  await page.getByRole("dialog").getByRole("button", { name: "Switch language" }).click();
  await expect(page.getByRole("button", { name: /Deutsch/ })).toBeVisible();
  await expect(deck.getByText(/Not available in de/)).toBeVisible();
  await expect(deck.getByText(/0 printable/)).toBeVisible();
});

test("untranslated SRD spells are absent from the target-language library", async ({ page }) => {
  await page.goto("/");
  await switchLanguage(page, /Deutsch/);
  await page.getByLabel("Search spells").fill("Befehl");
  await expect(
    page.getByRole("region", { name: "Spell library" }).getByText("Befehl"),
  ).toBeVisible();
  await page.getByLabel("Search spells").fill("Fireball");
  await expect(page.getByText(/No spells match/)).toBeVisible();
});
