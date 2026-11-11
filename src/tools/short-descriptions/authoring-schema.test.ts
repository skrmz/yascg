import { describe, expect, it } from "vite-plus/test";
import {
  authoringEntrySchema,
  createEmptyAuthoringFile,
  parseAuthoringFile,
  sortAuthoringEntries,
  type AuthoringEntry,
} from "./authoring-schema.ts";

const HASH = `sha256:${"a".repeat(64)}`;
const LOCALE = "en";
const FILE = `data/short-descriptions/${LOCALE}.json`;

function makeEntry(overrides: Partial<AuthoringEntry> = {}): AuthoringEntry {
  return {
    spellId: "srd-fireball",
    description: "A bright streak flashes from your pointing finger.",
    higherLevels: "The damage increases by 1d6 per slot level above 3.",
    sourceHash: HASH,
    status: "accepted",
    acceptance: "auto",
    origin: "generated",
    ...overrides,
  };
}

function parse(entries: unknown[], locale = LOCALE) {
  return parseAuthoringFile(
    { locale, entries },
    { fileName: FILE, locale, manifestLocales: ["en", "de"] },
  );
}

describe("authoring schema", () => {
  it("accepts a valid file and sorts entries by spellId", () => {
    const file = parse([
      makeEntry({ spellId: "srd-light" }),
      makeEntry({ spellId: "srd-fireball" }),
    ]);
    expect(file.locale).toBe("en");
    expect(file.sortedEntries.map((entry) => entry.spellId)).toEqual(["srd-fireball", "srd-light"]);
  });

  it("accepts a well-formed but unknown canonical id", () => {
    const file = parse([makeEntry({ spellId: "srd-unknown-spell" })]);
    expect(file.entries[0]?.spellId).toBe("srd-unknown-spell");
  });

  it("rejects malformed ids", () => {
    for (const spellId of ["fireball", "srd_Fireball", "srd-", "SRD-fireball", "srd--double"]) {
      expect(() => parse([makeEntry({ spellId })])).toThrow(/spellId/);
    }
  });

  it("rejects missing, extra, and unknown-status fields", () => {
    const missing = makeEntry() as unknown as Record<string, unknown>;
    delete missing.sourceHash;
    expect(() => parse([missing])).toThrow(/sourceHash/);

    expect(() => parse([{ ...makeEntry(), review: "ok" }])).toThrow();
    expect(() => parse([{ ...makeEntry(), status: "invalid" }])).toThrow(/status/);
  });

  it("rejects empty and over-limit text", () => {
    expect(() => parse([makeEntry({ description: "   " })])).toThrow(/description/);
    expect(() => parse([makeEntry({ description: "x".repeat(20_001) })])).toThrow(/description/);
    expect(() => parse([makeEntry({ higherLevels: "y".repeat(20_001) })])).toThrow(/higherLevels/);
  });

  it("treats whitespace-only higherLevels as omitted", () => {
    const file = parse([{ ...makeEntry(), higherLevels: "   " }]);
    expect(file.entries[0]?.higherLevels).toBeUndefined();
  });

  it("rejects duplicate spell ids", () => {
    expect(() => parse([makeEntry(), makeEntry()])).toThrow(/duplicate spellId/);
  });

  it("rejects unsafe Markdown", () => {
    for (const description of [
      "Deals damage <script>alert(1)</script>.",
      "See [the rules](https://example.com).",
      "See https://example.com for rules.",
      "![alt](https://example.com/image.png)",
      "| a | b |\n| - | - |\n| 1 | 2 |",
    ]) {
      expect(() => parse([makeEntry({ description })])).toThrow(/unsafe Markdown/);
    }
  });

  it("rejects a locale that does not match the file name or manifest", () => {
    expect(() =>
      parseAuthoringFile(
        { locale: "en", entries: [] },
        { fileName: "de.json", locale: "de", manifestLocales: ["en", "de"] },
      ),
    ).toThrow(/does not match file name/);
    expect(() =>
      parseAuthoringFile(
        { locale: "fr", entries: [] },
        { fileName: "fr.json", locale: "fr", manifestLocales: ["en", "de"] },
      ),
    ).toThrow(/not a manifest language/);
  });

  it("exposes a strict entry schema and an empty-file helper", () => {
    expect(authoringEntrySchema.safeParse(makeEntry()).success).toBe(true);
    expect(createEmptyAuthoringFile("de")).toEqual({ locale: "de", entries: [] });
    expect(
      sortAuthoringEntries([{ spellId: "b" }, { spellId: "a" }]).map((e) => e.spellId),
    ).toEqual(["a", "b"]);
  });
});
