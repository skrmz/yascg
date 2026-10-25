import { expect, test, type Locator, type Page } from "@playwright/test";

async function switchLanguage(page: Page, option: RegExp) {
  await page.getByRole("button", { name: /Spell data language/ }).click();
  await page
    .getByRole("listbox", { name: "Spell data languages" })
    .getByRole("option", { name: option })
    .click();
}

async function addWunsch(page: Page) {
  const library = page.getByRole("region", { name: "Spell library" });
  await page.getByLabel("Search spells").fill("Wunsch");
  await library.getByRole("button", { name: /^Wunsch/ }).click();

  const details = page.getByRole("region", { name: "Spell preview and details" });
  await details.getByRole("button", { name: "Add", exact: true }).click();

  const deck = page.getByRole("region", { name: "Active deck" });
  return { details, fitMode: deck.getByLabel("Fit mode for Wunsch") };
}

function bodyOverflow(cards: Locator) {
  return cards.evaluateAll((elements) =>
    elements.map((element) => {
      const body = element.querySelector<HTMLElement>(".card-body-measured");
      return body ? body.scrollHeight - body.clientHeight : 0;
    }),
  );
}

async function expectContinuationLayout(cards: Locator, count: number) {
  const first = cards.first();
  await expect(first.locator(".card-metadata")).toHaveCount(1);
  await expect(first.locator(".card-continuation-label")).toHaveCount(0);

  for (let index = 1; index < count; index += 1) {
    const card = cards.nth(index);
    await expect(card.locator(".card-name")).toHaveText("Wunsch");
    await expect(card.locator(".card-level-school")).toContainText("Grad 9");
    await expect(card.locator(".card-continuation-label")).toHaveText("fortgesetzt");
    await expect(card.locator(".card-metadata")).toHaveCount(0);
    await expect(card.locator(".card-material")).toHaveCount(0);
    await expect(card.locator(".card-continuation")).toHaveText(`${index + 1}/${count}`);
  }
}

async function expectPrintedCards(page: Page, count: number) {
  await page.getByRole("button", { name: "Print", exact: true }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Print/ })
    .click();
  const printCards = page.locator(".print-cell .spell-card");
  await expect(printCards).toHaveCount(count);
  return printCards;
}

test("Wunsch auto-shrink truncates to one card with a visible ellipsis", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.goto("/");
  await switchLanguage(page, /Deutsch/);

  const { details, fitMode } = await addWunsch(page);
  const cards = details.locator(".card-preview-page");

  await expect(fitMode).toHaveValue("auto-shrink");
  await expect(cards).toHaveCount(1);
  await expect(details.getByText(/Description truncated to fit on one card at 6pt/)).toBeVisible();
  await expect(details.getByText(/Switch to multi-card mode/)).toBeVisible();
  await expect(cards.first()).toHaveAttribute("style", /--body-font-pt: 6pt/);
  await expect(cards.first().locator(".card-metadata")).toHaveCount(1);
  await expect(cards.first().locator(".card-continuation-label")).toHaveCount(0);

  const previewBody = (await cards.first().locator(".card-body").textContent()) ?? "";
  expect(previewBody.trimEnd().endsWith("\u2026")).toBe(true);
  expect(previewBody).toContain("Wunsch ist der mächtigste Zauber");
  expect(previewBody).not.toContain("nie wieder wirken kannst.");
  expect((await bodyOverflow(cards))[0]).toBeLessThanOrEqual(1);

  const previewBox = await cards.first().boundingBox();
  expect(previewBox).not.toBeNull();
  expect(Math.abs(previewBox!.width - 240)).toBeLessThan(2);
  expect(Math.abs(previewBox!.height - 336)).toBeLessThan(2);

  const printCards = await expectPrintedCards(page, 1);
  const printBody = (await printCards.first().locator(".card-body").textContent()) ?? "";
  expect(printBody.trimEnd().endsWith("\u2026")).toBe(true);
  expect(printBody).toContain("Wunsch ist der mächtigste Zauber");
  expect(
    await page
      .locator(".print-root")
      .getByText(/Description truncated/)
      .count(),
  ).toBe(0);
  expect((await bodyOverflow(printCards))[0]).toBeLessThanOrEqual(1);
});

test("multi-card previews arrange cards in responsive rows", async ({ page }) => {
  await page.goto("/");
  await switchLanguage(page, /Deutsch/);

  const { details, fitMode } = await addWunsch(page);
  const cards = details.locator(".card-preview-page");

  await fitMode.selectOption("multi-card");
  await expect
    .poll(async () => cards.count(), { message: "Multi-card should paginate Wunsch" })
    .toBeGreaterThan(1);

  const firstBox = await cards.nth(0).boundingBox();
  const secondBox = await cards.nth(1).boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  // Physical dimensions are preserved and adjacent cards share a row.
  expect(Math.abs(firstBox!.width - 240)).toBeLessThan(2);
  expect(Math.abs(firstBox!.height - 336)).toBeLessThan(2);
  expect(Math.abs(firstBox!.y - secondBox!.y)).toBeLessThan(2);

  await page.setViewportSize({ width: 360, height: 800 });
  await expect
    .poll(
      async () => {
        const narrowFirst = await cards.nth(0).boundingBox();
        const narrowSecond = await cards.nth(1).boundingBox();
        return narrowFirst && narrowSecond ? Math.abs(narrowFirst.y - narrowSecond.y) : 0;
      },
      { message: "Narrow viewports should wrap continuation cards" },
    )
    .toBeGreaterThan(10);
});

test("Wunsch multi-card keeps the full description across cards", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.goto("/");
  await switchLanguage(page, /Deutsch/);

  const { details, fitMode } = await addWunsch(page);
  const cards = details.locator(".card-preview-page");

  await fitMode.selectOption("multi-card");
  await expect
    .poll(async () => cards.count(), { message: "Multi-card should paginate Wunsch" })
    .toBeGreaterThan(1);
  const cardCount = await cards.count();

  await expect(details.getByText(/Description truncated/)).toHaveCount(0);
  await expectContinuationLayout(cards, cardCount);
  expect((await bodyOverflow(cards)).every((overflow) => overflow <= 1)).toBe(true);

  const previewText = (await cards.locator(".card-body").allTextContents()).join(" ");
  expect(previewText).toContain("Wunsch ist der mächtigste Zauber");
  expect(previewText).toContain("nie wieder wirken kannst.");

  const previewBox = await cards.first().boundingBox();
  expect(previewBox).not.toBeNull();
  expect(Math.abs(previewBox!.width - 240)).toBeLessThan(2);
  expect(Math.abs(previewBox!.height - 336)).toBeLessThan(2);

  const printCards = await expectPrintedCards(page, cardCount);
  await expectContinuationLayout(printCards, cardCount);

  const printText = (await printCards.locator(".card-body").allTextContents()).join(" ");
  expect(printText).toContain("Wunsch ist der mächtigste Zauber");
  expect(printText).toContain("nie wieder wirken kannst.");

  await page.emulateMedia({ media: "print" });
  expect((await bodyOverflow(printCards)).every((overflow) => overflow <= 1)).toBe(true);

  const printBox = await printCards.first().boundingBox();
  expect(printBox).not.toBeNull();
  expect(Math.abs(printBox!.width - 240)).toBeLessThan(2);
  expect(Math.abs(printBox!.height - 336)).toBeLessThan(2);
});
