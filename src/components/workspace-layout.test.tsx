import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { setWorkspaceWidth } from "@/test/setup.ts";
import { modeForWidth, useWorkspaceLayout } from "./workspace-layout.ts";

function Workspace() {
  const { ref, mode } = useWorkspaceLayout();
  return <main ref={ref}>{mode}</main>;
}
describe("workspace container modes", () => {
  it.each([
    [319, "compact"],
    [700, "compact"],
    [719, "compact"],
    [720, "split"],
    [800, "split"],
    [1199, "split"],
    [1200, "wide"],
    [1300, "wide"],
  ] as const)("maps %ipx to %s", (width, mode) => {
    expect(modeForWidth(width)).toBe(mode);
  });
  it("updates from the observed container independently of viewport width", () => {
    setWorkspaceWidth(700);
    render(<Workspace />);
    expect(screen.getByRole("main").textContent).toBe("compact");
    act(() => setWorkspaceWidth(800));
    expect(screen.getByRole("main").textContent).toBe("split");
    act(() => setWorkspaceWidth(1300));
    expect(screen.getByRole("main").textContent).toBe("wide");
  });
  it("measures the container and listens for resize without ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const bounds = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 800 } as DOMRect);
    const view = render(<Workspace />);
    expect(screen.getByRole("main").textContent).toBe("split");
    bounds.mockReturnValue({ width: 1300 } as DOMRect);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("main").textContent).toBe("wide");
    view.unmount();
    vi.unstubAllGlobals();
  });
});
