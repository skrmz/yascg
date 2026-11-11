import type { ShortDescription } from "@/domain/short-descriptions";
import { parseAuthoringFile, type AuthoringFile } from "./authoring-schema.ts";
import { isRuntimeEligible } from "./material-shortening.ts";
import { serializeRuntimeSidecar } from "./serialize.ts";

/**
 * Pure authoring-to-runtime transform. It performs deterministic filtering and
 * serialization only: no semantic validation, no severity scoring, no model
 * call, and no text rewriting. It never reads credentials or performs I/O.
 */

export interface SourceTextFields {
  description: readonly string[];
  higherLevels?: readonly string[];
}

export type TransformWarningCode = "orphaned" | "stale" | "withheld" | "not-shortening";

export interface TransformWarning {
  locale: string;
  spellId: string;
  code: TransformWarningCode;
  message: string;
}

export interface TransformLocaleDiagnostic {
  locale: string;
  authored: number;
  included: number;
}

export interface TransformResult {
  /** Serialized runtime sidecar text per manifest locale. */
  files: ReadonlyMap<string, string>;
  /** Parsed runtime entries per manifest locale. */
  entries: ReadonlyMap<string, ReadonlyMap<string, ShortDescription>>;
  warnings: readonly TransformWarning[];
  diagnostics: readonly TransformLocaleDiagnostic[];
}

export interface BuildRuntimeSidecarsInput {
  manifestLocales: readonly string[];
  /** Raw authoring JSON per locale. A manifest locale may be absent. */
  authoringFiles: ReadonlyMap<string, unknown>;
  /** Selected-language dataset text per locale: canonical id -> source fields. */
  datasets: ReadonlyMap<string, ReadonlyMap<string, SourceTextFields>>;
  /** Current `sourceFingerprint` per locale: canonical id -> `sha256:...`. */
  fingerprints: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

function toRuntimeEntry(entry: AuthoringFile["entries"][number]): ShortDescription {
  return {
    description: entry.description,
    ...(entry.higherLevels !== undefined ? { higherLevels: entry.higherLevels } : {}),
  };
}

export function buildRuntimeSidecars(input: BuildRuntimeSidecarsInput): TransformResult {
  const manifestLocales = [...new Set(input.manifestLocales)];
  for (const locale of input.authoringFiles.keys()) {
    if (!manifestLocales.includes(locale)) {
      throw new Error(`Authoring file locale "${locale}" is not a manifest language.`);
    }
  }

  const files = new Map<string, string>();
  const entries = new Map<string, ReadonlyMap<string, ShortDescription>>();
  const warnings: TransformWarning[] = [];
  const diagnostics: TransformLocaleDiagnostic[] = [];

  for (const locale of manifestLocales) {
    const fileName = `data/short-descriptions/${locale}.json`;
    const rawFile = input.authoringFiles.get(locale);
    const dataset = input.datasets.get(locale);
    if (!dataset) throw new Error(`Missing normalized dataset for locale "${locale}".`);

    if (rawFile === undefined) {
      files.set(locale, serializeRuntimeSidecar([]));
      entries.set(locale, new Map());
      diagnostics.push({ locale, authored: 0, included: 0 });
      continue;
    }

    const authoring = parseAuthoringFile(rawFile, {
      fileName,
      locale,
      manifestLocales,
    });
    const fingerprints = input.fingerprints.get(locale);
    const included = new Map<string, ShortDescription>();

    for (const entry of authoring.entries) {
      const source = dataset.get(entry.spellId);
      if (!source) {
        warnings.push({
          locale,
          spellId: entry.spellId,
          code: "orphaned",
          message: `${fileName}: "${entry.spellId}" is not in the "${locale}" dataset; omitted from the runtime sidecar.`,
        });
        continue;
      }
      if (fingerprints?.get(entry.spellId) !== entry.sourceHash) {
        warnings.push({
          locale,
          spellId: entry.spellId,
          code: "stale",
          message: `${fileName}: "${entry.spellId}" is stale (source text changed); omitted from the runtime sidecar.`,
        });
        continue;
      }
      if (entry.status !== "accepted") {
        warnings.push({
          locale,
          spellId: entry.spellId,
          code: "withheld",
          message: `${fileName}: "${entry.spellId}" is withheld; omitted from the runtime sidecar.`,
        });
        continue;
      }
      if (!isRuntimeEligible(entry, source)) {
        warnings.push({
          locale,
          spellId: entry.spellId,
          code: "not-shortening",
          message: `${fileName}: "${entry.spellId}" is not materially shorter; omitted from the runtime sidecar.`,
        });
        continue;
      }
      included.set(entry.spellId, toRuntimeEntry(entry));
    }

    files.set(locale, serializeRuntimeSidecar(included));
    entries.set(locale, included);
    diagnostics.push({ locale, authored: authoring.entries.length, included: included.size });
  }

  return { files, entries, warnings, diagnostics };
}
