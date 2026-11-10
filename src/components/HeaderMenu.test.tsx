import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { LEGAL_CONFIG } from "@/legal/config.ts";
import { HeaderMenu } from "./HeaderMenu.tsx";

async function setLocale(code: string) {
  await act(async () => {
    await i18n.changeLanguage(code);
  });
}

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(async () => {
  await setLocale("en");
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(async () => {
  await setLocale("en");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

async function openMenuItem(label: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open menu" }));
  const menu = screen.getByRole("menu");
  await user.click(within(menu).getByRole("menuitem", { name: label }));
  return user;
}

describe("HeaderMenu", () => {
  it("opens the About dialog and closes the menu", async () => {
    render(<HeaderMenu />);

    await openMenuItem("About App");

    expect(screen.getByRole("dialog", { name: /About YASCG/ })).not.toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens the guide and copies the JSON example", async () => {
    render(<HeaderMenu />);

    await openMenuItem("Custom Spells Guide");
    const dialog = screen.getByRole("dialog", { name: "Custom Spells Guide" });

    expect(dialog.querySelector(".card-h-level-1")?.textContent).toBe("Custom Spells Guide");
    expect(within(dialog).getAllByRole("table").length).toBeGreaterThan(0);
    expect(
      within(dialog)
        .getByRole("link", { name: "The Funniest Joke in the World" })
        .getAttribute("href"),
    ).toBe("https://en.wikipedia.org/wiki/The_Funniest_Joke_in_the_World");

    const schemaLink = within(dialog).getByRole("link", { name: "JSON Schema" });
    expect(schemaLink.getAttribute("href")).toBe("/custom-spell-card-json-schema.json");
    expect(schemaLink.hasAttribute("download")).toBe(true);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    expect(within(dialog).getAllByRole("button", { name: "Download JSON example" })).toHaveLength(
      1,
    );
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Copy code" })[0]);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"type": "custom-spells"'));
    expect(await within(dialog).findByText("Copied")).not.toBeNull();
  });

  it("shows the German menu, About dialog, and guide", async () => {
    await setLocale("de");
    render(<HeaderMenu />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Menü öffnen" }));
    await user.click(screen.getByRole("menuitem", { name: "Über die App" }));
    expect(screen.getByRole("dialog", { name: /Über YASCG/ })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Schließen" }));

    await user.click(screen.getByRole("button", { name: "Menü öffnen" }));
    await user.click(screen.getByRole("menuitem", { name: "Leitfaden für eigene Zauber" }));

    const dialog = screen.getByRole("dialog", { name: "Leitfaden für eigene Zauber" });
    expect(dialog.querySelector(".card-h-level-1")?.textContent).toBe(
      "Leitfaden für eigene Zauber",
    );
    expect(within(dialog).getByText("Vollständiges Beispiel")).not.toBeNull();
    expect(
      within(dialog).getAllByRole("button", { name: "JSON-Beispiel herunterladen" }),
    ).toHaveLength(1);
  });

  it("opens the Privacy Policy in English and German", async () => {
    render(<HeaderMenu />);

    const user = await openMenuItem("Privacy Policy");
    const englishDialog = screen.getByRole("dialog", { name: "Privacy Policy" });
    expect(englishDialog.textContent).toContain("TDDDG");
    expect(englishDialog.textContent).toContain(LEGAL_CONFIG.controllerName);
    expect(englishDialog.textContent).toContain(LEGAL_CONFIG.controllerEmail);
    expect(
      within(englishDialog).queryByRole("button", {
        name: /Delete all local data|Alle lokalen Daten löschen/i,
      }),
    ).toBeNull();
    await user.click(within(englishDialog).getByText("Close"));

    await setLocale("de");
    await user.click(screen.getByRole("button", { name: "Menü öffnen" }));
    await user.click(screen.getByRole("menuitem", { name: "Datenschutzerklärung" }));

    const germanDialog = screen.getByRole("dialog", { name: "Datenschutzerklärung" });
    expect(germanDialog.textContent).toContain("TDDDG");
    expect(germanDialog.textContent).toContain("DSGVO");
    expect(
      within(germanDialog).queryByRole("button", {
        name: /Delete all local data|Alle lokalen Daten löschen/i,
      }),
    ).toBeNull();
  });
});
