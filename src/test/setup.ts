import "fake-indexeddb/auto";
import "../i18n.ts";
import { afterEach } from "vite-plus/test";
import { cleanup } from "@testing-library/react";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

Object.defineProperty(globalThis, "matchMedia", {
  configurable: true,
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      get matches() {
        return /\(\s*min-width:/.test(query);
      },
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList,
});

if (typeof Element !== "undefined") {
  const elementStubs = {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  };
  for (const [name, stub] of Object.entries(elementStubs)) {
    if (name in Element.prototype) continue;
    Object.defineProperty(Element.prototype, name, { configurable: true, value: stub });
  }
}

let workspaceWidth = 1280;
const workspaceObservers = new Set<() => void>();
/** Notify the observed workspace without changing the window's viewport. Wrap in act(). */
export function setWorkspaceWidth(width: number) {
  workspaceWidth = width;
  workspaceObservers.forEach((notify) => notify());
}
class ResizeObserverStub {
  private notify: (() => void) | undefined;
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) {
    if (target.tagName !== "MAIN") return;
    this.notify = () =>
      this.callback(
        [{ target, contentRect: { width: workspaceWidth } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    workspaceObservers.add(this.notify);
    this.notify();
  }
  unobserve() {
    this.disconnect();
  }
  disconnect() {
    if (this.notify) workspaceObservers.delete(this.notify);
  }
}
Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  writable: true,
  value: ResizeObserverStub,
});

afterEach(() => {
  workspaceWidth = 1280;
  cleanup();
});
