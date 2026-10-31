import { expect, test } from "@playwright/test";

async function addFireballToDeck(page: import("@playwright/test").Page) {
  await page.getByLabel("Search spells").fill("Fireball");
  await page
    .getByRole("region", { name: "Spell library" })
    .getByRole("button", { name: /^Fireball Level 3/ })
    .click();
  await page
    .getByRole("button", { name: /Add Fireball/ })
    .first()
    .click();
}

test("switches between Classic and Compact in preview and print", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.goto("/");
  await addFireballToDeck(page);

  const design = page.getByLabel("Card design");
  await expect(design).toHaveValue("classic");
  await expect(page.locator(".card-preview-page.spell-card-compact")).toHaveCount(0);

  await design.selectOption("compact");
  await expect(page.locator(".card-preview-page.spell-card-compact")).toHaveCount(1);
  await expect(page.locator(".card-preview-page .compact-level")).toBeVisible();
  await expect(page.locator(".card-preview-page .compact-footer")).toBeVisible();

  await page.getByRole("button", { name: "Print" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Print/ })
    .click();
  await expect(page.locator(".print-root .spell-card-compact")).toHaveCount(1);

  await design.selectOption("classic");
  await expect(page.locator(".card-preview-page.spell-card")).toHaveCount(1);
  await expect(page.locator(".card-preview-page.spell-card-compact")).toHaveCount(0);
});

test("defaults to Classic after a reload", async ({ page }) => {
  await page.goto("/");
  await addFireballToDeck(page);
  await page.getByLabel("Card design").selectOption("compact");
  await expect(page.locator(".card-preview-page.spell-card-compact")).toHaveCount(1);

  await page.reload();
  await addFireballToDeck(page);
  await expect(page.getByLabel("Card design")).toHaveValue("classic");
  await expect(page.locator(".card-preview-page.spell-card-compact")).toHaveCount(0);
});

test("Compact keeps the duration caret note visible and linked", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Glyph of Warding");
  await page
    .getByRole("region", { name: "Spell library" })
    .getByRole("button", { name: /^Glyph of Warding Level 3/ })
    .click();
  await page
    .getByRole("button", { name: /Add Glyph of Warding/ })
    .first()
    .click();
  await page.getByLabel("Card design").selectOption("compact");

  const card = page.locator(".card-preview-page.spell-card-compact").first();
  await expect(card).toHaveCount(1);
  await expect(card.locator(".compact-notes")).toBeVisible();
  await expect(card.locator(".compact-notes-list li")).toHaveCount(1);
  await expect(card.getByText("or glyph triggered")).toBeVisible();

  const describedBy = await card
    .locator(".compact-note-marker")
    .first()
    .getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(card.locator(`#${describedBy}`)).toHaveCount(1);
});

test("Compact aligns title badges, components, concentration, and material", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Dragon's Breath");
  await page
    .getByRole("region", { name: "Spell library" })
    .getByRole("button", { name: /^Dragon's Breath/ })
    .click();
  await page
    .getByRole("button", { name: /Add Dragon's Breath/ })
    .first()
    .click();
  await page.getByLabel("Card design").selectOption("compact");

  const card = page.locator(".card-preview-page.spell-card-compact").first();
  await expect(card).toHaveCount(1);

  const styles = await card.evaluate((element) => {
    const rect = (selector: string) => {
      const node = element.querySelector<HTMLElement>(selector);
      return node ? node.getBoundingClientRect() : null;
    };
    const computed = (selector: string, property: string) => {
      const node = element.querySelector<HTMLElement>(selector);
      return node ? getComputedStyle(node).getPropertyValue(property) : null;
    };
    const level = rect(".compact-level");
    const name = rect(".compact-name");
    const component = rect(".compact-component-box");
    const concentration = rect(".compact-concentration");
    const material = rect(".compact-material");
    const body = rect(".compact-body");
    return {
      titleAlign: computed(".compact-title-row", "align-items"),
      componentSizing: computed(".compact-component-box", "box-sizing"),
      materialAlign: computed(".compact-material", "text-align"),
      levelCenter: level ? (level.top + level.bottom) / 2 : null,
      nameCenter: name ? (name.top + name.bottom) / 2 : null,
      componentHeight: component?.height ?? null,
      concentrationHeight: concentration?.height ?? null,
      materialBottom: material?.bottom ?? null,
      bodyTop: body?.top ?? null,
    };
  });

  expect(styles.titleAlign).toBe("center");
  expect(styles.componentSizing).toBe("border-box");
  expect(styles.materialAlign).toBe("right");
  expect(Math.abs(styles.levelCenter! - styles.nameCenter!)).toBeLessThan(1.5);
  expect(Math.abs(styles.componentHeight! - styles.concentrationHeight!)).toBeLessThan(0.5);
  expect(styles.bodyTop! - styles.materialBottom!).toBeGreaterThan(1);
});

test("Compact German multi-card keeps continuation chrome aligned", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Spell data language|Sprache der Zauberdaten/ }).click();
  await page
    .getByRole("listbox", { name: /Spell data languages|Sprachen der Zauberdaten/ })
    .getByRole("option", { name: /Deutsch/ })
    .click();
  await page.getByLabel("Zauber suchen").fill("Wunsch");
  await page
    .getByRole("region", { name: "Zauberbibliothek" })
    .getByRole("button", { name: /^Wunsch/ })
    .first()
    .click();
  await page
    .getByRole("region", { name: "Zaubervorschau und Details" })
    .getByRole("button", { name: "Hinzufügen", exact: true })
    .click();
  await page.getByLabel("Kartendesign").selectOption("compact");
  await page.getByLabel("Anpassungsmodus für Wunsch").selectOption("multi-card");

  const cards = page.locator(".card-preview-page.spell-card-compact");
  await expect
    .poll(async () => cards.count(), { message: "Compact should paginate Wunsch in German" })
    .toBeGreaterThan(1);

  const layout = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const measured = element.querySelector<HTMLElement>(".compact-card-measured");
      const footer = element.querySelector<HTMLElement>(".compact-footer");
      const pagination = element.querySelector<HTMLElement>(".compact-pagination");
      const continuation = element.querySelector<HTMLElement>(".compact-continuation");
      const rect = (node: HTMLElement | null) => {
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { top: box.top, right: box.right, bottom: box.bottom, height: box.height };
      };
      return {
        measured: rect(measured),
        footer: rect(footer),
        pagination: rect(pagination),
        continuation: rect(continuation),
        overflow: measured ? measured.scrollHeight - measured.clientHeight : null,
        continuationText: continuation?.textContent ?? null,
        hasSchool: Boolean(element.querySelector(".compact-continuation-school")),
      };
    }),
  );

  expect(layout.length).toBeGreaterThan(1);
  for (const entry of layout) {
    expect(entry.overflow!).toBeLessThanOrEqual(1);
    expect(entry.footer!.bottom).toBeLessThanOrEqual(entry.measured!.bottom + 0.5);
    expect(entry.pagination!.bottom).toBeLessThanOrEqual(entry.footer!.top + 1);
  }
  for (const continuation of layout.slice(1)) {
    expect(continuation.continuationText).toBe("fortgesetzt");
    expect(continuation.hasSchool).toBe(false);
    expect(Math.abs(continuation.continuation!.right - continuation.measured!.right)).toBeLessThan(
      1,
    );
  }
});

test("Compact multi-card keeps first-card footer and pagination fully visible", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Search spells").fill("Prestidigitation");
  await page
    .getByRole("region", { name: "Spell library" })
    .getByRole("button", { name: /^Prestidigitation/ })
    .click();
  await page
    .getByRole("button", { name: /Add Prestidigitation/ })
    .first()
    .click();
  await page.getByLabel("Card design").selectOption("compact");
  await page.getByLabel("Fit mode for Prestidigitation").selectOption("multi-card");

  const cards = page.locator(".card-preview-page.spell-card-compact");
  await expect
    .poll(async () => cards.count(), { message: "Compact should paginate Prestidigitation" })
    .toBeGreaterThan(1);

  const layout = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const measured = element.querySelector<HTMLElement>(".compact-card-measured");
      const header = element.querySelector<HTMLElement>(".compact-header");
      const body = element.querySelector<HTMLElement>(".compact-body");
      const footer = element.querySelector<HTMLElement>(".compact-footer");
      const pagination = element.querySelector<HTMLElement>(".compact-pagination");
      const continuation = element.querySelector<HTMLElement>(".compact-continuation");
      const rect = (node: HTMLElement | null) => {
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return {
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          left: box.left,
          height: box.height,
        };
      };
      return {
        measured: rect(measured),
        header: rect(header),
        body: rect(body),
        footer: rect(footer),
        pagination: rect(pagination),
        continuation: rect(continuation),
        overflow: measured ? measured.scrollHeight - measured.clientHeight : null,
        hasMetadata: Boolean(element.querySelector(".compact-metadata")),
        hasContinuationSchool: Boolean(element.querySelector(".compact-continuation-school")),
      };
    }),
  );

  expect(layout.length).toBeGreaterThan(1);
  for (const entry of layout) {
    expect(entry.measured).not.toBeNull();
    expect(entry.footer).not.toBeNull();
    expect(entry.overflow).not.toBeNull();
    // The measured region includes the footer; any positive overflow means the
    // footer can be clipped by the card's hidden overflow.
    expect(entry.overflow!).toBeLessThanOrEqual(1);
    expect(entry.footer!.bottom).toBeLessThanOrEqual(entry.measured!.bottom + 0.5);
    expect(entry.pagination).not.toBeNull();
    expect(entry.pagination!.bottom).toBeLessThanOrEqual(entry.footer!.top + 1);
    expect(entry.footer!.height).toBeGreaterThan(4);
  }

  const first = layout[0]!;
  expect(first.hasMetadata).toBe(true);
  expect(first.continuation).toBeNull();

  for (const continuation of layout.slice(1)) {
    expect(continuation.hasMetadata).toBe(false);
    expect(continuation.hasContinuationSchool).toBe(false);
    expect(continuation.continuation).not.toBeNull();
    // The continuation label is right-aligned within the header/card.
    expect(Math.abs(continuation.continuation!.right - continuation.measured!.right)).toBeLessThan(
      1,
    );
    // Continuation headers reserve a small gap before the body.
    expect(continuation.body!.top - continuation.header!.bottom).toBeGreaterThan(1.5);
    // Pagination stays on the bottom row, immediately above the footer, even
    // when the body is short.
    expect(continuation.footer!.top - continuation.pagination!.bottom).toBeLessThan(6);
    expect(continuation.pagination!.top - continuation.body!.bottom).toBeGreaterThan(1);
  }
});
