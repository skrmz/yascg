import { expect, test } from "@playwright/test";

test("print dialog explains settings and renders a 9-up sheet", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed += 1;
    };
  });

  await page.goto("/");
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();

  await page.getByRole("button", { name: "Print" }).first().click();
  await expect(page.getByText("Print settings")).toBeVisible();
  await expect(page.getByText(/100% \/ Actual Size/)).toBeVisible();
  await expect(page.getByLabel("Paper size")).toHaveValue("letter");

  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Print/ })
    .click();

  await expect(page).toHaveTitle(/^spell-cards-deck-\d{4}-\d{2}-\d{2}$/);
  await expect(page.locator(".print-root")).toHaveCount(1);
  await expect(page.locator(".print-cell")).toHaveCount(9);
  await expect(page.locator(".print-cell .spell-card")).toHaveCount(1);

  await page.emulateMedia({ media: "print" });
  const printedCard = page.locator(".print-root .spell-card").first();
  await expect(printedCard).not.toHaveAttribute("data-card-background");
  expect(await printedCard.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe(
    "none",
  );

  const printed = await page.evaluate(() => (window as unknown as { __printed: number }).__printed);
  expect(printed).toBe(1);

  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page).toHaveTitle("YASCG - Yet Another Spell Card Generator");
});

test("prints the selected card background", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();

  const background = page.getByLabel("Card background");
  const preview = page.locator(".card-preview-page").first();
  const backgroundValue = await background.locator("option").nth(1).getAttribute("value");
  expect(backgroundValue).toBeTruthy();
  if (!backgroundValue) throw new Error("No bundled card background was discovered");
  await expect(background).toHaveValue("none");
  await expect(page.locator(".card-preview-page[data-card-background]")).toHaveCount(0);
  expect(await preview.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe(
    "none",
  );

  await background.selectOption(backgroundValue);
  await expect(
    page.locator(`.card-preview-page[data-card-background="${backgroundValue}"]`),
  ).toHaveCount(1);
  const previewImage = await preview.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );
  expect(previewImage).toContain(".jpg");

  await page.getByRole("button", { name: "Print" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Print/ })
    .click();
  await page.emulateMedia({ media: "print" });

  const printedCard = page.locator(".print-root .spell-card").first();
  await expect(printedCard).toHaveAttribute("data-card-background", backgroundValue);
  expect(await printedCard.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe(
    previewImage,
  );
});

test("A4 sheets use ISO A4 geometry", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();

  await page.getByRole("button", { name: "Print" }).first().click();
  await page.getByLabel("Paper size").selectOption("A4");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Print/ })
    .click();
  await page.emulateMedia({ media: "print" });

  const sheet = page.locator(".print-sheet-A4").first();
  await expect(sheet).toHaveCount(1);
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  // 210mm at 96dpi ~= 793.7px
  expect(Math.abs(box.width - 793.7)).toBeLessThan(6);
});
