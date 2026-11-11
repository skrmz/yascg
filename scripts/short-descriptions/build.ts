import { buildRuntimeSidecars } from "../../src/tools/short-descriptions/transform.ts";
import { AuthoringSchemaError } from "../../src/tools/short-descriptions/authoring-schema.ts";
import { EXIT_FAILURE, EXIT_OK, fail, info, isDirectRun, runCli, warn } from "./cli.ts";
import {
  computeFingerprints,
  defaultWorkspace,
  loadAuthoringRaw,
  loadDatasets,
  loadManifest,
  writeFileAtomic,
  WorkspaceError,
  type Workspace,
} from "./files.ts";
import type {
  TransformLocaleDiagnostic,
  TransformWarning,
} from "../../src/tools/short-descriptions/transform.ts";

export interface BuildSidecarsOptions {
  write?: boolean;
}

export interface BuildSidecarsResult {
  files: ReadonlyMap<string, string>;
  warnings: readonly TransformWarning[];
  diagnostics: readonly TransformLocaleDiagnostic[];
  written: string[];
}

export async function buildSidecars(
  workspace: Workspace = defaultWorkspace(),
  options: BuildSidecarsOptions = {},
): Promise<BuildSidecarsResult> {
  const manifest = await loadManifest(workspace);
  const manifestLocales = manifest.map((entry) => entry.code);
  const datasets = await loadDatasets(workspace, manifest);

  const authoringFiles = new Map<string, unknown>();
  for (const locale of manifestLocales) {
    const raw = await loadAuthoringRaw(workspace, locale);
    if (raw !== undefined) authoringFiles.set(locale, raw);
  }

  const result = buildRuntimeSidecars({
    manifestLocales,
    authoringFiles,
    datasets,
    fingerprints: computeFingerprints(datasets),
  });

  const written: string[] = [];
  if (options.write !== false) {
    for (const [locale, text] of result.files) {
      await writeFileAtomic(workspace.sidecarFile(locale), text);
      written.push(locale);
    }
  }

  return {
    files: result.files,
    warnings: result.warnings,
    diagnostics: result.diagnostics,
    written,
  };
}

async function main(): Promise<number> {
  const result = await buildSidecars(defaultWorkspace());
  for (const warning of result.warnings) warn(warning.message);
  for (const diagnostic of result.diagnostics) {
    info(
      `${diagnostic.locale}: ${diagnostic.included}/${diagnostic.authored} authoring entr${diagnostic.authored === 1 ? "y" : "ies"} in the runtime sidecar.`,
    );
  }
  info(`short-descriptions:build wrote ${result.written.length} sidecar file(s).`);
  return EXIT_OK;
}

if (isDirectRun(import.meta.url)) {
  void runCli(async () => {
    try {
      return await main();
    } catch (error) {
      if (error instanceof AuthoringSchemaError || error instanceof WorkspaceError) {
        fail(error.message);
        return EXIT_FAILURE;
      }
      throw error;
    }
  });
}
