import { expect, test, type Locator, type Page } from "@playwright/test";

// The fitter accepts up to 1px of rounding error between scrollHeight and
// clientHeight. Fractional layout can place the footer slightly past the
// measured box while still being considered a fit.
const FIT_TOLERANCE_PX = 1;
const FOOTER_FIT_TOLERANCE_PX = 2;

type Locale = {
  searchLabel?: string;
  libraryName?: string;
  detailsName?: string;
};

const germanUi: Locale = {
  searchLabel: "Zauber suchen",
  libraryName: "Zauberbibliothek",
  detailsName: "Zaubervorschau und Details",
};

async function addSpellToDeck(
  page: Page,
  search: string,
  result: RegExp,
  add: string,
  locale: Locale = {},
) {
  await page.getByLabel(locale.searchLabel ?? "Search spells").fill(search);
  await page
    .getByRole("region", { name: locale.libraryName ?? "Spell library" })
    .getByRole("button", { name: result })
    .first()
    .click();
  await page
    .getByRole("region", { name: locale.detailsName ?? "Spell preview and details" })
    .getByRole("button", { name: add })
    .first()
    .click();
}

async function selectGermanSpellData(page: Page) {
  await page.getByRole("button", { name: /Spell data language|Sprache der Zauberdaten/ }).click();
  await page
    .getByRole("listbox", { name: /Spell data languages|Sprachen der Zauberdaten/ })
    .getByRole("option", { name: /Deutsch/ })
    .click();
}

async function waitForMultiCardPagination(cards: Locator): Promise<number> {
  await expect
    .poll(
      async () => {
        const count = await cards.count();
        if (count < 2) return 0;

        const labels = (await cards.locator(".compact-pagination").allTextContents()).map((label) =>
          label.trim(),
        );
        return labels.length === count &&
          labels.every((label, index) => label === `${index + 1}/${count}`)
          ? count
          : 0;
      },
      { message: "Compact multi-card pagination should stabilize" },
    )
    .toBeGreaterThan(1);

  return cards.count();
}

function measureCard(card: Locator) {
  return card.evaluate((element) => {
    const measured = element.querySelector<HTMLElement>(".compact-card-measured");
    const footer = element.querySelector<HTMLElement>(".compact-footer");
    if (!measured || !footer) {
      throw new Error("Compact card is missing its measured region or footer");
    }

    return {
      overflow: measured.scrollHeight - measured.clientHeight,
      footerOverflow:
        footer.getBoundingClientRect().bottom - measured.getBoundingClientRect().bottom,
    };
  });
}

async function assertCardDoesNotOverflow(card: Locator) {
  await expect
    .poll(
      async () => {
        const { overflow, footerOverflow } = await measureCard(card);
        return {
          contentFits: overflow <= FIT_TOLERANCE_PX,
          footerFits: footerOverflow <= FOOTER_FIT_TOLERANCE_PX,
        };
      },
      { message: "card content and footer should fit within the printable region" },
    )
    .toEqual({ contentFits: true, footerFits: true });
}

test("switches between Classic and Compact in preview and print", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.goto("/");
  await addSpellToDeck(page, "Fireball", /^Fireball Level 3/, "Add");

  const design = page.getByLabel("Card design");
  const preview = page.locator(".card-preview-page");
  await expect(design).toHaveValue("classic");
  await expect(page.locator(".card-preview-page.spell-card-compact")).toHaveCount(0);
  await expect(page.locator(".card-preview-page.spell-card")).toHaveCount(1);
  await expect(preview).toHaveCount(1);

  await design.selectOption("compact");
  await expect(page.locator(".card-preview-page.spell-card-compact")).toHaveCount(1);
  await expect(preview.locator(".compact-level")).toBeVisible();
  await expect(preview.locator(".compact-footer")).toBeVisible();

  await page.getByRole("button", { name: "Print" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Print/ })
    .click();
  await expect(page.locator(".print-root .spell-card-compact")).toHaveCount(1);

  await design.selectOption("classic");
  await expect(page.locator(".card-preview-page.spell-card-compact")).toHaveCount(0);
  await expect(page.locator(".card-preview-page.spell-card")).toHaveCount(1);
  await expect(preview).toHaveCount(1);
});

test("defaults to Classic after a reload", async ({ page }) => {
  await page.goto("/");
  await addSpellToDeck(page, "Fireball", /^Fireball Level 3/, "Add");
  await page.getByLabel("Card design").selectOption("compact");
  await expect(page.locator(".card-preview-page.spell-card-compact")).toHaveCount(1);

  await page.reload();
  await addSpellToDeck(page, "Fireball", /^Fireball Level 3/, "Add");
  await expect(page.getByLabel("Card design")).toHaveValue("classic");
  await expect(page.locator(".card-preview-page.spell-card-compact")).toHaveCount(0);
  await expect(page.locator(".card-preview-page.spell-card")).toHaveCount(1);
  await expect(page.locator(".card-preview-page")).toHaveCount(1);
});

test("Compact keeps the duration note visible and linked", async ({ page }) => {
  await page.goto("/");
  await addSpellToDeck(page, "Glyph of Warding", /^Glyph of Warding Level 3/, "Add");
  await page.getByLabel("Card design").selectOption("compact");

  const card = page.locator(".card-preview-page.spell-card-compact").first();
  await expect(card).toHaveCount(1);

  const notes = card.locator(".compact-notes-list li");
  await expect(card.locator(".compact-notes")).toBeVisible();
  await expect(notes).toHaveCount(1);
  await expect(notes.first()).toContainText("or glyph triggered");

  const duration = card.getByLabel("Duration");
  await expect(duration).toBeVisible();
  const marker = duration.locator(".compact-note-marker");
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveText("¹");
  expect(
    await marker.evaluate((element) => element.getClientRects()[0]?.width ?? 0),
  ).toBeGreaterThan(0);

  const describedBy = await marker.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(card.locator(`[id="${describedBy}"]`)).toHaveCount(1);
});

test("Compact paginates a long German spell without clipping content", async ({ page }) => {
  await page.goto("/");
  await selectGermanSpellData(page);
  await addSpellToDeck(page, "Wunsch", /^Wunsch/, "Hinzufügen", germanUi);
  await page.getByLabel("Kartendesign").selectOption("compact");
  await page.getByLabel("Anpassungsmodus für Wunsch").selectOption("multi-card");

  const cards = page.locator(".card-preview-page.spell-card-compact");
  const cardCount = await waitForMultiCardPagination(cards);

  await expect(cards.first().locator(".compact-metadata")).toHaveCount(1);
  await expect(cards.first().locator(".compact-continuation")).toHaveCount(0);

  for (let index = 0; index < cardCount; index += 1) {
    const card = cards.nth(index);
    const pagination = card.locator(".compact-pagination");

    await expect(pagination).toHaveText(`${index + 1}/${cardCount}`);
    await expect(pagination).toBeVisible();
    await expect(card.locator(".compact-footer")).toBeVisible();
    await assertCardDoesNotOverflow(card);
  }

  for (let index = 1; index < cardCount; index += 1) {
    const card = cards.nth(index);
    await expect(card.locator(".compact-name")).toHaveText("Wunsch");
    await expect(card.locator(".compact-continuation")).toHaveText("Forts.");
    await expect(card.locator(".compact-metadata")).toHaveCount(0);
    await expect(card.locator(".compact-material")).toHaveCount(0);
  }

  const bodyText = (await cards.locator(".compact-body").allTextContents()).join(" ");
  expect(bodyText).toContain("Wunsch ist der mächtigste Zauber");
  expect(bodyText).toContain("nie wieder wirken kannst.");
});
