# SRD Raw Source Data Refactoring

Status: **implemented** — all MANDATORY items landed. The §18 open items were resolved as follows: the damage-type vocabulary lives in `src/domain/spells.ts` (`DAMAGE_TYPES`, with `DAMAGE_TYPE_KEYS` derived via `satisfies`); `scripts/srd/german.ts`, `GERMAN_CLASS_BY_NAME`, the `de` adapter branch, `scripts/convert-german-srd.ts`, `src/test/german-conversion.test.ts` and the `convert:german-srd` script were removed.
The §3 evidence and §16 sequence below describe the pre-refactoring state and plan of record; current behavior is documented in `docs/DEVELOPMENT.md`, `docs/srd-data-pipeline.md`, and the project overview in `README.md`.
Scope: raw SRD source JSON simplification + lossless optional `subclasses` support.
Out of scope: populating subclass assignments (separate later phase), subclass UI/filtering, and any change to normalized runtime behavior.

**Phase 2 landed.** The "separate later phase" referred to above is complete: subclass assignments were populated from `data/reference/srd-spells-2024_extended-props.json` via `scripts/migrate-srd-subclasses.ts`, `CORE_CLASSES` was widened from 8 to 12, and localized subclass labels were added under `src/locales/`. See `docs/subclasses.md`, `docs/srd-data-pipeline.md` §2.G, and the committed report `data/reference/subclass-reconciliation.json`. This document is retained as the historical Phase-1 specification.

This document is an implementation specification. It is intentionally detailed so a separate coding agent can implement it without re-deriving the architecture. Every "MANDATORY"/"OPTIONAL" marker is normative.

---

## 1. Background and motivation

The raw SRD inputs in `data/srd/` (`srd-spells-2024.json`, `srd-spells-2024_de.json`) mirrored the upstream 5e-bits 2024 JSON shape at the time of writing (see the Status note: the checked-in sources now use the canonical shape), which nests redundant reference objects:

```json
"school":   { "index": "evocation", "name": "Evocation", "url": "/api/2024/magic-schools/evocation" },
"classes":  [ { "index": "wizard", "name": "Wizard", "url": "/api/2024/classes/wizard" } ],
"damage":   { "damage_type": { "index": "acid", "name": "Acid", "url": "/api/2024/damage-types/acid" } },
"url":      "/api/2024/spells/acid-arrow"
```

The normalizer already resolves all of these to canonical scalar values (`school: "Evocation"`, `classes: ["Wizard"]`, `damageTypes: ["acid"]`). The `index`, `name`, and `url` sub-fields are therefore either redundant or unused. Simplifying the raw source reduces authoring/review overhead and removes dead fields while keeping the normalized `Spell` schema and runtime behavior unchanged.

The refactor also introduces an optional `subclasses` raw field with lossless support so that a **later, separately specified phase** can populate subclass assignments from the reference dataset without another raw-schema change.

## 2. Goals and non-goals

### Goals (MANDATORY)
1. Simplify raw `school`, `classes`, and `damage.damage_type` to canonical scalars/strings.
2. Remove the unused top-level spell `url`. 
3. Introduce optional raw `subclasses` with validation, normalization, and a minimal optional `subclasses?: string[]` runtime field (lossless preservation).
4. Provide a safe, deterministic, one-time TypeScript migration tool for the two known source files.
5. Keep normalized runtime datasets (`src/data/spells.srd*.json`) **byte-identical** to the current committed output.
6. Decide the canonical-English-snapshot question and, if removed, preserve equivalent drift protection elsewhere.
7. Relocate the extended-props reference file out of the active input directory.

### Non-goals (explicitly out of scope)
- **Components and material** are unchanged: `components` stays a `V`/`S`/`M` letter array plus an optional `material` string. The extended-props combined component string (`"V, S, M (...)"`) is NOT adopted.
- **`description` / `higher_level`** shapes are unchanged (plain string or string array).
- **`damage.damage_at_slot_level` and `attack_type` are preserved verbatim** (see §8).
- No subclass data is populated, inferred, merged, or copied from the reference dataset.
- No subclass UI, filtering, editing, deck behavior, or localization catalog.
- No changes to `CORE_CLASSES`, `SPELL_SCHOOLS`, or the eight-class scope.
- No change to custom-spell authoring, deck identity, or print behavior.

## 3. Verified current architecture (evidence)

Verified by code inspection and read-only execution against the current working tree.

### 3.1 Two representations
- Raw SRD source: `data/srd/*.json` (array of 5e-bits-shaped entries).
- Normalized runtime `Spell` schema: `src/domain/spells.ts:50` (`Spell`) and `src/domain/spells.ts:114` (`spellSchema`). It already uses string `school` (`SPELL_SCHOOLS`), `classes: CharacterClass[]`, and free `damageTypes: string[]`.

### 3.2 Adapter selection
`scripts/srd/english.ts:150` `isCanonicalSourceShape` probes each entry for a string `index`, an object `school.index`, `classes[]` objects each with a string `index`, and `components` limited to `V`/`S`/`M`.

`buildSrdArtifacts` (`scripts/normalize-srd.ts:113-127`) uses the shared adapter (`normalizeSharedTranslation` → `normalizeEnglish`) when the probe passes, the German adapter (`normalizeGerman`) only for `de`, and otherwise fails.

**Verified finding (discrepancy with docs):** `isCanonicalSourceShape` returns `true` for BOTH current files, so `srd-spells-2024_de.json` is normalized by the **shared** adapter, not `scripts/srd/german.ts`. The German file uses `V`/`S`/`M` (no `G`), English canonical class indices (`wizard`, …) and canonical school indices. `german.ts` and `GERMAN_CLASS_BY_NAME` (`scripts/srd/common.ts:35`) are therefore **dead code for checked-in data**. README ("German adapter: maps `G` … German class names") and `docs/srd-data-pipeline.md` §2.C describe behavior that the checked-in data does not use.

### 3.3 Snapshot
`scripts/normalize-srd.ts:59-89` `verifyOrCreateSnapshot` compares `JSON.stringify(normalizedEnglish, null, 2)` against `data/srd/canonical-english.snapshot.json`. Default path: `scripts/normalize-srd.ts:102-103`.
Called from `buildSrdArtifacts` at line 104. `allowSnapshotCreation` defaults to `true`, so a missing snapshot is silently created rather than failing.

**Verified:** the snapshot is byte-identical (after re-serialization) to normalizing the current `data/srd/srd-spells-2024.json`, and it is the same data as the committed `src/data/spells.srd.json` (which is `JSON.stringify(normalizedEnglish)`). The snapshot is therefore a **duplicate of a committed artifact**.

`src/data/spells.srd.json`, `src/data/spells.srd.de.json`, and `src/data/spell-languages.json` are git-tracked. `git status` shows them unmodified while the raw sources are untracked.

### 3.4 Field consumers
- Top-level `url`: unused by normalization. Only referenced by `scripts/convert-german-srd.ts` (structural clone) and tests (`src/test/german-conversion.test.ts:63`). Not consumed at runtime (`src/services/data/load.ts:55` `url` is a dataset fetch URL; `src/markdown/parse.ts:92` is a marked link token). 
- `school.index` / `classes[].index` / `damage.damage_type.index`: only the adapters and   `convert-german-srd.ts`.
- `damage.damage_at_slot_level` / `attack_type`: **no consumer anywhere**.
- `subclasses`: **no consumer anywhere**; the normalized schema has no such field.

### 3.5 Runtime / persistence touchpoints
- Dataset load + validation: `src/services/data/load.ts:122` (`z.array(spellSchema)`).
- Custom spell persistence re-validates via `spellSchema` (`src/db/custom-spells.ts:42-57`).
- Export/import envelope: `src/domain/payloads.ts:15` strict envelope, non-strict spells (spells are parsed by `spellSchema`, so unknown keys are stripped, known keys round-trip). 
- Class filter options: `CORE_CLASSES` + `deriveClassOptions` (`src/components/library/LibraryPane.tsx:86`, `src/services/data/search.ts:120`).
- Localization: `src/locales/labels.ts` (school/class/damage-type keys), `src/locales/{en,de}.ts`.

### 3.6 Live blocker
`data/srd/srd-spells-2024_extended-props.json` matches the translation filename pattern (`scripts/srd/discovery.ts:5`) with raw tag `extended-props`; `Intl.getCanonicalLocales` returns it unchanged and the BCP 47 regex (`discovery.ts:44`) rejects it, so `discoverSrdInputs` **currently throws**. `pnpm run normalize:srd` / `pnpm run build` cannot run until this file is relocated.

## 4. Final raw source JSON schema

Applies to `data/srd/srd-spells-2024.json` and every `data/srd/srd-spells-2024_<bcp47>.json`. The top level remains a bare JSON array.

| Field                         | Presence        | Value                                                                                  |
| ----------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| `index`                       | required        | upstream slug; unchanged; determines `id: "srd-<index>"`                               |
| `name`                        | required        | localized free text; unchanged                                                         |
| `level`                       | required        | integer 0–9; unchanged                                                                 |
| `school`                      | required        | **string**: canonical English school name, one of `SPELL_SCHOOLS` (`"Evocation"`, …)   |
| `classes`                     | required        | **string array**: canonical English `CORE_CLASSES` names; unique                       |
| `subclasses`                  | optional        | **string array**: each `"<Class>: <Subclass>"`; see §6; unique                         |
| `casting_time`                | required        | unchanged                                                                              |
| `range`                       | required        | unchanged (must not contain `component`/`komponente`)                                  |
| `components`                  | required        | **unchanged**: `V`/`S`/`M` letter array; at least one                                  |
| `material`                    | optional        | unchanged                                                                              |
| `duration`                    | required        | unchanged                                                                              |
| `concentration`               | required        | unchanged (missing → `false`)                                                          |
| `ritual`                      | required        | unchanged (missing → `false`)                                                          |
| `description`                 | optional        | unchanged (string \| string[]; missing → `[""]`)                                       |
| `higher_level`                | optional        | unchanged (string \| string[]; `higher_levels` accepted as alias)                      |
| `damage`                      | optional        | object; `damage_type` is now a **string**; `damage_at_slot_level` preserved if present |
| `damage.damage_type`          | within `damage` | **string**: canonical lowercase damage slug (see §7)                                   |
| `damage.damage_at_slot_level` | optional        | **preserved verbatim**; ignored by normalization                                       |
| `attack_type`                 | optional        | **preserved verbatim**; ignored by normalization                                       |
| `url`                         | **removed**     | must not appear in migrated output                                                     |

Removed relative to the legacy shape: top-level `url`; `school` object → string; `classes[]` objects → strings; `damage.damage_type` object → string.

### 4.1 Before / after example (`acid-arrow`)

Before:

```json
{
  "index": "acid-arrow",
  "url": "/api/2024/spells/acid-arrow",
  "name": "Acid Arrow",
  "level": 2,
  "school": { "index": "evocation", "name": "Evocation", "url": "/api/2024/magic-schools/evocation" },
  "classes": [ { "index": "wizard", "name": "Wizard", "url": "/api/2024/classes/wizard" } ],
  "casting_time": "Action",
  "ritual": false,
  "range": "90 feet",
  "components": ["V", "S", "M"],
  "material": "powdered rhubarb leaf",
  "duration": "Instantaneous",
  "concentration": false,
  "attack_type": "ranged",
  "damage": {
    "damage_type": { "index": "acid", "name": "Acid", "url": "/api/2024/damage-types/acid" },
    "damage_at_slot_level": { "2": "4d4" }
  },
  "description": "A shimmering green arrow...",
  "higher_level": "The damage ... increases by 1d4 ..."
}
```

After:

```json
{
  "index": "acid-arrow",
  "name": "Acid Arrow",
  "level": 2,
  "school": "Evocation",
  "classes": ["Wizard"],
  "casting_time": "Action",
  "ritual": false,
  "range": "90 feet",
  "components": ["V", "S", "M"],
  "material": "powdered rhubarb leaf",
  "duration": "Instantaneous",
  "concentration": false,
  "attack_type": "ranged",
  "damage": {
    "damage_type": "acid",
    "damage_at_slot_level": { "2": "4d4" }
  },
  "description": "A shimmering green arrow...",
  "higher_level": "The damage ... increases by 1d4 ..."
}
```

A spell with subclass availability (illustrative; not present in current SRD data):

```json
{
  "index": "example",
  "school": "Necromancy",
  "classes": [],
  "subclasses": ["Cleric: War"],
  "damage": { "damage_type": "necrotic" }
}
```

Note: `Cleric: War` is valid even though `classes` does not contain `"Cleric"` — subclass availability is independent of general class availability (§6).

### 4.2 Deterministic serialization
Migrated files keep 2-space indentation, LF line endings, and a trailing newline (`}\n]\n`), matching the current files. Entry order and property order are preserved (`url` removed in place; transformed values replaced in place; `subclasses` inserted only when present).

## 5. Canonical class and school semantics

- **School (MANDATORY):** raw `school` must be one of the eight canonical English names in `SPELL_SCHOOLS` (`src/domain/spells.ts:3`). Validation uses a `name → SpellSchool` map keyed case-insensitively; Require exact canonical capitalization for new raw class and school strings. Legacy slug-to-name conversion belongs in the migration helper. Avoid accepting alternative spellings that produce inconsistent source files.
- the stored/emitted value is the canonical name. Unknown or non-string values fail with filename + index.
- **Classes (MANDATORY):** raw `classes` must be an array of canonical English `CORE_CLASSES` names (`src/domain/spells.ts:14`). Each value is mapped via a `name → CoreClass` map. Unknown names fail (no silent mapping). Duplicates fail. `CORE_CLASSES` is **not** extended; `"Artificer"` is illustrative only and is rejected today. The design keeps a single class registry (no duplicate map) so additional officially supported classes can be added later without a raw-schema change. 
- The normalized `classes` output (`CoreClass[]` → `CharacterClass[]`) and all runtime filtering/localization are unchanged.

## 6. `subclasses` semantics and validation

### 6.1 Syntax and raw validation (MANDATORY)
- Optional array of strings; when present, non-empty.
- Each entry: `"<ClassName>: <SubclassName>"` — exactly one `": "` separator; both parts trimmed and non-empty.
- `<ClassName>` must be an existing canonical `CORE_CLASSES` name (same eight-class scope).
- `<ClassName>` is **not required** to also appear in `classes` (independence requirement).
- Duplicate entries within one spell fail.
- Entries are stored as canonical English identifiers, identical across all languages.
- No fixed subclass enumeration: values beyond the 48-item catalog are allowed.
- Remove automatic alias canonicalization from the current implementation scope. Validate exact canonical names for the known 2024 subclasses and permit well-formed additional subclass names. Alias reconciliation belongs to the later migration phase. This avoids introducing an unnecessary mapping mechanism now.

### 6.2 Normalized runtime representation (MANDATORY, minimal)
Extend the `Spell` interface and `spellSchema` with an optional field:

```ts
// src/domain/spells.ts
subclasses?: string[]; // e.g. ["Cleric: War"], canonical English identifiers
```

- Zod: `subclasses: z.array(trimmedNonEmpty(LIMITS.META_MAX)).refine(unique).optional()` (mirrors `damageTypes`). The runtime schema only enforces non-empty/unique/length; the `"<CORE_CLASS>: <Sub>"` prefix rule is enforced by the **raw** adapter, keeping custom spells/import tolerant (paralleling free-form `CharacterClass` vs strict raw classes).
- The normalizer copies raw `subclasses` into the normalized `Spell` when present; when absent the property is omitted (no default).
- Justification for the schema change: it is the minimum needed to satisfy "do not silently discard subclasses during normalization" and to let the later phase populate data without another schema change. It is optional, so existing persisted custom spells, imports, and datasets remain valid; `spellSchema` strips/strips unknown keys and round-trips known ones.

### 6.3 Cross-language rules (MANDATORY)
- Subclasses are canonical mechanics. Add a check to `validateTranslation` (`scripts/srd/validate.ts`) mirroring `damageTypes`: when a translated entry provides `subclasses`, its set must equal the English set; Clarify subclass consistency rules: if English has subclasses and a translation omits them, the normalized translation should inherit the English canonical subclass assignments, or the pipeline must explicitly document why missing metadata is acceptable. Otherwise, localized datasets may silently lose subclass availability.
- Translated raw files must use the same canonical English subclass identifiers; German (and other languages) never store localized subclass names.
- German display labels are a presentation concern. When subclass data is populated in the later phase, labels come from a centralized catalog (`src/locales/labels.ts` + `en.ts`/`de.ts`), keyed by canonical identifier, with English fallback — never stored in raw spell records. **No catalog entries are added in this refactoring** (no data uses subclasses yet, and no UI exists).

### 6.4 Phase separation (MANDATORY)
Populating subclass assignments from `data/reference/srd-spells-2024_extended-props.json` is a **separate later phase**. This refactoring must not merge, copy, or infer any subclass values. See §13.

## 7. Damage-type semantics

- Raw `damage.damage_type` is a **string**: the canonical lowercase slug (`"acid"`, `"psychic"`, …).
- **MANDATORY:** validate against the canonical damage-type vocabulary (13 types currently in use). Recommended single source of truth: add `DAMAGE_TYPES` to `src/domain/spells.ts` (beside `SPELL_SCHOOLS`/`CORE_CLASSES`) and have `src/locales/labels.ts` (`DAMAGE_TYPE_KEYS`) derive from it via `satisfies`. Alternative if zero domain change is preferred: keep the canonical set in the build layer (`scripts/srd/common.ts`). Either way, one authoritative list — no duplicate registry.
Make a definitive implementation choice: maintain the damage-type vocabulary in the build layer unless the existing domain layer already has an appropriate canonical definition. Do not leave alternative architectures unresolved in an implementation specification.
- Unknown or non-string damage types fail with filename + index (consistent with school and class strictness). This is a strict SRD-ingestion rule only; the runtime `damageTypes` stays a free-form `string[]` for custom/imported spells (`src/locales/labels.ts:73` already falls back to the raw value for unknown types).
- The normalizer continues to emit `damageTypes: [<lowercased slug>]` — unchanged.

## 8. Retained raw metadata (`damage_at_slot_level`, `attack_type`)

**MANDATORY (per decision):**
preserve `damage.damage_at_slot_level` (89 entries) and `attack_type` (21 entries) verbatim in the raw source. They remain unused by normalization and are **not** added to the normalized `Spell` schema or any runtime feature.

- The migration copies them unchanged and must not reorder or reformat their contents.
- Migration tests assert their preservation (counts and values).
- If any value is demonstrably invalid/inconsistent, report it in the migration report; never silently rewrite or delete.
- Documentation states they are intentionally retained as raw-source metadata only.

## 9. Canonical English snapshot decision

**Recommendation: Option A — remove the snapshot.**

Evidence:
- The snapshot is a duplicate of the committed `src/data/spells.srd.json`, verified byte-equal to freshly normalized English. 
- It adds a 416 KB committed artifact and a manual regenerate step on every intentional source change.
- `allowSnapshotCreation` defaults to `true`, weakening it as a hard build gate.
- The raw sources are (or will be) committed, so source drift is visible in `git diff`, and normalizing produces the committed generated dataset.

What the snapshot uniquely detects: silent changes to normalized English output from source edits that are individually valid (a missing/renamed spell, changed level/school/ damage/components), or from adapter logic regressions. That protection is retained by a deterministic regression test (§11.4) that fails `vp test` on drift.

Remove (MANDATORY):
- `data/srd/canonical-english.snapshot.json`.
- `verifyOrCreateSnapshot` and its call in `scripts/normalize-srd.ts` (lines 59-89, 104).
- `BuildOptions.snapshotPath` and `allowSnapshotCreation` (lines 30-33, 102-103).
- Snapshot documentation (`README.md` "Canonical English snapshot"; `docs/srd-data-pipeline.md` §3.A; the "do not create `canonical-<lang>.snapshot.json`" note; `docs/specs/MAIN-spec.md:27` snapshot requirement).

Preserve/keep (MANDATORY):
- Raw per-entry validation, duplicate detection, component/range checks (`scripts/srd/common.ts`).
- Cross-language mechanics validation (`scripts/srd/validate.ts`). 
- `src/domain/spells.ts` Zod validation of normalized entries.
- The new regression test (§11.4) and the committed generated datasets as the reviewed golden artifacts. Intentional changes are reviewed via `git diff` on the raw source and the regenerated `src/data/spells.srd*.json`, and must keep the regression test updated.

Optional stricter variant (not required): before overwriting, compare in-memory normalized English against the previously committed `src/data/spells.srd.json`, preserving a build-time gate without the extra file. If selected, document the workflow friction.

## 10. Required changes by file / module

### 10.1 Raw source data
- `data/srd/srd-spells-2024.json`, `data/srd/srd-spells-2024_de.json`: migrate via the tool (§12). Do not hand-edit.
- `data/srd/canonical-english.snapshot.json`: delete.
- `data/srd/srd-spells-2024_extended-props.json`: **relocate** to
  `data/reference/srd-spells-2024_extended-props.json` (prep step; see §13). Optionally relocate `data/srd/DE_SRD_CC_v5.2.1_converted-pdf__page122-202_spells.md` alongside it.

### 10.2 Discovery (`scripts/srd/discovery.ts`)
- No weakening of BCP 47 validation. After relocation the input dir contains only `srd-spells-2024.json` and `srd-spells-2024_<bcp47>.json`.
- Keep the fail-fast behavior for unrecognized `srd-spells-2024*` filenames (`discovery.ts:76-81`) so stray files get an actionable error instead of silent ignoring.
- Document the convention: non-dataset/reference JSON must not live in `data/srd/`.

### 10.3 Build maps/validators (`scripts/srd/common.ts`)
- Add `SCHOOL_BY_NAME` and `CLASS_BY_NAME` (canonical name → enum, case-insensitive).
- Add the damage-type vocabulary (reuse `DAMAGE_TYPES` or build-local set).
- Add `SUBCLASS` parsing/validation helpers (format, class membership, trimming, uniqueness).
- Keep `SrdSourceError`, `requireString/Record/Array`, component/range checks.
- Remove `GERMAN_CLASS_BY_NAME` if the German adapter is removed (§10.5).

### 10.4 Adapters (`scripts/srd/english.ts`, `scripts/srd/shared-translation.ts`)
- `normalizeEnglishEntry`: read string `school`, string-array `classes`, string `damage.damage_type`; preserve `damage_at_slot_level`/`attack_type` in the raw-schema   sense (they are ignored); parse optional `subclasses`; emit `subclasses` on the normalized spell when present.
- `canonicalDamageTypes`: accept a string and validate against the vocabulary.
- `isCanonicalSourceShape`: update to the NEW shape (string `school`, `classes[]` strings, `components` V/S/M). If a legacy shape is detected, fail with an actionable message
  instructing to run the migration tool (no permanent legacy parsing).

### 10.5 German adapter
- `srd-spells-2024_de.json` already matches the canonical shape, so it uses the shared adapter after migration. **Recommendation (OPTIONAL cleanup):** delete   `scripts/srd/german.ts`, `GERMAN_CLASS_BY_NAME`, the `de` branch in
  `scripts/normalize-srd.ts:119-122`, and the "German adapter" tests. If retained, it must be rewritten for the new shape and is dead for checked-in data. Flag for confirmation.
- `scripts/convert-german-srd.ts` (one-time repair of a runtime-shaped German file) is obsolete: German is already canonical. **Recommendation (OPTIONAL cleanup):** remove it and `src/test/german-conversion.test.ts`, whose real-data coverage is superseded by the new regression test (§11.4). Flag for confirmation.

### 10.6 Normalizer (`scripts/normalize-srd.ts`)
- Remove the snapshot logic (§9). Keep discovery, adapter selection, cross-language validation, dataset writes, manifest, and static-asset copying.

### 10.7 Runtime schema (`src/domain/spells.ts`)
- Add optional `subclasses?: string[]` to `Spell` and `spellSchema` (§6.2).
- Add `DAMAGE_TYPES` only if the recommended single-source-of-truth is chosen (§7).
- Do not otherwise change the schema, limits, or `CharacterClass`.

### 10.8 Localization (`src/locales/labels.ts`, `en.ts`, `de.ts`)
- No subclass catalog entries are added now. If `DAMAGE_TYPES` is added, optionally derive `DAMAGE_TYPE_KEYS` from it with `satisfies`. No translation content changes.

### 10.9 Docs and spec
- See §14.

## 11. Tests and acceptance criteria

Test files live under `src/test/` or alongside source (vitest `include: src/**/*.{test,spec}`; `scripts/**` is excluded, so script tests import from `../../scripts/...`).

### 11.1 Adapter/unit tests (MANDATORY, update `src/test/normalize.test.ts`)
- New-shape fixtures (string `school`, string `classes`, string `damage_type`, optional `subclasses`).
- Successful conversion of English-shaped and German-shaped new sources.
- Class and school mapping correctness; unknown class/school/damage rejection.
- Duplicate class and duplicate subclass rejection.
- Subclass syntax: valid entry accepted; missing separator / empty part / unknown parent-class rejected; subclass class need not appear in `classes`.
- Stable ID preservation (`srd-<index>`).
- Malformed source structures rejected with filename + index.
- `isCanonicalSourceShape`/adapter selection: new shape accepted; unsupported/legacy shape fails with the migration hint.
- `buildSrdArtifacts` still works without snapshot options.

### 11.2 Cross-language validation tests (MANDATORY)
- Conflicting class/school/component/damage/level/ritual/concentration fail.
- Conflicting `subclasses` fail when the translation provides them; absent passes.
- Unknown canonical ID fails.

### 11.3 Runtime schema tests (MANDATORY, extend `src/domain/spells.test.ts`)
- A `Spell` with valid `subclasses` validates and round-trips.
- Duplicate `subclasses` fail; over-long entries fail.
- A `Spell` without `subclasses` still validates (back-compat).
- Existing persisted-custom-spell / export-import paths accept the optional field (round-trip through `spellSchema`, e.g. via `payloads`).

### 11.4 Regression / drift test (MANDATORY — replaces the snapshot)
Create `src/test/srd-dataset.test.ts`:
- Normalize the real `data/srd/srd-spells-2024.json` and assert deep-equality with the committed `src/data/spells.srd.json` (read via `process.cwd()`).
- Normalize the real German source and run `validateTranslation` against English; assert deep-equality with the committed `src/data/spells.srd.de.json`.
- Assert 339 English spells, unique IDs, and the exact sorted ID set.
- This test is the automatic drift gate formerly provided by the snapshot.
- Ensure the regression test compares freshly normalized data against the committed Git baseline, not merely the current generated files. Otherwise, running `pnpm run build` before the test could overwrite the expected data and conceal regressions.

### 11.5 Migration-helper tests (MANDATORY)
Create `src/test/srd-migration.test.ts` covering:
- Legacy English structure → new structure (school/classes/damage_type conversions).
- Legacy German structure → new structure (2-space/LF/trailing newline; order preserved).
- `url` removed; `damage_at_slot_level` + `attack_type` preserved (`acid-arrow` example).
- Stable `index`/ID preservation; no fabricated `subclasses` (none present → omitted).
- Unknown class/school/damage or malformed legacy shape fails with an actionable error.
- Deterministic/idempotent: migrating already-migrated input is a no-op.
- Dry-run writes nothing; failure aborts without modifying inputs.
- Post-migration normalization equals the pre-migration normalized datasets.

### 11.6 Baseline equivalence (MANDATORY acceptance criterion)
Verified baseline (recorded here): normalizing both current sources produces output byte-identical to the committed `src/data/spells.srd.json` and `src/data/spells.srd.de.json`. After migration these must remain byte-identical. Any intended difference must be explicitly listed in the implementation PR; the only permitted normalized-schema change is the new optional `subclasses` field, which is absent for all current spells (so output is unchanged).

### 11.7 E2E
No changes required: e2e tests exercise normalized datasets/manifest (e.g. 339 spells, language switching, offline precache). Re-run `pnpm run test:e2e` after regeneration.

### 11.8 Quality gates
Run `vp check` and `vp test`; run affected `pnpm run test:e2e`. `pnpm run build` must succeed and regenerate identical datasets.

## 12. TypeScript migration-helper design

### 12.1 Location and naming
- `scripts/migrate-srd-source-format.ts` (one-time tool). Optionally under `scripts/migrations/`. It is explicitly a temporary/one-time utility, not permanent infrastructure; document that it may be deleted after the migration lands. Precedent: `scripts/convert-german-srd.ts`.

### 12.2 Interface
```
pnpm exec tsx scripts/migrate-srd-source-format.ts [options]

--input-dir <dir>   default: data/srd
--files <names>     default: srd-spells-2024.json, srd-spells-2024_de.json
--apply             write changes (default: dry-run, writes nothing)
--report <path>     optional: write the JSON report to a file
```
- **Default is dry-run.** Writing requires an explicit `--apply`.
- Exports a pure function (e.g. `migrateSourceEntry` / `migrateSource(raw)`) for unit tests.

### 12.3 Behavior
1. Read the target files; parse JSON (fail on malformed input with filename context).
2. Validate the expected legacy structure (object `school` with string `index`; `classes` array of objects with string `index`; `damage.damage_type` object; top-level `index`).
3. Convert each entry deterministically:
   - `school` object → canonical English name (from `school.index`).
   - `classes[]` objects → canonical English names (from `classes[].index`), dedup-checked.
   - `damage.damage_type` object → canonical lowercase slug.
   - Preserve `damage.damage_at_slot_level` and `attack_type` verbatim.
   - Preserve `subclasses` if present and valid; otherwise omit.
   - Remove top-level `url`.
   - Preserve `index`, all other fields, entry order, and property order.
4. Validate the converted output by running the new adapters in-memory and asserting the normalized result equals the committed `src/data/spells.srd*.json` (guards against silent semantic drift).
5. Detect and fail on unknown mappings/ambiguous conversions (e.g. class index with no canonical name, missing school index, malformed subclass).
6. Dry-run: print a summary report and write nothing.
7. `--apply`: write to a sibling temp file then atomically rename, only after all files converted and validated successfully. Never partially modify inputs.
Rename operations are atomic per file, not across multiple files. Require staging and validation of both outputs before replacement, with a backup/rollback mechanism if a later replacement fails.
1. Idempotency: if a file already uses the new shape, report a no-op.

### 12.4 Report contents
Per file: entry counts; `url` removed count; class/school/damage-type conversions; preserved `damage_at_slot_level`/`attack_type` counts; `subclasses` found/omitted; unknown/ambiguous mapping failures; and any values flagged as invalid/inconsistent (§8).

### 12.5 Determinism
Identical input yields byte-identical output; 2-space indentation, LF, trailing newline; no reliance on object key iteration beyond insertion order preservation.

## 13. Reference-file relocation and follow-up phase

### 13.1 Relocation (prep step, MANDATORY)
Move `data/srd/srd-spells-2024_extended-props.json` to `data/reference/srd-spells-2024_extended-props.json`. This removes the current `discoverSrdInputs` failure without weakening BCP 47 validation, and documents the
convention that reference data lives outside `data/srd/`.

### 13.2 Reference file characteristics (documented, not adopted)
The file contains the same 339 spells but: no `index`; HTML `<p>` descriptions; combined component strings; `at_higher_levels`; string `school`; string `classes` including `Artificer`; and `subclasses` (208/339 entries) spanning more classes than the eight `CORE_CLASSES` (e.g. Barbarian, Fighter, Monk, Rogue) and beyond the 48-item 2024 catalog. It is NOT the new raw schema; its full structure is out of scope.

### 13.3 Later subclass-data migration (separate phase — not implemented now)
- Populate `subclasses` into the SRD datasets from the reference file using verified identifiers or a validated mapping strategy; **never** derive canonical spell IDs from ambiguous name matching.
- Deterministic alias canonicalization for known subclass abbreviations, with unknown values reported, not silently rewritten.
- A compatibility decision is required first, because the reference includes classes/subclasses beyond `CORE_CLASSES` and the 48-item catalog; expanding supported classes is an explicitly separate scope decision.
- German (and future languages) subclass display labels via the centralized catalog, never stored as canonical mechanics.

## 14. Documentation update checklist (do not edit during this task)

- `README.md`: "Bundled data and normalization" (§ raw shape), "Source structure adapters" (update: string `school`/`classes`, shared adapter for `de`, remove the German `G`/name mapping claim), "Canonical English snapshot" (remove section), "Adding a translation" (new shape + reference-file convention), and the note about artifact regeneration.
- `docs/srd-data-pipeline.md`: §2.B field table (`school.index`, `classes[]`, `damage.damage_type.index` → strings; add `subclasses`), §2.C adapter selection (new shape + legacy detection hint; clarify German uses the shared adapter), §2.D example, §2.E mechanics list (add subclasses), §3.A snapshot section (remove), §3.B/§5 as needed, §5 comparison table (raw vs custom shape).
- `docs/specs/MAIN-spec.md`: line 27 (remove snapshot requirement), and the §4 data-model snippet (add optional `subclasses`). Add a note about the reference file and the later subclass phase.
- `docs/subclasses.md`: label as reference material for the later phase; note it covers classes beyond `CORE_CLASSES` and that German names include alternatives requiring reconciliation. Do not treat it as a restrictive enum.
- `AGENTS.md`: no change required; optionally mention the `data/reference/` convention.

## 15. Risks and mitigations

| Risk                                                                  | Mitigation                                                                                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Removing the snapshot removes build-time drift gate                   | Add the §11.4 regression test (CI/`vp test` gate); keep generated datasets committed for `git diff` review; optional in-script check (§9). |
| Migration silently changes normalization                              | Validate converted output against committed datasets before writing; §11.6 byte-identical acceptance.                                      |
| Legacy-format adapters removed too early                              | Migrate both known files in the same change; new adapters detect legacy and fail with a migration hint; no permanent legacy parsing.       |
| `extended-props` breaks the build                                     | Relocate to `data/reference/` before running normalization; keep discovery fail-fast for stray files.                                      |
| Damage-type strictness rejects future types                           | Documented; update the single vocabulary list intentionally when needed.                                                                   |
| Optional `subclasses` schema change affects import/export/persistence | Field is optional; `spellSchema` strips unknown keys and round-trips known ones; add round-trip tests (§11.3).                             |
| Subclass work drifts into UI/filtering                                | Explicit non-goal and phase separation; only lossless data support is added.                                                               |
| `german.ts`/`convert-german-srd.ts` removal changes coverage          | Replace with the new regression test; flagged as optional cleanup for confirmation.                                                        |

## 16. Recommended implementation sequence

0. Relocate the extended-props reference file to `data/reference/` (unblocks the pipeline).
1. Extend `src/domain/spells.ts` with optional `subclasses` (and `DAMAGE_TYPES` if chosen); update `spells.test.ts`.
2. Update `scripts/srd/common.ts` (name maps, damage vocabulary, subclass helpers).
3. Update `scripts/srd/english.ts` + `shared-translation.ts` for the new shape; update `isCanonicalSourceShape`.
4. Decide and (if approved) remove `german.ts` / `convert-german-srd.ts` and their tests.
5. Implement `scripts/migrate-srd-source-format.ts` (+ `srd-migration.test.ts`).
6. Run the migration (dry-run, review report, then `--apply`); commit the new raw sources. Make the sequence of quality checks explicit: establish the baseline before migration, test converted results, verify generated datasets have not changed, and only then remove the snapshot. This ensures the original integrity checks remain available during the transition.
7. Remove snapshot logic from `scripts/normalize-srd.ts`; delete the snapshot file.
8. Add `src/test/srd-dataset.test.ts` (drift regression); update `normalize.test.ts`.
9.  Run `pnpm run normalize:srd`; confirm `src/data/spells.srd*.json` are byte-identical to the committed versions (only dataset-file regeneration, no content change).
10. Update docs (§14). Run `vp check`, `vp test`, affected `pnpm run test:e2e`, and
    `pnpm run build`.

## 17. Decisions and assumptions established during analysis

| #   | Decision                                                                                                                                                                                                                                                | Source                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| D1  | Both current raw files use the shared adapter; `german.ts` is dead for real data.                                                                                                                                                                       | Verified (`isCanonicalSourceShape` true for both). |
| D2  | `subclasses`: lossless — add optional `Spell.subclasses`; validate raw syntax/class/duplicates; do not restrict to the 48-item catalog; availability independent of `classes`; canonical English ids across languages; German via localization (later). | User decision.                                     |
| D3  | Keep `damage.damage_at_slot_level` and `attack_type` verbatim; not added to the normalized schema; not used at runtime; report invalid values.                                                                                                          | User decision.                                     |
| D4  | Class scope = existing 8 `CORE_CLASSES`; do not extend `CORE_CLASSES`/locale catalogs; `Artificer` illustrative; keep architecture extensible.                                                                                                          | User decision.                                     |
| D5  | `extended-props` is reference-only; relocate to `data/reference/`; do not normalize/merge/modify now; preserve strict BCP 47.                                                                                                                           | User decision.                                     |
| D6  | Remove the canonical English snapshot; replace with the §11.4 regression test.                                                                                                                                                                          | Analysis recommendation (this spec).               |
| D7  | Damage-type raw values validated against a single canonical 13-type vocabulary; unknown rejected.                                                                                                                                                       | Analysis (needed to satisfy §2.4).                 |
| D8  | Components, material, description, and `higher_level` shapes are unchanged; the extended-props component string is not adopted.                                                                                                                         | Analysis (out of the requested change set).        |
| D9  | `subclasses` population is a separate later phase.                                                                                                                                                                                                      | User decision.                                     |
| D10 | Normalized output for current data stays byte-identical; only new optional `subclasses` may appear (and only when data present).                                                                                                                        | Verified baseline + requirement.                   |

## 18. Open items requiring confirmation (optional cleanups)

These are recommended but flagged for the user; they are not blockers for the core
refactoring:
1. Removal of `scripts/srd/german.ts`, `GERMAN_CLASS_BY_NAME`, the `de` adapter branch, and the German-adapter tests (obsolete for checked-in data).
2. Removal of `scripts/convert-german-srd.ts` and `src/test/german-conversion.test.ts` (one-time repair already applied; superseded by the regression test).
3. Placement of the canonical damage-type list (`src/domain/spells.ts` vs build layer).
