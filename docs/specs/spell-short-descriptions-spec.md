# Spell Descriptions — Short Form: Final Specification

- **Status:** Draft for explicit approval. Not approved. Not implemented.
- **Feature:** Editor-applied, pre-generated short descriptions for bundled SRD spells in English and German.
- **Supersedes for requirements:** [`CR.md`](../../docs/changes/spell-short-descriptions/CR.md), [`DECISIONS.md`](../../docs/changes/spell-short-descriptions/DECISIONS.md), and `docs/specs/todo/spell-descriptions-short-form.md`. The earlier documents remain historical records; this document is the single authoritative interpretation.
- **Decision basis:** Q1–Q18, amended on 2026-11-10 by the OpenRouter authoring-tool decision and the seed-batch delivery decision.
- **Normative language:** MUST, MUST NOT, SHOULD, and MAY are used in the RFC 2119 sense. Items left to implementation judgment are listed in §16.
- **Materialization note:** This specification is intended to be copied verbatim to `docs/changes/spell-short-descriptions/SPEC.md` after approval. The current planning session can write only this plan file.

---

## 1. Summary

Bundled SRD spells remain immutable. For each supported locale, short descriptions are generated offline, validated, stored in version-controlled authoring files, and transformed deterministically into minimal runtime sidecars. A user who creates an editable copy of an SRD spell from the active deck can apply the corresponding short description to the draft in one action. The result is ordinary custom-spell content; it is rendered through the existing Markdown, card-fit, preview, details, and print paths.

The feature is **not** a global Full/Short display mode. It adds no `Spell` field, no alternate dataset selection, no runtime text rewriting, no persisted provenance, no backend, and no new user-facing content-management UI.

The authoring tool is a local, authoring-time Node.js CLI process that calls the remote OpenRouter API. It is completely separate from the Vite client application, the production build, and Cloudflare deployment. The deployed app reads only static same-origin sidecars.

---

## 2. Goals and success

- A user creating an editable copy of an active-deck SRD spell can apply a candidate short description with one action, then edit, undo, cancel, or save normally.
- Short text preserves gameplay mechanics while reducing length where meaningful.
- Original SRD records, decks, component overrides, rendering, fit, print, search, and persistence behavior remain unchanged.
- Missing, stale, withheld, invalid, or unavailable content never breaks the app or the editor.
- Generation and validation are repeatable, auditable, and maintainable for hundreds of spells in two languages.
- No LLM call occurs in application runtime, `pnpm run build`, or normal tests.
- No secret is committed, bundled, logged, or deployed.

---

## 3. Scope

### 3.1 In scope

- Version-controlled authoring files for short descriptions.
- A deterministic, LLM-free authoring-to-runtime transformation producing minimal runtime sidecars.
- Loading, validation, caching, and failure isolation for the selected-language sidecar.
- A custom-editor action available only during editable-copy creation from a bundled SRD spell.
- Integration with the existing shared undo stack and localized status messages.
- A local OpenRouter-backed generation and validation CLI with deterministic checks and a structured semantic comparison.
- Severity-based acceptance, reporting, drift protection, tests, and documentation.
- An initial seed content batch and a documented path to full-dataset generation.

### 3.2 Non-goals

- No global `Full` / `Short` display setting or persisted display preference.
- No runtime rewriting, alternate dataset selection, or new `Spell` fields.
- No mutation of bundled SRD data or SRD component overrides.
- No durable origin/provenance field, table, or store.
- No expansion of “Create editable copy” beyond active-deck SRD spells.
- No short-description authoring or application for arbitrary custom spells.
- No automatic translation between English and German; each locale is generated from its own source.
- No 100% coverage requirement or coverage-based release gate.
- No LLM calls in `pnpm run build`, application runtime, or normal tests.
- No changes to card fitting, print pagination, search, filters, or rendering algorithms.
- No in-app review, approval, or content-management UI.
- No user-facing badges distinguishing auto-accepted from human-approved text.
- No backend, Cloudflare Worker, API, secret-management service, or additional infrastructure for generation.
- No OpenRouter SDK, AI SDK, or other new dependency.
- No guarantee that automatically accepted text is mechanically correct or human-approved.

### 3.3 Delivery stages

**Stage A — Implementation (agent).** Deliver the authoring tooling, schemas, deterministic transform, runtime loader/editor integration, tests, and documentation. This stage requires no credentials and performs no live model calls. Tests use mocks and a clearly test-only E2E fixture. The agent MUST NOT fabricate production short-description content and MUST NOT substitute a different provider.

**Stage B — Integration smoke test and seed content (user-operated).** After Stage A is reviewed, the user first runs the documented Stage B integration smoke test (§8.11) against a very small, explicitly selected spell set to confirm that the configured OpenRouter model, request shape, structured-output mode, schema validation, semantic comparison, reporting, and deterministic transformation work end to end. Only then does the user run the documented generation command with `OPENROUTER_API_KEY` in an isolated environment for approximately 20 representative spells per locale. The seed set SHOULD cover simple, complex, cantrip, and higher-level scaling cases and SHOULD include at least one spell already used by E2E (for example `srd-fireball`). The user validates, reviews the report, and commits the authoring files, runtime sidecars, and report. The seed batch MUST exercise the real generation and validation pipeline, not hand-written production fixtures.

**Stage C — Full content (user-operated).** The user runs the same missing-only generation workflow with explicit `--all` for all remaining spells in both locales. This MUST require no additional implementation work. Missing or withheld entries remain acceptable.

Stage A is the implementation acceptance boundary. Stages B and C are content-delivery steps and are not gates for Stage A; the app remains fully usable while content is absent.

---

## 4. Verified current-system facts and constraints

These facts were checked against the repository and constrain the design.

- The datasets contain **339 spells per locale**: `src/data/spells.srd.json` and `src/data/spells.srd.de.json`. Canonical IDs are `srd-<slug>` (for example `srd-fireball`, `srd-sorcerous-burst`), identical across locales. The earlier CR’s “`srd-<index>`” wording is incorrect and is superseded by this specification.
- 103 English and 109 German records have `higherLevels`. Some German cantrip upgrades are inline in `description`.
- `src/data` is Vite’s `publicDir` (`vite.config.ts`). JSON assets are served at the site root and precached by the existing PWA glob (`**/*.{js,css,html,ico,png,svg,woff,woff2,json}`).
- All description surfaces converge on `parseSpellBody` (`src/markdown/parse.ts:367`). Card-fit caching fingerprints `description` and `higherLevels` (`src/cards/fingerprint.ts`).
- `createCustomSpellCopy` deep-clones an SRD spell, replaces the ID with a UUID, sets `source: "Custom"`, and drops `sourceLabel`/`overridden` (`src/db/custom-spells.ts:52-60`).
- `CopyDraftFlow` already captures the originating `sourceSpellId` (`src/components/details/DetailsPane.tsx:20-26`, `:220-234`). `CustomSpellForm` does not currently receive it.
- `CustomSpellForm` has separate `description` and `higherLevels` draft fields, an Abbreviate action, and a session-scoped LIFO undo stack of partial draft snapshots (`src/components/details/CustomSpellForm.tsx:197`, `:216-258`). `session.language` captures the editor-open language.
- “Create editable copy” is offered only for an SRD spell with an active-deck entry (`DetailsPane.tsx:207`; MAIN-spec §6).
- No persisted link from a saved custom copy back to its originating SRD ID exists. `sourceLabel` is a display label only; deck replacement preserves only `entryId`/position/`fitMode`; custom-spell and deck payloads carry no origin.
- The only persisted preference is `spellCards.language`. There is no global display-style preference.
- `src/services/data/load.ts` provides the established fetch + Zod + in-memory cache pattern. `clearDataCache()` resets it.
- `spell-languages.json` lists exactly `en` and `de`; it is generated by `normalize:srd` and MUST NOT be extended for this feature.
- SRD overrides store only verbal/somatic component text and merge at read time; they never mutate bundled descriptions.
- The project is a static React/Vite app deployed to Cloudflare Workers static assets. There is no backend runtime, no API, and no secrets in the deployed app.
- `tsconfig.json` includes `src`, `scripts`, `e2e`, and `vite.config.ts`; `pnpm run check` type-checks them. `vite.config.ts` `fmt.ignorePatterns` already excludes `data/**` and `src/data/**`.
- `data/reference/` exists and holds committed reference reports (for example `subclass-reconciliation.json`).
- The existing SRD drift gate (`src/test/srd-dataset.test.ts`) reads committed golden datasets from the Git object store so a local build cannot mask drift.

---

## 5. User-visible behavior

### 5.1 Availability

| ID | Requirement |
|---|---|
| FR-1 | The short-description action appears only in the custom-spell editor for a draft created by the existing editable-copy flow from an active-deck SRD spell. It is absent for new custom spells, ordinary custom edits, and the restricted SRD override editor. |
| FR-2 | The originating canonical `sourceSpellId` is passed transiently from `CopyDraftFlow` to `CustomSpellForm`. No schema, database, payload, import/export, or persisted-provenance change is made. |
| FR-3 | The candidate is looked up by `sourceSpellId` in the sidecar for the language captured when the dialog opened (`session.language`). There is no English fallback for a German draft and no cross-language fallback. |
| FR-4 | In an editable-copy session the action is **visible but disabled** when unavailable, with one accessible, localized explanation. Missing, stale, withheld, invalid sidecar entries, unsupported-language, sidecar-loading, and sidecar-failure states resolve to the same user-friendly “unavailable” state; internal reasons are not exposed as technical jargon. |

Availability is evaluated as follows:

- The copy session exists and `sourceSpellId` is present.
- `session.language` is a supported locale (`en` or `de` today).
- The per-locale sidecar has loaded and contains a fresh eligible entry for `sourceSpellId`.
- If the sidecar arrives after the dialog opens, the action enables on the next render. No blocking spinner or new loading UI is required.
- For ordinary custom edits and new spells the action is absent, not disabled.

### 5.2 Apply behavior

| ID | Requirement |
|---|---|
| FR-5 | Applying replaces `description` and, when the entry supplies a non-empty `higherLevels`, replaces `higherLevels` in the same action. If the entry omits `higherLevels`, the current draft `higherLevels` is preserved, never cleared. |
| FR-6 | Applying pushes exactly one action-tagged undo snapshot containing only the fields that changed. The existing shared LIFO stack handles abbreviation and shortening in either order. |
| FR-7 | The undo button label and status reflect the top snapshot’s action: “Undo abbreviation” for abbreviation, “Undo short description” for shortening. Existing abbreviation wording is preserved when abbreviation is on top. |
| FR-8 | If applying changes neither field, show a localized “no change” status and push no snapshot. |
| FR-9 | Applying never saves. Cancel discards the draft; Save persists the resulting text through the existing custom-spell path. No additional confirmation dialog is introduced. |
| FR-10 | The action never changes name, level, school, casting time, range, duration, components, classes, source, or any other metadata. |

The applied text is a single string in the draft fields, exactly as a manual edit. On save, the existing form converts it to `description: [text]` and `higherLevels: [text]` (or omits `higherLevels` when empty). No new save path is introduced.

### 5.3 Undo and status

- The existing stack stores partial draft snapshots and is reset when the dialog opens or the spell changes. It remains session-scoped.
- Each snapshot MUST be tagged with its action (`abbreviation` or `shortDescription`) and the changed old field values.
- Undo restores exactly the snapshotted fields, overwriting later manual edits to those fields and leaving unrelated fields untouched, matching existing abbreviation behavior.
- A second undo restores the previous state.
- No snapshot is created for a no-change apply.
- The status region uses the existing `role="status"` / `aria-live="polite"` pattern. Status text is localized and action-specific: applied, no change, unavailable, undone abbreviation, undone short description, and the existing abbreviation success/no-match messages.
- The undo button is disabled when the stack is empty. Its label and accessible hint reflect the top action.

### 5.4 Save, cancel, and manual edits

- The user may apply a short description and then edit any field manually.
- The user may apply a short description after manual edits; replacement is allowed and undoable, consistent with Abbreviate.
- Cancel writes nothing. Save validates and persists through the existing path.
- The existing optional deck-replacement confirmation after saving an editable copy is unchanged.

### 5.5 Language behavior

- The candidate is always read from the sidecar for `session.language`.
- A UI language switch outside the dialog does not change an open draft’s candidate language.
- The per-locale sidecar cache and the AppProvider’s per-locale record MUST retain the captured language’s map after a UI switch so an open draft can still resolve its candidate.
- If the captured language is unsupported or its sidecar has no entry, the action is unavailable. No English fallback is used.

### 5.6 Saved-copy limitation

After Save and later reopening, the editor has no origin ID and therefore no apply action. The user must create a new editable copy to apply a short description later. This is an accepted consequence of the no-provenance decision and MUST be documented in the custom-spells guides.

### 5.7 Accessibility

| ID | Requirement |
|---|---|
| FR-11 | The action, disabled explanation, status, and undo control are keyboard accessible and use the existing button, hint, `aria-describedby`, and `role="status"`/`aria-live` patterns. |
| FR-12 | Reopening a saved custom copy does not offer the action; the limitation is documented in the user-facing guide. |

The disabled explanation MUST be available to assistive technology (for example via `aria-describedby` on the button and a visible hint). Focus order and dialog behavior are unchanged.

---

## 6. Data model

### 6.1 Authoring source

Path: `data/short-descriptions/<locale>.json`.

```json
{
  "locale": "de",
  "entries": [
    {
      "spellId": "srd-sorcerous-burst",
      "description": "Fernkampf-Zauberangriff ...",
      "higherLevels": "ZT+: ...",
      "sourceHash": "sha256:...",
      "status": "accepted",
      "acceptance": "auto",
      "origin": "generated"
    }
  ]
}
```

| ID | Requirement |
|---|---|
| DATA-1 | Authoring sources live under `data/short-descriptions/<locale>.json`, are version-controlled, and contain only the fields below. |
| DATA-2 | The schema is strict: unknown fields are rejected. Duplicate `spellId` values are a structural error. |

Field rules:

- `locale` (required): BCP 47 tag matching the file name and a manifest language code. Today only `en` and `de` are supported. An authoring file whose `locale` does not match its filename or is absent from the manifest is a structural error.
- `entries` (required): array. Entries SHOULD be sorted by `spellId` for stable diffs; sorting is recommended, not a runtime requirement.
- `spellId` (required): canonical `srd-<slug>` identifier. The schema validates the canonical format and uniqueness within the file. Whether the ID exists in the selected-language normalized dataset is a separate cross-reference check: unknown or orphaned IDs are warnings and are omitted from the runtime sidecar (DATA-9), not schema errors. A malformed ID is a structural error.
- `description` (required): non-empty Markdown string. Length MUST be within `LIMITS.DESCRIPTION_ITEM_MAX` (20,000 characters).
- `higherLevels` (optional): non-empty Markdown string. Whitespace-only values are treated as omitted. Length MUST be within `LIMITS.DESCRIPTION_ITEM_MAX`. Combined description + higher-level length MUST be within `LIMITS.DESCRIPTION_TOTAL_MAX` (50,000 characters).
- `sourceHash` (required for all entries): `sha256:<64 hex>` fingerprint of the source text at the last successful validation or approval. See §6.3.
- `status` (required): `accepted` | `withheld`.
- `acceptance` (required): `auto` | `human`.
- `origin` (required): `generated` | `manual`.

Missing entries are represented by absence, not by a placeholder record. Detailed findings, severity, evidence, and review priority belong in the separate report, not in every entry.

| ID | Requirement |
|---|---|
| DATA-10 | The authoring schema has no `invalid` status. Every per-entry content constraint that the loader or transform depends on — non-empty text, character limits, safe Markdown — is part of the strict authoring schema and therefore a structural error, not a non-fatal condition. A generator candidate rejected before it is written never appears in an authoring file; it exists only as a report finding. |

Consequences of DATA-10:

- There is no authoring state that is simultaneously schema-valid and structurally corrupt. A hand-edited entry that violates a schema constraint fails processing with a diagnostic naming the file, `spellId`, and field, rather than being silently omitted. Runtime ineligibility is a separate matter: a schema-valid entry may be unknown to the dataset (DATA-9) or fail the material-shortening criterion (§8.6), and in both cases it is reported as a warning and omitted from the runtime sidecar.
- `invalid` remains a report-only outcome label for a rejected or unusable candidate. It is never a persisted `status` value and never reaches the runtime sidecar.
- `withheld` is the only status for text that is structurally and safety-valid but blocked by a high-severity or unresolved finding, so that human review can inspect and approve it. Runtime ineligibility for other reasons (unknown dataset ID, no material shortening) does not change `status`; such entries stay `accepted` and are merely excluded from the sidecar.
- The runtime sidecar loader (LOAD-3, LOAD-4) still treats invalid sidecar entries as skippable because sidecars are untrusted static assets validated at load time; that tolerance is independent of authoring strictness.

### 6.2 Runtime sidecar

Path: `src/data/spell-short-descriptions.<locale>.json`, served at `/spell-short-descriptions.<locale>.json`.

```json
{
  "srd-sorcerous-burst": {
    "description": "Fernkampf-Zauberangriff ...",
    "higherLevels": "ZT+: ..."
  }
}
```

| ID | Requirement |
|---|---|
| DATA-3 | The runtime sidecar is a top-level object keyed by canonical spell ID. Values contain only `description` (non-empty) and optional non-empty `higherLevels`. |
| DATA-4 | Runtime sidecars contain no `sourceHash`, status, acceptance, origin, review, timestamp, model, or other metadata. |
| DATA-5 | Runtime sidecars are sorted by key, use deterministic serialization (2-space JSON, LF line endings, trailing newline), and are replaced atomically per file (temporary file plus rename, TOOL-16). |
| DATA-6 | The transform emits one sidecar per manifest locale. If a locale has no authoring file or no eligible entries, the sidecar is `{}`. Missing or 404 sidecars remain non-fatal at runtime. |

The loader validates each entry independently. Invalid entries are skipped; a malformed top-level file yields an empty map.

### 6.3 Source fingerprint

- Algorithm: SHA-256 over UTF-8 `JSON.stringify({ description, higherLevels: higherLevels ?? [] })` using the selected-language normalized dataset record.
- Format: `sha256:<hex>`.
- `description` and `higherLevels` are the normalized arrays from `src/data/spells.srd*.json`, not the editor draft string. The editor draft is the joined text (`\n\n` between array items).
- Name, level, school, classes, source, components, subclasses, saving throw, damage types, and overrides are excluded.
- Rationale: the fingerprint tracks exactly the text being shortened. Name and other metadata changes are editorial for this feature and do not force regeneration.
- A fingerprint mismatch means “stale”, not “mechanically wrong.”
- Fingerprints are updated only after successful revalidation or explicit human approval.

| ID | Requirement |
|---|---|
| DATA-7 | The fingerprint MUST be deterministic across repeated runs and MUST change only when the selected-language description or higher-level text changes. It MUST NOT include metadata or formatting of the JSON file itself. |

### 6.4 Status, acceptance, and origin

| Field | Values | Meaning |
|---|---|---|
| `status` | `accepted` | Eligible if fresh and materially shorter; runtime-eligible. |
| `status` | `withheld` | High-severity or unresolved high-impact risk; not offered. |
| `acceptance` | `auto` | Accepted by deterministic checks plus semantic comparison. Not a guarantee of correctness. |
| `acceptance` | `human` | Explicitly reviewed or approved by a human. Protected from automatic overwrite. |
| `origin` | `generated` | Produced by the generator. |
| `origin` | `manual` | Edited or authored by a human. Protected from automatic overwrite. |

- Only a `status: accepted` entry with a matching current fingerprint that also passes the material-shortening eligibility criterion (§8.6) enters the runtime sidecar. Revalidation can leave an `accepted` entry accepted; it never promotes a `withheld` entry.
- Missing entries are represented by absence.
- Human approval MAY override an automatically withheld status only through the explicit `--approve` command; the report MUST record the findings and the override.
- `--force` bypasses protection for regeneration but MUST NOT bypass high-severity checks or accept schema-violating text. A regenerated candidate that fails checks remains withheld; a candidate that violates the authoring schema is rejected and never written.
- `--approve` MUST fail for entries that violate the authoring schema; such violations are structural errors, not approvable findings.
- Auto-accepted and human-approved entries MUST remain distinguishable in the authoring file and report.

### 6.5 IDs, locales, and coverage

| ID | Requirement |
|---|---|
| DATA-8 | Authoring and runtime keys use canonical `srd-<slug>` IDs from the selected-language dataset. IDs are identical across locales. |
| DATA-9 | Unknown/orphaned IDs are reported as warnings and omitted; they MUST NOT block builds or releases. Duplicate IDs and malformed authoring files are structural errors and MUST fail processing. Missing coverage is a warning. |

- An authoring file for a locale absent from the manifest is a structural error.
- The strict schema accepts any well-formed canonical `srd-<slug>` ID; dataset membership is checked separately. An ID that is well-formed but absent from the current dataset is an unknown/orphaned warning, not a schema violation (DATA-9).
- A malformed ID that does not match the canonical format is a structural error.
- A manifest locale without an authoring file is valid; its sidecar is `{}` and the action is unavailable.
- A new SRD spell with no entry is valid; the action is unavailable until generated.
- A removed SRD spell leaves an orphaned authoring entry; it is omitted and reported, not fatal.
- Imported custom spells with `source: "SRD-5.2.1"` and UUID IDs do not match sidecar keys; the action is unavailable. No special handling is required.

---

## 7. Runtime integration

### 7.1 Loader

| ID | Requirement |
|---|---|
| LOAD-1 | The sidecar for a locale is fetched and cached using the existing fetch + Zod + in-memory cache conventions in `src/services/data/load.ts` (or a sibling module following the same pattern). |
| LOAD-2 | The URL is convention-based: `/spell-short-descriptions.<locale>.json`. `spell-languages.json` is not extended. |
| LOAD-3 | Missing, 404, malformed, or partially invalid sidecars yield an empty or partially filtered map. They MUST NOT fail app startup, language switching, the custom-spell editor, or normal rendering. |
| LOAD-4 | Invalid individual entries are skipped with a development diagnostic; valid entries remain usable. |
| LOAD-5 | No new loading UI is required. While unavailable, the action is disabled. |
| LOAD-6 | PWA precaching includes sidecars through the existing JSON glob. Offline readiness does not require them; without them the action is unavailable. |
| LOAD-7 | Sidecars are cached per locale and cleared by `clearDataCache()`. The AppProvider retains a per-locale record so an open draft’s captured language remains resolvable after a UI language switch. |

The loader function MUST be non-throwing for sidecar failures: it returns an empty map (or the valid subset) and logs a development diagnostic. It MUST NOT require the OpenRouter key and MUST NOT call OpenRouter.

### 7.2 AppProvider

- Eagerly load the selected language’s sidecar alongside its dataset during initial load and language switching.
- Store the loaded maps in a per-locale record (for example `shortDescriptionsByLocale`) and expose it to the editor.
- A sidecar failure MUST NOT block the dataset load, language switch, or app startup. The record simply lacks that locale’s map.
- Do not replace or clear previously loaded locale maps on a language switch; an open draft may still need its captured language.
- `clearDataCache()` and a data retry may reset the record; in that case the captured language is unavailable until reloaded, and the action remains disabled.
- The editor reads the map directly from context so a late-arriving sidecar enables the action without reopening the dialog.

### 7.3 Editor integration

- `DetailsPane` passes the captured `sourceSpellId` only to the editable-copy form. The ordinary edit form and the SRD override editor do not receive it.
- `CustomSpellForm` adds an optional origin prop. The prop name is implementation discretion; its semantics are mandatory: only the copy session supplies it.
- The action is rendered in the existing non-SRD action row next to Abbreviate/Undo, only when the origin prop is present and `editableCopy` is true.
- Applying and undo use the shared stack described in §5.3. No second history mechanism is introduced.
- The existing Abbreviate action, its transformation rules, and its session history remain intact. Only the shared undo presentation is generalized.
- No change to the copy flow, deck-replacement semantics, custom-spell persistence, or rendering.

### 7.4 Unchanged contracts

- No Dexie schema migration and no new persisted user data.
- No `Spell` schema, custom-spell import/export, deck payload, or SRD override changes.
- No `spell-languages.json` change.
- No change to bundled SRD datasets or their drift test.
- No change to `parseSpellBody`, card fit, pagination, print layout, truncation, or print omission.
- No change to search, filters, language resolution, deck resolution, or custom-spell persistence.
- Existing custom spells and saved decks remain valid and unchanged.

---

## 8. Authoring tooling

### 8.1 Commands and build order

| ID | Requirement |
|---|---|
| TOOL-1 | A separate authoring-time CLI generates, revalidates, validates, and transforms content. It is never invoked by the app runtime. The generator is never invoked by `pnpm run build`. |
| TOOL-2 | The deterministic transform runs after SRD normalization and before `vp build`. It never invokes an LLM and never requires the OpenRouter key. |

Recommended scripts (exact names are implementation discretion, but the behaviors are mandatory):

```json
{
  "short-descriptions:smoke": "tsx scripts/short-descriptions/smoke.ts",
  "short-descriptions:generate": "tsx scripts/short-descriptions/generate.ts",
  "short-descriptions:validate": "tsx scripts/short-descriptions/validate.ts",
  "short-descriptions:build": "tsx scripts/short-descriptions/build.ts",
  "build": "pnpm run normalize:srd && pnpm run short-descriptions:build && vp build"
}
```

`short-descriptions:smoke` is manual-only (§8.11); it MUST NOT be referenced by `build`, `test`, `test:e2e`, `preview`, or `deploy`.

`short-descriptions:generate -- --show-config` MUST print the effective non-secret configuration without a network call, credentials, `--locale`, or `--ids`, and MUST write nothing. The output MUST show the resolved generation model, judge model, base URL, the source of each setting, whether `OPENROUTER_API_KEY` is set (never its value), and the configuration file path. Configuration resolution MUST happen before selection validation and the `--dry-run` branch so a malformed committed configuration fails fast.

Use the repository’s existing TypeScript script runner (`tsx` is already used by `normalize:srd`; `vpx` is also available). Do not add a new runtime dependency.

A documented `--generator-command` MAY invoke a user-supplied compatible CLI for authoring. It is optional, explicit, not used by default, and not a provider framework. OpenRouter remains the default and only built-in adapter. The command is authoring-only and is never used by the app, build, deploy, or normal tests; it must not be used to substitute a provider silently.

Build order:

1. `normalize:srd`
2. short-description authoring-to-runtime transform
3. `vp build`

### 8.2 OpenRouter adapter and credentials

**Boundary.** The generation CLI is a local, authoring-time Node.js/TypeScript tool. It MUST NOT be imported by `src/`, `index.html`, `vite.config.ts`, or any Cloudflare build/deploy command. It MAY import pure shared modules (domain schemas, locale catalogs, Markdown parser) that do not read credentials or perform network calls. It MUST NOT be bundled by Vite or deployed.

**HTTP.** Use Node’s built-in `fetch`. Do not add the OpenRouter SDK or an AI SDK.

- Configuration file: a committed, non-secret `scripts/short-descriptions/openrouter.config.json` MAY define `model`, `judgeModel`, and `baseUrl`. The path MUST be derived from the module location, not the working directory. A missing file MUST fall back to the built-in defaults. A present file that is malformed, contains an unknown property, contains a credential-like property (`apiKey`, `OPENROUTER_API_KEY`, `token`, `secret`, `password`), or contains an empty/non-string value MUST fail the command with a setting-specific error and MUST NOT fall back. The file MUST NOT contain the API key.
- Base URL: `OPENROUTER_BASE_URL`, then the config file `baseUrl`, then the built-in default `https://openrouter.ai/api/v1`. Credentials, query, and fragment are removed from every source.
- Model roles: generation and semantic comparison are configured independently.
  - Generation model: `--model`, then `OPENROUTER_MODEL`, then the config file `model`, then the built-in default.
  - Semantic-comparison (judge) model: `--judge-model`, then `OPENROUTER_JUDGE_MODEL`, then the config file `judgeModel`, then the built-in default.
  - Empty or whitespace-only environment values MUST be treated as absent; an explicit empty CLI model flag MUST be rejected. A role MUST NOT inherit another role's configuration.
  - Both fall back to a single shared default constant when neither variable, flag, nor config value is set. The judge MAY use a different model than the generator; it MUST NOT inherit provider or request-shape assumptions from the generator beyond the shared adapter. Model names MUST be configurable and MUST NOT be embedded in client code.
- Request structured JSON output (JSON-schema response format where supported) and always validate the returned JSON locally with Zod. Exact request body details are implementation discretion.
- Timeouts and bounded retries: exponential backoff with jitter for 429, 5xx, and transient network errors; no retry for 400/401/403/422 or invalid output. Defaults: 3 attempts, 120 seconds per call; configurable.

**Cost and usage protection (TOOL-15).**

| ID | Requirement |
|---|---|
| TOOL-15 | A generating run is bounded by an explicit entry count and, when pricing data is available, a configurable maximum estimated cost. Unavailable pricing is reported as unavailable, never estimated. |

- Selection bounds: `--limit <n>` (or `--ids`) always bounds a run. When the computed selection exceeds `--max-entries` (default 25) and neither `--ids` nor `--limit` was given, the run MUST refuse and print the selection size plus the `--all` instruction. Full-dataset generation requires explicit `--all`.
- Per-request output bound: the adapter sends a `max_tokens` value derived from `--max-output-tokens` (configurable) so a runaway completion cannot inflate cost.
- Cost estimation: a generating run fetches `GET <base>/models` once before the first model call when `--max-cost` is set, and MAY do so otherwise, to read per-model token pricing for the selected generation and judge models. This single lookup replaces any pricing table, SDK, or provider framework. If the lookup fails, the run reports it and, when `--max-cost` was set, refuses to call the model.
- `--max-cost <usd>`: the run tracks accumulated prompt and completion usage per model and aborts before the next call when the projected total would exceed the limit. Entries already generated and validated are still committed per §8.3; the run exits with the partial-success code and the report records the abort reason.
- If pricing for a selected model is unavailable, the run MUST print that cost cannot be estimated or enforced and MUST continue only when `--max-cost` is not set. It MUST NOT invent or guess prices.
- Usage reporting: the report records actual prompt, completion, and total token counts per entry and per run whenever the provider response includes a `usage` object, and records the estimated cost only when pricing was retrieved. When usage or pricing is absent, the report states “unavailable” for that figure rather than omitting or fabricating it.
- `--dry-run` performs no pricing lookup, no model call, and no writes.

**Credential handling (mandatory).**

| ID | Requirement |
|---|---|
| SEC-1 | Read the key only from `process.env.OPENROUTER_API_KEY` at execution time. No `.env` file is required or created; no credentials file is created or populated. |
| SEC-2 | Never use a `VITE_`-prefixed variable for the key. Never accept the key as a command-line argument. |
| SEC-3 | Never print, log, include in errors, include in reports, include in prompts, or otherwise expose the key. Never commit it. Never bundle it into client JavaScript or generated assets. Never deploy it to Cloudflare. |
| SEC-4 | The key is required only when a command is about to contact OpenRouter. `--dry-run`, deterministic validation, the runtime-sidecar transform, `pnpm run build`, `pnpm run check`, `pnpm run test`, `pnpm run preview`, and `wrangler deploy --dry-run` MUST work with the variable unset. |
| SEC-5 | Missing credentials produce a clear, actionable error only when a model call is needed, with no writes. Authentication/authorization failures are reported without the key and are not retried. |
| SEC-6 | The adapter MUST accept an injected `fetch` implementation or a configurable base URL so tests can use mocks. Normal tests MUST NOT call OpenRouter and MUST NOT require credentials. |

**Windows PowerShell setup and cleanup** (documented in `docs/short-descriptions.md`):

```powershell
# Set for the current PowerShell session only (recommended).
# The key is entered masked and is not echoed or written to a file.
$env:OPENROUTER_API_KEY = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText

# Verify without printing the value
if ($env:OPENROUTER_API_KEY) { "OPENROUTER_API_KEY is set" } else { "OPENROUTER_API_KEY is not set" }

# Run generation (example)
pnpm run short-descriptions:generate -- --locale en --ids srd-fireball

# Clean up when finished
Remove-Item Env:OPENROUTER_API_KEY
```

- Do not paste the key into a command line, a script, or a file. Use the masked prompt; PowerShell 7+ is required for `ConvertFrom-SecureString -AsPlainText`.
- Do not write the key to a file with `Set-Content`, `Out-File`, or a `.env` file.
- Session-only is preferred. If a persistent user-scope variable is used, document removal: `[Environment]::SetEnvironmentVariable("OPENROUTER_API_KEY", $null, "User")`.
- Never use `VITE_OPENROUTER_API_KEY`.
- The key is not required for validation, transformation, tests, or builds.

**Separation verification (automated).**

- No file under `src/`, `index.html`, or `vite.config.ts` references `OPENROUTER_API_KEY`, `VITE_OPENROUTER`, or imports the generation modules.
- `pnpm run build` succeeds with the variable unset and does not execute the generator.
- The built `dist/` contains no generator module and no key material (`sk-or-` pattern).
- `pnpm run short-descriptions:validate` and `short-descriptions:build` succeed with the variable unset.
- `pnpm run deploy` and `wrangler` do not invoke the generator.
- No backend, Worker, API route, or secret-management service is added.

### 8.3 Generation workflow

| ID | Requirement |
|---|---|
| TOOL-3 | The generator supports batch generation, selective generation by locale and ID, missing-only generation, stale revalidation, explicit regeneration, dry runs, entry limits, full-dataset runs (`--all`), separate generation and judge models, token/cost bounds, timeouts, retries, per-entry failure reporting, and opt-in stage timing diagnostics (`--timings`) that print only durations. |
| TOOL-4 | Default generation fills missing entries and revalidates stale entries. It never overwrites existing text. `--regenerate` replaces selected entries only when they are not human-approved or manually protected, unless `--force` is explicit. |

Selection:

1. Load authoring files, the selected-language normalized datasets, and the abbreviation catalog for the locale.
2. Compute current fingerprints.
3. Select missing entries (no authoring entry) and stale entries (`sourceHash` mismatch).
4. `--ids` restricts the selection; `--limit` bounds it; `--locale` restricts the locale. When the resulting selection exceeds `--max-entries` and neither `--ids` nor `--limit` was supplied, the run refuses and requires explicit `--all` (TOOL-15).
5. `--dry-run` performs selection and deterministic validation without contacting OpenRouter or writing.
6. `--regenerate` selects explicit regeneration targets; protected entries are skipped unless `--force`.
7. `--approve` marks selected entries human-approved after deterministic validation; it does not call the model.

For each missing entry:

1. Build a prompt containing the locale, the public SRD source text and relevant public metadata, the locale’s abbreviation catalog, the content conventions, and the required JSON output schema.
2. Call OpenRouter with structured output.
3. Validate the returned JSON schema and confirm the returned `spellId` matches the requested entry.
4. Run deterministic checks (§8.6).
5. Run the semantic comparison (§8.7).
6. Classify severity and set `accepted` or `withheld`. A candidate rejected by structural or Markdown-safety checks is never written; it is recorded in the report with outcome `invalid` (§6.1 DATA-10).
7. Stage the authoring update in memory; no file is written until the commit phase described in TOOL-16.

For each stale entry:

- Run deterministic checks and semantic comparison against the new source.
- Do not regenerate or rewrite.
- If the entry was `accepted` and no high-severity finding remains: retain the text, update `sourceHash`, keep `status: accepted`, and record the revalidation.
- If the entry was already `withheld`: revalidation MUST NOT promote it to `accepted`, even when no blocking findings remain. It stays `withheld` until explicit `--approve` or an explicit regeneration; the report records the revalidation result.
- If a high-severity finding or unresolved high-impact ambiguity exists: set `status: withheld` (from either prior status), keep the text for review, and report the reasons.
- Preserve `acceptance` and `origin`. A human-approved entry can still be withheld; the human must resolve it explicitly.

Output and failure behavior:

- Batch size is configurable; processing is sequential by default.
- A batch failure MAY fall back to per-entry processing.
- Invalid model output is rejected; the entry remains byte-identical to its previous authored content and is reported.
- An entry that fails only the material-shortening criterion is still written as valid `accepted` authoring content and is reported as not runtime-eligible; the transform omits it from the sidecar.
- Missing generator/authentication produces a clear diagnostic and no writes.
- No prompts, keys, or authentication data are written to the repository or report.
- The report records the configured generation and judge models, base URL (not the key), timestamp, counts, failures, usage, and per-entry findings.
- After writing, the tool SHOULD run or recommend the deterministic transform and validation.

**Write semantics and partial failure (TOOL-16).**

| ID | Requirement |
|---|---|
| TOOL-16 | Writes are atomic per file only. The tool MUST NOT claim or rely on a cross-file transaction, and it MUST make partial batch success explicit in the exit code, stdout summary, and report. |

- **Per-file atomicity.** Every authoring file and the report are written by creating a temporary file in the destination directory, writing the complete content, and renaming it over the target. A malformed or truncated individual file MUST NEVER be observable, even after interruption or a disk error.
- **Merge, do not replace.** Each authoring file is rebuilt by loading the existing file, applying only the selected entries' updates, and re-serializing. Entries not selected in this run, and entries whose processing failed, retain their previous content unchanged.
- **Commit order.** The run performs all model calls, checks, and severity classification first, then materializes the new file contents in memory, then writes report and authoring temp files, then renames the authoring files, then renames the report.
- **Interruption.** While model calls or checks are running, no target file has been touched; an interrupted run leaves the repository exactly as it was. During the rename phase each file is either its old or its new complete version. There is no rollback of already-renamed files, and none is required, because every renamed file is individually valid.
- **Partial success.** If some selected entries are produced and others fail processing (model output rejected, retries exhausted, budget abort; a `withheld` classification is a completed outcome and not a failure), the successful entries are committed and the run exits with the partial-success code (§8.9). The stdout summary and report MUST list each failed entry with its reason and MUST state that the run was partial.
- **Total failure.** If no entry could be produced, or the run aborts before the rename phase for a structural reason, no target file is modified and the run exits non-zero.
- **Report write failure.** If the report temp file cannot be written before the rename phase, nothing is renamed and the run exits non-zero, leaving authoring files unchanged. If only the final report rename fails after authoring files were committed, the run exits non-zero and states explicitly that authoring files were committed and the report is missing; the authoring files remain valid and the drift test still passes.
- **Existing accepted content is never silently destroyed.** No failure path overwrites, truncates, or deletes an existing authoring entry that this run did not successfully replace, and no failure path resets a file to `{}` or to an empty entry list.

Recommended command shapes (flags are implementation discretion; behaviors are mandatory):

```powershell
pnpm run short-descriptions:generate -- --dry-run --locale en
pnpm run short-descriptions:generate -- --locale en --ids srd-fireball
pnpm run short-descriptions:generate -- --locale de --limit 20
pnpm run short-descriptions:generate -- --locale de --limit 5 --max-cost 0.50
pnpm run short-descriptions:generate -- --approve --ids srd-fireball
pnpm run short-descriptions:generate -- --regenerate --ids srd-fireball --force
pnpm run short-descriptions:generate -- --all --locale en
```

### 8.4 Stale revalidation

| ID | Requirement |
|---|---|
| TOOL-5 | Stale entries are revalidated in place. An entry that was `accepted` remains `accepted` when revalidation leaves no blocking finding: the text is retained and the fingerprint updated. An entry that was `withheld` stays `withheld` after revalidation regardless of the new findings; it is not promoted automatically. A blocking finding withholds the entry from either prior status. No automatic rewrite occurs. |

A changed fingerprint marks an entry stale; it does not prove a mechanical error. Editorial source changes (wording, formatting that does not affect rules) are retained after revalidation. Mechanical changes are withheld. Regeneration is a separate explicit operation. A `withheld` entry is not auto-restored by revalidation; it requires `--approve` or explicit regeneration. Revalidation never rewrites text, and the transition rules above are the only ones it applies.

### 8.5 Manual approval and overwrite protection

| ID | Requirement |
|---|---|
| TOOL-6 | `--approve <ids>` sets `acceptance: human` and `status: accepted` after deterministic validation, and updates the fingerprint. If the human edited the text, the entry is marked `origin: manual`. The report records the approval and any overridden findings. |
| TOOL-7 | Default generation never overwrites existing text. `--regenerate` skips `acceptance: human` and `origin: manual` entries unless `--force` is explicit. `--force` is destructive for protected content and MUST be documented as such. |

- Human approval may override an automatically withheld status only explicitly; the report records the findings and the override.
- `--approve` on an entry that violates the authoring schema fails as a structural error; approval cannot persist unusable text.
- `--force` does not bypass high-severity checks or accept schema-violating text.
- Auto-accepted and human-approved entries remain distinguishable.

### 8.6 Deterministic checks

| ID | Requirement |
|---|---|
| TOOL-8 | The generator and validator run deterministic structural and rule-oriented checks. These checks are guards, not proof of semantic equivalence; the semantic comparison is the primary automated judgment. Hard structural, Markdown, dice, and quantity failures block acceptance. |

Checks, at minimum:

1. **Structural:** valid JSON, strict schema conformance, known locale, non-empty description, string limits, well-formed canonical `spellId`, unique `spellId`. Existence of the ID in the current dataset is a separate cross-reference check and is not structural (DATA-9).
2. **Markdown safety:** parse through the app’s safe Markdown pipeline or an equivalent token walker. Reject raw HTML, links, images, URLs, scripts, and other constructs prohibited by §9. Bold/italic, paragraphs, headings, lists, and blockquotes remain allowed.
3. **Dice and quantities:** extract mechanical atoms (dice expressions, quantities with units, modifiers) from source and candidate, normalize them, and classify each category as `equivalent`, `mismatch`, or `unresolved` (§8.6.1). Confirmed mismatches are high severity and cannot be auto-overridden. `unresolved` items are forwarded to the semantic comparison as required review items and MUST NOT be treated as accepted by default.
4. **Rules vocabulary:** compare damage types, conditions, saves, targets, areas, ranges, durations, timing terms, and action-economy terms using locale-aware term lists. Differences are at least medium and high when materially mechanical.
5. **Scaling:** verify higher-level rules remain present and are not duplicated between `description` and `higherLevels`.
6. **Higher-level consistency:** source has none and candidate adds one → high; source has one and candidate omits it → medium/incomplete (the original is preserved at apply time and the entry is reported).
7. **Length:** report character and word reduction. The ~30% reduction is a quality goal, not a hard gate. If neither field is materially shorter than its source, the entry stays valid authoring content but is not runtime-eligible: it is omitted from the runtime artifact and reported. This is a runtime-eligibility criterion, not an authoring-schema constraint.
8. **Content integrity:** no added rules, examples unrelated to mechanics, or unsupported formatting.
9. **Provenance metadata:** fingerprint present and well-formed for every entry.

“Materially shorter” is a deterministic runtime-eligibility filter, applied identically by generation, validation, and the deterministic transform. It is not part of the authoring schema: an entry that fails it is still valid authoring content and is never treated as a structural error. Recommended definition: a field is materially shorter when its candidate character count is at least 10% below the source field’s character count, compared against the source text as joined by `\n\n`. If at least one replaced field is materially shorter, the entry is runtime-eligible; if neither is, it is omitted from the runtime sidecar and reported. The exact threshold is implementation discretion and is not a release gate.

#### 8.6.1 Equivalence-aware numeric and dice comparison (TOOL-17)

| ID | Requirement |
|---|---|
| TOOL-17 | The deterministic comparison normalizes a fixed, documented set of equivalent expressions. It is a bounded normalization table plus a comparison, not a natural-language rules engine: it performs no inference about spell semantics beyond that table, and every rule is a literal pattern-to-canonical-value mapping. |

Extraction. For each field, extract ordered occurrences of:

- dice expressions: count, die size, and flat modifier (`2d6+3`, `1W8`, `W8`, `d8-1`, `3d4`);
- quantities with units: time, distance, area, weight, and bare counts;
- number words and fractions that denote quantities in the active locale.

Normalization, all applied before comparison:

1. **Dice notation:** `NwS`, `NdS`, `NsS`, `WS`, `dS`, and locale equivalents map to a canonical `NdS` form; an omitted count means `1`; modifier signs and spacing are normalized (`1d8 + 2` equals `1d8+2`). A bare `d8` and `1d8` are equivalent.
2. **Numerals and number words:** digits, locale number words zero through twenty plus the documented tens and hundred, and fractions (`half`/`halb`, `one-half`, `½`) map to numeric values. `half` is preserved as a *relative* marker rather than being resolved to an absolute number, so `half damage` is not equated with a fixed value.
3. **Units and unit conversion:** a closed conversion table with exact or rule-exact factors only, applied within one dimension: time (`1 minute = 10 rounds = 60 seconds`, `1 hour = 60 minutes`, `1 round = 6 seconds`, `1 day = 24 hours`), distance and area (`5 feet = 1.5 meters` is used only as a labeled approximation and is listed explicitly in the table), and weight. Conversion factors are explicit constants in the source, documented in `docs/short-descriptions.md`; no factor is inferred.
4. **Formatting-insensitive tokens:** thousands separators, significant trailing zeros, hyphen/dash variants, and locale decimal commas are normalized.

Classification, per category (dice, time, distance/area, weight, bare counts):

- `equivalent`: after normalization the multisets of atoms in source and candidate are equal, including unit-converted equality (for example “1 minute” versus “10 rounds”, or “1W8” versus “1d8”). No finding is raised. Equivalent representations MUST NOT be reported as mismatches and MUST NOT block acceptance.
- `mismatch`: a source atom has no counterpart in the candidate and no equivalent representation elsewhere in it, or the candidate adds an atom whose value appears in neither the source description nor the spell metadata. This is high severity and blocks automatic acceptance. The only way to accept it is an explicit human `--approve`, which MUST record the finding and the override in the report.
- `unresolved`: an atom is present whose unit or role is outside the table, whose unit is ambiguous between dimensions (for example a bare distance that could be range or radius), whose classification depends on spell context the table cannot resolve, or whose value appears the same number of times on neither side while the value itself matches (natural-language repetition may restate one rule or denote separate rules, which the table cannot decide). `unresolved` items are not silently accepted: they are passed to the semantic comparison as required review items, and the entry is auto-accepted only when the judge returns `mechanicallyEquivalent: true` with no medium or high finding for those specific items. Otherwise the entry is withheld.

Where the source contains no atom in a category and the candidate adds none, the category is `equivalent` with an empty set; absence is only a `mismatch` when it removes an atom the source contains (for example a dropped “within range” distance).

Metadata scope: the source side of the comparison is the replaceable description text, but the spell's casting time, range, and duration are source mechanics the app displays outside the description. A candidate atom that exactly matches one of those metadata values is whole-spell equivalent and produces no finding. Metadata MUST NOT be used to excuse a source-description atom that disappears, and a candidate atom that matches neither the description nor the metadata remains a `mismatch`. The comparison MUST NOT be broadened to arbitrary semantic reference (for example a candidate atom that restates a value from the source higher-level text while compared against the description).

The implementer MUST NOT expand this into general semantic reasoning, an NLP parser, or a locale-aware grammar. Table additions are allowed only when they are literal equivalences valid in the game’s rules (for example “10 rounds” for “1 minute” or “1 kilometer” for “1000 meters”), and each addition requires a unit test. Locale catalog abbreviations for time units, count nouns, and their plural or inflected forms are literal equivalences and MUST be accepted consistently; German compound rules terms (“Schaden” in “Schadensvermeidung”) and English inflection (“damage”/“damaged”) are also literal word forms.

### 8.7 Semantic comparison

| ID | Requirement |
|---|---|
| TOOL-9 | A separate structured-output model call compares the original source with the candidate. The judge never rewrites text and is provisional automation, not human approval. |

Required output shape:

```json
{
  "spellId": "srd-sorcerous-burst",
  "mechanicallyEquivalent": true,
  "severity": "none",
  "findings": [
    {
      "category": "damage",
      "severity": "low",
      "sourceEvidence": "...",
      "candidateEvidence": "...",
      "explanation": "..."
    }
  ]
}
```

Rules:

- `category` covers damage, dice, quantities, targets, areas, range, duration, timing, action economy, conditions, saves, scaling, restrictions, exceptions, components, formatting, and other.
- `severity` is based on potential mechanical impact, not model confidence.
- Uncertainty about a potentially serious rule change is high severity and MUST NOT be downgraded.
- The judge must not reward brevity over correctness and must not rewrite the text.
- High severity or an unresolved high-impact ambiguity withholds the entry.
- Medium/low findings do not block automatic acceptance but MUST appear in the report.
- The judge receives the deterministic `unresolved` items (§8.6.1) as explicit required review items and MUST report a finding for each, or return no finding only when it is certain the representations are equivalent.
- The judge receives the spell's casting time, range, and duration as separate metadata, because the app displays those fields outside the description. A candidate value that only restates this metadata is not a mechanical change; a candidate value that contradicts it, or that drops or changes a value stated in the source description, is.
- If deterministic checks and the judge disagree, the higher severity wins, except that an `unresolved` item is decided by the judge's item-specific finding, because the deterministic layer explicitly declined to classify it. Confirmed `mismatch` items remain high regardless of the judge and can only be accepted by an explicit human override.

### 8.8 Report

| ID | Requirement |
|---|---|
| TOOL-10 | A validation/reporting command detects unknown/orphaned IDs, duplicates, missing coverage, stale entries, withheld entries, incomplete higher-level text, entries with no material shortening, runtime drift, and structural/transformation errors. |

Report path: `data/reference/short-description-review.json` (recommended; configurable). The report is an authoring artifact, not a build input and not part of the drift test. Committing it is optional and SHOULD be done when it records a content decision; it MUST NOT be required for `pnpm run build`, `pnpm run check`, or normal tests. The report is written with the same per-file atomic rename as authoring files (TOOL-16).

Required report content:

- generation timestamp;
- provider `openrouter`, configured generation model, configured judge model, and base URL (never the key);
- run outcome: `complete`, `partial`, or `failed`, with the exit code;
- counts by locale and status, including automatic and human acceptance counts and the automatic-acceptance ratio;
- per-entry `spellId`, locale, status, acceptance, origin, severity, findings/reasons, and recommended action; each deterministic numeric or dice finding names the compared field (`description` or `higherLevels`), both raw value lists, and explains whether the candidate lacks a source value, adds an unsupported value, or restates spell metadata;
- per-entry and per-run token usage and estimated cost when available, or the explicit value `unavailable` (never a fabricated figure);
- failures and skipped entries, including each entry's failure reason and whether any write was committed.

The report MUST NOT contain the API key, prompts, authentication headers, custom-spell data, decks, or other user data. It MAY contain public SRD evidence text.

### 8.9 Exit codes

| ID | Requirement |
|---|---|
| TOOL-11 | Structural errors exit non-zero, non-fatal content conditions exit zero with warnings, and a run in which some selected entries were written and others failed exits with a distinct partial-success code. |

| Exit code | Condition |
|---|---|
| `0` | All selected entries completed processing (or selection was empty) and all writes succeeded. An entry that finishes the pipeline and is classified `withheld` is a completed outcome, not a failure, so a run in which every selected entry completes but is withheld still exits `0` with warnings; the withheld entries are written and reported. Non-fatal content conditions — missing coverage, stale entries, withheld entries, unknown/orphaned IDs, incomplete higher-level text, no material shortening — are warnings only. |
| `1` | Structural or fatal failure with no authoring writes committed: malformed authoring JSON or schema violation (including empty text, length limits, unsafe Markdown, duplicate spell IDs, malformed spell IDs), invalid locale/file structure, transform failure, missing credentials when a model call is required, authentication failure, pre-commit write failure, runtime artifact drift. |
| `2` | Partial success: at least one selected entry was committed and at least one failed processing (model output rejected, retries exhausted, budget abort, post-commit report rename failure). The summary and report list each failure and state that the run was partial. |

Rationale: missing, stale, withheld, or orphaned content must not block builds or releases; a withheld classification reflects a content decision, not a processing failure; genuine structural corruption must not silently become empty data; and a partially applied batch must never be reported as a clean success.

### 8.10 No LLM in build, runtime, or normal tests

| ID | Requirement |
|---|---|
| TOOL-12 | The generator is never imported by the app, never invoked by `pnpm run build`, and never invoked by normal tests. The deterministic transform and validation never import the OpenRouter client. |

The deterministic transform and validation modules MUST be importable and runnable with `OPENROUTER_API_KEY` unset. A test MUST assert that the transform/validation path performs no network calls (for example by injecting a fetch that throws).

### 8.11 Stage B integration smoke test (TOOL-18)

| ID | Requirement |
|---|---|
| TOOL-18 | A separate, manually invoked smoke command exercises the real OpenRouter adapter end to end for a very small explicit spell set, so that mock tests are supplemented by evidence that the chosen model accepts the intended request and structured-output mode. It never runs during builds, normal tests, E2E, preview, or deployment. |

Invocation is explicit and never automatic:

```powershell
# Requires OPENROUTER_API_KEY in the current session; the coding agent never has access to it.
pnpm run short-descriptions:smoke -- --locale en --ids srd-fireball
pnpm run short-descriptions:smoke -- --locale de --ids srd-fireball,srd-sorcerous-burst --judge-model <model>
```

- The command MUST refuse to run without `--ids` and MUST cap the selection at a small fixed number (recommended 3 per invocation). It MUST refuse `--all`.
- The command MUST print the effective generation model, judge model, and base URL, and MUST never print the key. It MUST reject `--show-config` with a pointer to `pnpm run short-descriptions:generate -- --show-config`.
- `--dry-run` on the generation command is distinct: it requires no credentials, performs no model call, and writes nothing. The smoke command performs real calls in a staging directory.
- It MUST refuse to write to tracked paths by default. It stages results in a temporary directory outside the repository (or requires an explicit `--write` that the documentation marks as the seed-batch step), so an accidental run cannot alter authoring files.
- The command runs the complete pipeline for each selected spell: generation call, local Zod schema validation, deterministic checks (§8.6), semantic comparison (§8.7), severity classification, report emission for the staged set, deterministic transform (§10), and validation of the transformed runtime output against the runtime schema.
- The command prints a short summary with the model, request mode, per-step pass/fail, token usage or `unavailable`, and estimated cost or `unavailable`.
- Diagnostics MUST distinguish at least: missing credentials; authentication/authorization failure (401/403); model not found or not accessible (404 or equivalent); unsupported structured-output/response-format rejection (400/422 mentioning the response format or schema); provider-side schema rejection or schema-invalid model output; rate limiting; server error or timeout. Each message MUST state the failing stage, the provider status when available, and a concrete next action, and MUST NOT include the key, authorization headers, or full prompts.
- The command is documented in `docs/short-descriptions.md` and `docs/DEVELOPMENT.md` as the first Stage B step, with the temporary-variable setup and cleanup sequence from §8.2.
- A normal test MUST assert that the smoke command is not referenced by `build`, `test`, `test:e2e`, `preview`, `deploy`, or any CI configuration, and that it performs no network calls when invoked without credentials.
- A successful smoke run is the evidence that the selected generation and judge models support the required request shape. If a model rejects structured output, the user chooses a different model or documents a fallback; the implementation MUST NOT silently substitute a provider or a model.

---

## 9. Content conventions and severity policy

### 9.1 Content conventions

- Meaning-preserving paraphrase with substantial compression.
- Target approximately 30% or greater character reduction as a quality goal, not a per-spell gate or release gate.
- Preserve all gameplay-relevant mechanics: numbers, dice, targets, areas, ranges, durations, timing, conditions, saves, action economy, restrictions, exceptions, scaling, and component-dependent effects mentioned in the text.
- Remove flavor, redundant restatement, and examples that do not affect rules.
- Allow paragraph restructuring, sentence merging, and concise labels.
- Preserve safe Markdown emphasis and structure; do not introduce raw HTML, links, images, URLs, scripts, or tables the app does not need.
- Use established abbreviation catalog shorts where natural; do not invent terminology.
- Keep higher-level rules in the separate `higherLevels` field whenever the source has them; do not duplicate them in both fields.
- Generate English and German independently from their localized source texts. Do not machine-translate one locale into the other.
- Do not add rules, examples, or qualifications absent from the source.
- The illustrative examples in the original change request are style references, not normative outputs.

### 9.2 Severity policy

| Severity | Definition | Effect |
|---|---|---|
| **High** | Confirmed or reasonably suspected material change to gameplay mechanics: damage, dice or quantities, targets or areas, range, duration or timing, action economy, conditions, saves, scaling, restrictions, exceptions, or component requirements. Also high: adding higher-level rules where the source has none; any uncertainty about a potentially serious rule change. | Blocks automatic acceptance; entry is withheld. |
| **Medium** | Possible ambiguity or omission, incomplete higher-level text, material restructuring that may obscure a rule, or significant compression with uncertain effect. | Auto-accepted but visible in the report. |
| **Low** | Wording, style, readability, or non-mechanical formatting. | Auto-accepted and reported. |
| **None** | No findings. | Accepted. |

- Severity is based on potential mechanical impact, never on model confidence alone.
- Equivalent representations that the deterministic normalization table resolves (`1 minute` vs `10 rounds`, `1W8` vs `1d8`, `one-half` vs `half`) produce no finding and never block acceptance.
- A confirmed deterministic `mismatch` is high. An `unresolved` deterministic item is treated as potentially serious until the semantic comparison clears it (§8.6.1), so it is never silently accepted.
- Incomplete higher-level text is **medium**, not high: the original higher-level text is preserved at apply time, so no rule is lost; the entry may be only partially shortened and is reported. This resolves the earlier open item.
- Automatically accepted and human-approved entries remain distinguishable.
- The approximately 90% automatic-acceptance ratio is an operational target to measure and report, not a gate or guarantee. No minimum percentage blocks release.

---

## 10. Build, determinism, and drift protection

| ID | Requirement |
|---|---|
| TOOL-13 | The deterministic authoring-to-runtime transform runs after SRD normalization and before the app build. It never invokes an LLM, never requires the OpenRouter key, and writes deterministic minimal sidecars. |
| TOOL-14 | A drift test asserts that committed runtime sidecars match the deterministic transform output and that no metadata leaks into runtime artifacts. |

Transform behavior:

1. Read the authoring files and the current normalized datasets.
2. Validate authoring structure, locale/file agreement, and duplicate IDs.
3. Compute current fingerprints.
4. Filter entries: include only `status: accepted` with a matching fingerprint. Authoring schema validation has already guaranteed non-empty, within-limit, safe Markdown text, so no additional content-safety filtering is applied at this step.
5. Apply the material-shortening eligibility criterion from §8.6 (item 7) to each remaining entry, using exactly the same deterministic rule the generator and validator apply. Entries that fail it stay in the authoring file as valid content and are omitted from the sidecar and reported.
6. Omit missing, stale, withheld, unknown, and non-shortening entries; report them. Schema-violating entries never reach this step because validation fails first.
7. Emit one sidecar per manifest locale, using `{}` when there is no eligible content.
8. Write all outputs atomically per file after validation succeeds (temporary file plus rename, TOOL-16).
9. Fail on malformed authoring files, schema violations, duplicate IDs, invalid locale structure, or genuine write/processing failures.
10. Do not fail on missing, stale, withheld, unknown-ID, or non-shortening entries.

The transform performs only deterministic filtering and serialization. It performs no semantic validation, no severity scoring, no model call, and no automatic text change; the material-shortening check it applies is the same deterministic character-count comparison defined in §8.6, not an additional judgment.

Drift test (TOOL-14, TOOL-19):

| ID | Requirement |
|---|---|
| TOOL-19 | The drift test pins its inputs explicitly and runs two assertions so that neither a local build nor an uncommitted content workflow can hide or fake consistency. |

Inputs used by the transform and by each assertion:

| Input | Assertion A (committed baseline) | Assertion B (working tree) |
|---|---|---|
| Authoring sources `data/short-descriptions/<locale>.json` | `git show HEAD:<path>` | file on disk |
| Normalized datasets `src/data/spells.srd*.json` | `git show HEAD:<path>` | file on disk |
| Runtime sidecars `src/data/spell-short-descriptions.<locale>.json` | `git show HEAD:<path>` | file on disk |
| Transform implementation | current working-tree code | current working-tree code |

- Assertion A recomputes the expected sidecars from the HEAD authoring files and HEAD datasets and compares them byte-for-byte with the HEAD sidecars. This is the regression gate: it is immune to `pnpm run build` rewriting the working tree, and it detects a stale sidecar after a transform-code change, because the transform code is the working-tree implementation in both assertions.
- Assertion B recomputes from the working-tree authoring files and working-tree datasets and compares with the working-tree sidecars. It reports the actionable remedy in its failure message (`pnpm run short-descriptions:build`). This is a legitimate finding, not a false failure: an uncommitted generation workflow that has written authoring files without regenerating sidecars leaves the repository inconsistent for any consumer, and running the transform is the documented workflow step, not a bypass.
- A missing path in HEAD is treated as an absent file, not an error: absent HEAD authoring means an empty authoring set; absent HEAD sidecars make Assertion A fail with a message that the sidecars are not committed yet. Stage A therefore commits the `{}` sidecars that DATA-6 requires.
- The Git baseline is required (no working-tree fallback for the golden sidecars), following `src/test/srd-dataset.test.ts`. Missing `git`, a non-repository checkout, or an unavailable object is a hard failure with an explanatory message.
- Both assertions compare the expected sidecar text with the actual sidecar file bytes (raw bytes, not parsed equality). Each assertion also asserts deterministic serialization of the expected output (sorted keys, 2-space JSON, LF, trailing newline), absence of metadata fields, and absence of key material (`sk-or-` pattern).
- Neither assertion invokes the generator, requires `OPENROUTER_API_KEY`, or performs network calls.
- After a developer commits authoring files, sidecars, and the report together, both assertions pass with no special handling. After regenerating sidecars locally without committing, Assertion B passes and Assertion A still compares HEAD against HEAD, so committed state remains verified.

The transform is linear in the number of entries and negligible compared with dataset normalization. The runtime performs no hashing and no freshness logic.

---

## 11. Failure handling and edge cases

| Scenario | Required behavior |
|---|---|
| Sidecar missing, 404, or malformed top-level JSON | Loader returns an empty map; app and editor work; action disabled. |
| One invalid sidecar entry | Skip that entry, keep valid entries, log a development diagnostic. |
| Sidecar loads after the dialog opens | Action enables when the map arrives; no blocking spinner. |
| Sidecar fetch fails offline | Action unavailable; app/editor still work. |
| Captured language sidecar absent after a UI switch | Action unavailable; no fallback. |
| Entry missing | Action disabled with the localized unavailable explanation. |
| Entry stale | Omitted from runtime until revalidation succeeds; after successful revalidation an `accepted` entry returns to the runtime, a `withheld` entry stays withheld. |
| Entry withheld for high severity | Not offered; report explains why. |
| Stale entry was already withheld | Revalidation never promotes it to `accepted`; it stays withheld until `--approve` or explicit regeneration, even when no blocking finding remains. |
| Source change is editorial | Revalidation retains text and updates the fingerprint; an `accepted` entry stays eligible, a `withheld` entry stays withheld. |
| Source change is mechanical | High severity; entry withheld; no automatic rewrite; report generated. |
| Source spell removed | Authoring entry becomes orphaned; omitted and reported; build not blocked. |
| Authoring entry with a well-formed ID absent from the dataset | Unknown/orphaned warning; omitted from the runtime sidecar; processing succeeds. |
| Authoring entry with a malformed ID | Structural error; exit code 1; diagnostic names file and `spellId`. |
| New SRD spell | No entry; action unavailable; generator can fill it later. |
| Duplicate authoring ID | Structural error; processing fails with diagnostics and exit code 1. |
| Malformed authoring JSON/schema | Structural error; build/validation fails with diagnostics and exit code 1. |
| Authoring locale absent from manifest | Structural error; processing fails. |
| Manifest locale without authoring file | Valid; sidecar `{}`; action unavailable. |
| Source has higher levels, entry omits them | Preserve original higher-level text; report incomplete entry; medium severity. |
| Source lacks higher levels, entry adds them | High severity; withhold. |
| Short entry description empty | Structural error: rejected by the authoring schema; entry cannot be committed; exit code 1. |
| Short entry description over the length limit | Structural error; exit code 1. |
| Short entry higherLevels empty/whitespace | Treat as omitted; preserve original; report. |
| Neither field materially shorter | Entry stays valid authoring content; omitted from the runtime sidecar as not runtime-eligible; reported. |
| Applying changes neither field | No-change status; no undo snapshot. |
| Applying changes both fields | One undo snapshot containing both old values. |
| Undo after abbreviation, then shortening | LIFO restores each prior state correctly. |
| Reopen saved copy | No origin; action absent; documented limitation. |
| Create copy from a non-deck SRD spell | Copy action unavailable by existing design; out of scope. |
| Create copy from a custom spell | No SRD origin; action unavailable. |
| Imported custom spell with SRD source and UUID | No sidecar key match; action unavailable. |
| Language switched while dialog is open | Session language remains captured; candidate from that language or unavailable. |
| No sidecar for selected language | Action unavailable; no English fallback. |
| Unsafe Markdown (raw HTML/link/image/script) in a generated candidate | Rejected by the Markdown-safety check; never written; reported with outcome `invalid`. |
| Unsafe Markdown in a hand-edited authoring entry | Structural error; exit code 1; diagnostic names file, `spellId`, and field. |
| Equivalent numeric/dice representation (`1 minute` vs `10 rounds`, `1W8` vs `1d8`) | Classified `equivalent`; no finding; does not block acceptance. |
| Confirmed numeric/dice mismatch | High severity; blocked from automatic acceptance; only an explicit `--approve` override recorded in the report can accept it. |
| Ambiguous numeric/dice representation outside the normalization table | Classified `unresolved`; forwarded to the judge as a required review item; withheld unless the judge reports no medium/high finding for it. |
| Very long source description | Generator may fail to shorten meaningfully; omit/report; no gate. |
| Very short source description | May be omitted when no material improvement exists. |
| English/German source shapes differ | Generate per locale independently; do not translate or assume parity. |
| User applies short text, then edits manually | Normal unsaved draft; Cancel discards; Save persists. |
| User applies short text, then abbreviation | Shared stack; undo restores the shortened text first. |
| User applies short text with unsaved manual edits | Replacement is allowed and undoable; consistent with Abbreviate. |
| Undo after a later manual edit | Undo restores the snapshotted fields, overwriting the later edit to those fields; unrelated fields untouched. |
| Generator key missing | Clear actionable error only when a model call is needed; no writes. |
| Generator key invalid/401/403 | Clear error; no retry; no writes; key not exposed. |
| Generator rate-limited/5xx/timeout | Bounded retries; if still failing, entry unchanged and reported. |
| Generator returns invalid JSON/schema | Reject; entry remains byte-identical to its previous authored content; report; exit code 2 if other entries succeeded. |
| Batch partially fails | Successful entries are committed. Failed entries keep their previous content. Summary, report, and exit code 2 state that the run was partial. |
| All selected entries complete but are withheld | Completed outcome: entries are committed as `withheld`, warnings are reported, and the run exits 0. |
| Run interrupted during model calls or checks | No target file touched; repository unchanged. |
| Run interrupted during the rename phase | Each file is either its complete old or complete new version; no partial JSON is observable. |
| `--dry-run` without key | Works; selection and deterministic validation only; no pricing lookup, no model call, no writes. |
| Selection exceeds `--max-entries` without `--ids`/`--limit` | Refuses with selection size and the `--all` instruction; no model call; no writes. |
| `--max-cost` reached mid-run | Abort before the next call; completed entries committed; exit code 2; report records the abort and usage. |
| Pricing unavailable for the selected model | Prints that cost cannot be estimated or enforced; continues only when `--max-cost` is unset; report records `unavailable`; no fabricated cost. |
| Usage absent from the provider response | Report records `unavailable` for tokens and cost; no fabricated figure. |
| Smoke command invoked without credentials | Clear actionable error; no network call; no writes. |
| Smoke command invoked without `--ids` or with `--all` | Refused; no network call; no writes. |
| Validation/transform/build/tests without key | Work; no OpenRouter call. |
| Human-approved entry becomes stale | Revalidate; never overwrite; withhold if high-risk; report. |
| Manual entry with `--regenerate` but no `--force` | Skipped and reported. |
| Manual entry with `--force` | Replaced only with explicit destructive flag; report records it. |
| Runtime artifact drift | Validation/test fails; the build transform regenerates working-tree sidecars; the HEAD-pinned assertion keeps committed state verified. |
| Sidecar path contains an unusual locale tag | URL is constructed safely; missing file → unavailable. |
| Report write failure before the rename phase | Exit code 1; nothing renamed; authoring files unchanged. |
| Report rename failure after authoring files were renamed | Exit code 2; message states authoring files were committed and the report is missing; authoring files remain valid. |
| Transform write failure | Exit code 1; each sidecar is either its previous or its new complete content; no partial sidecars. |

---

## 12. Security, privacy, and licensing

| ID | Requirement |
|---|---|
| SEC-7 | The deployed app makes no new external network calls. Sidecars are same-origin static assets. |
| SEC-8 | The authoring tool sends only bundled public SRD text and authoring instructions to OpenRouter. It never sends custom spells, decks, language preferences, or other user data. |

- No backend, Worker, API route, secret-management service, or additional infrastructure is introduced for generation.
- The key is never committed, bundled, logged, reported, or deployed. See §8.2.
- The app stores no new user data; no Dexie migration; no new localStorage key.
- The PWA cache contains only application assets and bundled sidecars; it contains no user-authored content.
- Short descriptions are derivative SRD content. Existing attribution and licensing notices remain in force; the generator MUST NOT introduce third-party copyrighted text.
- Safe Markdown rendering requirements remain unchanged.
- The privacy/storage audit MUST note that runtime sidecars are static same-origin assets cached by the existing service worker and that no user data is sent to a model by the app.

---

## 13. Documentation requirements

| ID | Requirement |
|---|---|
| DOC-1 | Add `docs/short-descriptions.md` as the authoritative source for authoring format, content conventions, generation workflow, prompts, severity rubric, reports, validation, source hashing, OpenRouter setup/cleanup (Windows PowerShell), seed/full generation, and limitations. |
| DOC-2 | Update `docs/specs/MAIN-spec.md` with user-visible editor behavior, availability, limitations, and a verification-matrix row. |
| DOC-3 | Update `docs/DEVELOPMENT.md` with new modules, scripts, build order, the copy-session provenance constraint, the OpenRouter boundary, and credential handling. |
| DOC-4 | Update `docs/custom-spells-guide.md` and `docs/custom-spells-guide.de.md` with the apply-short-description workflow and the saved-copy limitation. |
| DOC-5 | Update the compact-card Legend wording and MAIN-spec §9 so the abbreviation glossary also covers abbreviations used by applied short descriptions. |
| DOC-6 | Update the `AGENTS.md` documentation-ownership table with the new authoritative document. |
| DOC-7 | Note in the privacy/storage audit that runtime sidecars are static same-origin assets cached by the existing service worker; no user data is sent to a model by the app. |
| DOC-8 | Document the Stage A/Stage B/Stage C delivery split, the exact seed-generation commands, the manual credential setup and cleanup, and that full-dataset generation requires no code changes. |
| DOC-9 | Document the Stage B integration smoke command (§8.11): purpose, explicit invocation, credential setup/cleanup, staged-output location, the diagnostic meanings for model incompatibility, unsupported structured output, authentication failure, and API failure, and that it never runs in builds, tests, or deployment. Also document the generation and judge model settings, the entry-count and cost bounds, and the numeric normalization table from §8.6.1. |

`docs/abbreviations.md` remains authoritative for abbreviation terminology. No new abbreviations are introduced by this feature.

---

## 14. Testing requirements

| ID | Requirement |
|---|---|
| TEST-1 | Unit and integration tests cover schemas, fingerprints, transform, loader, editor, generator orchestration, validation/reporting, drift, and security separation. |
| TEST-2 | E2E tests cover the editable-copy apply/save flow, unavailable states, the saved-copy limitation, and sidecar-failure resilience against the Workers-runtime preview. |
| TEST-3 | Normal tests MUST NOT call OpenRouter, require credentials, or depend on live content. Generator tests use a mock fetch or a local mock server. |

**Unit and integration tests**

- Authoring and runtime schemas: valid, malformed, missing, extra fields, empty text, limits, duplicates, unknown IDs, locale mismatch; no `invalid` status accepted; unsafe Markdown rejected as a schema violation; a well-formed but unknown `spellId` passes the schema and is handled as a warning, while a malformed `spellId` fails the schema.
- Fingerprint: deterministic across runs; changes with description/higherLevels; ignores name/metadata; stable across JSON file formatting.
- Transform: fresh/stale/withheld/unknown/duplicate handling; deterministic serialization; metadata exclusion; one sidecar per manifest locale (`{}` when empty); atomic per-file writes; no key required; no network; schema-violating entries fail the transform instead of being silently dropped; unknown IDs are omitted with a warning; entries failing the material-shortening criterion remain in the authoring file, are omitted from the sidecar, and are reported, using the same criterion as the generator and validator.
- Stale revalidation: an `accepted` entry with no blocking finding stays `accepted` and keeps its text with an updated fingerprint; a `withheld` entry stays `withheld` even when revalidation finds nothing blocking; a blocking finding withholds an `accepted` entry; neither path rewrites text.
- Deterministic equivalence (§8.6.1): unit tests for each normalization rule and each classification. Minimum cases: `1 minute` ≡ `10 rounds`; `1 round` ≡ `6 seconds`; `1W8` ≡ `1d8` ≡ `d8`; `1d8 + 2` ≡ `1d8+2`; number words ≡ digits in both locales; `half`/`halb` relative marker not equal to a fixed number. Genuine rule changes: `1d8` vs `1d6`, `10 feet` vs `30 feet`, `1 minute` vs `1 hour`, added or removed atom — each `mismatch` and high. Metadata restatement: a candidate duration or range that only repeats the spell metadata is `equivalent`, and the same candidate without metadata is a `mismatch`; metadata never excuses a dropped source value. Locale abbreviations and representations: `10 Sek.` ≡ `zehn Sekunden`, `24 h` ≡ `24 Stunden`, `30 t` ≡ `30 Tage`, `1,6 km` ≡ `1,6 Kilometern`, `eine Minute` ≡ `1 min`, `≤ 4 von dir erschaffene Kreaturen` ≡ `vier Kreaturen`, `2 Ggstd.` ≡ `zwei Gegenstände`. Repetition: the same value with fewer repetitions is `unresolved`; a different value is `mismatch`. Ambiguous cases: unknown unit, unit ambiguous between range and radius, quantity with no resolvable dimension, a count value separated from its noun — each `unresolved`, forwarded to the judge, withheld without a judge clearance, and never auto-accepted. Table additions must carry unit tests.
- Loader: valid, 404, malformed top-level, invalid entry, per-locale cache, cache clearing, language switching, failure isolation, captured-language lookup after a UI switch, late-arriving sidecar.
- Editor: availability matrix (copy vs new/edit/SRD override), apply description only, apply both, preserve higherLevels, no-change, one snapshot, undo order in both directions, labels/status, save payload, metadata unchanged, reopened copy, cancel discards, keyboard/ARIA.
- OpenRouter adapter: mock fetch; correct URL/headers/body; separate generation and judge model resolution including shared default and flag/variable precedence; key read from `process.env`; missing key error before fetch; key absent from logs/errors/report; retries/timeouts; 401/403 no retry; 429/5xx retry; invalid JSON/schema rejection; batch fallback; dry-run no call/no key/no pricing lookup; report redaction; usage and cost reported when present and `unavailable` when absent; no fabricated figures.
- Cost protection: selection over `--max-entries` without `--ids`/`--limit` refuses; `--all` required; `--max-cost` aborts before the next call and reports partial success; pricing lookup failure or missing pricing does not fabricate a cost.
- Write semantics (TOOL-16): per-file atomic replace leaves no partial or truncated JSON when the write is interrupted (simulate a failing rename/write); a failing entry leaves its previous authored content byte-identical; partial batch yields exit code 2 with per-entry failure reasons; report rename failure after authoring commit reports the accurate state; total failure leaves all files unchanged.
- Security separation: no generator import in `src/`/`vite.config.ts`; no `OPENROUTER_API_KEY`/`VITE_OPENROUTER` in client code; build without key; `dist/` contains no generator or key material; `pnpm run build` does not invoke the generator; `wrangler`/`deploy` do not invoke it; no backend/Worker.
- Validation/report: all required conditions, the three exit codes including partial success, a run where every selected entry completes but is withheld exiting 0 with warnings, report content, atomic writes, no key/prompts, usage/cost `unavailable` representation.
- Drift: Assertion A (HEAD authoring + HEAD datasets vs HEAD sidecars) fails on mismatch and is unaffected by working-tree regeneration; Assertion B (working-tree authoring + working-tree datasets vs working-tree sidecars) fails with the transform remedy; transform-code change without regenerated sidecars is detected; metadata exclusion; deterministic serialization; no key/network; missing HEAD paths handled as documented.
- Smoke command (TOOL-18): no credentials → clear error, no network; missing `--ids` or `--all` → refused; staging path outside tracked files; not referenced by build/test/preview/deploy scripts; mocked-provider run produces the documented diagnostics for auth failure, model-not-found, unsupported structured output, invalid output, and rate limiting.

**E2E tests**

- Add an SRD spell to the deck, create an editable copy, apply a known short description, save, and verify details, preview, card, and print use the shortened text while the original SRD spell remains unchanged.
- Verify the action is disabled when no eligible entry exists.
- Verify the saved-copy reopen limitation.
- Verify the editor still opens and saves when the sidecar is missing or malformed.
- Verify the captured-language behavior after a UI language switch.
- Run against the Workers-runtime preview.
- Use a deterministic test-only sidecar fixture (for example via Playwright `page.route`) so E2E does not require production content or credentials. After the user commits the real seed batch, an additional E2E SHOULD assert a real seed entry if included (for example `srd-fireball`); it is not required for Stage A.

**Tooling test placement**

- The existing Vitest configuration includes `src/**/*.{test,spec}.{ts,tsx}` and excludes `scripts/**`. Tooling tests MUST be included by the existing configuration: either place the pure tooling modules and tests under `src/` (for example `src/tools/short-descriptions/`) and import them from `scripts/`, or extend `test.include` and remove the `scripts/**` exclusion. This is implementation discretion, but the tests must run under `pnpm run test`.

**Manual user-operated verification (Stage B/C)**

- The user runs `pnpm run short-descriptions:generate -- --show-config` with no key and confirms the resolved generation model, judge model, base URL, sources, and `NOT SET` key state, then runs `pnpm run short-descriptions:smoke -- --locale en --ids <one spell>` and `--locale de --ids <one spell>`, reviews the diagnostics, and confirms that generation, semantic comparison, schema validation, reporting, and the deterministic transform succeed with the selected models.
- The user runs the documented generation command with `OPENROUTER_API_KEY` in an isolated environment, starting with a limited batch (`--limit 20`) and checking the reported usage and cost before any full run.
- The user runs `pnpm run short-descriptions:validate`, reviews the report, and commits the authoring files, runtime sidecars, and report.
- The user runs `pnpm run build`, `pnpm run test`, `pnpm run test:e2e`, and `pnpm exec wrangler deploy --dry-run`.
- No live model calls occur in CI or normal tests; the smoke command is never wired into any of those commands.

---

## 15. Acceptance criteria

### 15.1 Stage A — implementation acceptance (no credentials)

| ID | Criterion | Traces to |
|---|---|---|
| AC-1 | In an editable-copy session launched from an active-deck SRD spell, the action is visible; it is absent for new spells, ordinary custom edits, and the SRD override editor. | FR-1, FR-2 |
| AC-2 | A known fresh entry enables the action; missing, stale, withheld, unsupported-language, loading, and sidecar-failure states disable it with an accessible localized explanation; the rest of the editor works. | FR-3, FR-4, LOAD-3, LOAD-5 |
| AC-3 | Applying a full entry replaces description and higherLevels; applying a description-only entry replaces description and preserves the current higherLevels; no metadata changes; Save persists exactly the applied text. | FR-5, FR-9, FR-10 |
| AC-4 | Applying creates one undo snapshot; consecutive abbreviation and shortening operations undo correctly in either order; labels and statuses reflect the top action; no-change applies no snapshot. | FR-6, FR-7, FR-8, FR-11 |
| AC-5 | Reopening a saved copy offers no action and the limitation is documented. | FR-12, DOC-4 |
| AC-6 | Authoring and runtime schemas match §6; the authoring schema has no `invalid` status, validates the canonical `spellId` format, and rejects malformed IDs, empty text, over-limit text, and unsafe Markdown as structural errors, while a well-formed but unknown ID is not a schema error; runtime files contain no metadata; files are sorted, deterministic, and replaced atomically per file; one sidecar exists per manifest locale (`{}` when empty). | DATA-1–DATA-6, DATA-10 |
| AC-7 | Source fingerprints change only with the selected-language description/higher-level text; editorial changes revalidate without rewriting text; an `accepted` entry remains accepted after revalidation with no blocking finding; a `withheld` entry is never promoted by revalidation; mechanical changes withhold. | DATA-7, TOOL-5 |
| AC-8 | Unknown/orphaned IDs are warnings, omitted from runtime sidecars, and do not block builds; malformed IDs, duplicate IDs, and malformed authoring files fail with diagnostics; missing entries and missing coverage never block a build. | DATA-8, DATA-9, TOOL-13, TOOL-10 |
| AC-9 | Safe Markdown is enforced; established abbreviations only; an entry failing the material-shortening criterion remains valid authoring content, is omitted from the runtime sidecar by the same deterministic criterion used by generation and validation, and is reported; the transform performs no semantic validation or model call. | DATA-1, DATA-2, TOOL-8, TOOL-13 |
| AC-10 | The selected-language sidecar is fetched and cached with the dataset; 404/malformed/partial failures produce an empty or filtered map; startup, language switching, and the editor still work; no new loading UI; the captured language remains resolvable after a UI switch. | LOAD-1–LOAD-7 |
| AC-11 | The generator is absent from app/build imports; batch, selective, missing-only, stale, regenerate, approve, dry-run, limits, timeouts, retries, and failure reporting work with a mock provider; generation and judge models are independently configurable with a shared default. | TOOL-1, TOOL-3, TOOL-4, SEC-6 |
| AC-12 | Default generation preserves existing text; stale entries revalidate in place with the transition rules of TOOL-5; human/manual entries are protected; regeneration requires explicit flags; auto and human acceptance are distinguishable. | TOOL-4–TOOL-7 |
| AC-13 | High severity blocks automatic acceptance; medium/low findings auto-accept and appear in the report; severity reflects mechanical impact, not confidence; incomplete higher-level text is medium; equivalent numeric/dice representations produce no finding; confirmed mismatches are high; ambiguous representations are never silently accepted. | TOOL-8, TOOL-9, TOOL-17, §8.6.1, §9.2 |
| AC-14 | The deterministic transform filters stale/withheld entries, applies the material-shortening eligibility criterion from §8.6 deterministically without semantic validation or model calls, runs after SRD normalization, invokes no LLM, fails on structural errors, and omits non-fatal conditions. | TOOL-2, TOOL-13 |
| AC-15 | Validation detects and reports all required conditions with the documented exit codes, including the distinct partial-success code; a run where every selected entry completes but is withheld exits 0 with warnings; the report states run outcome and per-entry failure reasons. | TOOL-10, TOOL-11 |
| AC-16 | The OpenRouter key is read only from `process.env.OPENROUTER_API_KEY`; it is never committed, bundled, logged, reported, or deployed; the committed `scripts/short-descriptions/openrouter.config.json` contains only non-secret `model`, `judgeModel`, and `baseUrl` values and rejects credential-like properties; no `.env` or `VITE_` variable is used; missing credentials fail only when a model call is needed; build/validation/transform/tests work without the key. | SEC-1–SEC-6 |
| AC-17 | No backend, Worker, API route, secret service, or additional infrastructure is introduced; the app makes no new external network calls; no LLM call occurs at runtime or in normal builds/tests; the Cloudflare static deployment is unchanged. | SEC-7, SEC-8, TOOL-12 |
| AC-18 | Documentation updates are complete and links remain valid; the Legend covers abbreviations used by applied short descriptions; the Stage B smoke command and the generation/judge model settings are documented. | DOC-1–DOC-9 |
| AC-19 | The automatic-acceptance ratio is reported; the approximately 90% target is measured but is not a release gate. | TOOL-9, TOOL-10, §9.2 |
| AC-20 | Existing unit, build, offline, print, rendering, persistence, and E2E behavior remains green; no regression in original SRD cards or custom spells. | §7.4 |
| AC-21 | The feature works against the Workers-runtime preview and the production build, with no server API, backend runtime, or secrets introduced. | §7.4, SEC-7 |
| AC-22 | Stage A does not fabricate production content; the seed, full-generation, and smoke commands are documented; the agent does not require credentials or substitute a provider. | §3.3, DOC-8 |
| AC-23 | The drift test runs both assertions: HEAD-pinned inputs are compared against HEAD sidecars, and working-tree inputs against working-tree sidecars; it fails on mismatch without invoking the generator or requiring the key. | TOOL-14, TOOL-19 |
| AC-24 | The report never contains the key, prompts, authentication headers, or user data; report writes are atomic; report content includes run outcome, models, usage, and cost-or-`unavailable`. | SEC-3, TOOL-10 |
| AC-25 | Numeric and dice comparison distinguishes equivalent representations, confirmed mismatches, and unresolved ambiguities per §8.6.1; only confirmed mismatches are unconditional high severity, and unresolved items are never silently accepted. | TOOL-17, §8.6.1, §9.2 |
| AC-26 | Multi-file writes are atomic per file only; partial batch success is explicit in exit code 2, stdout, and the report; interruption or failure leaves every target file either fully old or fully new; no existing accepted entry is silently lost. | TOOL-16, TOOL-11 |
| AC-27 | Generation and judge models are independently configurable; runs are bounded by entry count; `--all` is required for a full-dataset run; `--max-cost` aborts before the next call when pricing is available; usage and cost are reported accurately or as `unavailable`. | TOOL-15 |
| AC-28 | A manual-only Stage B smoke command exercises generation, semantic comparison, schema validation, reporting, and the deterministic transform against a small explicit spell set, emits the documented distinguishing diagnostics, never runs in builds/tests/E2E/deploy, and requires no credential access by the coding agent. | TOOL-18 |

### 15.2 Stage B/C — content delivery acceptance (user-operated, not a Stage A gate)

| ID | Criterion |
|---|---|
| AC-C1 | The Stage B integration smoke test (§8.11) succeeds for at least one English and one German spell with the selected generation and judge models, and its diagnostics report no incompatibility with the request or structured-output format. |
| AC-C2 | The seed batch of approximately 20 representative spells per locale is generated through the real pipeline (not hand-written), validated, reviewed, and committed with authoring files, runtime sidecars, and the report. |
| AC-C3 | After the seed batch is committed, E2E verifies at least one real seed entry (for example `srd-fireball` if included) while the original SRD spell remains unchanged. |
| AC-C4 | Full English and German generation uses the same documented missing-only workflow with explicit `--all`, reports usage and cost or `unavailable`, and requires no code changes; missing or withheld entries remain acceptable. |

### 15.3 Traceability summary

| Requirement group | Acceptance criteria |
|---|---|
| FR-1–FR-12 (editor behavior) | AC-1–AC-5, AC-10 |
| DATA-1–DATA-10 (data model) | AC-6–AC-9, AC-23 |
| LOAD-1–LOAD-7 (loading) | AC-10 |
| TOOL-1–TOOL-19 (tooling, validation, writes, cost, smoke, transform, drift) | AC-11–AC-15, AC-19, AC-23–AC-28 |
| SEC-1–SEC-8 (security/privacy) | AC-16, AC-17, AC-24 |
| DOC-1–DOC-9 (documentation) | AC-18, AC-22 |
| §7.4 (unchanged contracts) | AC-20, AC-21 |

---

## 16. Implementation discretion

The following are left to the implementer, provided the requirements above are preserved:

- Exact module boundaries for the loader, runtime schema, and tooling; the tooling must remain outside the app import graph.
- Exact CLI flag spelling beyond the required behaviors.
- Exact prompt wording and JSON-Schema files.
- Exact report schema beyond the required content.
- Exact localized wording, subject to established i18n conventions and key parity.
- Exact placement of the new action within the existing editor action row.
- Exact test file organization and fixture shape, subject to the Vitest inclusion constraint in §14.
- The default shared OpenRouter model constant and the optional judge-model default (must be documented and configurable).
- Default retry counts, backoff, and timeout values; the `--max-entries` default (25 recommended) and `--max-output-tokens` default.
- The exact parsing implementation of the §8.6.1 normalization table (regexes, tokenizer shape, reporting wording). The table's equivalences themselves are normative, and each entry requires a unit test.
- The exact “materially shorter” threshold (recommended 10% per field).
- The exact locale-aware term lists used by deterministic checks.
- The exact script runner (`tsx` or `vpx`), provided no new dependency is added.
- Whether to commit the review report, provided it is not a build input or drift artifact.

Not discretionary: IDs, paths, schemas, editor behavior, severity policy, credential handling, the no-backend boundary, the no-LLM boundary, and the runtime/authoring separation.

---

## 17. Superseded and resolved decisions

| Item | Resolution |
|---|---|
| Original global Full/Short display mode (Q3) | Removed. The feature is an explicit editor operation, not a display mode. |
| Q16 Codex CLI recommendation | Superseded by the user’s OpenRouter decision: a local, authoring-time Node.js CLI. OpenRouter is the only built-in concrete provider in this specification. |
| Generic `--generator-command` escape hatch | Retained as an optional, explicit escape hatch for a user-supplied compatible CLI. It is not a provider framework, is not used by default, and must not be used to substitute a provider silently. OpenRouter remains the default and only built-in adapter. |
| Q4 unavailable state | Visible but disabled in the editable-copy session; absent for new spells, ordinary edits, and the SRD override editor. |
| Unknown spell-ID severity | Warning and omitted, not fatal. Duplicate IDs and malformed files remain fatal. |
| Incomplete higher-level text | Medium severity, not high; the original higher-level text is preserved at apply time and the entry is reported. |
| Review-report location | `data/reference/short-description-review.json`; committing is optional, and the report is not a build input or drift artifact. |
| Q1 storage architecture (superseded) | Confirmed; Q11/Q18 and the authoring/runtime split govern the architecture. No separate storage decision remains. |
| Style examples | Illustrative only; not normative outputs. |
| Approximately 90% automatic acceptance | Measured and reported, not a gate. |
| CR “`srd-<index>`” | Corrected to `srd-<slug>`; IDs are identical across locales. |
| One sidecar per manifest locale | Emitted as `{}` when no eligible content; missing/404 remains non-fatal. |
| Captured-language lookup | Per-locale loader cache and per-locale AppProvider record; an open draft keeps its captured language after a UI switch. |
| Report volatility | The report may be committed as a historical record but is excluded from build, test, and drift gates. |
| “Materially shorter” | Deterministic runtime-eligibility criterion, not a schema constraint: at least 10% per replaced field by default; applied identically by generation, validation, and the transform; configurable and not a release gate. |
| `status: invalid` in the authoring file | Removed (DATA-10). Content constraints are enforced by the strict authoring schema, so schema-valid-but-corrupt entries cannot exist. `invalid` survives only as a report-only outcome label for rejected candidates; the authoring statuses are `accepted` and `withheld`. Runtime ineligibility from an unknown dataset ID or missing material shortening does not change `status` and does not imply structural invalidity. Runtime sidecar validation remains tolerant of corrupt entries because sidecars are untrusted static assets. |
| Numeric equivalence | Deterministic comparison uses a bounded, documented normalization table (§8.6.1) with `equivalent` / `mismatch` / `unresolved` outcomes. Equivalent representations such as “1 minute” and “10 rounds” do not block; confirmed mismatches are high; unresolved items require judge clearance instead of silent acceptance. No general-purpose rules engine is introduced. |
| Batch write semantics | Atomicity is per file (temporary file plus rename). There is no cross-file transaction. Partial batch success is explicit in exit code 2, stdout, and the report; no failure path leaves partial JSON or destroys previously accepted content. |
| Model configuration and cost | Generation and judge models are independently configurable with one shared default. Runs are bounded by entry count; `--all` is required for full-dataset runs; optional `--max-cost` uses a single `/models` pricing lookup; usage and cost are reported or marked `unavailable`, never fabricated. |
| Stage B model verification | Mock-only testing is insufficient to prove model compatibility, so a manual-only smoke command (§8.11) verifies the real request, structured output, validation, reporting, and transform. It never runs in builds, tests, E2E, preview, or deployment, and never needs the coding agent to hold the key. |
| Runtime drift test inputs | Two assertions: HEAD authoring + HEAD datasets vs HEAD sidecars (build-proof regression gate), and working-tree authoring + working-tree datasets vs working-tree sidecars (catches an unregenerated sidecar with the transform remedy). Transform code is always the working-tree implementation so a transform change without regenerated sidecars is detected. |

---

## 18. Approval

This specification is **not approved**. It is the proposed authoritative input for implementation planning.

Before implementation planning begins:

1. The user must explicitly approve this document.
2. The approved content should be materialized at `docs/changes/spell-short-descriptions/SPEC.md` by an implementation-capable agent (or the user may copy this plan file verbatim).
3. `CR.md` and `DECISIONS.md` remain in place as historical records and must not be deleted or overwritten.

No application implementation, generation run, or implementation plan has started. Approval of this document does not authorize live OpenRouter calls, credential access, or content generation by the coding agent.
