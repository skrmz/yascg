import "fake-indexeddb/auto";
import { afterEach } from "vite-plus/test";
import { cleanup } from "@testing-library/react";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

if (!globalThis.matchMedia) {
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
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
  cleanup();
});
