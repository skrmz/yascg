import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { LEGAL_CONFIG } from "@/legal/config.ts";
import { PrivacyDialog } from "./PrivacyDialog.tsx";

async function setLocale(code: string) {
  await act(async () => {
    await i18n.changeLanguage(code);
  });
}

function renderDialog() {
  return render(<PrivacyDialog open onOpenChange={() => {}} />);
}

beforeEach(async () => {
  await setLocale("en");
});

afterEach(async () => {
  await setLocale("en");
});

describe("PrivacyDialog", () => {
  it("renders the English policy with legal references and configured controller details", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Privacy Policy" });

    expect(dialog.textContent).toContain("TDDDG");
    expect(dialog.textContent).toContain("GDPR");
    expect(dialog.textContent).toContain("Cloudflare, Inc.");
    expect(dialog.textContent).toContain(LEGAL_CONFIG.controllerName);
    expect(dialog.textContent).toContain(LEGAL_CONFIG.controllerEmail);
    expect(dialog.textContent).not.toContain("[FULL_LEGAL_NAME]");
    expect(dialog.textContent).not.toContain("[CONTACT_EMAIL]");
    expect(dialog.textContent).toContain("2026-11-10");
    expect(dialog.textContent).toContain("Cloudflare's Privacy Policy");
    expect(dialog.textContent).toContain("https://www.cloudflare.com/privacypolicy/");
  });

  it("documents existing deletion mechanisms and browser settings", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Privacy Policy" });
    const text = dialog.textContent ?? "";

    expect(text).toContain("saved decks remain unchanged");
    expect(text).toContain("linked active-deck association is cleared");
    expect(text).toContain("Clear entries");
    expect(text).toContain("Reset to original");
    expect(text).toContain("Browser settings can remove all site data");
    expect(text).toContain("no central button to delete all local data");
  });

  it("has no bulk-delete action", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Privacy Policy" });

    expect(
      screen.queryByRole("button", { name: /Alle lokalen Daten löschen|Delete all local data/i }),
    ).toBeNull();
    expect(dialog.textContent).not.toContain("Delete All Local Data");
  });

  it("renders the authoritative German policy", async () => {
    await setLocale("de");
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Datenschutzerklärung" });
    const text = dialog.textContent ?? "";

    expect(text).toContain("maßgebliche Fassung");
    expect(text).toContain("TDDDG");
    expect(text).toContain("DSGVO");
    expect(text).toContain("Cloudflare, Inc.");
    expect(text).toContain(LEGAL_CONFIG.controllerName);
    expect(text).toContain(LEGAL_CONFIG.controllerEmail);
    expect(text).not.toContain("[FULL_LEGAL_NAME]");
    expect(text).not.toContain("[CONTACT_EMAIL]");
    expect(text).toContain("Einträge leeren");
    expect(text).toContain("Auf Original zurücksetzen");
    expect(text).toContain("Browsereinstellungen");
    expect(text).toContain("keine zentrale Schaltfläche");
    expect(
      screen.queryByRole("button", { name: /Alle lokalen Daten löschen|Delete all local data/i }),
    ).toBeNull();
  });
});
