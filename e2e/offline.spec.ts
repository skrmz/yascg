import { expect, test } from "@playwright/test";

async function cachedPaths(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const all = new Set<string>();
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        all.add(new URL(request.url).pathname);
      }
    }
    return [...all];
  });
}

async function cardBackgroundPath(
  card: import("@playwright/test").Locator,
): Promise<string | null> {
  return card.evaluate((element) => {
    const match = /^url\("?(.+?)"?\)$/.exec(getComputedStyle(element).backgroundImage);
    return match ? new URL(match[1], document.baseURI).pathname : null;
  });
}

test("precaches shell, manifest, datasets, fonts, and card backgrounds, then works offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  const backgroundValues = await page
    .getByLabel("Card background")
    .locator("option")
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter((value) => value !== "none"),
    );
  expect(backgroundValues.length).toBeGreaterThan(0);

  await page.getByLabel("Search spells").fill("Wish");
  await page.getByRole("list", { name: "Spell results" }).getByRole("button").first().click();
  const preview = page.locator(".card-preview-page").first();
  await expect(preview).toBeVisible();

  const backgroundPaths: string[] = [];
  for (const value of backgroundValues) {
    await page.getByLabel("Card background").selectOption(value);
    await expect
      .poll(() => cardBackgroundPath(preview), { message: `background ${value}` })
      .toMatch(/^\/assets\/.+\.jpg$/);
    backgroundPaths.push((await cardBackgroundPath(preview))!);
  }
  expect(new Set(backgroundPaths).size).toBe(backgroundValues.length);

  await expect
    .poll(
      async () => {
        const paths = await cachedPaths(page);
        return {
          en: paths.includes("/spells.srd.json"),
          de: paths.includes("/spells.srd.de.json"),
          manifest: paths.includes("/spell-languages.json"),
          font: paths.some((path) => path.endsWith(".woff2")),
          backgrounds: backgroundPaths.every((path) => paths.includes(path)),
        };
      },
      { timeout: 30_000 },
    )
    .toEqual({ en: true, de: true, manifest: true, font: true, backgrounds: true });

  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Offline ready");
  await expect(page.getByRole("banner").getByRole("button", { name: "Offline ready" })).toHaveCount(
    0,
  );

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Spell Card Generator" })).toBeVisible();

  const undecodable = await page.evaluate(async (paths) => {
    const failures: string[] = [];
    for (const path of paths) {
      const image = new Image();
      image.src = path;
      try {
        await image.decode();
      } catch {
        failures.push(path);
      }
    }
    return failures;
  }, backgroundPaths);
  expect(undecodable).toEqual([]);

  // Offline language switching uses only precached assets (zero network requests).
  await page.getByRole("button", { name: /Spell data language|Sprache der Zauberdaten/ }).click();
  await page
    .getByRole("listbox", { name: /Spell data languages|Sprachen der Zauberdaten/ })
    .getByRole("option", { name: /Deutsch/ })
    .click();
  await expect(page.getByRole("button", { name: /Deutsch/ })).toBeVisible();
});
