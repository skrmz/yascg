# OpenRouter configuration for short-description authoring

## Goal

Give the authoring tools a committed, project-local OpenRouter configuration file for non-secret
settings, keep `OPENROUTER_API_KEY` environment-only, add a safe effective-configuration
diagnostic, and restructure the maintainer documentation. No changes to generation prompts,
acceptance/withholding rules, sidecar format, frontend code, or build/deploy behavior.

## Current state (verified)

- `scripts/short-descriptions/cli.ts` owns flag parsing, `DEFAULT_MODEL` /
  `DEFAULT_JUDGE_MODEL` (`openai/gpt-4o-mini`), `DEFAULT_BASE_URL`, `resolveModels`,
  `resolveCredentials`, `resolveBaseUrl`, redaction, and exit codes.
- `generate.ts:773` and `smoke.ts:78` call `resolveModels(options)`; both call
  `resolveCredentials()` which reads `OPENROUTER_API_KEY` and `OPENROUTER_BASE_URL` from
  `process.env` only.
- `parseCliOptions` is shared by generate, smoke, and tests. `--write` is rejected by
  `runGeneration`; only smoke writes staged authoring files back (existing behavior).
- `files.ts` exports `repoRoot` resolved from the module URL, not the working directory.
- Vitest includes `scripts/**/*.{test,spec}.ts`; the environment is jsdom.
- `.gitignore` does not exclude the new config path.
- No existing JSON config-file convention for authoring tooling; the proposed path is the
  clearest option.

## Design decisions

1. **New sibling module** `scripts/short-descriptions/config.ts` owns loading, validation,
   precedence, and formatting. `cli.ts` keeps parsing, defaults, redaction, and credentials.
   `config.ts` may import from `cli.ts`; `cli.ts` must not import `config.ts` (no cycle).
2. **Config path** is derived from `import.meta.url`, never `process.cwd()`:
   `fileURLToPath(new URL("./openrouter.config.json", import.meta.url))`.
   Display it repo-relative via `path.relative(repoRoot, path)` with `/` separators:
   `scripts/short-descriptions/openrouter.config.json`.
3. **Synchronous loading** with `node:fs` `readFileSync` is sufficient (one small file per
   command, no watch mode) and keeps resolution a pure synchronous function.
4. **Missing file falls back silently** to existing defaults (non-breaking). Any other read
   error, malformed JSON, schema violation, or secret-like property is a hard `CliError`
   naming the file and setting.
5. **Precedence**:
   - generation model: `--model` > `OPENROUTER_MODEL` > config `model` > `DEFAULT_MODEL`
   - judge model: `--judge-model` > `OPENROUTER_JUDGE_MODEL` > config `judgeModel` >
     `DEFAULT_JUDGE_MODEL`
   - base URL: `OPENROUTER_BASE_URL` > config `baseUrl` > `DEFAULT_BASE_URL`
   - Empty/whitespace CLI model flags and environment values are treated as absent; an
     explicit empty CLI flag is rejected with an actionable error. Roles never inherit each
     other.
6. **API key** remains read only by `resolveCredentials` from
   `process.env.OPENROUTER_API_KEY`; the config schema has no key field.
7. **Diagnostic** is `--show-config` on the existing generation CLI. It is handled in
   `generate.ts` `main()` before workspace loading, so it needs no `--locale`, `--ids`, or
   credentials, makes no API call, and writes nothing.
8. **No new dependencies**, no Vite integration, no `import.meta.env`/`VITE_` usage.

## Ordered tasks

### 1. Create the committed configuration file

Create `scripts/short-descriptions/openrouter.config.json`:

```json
{
  "model": "deepseek/deepseek-v4.1-flash-1017",
  "judgeModel": "deepseek/deepseek-v4.1-flash-1017",
  "baseUrl": "https://openrouter.ai/api/v1"
}
```

Do not add ignore rules. Do not add credential-shaped fields.

### 2. Add `scripts/short-descriptions/config.ts`

Exports and behavior:

```ts
export type ConfigSource = "CLI" | "environment" | "config file" | "built-in default";

export interface ResolvedSetting {
  value: string;
  source: ConfigSource;
}

export interface ResolvedOpenRouterConfig {
  model: ResolvedSetting;
  judgeModel: ResolvedSetting;
  baseUrl: ResolvedSetting;
  configPath: string;
  configExists: boolean;
}

export const OPENROUTER_CONFIG_PATH: string;
export const OPENROUTER_CONFIG_LABEL: string; // repo-relative, forward slashes

export interface OpenRouterConfigValues {
  model?: string;
  judgeModel?: string;
  baseUrl?: string;
}

export function loadOpenRouterConfig(
  filePath?: string,
): OpenRouterConfigValues | undefined;

export function resolveOpenRouterConfig(
  options: Pick<CliOptions, "model" | "judgeModel">,
  env?: NodeJS.ProcessEnv,
  configPath?: string,
): ResolvedOpenRouterConfig;

export function formatOpenRouterConfiguration(
  resolved: ResolvedOpenRouterConfig,
  env?: NodeJS.ProcessEnv,
): string;
```

`loadOpenRouterConfig`:

- `readFileSync(filePath, "utf8")`; on `ENOENT` return `undefined`; rethrow other errors as
  `CliError` with the file path.
- `JSON.parse` failure: `Invalid JSON in OpenRouter configuration <label>: <parse message>.`
  (never echo file contents).
- Reject non-object roots (including arrays and `null`).
- Reject every property outside `model`, `judgeModel`, `baseUrl`. For names matching
  `/api[_-]?key|openrouter_api_key|token|secret|credential|password/i`, use a dedicated message
  stating that credentials must never be committed and must come from the environment.
- For each present known property: must be a string, trimmed non-empty; otherwise fail naming
  the property (no values echoed).
- Return trimmed values only; do not validate `baseUrl` here so the resolver can name the
  effective source on failure.

`resolveOpenRouterConfig`:

- Use one precedence helper that returns `{ value, source }`:
  CLI (trimmed non-empty, else `CliError " --model must not be empty."`), environment
  (trimmed; empty ignored), config value, fallback constant.
- Resolve the base URL with `resolveBaseUrl(raw, label)` where `label` is
  `OPENROUTER_BASE_URL` for environment/default and
  `<config label> baseUrl` for the file, so invalid values identify the setting.
- Return values plus `configExists` from `loadOpenRouterConfig`.

`formatOpenRouterConfiguration` prints exactly the requested shape:

```text
OpenRouter configuration

Generation model: <value>
  Source: <source>

Judge model: <value>
  Source: <source>

Base URL: <value>
  Source: <source>

API key: SET|NOT SET

Configuration file:
  <repo-relative label>
```

`API key` uses only `Boolean(env.OPENROUTER_API_KEY?.trim())`; never include the value, a
prefix/suffix, length, or hash. Formatting is pure so it is directly testable.

### 3. Update `scripts/short-descriptions/cli.ts`

- Add `showConfig: boolean` to `CliOptions` and `"show-config": { type: "boolean" }` to
  `parseArgs`; set it in the returned object.
- Extend `resolveBaseUrl(raw, label = "OPENROUTER_BASE_URL")` and use `label` in the error.
- Change `resolveCredentials(env = process.env, baseUrl = DEFAULT_BASE_URL)` to accept the
  already-resolved base URL; keep reading the key exclusively from `env.OPENROUTER_API_KEY`.
  Keep the existing missing-key message and `Credentials` shape.
- Remove `resolveModels` (its only callers move to `resolveOpenRouterConfig`) to avoid two
  competing precedence implementations. Keep all `DEFAULT_*` constants unchanged.
- Keep redaction, exit codes, and `runCli` unchanged.

### 4. Wire generation (`scripts/short-descriptions/generate.ts`)

- Replace the `resolveModels` import with
  `resolveOpenRouterConfig`, `formatOpenRouterConfiguration` from `./config.ts`.
- Extend `GenerationDependencies` with optional `env?: NodeJS.ProcessEnv` and
  `configPath?: string` (test seam; defaults to `process.env` and the committed path).
- At the start of `runGeneration`, resolve once:
  `const settings = resolveOpenRouterConfig(options, deps.env, deps.configPath);`
  Keep this before the dry-run branch so a malformed committed config fails fast and is
  testable without credentials.
- Use `settings.model.value`, `settings.judgeModel.value`, and `settings.baseUrl.value` for
  the adapter and report. Call `resolveCredentials(deps.env, settings.baseUrl.value)` only
  when a model call is actually needed (preserve `--dry-run`, `--approve`, `--manual`
  credential-free behavior).
- In `main()`, after `parseCliOptions(argv)`:
  ```ts
  if (options.showConfig) {
    info(formatOpenRouterConfiguration(resolveOpenRouterConfig(options)));
    return EXIT_OK;
  }
  ```
  Do not load a workspace, resolve credentials, or inspect locale/ids first. Errors from
  resolution propagate through `runCli` (exit 1); a missing key does not affect the exit code.

### 5. Wire smoke (`scripts/short-descriptions/smoke.ts`)

- Add optional `deps?: { env?: NodeJS.ProcessEnv; configPath?: string }` to `runSmoke`.
- Reject `--show-config` with a message pointing to
  `pnpm run short-descriptions:generate -- --show-config`.
- Resolve configuration once, before staging: `resolveOpenRouterConfig(options, env, configPath)`,
  then `resolveCredentials(env, settings.baseUrl.value)`. Keep the existing staging workspace,
  real generation, judge, validation, `--write`, and exit-code behavior unchanged.
- Print the effective generation model, judge model, and base URL (never the key) alongside
  the staging/report paths.

### 6. Test seam for adapter construction (optional, only if needed)

Keep `OpenRouterAdapter` construction inline in both entry points if the tests below can verify
shared resolution through `resolveOpenRouterConfig` plus a `runGeneration` wiring test. If a
direct smoke-wiring test is desired, extract a small
`createAdapter(settings, credentials, options)` helper used by both entry points instead of
mocking constructors. Do not add a new abstraction beyond this.

### 7. Tests

Add `scripts/short-descriptions/config.test.ts` using `mkdtemp`/`writeFile` (mirror
`test-helpers.ts`) and explicit env objects; never touch the real `process.env` or network.

Cover:

- loading a valid temp config (including the committed DeepSeek values via
  `loadOpenRouterConfig()`),
- configured generation/judge models used and independent (judge-only config does not change
  generation; generation-only config does not change the judge),
- precedence per setting: CLI > env > config > default, including empty/whitespace env values
  falling through to config,
- base URL precedence and sanitization (credentials/query/fragment dropped),
- missing config file → existing defaults,
- malformed JSON → `CliError` mentioning the config path,
- wrong types and empty/whitespace model identifiers → `CliError` naming the property,
- unknown properties and `apiKey` / `OPENROUTER_API_KEY` / `token` / `secret` rejected,
- the API key is read only from the environment: config with a key-like property is rejected;
  `resolveCredentials` still throws without `OPENROUTER_API_KEY` and returns the passed base
  URL,
- `formatOpenRouterConfiguration` works with no key (`NOT SET`), reports `SET` with a fake key,
  and its output never contains the key or any substring/length-derived value,
- `--show-config` path: `parseCliOptions(["--show-config"])` sets the flag and resolution +
  formatting needs no credentials,
- `runGeneration` with `deps.configPath` and malformed config throws even for `--dry-run`;
  valid config + dry run works without a key,
- the committed `openrouter.config.json` parses and contains exactly `model`, `judgeModel`,
  `baseUrl` with no secret-like values.

Update `cli.test.ts`: remove `resolveModels` cases, keep option parsing, base-URL sanitization,
redaction, and credentials tests; add `resolveCredentials` base-URL argument coverage.

Extend `separation.test.ts` only if useful: add `"short-descriptions/config"` to `FORBIDDEN`
(the frontend must not import the new module) and keep the existing build/key checks.

### 8. Rewrite `docs/short-descriptions.md`

Use the requested 14-section order, retaining the existing technical reference material where it
is still accurate:

1. What the generator does (offline authoring; the app never calls a model)
2. Prerequisites (Node/pnpm/`vp`, Git clean tree, PowerShell 7+)
3. OpenRouter configuration file (path, committed non-secret fields, missing-file fallback,
   validation and secret-key rejection, cwd independence)
4. Model and judge-model roles (independent; precedence table; built-in default vs current
   committed DeepSeek selection; model lookup does not prove structured-output support)
5. Secure API-key entry on Windows (exact `Read-Host -AsSecureString | ConvertFrom-SecureString
   -AsPlainText` command, numbered explanation of masking/child-process environment/plain-text
   process value, presence check, cleanup with `Remove-Item Env:OPENROUTER_API_KEY`, closing
   the terminal, forbidden storage locations)
6. Inspecting effective configuration (`pnpm run short-descriptions:generate -- --show-config`,
   listed output, no API call/no writes/no credentials, exit code meaning)
7. Checking authentication (`GET <baseUrl>/key` PowerShell example reading `baseUrl` from the
   JSON config and using the temporary env key, without printing it; model-info endpoint only
   proves recognition)
8. Dry run versus smoke test (comparison table; preserve the exact smoke command
   `pnpm run short-descriptions:smoke -- --ids srd-fireball,srd-light --locale en --limit 2`,
   real calls/charges/staging/`--write` semantics; dry run = no calls/charges/writes)
9. Generating a small English/German batch (`--locale en --all --limit 20`, then `de`)
10. Reviewing results and withheld descriptions (`data/reference/short-description-review.json`,
    statuses, acceptance rules summary)
11. Building runtime sidecars (`src/data/spell-short-descriptions.<locale>.json`)
12. Full generation (`--all`, cost/usage review, validate/build/commit)
13. Cleanup (remove the env var; no files created by key entry)
14. Troubleshooting (missing key, malformed config, `response-format`/`model-not-found`/auth,
    empty selection, stale fingerprints)

Add a quick-start block using only implemented commands, a flag table for
`--all` / `--limit` / `--ids` / `--regenerate` / `--force` / `--approve`, storage locations for
authoring files, sidecars, and the report, and the statement that `pnpm run build` never calls
OpenRouter.

Keep the authoring-file format, fingerprint, content conventions, severity rubric, deterministic
checks, and report reference as reference subsections; avoid duplicating the full specification.
Document that a malformed config fails rather than falling back, while an absent config file
falls back to defaults.

### 9. Align the specification and development notes

- `docs/specs/spell-short-descriptions-spec.md` §8.2: change the base-URL and model bullets to
  the config-file precedence, name the committed path, require strict validation/secret
  rejection, and state that the key remains environment-only. §8.11/commands: document
  `--show-config` and the dry-run/smoke distinction. Keep edits scoped; do not rewrite unrelated
  normative text.
- `docs/DEVELOPMENT.md`: add a one-line note to the short-descriptions command row that
  `generate -- --show-config` inspects the effective configuration; do not duplicate the guide.

## Validation plan

Run from the repository root with no API key:

1. `pnpm run check` (format, lint, typecheck; includes scripts).
2. `pnpm run test` (or `pnpm run test:quiet`) — all unit tests, including the new config tests.
3. `pnpm run short-descriptions:generate -- --show-config` — verify the output shape, sources,
   `NOT SET`, config path, and exit code 0 with `OPENROUTER_API_KEY` unset.
4. Temporarily set a fake/invalid key only in the test shell if needed to verify `SET`; remove
   it immediately.
5. `pnpm run build` — verify the normal build still succeeds without OpenRouter or credentials.
6. Optionally `pnpm exec wrangler deploy --dry-run` if any build-facing config changed (it
   should not).
7. Do **not** run the smoke test or any live OpenRouter request; the user performs that
   separately with their own key.

## Risks and limitations

- The committed DeepSeek model may not support OpenRouter `response_format: json_schema`
  (`strict: true`) or may reject the request shape. Model lookup only proves recognition. The
  real smoke test is the acceptance gate for that; document the `response-format` failure and
  next action.
- `--show-config` proves only local resolution, not key validity or reachability.
- The config file holds non-secret defaults; users who intentionally keep a model only in the
  environment still override it, and an empty environment value does not mask the file.
- No backend, runtime integration, schema change, prompt change, or live request is introduced.
- If `--show-config` resolution happens before the dry-run branch, a malformed committed config
  also blocks dry runs; this is intentional fail-fast behavior and must be documented.
