import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { db } from "@/db/database.ts";
import { makeSpell } from "@/test/fixtures/spells.ts";
import { AppProvider, useApp } from "./AppProvider.tsx";

const mutation = vi.hoisted(() => ({ gate: null as Promise<void> | null, error: false }));
vi.mock("@/db/active-deck.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/active-deck.ts")>();
  return {
    ...actual,
    mutateActiveDeck: async (...args: Parameters<typeof actual.mutateActiveDeck>) => {
      await mutation.gate;
      if (mutation.error) throw new Error("Write failed");
      return actual.mutateActiveDeck(...args);
    },
  };
});
vi.mock("@/services/data/load.ts", () => ({
  clearDataCache: () => undefined,
  loadManifest: async () => [{ code: "en", label: "English", file: "en.json" }],
  loadLanguageDataset: async () => [],
  loadShortDescriptions: async () => new Map(),
}));

beforeEach(async () => {
  mutation.gate = null;
  mutation.error = false;
  localStorage.clear();
  await db.delete();
  await db.open();
});

describe("successful Library Add selection", () => {
  async function mount() {
    const view = renderHook(() => useApp(), { wrapper: AppProvider });
    await waitFor(() => expect(view.result.current.activeDeck).not.toBeNull());
    await waitFor(() => expect(view.result.current.dataLoading).toBe(false));
    return view;
  }

  it("selects a successfully added spell without requiring navigation", async () => {
    const { result } = await mount();
    await act(async () => {
      expect(await result.current.addSpellToDeck(makeSpell(), { selectOnSuccess: true })).toBe(
        "added",
      );
    });
    expect(result.current.selectedSpellId).toBe("srd-test-spell");
  });

  it.each(["srd-new-selection", "srd-original"])(
    "preserves explicit selection %s made while Add was pending, including reselection",
    async (nextSelection) => {
      const { result } = await mount();
      act(() => result.current.selectSpell("srd-original"));
      let release!: () => void;
      mutation.gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await act(async () => {
        const adding = result.current.addSpellToDeck(makeSpell(), { selectOnSuccess: true });
        result.current.selectSpell(nextSelection);
        release();
        expect(await adding).toBe("added");
      });
      expect(result.current.selectedSpellId).toBe(nextSelection);
      await waitFor(() => expect(result.current.activeDeck?.entries).toHaveLength(1));
    },
  );

  it("preserves selection on duplicate/error and when Add does not request selection", async () => {
    const { result } = await mount();
    act(() => result.current.selectSpell("srd-original"));
    await act(async () => {
      expect(await result.current.addSpellToDeck(makeSpell())).toBe("added");
      expect(await result.current.addSpellToDeck(makeSpell(), { selectOnSuccess: true })).toBe(
        "duplicate",
      );
      mutation.error = true;
      expect(
        await result.current.addSpellToDeck(makeSpell({ id: "srd-another" }), {
          selectOnSuccess: true,
        }),
      ).toBe("error");
    });
    expect(result.current.selectedSpellId).toBe("srd-original");
  });
});
