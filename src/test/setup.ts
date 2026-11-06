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

let desktopViewport = true;

/** Tests default to the desktop layout; opt into mobile before rendering. */
export function setDesktopViewport(isDesktop: boolean) {
  desktopViewport = isDesktop;
}

function matchesQuery(query: string): boolean {
  return /\(\s*min-width:/.test(query) ? desktopViewport : false;
}

Object.defineProperty(globalThis, "matchMedia", {
  configurable: true,
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      get matches() {
        return matchesQuery(query);
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

if (!globalThis.ResizeObserver) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverStub,
  });
}

afterEach(() => {
  desktopViewport = true;
  cleanup();
});
