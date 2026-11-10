import { expect, test } from "@playwright/test";

test("opens the privacy policy in English without authentication", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Privacy Policy" }).click();

  await expect(
    page.getByRole("button", { name: /Delete all local data|Alle lokalen Daten löschen/i }),
  ).toHaveCount(0);
});

test("opens the authoritative German privacy policy", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("spellCards.language", "de"));
  await page.goto("/");
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("menuitem", { name: "Datenschutzerklärung" }).click();

  const dialog = page.getByRole("dialog", { name: "Datenschutzerklärung" });
  await expect(dialog).toBeVisible();

  await expect(
    page.getByRole("button", { name: /Delete all local data|Alle lokalen Daten löschen/i }),
  ).toHaveCount(0);
});
