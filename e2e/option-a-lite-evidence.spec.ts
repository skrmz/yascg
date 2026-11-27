import { openDeckRename } from "./workspace-controls";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Opt-in visual evidence; ordinary E2E runs keep their existing scope and duration.
const stage = process.env.OPTION_A_EVIDENCE;
test.skip(!stage, "Set OPTION_A_EVIDENCE to capture workspace evidence.");
test.use({ serviceWorkers: "block" });

const names = [
  "Fireball",
  "Wish",
  "Magic Missile",
  "Light",
  "Mage Armor",
  "Arcane Eye",
  "Acid Splash",
  "Aid",
  "Bane",
  "Bless",
  "Alarm",
  "Missing Test Spell",
  "Evidence Chronicle",
];
const sizes = [
  [320, 568],
  [390, 844],
  [430, 932],
  [700, 900],
  [719, 900],
  [720, 900],
  [744, 1133],
  [820, 1180],
  [1024, 768],
  [1180, 820],
  [1199, 800],
  [1200, 800],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];

async function seed(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Search spells")).toBeVisible();
  await page.evaluate(async (deckNames) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("spell-cards-generator");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(
          ["collectionActiveDeck", "collectionSavedDecks", "collectionCustomSpells"],
          "readwrite",
        );
        const entries = deckNames.map((name, index) => ({
          entryId: `evidence-${index}`,
          spellId:
            name === "Evidence Chronicle"
              ? "evidence-chronicle"
              : `srd-${name.toLowerCase().replaceAll(" ", "-")}`,
          fitMode: "auto",
          reference: { name, source: name === "Evidence Chronicle" ? "Custom" : "SRD-5.2.1" },
        }));
        transaction.objectStore("collectionCustomSpells").put({
          id: "evidence-chronicle",
          name: "Evidence Chronicle",
          level: 1,
          school: "Divination",
          castingTime: "Action",
          range: "Self",
          components: { verbal: true, somatic: true, material: false },
          duration: "1 minute",
          concentration: false,
          ritual: false,
          classes: ["Wizard"],
          description: Array.from(
            { length: 12 },
            (_, i) =>
              `Chronicle passage ${i + 1}. You read a detailed account of the day's journeys, discoveries, and encounters. The text remains available until the spell ends.`,
          ),
          source: "Custom",
          contentLanguage: "en",
        });
        transaction.objectStore("collectionSavedDecks").put({
          id: "evidence-snapshot",
          name: "Evidence Deck",
          entries,
          revision: 1,
          updatedAt: 1,
        });
        transaction.objectStore("collectionActiveDeck").put({
          id: "active",
          instanceId: "evidence-instance",
          name: "Evidence Deck",
          savedDeckId: "evidence-snapshot",
          entries,
          revision: 1,
          baseline: { name: "Evidence Deck", entries, savedRevision: 1 },
        });
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    localStorage.setItem("spellCards.deckPresentation", "list");
    localStorage.removeItem("spellCards.deckTable");
  }, names);
  await page.reload();
  await expect(page.locator("#deck-entries > li")).toHaveCount(13);
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>("main *")) {
      if (element.scrollTop) element.scrollTop = 0;
      if (element.scrollLeft) element.scrollLeft = 0;
    }
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const output = info.outputPath(`${stage}-${name}.png`);
  await page.screenshot({ path: output, animations: stage === "gate-2" ? "disabled" : "allow" });
  const directory = path.resolve("docs/option-a-lite-evidence", stage!);
  await mkdir(directory, { recursive: true });
  await copyFile(output, path.join(directory, `${name}.png`));
  return page.evaluate(() => {
    const workspace = document.querySelector("main")!.getBoundingClientRect();
    const visible = (element: Element) =>
      element.getClientRects().length > 0 && !element.closest("[hidden]");
    const measure = (selector: string) => {
      const elements = [...document.querySelectorAll(selector)].filter(visible);
      const rects = elements.map((element) => element.getBoundingClientRect());
      const within = rects.filter((rect) => rect.top < innerHeight && rect.bottom > workspace.top);
      return {
        firstTop: rects[0] ? Math.round(rects[0].top - workspace.top) : null,
        complete: within.filter((rect) => rect.top >= workspace.top && rect.bottom <= innerHeight)
          .length,
        partial: within.filter((rect) => rect.top < workspace.top || rect.bottom > innerHeight)
          .length,
      };
    };
    const scroll = [...document.querySelectorAll(".deck-table-scroll")].find(visible) as
      | HTMLElement
      | undefined;
    return {
      mode: document.querySelector("main")?.getAttribute("data-workspace-mode"),
      card: measure(".card-preview-page"),
      list: measure("#deck-entries > li"),
      table: measure(".deck-table-full tbody tr, .deck-table-compact ul > li"),
      tableRegionWidth:
        document.querySelector(".deck-table-workspace:not([hidden])")?.clientWidth || null,
      tableViewportWidth: scroll?.clientWidth ?? null,
      tableContentWidth: scroll?.scrollWidth ?? null,
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

async function selectPreview(page: Page, spell: string) {
  const library = page.getByRole("tab", { name: "Library", exact: true });
  if (await library.isVisible()) await library.click();
  await page.getByLabel("Search spells").fill(spell);
  await page
    .locator('[data-workspace-pane="library"]')
    .getByRole("button", { name: new RegExp(`^${spell} `) })
    .click();
  await expect(page.locator(".card-preview-page").first()).toBeVisible();
}

test("capture reproducible Option A-lite layout evidence", async ({ page }, info) => {
  test.skip(stage !== "before" && stage !== "after", "Gate 1 capture only.");
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  const measurements: Record<string, unknown> = {};
  measurements["desktop-clean-snapshot"] = await capture(page, info, "desktop-clean-snapshot");
  await page.getByLabel("Active deck name").fill("Evidence Deck Working");
  await page.getByLabel("Active deck name").press("Enter");
  await expect(page.locator("#deck-panel").getByText("Unsaved changes")).toBeVisible();
  await selectPreview(page, "Fireball");
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await expect(page.locator("main")).toHaveAttribute(
      "data-workspace-mode",
      width < 720 ? "compact" : width < 1200 ? "split" : "wide",
    );
    const suffix = `${width}x${height}`;
    const deckTab = page.getByRole("tab", { name: "Deck", exact: true });
    if (await deckTab.isVisible()) await deckTab.click();
    const listButton = page.getByRole("button", { name: "List", exact: true });
    if (await listButton.isVisible()) await listButton.click();
    measurements[`list-${suffix}`] = await capture(page, info, `list-${suffix}`);
    await page.getByRole("button", { name: "Table", exact: true }).click();
    if (stage === "after" && width >= 1200) {
      await expect(
        page.locator("#deck-panel").getByRole("button", { name: "Open…", exact: true }),
      ).toBeInViewport();
      await expect(
        page.locator("#deck-panel").getByRole("button", { name: "Print cards", exact: true }),
      ).toBeInViewport();
    }
    measurements[`table-${suffix}`] = await capture(page, info, `table-${suffix}`);
    if (
      (width === 320 || width === 390 || width === 820 || width === 1024 || width === 1440) &&
      (await page.getByRole("checkbox", { name: "Full table", exact: true }).isVisible())
    ) {
      await page.getByRole("checkbox", { name: "Full table", exact: true }).check();
      measurements[`full-table-${suffix}`] = await capture(page, info, `full-table-${suffix}`);
      await page.getByRole("checkbox", { name: "Full table", exact: true }).uncheck();
    }
    if (await listButton.isVisible()) {
      await listButton.click();
    } else {
      const cards = page.getByRole("button", { name: "Spell Cards", exact: true });
      await cards.click();
      if (await deckTab.isVisible()) {
        await deckTab.click();
      }
    }
  }
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [820, 1180],
    [1024, 768],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator("main")).toHaveAttribute(
      "data-workspace-mode",
      width < 720 ? "compact" : width < 1200 ? "split" : "wide",
    );
    for (const spell of ["Fireball", "Wish"]) {
      await selectPreview(page, spell);
      measurements[`preview-${spell}-${width}x${height}`] = await capture(
        page,
        info,
        `preview-${spell}-${width}x${height}`,
      );
    }
  }
  if (stage === "after") {
    await page.getByRole("button", { name: "Table", exact: true }).click();
    const table = page.getByRole("table", { name: "Active deck table", exact: true });
    await table.getByRole("button", { name: "Spell name", exact: true }).click();
    await page.getByRole("searchbox", { name: "Search spell names" }).fill("a");
    await table.getByRole("checkbox", { name: "Select Acid Splash", exact: true }).check();
    measurements["desktop-active-table"] = await capture(page, info, "desktop-active-table");
    await page.getByLabel("Search spells").fill("Fireball");
    const candidate = page
      .locator('[data-workspace-pane="library"]')
      .getByRole("button", { name: /^Fireball / });
    await candidate.click();
    const dialog = page.getByRole("dialog", { name: "Fireball", exact: true });
    await expect(dialog).toBeVisible();
    measurements["desktop-library-inspection"] = await capture(
      page,
      info,
      "desktop-library-inspection",
    );
    await page.keyboard.press("Escape");
    await expect(candidate).toBeFocused();
    await expect(page.getByRole("searchbox", { name: "Search spell names" })).toHaveValue("a");
    await candidate.click();
    await dialog.getByRole("button", { name: "Open Preview", exact: true }).click();
    await expect(page.locator(".card-preview-page").first()).toBeVisible();
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(
      table.getByRole("checkbox", { name: "Select Acid Splash", exact: true }),
    ).toBeChecked();
    measurements["desktop-table-resumed"] = await capture(page, info, "desktop-table-resumed");
  }
  const directory = path.resolve("docs/option-a-lite-evidence", stage!);
  await writeFile(path.join(directory, "measurements.json"), JSON.stringify(measurements, null, 2));
});

test("capture unavailable-language entries using a controlled network fixture", async ({
  page,
}, info) => {
  test.skip(stage !== "after", "Additional Gate 1 evidence has no paired baseline.");
  await page.route("**/spell-languages.json", (route) =>
    route.fulfill({
      json: [
        { code: "en", displayName: "English", dataset: "/spells.srd.json" },
        { code: "fr", displayName: "Français", dataset: "/spells.srd.fr.json" },
      ],
    }),
  );
  await page.route("**/spells.srd.fr.json", (route) =>
    route.fulfill({
      json: [
        {
          id: "srd-acid-arrow",
          name: "Flèche acide",
          level: 2,
          school: "Evocation",
          castingTime: "1 action",
          range: "27 mètres",
          components: { verbal: true, somatic: true, material: true },
          duration: "Instantanée",
          concentration: false,
          ritual: false,
          classes: ["Wizard"],
          description: ["Une flèche acide file vers une cible."],
          source: "SRD-5.2.1",
        },
      ],
    }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.getByRole("button", { name: /Spell data language/ }).click();
  await page.getByRole("option", { name: /Français/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  await expect(
    page
      .locator("#deck-panel")
      .getByText(/Not available in fr/)
      .first(),
  ).toBeVisible();
  await capture(page, info, "desktop-partial-language-list");
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(
    page
      .getByRole("table", { name: "Active deck table", exact: true })
      .getByText("Fireball", { exact: true }),
  ).toBeVisible();
  await capture(page, info, "desktop-partial-language-table");
});

test("capture representative Gate 2 layouts", async ({ page }, info) => {
  test.skip(stage !== "gate-2", "Set OPTION_A_EVIDENCE=gate-2 to capture these layouts.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  const rename = await openDeckRename(page);
  await rename.fill("Evidence Deck Working");
  await rename.press("Enter");
  await page.getByRole("button", { name: "Rename deck Evidence Deck Working" }).click();
  await expect(page.locator("#deck-panel").getByText("Unsaved changes")).toBeVisible();
  const measurements: Record<string, unknown> = {};
  for (const [width, height] of [
    [390, 844],
    [820, 1180],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator("main")).toHaveAttribute(
      "data-workspace-mode",
      width < 720 ? "compact" : width < 1200 ? "split" : "wide",
    );
    const suffix = `${width}x${height}`;
    if (width !== 820) {
      await selectPreview(page, "Fireball");
      if (width === 390) {
        measurements[`preview-Fireball-${suffix}`] = await capture(
          page,
          info,
          `preview-Fireball-${suffix}`,
        );
      }
    }
    const deckTab = page.getByRole("tab", { name: "Deck", exact: true });
    if (await deckTab.isVisible()) await deckTab.click();
    await page.getByRole("button", { name: "List", exact: true }).click();
    if (width !== 820) {
      measurements[`list-${suffix}`] = await capture(page, info, `list-${suffix}`);
    }
    await page.getByRole("button", { name: "Table", exact: true }).click();
    measurements[`table-${suffix}`] = await capture(page, info, `table-${suffix}`);
    await page.getByRole("button", { name: "List", exact: true }).click();
  }
  const directory = path.resolve("docs/option-a-lite-evidence", stage!);
  await writeFile(path.join(directory, "measurements.json"), JSON.stringify(measurements, null, 2));
});
