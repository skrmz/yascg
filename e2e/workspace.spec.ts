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

for (const language of ["en", "de"]) {
  test(`deck names and controls align as the pane resizes (${language})`, async ({
    page,
  }, testInfo) => {
    const name = "Protection from Evil and Good";
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByLabel("Search spells").fill(name);
    await page.getByRole("button", { name: `Add ${name} to active deck`, exact: true }).click();
    await page.getByLabel("Search spells").fill("Fireball");
    await page.getByRole("button", { name: "Add Fireball to active deck", exact: true }).click();
    if (language === "de") {
      await page.getByRole("button", { name: /Spell data language/ }).click();
      await page.getByRole("option", { name: /Deutsch/ }).click();
      await expect(page.getByRole("textbox", { name: "Zauber suchen" })).toBeVisible();
    }

    for (const width of [320, 390, 700, 720, 820, 1024, 1199, 1200, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      const mode = width < 720 ? "compact" : width < 1200 ? "split" : "wide";
      await expect(page.locator("main")).toHaveAttribute("data-workspace-mode", mode);
      if (mode !== "wide") {
        await page.getByRole("tab", { name: "Deck", exact: true }).click();
      }
      if (width === 390) {
        const settings = page.getByRole("button", {
          name: language === "de" ? "Deck-Einstellungen" : "Deck settings",
          exact: true,
        });
        await expect(settings).toHaveAttribute("aria-expanded", "false");
        await expect(page.locator("#deck-design-select")).toBeHidden();
        await expect(page.locator("#deck-background-select")).toBeHidden();
        const listHeight = (await page.locator("#deck-entries").boundingBox())!.height;
        const paneHeight = (await page.locator("#deck-panel").boundingBox())!.height;
        expect(listHeight / paneHeight).toBeGreaterThan(0.65);
        await settings.click();
        await expect(page.locator("#deck-name")).toBeVisible();
        await expect(page.locator("#deck-background-select")).toBeVisible();
        await page.locator("#deck-design-select").selectOption("compact");
        const expandedListHeight = (await page.locator("#deck-entries").boundingBox())!.height;
        expect(listHeight - expandedListHeight).toBeGreaterThan(100);
        await settings.click();
        await expect(page.locator("#deck-design-select")).toBeHidden();
        await settings.click();
        await expect(page.locator("#deck-design-select")).toHaveValue("compact");
        await settings.click();
      }
      const rows = page.locator("#deck-entries > li");
      const row = rows.first();
      const title = row.getByRole("button").first();
      await expect(title).toBeVisible();
      const titleBox = (await title.boundingBox())!;
      const rowBox = (await row.boundingBox())!;
      expect(titleBox.width).toBeGreaterThanOrEqual(Math.min(200, rowBox.width - 64));
      const text = title.locator("span");
      expect(await text.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      const fit = row.getByRole("combobox");
      const fitBox = (await fit.boundingBox())!;
      const secondFitBox = (await rows.nth(1).getByRole("combobox").boundingBox())!;
      expect(secondFitBox.x).toBeCloseTo(fitBox.x, 0);
      expect(secondFitBox.width).toBeCloseTo(fitBox.width, 0);
      const singleRow = await page.locator("#deck-entries").evaluate((element) => {
        const style = getComputedStyle(element);
        return (
          element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) >=
          576
        );
      });
      if (singleRow) {
        expect(fitBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width);
        expect(
          Math.abs(fitBox.y + fitBox.height / 2 - titleBox.y - titleBox.height / 2),
        ).toBeLessThan(1);
      } else {
        expect(fitBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
        expect(fitBox.width).toBeLessThanOrEqual(160);
        const buttons = await row.locator("select + div button").all();
        const first = (await buttons[0].boundingBox())!;
        const second = (await buttons[1].boundingBox())!;
        expect(second.x - first.x).toBeCloseTo(first.width, 0);
      }
      if (width >= 1920) expect(singleRow).toBe(true);
      expect(
        await fit.evaluate((element) => {
          const select = element as HTMLSelectElement;
          const style = getComputedStyle(select);
          const context = document.createElement("canvas").getContext("2d")!;
          context.font = style.font;
          const labelWidth = context.measureText(select.selectedOptions[0].text).width;
          return (
            select.clientWidth >=
            labelWidth + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 20
          );
        }),
      ).toBe(true);
      for (const button of await row.locator("select + div button").all()) {
        const box = (await button.boundingBox())!;
        expect(Math.abs(box.y + box.height / 2 - fitBox.y - fitBox.height / 2)).toBeLessThan(1);
      }
      if (width === 390 || width === 2560) {
        await page
          .locator("#deck-panel")
          .screenshot({ path: testInfo.outputPath(`deck-${width}.png`) });
      }
      await noPageOverflow(page);
    }
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
  await page.getByRole("button", { name: "Deck settings", exact: true }).click();
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
    if (width < 720) {
      await touchTarget(page.getByRole("button", { name: "Deck settings", exact: true }));
      await page.getByRole("button", { name: "Deck settings", exact: true }).click();
    }
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
    if (viewport.width < 720) {
      await page.getByRole("button", { name: "Deck settings", exact: true }).click();
    }
    const legend = page.getByRole("button", { name: "Legend", exact: true });
    await legend.scrollIntoViewIfNeeded();
    await expect(legend).toBeInViewport({ ratio: 1 });
    const entry = page.getByRole("button", { name: "Show Fireball in details" });
    await entry.scrollIntoViewIfNeeded();
    await expect(entry).toBeInViewport({ ratio: 1 });
    await noPageOverflow(page);
  });
}
