import { expect, test } from "@playwright/test";

async function switchLanguage(page: import("@playwright/test").Page, option: RegExp) {
  await page.getByRole("button", { name: /Spell data language|Sprache der Zauberdaten/ }).click();
  await page
    .getByRole("listbox", { name: /Spell data languages|Sprachen der Zauberdaten/ })
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

  const deck = page.getByRole("region", { name: "Aktives Deck" });
  await expect(deck.getByText("Feuerball")).toBeVisible();
  await expect(deck.getByText(/1 druckbar/)).toBeVisible();
  await expect(deck.getByText(/Nicht in de/)).toHaveCount(0);
});

test("the complete German library exposes all 339 spells under German names", async ({ page }) => {
  await page.goto("/");
  await switchLanguage(page, /Deutsch/);

  const library = page.getByRole("region", { name: "Zauberbibliothek" });
  await expect(library).toBeVisible();
  await expect(page.getByText("339 Ergebnisse")).toBeVisible();

  const search = page.getByLabel("Zauber suchen");
  await search.fill("Befehl");
  await expect(library.getByText("Befehl", { exact: true })).toBeVisible();
  await search.fill("Feuerball");
  await expect(library.getByText("Feuerball", { exact: true })).toBeVisible();
});

test("a persisted German preference initializes the document and full chrome in German", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("spellCards.language", "de"));
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("region", { name: "Zauberbibliothek" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sprache der Zauberdaten/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Über und Quellenangaben" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drucken" })).toBeVisible();
  await expect(page.getByText("339 Ergebnisse")).toBeVisible();
});

test("German localizes about, import/export and print dialogs", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("spellCards.language", "de"));
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Zauberbibliothek" })).toBeVisible();

  await page.getByRole("button", { name: "Über und Quellenangaben" }).click();
  const about = page.getByRole("dialog", { name: /Über YASCG/ });
  await expect(about.getByText(/Diese Anwendung steht in keiner Verbindung/)).toBeVisible();
  await about.getByRole("button", { name: "Schließen" }).click();

  await page.getByLabel("Zauber suchen").fill("Feuerball");
  await page
    .getByRole("button", { name: /Feuerball zum aktiven Deck hinzufügen/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Importieren / Exportieren" }).click();
  const importDialog = page.getByRole("dialog", { name: "JSON importieren / exportieren" });
  await expect(importDialog.getByRole("heading", { name: "Eigene Zauber" })).toBeVisible();
  await importDialog.getByRole("button", { name: "Schließen" }).click();

  await page.getByRole("button", { name: "Drucken" }).first().click();
  const printDialog = page.getByRole("dialog", { name: "Zauberkarten drucken" });
  await expect(printDialog.getByText("Druckeinstellungen")).toBeVisible();
  await printDialog.getByRole("button", { name: "Abbrechen" }).click();
});

test("a failed interactive switch keeps the committed UI language", async ({ page }) => {
  await page.route("**/spells.srd.de.json", (route) => route.fulfill({ status: 500 }));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await switchLanguage(page, /Deutsch/);

  await expect(page.getByText(/Failed to load language "de"/)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("region", { name: "Spell library" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Spell data language/ })).toBeVisible();
});

test("a failed initial load falls back to English with a localized retry", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("spellCards.language", "de"));
  await page.route("**/spell-languages.json", (route) => route.fulfill({ status: 500 }));
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("Spell data could not be loaded. Please try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Spell library" })).toBeVisible();
});
