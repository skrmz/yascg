import { expect, test, type Locator, type Page } from "@playwright/test";

async function switchLanguage(page: Page, option: RegExp) {
  await page.getByRole("button", { name: /Spell data language/ }).click();
  await page
    .getByRole("listbox", { name: "Spell data languages" })
    .getByRole("option", { name: option })
    .click();
}

function bodyOverflow(cards: Locator) {
  return cards.evaluateAll((elements) =>
    elements.map((element) => {
      const body = element.querySelector<HTMLElement>(".card-body-measured");
      return body ? body.scrollHeight - body.clientHeight : 0;
    }),
  );
}

test("Wunsch multi-card continuations use compact headers in preview and print", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.goto("/");
  await switchLanguage(page, /Deutsch/);

  const library = page.getByRole("region", { name: "Spell library" });
  await page.getByLabel("Search spells").fill("Wunsch");
  await library.getByRole("button", { name: /^Wunsch/ }).click();

  const details = page.getByRole("region", { name: "Spell preview and details" });
  await details.getByRole("button", { name: "Add", exact: true }).click();

  const deck = page.getByRole("region", { name: "Active deck" });
  const fitMode = deck.getByLabel("Fit mode for Wunsch");
  const cards = details.locator(".card-preview-page");

  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator(".card-metadata")).toHaveCount(1);
  await expect(cards.first().locator(".card-continuation-label")).toHaveCount(0);

  await fitMode.selectOption("multi-card");

  await expect
    .poll(async () => cards.count(), { message: "Wunsch should paginate across cards" })
    .toBeGreaterThan(1);
  const cardCount = await cards.count();

  const first = cards.first();
  await expect(first.locator(".card-metadata")).toHaveCount(1);
  await expect(first.locator(".card-continuation-label")).toHaveCount(0);

  for (let index = 1; index < cardCount; index += 1) {
    const card = cards.nth(index);
    await expect(card.locator(".card-name")).toHaveText("Wunsch");
    await expect(card.locator(".card-level-school")).toContainText("Grad 9");
    await expect(card.locator(".card-continuation-label")).toHaveText("fortgesetzt");
    await expect(card.locator(".card-metadata")).toHaveCount(0);
    await expect(card.locator(".card-material")).toHaveCount(0);
    await expect(card.locator(".card-continuation")).toHaveText(`${index + 1}/${cardCount}`);
  }

  expect((await bodyOverflow(cards)).every((overflow) => overflow <= 1)).toBe(true);

  const previewText = (await cards.locator(".card-body").allTextContents()).join(" ");
  expect(previewText).toContain("Wunsch ist der mächtigste Zauber");
  expect(previewText).toContain("nie wieder wirken kannst.");

  const previewBox = await first.boundingBox();
  expect(previewBox).not.toBeNull();
  expect(Math.abs(previewBox!.width - 240)).toBeLessThan(2);
  expect(Math.abs(previewBox!.height - 336)).toBeLessThan(2);

  await page.getByRole("button", { name: "Print", exact: true }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Print/ })
    .click();

  const printCards = page.locator(".print-cell .spell-card");
  await expect(printCards).toHaveCount(cardCount);
  await expect(printCards.first().locator(".card-metadata")).toHaveCount(1);
  await expect(page.locator(".print-cell .spell-card .card-continuation-label")).toHaveText(
    Array.from({ length: cardCount - 1 }, () => "fortgesetzt"),
  );
  await expect(page.locator(".print-cell .spell-card .card-metadata")).toHaveCount(1);

  await page.emulateMedia({ media: "print" });
  expect((await bodyOverflow(printCards)).every((overflow) => overflow <= 1)).toBe(true);

  const printBox = await printCards.first().boundingBox();
  expect(printBox).not.toBeNull();
  expect(Math.abs(printBox!.width - 240)).toBeLessThan(2);
  expect(Math.abs(printBox!.height - 336)).toBeLessThan(2);
});
