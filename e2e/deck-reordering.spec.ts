import { expect, test, type Locator, type Page } from "@playwright/test";

const shortDeck = ["Fireball", "Wish", "Magic Missile"];
const longDeck = [
  ...shortDeck,
  "Light",
  "Mage Armor",
  "Arcane Eye",
  "Acid Splash",
  "Aid",
  "Bane",
  "Bless",
  "Alarm",
  "Missing Test Spell",
];

function grip(page: Page, name: string) {
  return page.getByRole("button", { name: `Reorder ${name}`, exact: true });
}

function activeGrip(page: Page) {
  return page.getByRole("button", { name: /^Reorder /, pressed: true });
}

async function expectOrder(page: Page, names: string[]) {
  await expect
    .poll(() =>
      page
        .locator("#deck-entries")
        .getByRole("button", { name: /^Reorder / })
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))),
    )
    .toEqual(names.map((name) => `Reorder ${name}`));
}

async function importDeck(page: Page, names: string[]) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Deck actions" }).click();
  await page.getByRole("menuitem", { name: "Import / export deck" }).click();
  const dialog = page.getByRole("dialog", { name: "Import / export deck" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "reordering.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        type: "deck",
        name: "Reordering Test",
        exportedAt: 0,
        entries: names.map((name) => ({
          spellId: `srd-${name.toLowerCase().replaceAll(" ", "-")}`,
          fitMode: "auto",
          reference: { name, source: "SRD-5.2.1" },
        })),
      }),
    ),
  });
  await dialog.getByRole("button", { name: "Replace active deck…" }).click();
  await expect(dialog).toBeHidden();
  await expectOrder(page, names);
}

async function saveDeck(page: Page) {
  await page.getByRole("button", { name: "Save as…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Save deck as" });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#deck-panel").getByText("Saved", { exact: true })).toBeVisible();
}

function activeDeckRevision(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("spell-cards-generator");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const read = db
            .transaction("collectionActiveDeck")
            .objectStore("collectionActiveDeck")
            .get("active");
          read.onsuccess = () => resolve(read.result.revision);
          read.onerror = () => reject(read.error);
          db.close();
        };
      }),
  );
}

async function center(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function mouseDrag(page: Page, activator: Locator, target: Locator) {
  const { x, y } = await center(activator);
  const destination = await center(target);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, destination.y, { steps: 12 });
  await page.mouse.up();
}

test("the mouse grip moves entries both ways and persists order", async ({ page }) => {
  await importDeck(page, shortDeck);
  const fireball = grip(page, "Fireball");
  const wish = grip(page, "Wish");
  const missile = grip(page, "Magic Missile");
  const fireballBody = page.getByRole("button", { name: "Show Fireball in details" });
  const revision = await activeDeckRevision(page);

  await mouseDrag(page, fireballBody, missile);
  await expectOrder(page, shortDeck);
  expect(await activeDeckRevision(page)).toBe(revision);

  await mouseDrag(page, fireball, missile);
  await expectOrder(page, ["Wish", "Magic Missile", "Fireball"]);
  expect(await activeDeckRevision(page)).toBe(revision + 1);
  await mouseDrag(page, fireball, wish);
  await expectOrder(page, shortDeck);
  await mouseDrag(page, wish, missile);
  await expectOrder(page, ["Fireball", "Magic Missile", "Wish"]);
  await page.reload();
  await expectOrder(page, ["Fireball", "Magic Missile", "Wish"]);
});

test("keyboard pickup, move, drop and cancel retain focus and update only the active deck", async ({
  page,
}) => {
  const names = ["Fireball", "Missing Test Spell", "Wish"];
  await importDeck(page, names);
  await saveDeck(page);
  const fireball = grip(page, "Fireball");
  const announcement = page.locator("#deck-entries-container").getByRole("status");
  const revision = await activeDeckRevision(page);
  await fireball.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(fireball).not.toBeFocused();
  await page.keyboard.press("Tab");
  await expect(fireball).toBeFocused();
  await expect(fireball).toHaveAccessibleDescription(/Space.*Enter.*Escape/i);

  await page.keyboard.press("Space");
  await expect(activeGrip(page)).toHaveCount(1);
  await expect(announcement).toHaveText("Picked up Fireball, position 1 of 3.");
  await page.keyboard.press("ArrowDown");
  await expect(announcement).toHaveText("Fireball, position 2 of 3.");
  expect(await activeDeckRevision(page)).toBe(revision);
  await page.keyboard.press("Escape");
  await expect(announcement).toHaveText("Reordering canceled for Fireball.");
  await expect(activeGrip(page)).toHaveCount(0);
  await expect(fireball).toBeFocused();
  await expectOrder(page, names);
  expect(await activeDeckRevision(page)).toBe(revision);
  await expect(page.locator("#deck-panel").getByText("Saved", { exact: true })).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(activeGrip(page)).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expectOrder(page, ["Missing Test Spell", "Fireball", "Wish"]);
  await expect(announcement).toHaveText("Dropped Fireball at position 2.");
  await expect(fireball).toBeFocused();
  expect(await activeDeckRevision(page)).toBe(revision + 1);
  await expect(
    page.locator("#deck-panel").getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Open…", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Open deck" })
    .getByRole("button", { name: "Open Reordering Test", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Replace the active deck?" })
    .getByRole("button", { name: /Replace|Open/ })
    .click();
  await expectOrder(page, names);
});

test("pointer release outside the list and unchanged drop clear feedback without persisting", async ({
  page,
}) => {
  await importDeck(page, shortDeck);
  const fireball = grip(page, "Fireball");
  const { x, y } = await center(fireball);
  const wish = await center(grip(page, "Wish"));
  const listBox = (await page.locator("#deck-entries").boundingBox())!;
  const revision = await activeDeckRevision(page);

  await page.mouse.click(x, y);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, wish.y, { steps: 12 });
  await expect(activeGrip(page)).toHaveCount(1);
  await page.mouse.move(listBox.x - 30, wish.y);
  await page.mouse.up();
  await expect(activeGrip(page)).toHaveCount(0);
  await expectOrder(page, shortDeck);
  expect(await activeDeckRevision(page)).toBe(revision);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y);
  await expect(activeGrip(page)).toHaveCount(1);
  await page.mouse.up();
  await expect(activeGrip(page)).toHaveCount(0);
  await expectOrder(page, shortDeck);
  expect(await activeDeckRevision(page)).toBe(revision);
});

test("keyboard movement scrolls an off-screen drop position into view", async ({ page }) => {
  await importDeck(page, longDeck);
  const list = page.locator("#deck-entries");
  const announcement = page.locator("#deck-entries-container").getByRole("status");
  const fireball = grip(page, "Fireball");
  const last = grip(page, "Missing Test Spell");
  await expect(last).not.toBeInViewport();
  await fireball.focus();
  await page.keyboard.press("Space");
  await expect(activeGrip(page)).toHaveCount(1);
  for (let index = 1; index < longDeck.length; index += 1) {
    await page.keyboard.press("ArrowDown");
    await expect(announcement).toHaveText(`Fireball, position ${index + 1} of ${longDeck.length}.`);
  }
  await expect(last).toBeInViewport();
  expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press("ArrowUp");
  await expect(announcement).toHaveText(
    `Fireball, position ${longDeck.length - 1} of ${longDeck.length}.`,
  );
  await page.keyboard.press("Space");
  await expectOrder(page, [...longDeck.slice(1, -1), "Fireball", longDeck.at(-1)!]);
  await expect(fireball).toBeFocused();
  await expect(fireball).toBeInViewport();
});

test("the accessible move buttons still reorder entries", async ({ page }) => {
  await importDeck(page, shortDeck);
  await page.getByRole("button", { name: "Move Fireball down", exact: true }).click();
  await expectOrder(page, ["Wish", "Fireball", "Magic Missile"]);
  await page.getByRole("button", { name: "Move Fireball up", exact: true }).click();
  await expectOrder(page, shortDeck);
});

test("a concurrent deck edit invalidates an active drag", async ({ page, context }) => {
  await importDeck(page, shortDeck);
  const other = await context.newPage();
  await other.setViewportSize({ width: 1440, height: 900 });
  await other.goto("/");
  const fireball = await center(grip(page, "Fireball"));
  const missile = await center(grip(page, "Magic Missile"));
  const revision = await activeDeckRevision(page);

  await page.mouse.move(fireball.x, fireball.y);
  await page.mouse.down();
  await page.mouse.move(fireball.x, missile.y, { steps: 12 });
  await expect(activeGrip(page)).toHaveCount(1);
  await other.getByRole("button", { name: "Remove Wish", exact: true }).click();
  await expect(grip(page, "Wish")).toHaveCount(0);
  const remainingTarget = await center(grip(page, "Magic Missile"));
  await page.mouse.move(remainingTarget.x, remainingTarget.y);
  await page.mouse.up();
  await expect(activeGrip(page)).toHaveCount(0);
  await expectOrder(page, ["Fireball", "Magic Missile"]);
  expect(await activeDeckRevision(page)).toBe(revision + 1);
});

test.describe("touch input", () => {
  test.use({ hasTouch: true });

  test("row swipes scroll while hold-to-drag, taps and cancellation preserve their distinct behavior", async ({
    page,
    context,
  }) => {
    await importDeck(page, longDeck);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Deck", exact: true }).click();
    const list = page.locator("#deck-entries");
    const body = await center(page.getByRole("button", { name: "Show Light in details" }));
    const cdp = await context.newCDPSession(page);
    const touchStart = (point: { x: number; y: number }) =>
      cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    const touchMove = (point: { x: number; y: number }) =>
      cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
    const touchEnd = () =>
      cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const revision = await activeDeckRevision(page);

    await touchStart(body);
    for (let step = 1; step <= 6; step += 1) {
      await touchMove({ x: body.x, y: body.y - step * 24 });
    }
    await touchEnd();
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(30);
    await expectOrder(page, longDeck);

    const fireball = grip(page, "Fireball");
    await fireball.scrollIntoViewIfNeeded();
    const start = await center(fireball);
    const wish = await center(grip(page, "Wish"));
    await page.touchscreen.tap(start.x, start.y);
    await expect(activeGrip(page)).toHaveCount(0);
    await touchStart(start);
    await touchMove({ x: start.x, y: start.y + 36 });
    await touchMove(wish);
    await touchEnd();
    await expect(activeGrip(page)).toHaveCount(0);
    await expectOrder(page, longDeck);
    expect(await activeDeckRevision(page)).toBe(revision);

    await page.evaluate(() => {
      window.addEventListener(
        "pointercancel",
        (event) => {
          document.body.dataset.cancelledPointer = event.pointerType;
        },
        { once: true },
      );
    });
    await touchStart(start);
    await expect(activeGrip(page)).toHaveCount(1);
    await touchMove({ x: start.x, y: start.y + 24 });
    await touchMove(wish);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect(page.locator("body")).toHaveAttribute("data-cancelled-pointer", "touch");
    await expect(activeGrip(page)).toHaveCount(0);
    await expectOrder(page, longDeck);
    expect(await activeDeckRevision(page)).toBe(revision);

    await touchStart(start);
    await expect(activeGrip(page)).toHaveCount(1);
    await touchMove({ x: start.x, y: start.y + 24 });
    await touchMove(wish);
    await touchEnd();
    const reordered = ["Wish", "Fireball", ...longDeck.slice(2)];
    await expectOrder(page, reordered);
    await page.reload();
    await page.getByRole("tab", { name: "Deck", exact: true }).click();
    await expectOrder(page, reordered);
  });
});

test("a browser pen tap leaves order intact and a pen drag reorders", async ({ page, context }) => {
  await importDeck(page, shortDeck);
  const start = await center(grip(page, "Fireball"));
  const wish = await center(grip(page, "Wish"));
  const cdp = await context.newCDPSession(page);
  await page.evaluate(() => {
    window.addEventListener("pointerdown", (event) => {
      document.body.dataset.inputPointer = event.pointerType;
    });
  });
  const penEvent = (
    type: "mousePressed" | "mouseReleased" | "mouseMoved",
    point: { x: number; y: number },
  ) =>
    cdp.send("Input.dispatchMouseEvent", {
      type,
      ...point,
      pointerType: "pen",
      button: type === "mouseMoved" ? "none" : "left",
      buttons: type === "mouseReleased" ? 0 : 1,
    });

  await penEvent("mousePressed", start);
  await penEvent("mouseReleased", start);
  await expect(page.locator("body")).toHaveAttribute("data-input-pointer", "pen");
  await expectOrder(page, shortDeck);
  await penEvent("mousePressed", start);
  await penEvent("mouseMoved", { x: start.x, y: start.y + 24 });
  await expect(activeGrip(page)).toHaveCount(1);
  await penEvent("mouseMoved", wish);
  await penEvent("mouseReleased", wish);
  await expectOrder(page, ["Wish", "Fireball", "Magic Missile"]);
});

for (const { height, scroller } of [
  { height: 900, scroller: "#deck-entries" },
  { height: 540, scroller: "#deck-panel" },
]) {
  test(`long deck auto-scrolls at both edges and drops on revealed rows (${height}px)`, async ({
    page,
  }) => {
    await importDeck(page, longDeck);
    await page.setViewportSize({ width: 1440, height });
    const scrollRegion = page.locator(scroller);
    const first = grip(page, "Fireball");
    const last = grip(page, "Missing Test Spell");
    await expect(last).not.toBeInViewport();
    const scrollTop = () => scrollRegion.evaluate((element) => element.scrollTop);
    const region = (await scrollRegion.boundingBox())!;
    const { x, y } = await center(first);

    await page.mouse.move(x, y);
    await page.mouse.down();
    const bottomEdge = region.y + region.height - 10;
    await page.mouse.move(x, bottomEdge, { steps: 12 });
    await page.waitForFunction(
      (selector) => document.querySelector(selector)!.scrollTop > 10,
      scroller,
    );
    await page.mouse.move(region.x - 20, bottomEdge);
    const outside = await scrollRegion.evaluate(async (element) => {
      const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await frame();
      await frame();
      const start = element.scrollTop;
      for (let step = 0; step < 6; step += 1) await frame();
      return {
        change: element.scrollTop - start,
        remaining: element.scrollHeight - element.clientHeight - element.scrollTop,
      };
    });
    expect(outside.change).toBe(0);
    expect(outside.remaining).toBeGreaterThan(25);
    await page.mouse.move(x, bottomEdge);
    await expect
      .poll(() =>
        scrollRegion.evaluate(
          (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
        ),
      )
      .toBeLessThanOrEqual(1);
    await expect(last).toBeInViewport({ ratio: 1 });
    const bottom = await center(last);
    await page.mouse.move(x, bottom.y);
    await page.mouse.up();
    await expectOrder(page, [...longDeck.slice(1), "Fireball"]);
    await expect(grip(page, "Wish")).not.toBeInViewport();

    await first.scrollIntoViewIfNeeded();
    const relocated = await center(first);
    const previousScroll = await scrollTop();
    await page.mouse.move(relocated.x, relocated.y);
    await page.mouse.down();
    await page.mouse.move(relocated.x, region.y + 10, { steps: 12 });
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect.poll(scrollTop).toBeLessThan(previousScroll - 50);
    await expect.poll(scrollTop).toBe(0);
    await expect(grip(page, "Wish")).toBeInViewport({ ratio: 1 });
    const top = await center(grip(page, "Wish"));
    await page.mouse.move(relocated.x, top.y);
    await page.mouse.up();
    await expectOrder(page, longDeck);
  });
}
