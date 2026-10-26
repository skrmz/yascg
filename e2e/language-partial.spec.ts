import { expect, test, type Page } from "@playwright/test";

/**
 * E2E coverage for incomplete translations.
 *
 * The bundled German dataset is a complete 339-spell translation, so the real
 * datasets can no longer exercise the "translation unavailable" paths. These
 * tests inject a deterministic partial translation at the network boundary
 * (manifest + dataset) instead of mutating any bundled data. Service workers are
 * blocked so the injected responses are always used.
 */

const partialManifest = [
  { code: "en", displayName: "English", dataset: "/spells.srd.json" },
  { code: "fr", displayName: "Français", dataset: "/spells.srd.fr.json" },
];

// A deliberately incomplete French dataset: only one spell, so any other SRD
// spell is "translation unavailable" in `fr`.
const partialFrenchDataset = [
  {
    id: "srd-acid-arrow",
    name: "Flèche acide",
    level: 2,
    school: "Evocation",
    castingTime: "1 action",
    range: "27 mètres",
    components: {
      verbal: true,
      somatic: true,
      material: true,
      materialDescription: "feuille de rhubarbe en poudre",
    },
    duration: "Instantanée",
    concentration: false,
    ritual: false,
    classes: ["Wizard"],
    description: ["Une flèche acide file vers une cible."],
    source: "SRD-5.2.1",
    sourceLabel: "SRD 5.2.1",
  },
];

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await page.route("**/spell-languages.json", (route) => route.fulfill({ json: partialManifest }));
  await page.route("**/spells.srd.fr.json", (route) =>
    route.fulfill({ json: partialFrenchDataset }),
  );
});

async function switchLanguage(page: Page, option: RegExp) {
  await page.getByRole("button", { name: /Spell data language|Sprache der Zauberdaten/ }).click();
  await page
    .getByRole("listbox", { name: /Spell data languages|Sprachen der Zauberdaten/ })
    .getByRole("option", { name: option })
    .click();
}

test("switching to an incomplete translation requires confirmation and keeps the deck entry", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();

  await switchLanguage(page, /Français/);

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/not available in this language/i)).toBeVisible();
  await expect(dialog.getByText(/1 deck entry/)).toBeVisible();
  await expect(dialog.getByText(/distinct spell: 1/)).toBeVisible();

  // Cancel changes neither language nor deck.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: /English/ })).toBeVisible();
  const deck = page.getByRole("region", { name: "Active deck" });
  await expect(deck.getByText("Fireball")).toBeVisible();

  // Confirm keeps the entry as a non-printable placeholder.
  await switchLanguage(page, /Français/);
  await page.getByRole("dialog").getByRole("button", { name: "Switch language" }).click();
  await expect(page.getByRole("button", { name: /Français/ })).toBeVisible();
  await expect(deck.getByText(/Not available in fr/)).toBeVisible();
  await expect(deck.getByText(/0 printable/)).toBeVisible();
});

test("untranslated spells are absent from an incomplete target-language library", async ({
  page,
}) => {
  await page.goto("/");
  await switchLanguage(page, /Français/);

  const library = page.getByRole("region", { name: "Spell library" });
  await expect(library).toBeVisible();
  await expect(page.getByText("1 result")).toBeVisible();

  const search = page.getByLabel("Search spells");
  await search.fill("Fireball");
  await expect(page.getByText(/No spells match/)).toBeVisible();

  await search.fill("Flèche");
  await expect(library.getByText("Flèche acide", { exact: true })).toBeVisible();
});
