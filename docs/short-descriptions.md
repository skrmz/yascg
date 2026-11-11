# Short descriptions — authoring and generation

This document is the authoritative guide for the pre-generated short spell descriptions that appear as **Apply short description** in the editable-copy editor. The normative behavior contract is [spell-short-descriptions-spec.md](./specs/spell-short-descriptions-spec.md); this guide covers the practical workflow, formats, and operations.

## What the generator does

The app never calls a language model. Generation is an offline authoring step run by a maintainer. The app ships static, reviewed text; there is no runtime LLM call, backend, server API, or secret in the app.

A generation run:

1. Selects missing and stale entries for the requested locales.
2. Calls the configured OpenRouter generation model with structured output and validates the returned JSON locally.
3. Runs deterministic checks on mechanics, Markdown safety, numeric equivalence, vocabulary, higher-level completeness, and length.
4. Calls the configured judge model to compare the candidate with the source for mechanical equivalence.
5. Accepts automatically or withholds for human review using the severity rubric.
6. Writes authoring files atomically, then writes the review report last.
7. A separate deterministic build step writes the runtime sidecars. It never calls OpenRouter.

### Quick start

```powershell
# Inspect the effective non-secret settings (no key, no API call, no writes)
pnpm run short-descriptions:generate -- --show-config

# Preview a selection (no key, no API call, no writes)
pnpm run short-descriptions:generate -- --locale en --ids srd-fireball --dry-run

# Set the key for this PowerShell session, then run a small real batch
$env:OPENROUTER_API_KEY = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
pnpm run short-descriptions:generate -- --locale en --ids srd-fireball

# Review, rebuild runtime sidecars, and clean up
pnpm run short-descriptions:validate
pnpm run short-descriptions:build
Remove-Item Env:OPENROUTER_API_KEY
```

### Commands

| Script                                 | Purpose                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm run short-descriptions:generate` | Run the generation pipeline (needs a key for real model calls)          |
| `pnpm run short-descriptions:smoke`    | Tiny staged end-to-end integration check (needs a key)                  |
| `pnpm run short-descriptions:validate` | Validate authoring files, check runtime drift, write the review report  |
| `pnpm run short-descriptions:build`    | Recompute fingerprints and write the runtime sidecars deterministically |

`pnpm run build` runs `normalize:srd` → `short-descriptions:build` → `vp build`. It never invokes the generator and never calls OpenRouter.

### Storage locations

| Path                                              | Contents                                                     |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `scripts/short-descriptions/openrouter.config.json` | Committed non-secret OpenRouter configuration                |
| `data/short-descriptions/<locale>.json`           | Authoring file per manifest locale                           |
| `src/data/spell-short-descriptions.<locale>.json` | Generated runtime sidecar per spell-data locale              |
| `data/reference/short-description-review.json`    | Review report written by generation and validation           |

## Prerequisites

- Node.js and pnpm through the repository toolchain (`vp`). Run `pnpm install` (or `vp install`) after pulling changes.
- PowerShell 7+ for the masked credential prompt and `ConvertFrom-SecureString -AsPlainText`.
- A clean Git working tree before a run that writes authoring files, so review diffs stay isolated.
- Access to the selected OpenRouter models. Model names are configuration, not code.

## OpenRouter configuration file

Non-secret settings are committed in:

- `scripts/short-descriptions/openrouter.config.json`

```json
{
  "model": "deepseek/deepseek-v4.1-flash-1017",
  "judgeModel": "deepseek/deepseek-v4.1-flash-1017",
  "baseUrl": "https://openrouter.ai/api/v1"
}
```

| Property     | Required | Meaning                                         |
| ------------ | -------- | ----------------------------------------------- |
| `model`      | No       | Generation model identifier                     |
| `judgeModel` | No       | Semantic-comparison (judge) model identifier    |
| `baseUrl`    | No       | OpenRouter-compatible API base URL              |

- Every property is optional. A missing file falls back silently to the built-in defaults.
- A present file that is malformed, contains an unknown property, contains a credential-like property (`apiKey`, `OPENROUTER_API_KEY`, `token`, `secret`, `password`), or contains an empty/non-string value fails the command. It never falls back to defaults, so a typo cannot silently change the effective model.
- The path is derived from the module location, not the working directory, so commands behave the same from any directory.
- The file holds no key field. The API key remains environment-only; see [Secure API-key entry on Windows](#secure-api-key-entry-on-windows).
- Do not add a credentials file, a `.env` file, or any secret to this file. Unknown secret-like properties are rejected.

## Model and judge-model roles

The generation model and judge model are configured independently and never inherit each other's value.

| Setting     | Precedence                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------ |
| Generation  | `--model` > `OPENROUTER_MODEL` > config `model` > built-in default `openai/gpt-4o-mini`            |
| Judge       | `--judge-model` > `OPENROUTER_JUDGE_MODEL` > config `judgeModel` > built-in default `openai/gpt-4o-mini` |
| Base URL    | `OPENROUTER_BASE_URL` > config `baseUrl` > built-in default `https://openrouter.ai/api/v1`         |

- The built-in defaults are the safety net when neither the config file nor the environment nor a flag supplies a value.
- The committed configuration currently selects `deepseek/deepseek-v4.1-flash-1017` for both roles. That is a project choice, not a built-in default.
- Empty or whitespace-only environment values are treated as absent and fall through to the config file. An explicit empty CLI flag (`--model ""`) is rejected as an actionable error.
- Roles are independent: setting only `judgeModel` does not change the generation model, and vice versa.
- Model lookup or a successful `GET /models` response only proves that OpenRouter recognizes the identifier. It does not prove structured-output support. The staged [smoke test](#dry-run-versus-smoke-test) is the acceptance gate for request shape and JSON-schema support.

### Structured output and reasoning

Both calls request a strict JSON-schema response and set `reasoning: { effort: "none" }`. On most providers, reasoning tokens share the per-request `max_tokens` budget. A model that reasons by default can spend the entire budget thinking and return an empty message with `finish_reason: "length"`, so the adapter disables reasoning to keep the visible JSON budget intact. Non-reasoning models ignore the field. If a model rejects this request shape, choose a structured-output-capable model that does not require reasoning; the tooling never substitutes a model or provider silently.

The candidate schema lists every declared property in `required`, including `higherLevels` (returned as an empty string when the source has none). OpenAI-style strict structured outputs reject schemas that leave a declared property optional.

## Secure API-key entry on Windows

Set the key only in the current PowerShell session:

```powershell
# Set for the current PowerShell session only (recommended).
# The key is entered masked and is not echoed or written to a file.
$env:OPENROUTER_API_KEY = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText

# Verify without printing the value
if ($env:OPENROUTER_API_KEY) { "OPENROUTER_API_KEY is set" } else { "OPENROUTER_API_KEY is not set" }
```

What happens:

1. `Read-Host -AsSecureString` masks the typed value and returns a secure string.
2. `ConvertFrom-SecureString -AsPlainText` converts it to plain text only inside the PowerShell pipeline.
3. The assignment stores the value in the current process environment; child processes such as `pnpm` and `tsx` inherit it from the session.
4. The command writes no file. The plain-text value exists in process memory for the lifetime of the PowerShell session.
5. Closing the terminal, or removing the variable, discards it.

Cleanup:

```powershell
Remove-Item Env:OPENROUTER_API_KEY
```

- Do not paste the key into a command line, a script, or a file. Use the masked prompt; PowerShell 7+ is required for `ConvertFrom-SecureString -AsPlainText`.
- Do not write the key with `Set-Content`, `Out-File`, or a `.env` file.
- Session-only is preferred. If a persistent user-scope variable is used, remove it with `[Environment]::SetEnvironmentVariable("OPENROUTER_API_KEY", $null, "User")`.
- Never use `VITE_OPENROUTER_API_KEY` or any `VITE_`-prefixed variable for the key.
- The key is not required for validation, transformation, tests, builds, `--dry-run`, `--approve`, or `--manual`.

## Inspecting effective configuration

```powershell
pnpm run short-descriptions:generate -- --show-config
```

Output shape:

```text
OpenRouter configuration

Generation model: deepseek/deepseek-v4.1-flash-1017
  Source: config file

Judge model: deepseek/deepseek-v4.1-flash-1017
  Source: config file

Base URL: https://openrouter.ai/api/v1
  Source: config file

API key: NOT SET

Configuration file:
  scripts/short-descriptions/openrouter.config.json
```

- `--show-config` requires no `--locale`, `--ids`, workspace, or credentials.
- It makes no API call and writes nothing.
- Each `Source` is one of `CLI`, `environment`, `config file`, or `built-in default`.
- The API key is reported only as `SET` or `NOT SET`. The value, a prefix, a suffix, its length, and a hash are never printed.
- Exit code `0` means local resolution succeeded. Exit code `1` means the configuration could not be read or validated; the error names the file and setting without echoing contents.
- `--show-config` proves only local resolution. It does not prove key validity, reachability, or model support.

## Checking authentication

Read the base URL from the config file and call the metadata endpoint without printing the key:

```powershell
$config = Get-Content scripts/short-descriptions/openrouter.config.json -Raw | ConvertFrom-Json
$baseUrl = $config.baseUrl
$response = Invoke-RestMethod -Uri "$baseUrl/key" -Headers @{ Authorization = "Bearer $env:OPENROUTER_API_KEY" }
$response.data.label
```

- A successful response confirms that the key is valid for the endpoint.
- `401` or `403` means the key is missing, invalid, or not authorized; generation reports the same category without exposing the key.
- This is a metadata request, not a model call. It does not exercise structured output.
- The model-info endpoint (`GET /models`) only proves that a model identifier is recognized.

## Dry run versus smoke test

| Aspect            | `--dry-run`                                              | `short-descriptions:smoke`                                              |
| ----------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Credentials       | Not required                                             | Requires `OPENROUTER_API_KEY`                                           |
| Model calls       | None                                                     | Real generation and judge calls                                          |
| Charges           | None                                                     | Possible provider charges                                                |
| Writes            | None                                                     | Staging directory only; `--write` copies authoring files back explicitly |
| Scope             | Selection preview                                        | 1–3 explicit ids, full pipeline                                          |
| Runtime schema    | Not checked                                              | Validates staged sidecars against the runtime schema                    |
| Configuration     | Resolved and validated before the preview                | Resolved once before staging                                             |

Preview only:

```powershell
pnpm run short-descriptions:generate -- --locale en --ids srd-fireball --dry-run
```

Real staged check:

```powershell
pnpm run short-descriptions:smoke -- --ids srd-fireball,srd-light --locale en --limit 2
```

- The smoke command requires `--ids` with 1–3 ids and refuses `--all`.
- It runs the real pipeline in a staging workspace under the OS temp directory (`--output-dir` overrides it), never in tracked paths.
- It prints the effective generation model, judge model, base URL, staging path, and review report path; it never prints the key.
- `--write` copies the staged authoring files back into `data/short-descriptions/` as an explicit seed operation.
- It never runs in `build`, `check`, `test`, E2E, preview, or deploy.
- A successful smoke run is the evidence that the selected models accept the required request shape. If a model rejects structured output, choose a different model; the tooling never substitutes one silently.

## Generating a small English/German batch

Generate a bounded seed batch per locale, review it, and only then expand:

```powershell
pnpm run short-descriptions:generate -- --locale en --all --limit 20
pnpm run short-descriptions:generate -- --locale de --all --limit 20
```

### Selection and workflow flags

| Flag                | Behavior                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `--all`             | Select all missing and stale entries and bypass the `--max-entries` cap                        |
| `--limit N`         | Bound the number of entries processed in the run                                               |
| `--ids a,b`         | Target explicit spell ids; up-to-date entries are skipped unless another flag applies          |
| `--regenerate`      | Redo selected existing entries; protects human-approved and manual entries unless `--force` is passed |
| `--force`           | Also replace protected reviewed content; destructive for human-approved and manual text        |
| `--approve`         | Accept selected entries explicitly, refresh the fingerprint, and mark them human-accepted       |
| `--manual`          | Write a withheld stub for a missing entry for hand editing                                     |
| `--dry-run`         | Print the selection and perform no pricing lookup, model call, or write                        |
| `--max-cost <usd>`  | Stop before the next call when the estimated cost cap is reached                               |
| `--max-entries N`   | Refuse a larger selection unless `--all`, `--ids`, or `--limit` is given (default 25)          |
| `--show-config`     | Print the effective non-secret configuration and exit; generation only                         |
| `--timings`         | Print per-entry and run-level stage durations; no behavior change                               |

Selection defaults:

- Missing and stale entries are processed by default. A selection larger than `--max-entries` without `--all`, `--ids`, or `--limit` is refused with its size.
- Stale entries are revalidated in place, never rewritten. The fingerprint is refreshed when no blocking finding exists; an accepted entry stays accepted; a withheld entry is never promoted automatically.
- `--regenerate` replaces generated and withheld entries. Human-approved (`acceptance: human`) and manual (`origin: manual`) entries are skipped unless `--force` is explicit.
- `--limit` bounds any run. `--ids` targets explicit entries.

Exit codes for generation and validation: `0` success (warnings and withheld review items allowed), `1` structural or fatal error (invalid site data, unparsable/unsafe authoring file, runtime drift, missing credentials when a model call is required, or an authoring commit that wrote nothing), `2` partial completion (provider or output failures, a budget abort, or partially committed authoring files; unaffected writes still complete). Each report records the exit code it corresponds to.

## Reviewing results and withheld descriptions

`short-descriptions:validate` and `short-descriptions:generate` write:

- `data/reference/short-description-review.json`

Review the report before committing. An entry is auto-accepted only when no high-severity finding exists, the semantic comparison reports no medium/high finding and `mechanicallyEquivalent: true`, and every deterministic unresolved item was explicitly reviewed. Otherwise it is committed as `status: "withheld"` for human review. Confirmed mismatches (high) block automatic acceptance even if a judge disagrees. Conservative automation is intentional: a repeated value or an unrecognized unit is sent to the semantic comparison instead of being auto-accepted or blocked on a normalization artifact.

### Authoring file format

One strict authoring file per manifest locale:

- `data/short-descriptions/<locale>.json`

```json
{
  "locale": "en",
  "entries": [
    {
      "spellId": "srd-fireball",
      "description": "Short, reviewed description in safe Markdown.",
      "higherLevels": "Optional short scaling text.",
      "sourceHash": "sha256:<64 lowercase hex>",
      "status": "accepted",
      "acceptance": "auto",
      "origin": "generated"
    }
  ]
}
```

Strict schema (`src/tools/short-descriptions/authoring-schema.ts`):

| Field               | Rule                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `spellId`           | Canonical `srd-<lowercase-slug>`; unknown but well-formed ids are allowed and reported as behavioral errors |
| `description`       | Non-empty after trim, at most 20 000 characters, safe Markdown                                              |
| `higherLevels`      | Optional; same limits. Whitespace-only is treated as omitted                                                |
| combined length     | `description` + `higherLevels` at most 50 000 characters                                                    |
| `sourceHash`        | `sha256:` + 64 lowercase hex characters                                                                     |
| `status`            | `accepted` or `withheld` (there is no `invalid` status)                                                     |
| `acceptance`        | `auto` or `human`                                                                                           |
| `origin`            | `generated` or `manual`                                                                                     |
| duplicate `spellId` | Rejected                                                                                                    |
| locale              | Must match the file name and a manifest language                                                            |

Safe Markdown permits paragraphs, headings, lists, blockquotes, bold, italic, and code. Raw HTML, links, images, bare URLs, link reference definitions, and tables are rejected. Every failure is actionable and names the file and field; no production text is written when structure is invalid.

### Source fingerprint

`sourceHash` is `sha256:` over the UTF-8 JSON of the selected-language source fields that a short description can replace:

```json
{ "description": ["..."], "higherLevels": ["..."] }
```

The fingerprint changes when the normalized description or higher-level text changes. It does not change when a name, level, school, file formatting, or other metadata changes. An entry whose `sourceHash` no longer matches the current dataset is **stale**: generation refuses to write it until it is regenerated or explicitly approved after review.

### Content conventions

- Paraphrase meaning-preserving and compress substantially; the tooling reports the reduction and prefers at least 10%.
- Preserve every gameplay mechanic: numbers, dice, targets, areas, ranges, durations, timing, conditions, saves, action economy, restrictions, exceptions, scaling, and component-dependent effects.
- Remove flavor, redundant restatement, and examples that do not change play.
- Put higher-level scaling in `higherLevels`, never duplicated in `description`.
- Do not add rules the source does not have.
- Use only safe Markdown and the locale's established abbreviations.

### Severity rubric

Severity is based on potential mechanical impact, never on model confidence:

- **high** — damage, dice or quantities, targets or areas, range, duration or timing, action economy, conditions, saves, scaling, restrictions, exceptions, or component requirements change; or real uncertainty about a serious rule change.
- **medium** — possible ambiguity or omission, incomplete higher-level text, significant compression with uncertain effect, or dropped rules vocabulary.
- **low** — wording, style, readability, or non-mechanical formatting.

### Deterministic checks

`src/tools/short-descriptions/normalize.ts` is a literal pattern-to-canonical-value table plus a multiset comparison. It never infers values outside the table. Adding an equivalence requires a unit test.

- **Scope:** the source side is the replaceable description text. The spell's casting time, range, and duration are passed separately as metadata because the app displays them outside the description. A candidate value that only restates that metadata is whole-spell equivalent and is not a finding. Metadata never excuses a source-description value that disappears, and a candidate value that matches neither the description nor the metadata is still a confirmed mismatch.
- **Dice:** `NdS`, `NS`/`WS` (German `W`), optional `±` modifier. `1d8`, `d8`, and `1W8` are equivalent; `1d8 + 2` equals `1d8+2`.
- **Time (seconds):** 1 round = 6 seconds, 1 minute = 10 rounds = 60 seconds, 1 hour = 60 minutes, 1 day = 24 hours. The locale catalog's time abbreviations are accepted (`min`, `h`, `t`, `d`, and the `Std.`-style long forms), including German `Sek.` for seconds.
- **Distance (meters):** 5 feet = 1.5 meters (labeled approximation, factor 0.3 m per foot); 1 kilometer = 1000 meters (`km`, `Kilometer`).
- **Weight (kilograms):** 1 pound = 0.45 kilograms (labeled approximation).
- **Counts:** numbers and number words (zero through twenty plus tens and hundred, English and German) with `creature`/`target`/`object`/`spell` nouns, including German equivalents and catalog abbreviations (`Ggstd.`, `obj.`). Inflected German numerals (`ein`, `eine`, `einem`, `einer`) count as quantities but not as counts, so an article never becomes a target requirement. A value separated from its noun by up to three lowercase modifiers (`≤ 4 von dir erschaffene Kreaturen`) still matches; a capitalized word in between rejects the association because it is another noun or an abbreviation.
- **Unresolved units:** miles, inches/yards, square units, stone, and tons are known but have no table factor; they are reported as unresolved and forwarded to the semantic comparison.
- **Relative markers:** `half`, `one-half`, `halb`, `hälfte`, and `½` are preserved as a relative marker and are never equated with a fixed number.
- **Repeated values:** the same value appearing a different number of times is `unresolved`, not a confirmed mismatch. Natural-language repetition may restate one rule, but it may also denote separate rules, so the semantic comparison must decide. A different value is still a confirmed mismatch.
- **Formatting:** thousands separators, locale decimal commas, trailing zeros, and dash variants normalize before comparison. `10 feet` and `3 meters` are equivalent; `1d8` vs `1d6` is a confirmed mismatch.

Other deterministic checks: Markdown safety, droppable rules vocabulary (damage, saving throw, hit points, advantage, disadvantage, concentration, bonus action, reaction and their German equivalents, accepting catalog abbreviations, English inflection such as `damaged`, and German compounds such as `Schadensvermeidung`), higher-level completeness, duplicated scaling, and the compression budget.

Each numeric finding names the field (`description` or `higherLevels`), both raw value lists, whether the candidate has no value for a source value or adds an unsupported value, and whether a candidate value restates metadata. Unresolved items appear as low-severity findings with the same explanation and are also sent to the semantic comparison.

### Timing diagnostics

`--timings` prints a duration per pipeline stage after each entry and for the run as a whole. The clock is monotonic, the flag changes no behavior, and the lines contain only durations.

```text
de srd-example: accepted
  generation API:        2.4s
  deterministic checks:  0.1s
  judge API:             3.1s
  total:                 5.8s
  authoring files:       0.0s
  review report:         0.0s
  total run:             5.9s
```

Timing lines are printed for failed entries as far as the stages were reached.

### Review report reference

The report records provider, base URL, generation and judge models, command, outcome, exit code, counts overall and per locale (including automatic and human acceptance), the automatic-acceptance ratio, per-entry status/severity/findings/evidence/reasons, usage and estimated cost, skipped entries, and the list of failures with whether each was committed. It never contains prompts, responses, request headers, credentials, or source hashes. A missing report is not an error; validation rebuilds it. The report is not an input to the runtime transform or the drift gate.

### Limitations

- **Saved copies lose their origin.** A saved custom copy stores no provenance. Reopening it through the ordinary edit path does not offer **Apply short description**. Create a new editable copy from the bundled SRD spell to apply a short description again.
- The action replaces only the description and higher-level text; it never changes metadata, components, or other fields.
- The action is available only for the captured language of the copy session; switching the app language afterward does not translate the text or switch to another locale's candidate.
- There is no automatic re-application after saving; reapply before saving if you need the shortened text in the stored copy.

## Building runtime sidecars

`short-descriptions:build` writes one sidecar per spell-data locale:

- `src/data/spell-short-descriptions.<locale>.json`

Format: a JSON object keyed by canonical SRD id. Each value has `description` and an optional `higherLevels`. Authoring metadata is never included.

```json
{
  "srd-fireball": {
    "description": "Compressed, reviewed text.",
    "higherLevels": "Compressed scaling text."
  }
}
```

The loader validates each entry independently. A missing file, non-2xx response, malformed top-level JSON, or an invalid entry never breaks startup, language switching, or the editor: invalid entries are skipped and the rest still load. The editor action is simply unavailable (disabled with a localized hint) when the captured locale has no entry for the copied spell.

Sidecars are same-origin static assets (served from `src/data`, precached by the existing service worker) and never fall back to another locale. Build order is `normalize:srd` → `short-descriptions:build` → `vp build`. None of these steps calls OpenRouter.

```powershell
pnpm run short-descriptions:validate
pnpm run short-descriptions:build
```

## Full generation

After the seed batch is reviewed and committed, run the full dataset explicitly:

```powershell
pnpm run short-descriptions:generate -- --locale en --all
pnpm run short-descriptions:generate -- --locale de --all
```

Check the printed usage and estimated cost and review `data/reference/short-description-review.json` before committing authoring files, sidecars, and the report. Use `--max-cost <usd>` to bound an unfamiliar model. When pricing is unavailable, the run reports that cost cannot be estimated or enforced and refuses `--max-cost` before any model call.

### Stage sequence

- **Stage A — deterministic implementation.** Code, schemas, tooling, tests, build, and the empty authoring/sidecar baseline. No model calls and no credentials.
- **Stage B — integration smoke and seed content (user-operated).** Run the smoke test on 1–3 explicit ids, then generate roughly 20 representative spells per locale with `--limit`, review the report, and commit authoring files, sidecars, and optionally the report. The seed set should include simple, complex, cantrip, and higher-level scaling cases and at least one spell used by E2E (`srd-fireball`).
- **Stage C — full generation (separate, user-operated).** After Stage B is reviewed, run the full batch with `--all`, check usage and cost, validate, and commit.

## Cleanup

- Remove the session key when finished: `Remove-Item Env:OPENROUTER_API_KEY`.
- Close the PowerShell terminal if you want to discard the remaining process memory immediately.
- If a persistent user-scope variable was created, remove it with `[Environment]::SetEnvironmentVariable("OPENROUTER_API_KEY", $null, "User")`.
- Setting the key creates no file. Generation writes only the documented authoring, report, and runtime files.

### Security boundary

- No runtime LLM calls, no backend, no server API, and no secrets in the app.
- The authoring adapter reads the key only from `process.env.OPENROUTER_API_KEY` at execution time and never writes it anywhere.
- The OpenRouter configuration file contains only `model`, `judgeModel`, and `baseUrl`; credential-like properties are rejected.
- No file under `src/`, `index.html`, or `vite.config.ts` references authoring credentials or imports the generation modules; a test enforces this.
- `pnpm run build` and `dist/` contain no generator code or key material.

## Troubleshooting

| Symptom                                             | Cause and action                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENROUTER_API_KEY is not set`                     | Set the temporary session variable, then retry. `--dry-run`, `--approve`, `--manual`, validation, tests, and builds do not need it.   |
| Configuration error naming the file and a property  | Fix the committed JSON: malformed JSON, unknown property, credential-like property, or empty/non-string value. The command does not fall back. |
| `response-format` failure                           | The model rejected the JSON-schema response format or returned schema-invalid content. Choose a structured-output-capable model; the tooling never substitutes one silently. |
| Empty content, `finish reason: length`, or `incomplete` | The model spent the output budget before returning JSON, usually on reasoning tokens. The adapter already requests no reasoning; if it persists, raise `--max-output-tokens` or choose a non-reasoning structured-output model. |
| `model-not-found` or `404`                           | The identifier is unknown or not accessible to the key. Verify it at the provider's model endpoint and update the flag or config. |
| `401`/`403` or authentication failure                | The key is invalid, expired, or unauthorized. Re-enter it with the masked prompt; check `GET <baseUrl>/key`.                         |
| `nothing to do: no missing or stale entries`         | The selection is up to date. Use `--regenerate` or `--force` only when replacement is intended.                                     |
| Stale entry skipped                                  | The source fingerprint changed. Regenerate the entry, or review it and use `--approve` to refresh the fingerprint explicitly.        |
| `--max-cost` refused before any call                 | Pricing for the generation or judge model is unavailable. Remove the cap or select a priced model; costs are never estimated.        |
| Empty selection or unexpected count                  | Check `--locale`, `--ids`, `--all`, and `--limit`. A selection larger than `--max-entries` without a bounding flag is refused.        |
| `--show-config` reports a surprising source          | Flags override the environment, which overrides the config file, which overrides built-in defaults.   |
