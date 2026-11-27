import { expect, type Page } from "@playwright/test";

export async function openCardAppearance(page: Page) {
  const summary = page
    .locator("summary")
    .filter({ hasText: /^(Card appearance|Kartengestaltung)$/ });
  await expect(summary).toBeVisible();
  const disclosure = summary.locator("..");
  if ((await disclosure.getAttribute("open")) === null) await summary.click();
}

export async function openSpellAction(page: Page, name: string) {
  await page.getByRole("button", { name: /^(Spell actions|Zauberaktionen)$/ }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

export async function openDeckRename(page: Page) {
  const toggle = page.getByRole("button", { name: /^Rename deck |^Deck .+ umbenennen$/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  return page
    .locator("#deck-panel")
    .getByRole("textbox", { name: /Active deck name|Name des aktiven Decks/ });
}

export async function openTableFilters(page: Page) {
  const summary = page.locator(".deck-table-filters summary");
  if ((await summary.locator("..").getAttribute("open")) === null) await summary.click();
}

export async function openTableOutput(page: Page) {
  const summary = page.getByText("Table view & print", { exact: true });
  if ((await summary.locator("..").getAttribute("open")) === null) await summary.click();
}
