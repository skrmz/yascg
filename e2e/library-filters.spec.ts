import { expect, test } from "@playwright/test";

test("Reset filters clears the search text and restores results", async ({ page }) => {
  await page.goto("/");
  const search = page.getByLabel("Search spells");
  const rows = page.getByRole("list", { name: "Spell results" }).getByRole("listitem");

  await search.fill("Fireball");
  await expect(page.getByRole("button", { name: /Add Fireball to active deck/ })).toBeVisible();

  await page.getByRole("button", { name: "Reset filters" }).click();

  await expect(search).toHaveValue("");
  await expect.poll(async () => rows.count()).toBeGreaterThan(1);
});

test("level range slider filters cantrips and reset restores the full range", async ({ page }) => {
  await page.goto("/");
  const results = page.getByRole("list", { name: "Spell results" });

  await expect(page.getByText("Level: 0 \u2013 9")).toBeVisible();

  const minThumb = page.getByRole("slider", { name: "Minimum level" });
  await minThumb.press("ArrowRight");

  await expect(page.getByText("Level: 1 \u2013 9")).toBeVisible();
  await expect(results).not.toContainText("Cantrip");

  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByText("Level: 0 \u2013 9")).toBeVisible();
});

test("advanced filters keep an active indicator when collapsed", async ({ page }) => {
  await page.goto("/");
  const advanced = page.getByRole("button", { name: /Advanced Filters/ });

  await advanced.click();
  await page.getByLabel("Concentration").click();
  await page.getByRole("option", { name: "Yes" }).click();

  await advanced.click();
  await expect(page.getByText("1 active")).toBeVisible();

  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByText("1 active")).toHaveCount(0);
});

test("range and components filters narrow the results", async ({ page }) => {
  await page.goto("/");
  const results = page.getByRole("list", { name: "Spell results" });
  await page.getByRole("button", { name: /Advanced Filters/ }).click();

  await page.getByRole("combobox", { name: "Range", exact: true }).click();
  await page.getByRole("option", { name: "150 feet" }).click();
  await expect(results.getByText("Fireball", { exact: true })).toBeVisible();
  await expect(results.getByText("Shield", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Reset filters" }).click();
  await page.getByRole("button", { name: "Components" }).click();
  await page.getByRole("checkbox", { name: "Material" }).check();
  await page.keyboard.press("Escape");

  await expect(results.getByText("Fireball", { exact: true })).toBeVisible();
  await expect(results.getByText("Shield", { exact: true })).toHaveCount(0);
});

test("school multi-select ORs the selected schools", async ({ page }) => {
  await page.goto("/");
  const results = page.getByRole("list", { name: "Spell results" });

  await page.getByRole("button", { name: /Advanced Filters/ }).click();
  await page.getByRole("button", { name: "School" }).click();
  await page.getByRole("checkbox", { name: "Evocation" }).check();
  await page.getByRole("checkbox", { name: "Abjuration" }).check();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("button", { name: "School" })).toContainText("2 selected");
  await expect(results).toContainText("Evocation");
  await expect(results).toContainText("Abjuration");
});
