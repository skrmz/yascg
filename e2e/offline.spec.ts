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

test("precaches shell, manifest, datasets, and fonts, then works offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await expect
    .poll(
      async () => {
        const paths = await cachedPaths(page);
        return {
          en: paths.includes("/spells.srd.json"),
          de: paths.includes("/spells.srd.de.json"),
          manifest: paths.includes("/spell-languages.json"),
          font: paths.some((path) => path.endsWith(".woff2")),
        };
      },
      { timeout: 30_000 },
    )
    .toEqual({ en: true, de: true, manifest: true, font: true });

  await expect(page.getByText("Offline ready")).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Spell Card Generator" })).toBeVisible();

  // Offline language switching uses only precached assets (zero network requests).
  await page.getByRole("button", { name: /Spell data language|Sprache der Zauberdaten/ }).click();
  await page
    .getByRole("listbox", { name: /Spell data languages|Sprachen der Zauberdaten/ })
    .getByRole("option", { name: /Deutsch/ })
    .click();
  await expect(page.getByRole("button", { name: /Deutsch/ })).toBeVisible();
});
