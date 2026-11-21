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

for (const paper of ["letter", "A4"] as const) {
  test(`partially used ${paper} sheets preserve unmarked slots and centered physical geometry`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.print = () => undefined;
    });
    await page.goto("/");
    for (const spell of ["Fireball", "Shield", "Aid"]) {
      await page.getByLabel("Search spells").fill(spell);
      await page
        .getByRole("button", { name: `Add ${spell} to active deck`, exact: true })
        .first()
        .click();
    }
    await page.getByRole("button", { name: "Print", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Aid", exact: true }).uncheck();
    await dialog.getByLabel("Paper size").selectOption(paper);
    await dialog.getByLabel("Starting position").selectOption("4");
    await dialog.getByLabel("Skip position 5").check();
    await dialog.getByLabel("Cutting borders").check();
    await dialog.getByRole("button", { name: "Print 2 cards" }).click();
    await expect(page.getByText("Aid", { exact: true }).first()).toBeVisible();
    await page.emulateMedia({ media: "print" });

    const sheet = page.locator(".print-sheet");
    const positions = await sheet.locator(".print-cell").evaluateAll((cells) =>
      cells.map((cell) => ({
        name: cell.querySelector(".card-name")?.textContent ?? null,
        outline: getComputedStyle(cell).outlineStyle,
      })),
    );
    expect(positions.map(({ name }) => name)).toEqual([
      null,
      null,
      null,
      "Fireball",
      null,
      "Shield",
      null,
      null,
      null,
    ]);
    expect(positions.map(({ outline }) => outline)).toEqual([
      "none",
      "none",
      "none",
      "dashed",
      "none",
      "dashed",
      "dashed",
      "dashed",
      "dashed",
    ]);
    const pageBox = (await sheet.boundingBox())!;
    const grid = (await sheet.locator(".print-grid").boundingBox())!;
    const card = (await sheet.locator(".print-card").first().boundingBox())!;
    expect(card.width).toBeCloseTo(240, 1);
    expect(card.height).toBeCloseTo(336, 1);
    expect(grid.width).toBeCloseTo(720, 1);
    expect(grid.height).toBeCloseTo(1008, 1);
    expect(grid.x - pageBox.x).toBeCloseTo((pageBox.width - grid.width) / 2, 1);
    expect(grid.y - pageBox.y).toBeCloseTo((pageBox.height - grid.height) / 2, 1);
  });
}
