import { expect, test } from "@playwright/test";

const FONT_FACES = [
  '500 16px "Cormorant Garamond"',
  '600 16px "Cormorant Garamond"',
  '700 16px "Cormorant Garamond"',
  '400 16px "Karla"',
  '500 16px "Karla"',
  '700 16px "Karla"',
  '400 16px "IBM Plex Mono"',
  '500 16px "IBM Plex Mono"',
  '600 16px "Vollkorn"',
  'italic 600 16px "Vollkorn"',
  '700 16px "Vollkorn"',
  'italic 700 16px "Vollkorn"',
  '400 16px "Alegreya Sans"',
  'italic 400 16px "Alegreya Sans"',
  '500 16px "Alegreya Sans"',
  'italic 500 16px "Alegreya Sans"',
  '700 16px "Alegreya Sans"',
  'italic 700 16px "Alegreya Sans"',
];

test("loads no Google Fonts and resolves every self-hosted face", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Spell Card Generator" })).toBeVisible();

  const availability = await page.evaluate(async (faces) => {
    const results: Record<string, boolean> = {};
    for (const face of faces) {
      await document.fonts.load(face).catch(() => []);
      results[face] = document.fonts.check(face);
    }
    return results;
  }, FONT_FACES);

  for (const [face, available] of Object.entries(availability)) {
    expect(available, face).toBe(true);
  }
  expect(requests.some((url) => url.includes("fonts.googleapis.com"))).toBe(false);
  expect(requests.some((url) => url.includes("fonts.gstatic.com"))).toBe(false);
});
