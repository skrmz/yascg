import { describe, expect, it } from "vite-plus/test";
import { buildRuntimeSidecars, type SourceTextFields } from "./transform.ts";
import { serializeAuthoringFile } from "./serialize.ts";
import type { AuthoringEntry } from "./authoring-schema.ts";

const HASH = `sha256:${"b".repeat(64)}`;
const STALE_HASH = `sha256:${"c".repeat(64)}`;
const LONG_SOURCE = "A long source description that keeps repeating the same rules text.";
const SHORT_SOURCE = "Short source.";

function dataset(entries: Record<string, SourceTextFields>): ReadonlyMap<string, SourceTextFields> {
  return new Map(Object.entries(entries));
}

function fingerprints(entries: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

function makeEntry(overrides: Partial<AuthoringEntry> = {}): AuthoringEntry {
  return {
    spellId: "srd-fireball",
    description: "Short text.",
    sourceHash: HASH,
    status: "accepted",
    acceptance: "auto",
    origin: "generated",
    ...overrides,
  };
}

function build(
  entries: Record<string, AuthoringEntry[]>,
  options: {
    locales?: string[];
    datasets?: Record<string, SourceTextFields>;
    hashes?: Record<string, string>;
  } = {},
) {
  const authoringFiles = new Map<string, unknown>(
    Object.entries(entries).map(([locale, list]) => [locale, { locale, entries: list }]),
  );
  return buildRuntimeSidecars({
    manifestLocales: options.locales ?? ["en"],
    authoringFiles,
    datasets: new Map([
      ["en", dataset(options.datasets ?? { "srd-fireball": { description: [LONG_SOURCE] } })],
    ]),
    fingerprints: new Map([["en", fingerprints(options.hashes ?? { "srd-fireball": HASH })]]),
  });
}

describe("runtime sidecar transform", () => {
  it("includes a fresh, accepted, materially shorter entry", () => {
    const result = build({ en: [makeEntry()] });
    expect(result.diagnostics).toEqual([{ locale: "en", authored: 1, included: 1 }]);
    expect(result.entries.get("en")?.get("srd-fireball")).toEqual({ description: "Short text." });
    expect(result.files.get("en")).toBe(
      '{\n  "srd-fireball": {\n    "description": "Short text."\n  }\n}\n',
    );
  });

  it("omits stale, withheld, orphaned, and non-shortening entries with warnings", () => {
    const result = build(
      {
        en: [
          makeEntry({ spellId: "srd-stale", sourceHash: STALE_HASH }),
          makeEntry({ spellId: "srd-withheld", status: "withheld" }),
          makeEntry({ spellId: "srd-orphaned" }),
          makeEntry({ spellId: "srd-long", description: LONG_SOURCE }),
        ],
      },
      {
        datasets: {
          "srd-stale": { description: [LONG_SOURCE] },
          "srd-withheld": { description: [LONG_SOURCE] },
          "srd-long": { description: [LONG_SOURCE] },
        },
        hashes: {
          "srd-stale": HASH,
          "srd-withheld": HASH,
          "srd-long": HASH,
        },
      },
    );

    expect(result.entries.get("en")?.size).toBe(0);
    expect(result.warnings.map((warning) => warning.code).sort()).toEqual([
      "not-shortening",
      "orphaned",
      "stale",
      "withheld",
    ]);
    expect(result.files.get("en")).toBe("{}\n");
  });

  it("emits one deterministic sidecar per manifest locale", () => {
    const authoringFiles = new Map<string, unknown>([
      [
        "en",
        {
          locale: "en",
          entries: [makeEntry({ spellId: "srd-b" }), makeEntry({ spellId: "srd-a" })],
        },
      ],
      ["de", { locale: "de", entries: [] }],
    ]);
    const result = buildRuntimeSidecars({
      manifestLocales: ["en", "de"],
      authoringFiles,
      datasets: new Map([
        [
          "en",
          dataset({
            "srd-a": { description: [LONG_SOURCE] },
            "srd-b": { description: [LONG_SOURCE] },
          }),
        ],
        ["de", dataset({})],
      ]),
      fingerprints: new Map([
        ["en", fingerprints({ "srd-a": HASH, "srd-b": HASH })],
        ["de", fingerprints({})],
      ]),
    });

    expect([...result.files.keys()]).toEqual(["en", "de"]);
    expect(result.files.get("de")).toBe("{}\n");
    expect(result.files.get("en")).toBe(
      [
        "{",
        '  "srd-a": {',
        '    "description": "Short text."',
        "  },",
        '  "srd-b": {',
        '    "description": "Short text."',
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("preserves description before higherLevels and excludes metadata", () => {
    const result = build({
      en: [makeEntry({ higherLevels: "More damage." })],
    });
    const text = result.files.get("en") ?? "";
    expect(text.indexOf('"description"')).toBeLessThan(text.indexOf('"higherLevels"'));
    expect(text).not.toContain("sourceHash");
    expect(text).not.toContain("status");
    expect(text).not.toContain("acceptance");
    expect(text).not.toContain("origin");
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).not.toContain("\r");
  });

  it("emits an empty sidecar for a manifest locale without an authoring file", () => {
    const result = buildRuntimeSidecars({
      manifestLocales: ["en"],
      authoringFiles: new Map(),
      datasets: new Map([["en", dataset({})]]),
      fingerprints: new Map([["en", fingerprints({})]]),
    });
    expect(result.files.get("en")).toBe("{}\n");
    expect(result.diagnostics).toEqual([{ locale: "en", authored: 0, included: 0 }]);
  });

  it("fails structurally on schema violations and locale mismatch", () => {
    expect(() => build({ en: [makeEntry({ spellId: "fireball" })] })).toThrow(/spellId/);
    expect(() => build({ de: [makeEntry()] })).toThrow(/not a manifest language/);
    expect(() => build({ en: [makeEntry({ description: "   " })] })).toThrow(/description/);
  });

  it("requires a normalized dataset for every manifest locale", () => {
    expect(() =>
      buildRuntimeSidecars({
        manifestLocales: ["en", "de"],
        authoringFiles: new Map(),
        datasets: new Map([["en", dataset({})]]),
        fingerprints: new Map(),
      }),
    ).toThrow(/Missing normalized dataset/);
  });

  it("serializes authoring files deterministically", () => {
    const text = serializeAuthoringFile("en", [
      makeEntry({ spellId: "srd-b" }),
      makeEntry({ spellId: "srd-a", higherLevels: "More." }),
    ]);
    expect(text.startsWith('{\n  "locale": "en",\n  "entries": [')).toBe(true);
    expect(text.indexOf('"srd-a"')).toBeLessThan(text.indexOf('"srd-b"'));
    expect(text.endsWith("}\n")).toBe(true);
  });
});

describe("transform isolation", () => {
  it("performs no network calls", () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network access is not allowed in the transform");
    }) as typeof fetch;
    try {
      expect(() => build({ en: [makeEntry()] })).not.toThrow();
    } finally {
      globalThis.fetch = original;
    }
  });
});
describe("short source handling", () => {
  it("marks an entry ineligible when the source is already short", () => {
    const result = build(
      { en: [makeEntry({ description: SHORT_SOURCE })] },
      { datasets: { "srd-fireball": { description: [SHORT_SOURCE] } } },
    );
    expect(result.files.get("en")).toBe("{}\n");
    expect(result.warnings[0]?.code).toBe("not-shortening");
  });
});
