import { z } from "zod";
import { spellSchema, type Spell } from "@/domain/spells";
import { AppError, message } from "@/locales/messages.ts";

export const MANIFEST_URL = "/spell-languages.json";

export interface BundledSpellLanguage {
  code: string;
  displayName: string;
  dataset: string;
}

export const bundledSpellLanguageSchema = z.object({
  code: z.string().trim().min(2).max(35),
  displayName: z.string().trim().min(1).max(120),
  dataset: z.string().trim().startsWith("/"),
});

export const manifestSchema = z
  .array(bundledSpellLanguageSchema)
  .min(1)
  .superRefine((entries, ctx) => {
    const codes = new Map<string, number>();
    const datasets = new Map<string, number>();
    entries.forEach((entry, index) => {
      const lower = entry.code.toLowerCase();
      if (codes.has(lower)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate language tag "${entry.code}"`,
          path: [index, "code"],
        });
      }
      codes.set(lower, index);
      if (datasets.has(entry.dataset)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate dataset reference "${entry.dataset}"`,
          path: [index, "dataset"],
        });
      }
      datasets.set(entry.dataset, index);
    });
    if (!entries.some((entry) => entry.code === "en")) {
      ctx.addIssue({
        code: "custom",
        message: 'manifest must include the canonical "en" dataset',
        path: [],
      });
    }
  });

export class DataLoadError extends AppError {
  constructor(
    diagnostic: string,
    readonly url: string,
  ) {
    super(
      // The generic descriptor deliberately keeps URLs, status codes and parser
      // details out of the UI; the diagnostic message retains them for logs.
      message("error.dataLoad"),
      diagnostic,
    );
    this.name = "DataLoadError";
  }
}

export type FetchLike = (input: string) => Promise<Response>;

let fetchImpl: FetchLike | null = null;

/** Allows tests (and advanced hosts) to inject a fetch implementation. */
export function configureDataFetch(implementation: FetchLike | null): void {
  fetchImpl = implementation;
}

function activeFetch(): FetchLike {
  if (fetchImpl) return fetchImpl;
  if (typeof fetch === "function") return (input) => fetch(input);
  throw new DataLoadError("No fetch implementation is available.", "");
}

let manifestCache: BundledSpellLanguage[] | null = null;
const datasetCache = new Map<string, Spell[]>();

export function clearDataCache(): void {
  manifestCache = null;
  datasetCache.clear();
}

export async function loadManifest(): Promise<BundledSpellLanguage[]> {
  if (manifestCache) return manifestCache;
  const response = await activeFetch()(MANIFEST_URL);
  if (!response.ok) {
    throw new DataLoadError(
      `Failed to load the language manifest (HTTP ${response.status}).`,
      MANIFEST_URL,
    );
  }
  const raw: unknown = await response.json();
  const result = manifestSchema.safeParse(raw);
  if (!result.success) {
    throw new DataLoadError(
      `The language manifest is invalid: ${result.error.issues[0]?.message ?? "unknown error"}.`,
      MANIFEST_URL,
    );
  }
  manifestCache = result.data;
  return manifestCache;
}

export async function loadLanguageDataset(code: string): Promise<Spell[]> {
  const cached = datasetCache.get(code);
  if (cached) return cached;
  const manifest = await loadManifest();
  const entry = manifest.find((item) => item.code === code);
  if (!entry) {
    throw new DataLoadError(`Language "${code}" is not in the manifest.`, MANIFEST_URL);
  }
  const response = await activeFetch()(entry.dataset);
  if (!response.ok) {
    throw new DataLoadError(
      `Failed to load the "${code}" dataset (HTTP ${response.status}).`,
      entry.dataset,
    );
  }
  const raw: unknown = await response.json();
  const result = z.array(spellSchema).safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new DataLoadError(
      `The "${code}" dataset is invalid at index ${String(issue?.path[0] ?? "?")}: ${issue?.message ?? "unknown error"}.`,
      entry.dataset,
    );
  }
  datasetCache.set(code, result.data);
  return result.data;
}

export function getCachedDataset(code: string): Spell[] | undefined {
  return datasetCache.get(code);
}
