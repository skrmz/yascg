import { openTableOutput } from "./workspace-controls";
import { expect, test } from "@playwright/test";

test("print continues long rows with repeated headers and fits all columns on each PDF page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.goto("/");

  const description = `Opening sentence. ${"Keep this entire text on its print pages. ".repeat(350)}Closing sentence.`;
  const spell = {
    id: "long-table-test",
    source: "Custom",
    name: "Long table test spell",
    level: 1,
    school: "Evocation",
    castingTime: "1 Action",
    range: "60 feet",
    duration: "Instantaneous",
    concentration: false,
    ritual: false,
    classes: ["Wizard"],
    components: { verbal: true, somatic: true, material: false },
    description: [description],
  };
  await page.getByRole("button", { name: "Custom spell import/export" }).click();
  const importer = page.getByRole("dialog", { name: "Import / export custom spells" });
  await importer.locator('input[type="file"]').setInputFiles({
    name: "spells.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ type: "custom-spells", spells: [spell] })),
  });
  await importer.getByRole("button", { name: "Commit import" }).click();
  await expect(importer.getByRole("status")).toContainText("Imported 1");
  await page.keyboard.press("Escape");

  await page.getByLabel("Search spells").fill(spell.name);
  await expect(page.getByText("1 result", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Append all" }).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await openTableOutput(page);
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  const columnDialog = page.getByRole("dialog", { name: "Columns" });
  const checkboxes = columnDialog.getByRole("checkbox");
  for (const box of await checkboxes.all()) await box.check();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Print table" }).click();
  const dialog = page.getByRole("dialog", { name: "Table print preview" });
  await expect(dialog.getByLabel("Orientation")).toHaveValue("landscape");
  await dialog.getByLabel("Paper size").selectOption("A4");
  await dialog.getByLabel("Orientation").selectOption("portrait");
  const preview = dialog.locator(".table-print-preview");
  const sheets = preview.locator(".table-print-sheet");
  await expect(sheets.first()).toBeVisible();
  const pageCount = await sheets.count();
  expect(pageCount).toBeGreaterThan(1);
  expect(await sheets.first().getByRole("columnheader").count()).toBe(12);
  const descriptionIndex = (
    await sheets.first().getByRole("columnheader").allTextContents()
  ).indexOf("Description");
  expect(descriptionIndex).toBeGreaterThan(-1);
  let fragments = "";
  for (const sheet of await sheets.all()) {
    await expect(sheet.getByRole("columnheader", { name: "Description" })).toBeVisible();
    fragments += await sheet.locator("tbody tr > *").nth(descriptionIndex).textContent();
    const metrics = await sheet.evaluate((element) => {
      const table = element.querySelector("table")!;
      const rect = table.getBoundingClientRect();
      const sheetRect = element.getBoundingClientRect();
      const cells = Array.from(table.querySelectorAll<HTMLElement>(".table-print-cell-text"));
      return {
        fontPt: (Number.parseFloat(getComputedStyle(element).fontSize) * 72) / 96,
        fitsWidth:
          rect.right <= sheetRect.right &&
          cells.every((cell) => cell.scrollWidth <= cell.clientWidth + 1),
        fitsHeight: rect.bottom <= sheetRect.bottom,
      };
    });
    expect(metrics).toMatchObject({ fitsWidth: true, fitsHeight: true });
    expect(metrics.fontPt).toBeGreaterThanOrEqual(6);
  }
  expect(fragments).toBe(description);
  await expect(sheets.nth(1).getByRole("rowheader")).toContainText("Continued");

  await dialog.getByRole("button", { name: "Print table" }).click();
  await expect(page.locator(".table-print-output .table-print-sheet")).toHaveCount(pageCount);
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");
  const mediaBoxes = [...pdf.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
  const dimensions = mediaBoxes.map(([, width, height]) => [Number(width), Number(height)]);
  expect(dimensions).toHaveLength(pageCount);
  for (const [width, height] of dimensions) {
    expect(Math.abs(width - (210 * 72) / 25.4)).toBeLessThan(2);
    expect(Math.abs(height - (297 * 72) / 25.4)).toBeLessThan(2);
  }
});
