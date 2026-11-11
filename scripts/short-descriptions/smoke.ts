import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { shortDescriptionSchema } from "../../src/domain/short-descriptions.ts";
import {
  CliError,
  EXIT_FAILURE,
  EXIT_OK,
  SMOKE_MAX_IDS,
  isDirectRun,
  parseCliOptions,
  resolveCredentials,
  resolveModels,
  runCli,
  info,
  warn,
} from "./cli.ts";
import { buildSidecars } from "./build.ts";
import {
  createStagingWorkspace,
  createWorkspace,
  defaultWorkspace,
  loadManifest,
  readTextIfExists,
  writeFileAtomic,
  type Workspace,
} from "./files.ts";
import { runGeneration } from "./generate.ts";
import { OpenRouterAdapter } from "./openrouter.ts";

/**
 * Smoke command: runs the real generation pipeline for a tiny explicit batch in
 * a staging directory outside tracked paths, then validates the staged runtime
 * output. `--write` is the only mode that copies the seeded authoring files
 * back into the repository.
 */

async function copyIfExists(from: string, to: string): Promise<void> {
  try {
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

async function stageInputs(source: Workspace, staging: Workspace): Promise<void> {
  const manifest = await loadManifest(source);
  await copyIfExists(source.manifestFile, staging.manifestFile);
  for (const entry of manifest) {
    await copyIfExists(source.datasetPath(entry.dataset), staging.datasetPath(entry.dataset));
    await copyIfExists(source.authoringFile(entry.code), staging.authoringFile(entry.code));
  }
}

export async function runSmoke(argv: readonly string[]): Promise<number> {
  const options = parseCliOptions(argv);
  if (options.all) {
    throw new CliError("short-descriptions:smoke refuses --all; pass an explicit --ids list.");
  }
  if (!options.ids || options.ids.length === 0) {
    throw new CliError("short-descriptions:smoke requires --ids with 1 to 3 spell IDs.");
  }
  if (options.ids.length > SMOKE_MAX_IDS) {
    throw new CliError(
      `short-descriptions:smoke accepts at most ${SMOKE_MAX_IDS} IDs per run (received ${options.ids.length}).`,
    );
  }

  const real = defaultWorkspace();
  const staging = options.outputDir
    ? createWorkspace(path.resolve(options.outputDir))
    : await createStagingWorkspace();
  await stageInputs(real, staging);
  info(`staging: ${staging.root}`);

  const credentials = resolveCredentials();
  const models = resolveModels(options);
  const adapter = new OpenRouterAdapter({
    apiKey: credentials.apiKey,
    baseUrl: credentials.baseUrl,
    model: models.model,
    judgeModel: models.judgeModel,
    maxOutputTokens: options.maxOutputTokens,
    timeoutMs: options.timeoutMs,
    maxAttempts: options.maxAttempts,
  });

  const result = await runGeneration(
    {
      ...options,
      all: false,
      regenerate: true,
      approve: false,
      manual: false,
      dryRun: false,
      write: false,
      limit: options.ids.length,
    },
    { workspace: staging, adapter, log: info },
  );

  const built = await buildSidecars(staging);
  let invalidRuntime = 0;
  for (const [, text] of built.files) {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    for (const [spellId, value] of Object.entries(parsed)) {
      if (!shortDescriptionSchema.safeParse(value).success) {
        invalidRuntime += 1;
        warn(`${spellId}: staged runtime entry failed the runtime schema.`);
      }
    }
  }
  if (invalidRuntime > 0) {
    warn(
      `${invalidRuntime} staged runtime entr${invalidRuntime === 1 ? "y" : "ies"} failed validation.`,
    );
    return EXIT_FAILURE;
  }

  info(`review report: ${staging.reportFile}`);
  info("staged runtime sidecars passed the runtime schema.");

  if (result.exitCode !== EXIT_OK) {
    warn("smoke generation did not complete cleanly; staged files were not written back.");
    return result.exitCode;
  }

  if (options.write) {
    const manifest = await loadManifest(real);
    for (const entry of manifest) {
      const text = await readTextIfExists(staging.authoringFile(entry.code));
      if (text === undefined) continue;
      await writeFileAtomic(real.authoringFile(entry.code), text);
      info(`wrote ${real.authoringFile(entry.code)}`);
    }
    info("Run pnpm run short-descriptions:build to regenerate runtime sidecars.");
  }

  return EXIT_OK;
}

if (isDirectRun(import.meta.url)) {
  void runCli(() => runSmoke(process.argv.slice(2)));
}
