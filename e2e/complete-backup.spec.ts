import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { DEFAULT_INPUT_DIR, prepareCardBackgrounds } from "../scripts/prepare-card-backgrounds";
import {
  BACKGROUND_JPEG_MAX_BYTES,
  BACKGROUND_SOURCE_MAX_BYTES,
} from "../src/cards/background-contract";

const emptyBackup = {
  type: "yascg-complete-backup",
  version: 2,
  activeDeck: { id: "active", name: "", entries: [], revision: 0, baseline: null },
  savedDecks: [],
  customSpells: [],
  srdSpellOverrides: [],
  personalBackgrounds: [] as { id: string; name: string; jpeg: string }[],
  personalBackgroundId: null as string | null,
};

async function menuAction(page: Page, name: string, menuName = "Open menu") {
  await page.getByRole("button", { name: menuName, exact: true }).press("Enter");
  await page.getByRole("menuitem", { name, exact: true }).press("Enter");
}

async function reviewFile(page: Page, backup: unknown) {
  await menuAction(page, "Restore complete backup");
  const dialog = page.getByRole("dialog", { name: "Restore complete backup" });
  await setBackupFile(dialog, backup);
  await expect(dialog.getByRole("alert")).toContainText("replaces this entire collection");
  return dialog;
}

async function setBackupFile(dialog: ReturnType<Page["getByRole"]>, backup: unknown) {
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "collection.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
}

async function exportBackup(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10_000 }),
    menuAction(page, "Export complete backup"),
  ]);
  expect(download.suggestedFilename()).toMatch(/^yascg-complete-backup-.*\.json$/);
  return JSON.parse(await readFile(await download.path(), "utf8")) as typeof emptyBackup;
}

async function renameDeck(page: Page, name: string) {
  const field = page.getByLabel("Active deck name");
  await expect(field).toBeEditable();
  await field.fill(name);
  await field.press("Enter");
  await expect(field).toHaveValue(name);
}

async function addFireball(page: Page) {
  await page.getByLabel("Search spells").fill("Fireball");
  await page.getByRole("button", { name: "Add Fireball to active deck", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Active deck" }).getByText("Fireball"),
  ).toBeVisible();
}

async function importBackgrounds(page: Page) {
  const paper = await sharp({
    create: { width: 1500, height: 1400, channels: 4, background: "#ffffff00" },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="1500" height="1400"><rect x="0" width="200" height="1400" fill="red"/><rect x="600" y="300" width="20" height="800" fill="#ddbbad"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  // EXIF orientation turns the landscape source into a portrait card.
  const rotated = await sharp({
    create: { width: 420, height: 300, channels: 3, background: "#d0e0f0" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const webp = await sharp({
    create: { width: 200, height: 280, channels: 3, background: "#f5f1ed" },
  })
    .webp()
    .toBuffer();
  const dialog = page.getByRole("dialog", { name: "Personal card backgrounds" });
  await page.getByRole("button", { name: "Use own" }).click();
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: "Paper.png", mimeType: "image/png", buffer: paper },
    { name: "Rotated.jpg", mimeType: "image/jpeg", buffer: rotated },
    { name: "Linen.webp", mimeType: "image/webp", buffer: webp },
    { name: "Corrupt.png", mimeType: "image/png", buffer: Buffer.from("broken") },
    { name: "Unsupported.txt", mimeType: "text/plain", buffer: Buffer.from("text") },
  ]);
  await expect(dialog.getByRole("button", { name: "Remove Paper.png" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Remove Rotated.jpg" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Remove Linen.webp" })).toBeEnabled();
  await expect(dialog.getByRole("alert")).toContainText(
    "Corrupt.png · This image could not be opened",
  );
  await expect(dialog.getByRole("alert")).toContainText(
    "Unsupported.txt · Choose a JPEG, PNG, or WebP",
  );
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  const background = page.getByLabel("Card background");
  const value = (await background
    .getByRole("option", { name: "Personal · Paper.png" })
    .getAttribute("value"))!;
  await background.selectOption(value);
  await expect(background).toHaveValue(value);
  return value;
}

async function printWithBackground(page: Page, id: string, compact: boolean) {
  await page.evaluate(() => {
    delete document.documentElement.dataset.testPrinted;
  });
  await page.getByRole("button", { name: "Print", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Print spell cards" });
  await dialog.getByRole("button", { name: /^Print \d+ cards?$/ }).click({ timeout: 10_000 });
  await expect(page.locator("html")).toHaveAttribute("data-test-printed", "true");
  const cards = page.locator(".print-root .spell-card");
  const card = cards.first();
  await expect(card).toHaveAttribute("data-card-background", id);
  expect(
    await cards.evaluateAll(
      (elements, id) =>
        elements.every((element) => element.getAttribute("data-card-background") === id),
      id,
    ),
  ).toBe(true);
  expect(await card.evaluate((element) => element.classList.contains("spell-card-compact"))).toBe(
    compact,
  );
  const printed = await card.evaluate((element) => ({
    color: getComputedStyle(element).color,
    image: getComputedStyle(element).backgroundImage,
    origin: getComputedStyle(element).backgroundOrigin,
    outline: getComputedStyle(element).webkitTextStrokeColor,
    paintOrder: getComputedStyle(element).paintOrder,
  }));
  expect(printed.image).toContain("data:image/jpeg;base64,");
  expect(printed.origin).toBe("border-box");
  expect(printed.outline).toBe("rgb(255, 253, 248)");
  expect(printed.paintOrder).toBe("stroke");
  expect(printed.color).toBe(compact ? "rgb(33, 30, 26)" : "rgb(17, 17, 17)");
  await page.emulateMedia({ media: "print" });
  const box = (await card.boundingBox())!;
  expect(box.width).toBeCloseTo(240, 1);
  expect(box.height).toBeCloseTo(336, 1);
  const body = card.locator(compact ? ".compact-card-measured" : ".card-body-measured");
  expect((await cards.allTextContents()).join(" ")).toMatch(/fire damage/i);
  expect(
    await body.evaluate((element) => element.scrollHeight - element.clientHeight),
  ).toBeLessThanOrEqual(1);
  await page.emulateMedia({ media: "screen" });
}

async function expectBackgroundPdf(page: Page) {
  const pdf = (
    await page.pdf({ scale: 1, preferCSSPageSize: true, printBackground: true })
  ).toString("latin1");
  expect(pdf).toMatch(/\/MediaBox\s*\[0 0 612 792\]/);
  const images = [...pdf.matchAll(/\/Subtype \/Image\s+\/Width (\d+)\s+\/Height (\d+)/g)].map(
    ([, width, height]) => [Number(width), Number(height)],
  );
  expect(
    images.some(([width, height]) => width >= 895 && height >= 1255),
    JSON.stringify(images),
  ).toBe(true);
  expect(pdf).toMatch(/\/BaseFont \/[A-Z]+\+AlegreyaSans/);
}

async function compareImages(first: Buffer, second: Buffer) {
  const decode = (image: Buffer) =>
    sharp(image).removeAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
  const [a, b] = await Promise.all([decode(first), decode(second)]);
  expect(a.info).toMatchObject({ width: b.info.width, height: b.info.height, channels: 3 });
  const { width, height } = a.info;
  let error = 0;
  const describePixels = (data: Buffer) => {
    const rgb = [0, 0, 0];
    let luma = 0;
    let squaredLuma = 0;
    let chroma = 0;
    let detail = 0;
    let previousLuma = 0;
    for (let i = 0; i < data.length; i += 3) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      rgb[0] += r;
      rgb[1] += g;
      rgb[2] += b;
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      luma += y;
      squaredLuma += y * y;
      chroma += Math.max(r, g, b) - Math.min(r, g, b);
      if (i % (3 * width) !== 0) detail += Math.abs(y - previousLuma);
      previousLuma = y;
    }
    const count = width * height;
    return {
      rgb: rgb.map((sum) => sum / count),
      brightness: luma / count,
      contrast: Math.sqrt(Math.max(0, squaredLuma / count - (luma / count) ** 2)),
      chroma: chroma / count,
      horizontalDetail: detail / (count - height),
    };
  };
  for (let i = 0; i < a.data.length; i++) error += Math.abs(a.data[i] - b.data[i]);
  return {
    meanAbsoluteChannelError: error / a.data.length,
    first: describePixels(a.data),
    second: describePixels(b.data),
  };
}

test("matches bundled JPEG framing and color before CSS, and preserves print artwork around the text", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.testPrinted = "true";
    };
  });
  await page.goto("/");
  await addFireball(page);
  const inputDir = testInfo.outputPath();
  await mkdir(inputDir, { recursive: true });
  const parchmentName = "Aged Parchment framed with Separators";
  const parchment = await readFile(path.join(DEFAULT_INPUT_DIR, `${parchmentName}.png`));
  // Asymmetric color bands detect shifts in either axis. Transparency, P3 and
  // odd source dimensions exercise the shared crop and color conversions.
  const profile = await sharp(
    Buffer.from(
      '<svg width="409" height="403"><rect width="310" height="403" fill="#12151a"/><rect x="74" y="13" width="157" height="203" fill="#d06342"/><rect x="185" y="219" width="125" height="181" fill="#6d9cd2"/><rect x="290" y="52" width="110" height="96" fill="#eee" fill-opacity=".4"/><rect x="88" y="241" width="73" height="97" fill="#ccc" fill-opacity=".5"/></svg>',
    ),
  )
    .withIccProfile("p3")
    .png()
    .toBuffer();
  const fixtures = [
    {
      name: `${parchmentName}.png`,
      mimeType: "image/png",
      buffer: parchment,
      width: 900,
      height: 1260,
    },
    { name: "Profile.png", mimeType: "image/png", buffer: profile, width: 285, height: 399 },
  ];
  for (const fixture of fixtures)
    await writeFile(path.join(inputDir, fixture.name), fixture.buffer);
  expect(await prepareCardBackgrounds({ inputDir, dryRun: false })).toMatchObject({
    converted: 2,
    failed: 0,
  });
  await page.getByRole("button", { name: "Use own" }).click();
  const dialog = page.getByRole("dialog", { name: "Personal card backgrounds" });
  await dialog.locator('input[type="file"]').setInputFiles([
    ...fixtures,
    // The browser accepts valid image bytes independently of the filename and MIME type.
    { name: "Mislabeled.jpg", mimeType: "image/jpeg", buffer: profile },
  ]);
  for (const { name } of fixtures)
    await expect(dialog.getByRole("button", { name: `Remove ${name}` })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Remove Mislabeled.jpg" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  const backup = await exportBackup(page);
  const jpeg = (name: string) =>
    Buffer.from(backup.personalBackgrounds.find((image) => image.name === name)!.jpeg, "base64");
  expect(jpeg("Mislabeled.jpg")).toEqual(jpeg("Profile.png"));
  const comparisons: Record<string, unknown> = {};
  for (const { name, width, height } of fixtures) {
    const browser = jpeg(name);
    const bundled = await readFile(path.join(inputDir, name.replace(/\.png$/, ".jpg")));
    for (const image of [browser, bundled]) {
      expect(image.length).toBeLessThanOrEqual(BACKGROUND_JPEG_MAX_BYTES);
      const metadata = await sharp(image).metadata();
      expect(metadata).toMatchObject({ width, height, space: "srgb" });
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
    }
    const fileComparison = await compareImages(bundled, browser);
    comparisons[name] = {
      ...fileComparison,
      nodeBytes: bundled.length,
      browserBytes: browser.length,
    };
    expect(fileComparison.meanAbsoluteChannelError).toBeLessThan(5);
    if (name === "Profile.png") {
      for (const image of [browser, bundled]) {
        // At this row the dark field ends at source x=310. The crop starts at x=62.
        const edge = await sharp(image)
          .extract({ left: 240, top: 200, width: 16, height: 1 })
          .greyscale()
          .raw()
          .toBuffer();
        expect(edge.findIndex((value) => value > 128)).toBe(8);
      }
    }
  }
  const selection = page.getByLabel("Card background");
  const personal = backup.personalBackgrounds.find(({ name }) => name === fixtures[0].name)!;
  await selection.selectOption(personal.id);
  await page.getByLabel("Card design").selectOption("classic");
  await printWithBackground(page, personal.id, false);
  await page.emulateMedia({ media: "print" });
  const card = page.locator(".print-root .spell-card").first();
  const personalScreen = await card.screenshot();

  const applyImage = async (name: string, buffer: Buffer) => {
    await card.evaluate(
      async (element, { name, base64 }) => {
        const url = `data:image/jpeg;base64,${base64}`;
        const image = new Image();
        image.src = url;
        await image.decode();
        element.setAttribute("data-card-background", name);
        (element as HTMLElement).style.setProperty("--card-background-image", `url("${url}")`);
      },
      { name, base64: buffer.toString("base64") },
    );
  };
  await applyImage(
    `${parchmentName}.jpg`,
    await readFile(path.join(inputDir, `${parchmentName}.jpg`)),
  );
  const bundledScreen = await card.screenshot();
  const printComparison = await compareImages(bundledScreen, personalScreen);
  expect(printComparison.meanAbsoluteChannelError).toBeLessThan(5);
  const previousBundled = await readFile(path.join(DEFAULT_INPUT_DIR, `${parchmentName}.jpg`));
  const bundledJpeg = await readFile(path.join(inputDir, `${parchmentName}.jpg`));
  const bundledBeforeAfter = await compareImages(previousBundled, bundledJpeg);

  // Keep the browser JPEG, layout and outline fixed while adding back the former wash.
  await applyImage(personal.id, jpeg(fixtures[0].name));
  const oldOverlay = await page.addStyleTag({
    content: `
    .spell-card[data-card-background^="personal-"] { isolation: isolate }
    .spell-card[data-card-background^="personal-"]::before {
      content: ""; position: absolute; inset: 0; z-index: -1;
      background-color: rgb(255 253 248 / 60%);
    }
  `,
  });
  const overlayComparison = await compareImages(personalScreen, await card.screenshot());
  expect(overlayComparison.second.brightness - overlayComparison.first.brightness).toBeGreaterThan(
    10,
  );
  expect(overlayComparison.second.chroma).toBeLessThan(overlayComparison.first.chroma);
  await oldOverlay.evaluate((node) => node.parentNode?.removeChild(node));

  const dark = await sharp({
    create: { width: 150, height: 210, channels: 3, background: "#101010" },
  })
    .jpeg()
    .toBuffer();
  await applyImage(personal.id, dark);
  const darkScreen = await sharp(await card.screenshot())
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = darkScreen.info;
  const blank = ((height - 30) * width + 5) * channels;
  expect(darkScreen.data[blank]).toBeLessThan(25);
  let outlinePixels = 0;
  for (let i = 0; i < width * 35 * channels; i += channels) {
    if (darkScreen.data[i] > 230 && darkScreen.data[i + 1] > 230) outlinePixels++;
  }
  expect(outlinePixels).toBeGreaterThan(30);
  const reportPath = testInfo.outputPath("background-comparison.json");
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        files: comparisons,
        bundledBeforeAfter,
        printComparison,
        overlayComparison,
        outlinePixels,
      },
      null,
      2,
    ),
  );
  await testInfo.attach("background-comparison", {
    path: reportPath,
    contentType: "application/json",
  });
});

test("rejects undersized personal images and enforces source and output byte limits", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use own" }).click();
  const dialog = page.getByRole("dialog", { name: "Personal card backgrounds" });
  const input = dialog.locator('input[type="file"]');
  const tiny = await sharp({
    create: { width: 149, height: 210, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const tooManyPixels = await sharp({
    create: { width: 8000, height: 5001, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await input.setInputFiles([
    { name: "Too small.png", mimeType: "image/png", buffer: tiny },
    {
      name: "Too large.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(BACKGROUND_SOURCE_MAX_BYTES + 1),
    },
    { name: "Too many pixels.png", mimeType: "image/png", buffer: tooManyPixels },
  ]);
  await expect(dialog.getByRole("alert")).toContainText("Too small.png");
  await expect(dialog.getByRole("alert")).toContainText("Too large.png");
  await expect(dialog.getByRole("alert")).toContainText("Too many pixels.png");
  await expect(dialog.getByRole("button", { name: "Choose images" })).toBeEnabled();
  await page.evaluate((maxBytes) => {
    const oversized = new Blob([new Uint8Array(maxBytes + 1)], { type: "image/jpeg" });
    HTMLCanvasElement.prototype.toBlob = (callback) => callback(oversized);
  }, BACKGROUND_JPEG_MAX_BYTES);
  const valid = await sharp({
    create: { width: 150, height: 210, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await input.setInputFiles({
    name: "Too large after encoding.png",
    mimeType: "image/png",
    buffer: valid,
  });
  await expect(dialog.getByRole("alert")).toContainText("Too large after encoding.png");
  await expect(dialog.getByRole("alert")).toContainText("The processed JPEG exceeds 1 MiB");
  await expect(dialog.getByRole("button", { name: /^Remove / })).toHaveCount(0);
});

test("normalizes mixed imports and shares the saved background across designs and print", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.testPrinted = "true";
    };
  });
  await page.goto("/");
  await addFireball(page);
  const id = await importBackgrounds(page);
  const backup = await exportBackup(page);
  const paper = Buffer.from(
    backup.personalBackgrounds.find((image) => image.id === id)!.jpeg,
    "base64",
  );
  expect(await sharp(paper).metadata()).toMatchObject({ format: "jpeg", width: 900, height: 1260 });
  const pixels = await sharp(paper).raw().toBuffer({ resolveWithObject: true });
  for (const [channel, paperColor] of [255, 253, 248].entries()) {
    expect(Math.abs(pixels.data[channel] - paperColor)).toBeLessThanOrEqual(2);
  }
  const detail = (450 * pixels.info.width + 324) * pixels.info.channels;
  expect(pixels.data[detail + 1]).toBeLessThan(220);
  const rotated = Buffer.from(
    backup.personalBackgrounds.find(({ name }) => name === "Rotated.jpg")!.jpeg,
    "base64",
  );
  expect(await sharp(rotated).metadata()).toMatchObject({ width: 300, height: 420 });
  expect(backup.personalBackgroundId).toBe(id);
  const design = page.getByLabel("Card design");
  const background = page.getByLabel("Card background");

  for (const variant of ["classic", "compact", "classic"]) {
    await design.selectOption(variant);
    await expect(background).toHaveValue(id);
    await expect(page.locator(".card-preview-page").first()).toHaveAttribute(
      "data-card-background",
      id,
    );
    await printWithBackground(page, id, variant === "compact");
  }
  await expectBackgroundPdf(page);
  await design.selectOption("classic");
  await page.reload();
  await expect(design).toHaveValue("compact");
  await expect(background).toHaveValue(id);
  await background.selectOption("none");
  await expect(background).toHaveValue("none");
  expect((await exportBackup(page)).personalBackgroundId).toBeNull();
  await page.reload();
  await expect(background).toHaveValue("none");

  await background.selectOption(id);
  await expect(background).toHaveValue(id);
  const bundled = (await background.locator("option").nth(1).getAttribute("value"))!;
  await background.selectOption(bundled);
  await expect(background).toHaveValue(bundled);
  await page.reload();
  await expect(background).toHaveValue("none");
  await background.selectOption(id);
  await expect(background).toHaveValue(id);
  await page.getByRole("button", { name: "Use own" }).click();
  const dialog = page.getByRole("dialog", { name: "Personal card backgrounds" });
  await dialog.getByRole("button", { name: "Remove Paper.png" }).click();
  await expect(dialog.getByRole("button", { name: "Remove Paper.png" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(background).toHaveValue("none");
  await expect(background.locator(`option[value="${bundled}"]`)).toHaveCount(1);
  await page.reload();
  await expect(background).toHaveValue("none");
  await expect(background.getByRole("option", { name: "Personal · Rotated.jpg" })).toHaveCount(1);
});

test("exports only committed data and requires confirmation to replace a populated collection", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  const initial = await reviewFile(page, {
    ...emptyBackup,
    customSpells: [
      {
        id: "archive-light",
        source: "Custom",
        name: "Archive Light",
        level: 1,
        school: "Evocation",
        castingTime: "1 Action",
        range: "Self",
        duration: "Instantaneous",
        concentration: false,
        ritual: false,
        classes: ["Wizard"],
        components: { verbal: false, somatic: false, material: false },
        description: ["A light for the archive."],
      },
    ],
    srdSpellOverrides: [
      { spellId: "srd-fireball", locale: "en", verbalDescription: "Fireball note", updatedAt: 12 },
    ],
  });
  await initial.getByRole("button", { name: "Replace entire collection" }).click();
  await expect(initial.getByRole("status")).toHaveText("Complete backup restored.");
  await page.keyboard.press("Escape");
  await addFireball(page);
  const backgroundId = await importBackgrounds(page);
  await renameDeck(page, "Committed");
  await page.getByRole("button", { name: "Save as…" }).click();
  await page
    .getByRole("dialog", { name: "Save deck as" })
    .getByRole("button", { name: "Save" })
    .click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await renameDeck(page, "Working deck");
  const name = page.getByLabel("Active deck name");
  await name.fill("Uncommitted draft");

  // A pointer activation starts at the focused inline name editor.
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export complete backup", exact: true }).click();
  const file = await downloadEvent;
  const backup = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(backup.activeDeck.name).toBe("Working deck");
  expect(backup.activeDeck.baseline.name).toBe("Committed");
  expect(backup.savedDecks).toHaveLength(1);
  expect(backup.customSpells).toHaveLength(1);
  expect(backup.srdSpellOverrides).toHaveLength(1);
  expect(backup.personalBackgrounds).toHaveLength(3);
  expect(backup.personalBackgroundId).toBe(backgroundId);
  await name.press("Escape");
  expect(await exportBackup(page)).toEqual(backup);

  const destination = await browser.newContext();
  try {
    const target = await destination.newPage();
    await target.addInitScript(() => {
      window.print = () => {
        document.documentElement.dataset.testPrinted = "true";
      };
    });
    await target.goto("/");
    await expect(target.getByRole("banner").getByRole("status")).toHaveText("Offline ready");
    await destination.setOffline(true);
    await target.reload();
    let dialog = await reviewFile(target, backup);
    await expect(dialog).toContainText("Working deck: Working deck (1 entry)");
    await expect(dialog).toContainText("Saved decks: 1");
    await dialog.getByRole("button", { name: "Cancel" }).press("Enter");
    expect(await exportBackup(target)).toEqual(emptyBackup);

    dialog = await reviewFile(target, backup);
    await dialog.getByRole("button", { name: "Replace entire collection" }).press("Enter");
    await expect(dialog.getByRole("status")).toHaveText("Complete backup restored.");
    await dialog.getByRole("button", { name: "Close", exact: true }).last().press("Enter");
    await expect(target.getByLabel("Active deck name")).toHaveValue("Working deck");
    await expect(target.getByText("Unsaved changes", { exact: true })).toBeVisible();
    await expect(target.getByLabel("Card background")).toHaveValue(backgroundId);
    await target.reload();
    expect(await exportBackup(target)).toEqual(backup);
    expect(await target.evaluate(() => localStorage.getItem("spellCards.language"))).toBeNull();
    await expect(target.getByLabel("Card background")).toHaveValue(backgroundId);
    await target.getByRole("button", { name: "Show Fireball in details" }).click();
    for (const variant of ["classic", "compact"]) {
      await target.getByLabel("Card design").selectOption(variant);
      await expect(target.locator(".card-preview-page").first()).toHaveAttribute(
        "data-card-background",
        backgroundId,
      );
      await printWithBackground(target, backgroundId, variant === "compact");
    }

    const legacyBackup = {
      type: emptyBackup.type,
      version: 1,
      activeDeck: emptyBackup.activeDeck,
      savedDecks: [],
      customSpells: [],
      srdSpellOverrides: [],
    };
    for (const invalid of [
      {
        ...backup,
        personalBackgrounds: [{ ...backup.personalBackgrounds[0], jpeg: "/9j/2Q==" }],
        personalBackgroundId: null,
      },
      { ...backup, personalBackgroundId: "personal-00000000-0000-0000-0000-000000000000" },
    ]) {
      await menuAction(target, "Restore complete backup");
      dialog = target.getByRole("dialog", { name: "Restore complete backup" });
      await setBackupFile(dialog, invalid);
      await expect(dialog.getByRole("status")).toContainText(/invalid/i);
      await expect(dialog.getByRole("button", { name: "Replace entire collection" })).toHaveCount(
        0,
      );
      await target.keyboard.press("Escape");
      expect(await exportBackup(target)).toEqual(backup);
    }
    dialog = await reviewFile(target, legacyBackup);
    await expect(dialog).toContainText("Saved decks: 0");
    await expect(dialog.getByRole("alert")).toContainText(
      "remove all your current personal backgrounds",
    );
    await target.keyboard.press("Escape");
    expect(await exportBackup(target)).toEqual(backup);

    dialog = await reviewFile(target, legacyBackup);
    await target.evaluate(() => {
      // oxlint-disable-next-line typescript/unbound-method -- Called below with the original store receiver.
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
        if (this.name === "collectionMetadata") {
          IDBObjectStore.prototype.put = put;
          throw new DOMException("Injected write failure", "QuotaExceededError");
        }
        return put.apply(this, args);
      };
    });
    await dialog.getByRole("button", { name: "Replace entire collection" }).click();
    await expect(dialog.getByRole("status")).toContainText(/storage/i);
    await target.keyboard.press("Escape");
    expect(await exportBackup(target)).toEqual(backup);
    await expect(target.getByLabel("Card background")).toHaveValue(backgroundId);

    dialog = await reviewFile(target, legacyBackup);
    await dialog.getByRole("button", { name: "Replace entire collection" }).press("Enter");
    await expect(dialog.getByRole("status")).toHaveText("Complete backup restored.");
    await target.keyboard.press("Escape");
    await expect(target.getByLabel("Card background")).toHaveValue("none");
    await target.reload();
    expect(await exportBackup(target)).toEqual(emptyBackup);
    await expect(target.getByLabel("Card background")).toHaveValue("none");
  } finally {
    await destination.close();
  }
});

test("rejects stale cross-tab reviews and delayed editor saves without notifications", async ({
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", { value: undefined });
  });
  const a = await context.newPage();
  const b = await context.newPage();
  await Promise.all([a.goto("/"), b.goto("/")]);
  const staleReview = await reviewFile(a, emptyBackup);
  await renameDeck(b, "Other tab");
  await expect.poll(async () => (await exportBackup(b)).activeDeck.name).toBe("Other tab");
  await staleReview.getByRole("button", { name: "Replace entire collection" }).click();
  await expect(staleReview.getByRole("status")).toContainText(
    "The collection changed after this review",
  );
  await expect(staleReview.getByRole("button", { name: "Replace entire collection" })).toHaveCount(
    0,
  );
  await staleReview.getByRole("button", { name: "Review file again" }).click();
  await expect(
    staleReview.getByRole("button", { name: "Replace entire collection" }),
  ).toBeEnabled();

  await b.getByLabel("Search spells").fill("Fireball");
  await b
    .getByRole("list", { name: "Spell results" })
    .getByRole("button", { name: /^Fireball/ })
    .first()
    .click();
  await b.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = b.getByRole("dialog");
  await editor.getByLabel("Verbal description").fill("Stale note");
  await staleReview.getByRole("button", { name: "Replace entire collection" }).click();
  await expect(staleReview.getByRole("status")).toHaveText("Complete backup restored.");

  await editor.getByRole("button", { name: "Save spell" }).click();
  await expect(
    b
      .getByText("The collection was restored after this action started.", { exact: false })
      .or(b.getByText("The collection was restored. Reopen any editor", { exact: false })),
  ).toBeVisible();
  await expect(editor).toHaveCount(0);
  expect((await exportBackup(b)).srdSpellOverrides).toEqual([]);
  await expect(b.getByLabel("Active deck name")).toHaveValue("");
  await renameDeck(b, "New intent");
  expect((await exportBackup(b)).activeDeck.name).toBe("New intent");
});

test("validates, restores and downloads offline in the receiving language", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => localStorage.setItem("spellCards.language", "de"));
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Offline bereit");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel("Zauber suchen")).toBeVisible();
  await menuAction(page, "Vollständiges Backup wiederherstellen", "Menü öffnen");
  const dialog = page.getByRole("dialog", { name: "Vollständiges Backup wiederherstellen" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "offline.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        ...emptyBackup,
        srdSpellOverrides: [
          {
            spellId: "srd-fireball",
            locale: "de",
            verbalDescription: "Offline-Notiz",
            updatedAt: 12,
          },
        ],
      }),
    ),
  });
  await expect(dialog.getByRole("alert")).toContainText("ersetzt die gesamte Sammlung");
  await dialog.getByRole("button", { name: "Gesamte Sammlung ersetzen" }).press("Enter");
  await expect(dialog.getByRole("status")).toHaveText(
    "Das vollständige Backup wurde wiederhergestellt.",
  );
  await page.keyboard.press("Escape");
  const downloaded = page.waitForEvent("download");
  await menuAction(page, "Vollständiges Backup exportieren", "Menü öffnen");
  const contents = JSON.parse(await readFile(await (await downloaded).path(), "utf8"));
  expect(contents.srdSpellOverrides).toEqual([
    { spellId: "srd-fireball", locale: "de", verbalDescription: "Offline-Notiz", updatedAt: 12 },
  ]);
  expect(await page.evaluate(() => localStorage.getItem("spellCards.language"))).toBe("de");
});

test("keeps deck and custom-spell import and export working after restore", async ({ page }) => {
  await page.goto("/");
  const restore = await reviewFile(page, emptyBackup);
  await restore.getByRole("button", { name: "Replace entire collection" }).click();
  await expect(restore.getByRole("status")).toHaveText("Complete backup restored.");
  await page.keyboard.press("Escape");

  const spell = {
    id: "narrow-custom",
    source: "Custom",
    name: "Imported custom spell",
    level: 1,
    school: "Evocation",
    castingTime: "1 Action",
    range: "60 feet",
    duration: "Instantaneous",
    concentration: false,
    ritual: false,
    classes: ["Wizard"],
    components: { verbal: false, somatic: false, material: false },
    description: ["Custom **text**"],
  };
  await page.getByRole("button", { name: "Custom spell import/export" }).click();
  const spells = page.getByRole("dialog", { name: "Import / export custom spells" });
  await spells.locator('input[type="file"]').setInputFiles({
    name: "spells.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ type: "custom-spells", spells: [spell] })),
  });
  await spells.getByRole("button", { name: "Commit import" }).click();
  await expect(spells.getByRole("status")).toContainText("Imported 1");
  const spellDownload = page.waitForEvent("download");
  await spells.getByRole("button", { name: "Export custom spells" }).click();
  expect(JSON.parse(await readFile(await (await spellDownload).path(), "utf8"))).toMatchObject({
    type: "custom-spells",
    spells: [spell],
  });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Deck actions" }).click();
  await page.getByRole("menuitem", { name: "Import / export deck" }).click();
  const deck = page.getByRole("dialog", { name: "Import / export deck" });
  const entry = {
    spellId: spell.id,
    fitMode: "auto",
    reference: { name: spell.name, source: spell.source },
  };
  await deck.locator('input[type="file"]').setInputFiles({
    name: "deck.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ type: "deck", name: "Narrow deck", exportedAt: 0, entries: [entry] }),
    ),
  });
  await deck.getByRole("button", { name: "Replace active deck…" }).click();
  await expect(
    page.getByRole("region", { name: "Active deck" }).getByText(spell.name),
  ).toBeVisible();
  await page.getByRole("button", { name: "Deck actions" }).click();
  await page.getByRole("menuitem", { name: "Import / export deck" }).click();
  const deckDownload = page.waitForEvent("download");
  await deck.getByRole("button", { name: "Export active deck" }).click();
  expect(JSON.parse(await readFile(await (await deckDownload).path(), "utf8"))).toMatchObject({
    type: "deck",
    name: "Narrow deck",
    entries: [entry],
  });
});
