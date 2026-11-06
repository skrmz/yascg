import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import "@/i18n.ts";
import { AboutDialog } from "./AboutDialog.tsx";

describe("AboutDialog build metadata", () => {
  it("shows the build version and commit", () => {
    render(<AboutDialog open onOpenChange={() => {}} />);
    expect(screen.getByText("Version")).not.toBeNull();
    expect(screen.getByText(`v` + __APP_VERSION__)).not.toBeNull();
    expect(screen.getByText("Commit")).not.toBeNull();
    expect(screen.getByText(__APP_COMMIT__)).not.toBeNull();
  });
});
