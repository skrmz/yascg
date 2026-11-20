import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  isCanonicalSrdSpellId,
  shortDescriptionSchema,
  type ShortDescription,
} from "@/domain/short-descriptions";
import { LIMITS } from "@/domain/spells";
import { manifestSchema } from "@/services/data/load";

const releasedLocales = ["en", "de"] as const;
type ReleasedLocale = (typeof releasedLocales)[number];
const dataDir = "src/data";
const fireball = "srd-fireball";

function readAsset(file: string, label: string): Buffer {
  try {
    return readFileSync(file);
  } catch (error) {
    throw new Error(label + ": cannot read required JSON asset", { cause: error });
  }
}

function parseAsset(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(label + ": malformed JSON (expected UTF-8 without a BOM)", { cause: error });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function datasetIds(raw: unknown, label: string): Set<string> {
  if (!Array.isArray(raw)) throw new Error(label + ": expected a dataset array");
  const ids = new Set<string>();
  for (const [index, spell] of raw.entries()) {
    if (!isObject(spell) || typeof spell.id !== "string" || !isCanonicalSrdSpellId(spell.id)) {
      throw new Error(label + ": invalid canonical ID at spell index " + index);
    }
    if (ids.has(spell.id)) throw new Error(label + ": duplicate dataset ID " + spell.id);
    ids.add(spell.id);
  }
  return ids;
}

function validateSidecar(
  bytes: Buffer,
  label: string,
  locale: ReleasedLocale,
  ids: ReadonlySet<string>,
): void {
  const parsed = parseAsset(bytes, label);
  if (!isObject(parsed)) throw new Error(label + ": expected a JSON object");
  const canonical: Record<string, ShortDescription> = {};
  for (const id of Object.keys(parsed).sort()) {
    const entryLabel = label + " / " + id;
    if (!isCanonicalSrdSpellId(id)) throw new Error(entryLabel + ": invalid canonical ID");
    if (!ids.has(id)) throw new Error(entryLabel + ": ID missing from the same-locale dataset");
    const result = shortDescriptionSchema.safeParse(parsed[id]);
    if (!result.success) throw new Error(entryLabel + ": " + result.error.message);
    const { description, higherLevels } = result.data;
    canonical[id] = { description, ...(higherLevels === undefined ? {} : { higherLevels }) };
  }

  if (!bytes.equals(Buffer.from(JSON.stringify(canonical, null, 2) + "\n"))) {
    throw new Error(
      label + ": duplicate key or noncanonical JSON; re-export the reviewed UTF-8 sidecar",
    );
  }

  const requiredIds = locale === "de" ? ids : [fireball];
  for (const id of requiredIds) {
    if (!Object.hasOwn(canonical, id)) throw new Error(label + ": missing required ID " + id);
  }
}

describe("released short-description sidecars", () => {
  it.each(releasedLocales)("matches the %s dataset and canonical artifact contract", (locale) => {
    const manifestFile = path.join(dataDir, "spell-languages.json");
    const manifest = manifestSchema.parse(
      parseAsset(readAsset(manifestFile, manifestFile), manifestFile),
    );
    const entry = manifest.find(({ code }) => code === locale);
    if (!entry || !/^\/[a-zA-Z0-9.-]+\.json$/.test(entry.dataset)) {
      throw new Error(manifestFile + ": " + locale + " requires a local dataset filename");
    }
    const datasetFile = path.join(dataDir, entry.dataset.slice(1));
    const datasetLabel = datasetFile + " (" + locale + ")";
    const ids = datasetIds(
      parseAsset(readAsset(datasetFile, datasetLabel), datasetLabel),
      datasetLabel,
    );
    const file = path.join(dataDir, "spell-short-descriptions." + locale + ".json");
    const label = file + " (" + locale + ")";
    validateSidecar(readAsset(file, label), label, locale, ids);
  });
});

describe("short-description artifact validation", () => {
  const ids = new Set([fireball, "srd-light"]);
  const label = "spell-short-descriptions.fixture.json";
  const canonical = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
  const validate = (text: string, locale: ReleasedLocale = "en") =>
    validateSidecar(Buffer.from(text), label + " (" + locale + ")", locale, ids);

  it("preserves exact Markdown and verifies the string limit", () => {
    expect(() =>
      validate(
        canonical({
          [fireball]: {
            description: " *a*\n\n",
            higherLevels: "x".repeat(LIMITS.DESCRIPTION_ITEM_MAX),
          },
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    ["malformed JSON", "{", /malformed JSON/],
    ["array", "[]", /expected a JSON object/],
    ["null top-level value", "null", /expected a JSON object/],
    ["invalid ID", '{"srd-Fireball":{"description":"a"}}', /srd-Fireball.*invalid canonical ID/],
    ["unknown ID", '{"srd-wish":{"description":"a"}}', /srd-wish.*same-locale dataset/],
    ["null entry", '{"srd-fireball":null}', /srd-fireball/],
    ["array entry", '{"srd-fireball":["a"]}', /srd-fireball/],
    [
      "extra field",
      '{"srd-fireball":{"description":"a","status":"accepted"}}',
      /srd-fireball.*status/s,
    ],
    ["absent description", '{"srd-fireball":{"higherLevels":"a"}}', /srd-fireball.*description/s],
    [
      "blank description",
      canonical({ [fireball]: { description: " \n " } }),
      /srd-fireball.*description/s,
    ],
    [
      "oversized scaling",
      canonical({
        [fireball]: { description: "a", higherLevels: "x".repeat(LIMITS.DESCRIPTION_ITEM_MAX + 1) },
      }),
      /srd-fireball.*higherLevels/s,
    ],
    [
      "duplicate ID",
      '{\n  "srd-fireball": {"description":"a"},\n  "srd-fireball": {\n    "description": "b"\n  }\n}\n',
      /duplicate key or noncanonical JSON/,
    ],
    [
      "duplicate inner field",
      '{\n  "srd-fireball": {\n    "description": "a",\n    "description": "b"\n  }\n}\n',
      /duplicate key or noncanonical JSON/,
    ],
    [
      "wrong field order",
      canonical({ [fireball]: { higherLevels: "b", description: "a" } }),
      /duplicate key or noncanonical JSON/,
    ],
    [
      "wrong ID order",
      canonical({ "srd-light": { description: "b" }, [fireball]: { description: "a" } }),
      /duplicate key or noncanonical JSON/,
    ],
    [
      "CRLF",
      canonical({ [fireball]: { description: "a" } }).replaceAll("\n", "\r\n"),
      /duplicate key or noncanonical JSON/,
    ],
    ["BOM", "\uFEFF" + canonical({ [fireball]: { description: "a" } }), /UTF-8 without a BOM/],
  ] as const)("rejects %s", (_, text, diagnostic) => {
    expect(() => validate(text)).toThrow(diagnostic);
  });

  it("reports a missing required file with its name and locale", () => {
    expect(() => readAsset("fixtures/missing-sidecar.json", label + " (en)")).toThrow(
      /fixture\.json \(en\).*cannot read/,
    );
  });

  it("rejects duplicate normalized dataset IDs", () => {
    expect(() => datasetIds([{ id: fireball }, { id: fireball }], "dataset.json (de)")).toThrow(
      /dataset\.json \(de\).*duplicate dataset ID srd-fireball/,
    );
  });

  it("requires full German coverage and at least Fireball for English", () => {
    expect(() => validate("{}\n")).toThrow(/en.*missing required ID srd-fireball/);
    expect(() => validate(canonical({ [fireball]: { description: "a" } }), "de")).toThrow(
      /de.*missing required ID srd-light/,
    );
  });
});
