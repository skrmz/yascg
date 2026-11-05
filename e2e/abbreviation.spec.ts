import { expect, test } from "@playwright/test";

const original =
  "Use a **bonus action** to cast [bonus action](https://example.com/bonus-action) or see https://example.com/bonus-action.";
const abbreviated =
  "Use a **BA** to cast [BA](https://example.com/bonus-action) or see https://example.com/bonus-action.";

test("abbreviates custom spell prose, preserves links, and can undo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create custom spell" }).click();

  const editor = page.getByRole("dialog", { name: "New custom spell" });
  await expect(editor).toBeVisible();

  await editor.getByLabel("Name").fill("Abbreviation Test");
  const description = editor.getByLabel("Description (Markdown)");
  const duration = editor.getByLabel("Duration");
  await description.fill(original);
  await duration.fill("up to 1 hour");

  await editor.getByRole("button", { name: "Abbreviate" }).click();

  await expect(description).toHaveValue(abbreviated);
  await expect(duration).toHaveValue("≤ 1h");
  await expect(editor.getByLabel("Casting Time")).toBeVisible();
  await expect(editor.getByRole("status")).toContainText("Abbreviated");

  await editor.getByRole("button", { name: "Undo abbreviation" }).click();
  await expect(description).toHaveValue(original);
  await expect(duration).toHaveValue("up to 1 hour");

  await editor.getByRole("button", { name: "Abbreviate" }).click();
  await editor.getByRole("button", { name: "Save spell" }).click();

  await expect(editor).not.toBeVisible();
  await page.getByLabel("Search spells").fill("Abbreviation Test");
  await expect(page.getByText("Abbreviation Test").first()).toBeVisible();
});
