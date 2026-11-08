import { expect, test, type Locator, type Page } from "@playwright/test";

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > window.innerWidth,
      vertical: document.documentElement.scrollHeight > window.innerHeight + 1,
    })),
  ).toEqual({ horizontal: false, vertical: false });
}
async function touchTarget(control: Locator) {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}
for (const [width, height] of [
  [320, 568],
  [390, 844],
  [430, 932],
  [700, 900],
  [720, 900],
  [744, 1133],
  [820, 1180],
  [1024, 768],
  [1180, 820],
  [1199, 800],
  [1200, 800],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
]) {
  test(`workspace at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const mode = width < 720 ? "compact" : width < 1200 ? "split" : "wide";
    await expect(page.locator("main")).toHaveAttribute("data-workspace-mode", mode);
    await expect(page.getByLabel("Search spells")).toBeVisible();
    await expect(page.getByRole("tablist")).toHaveCount(mode === "wide" ? 0 : 1);
    await expect(page.getByRole("tab")).toHaveCount(mode === "wide" ? 0 : mode === "split" ? 2 : 3);
    if (mode === "wide") {
      for (const [pane, minimum] of [
        ["library", 320],
        ["details", 560],
        ["deck", 300],
      ] as const) {
        expect(
          (await page.locator(`[data-workspace-pane="${pane}"]`).boundingBox())!.width,
        ).toBeGreaterThanOrEqual(minimum);
      }
    } else {
      await touchTarget(page.getByRole("tab", { name: "Deck", exact: true }));
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      const sheet = page.getByRole("dialog", { name: "Filters" });
      await expect(sheet.getByRole("combobox", { name: "Concentration" })).toBeHidden();
      await touchTarget(sheet.getByRole("slider", { name: "Minimum level" }));
      await touchTarget(sheet.getByRole("button", { name: "Done", exact: true }));
      await expect(sheet.getByRole("button", { name: "All", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await sheet.getByRole("button", { name: "Done", exact: true }).click();
    }
    await noPageOverflow(page);
  });
}

test("container resizing preserves state and right-pane selection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const workspace = page.locator("main");
  await workspace.evaluate((element) => {
    element.style.width = "700px";
  });
  await expect(workspace).toHaveAttribute("data-workspace-mode", "compact");
  await page.getByLabel("Search spells").fill("Fireball");
  await page.getByRole("button", { name: /Add Fireball to active deck/ }).click();
  await page.getByRole("tab", { name: "Deck", exact: true }).click();
  const deckName = page.getByLabel("Active deck name", { exact: true });
  await deckName.fill("Unsubmitted name");
  await workspace.evaluate((element) => {
    element.style.width = "820px";
  });
  await expect(workspace).toHaveAttribute("data-workspace-mode", "split");
  await expect(page.getByRole("tab", { name: "Deck", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(deckName).toHaveValue("Unsubmitted name");
  await expect(page.getByLabel("Search spells")).toHaveValue("Fireball");
  await page.getByRole("button", { name: "Show Fireball in details" }).click();
  await expect(page.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Deck", exact: true }).click();
  await workspace.evaluate((element) => {
    element.style.width = "1200px";
  });
  await expect(workspace).toHaveAttribute("data-workspace-mode", "wide");
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await workspace.evaluate((element) => {
    element.style.width = "1024px";
  });
  await expect(page.getByRole("tab", { name: "Deck", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(deckName).toHaveValue("Unsubmitted name");
  await noPageOverflow(page);
});

for (const width of [390, 820, 1024, 1440]) {
  test(`preview scaling preserves physical cards and fitting at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByLabel("Search spells").fill("Wish");
    await page.getByRole("list", { name: "Spell results" }).getByRole("button").first().click();
    const cards = page.locator(".card-preview-page");
    await expect(cards.first()).toBeVisible();
    const original = await cards.evaluateAll((elements) =>
      elements.map((element) => ({
        width: (element as HTMLElement).offsetWidth,
        height: (element as HTMLElement).offsetHeight,
        text: element.textContent,
      })),
    );
    const scale = page.getByRole("combobox", { name: "Preview scale" });
    await expect(scale).toHaveValue("physical");
    await scale.selectOption("fit");
    expect(
      await cards.evaluateAll((elements) =>
        elements.map((element) => ({
          width: (element as HTMLElement).offsetWidth,
          height: (element as HTMLElement).offsetHeight,
          text: element.textContent,
        })),
      ),
    ).toEqual(original);
    const visualWidth = (await cards.first().boundingBox())!.width;
    expect(visualWidth).toBeGreaterThan(240);
    expect(visualWidth).toBeLessThanOrEqual(480);
    await noPageOverflow(page);
    await page.emulateMedia({ media: "print" });
    await expect(scale).toBeHidden();
    expect(
      await page
        .locator(".screen-preview-transform")
        .first()
        .evaluate((element) => getComputedStyle(element).transform),
    ).toBe("none");
  });
}

test("wide coarse-pointer controls retain touch targets", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await touchTarget(page.getByRole("button", { name: "Save as…", exact: true }));
  await touchTarget(page.getByRole("button", { name: "Legend", exact: true }));
  await context.close();
});

test("a container wider than its viewport still selects Split", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("main").evaluate((element) => {
    element.style.width = "800px";
  });
  await expect(page.locator("main")).toHaveAttribute("data-workspace-mode", "split");
  await expect(page.getByRole("tab")).toHaveCount(2);
});

for (const width of [390, 820, 1024]) {
  test(`deck and filter touch controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByLabel("Search spells").fill("Fireball");
    const add = page.getByRole("button", { name: /Add Fireball to active deck/ });
    await touchTarget(add);
    await add.click();
    await page.getByRole("tab", { name: "Deck", exact: true }).click();
    for (const name of [
      "Save as…",
      "Print",
      "Open…",
      "Deck actions",
      "Legend",
      "Move Fireball up",
      "Move Fireball down",
      "Remove Fireball",
    ]) {
      await touchTarget(page.getByRole("button", { name, exact: true }));
    }
    await touchTarget(page.getByRole("combobox", { name: "Fit mode for Fireball" }));
    await page.getByRole("button", { name: "Save as…", exact: true }).click();
    const save = page.getByRole("dialog", { name: "Save deck as" });
    await touchTarget(save.getByRole("button", { name: "Save", exact: true }));
    await touchTarget(save.getByRole("button", { name: "Cancel", exact: true }));
    await noPageOverflow(page);
  });
}

for (const width of [390, 1024, 1440]) {
  test(`keyboard primary flow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByLabel("Search spells").focus();
    await page.keyboard.type("Fireball");
    await page.getByRole("button", { name: /Add Fireball to active deck/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".card-preview-page").first()).toBeVisible();
    if (width < 1200) {
      await page.getByRole("tab", { name: "Details", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("tab", { name: "Deck", exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
    await page.getByRole("button", { name: "Save as…", exact: true }).focus();
    await page.keyboard.press("Enter");
    const save = page.getByRole("dialog", { name: "Save deck as" });
    await save.getByLabel("Active deck name").focus();
    await page.keyboard.type("Keyboard deck");
    await save.getByRole("button", { name: "Save", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(save).toBeHidden();
    await page.getByRole("button", { name: "Print", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: /Print/ })).toBeVisible();
  });
}

test("German Split controls and long spell names stay usable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/");
  await page.getByRole("button", { name: /Spell data language/ }).click();
  await page.getByRole("option", { name: /Deutsch/ }).click();
  const search = page.getByRole("textbox", { name: "Zauber suchen" });
  await search.fill("Schutz vor Gut und Böse");
  const results = page.getByRole("list", { name: "Ergebnisse" });
  await results.getByRole("button").first().click();
  await expect(page.locator(".card-preview-page").first()).toBeVisible();
  await page.getByRole("combobox", { name: "Vorschaumaßstab" }).selectOption("fit");
  await noPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("german-split-preview.png"),
    animations: "disabled",
  });
});

for (const viewport of [
  { width: 720, height: 450 },
  { width: 640, height: 400 },
]) {
  test(`workspace at equivalent 200% zoom ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByLabel("Search spells").fill("Fireball");
    await page.getByRole("button", { name: /Add Fireball to active deck/ }).click();
    await page.getByRole("tab", { name: "Deck", exact: true }).click();
    const legend = page.getByRole("button", { name: "Legend", exact: true });
    await legend.scrollIntoViewIfNeeded();
    await expect(legend).toBeInViewport({ ratio: 1 });
    const entry = page.getByRole("button", { name: "Show Fireball in details" });
    await entry.scrollIntoViewIfNeeded();
    await expect(entry).toBeInViewport({ ratio: 1 });
    await noPageOverflow(page);
  });
}
