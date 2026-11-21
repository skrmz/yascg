import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { AboutDialog } from "./AboutDialog.tsx";

async function setLocale(code: string) {
  await act(async () => {
    await i18n.changeLanguage(code);
  });
}

afterEach(async () => {
  await setLocale("en");
});

describe("AboutDialog", () => {
  it("shows the build version and commit", () => {
    render(<AboutDialog open onOpenChange={() => {}} />);
    expect(screen.getByText("Version")).not.toBeNull();
    expect(screen.getByText(`v` + __APP_VERSION__)).not.toBeNull();
    expect(screen.getByText("Commit")).not.toBeNull();
    expect(screen.getByText(__APP_COMMIT__)).not.toBeNull();
  });

  it("lists the key features and retains the legal notices", () => {
    render(<AboutDialog open onOpenChange={() => {}} />);

    const features = screen.getAllByRole("listitem");
    expect(features).toHaveLength(6);
    expect(features.some((item) => /SRD 5\.2\.1 library/.test(item.textContent ?? ""))).toBe(true);
    expect(screen.getByText(/not affiliated with/)).not.toBeNull();
    expect(screen.getByText(/Wizards of the Coast LLC/)).not.toBeNull();
  });

  it("renders the German features and notices", async () => {
    await setLocale("de");
    render(<AboutDialog open onOpenChange={() => {}} />);

    const dialog = screen.getByRole("dialog", { name: /Über YASCG/ });
    const features = within(dialog).getAllByRole("listitem");
    expect(features).toHaveLength(6);
    expect(features.some((item) => /SRD-5\.2\.1-Bibliothek/.test(item.textContent ?? ""))).toBe(
      true,
    );
    expect(within(dialog).getByText(/weder unterstützt noch gesponsert/)).not.toBeNull();
    expect(within(dialog).getByText(/Wizards of the Coast LLC/)).not.toBeNull();
  });
});
