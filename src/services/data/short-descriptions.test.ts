import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  clearDataCache,
  configureDataFetch,
  getCachedShortDescriptions,
  loadLanguageDataset,
  loadManifest,
  loadShortDescriptions,
  shortDescriptionUrl,
} from "./load.ts";

type Responder = () => Response | Promise<Response>;

let routes: Record<string, Responder>;
let calls: string[];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  clearDataCache();
  routes = {};
  calls = [];
  configureDataFetch(async (url) => {
    calls.push(url);
    const responder = routes[url];
    if (!responder) throw new Error(`Unexpected fetch: ${url}`);
    return responder();
  });
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
  configureDataFetch(null);
  clearDataCache();
});

describe("loadShortDescriptions", () => {
  it("loads a valid sidecar and caches it per locale", async () => {
    routes[shortDescriptionUrl("en")] = () =>
      jsonResponse({
        "srd-fireball": { description: "A bright streak flashes.", higherLevels: "More damage." },
        "srd-light": { description: "Touch an object to make it glow." },
      });

    const en = await loadShortDescriptions("en");
    expect(en.get("srd-fireball")).toEqual({
      description: "A bright streak flashes.",
      higherLevels: "More damage.",
    });
    expect(en.get("srd-light")).toEqual({ description: "Touch an object to make it glow." });
    expect(getCachedShortDescriptions("en")).toBe(en);

    await loadShortDescriptions("en");
    expect(calls).toHaveLength(1);
  });

  it("keeps locales independent and never falls back to English", async () => {
    routes[shortDescriptionUrl("en")] = () =>
      jsonResponse({ "srd-fireball": { description: "English only." } });
    routes[shortDescriptionUrl("de")] = () => jsonResponse({});

    const en = await loadShortDescriptions("en");
    const de = await loadShortDescriptions("de");

    expect(en.get("srd-fireball")).toEqual({ description: "English only." });
    expect(de.size).toBe(0);
    expect(getCachedShortDescriptions("de")).toBe(de);
  });

  it("returns an empty map for a missing sidecar", async () => {
    routes[shortDescriptionUrl("en")] = () => jsonResponse({ error: "not found" }, 404);

    const map = await loadShortDescriptions("en");
    expect(map.size).toBe(0);
  });

  it("returns an empty map for malformed top-level JSON", async () => {
    routes[shortDescriptionUrl("en")] = () => jsonResponse(["unexpected"]);
    expect((await loadShortDescriptions("en")).size).toBe(0);

    clearDataCache();
    routes[shortDescriptionUrl("en")] = () => jsonResponse(null);
    expect((await loadShortDescriptions("en")).size).toBe(0);

    clearDataCache();
    routes[shortDescriptionUrl("en")] = () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }) as unknown as Response;
    expect((await loadShortDescriptions("en")).size).toBe(0);
  });

  it("skips invalid entries and keeps the valid subset", async () => {
    routes[shortDescriptionUrl("en")] = () =>
      jsonResponse({
        "srd-good": { description: "Valid text." },
        "srd-empty": { description: "   " },
        "srd-metadata": { description: "Valid text.", sourceHash: "sha256:abc" },
        "srd-BadCase": { description: "Valid text." },
        "not-canonical": { description: "Valid text." },
        "srd-number": { description: 42 },
      });

    const map = await loadShortDescriptions("en");
    expect([...map.keys()]).toEqual(["srd-good"]);
  });

  it("clears sidecar caching with the shared data cache", async () => {
    routes[shortDescriptionUrl("en")] = () =>
      jsonResponse({ "srd-fireball": { description: "Cached text." } });

    await loadShortDescriptions("en");
    expect(getCachedShortDescriptions("en")).not.toBeUndefined();

    clearDataCache();
    expect(getCachedShortDescriptions("en")).toBeUndefined();

    await loadShortDescriptions("en");
    expect(calls).toHaveLength(2);
  });

  it("does not disturb dataset loading when the sidecar fetch fails", async () => {
    routes["/spell-languages.json"] = () =>
      jsonResponse([{ code: "en", displayName: "English", dataset: "/spells.srd.json" }]);
    routes["/spells.srd.json"] = () =>
      jsonResponse([
        {
          id: "srd-fireball",
          name: "Fireball",
          level: 3,
          school: "Evocation",
          castingTime: "1 Action",
          range: "150 feet",
          components: { verbal: true, somatic: true, material: true },
          duration: "Instantaneous",
          concentration: false,
          ritual: false,
          classes: ["Wizard"],
          description: ["A bright streak flashes."],
          source: "SRD-5.2.1",
        },
      ]);
    routes[shortDescriptionUrl("en")] = () => {
      throw new Error("network down");
    };

    await expect(loadManifest()).resolves.toHaveLength(1);
    await expect(loadLanguageDataset("en")).resolves.toHaveLength(1);
    await expect(loadShortDescriptions("en")).resolves.toEqual(new Map());
  });
});
