import { expect, test } from "@playwright/test";

test("creates an editable copy of an SRD spell and replaces the active deck entry", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();

  const deck = page.getByRole("region", { name: "Active deck" });
  await expect(deck.getByText("1 entry")).toBeVisible();

  const details = page.getByRole("region", { name: "Spell preview and details" });
  await details.getByRole("button", { name: "Create editable copy" }).click();

  const editor = page.getByRole("dialog", { name: "Create editable copy" });
  await expect(editor).toBeVisible();
  const name = editor.getByLabel("Name");
  await name.fill("Fireball (Homebrew)");
  await editor.getByRole("button", { name: "Save spell" }).click();

  const confirmation = page.getByRole("dialog", {
    name: 'Replace the deck entry with "Fireball (Homebrew)"?',
  });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Replace entry" }).click();

  await expect(page.getByText("The active deck entry now uses your custom copy.")).toBeVisible();
  await expect(deck.getByText("Fireball (Homebrew)")).toBeVisible();
  await expect(deck.getByText("1 entry")).toBeVisible();

  await page.getByLabel("Search spells").fill("Fireball");
  await expect(page.getByText("SRD 5.2.1").first()).toBeVisible();
});
