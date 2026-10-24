import { expect, test, type Page } from "@playwright/test";

/**
 * Cross-tab SRD override synchronization. Two pages in one browser context share
 * origin storage (IndexedDB) and BroadcastChannel, so an override saved/reset in
 * tab A must update tab B's spell, badge, and card without a manual refresh.
 *
 * Assertions are scoped to `.app-shell` to exclude the offscreen card-measurement
 * layer, which retains its last measured card until the next measurement.
 */
const shell = (page: Page) => page.locator(".app-shell");

async function selectFireball(page: Page) {
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("list", { name: "Spell results" })
    .getByRole("button", { name: /^Fireball/ })
    .first()
    .click();
}

test("SRD override save and reset propagate across tabs without a refresh", async ({ context }) => {
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  await Promise.all([tabA.goto("/"), tabB.goto("/")]);
  await Promise.all([selectFireball(tabA), selectFireball(tabB)]);

  // Both tabs start on the vanilla SRD spell.
  await expect(shell(tabA).getByText("SRD 5.2.1 *")).toHaveCount(0);
  await expect(shell(tabB).getByText("SRD 5.2.1 *")).toHaveCount(0);

  // Author a verbal note in tab A.
  await tabA.getByRole("button", { name: "Edit" }).click();
  await tabA.getByLabel("Verbal description").fill("Flamme der Zauberkraft");
  await tabA.getByRole("dialog").getByRole("button", { name: "Save spell" }).click();

  // Tab A updates locally; tab B updates only via the cross-tab notification.
  await expect(shell(tabA).getByText("SRD 5.2.1 *").first()).toBeVisible();
  await expect(shell(tabB).getByText("SRD 5.2.1 *").first()).toBeVisible();
  await expect(shell(tabB).getByText("ⓥ Flamme der Zauberkraft").first()).toBeVisible();
  await expect(
    tabB
      .locator(".card-preview-page")
      .getByText(/Flamme der Zauberkraft/)
      .first(),
  ).toBeVisible();

  // Reset in tab A reverts both tabs.
  await tabA.getByRole("button", { name: "Edit" }).click();
  await tabA.getByRole("dialog").getByRole("button", { name: "Reset to original" }).click();

  await expect(shell(tabA).getByText("SRD 5.2.1 *")).toHaveCount(0);
  await expect(shell(tabB).getByText("SRD 5.2.1 *")).toHaveCount(0);
  await expect(shell(tabB).getByText("ⓥ Flamme der Zauberkraft")).toHaveCount(0);
});
