import { expect, test } from "@playwright/test";

// Deterministic test-only sidecars. Production content is never used here.
test.use({ serviceWorkers: "block" });

const SHORT_TEXT = {
  description:
    "A streak of fire flashes to a point in range and explodes. Each creature in a 20-foot sphere makes a DEX save, taking 8d6 fire damage, or half on a success.",
  higherLevels: "Damage increases by 1d6 per slot level above 3rd.",
};

const SHORT_PHRASE = "A streak of fire flashes";

type SidecarResponder = (locale: string) => unknown;

async function routeSidecars(
  page: import("@playwright/test").Page,
  responder: SidecarResponder | Record<string, unknown>,
  status = 200,
): Promise<void> {
  await page.route("**/spell-short-descriptions.*.json", (route) => {
    const url = route.request().url();
    const locale = url.includes(".de.json") ? "de" : "en";
    const body = typeof responder === "function" ? responder(locale) : responder;
    return route.fulfill({
      status,
      contentType: "application/json",
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  });
}

async function addFireball(page: import("@playwright/test").Page): Promise<void> {
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();
  const deck = page.getByRole("region", { name: "Active deck" });
  await expect(deck.getByText("1 entry")).toBeVisible();
}

async function openCopyEditor(page: import("@playwright/test").Page) {
  const details = page.getByRole("region", { name: "Spell preview and details" });
  await details.getByRole("button", { name: "Create editable copy" }).click();
  return page.getByRole("dialog", { name: "Create editable copy" });
}

test("applies a short description to an editable copy, undoes it, and prints the shortened text", async ({
  page,
}) => {
  await routeSidecars(page, {
    "srd-fireball": SHORT_TEXT,
  });
  await page.goto("/");
  await addFireball(page);

  const editor = await openCopyEditor(page);
  const description = editor.getByLabel("Description (Markdown)");
  const higherLevels = editor.getByLabel("Higher levels (Markdown, optional)");
  const original = await description.inputValue();
  expect(original).toContain("bright streak flashes");

  const apply = editor.getByRole("button", { name: "Apply short description" });
  await expect(apply).toBeEnabled();
  await apply.click();

  await expect(description).toHaveValue(SHORT_TEXT.description);
  await expect(higherLevels).toHaveValue(SHORT_TEXT.higherLevels);
  await expect(editor.getByRole("status")).toHaveText("Short description applied.");

  await editor.getByRole("button", { name: "Undo short description" }).click();
  await expect(description).toHaveValue(original);
  await expect(editor.getByRole("status")).toHaveText("Short description undone.");

  await apply.click();
  await editor.getByRole("button", { name: "Save spell" }).click();

  const confirmation = page.getByRole("dialog", { name: /Replace the deck entry/ });
  await confirmation.getByRole("button", { name: "Replace entry" }).click();
  await expect(page.getByText("The active deck entry now uses your custom copy.")).toBeVisible();

  const details = page.getByRole("region", { name: "Spell preview and details" });
  await details.getByRole("button", { name: "Show details" }).click();
  const dialog = page.getByRole("dialog", { name: "Fireball" });
  await expect(dialog.getByText(new RegExp(SHORT_PHRASE))).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Print" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Print/ })
    .click();
  await expect(page.locator(".print-root")).toContainText(SHORT_PHRASE);
});

test("keeps the original SRD spell text after applying a description to a copy", async ({
  page,
}) => {
  await routeSidecars(page, { "srd-fireball": SHORT_TEXT });
  await page.goto("/");
  await addFireball(page);

  const editor = await openCopyEditor(page);
  await editor.getByRole("button", { name: "Apply short description" }).click();
  await editor.getByRole("button", { name: "Save spell" }).click();
  await page
    .getByRole("dialog", { name: /Replace the deck entry/ })
    .getByRole("button", { name: "Replace entry" })
    .click();
  await expect(page.getByText("The active deck entry now uses your custom copy.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByLabel("Search spells").fill("Fireball");
  await page.getByRole("button", { name: /^Fireball Level 3 · Evocation SRD 5\.2\.1$/ }).click();

  const details = page.getByRole("region", { name: "Spell preview and details" });
  await expect(details.getByText(/bright streak flashes/)).toBeVisible();
  await expect(details.getByText(new RegExp(SHORT_PHRASE))).toHaveCount(0);
});
test("shows the action disabled with a hint when no entry exists", async ({ page }) => {
  await routeSidecars(page, {});
  await page.goto("/");
  await addFireball(page);

  const editor = await openCopyEditor(page);
  const apply = editor.getByRole("button", { name: "Apply short description" });
  await expect(apply).toBeVisible();
  await expect(apply).toBeDisabled();
  await expect(editor.getByText("Not available for this spell or language.")).toBeVisible();

  const name = editor.getByLabel("Name");
  await name.fill("Fireball (Manual)");
  await expect(name).toHaveValue("Fireball (Manual)");
  await expect(editor.getByLabel("Description (Markdown)")).toBeEditable();
});

test("keeps the editor usable when the sidecar request fails", async ({ page }) => {
  await routeSidecars(page, {}, 404);
  await page.goto("/");
  await addFireball(page);

  const editor = await openCopyEditor(page);
  await expect(editor.getByRole("button", { name: "Apply short description" })).toBeDisabled();

  await editor.getByLabel("Name").fill("Fireball (Manual)");
  await editor.getByRole("button", { name: "Save spell" }).click();
  await expect(page.getByRole("dialog", { name: /Replace the deck entry/ })).toBeVisible();
});

test("does not offer the action when a saved copy is reopened through the edit path", async ({
  page,
}) => {
  await routeSidecars(page, { "srd-fireball": SHORT_TEXT });
  await page.goto("/");
  await addFireball(page);

  const editor = await openCopyEditor(page);
  await editor.getByRole("button", { name: "Save spell" }).click();
  await page
    .getByRole("dialog", { name: /Replace the deck entry/ })
    .getByRole("button", { name: "Replace entry" })
    .click();
  await expect(page.getByText("The active deck entry now uses your custom copy.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit custom spell" });
  await expect(edit).toBeVisible();
  await expect(edit.getByRole("button", { name: "Apply short description" })).toHaveCount(0);
});

async function switchToGerman(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: /Spell data language/ }).click();
  await page
    .getByRole("listbox", { name: /Spell data languages/ })
    .getByRole("option", { name: /Deutsch/ })
    .click();
  await expect(page.getByRole("button", { name: /Deutsch/ })).toBeVisible();
}

test("uses the German sidecar when the data language is German", async ({ page }) => {
  const germanText = "Ein heller Lichtstrahl trifft einen Punkt in Reichweite und explodiert.";
  await routeSidecars(page, (locale) =>
    locale === "de"
      ? { "srd-fireball": { description: germanText } }
      : { "srd-fireball": SHORT_TEXT },
  );
  await page.goto("/");
  await switchToGerman(page);

  await page.getByLabel("Zauber suchen").fill("Feuerball");
  await page
    .getByRole("button", { name: "Feuerball zum aktiven Deck hinzufügen", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Zaubervorschau und Details" })
    .getByRole("button", { name: "Bearbeitbare Kopie erstellen" })
    .click();

  const editor = page.getByRole("dialog", { name: "Bearbeitbare Kopie erstellen" });
  const apply = editor.getByRole("button", { name: "Kurzbeschreibung anwenden" });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(editor.getByLabel("Beschreibung (Markdown)")).toHaveValue(germanText);
});

test("never falls back to the English sidecar for German", async ({ page }) => {
  await routeSidecars(page, (locale) => (locale === "de" ? {} : { "srd-fireball": SHORT_TEXT }));
  await page.goto("/");
  await switchToGerman(page);

  await page.getByLabel("Zauber suchen").fill("Feuerball");
  await page
    .getByRole("button", { name: "Feuerball zum aktiven Deck hinzufügen", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Zaubervorschau und Details" })
    .getByRole("button", { name: "Bearbeitbare Kopie erstellen" })
    .click();

  const editor = page.getByRole("dialog", { name: "Bearbeitbare Kopie erstellen" });
  const apply = editor.getByRole("button", { name: "Kurzbeschreibung anwenden" });
  await expect(apply).toBeVisible();
  await expect(apply).toBeDisabled();
  await expect(
    editor.getByText("Für diesen Zauber oder diese Sprache nicht verfügbar."),
  ).toBeVisible();
});
