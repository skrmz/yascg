import { expect, test, type Page } from "@playwright/test";

const MOBILE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function openLibrary(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await expect(page.getByLabel("Search spells")).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Spell results" }).getByRole("listitem").first(),
  ).toBeVisible();
}

for (const viewport of MOBILE_VIEWPORTS) {
  test(`mobile library layout at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await openLibrary(page, viewport);

    const headerBox = await page.locator("header").boundingBox();
    expect(headerBox).not.toBeNull();
    expect(headerBox!.height).toBeLessThan(64);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Library actions" })).toBeVisible();

    const listBox = await page.getByRole("list", { name: "Spell results" }).boundingBox();
    const mainBox = await page.locator("main").boundingBox();
    expect(listBox).not.toBeNull();
    expect(mainBox).not.toBeNull();
    expect(listBox!.height).toBeGreaterThan(mainBox!.height * 0.5);

    const pageScrolls = await page.evaluate(
      () =>
        document.documentElement.scrollHeight > window.innerHeight + 1 ||
        document.body.scrollHeight > window.innerHeight + 1,
    );
    expect(pageScrolls).toBe(false);
  });
}

test("mobile filter sheet applies, chips, and resets filters", async ({ page }) => {
  await openLibrary(page, { width: 390, height: 844 });

  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();

  const sheetBox = await sheet.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(sheetBox!.y).toBeGreaterThanOrEqual(0);
  expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(845);

  await expect(sheet.getByRole("slider", { name: "Minimum level" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Class:/, exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "SRD", exact: true })).toBeVisible();
  const concentration = sheet.getByRole("combobox", { name: "Concentration" });
  await expect(concentration).toBeHidden();
  await expect(sheet.getByRole("status")).toContainText("spells match");
  await sheet.getByRole("button", { name: /Advanced Filters/ }).click();
  await concentration.scrollIntoViewIfNeeded();
  await expect(concentration).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Reset Filters", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Done", exact: true })).toBeVisible();

  await sheet.getByRole("button", { name: /^Class:/, exact: true }).click();
  await page.getByRole("checkbox", { name: "Wizard" }).check();
  await page.keyboard.press("Escape");
  await sheet.getByRole("button", { name: "Done", exact: true }).click();

  await expect(page.getByRole("button", { name: "Filters, 1 active" })).toBeVisible();
  const chip = page.getByRole("button", { name: "Remove Class: Wizard filter" });
  await expect(chip).toBeVisible();

  await chip.click();
  await expect(chip).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "Reset Filters", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
});

test("mobile actions menu stays available with empty results", async ({ page }) => {
  await openLibrary(page, { width: 390, height: 844 });
  await page.getByLabel("Search spells").fill("zzzz");
  await expect(page.getByText("No spells match the current search and filters.")).toBeVisible();

  await page.getByRole("button", { name: "Library actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Append all" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Replace deck" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Create custom spell" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Custom spell import/export" })).toBeVisible();

  await page.getByRole("menuitem", { name: "Create custom spell" }).click();
  await expect(page.getByRole("dialog", { name: "New custom spell" })).toBeVisible();
});

test("mobile search and add still work", async ({ page }) => {
  await openLibrary(page, { width: 390, height: 844 });

  await page.getByLabel("Search spells").fill("Fireball");
  await page.getByRole("button", { name: /Add Fireball to active deck/ }).click();
  await page.getByRole("tab", { name: "Deck" }).click();

  await expect(
    page.getByRole("region", { name: "Active deck" }).getByText("Fireball"),
  ).toBeVisible();
});

test("mobile list scroll, query, and filters survive a tab round-trip", async ({ page }) => {
  await openLibrary(page, { width: 390, height: 844 });

  await page.getByLabel("Search spells").fill("a");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await sheet.getByRole("button", { name: /^Class:/, exact: true }).click();
  await page.getByRole("checkbox", { name: "Wizard" }).check();
  await page.keyboard.press("Escape");
  await sheet.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove Class: Wizard filter" })).toBeVisible();

  const list = page.getByRole("list", { name: "Spell results" });
  const savedScroll = await list.evaluate((element) => {
    element.scrollTop = 200;
    element.dispatchEvent(new Event("scroll"));
    return element.scrollTop;
  });
  expect(savedScroll).toBeGreaterThan(100);

  await list.getByRole("listitem").nth(8).getByRole("button").first().click();
  await page.getByRole("tab", { name: "Library" }).click();
  await expect(page.getByRole("tab", { name: "Library" })).toHaveAttribute("aria-selected", "true");

  await expect(page.getByLabel("Search spells")).toHaveValue("a");
  await expect(page.getByRole("button", { name: "Remove Class: Wizard filter" })).toBeVisible();
  await expect.poll(async () => list.evaluate((element) => element.scrollTop)).toBe(savedScroll);
});

test("desktop keeps the inline filter stack and action buttons", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: /Advanced Filters/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Append all" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace deck" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create custom spell" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Custom spell import/export" })).toBeVisible();

  await expect(page.getByRole("button", { name: "Library actions" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toHaveCount(0);
});
