import { describe, expect, it, vi } from "vite-plus/test";
import type { ChangeKind } from "@/db/notifications.ts";

/**
 * Models two browser tabs as two independent module instances: each instance
 * opens its own BroadcastChannel with the same channel name, which is how the
 * real app's cross-tab advisory notifications reach other tabs.
 */
async function twoTabs() {
  vi.resetModules();
  const tabA = await import("@/db/notifications.ts");
  vi.resetModules();
  const tabB = await import("@/db/notifications.ts");
  return { tabA, tabB };
}

describe("cross-tab change notifications", () => {
  it("delivers the srd-overrides change kind to another tab", async () => {
    const { tabA, tabB } = await twoTabs();

    const received = new Promise<ChangeKind>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no cross-tab notification received")), 3000);
      const unsubscribe = tabB.subscribeToChanges((message) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(message.kind);
      });
    });

    tabA.publishChange("srd-overrides");
    await expect(received).resolves.toBe("srd-overrides");
  });

  it("stops delivering after the subscriber unsubscribes", async () => {
    const { tabA, tabB } = await twoTabs();
    const seen: ChangeKind[] = [];

    const first = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no notification received")), 3000);
      const unsubscribe = tabB.subscribeToChanges((message) => {
        seen.push(message.kind);
        clearTimeout(timer);
        unsubscribe();
        resolve();
      });
    });
    tabA.publishChange("srd-overrides");
    await first;

    tabA.publishChange("custom-spells");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen).toEqual(["srd-overrides"]);
  });
});
