import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { AboutDialog, SRD_ATTRIBUTION } from "./AboutDialog.tsx";

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

  it("renders the feature list and legal attribution", () => {
    render(<AboutDialog open onOpenChange={() => {}} />);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(within(dialog).getByText(SRD_ATTRIBUTION)).not.toBeNull();
  });

  it("renders localized content", async () => {
    await setLocale("de");
    render(<AboutDialog open onOpenChange={() => {}} />);

    const dialog = screen.getByRole("dialog");
    const features = within(dialog).getAllByRole("listitem");
    expect(features.length).toBeGreaterThan(0);
    expect(features.every((item) => (item.textContent ?? "").trim().length > 0)).toBe(true);
    expect(within(dialog).getByText(SRD_ATTRIBUTION)).not.toBeNull();
  });

  it("closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(<AboutDialog open onOpenChange={onOpenChange} />);

    const user = userEvent.setup();
    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
