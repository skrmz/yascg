# Implementation Plan — Component Authoring, Localized Form Defaults, and SRD Component-Text Overrides

**Source spec:** `docs/specs/change-request-component-authoring-and-srd-overrides.md` (Rev 2)
**Application version:** `1.1.0` · **Custom-spell payload:** `1.1.0` · **Deck payload:** `1.0.0` (unchanged)
**Status:** Implementation-ready (refinements incorporated)

## Goal

Deliver the CR: author `verbalDescription`/`somaticDescription` (custom + SRD overrides), author
`materialCost`/`materialConsumed` (custom only), locale-scoped SRD override storage/merge/badge/reset,
localized form defaults + placeholders, rendering on card/details/print, and version-aware export/import.
`src/data/**`, `scripts/normalize-srd.ts`, and `src/test/srd-dataset.test.ts` must remain untouched and green.

## Confirmed decisions

- **Import validation = fail-fast.** `analyzeCustomImport` validates every override record, collects **all**
  identifiable errors (record index, `spellId`, `locale`, reason), and aborts the entire import if any record is
  invalid — no custom spells or overrides are modified. Valid changes (custom spells + overrides) apply in **one
  Dexie transaction**. Empty override records are **no-ops** (never stored, existing local record untouched).
  Matching keys keep **last-imported-value-wins**; `updatedAt` is regenerated locally. Unknown future versions
  with recognizable dropped fields set `lossy: true`, list what would be lost, and require explicit confirmation;
  overrides are never silently discarded.
- **Persistence-boundary validation.** A single shared `validateSrdOverride` helper enforces canonical SRD
  identity, supported locale, and component eligibility for **both** UI writes and imports. Invalid override
  records are never stored. UI "both descriptions empty" = delete; import "empty override record" = no-op.
- **No i18next runtime in the DB layer.** Localized draft defaults are resolved by a pure, typed helper over the
  existing EN/DE locale resources (no `@/i18n.ts` import, no duplicated strings).
- **Markers are explicit, never silently dropped.** `parseSpellBody` requires localized component markers, so an
  incomplete call site is a type error rather than a silent omission of authored component text.
- **SRD form fields are read-only via disabled inputs / static text.** `MultiSelect` has no `disabled` prop, so
  in SRD mode classes render as static `classSummary(spell.classes, t)` text (no `MultiSelect` change needed).

## Ordered tasks

### 1. Domain (`src/domain/spells.ts`)
1. Add transient `overridden?: boolean` to `Spell`. It is intentionally **not** added to `spellSchema`
   (which is a non-strict `z.object`, so unknown keys are stripped → never persisted/exported).
2. Add `srdSpellOverrideSchema` + `SrdSpellOverride`:
   - `spellId`: `trimmedNonEmpty(LIMITS.NAME_MAX)`
   - `locale`: `z.string().trim().min(2).max(35)`
   - `verbalDescription` / `somaticDescription`: `optionalMeta` (trim, ≤ `META_MAX`)
   - `updatedAt`: `z.number().int().nonnegative()`
3. Keep `spellComponentsSchema` unchanged (fields already exist).
4. Tests (`src/domain/spells.test.ts`): `overridden` is stripped by `spellSchema.parse`; override schema
   accepts/rejects per bounds.

### 2. Shared override validation (`src/domain/srd-overrides.ts`, new)
Extract validation so UI writes and imports use identical rules.

- `export interface SrdOverrideValidationContext { srdSpellsById: ReadonlyMap<string, Spell>; supportedLocales: readonly string[] }`
- `export interface SrdOverrideInput { spellId: string; locale: string; verbalDescription?: string; somaticDescription?: string }`
- `export function validateSrdOverride(input, context): { ok: true; value: SrdSpellOverrideInput } | { ok: false; errors: string[] }`
  - `spellId` must be a reserved `srd-` id (`isReservedSrdId`) **and** present in `srdSpellsById` (canonical SRD identity).
  - `locale` must be in `supportedLocales`.
  - only `verbalDescription` / `somaticDescription` allowed (reject other keys).
  - lengths ≤ `META_MAX` after trim (reuse `spellComponentsSchema` bounds).
  - **eligibility:** a description is present only for a component that is `true` on the canonical spell
    (`srdSpellsById.get(spellId).components`).
  - Trims values; drops empty strings.
- Tests for the helper (identity, locale, eligibility, over-length).

### 3. DB (`src/db/`)
1. `database.ts`: add `srdSpellOverrides!: Table<SrdSpellOverride, [string, string]>` and an additive
   `this.version(2).stores({ customSpells: "id, name, updatedAt", savedDecks: "id, updatedAt", activeDeck: "id",
   srdSpellOverrides: "[spellId+locale], spellId, locale" })`. Existing tables/data retained.
2. New `src/db/srd-overrides.ts`:
   - `listSrdOverrides(): Promise<SrdSpellOverride[]>`
   - `getSrdOverride(spellId, locale)`
   - `putSrdOverride(input, context): Promise<SrdSpellOverride | null>` — runs `validateSrdOverride`; on failure
     throws (never stores invalid data). If both descriptions are empty after trim → `deleteSrdOverride` and
     return `null` (UI clearing). Otherwise `updatedAt: Date.now()` + `put`.
   - `deleteSrdOverride(spellId, locale): Promise<void>`
   - `applySrdOverrides(spells, overrides): Spell[]` — pure merge: returns the same array when no match;
     otherwise a shallow-copied spell with `overridden: true` and copied `components` with the override
     descriptions applied. Apply a description only when the canonical component boolean is enabled; mark
     `overridden` only when a valid record applies. Never mutate inputs (protects the `load.ts` dataset cache).
   - `indexOverridesByLocale(overrides): Map<string, Map<string, SrdSpellOverride>>`
3. `notifications.ts`: extend `ChangeKind` with `"srd-overrides"`.
4. Tests: `db.test.ts` — v1→v2 migration preserves data; `srd-overrides.test.ts` — CRUD, invalid writes
   rejected (identity/locale/eligibility/over-length), empty→delete, and merge (per-locale, gating,
   `overridden` true/false).

### 4. State (`src/state/AppProvider.tsx`)
1. `const srdOverrides = useLiveQuery(() => listSrdOverrides().catch((e) => reportQueryFailure("SRD overrides", e, [])), [refreshToken]) ?? []`.
2. Memoize `indexOverridesByLocale`; compute merged `englishSpells = applySrdOverrides(datasets.en ?? [], index.get("en"))`
   and `languageSpells = applySrdOverrides(datasets[language] ?? [], index.get(language))`. Merge **after** dataset
   parsing and **before** `englishById`/`languageById`/`librarySpells`. English fallback gets `en` overrides only.
3. Expose on context: `srdSpellOverrides: SrdSpellOverride[]`, and
   `saveSrdOverride(input): Promise<SrdSpellOverride | null>` / `resetSrdOverride(spellId, locale): Promise<boolean>`.
   `saveSrdOverride` passes `{ srdSpellsById: englishById, supportedLocales: manifest.map((m) => m.code) }` into
   `putSrdOverride` and surfaces validation failure via `setDeckError`. Both then `publishChange("srd-overrides")`
   + `refreshAll()` (mirrors `saveCustomSpell`).
4. Keep `datasets` state override-free so merges stay derived and re-derivable (and `overridden` never persists).

### 5. i18n (`src/locales/en.ts`, `de.ts`, `labels.ts`)
1. New keys (EN / DE), `de` via `satisfies Translations`:
   - `form.verbalDescription` / `form.somaticDescription`
   - `form.advanced` ("Advanced / Optional" / "Erweitert / Optional")
   - `form.materialCost` / `form.materialConsumed`
   - `form.resetToOriginal`
   - `form.descriptionSrd`
   - `form.default.castingTime` / `.range` / `.duration` → EN `1 Action`/`Self`/`Instantaneous`, DE `1 Aktion`/`Selbst`/`Unmittelbar`
   - `form.placeholder.castingTime` / `.range` / `.duration` → per spec R4 EN/DE strings
   - `component.marker.verbal` (`ⓥ`), `component.marker.somatic` (EN `ⓢ` / DE `ⓖ`)
   - `spell.metadata.materialConsumed`
   - `source.srd` (`SRD 5.2.1`), `source.custom` (`Custom` / `Eigen`)
2. `labels.ts` (pure — value-imports `en`/`de`, no i18next runtime):
   - `COMPONENT_MARKER_KEYS` + `componentMarkerKey(kind)`
   - `SOURCE_KEYS` + `sourceKey(source)`
   - `sourceLabelText(spell, t)` → `(spell.sourceLabel ?? t(sourceKey(spell.source))) + (spell.overridden ? " *" : "")`
   - `customSpellDraftDefaults(language): { castingTime: string; range: string; duration: string }` — selects
     `de.form.default` when `language === "de"`, else `en.form.default` (single source of strings).
   - `componentMarkers(language): { verbal: string; somatic: string }` — selects `de`/`en`
     `component.marker.*` (pure; usable in non-React paths and tests). React call sites may use
     `t(componentMarkerKey(...))` instead.
3. Tests (`locales.test.ts`): new keys/markers, `sourceLabelText`, and `customSpellDraftDefaults("en"|"de")`.

### 6. Markdown (`src/markdown/parse.ts`)
1. Add `componentDescriptionBlocks(spell, markers: { verbal: string; somatic: string }): ParagraphBlock[]` —
   for each of verbal→somatic, when the component boolean is `true` and the trimmed description is non-empty,
   push a paragraph whose children are a single `{ type: "text", value: `${marker} ${desc.trim()}` }` (built
   directly, not via `marked`).
2. `parseSpellBody(spell, higherLevelsHeading, markers)`: widen `spell` to include optional `components`; make
   `markers` a **required** third parameter; append `componentDescriptionBlocks` after description + higher levels.
3. **Call-site audit (required markers):** update every call site so markers are always supplied:
   - `src/cards/fit.tsx` `useCardFit` (line ~141) and `useDeckCardFits` (line ~247) — pass
     `{ verbal: t(componentMarkerKey("verbal")), somatic: t(componentMarkerKey("somatic")) }`, and add `markers`
     to memo/effect deps and to the deck `signature`.
   - `src/components/details/DetailsPane.tsx` textual section — reuse `componentDescriptionBlocks` (or
     `parseSpellBody`) with markers from `t`.
   - Print path has no direct call: `PrintDialog`/`PrintSheet` consume `useDeckCardFits` output (covered above).
   - Update tests `src/cards/fit.i18n.test.ts` and `src/markdown/parse.test.tsx` to pass markers.
4. Tests (`parse.test.tsx`): ordering (description → higher → verbal → somatic), marker text, gating by boolean,
   omission when disabled/empty.

### 7. Card (`src/cards/Card.tsx`, `src/cards/fingerprint.ts`)
1. `CardView` footer: replace `{spell.sourceLabel ?? spell.source}` with `{sourceLabelText(spell, t)}`.
2. Material-detail line (R5.1): render only when `components.material === true`; compose description, then
   `materialCost`, then a localized `spell.metadata.materialConsumed` qualifier **only when
   `materialConsumed === true`**; suppress empty parentheses/separators. Include its height in measurement by
   wrapping the material line **and** the body in a measured container carrying `bodyRef` (move the flex/
   `min-height:0`/`overflow:hidden` of `.card-body` to the wrapper in `print.css`, keeping `.card-body` inside).
   `componentsDisplayOverride` still controls only the compact summary.
3. Bump `CARD_STYLE_VERSION` in `fingerprint.ts` (layout/style change).

### 8. Details pane (`src/components/details/DetailsPane.tsx`)
1. Show **Edit** for SRD too (remove the `isCustom` gate on Edit); keep Duplicate/Delete custom-only.
2. Render `CustomSpellForm` for both modes (drop the `isCustom ? … : null` wrapper), passing `spell`.
3. Badge: `<SourceBadge source={spell.source} overridden={spell.overridden} />`.
4. Textual section: append `componentDescriptionBlocks(spell, markers)` (markers via `t`) after the existing
   description/higher-levels `BlockList`s — same helper, ordering, markers, gating as the card preview.
5. Material row: gate on `spell.components.material`; append cost + consumed qualifier consistently with the card.

### 9. Form (`src/components/details/CustomSpellForm.tsx`, `src/db/custom-spells.ts`)
1. `createCustomSpellDraft(language = "en")` seeds `castingTime`/`range`/`duration` from
   `customSpellDraftDefaults(language)` (`src/locales/labels.ts`). **No `@/i18n.ts` import** in
   `src/db/custom-spells.ts`. Other fields unchanged.
2. `DraftState` + `toDraft`: add `verbalDescription`, `somaticDescription`, `materialCost: string`,
   `materialConsumed: boolean`.
3. **Locale-safe editing:** on open, capture both the session locale **and**, for SRD mode, the spell ID into
   session state (set in the `open` effect; the live `language` value must not be a dependency that resets the
   draft). Build `base` from `spell ?? createCustomSpellDraft(sessionLanguage)`. A locale change while the form
   is open must not reset, replace, or overwrite a dirty draft; editing an existing spell never applies defaults.
4. Placeholders on Casting Time / Range / Duration inputs via `t("form.placeholder.*")`.
5. V/S description `Input`s, rendered only when the matching boolean is checked; unchecking retains the value
   (keep-but-hide). Persist each description when non-empty (never clear on uncheck).
6. Material block: keep `materialDescription`; add a `Collapsible` "Advanced / Optional" (`defaultOpen={false}`,
   reachable only when `draft.material`) containing `materialCost` (Input) + `materialConsumed` (Checkbox).
   On custom submit, include `materialDescription`/`materialCost` when non-empty and `materialConsumed: true`
   when checked (mirror existing omission style).
7. **SRD mode** (`spell?.source === "SRD-5.2.1"`):
   - All standard fields read-only/disabled (name, level, school, casting time, range, duration,
     concentration/ritual, component booleans, material fields, classes → static text, description,
     higher levels). Only `verbalDescription`/`somaticDescription` editable, gated by the canonical booleans.
   - Draft seeded from the passed (merged) spell → existing descriptions preserved unless cleared.
   - Save → `saveSrdOverride({ spellId: capturedSpellId, locale: capturedLocale, verbalDescription, somaticDescription })`,
     including a description only for enabled components; both empty → deletes the override. Never call
     `saveCustomSpell`, never change `source`, never create/convert the `srd-*` id.
   - **Reset to original** shown when `spell.overridden === true`; calls
     `resetSrdOverride(capturedSpellId, capturedLocale)`, then closes.
   - Dialog `description` uses `t("form.descriptionSrd")`; footer = Cancel · Reset (conditional) · Save.
   - Save/reset target the **captured** spell ID + locale even if the app language changes while open.
8. `useApp()` in the form adds `language`, `saveSrdOverride`, `resetSrdOverride` (keeps `saveCustomSpell`,
   `selectSpell`).

### 10. Payloads & IO (`src/domain/payloads.ts`, `src/io/export.ts`, `src/io/import-custom.ts`)
1. `payloads.ts`: keep `EXPORT_VERSION = "1.0.0"` for decks; add `CUSTOM_SPELL_EXPORT_VERSION = "1.1.0"`.
   - Rename `spellExportPayloadSchema` → `customSpellExportPayloadSchemaV1` (`z.literal("1.0.0")`).
   - Add `srdSpellOverrideExportSchema = z.strictObject({ spellId, locale, verbalDescription?, somaticDescription? })`
     (no `updatedAt`; strict → rejects extra fields, satisfying "only V/S present").
   - Add `customSpellExportPayloadSchemaV2` (`z.literal("1.1.0")`, `spells`, `srdSpellOverrides?`), plus
     `CustomSpellExportPayloadV2`. Update usages of the old name.
2. `export.ts`: `buildCustomSpellsPayload(spells, overrides = [])` stamps `CUSTOM_SPELL_EXPORT_VERSION` and
   always includes `srdSpellOverrides` (mapped export shape, `updatedAt` omitted; may be `[]`). Export only
   override records — never merged SRD spells or the `overridden` marker.
3. `import-custom.ts`:
   - Signature: `analyzeCustomImport(text, existing, options?: { srdSpellsById?: ReadonlyMap<string, Spell>; supportedLocales?: readonly string[] })` (existing 2-arg calls keep working).
   - **Dataset readiness:** when a payload contains override records, require `srdSpellsById` (non-empty) and a
     non-empty `supportedLocales`. If either is missing/empty, return `ok:false` with a distinct
     "SRD validation data is not loaded yet" error — **never** treat an unavailable dataset as an empty
     authoritative lookup (which would misreport real spell IDs as unknown).
   - Known versions `{"1.0.0","1.1.0"}`. `1.0.0` → V1 (no overrides; leave local overrides untouched).
     `1.1.0` → V2 (must **not** use the unknown-version fallback).
   - **Unknown versions:** best-effort spell extraction as today; collect **all recognizable dropped fields**
     (unrecognized top-level keys + a non-empty `srdSpellOverrides` + unrecognized fields inside records) into
     `lossyFields: string[]` / `droppedOverrides: number`; set `lossy: true`; do **not** apply them.
   - Override validation per record via `validateSrdOverride` (shared with the DB layer); collect **all** errors
     as `{ index, spellId, locale, reason }`; empty records (no descriptions after trim) → no-op drop (not
     persisted, not deleted). If any error → `ok:false`.
   - Plan additions: `overrides` (validated, locale-scoped; `updatedAt` generated at apply), `lossy`,
     `lossyFields`, `droppedOverrides`. Within-file duplicate `[spellId+locale]` → last wins.
   - `applyCustomImport`: transaction covers `db.customSpells` **and** `db.srdSpellOverrides`; upsert overrides
     by `[spellId+locale]` with `updatedAt: Date.now()` (last-write-wins). Extend `CustomImportCounts` with
     `overrides`. Custom-spell collision aborts still reject the whole batch.
4. `ImportExportDialog.tsx`:
   - Gate import analysis on readiness: disable the custom-import control while `dataLoading`, and when
     `dataError` or `manifest.length === 0` or `englishById.size === 0` show the load error and do not analyze
     (no "unknown spell id" false positives).
   - Pass `{ srdSpellsById: englishById, supportedLocales: manifest.map((m) => m.code) }` into analysis.
   - Export reads `srdSpellOverrides` from context; preview/summary distinguish custom spells vs overrides;
     when `plan.lossy`, show the reported dropped fields/count and require explicit confirmation before commit.
5. `package.json`: bump `"version"` to `"1.1.0"`; update `pnpm-lock.yaml` only if it records the root package
   version (otherwise no lockfile change).
6. Tests: version split (custom exports `1.1.0`, deck exports `1.0.0`); V2 round-trip incl. overrides; `1.0.0`
   import leaves overrides unchanged; absent vs empty array; unknown-version lossy reporting + confirmation;
   override validation (unknown id, unsupported locale, disabled-component, over-length, empty no-op) reporting
   all errors and aborting; dataset-not-ready error; atomic commit.

### 11. Badge (`src/ui/Badge.tsx`)
1. `SourceBadge({ source, overridden })` renders via `sourceLabelText` (using `useTranslation`) so an overridden
   SRD spell reads `SRD 5.2.1 *`.

### 12. Tests (new/updated)
- Unit/integration: override merge per locale (EN fallback uses EN only) + `overridden` marker; CRUD + reset
  (current spell/locale only); export/import round-trip + all import-validation cases from §10.6;
  `createCustomSpellDraft(language)` defaults + placeholders; `de` key parity; cross-tab override reactivity
  (`ChangeKind` + `useLiveQuery`).
- Rendering (`Card.i18n.test.tsx`, `fit.i18n.test.ts`, `DetailsPane.test.tsx`, `CustomSpellForm.test.tsx`):
  `ⓥ`/`ⓢ`/`ⓖ` only when the flag is true; keep-but-hide; material rendering (M off, `componentsDisplayOverride`
  set, no empty separators, qualifier only when consumed); form locale change does not lose a dirty draft; SRD
  edit/save/reset creates no custom spell, preserves canonical identity, targets the captured spell+locale; SRD
  badge shows `*`.
- **Card-fitting regression coverage (refinement 8):** long `materialDescription` + long `materialCost` combined
  with `verbalDescription` + `somaticDescription`, exercised in **both** `auto-shrink` and `multi-card` modes,
  asserting: blocks appear in the correct order (description → higher → verbal → somatic), each component block
  appears **exactly once** (including across continuation cards), no overflow, and the material line is inside the
  measured region. Add a print-path assertion that `PrintSheets`/`CardView` output contains the component markers
  and material details.
- Update existing mocks (`DetailsPane.test.tsx`, `CustomSpellForm.test.tsx`, `LibraryPane.test.tsx`) to supply the
  new context fields (`language`, `saveSrdOverride`, `resetSrdOverride`, `srdSpellOverrides`, `englishById`,
  `manifest`).

### 13. Docs
- `README.md`: export format (custom payload `1.1.0` with SRD overrides; deck payload remains `1.0.0`) and
  Limitations (SRD component-text notes are local and language-scoped).
- `docs/srd-data-pipeline.md` (§5): note `verbalDescription`/`somaticDescription`/`materialCost`/
  `materialConsumed` are now surfaced in the UI, and for SRD are stored as local overrides rather than in
  `src/data/**`.

## Risks / notes
- **Measurement coupling (R5.1):** material line must be inside the measured region. Wrapping the material line
  and `.card-body` under `bodyRef` is the recommended remedy; verify with a long material line in both fit modes.
- **Fit cache:** component text is inside `blocks`, so `JSON.stringify(blocks)` already fingerprints it; locale
  is already in `fitCacheKey`. Adding `markers` to deps is required; no new fingerprint field.
- **Draft re-seeding (R4):** capture locale + spell ID at open; never add live `language` to the reset deps.
- **Dataset mutation:** `applySrdOverrides` must copy, not mutate (the `load.ts` dataset cache is shared).
- **Dataset readiness:** the import path must distinguish "SRD data not loaded" from "unknown spell id".
- **Badge/`overridden` plumbing:** transient only — excluded from `spellSchema`, imports, and exports.
- **Version split regression:** keep `EXPORT_VERSION` on decks; custom-spell writer/reader move to
  `CUSTOM_SPELL_EXPORT_VERSION`; do not route `1.1.0` through the unknown-version fallback.
- **Import atomicity:** overrides and custom spells in one transaction; any validation error aborts everything.
- **SRD locale semantics:** overrides are per-language; a `de` note is not shown in the `en` view.

## Validation
1. `vp check` (format, lint, type check).
2. `vp test` (full unit/component suite, including the drift gate `src/test/srd-dataset.test.ts`).
3. Affected E2E per `AGENTS.md` (`pnpm test:e2e`) for form/print behavior changes.
4. Manual smoke: author V/S on a custom spell and an SRD spell; verify card/details/print (incl. multi-card),
   badge `*`, reset, and a custom-spell export/import round-trip incl. overrides.
5. Report any failures, deviations, or unresolved issues.

## Out of scope (per spec)
Editing any other SRD mechanic; authoring `componentsDisplayOverride`; changing bundled datasets,
`scripts/normalize-srd.ts`, or the drift test; deck payload/behavior; app chrome/library/deck-pane localization.
