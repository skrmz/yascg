import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { Tooltip, TooltipProvider } from "./Tooltip.tsx";

function renderTouchableTooltip() {
  render(
    <TooltipProvider delayDuration={0}>
      <Tooltip label="Status label" touchable>
        <button type="button">Trigger</button>
      </Tooltip>
    </TooltipProvider>,
  );
  return screen.getByRole("button", { name: "Trigger" });
}

function pointerEvent(element: HTMLElement, type: string, pointerType: string) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  element.dispatchEvent(event);
}

function tap(element: HTMLElement, pointerType = "touch") {
  pointerEvent(element, "pointerdown", pointerType);
  pointerEvent(element, "pointerup", pointerType);
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

describe("Tooltip", () => {
  it("toggles on tap", async () => {
    const trigger = renderTouchableTooltip();
    expect(screen.queryByRole("tooltip")).toBeNull();

    tap(trigger);
    expect((await screen.findByRole("tooltip")).textContent).toContain("Status label");

    tap(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("leaves mouse interaction to the tooltip primitive", () => {
    const trigger = renderTouchableTooltip();
    pointerEvent(trigger, "pointerdown", "mouse");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not swallow the trigger's click action on touch", () => {
    const onClick = vi.fn();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip label="Status label" touchable>
          <button type="button" onClick={onClick}>
            Trigger
          </button>
        </Tooltip>
      </TooltipProvider>,
    );
    tap(screen.getByRole("button", { name: "Trigger" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not toggle on touch when not enabled", () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip label="Status label">
          <button type="button">Trigger</button>
        </Tooltip>
      </TooltipProvider>,
    );
    tap(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
