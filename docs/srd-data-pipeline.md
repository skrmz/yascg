# SRD Data Pipeline & Normalization

This document details how SRD spells are processed, validated, and loaded into the application from JSON files, the architectural role of "canonical" concepts, and the step-by-step procedure for adding new language translations.

---

### 1. How Spells Are Loaded from JSON Files

The spell loading process is divided into two distinct phases: **Build/Normalization Time** (converting raw data to static public artifacts) and **Runtime Application Loading** (fetching, validating, and hydrating the app state).

#### A. Build-Time Generation & Serving
1. **Raw Input Files:** 
   Raw SRD spells reside in `data/srd/` as `srd-spells-2024.json` (canonical English) and `srd-spells-2024_<LANG>.json` (translated inputs, e.g., German `de`).
2. **Normalization Script (`scripts/normalize-srd.ts`):** 
   - Discovers inputs and normalizes them through the shared adapter (`srd/shared-translation.ts` → `srd/english.ts`).
   - Normalizes text, maps classes/components, and verifies integrity.
   - Writes generated JSON files exclusively to `src/data/`:
     - `spell-languages.json` (manifest containing available language codes, display names, and dataset paths).
     - `spells.srd.json` (canonical English dataset).
     - `spells.srd.<lang>.json` (per-language normalized datasets).
3. **Static Asset Serving:** 
   Vite is configured with `publicDir: "src/data"`. These files are served as static root assets (e.g., `/spell-languages.json`, `/spells.srd.de.json`) and copied into the `dist/` root on build.
4. **PWA Pre-caching:** 
   `vite-plugin-pwa` precaches the manifest and all language datasets. Once verified in Cache Storage, the app can load them completely offline without network requests.

#### B. Runtime Loading in the App
The runtime data pipeline is managed by services in `src/services/data/`:

1. **Manifest & Language Resolution (`src/services/data/language.ts`):**
   - The app fetches `/spell-languages.json`.
   - It reads the user’s preferred language from `localStorage` (`spellCards.language`).
   - If the stored code exists in the manifest, it selects that language; otherwise, it falls back cleanly to English (`en`).
2. **Dataset Fetching & Validation (`src/services/data/load.ts`):**
   - The app fetches the dataset for the selected language (e.g., `/spells.srd.json` or `/spells.srd.de.json`).
   - The JSON data is parsed and validated against the runtime `Spell` Zod schema to ensure shape safety.
   - Validated datasets are cached in memory so switching views or re-rendering doesn't re-trigger fetches.
3. **Merging with Custom Spells & Indexing:**
   - The loaded SRD spells are combined in-memory with any user-authored spells loaded from IndexedDB (`Dexie` `customSpells` table).
   - The merged library is indexed with **Fuse.js** for fast, case- and accent-insensitive searching and filtering.
4. **Deck Resolution & Missing/Unavailable Detection:**
   - Active deck entries store spell IDs. When loading a deck, the app matches each entry against the currently loaded language dataset.
   - If a spell exists in English/canonical SRD but is absent in a partial translation, the app marks it as *translation-unavailable* (omitting it from print preview without deleting it from the deck), rather than crashing or showing English text under a non-English tag.

---

### 2. Raw SRD Input Data Specification (`pnpm run normalize:srd`)

The normalizer reads two kinds of raw input from `data/srd/`:

- `srd-spells-2024.json` — mandatory canonical English source (canonical source shape).
- `srd-spells-2024_<LANG>.json` — optional translation sources (same canonical source shape).

Reference material that is not an input dataset (for example `srd-spells-2024_extended-props.json`) must live in `data/reference/`: every `srd-spells-2024*` JSON file in `data/srd/` is treated as an input, and an unrecognized name fails discovery instead of being ignored.

Every raw file is a **JSON array of spell entries** (never a wrapper object such as `{ "spells": [...] }`). Each entry is validated at the raw level and then normalized into the internal `Spell` domain shape before the mechanics cross-check runs.

#### A. Expected top-level structure

- The top level must be an array; a non-array file fails the build with `top-level JSON must be an array of spells`.
- Each element must be an object with a string `index`. Duplicate `index`/`id` values within a file fail the build.

#### B. Raw fields consumed per entry

| Raw field                        | Type               | Requirement                                         | Normalized into                                             |
| -------------------------------- | ------------------ | --------------------------------------------------- | ----------------------------------------------------------- |
| `index`                          | string             | required; upstream slug                             | `id: "srd-<index>"`                                         |
| `name`                           | string             | required                                            | `name` (translated text preserved)                          |
| `level`                          | integer 0–9        | required                                            | `level`                                                     |
| `school`                         | string             | required; canonical English name (e.g. `Evocation`) | `school` (canonical `SpellSchool`)                          |
| `classes[]`                      | string[]           | required; canonical English class names             | `classes` (canonical `CoreClass[]`) — see shape rules below |
| `subclasses[]`                   | string[]           | optional; `"<Class>: <Subclass>"` (unique)          | `subclasses` (canonical identifiers, omitted when absent)   |
| `casting_time`                   | string             | required                                            | `castingTime` (translated text preserved)                   |
| `range`                          | string             | required; must not contain `component`/`komponente` | `range` (translated text preserved)                         |
| `components`                     | string[]           | required; at least one letter                       | `components.verbal` / `somatic` / `material`                |
| `material`                       | string             | optional                                            | `components.materialDescription` when `M` is present        |
| `duration`                       | string             | required                                            | `duration` (translated text preserved)                      |
| `concentration`                  | boolean            | required (missing coerces to `false`)               | `concentration`                                             |
| `ritual`                         | boolean            | required (missing coerces to `false`)               | `ritual`                                                    |
| `description`                    | string \| string[] | optional (missing → `[""]`)                         | `description`                                               |
| `higher_level` / `higher_levels` | string \| string[] | optional                                            | `higherLevels`                                              |
| `damage.damage_type`             | string             | optional; canonical lowercase slug (e.g. `acid`)    | `damageTypes: [<slug>]`                                     |

`url` must not appear in a raw source: it was removed by the one-time migration. `damage.damage_at_slot_level` (89 entries) and `attack_type` (21 entries) are retained **verbatim** in the raw sources as source metadata; they are intentionally ignored by normalization and are not part of the normalized `Spell` schema. Any other unread property is ignored rather than rejected.

Note: raw inputs do **not** supply `savingThrow`. It is never read from SRD sources, so a translation can only be cross-checked on `savingThrow` when it (unusually) declares one.

#### C. Component letters, class and subclass identifiers

Every raw source — English and translations alike — uses the same **canonical shape**, handled by `scripts/srd/shared-translation.ts` → `normalizeEnglish`:

- component letters are `V` (verbal), `S` (somatic), `M` (material); at least one is required;
- `school` is a canonical English school name validated against `SPELL_SCHOOLS` (case-insensitive lookup, canonical value emitted);
- `classes[]` are canonical English `CORE_CLASSES` names (unknown names and duplicates fail);
- `damage.damage_type` is a canonical lowercase slug validated against the single `DAMAGE_TYPES` vocabulary in `src/domain/spells.ts`;
- `subclasses[]` (optional) are `"<ClassName>: <SubclassName>"` strings with exactly one `": "` separator. The parent class must be a canonical `CORE_CLASSES` name and is **independent of `classes`** (a spell may list `"Cleric: War Domain"` without Cleric in `classes`). Values are stored as canonical identifiers with no fixed subclass enumeration and no alias canonicalization; the raw adapter stays tolerant of non-catalog identifiers (reference-only subclasses, custom spells, imports). The bundled assignments were produced by the subclass reconciliation tool (§2.G): catalog subclasses use the 48 canonical identifiers from `docs/subclasses.md`, reference-only subclasses are preserved verbatim, and Artificer subclasses are excluded.

`isCanonicalSourceShape` probes this shape (string `index`, string `school`, string `classes[]`, `V`/`S`/`M` components). The legacy 5e-bits shape (object `school.index`, `classes[].index`, object `damage.damage_type`, top-level `url`) is detected and rejected with an actionable message pointing at `pnpm exec tsx scripts/migrate-srd-source-format.ts --apply`. Other structures fail with `unsupported translation source structure` rather than being skipped.

#### D. Minimal representative raw example

```json
[
  {
    "index": "acid-splash",
    "name": "Acid Splash",
    "level": 0,
    "school": "Evocation",
    "classes": ["Sorcerer", "Wizard"],
    "casting_time": "Action",
    "range": "60 feet",
    "components": ["V", "S"],
    "duration": "Instantaneous",
    "concentration": false,
    "ritual": false,
    "description": "You hurl a bubble of acid...",
    "damage": { "damage_type": "acid" }
  }
]
```

#### E. Mechanics that must strictly match canonical English

Translation files may localize free text (`name`, `description`, `casting_time`, `range`, `duration`, `material`), but every language-independent mechanic is cross-validated against the normalized English spell by `scripts/srd/validate.ts`. Normalization fails — reporting the source filename and the offending index — when a translated entry:

- references an unknown canonical English ID (translations must reuse the canonical `index`);
- disagrees on `level`, `school`, `concentration`, `ritual`, or `source`;
- disagrees on component presence (`verbal`, `somatic`, `material`);
- disagrees on `classes` (compared as a set) or on `components.materialConsumed` **when the translated entry provides it**;
- provides `subclasses` that differ (as a set) from English; when the translation omits `subclasses` (and English has them), the English assignments are **inherited** into the normalized translation so localized datasets never silently lose subclass availability;
- provides `damageTypes` or `savingThrow` that differ from English.

`index`, `school`, `classes`, `subclasses`, and `damageType` identifiers are always mapped to canonical values, so both languages resolve to the same `srd-<index>` identity.

Canonical identifiers — including `damageType` (stored lowercased, e.g. `"fire"`) — are never translated in the data pipeline. Localized display labels (school names, class names, component letters, and damage-type names) are applied only at render time by the `src/locales/` catalogs, with English used as the fallback for any value absent from the catalog.

#### F. Legacy source migration (one-time utility)

`scripts/migrate-srd-source-format.ts` converts the pre-refactoring 5e-bits shape (`school` object, `classes[]` objects, `damage.damage_type` object, top-level `url`) into the canonical shape. It is a temporary utility that may be deleted once no legacy sources remain.

```powershell
pnpm exec tsx scripts/migrate-srd-source-format.ts           # dry run (default): report only
pnpm exec tsx scripts/migrate-srd-source-format.ts --apply   # write the converted sources
```

- Options: `--input-dir <dir>` (default `data/srd`), `--files <a,b>` (default both datasets), `--report <path>`.
- Conversions: `school.index` → canonical English name, `classes[].index` → canonical class names (dedup-checked), `damage.damage_type.index` → canonical lowercase slug. `url` is removed; `damage.damage_at_slot_level` and `attack_type` are preserved verbatim; existing `subclasses` are validated as canonical identifiers; entry and property order are kept.
- Unknown or ambiguous mappings, malformed legacy entries and baseline mismatches abort with a filename + index diagnostic before anything is written.
- Self-validation: the converted sources are normalized in memory and must reproduce the committed `src/data/spells.srd*.json` datasets (translations are also cross-validated against English).
- `--apply` stages and verifies both outputs first, then replaces them atomically with a backup that is rolled back if a later replacement fails. Re-running on already-migrated files is a no-op, and output is deterministic (2-space indentation, LF, trailing newline).

#### G. Subclass reconciliation (one-time utility)

`scripts/migrate-srd-subclasses.ts` populates the optional raw `subclasses` field from `data/reference/srd-spells-2024_extended-props.json` (reference material, never an input dataset). It is a one-time utility.

```powershell
pnpm exec tsx scripts/migrate-srd-subclasses.ts                                   # dry run (default): report only
pnpm exec tsx scripts/migrate-srd-subclasses.ts --apply --report data/reference/subclass-reconciliation.json
```

- Options: `--input-dir <dir>` (default `data/srd`), `--reference <path>`, `--files <a,b>` (default both datasets), `--report <path>`, `--apply`.
- Reconciliation is explicit and deterministic: reference identifiers are mapped through an alias table to the 48 canonical catalog identifiers (`src/domain/subclasses.ts`, `docs/subclasses.md`), reference-only subclasses (parent class among the 12 `CORE_CLASSES`) are preserved verbatim, and subclasses whose parent class is not a core class (Artificer) are excluded and reported as `unsupported-parent-class`. There is no fuzzy matching; every unmatched spell name is reported.
- Spell matching is by trimmed name for English (the reference typo `Arance Hand` is aliased to `Arcane Hand`) and by canonical `index` for translations, whose names are localized. This keeps EN/DE subclass assignments identical.
- The tool inserts `subclasses` immediately after `classes`, sorts identifiers, omits empty lists, and preserves every other field and its order. Before writing it normalizes both sources in memory, validates the translation against English, and asserts that every field **except** `subclasses` still reproduces the committed `src/data/spells.srd*.json` datasets, that EN/DE assignments match, and that every identifier's parent class is canonical. `--apply` writes atomically with backup/rollback (`.migrate-tmp` / `.migrate-bak`); re-running is a no-op.
- The committed report `data/reference/subclass-reconciliation.json` records catalog coverage, the alias map, reference-only and excluded identifiers, unmatched names, dedup collisions (e.g. the 12 `Druid: Land (…)` variants collapsing onto `Druid: Circle of the Land`), and per-file population counts.

---

### 3. The Role of "Canonical"

The term **canonical** operates across multiple layers as the bedrock for data integrity, drift detection, and multilingual synchronization:

#### A. Drift Protection (Regression Test, No Snapshot File)
- **Committed Golden Datasets:** The normalized English and German datasets in `src/data/` are committed and reviewed artifacts. The former `canonical-english.snapshot.json` was removed because it duplicated `src/data/spells.srd.json`.
- **Automatic Drift Gate:** `src/test/srd-dataset.test.ts` normalizes the checked-in `data/srd/` sources and asserts they reproduce the committed datasets exactly, including the 339-spell count, unique IDs, the sorted ID set, the populated subclass counts, and that every subclass parent is a core class. It reads the baseline from the Git object store (`git show HEAD:src/data/...`) and fails loudly if that baseline is unavailable — there is deliberately no working-tree fallback, which could otherwise compare generated output against itself. It also asserts that stripping `subclasses` from both sides leaves every other field identical (mechanics unchanged) and that EN/DE assignments match.
- **Intentional Updates:** Changing the SRD sources changes the raw file and the regenerated `src/data/spells.srd*.json` in the same review, and `git diff` plus the drift test keep the change explicit.

#### B. Canonical Source of Truth for Mechanics
- **Enforcing Rules Across Languages:** The English dataset is the canonical baseline for all game rules and mechanics. 
- **Mechanics Cross-Validation:** While translated files (`srd-spells-2024_<LANG>.json`) supply localized display text (spell names, descriptions, material descriptions), the normalization pipeline validates all gameplay mechanics (spell level, school, concentration, ritual, verbal/somatic/material component flags, saving throws, core classes, damage types, subclasses) against the canonical English spell, inheriting English `subclasses` when a translation omits them.
- **Fail-Fast Policy:** If a translation file introduces conflicting mechanics or unknown properties, normalization fails the build rather than silently accepting incorrect rules.

#### C. Canonical Stable IDs (`id: "srd-<index>"`)
- Spells are assigned deterministic, canonical IDs derived from the upstream English slug (e.g., `index: "acid-splash"` becomes `id: "srd-acid-splash"`).
- These IDs are **identical across all languages**.
- This enables persistent decks and cross-language switching: a deck created in English still points to `srd-acid-splash` when switched to German (`srd-acid-splash` resolves to *Säurespritzer*), without mutating the deck entries or database records.

#### D. Canonical BCP 47 Locales
- Discovered translation filenames are parsed and canonicalized using standard BCP 47 tags via `Intl.getCanonicalLocales` (e.g., `pt-BR`, `de`), rejecting case-insensitive duplicate tags or malformed locale identifiers.
- There are no language-specific adapters: every source is normalized into the canonical English schema by the shared adapter, which restores canonical names/slugs while preserving localized free text.

---

### 4. Adding or Updating SRD Translations (German, French, Spanish, etc.)

Follow this standard procedure to introduce new languages or update existing translation datasets:

> **Removed legacy tooling:** `scripts/srd/german.ts`, `GERMAN_CLASS_BY_NAME`, the `de` adapter branch, `scripts/convert-german-srd.ts`, `src/test/german-conversion.test.ts`, the `convert:german-srd` npm script and `data/srd/canonical-english.snapshot.json` no longer exist. German now uses the shared adapter, and drift is guarded by `src/test/srd-dataset.test.ts`.

#### 1. Place and Name the Input File Correctly
Save the translation input directly inside `data/srd/` following the naming convention:

```text
data/srd/srd-spells-2024_<LANG>.json
```

Where `<LANG>` is a valid canonical **BCP 47 language tag** (e.g., `de` for German, `fr` for French, `es` for Spanish, `pt-BR` for Brazilian Portuguese).

Examples:
- German: `data/srd/srd-spells-2024_de.json`
- French: `data/srd/srd-spells-2024_fr.json`
- Spanish: `data/srd/srd-spells-2024_es.json`

*(Note: there is no canonical snapshot file any more — the former `canonical-english.snapshot.json` was removed in the source-format refactoring. Drift is guarded by `src/test/srd-dataset.test.ts` reading the committed datasets, so no snapshot files are needed or expected.)*

#### 2. Ensure Source Shape Compatibility
The normalization pipeline processes translation inputs through the shared adapter:
- **Canonical source shape:** English, German, and every future translation use the same shape (string `school`, string[] `classes`, optional `subclasses`, `V`/`S`/`M` components, string `damage.damage_type`), so `scripts/srd/shared-translation.ts` handles them with zero code changes.
- **Legacy files:** a 5e-bits-shaped file (object `school.index`, `classes[].index`, top-level `url`) is rejected with a message pointing at the migration tool (`pnpm exec tsx scripts/migrate-srd-source-format.ts --apply`; see §2.F).
- **Cross-Validation Rule:** Translated text (`name`, `description`, `materialDescription`) will be preserved, but **gameplay mechanics must match canonical English** (spell level, school, concentration, ritual, damage types, saving throws, core classes, subclasses). Any discrepancy or unknown spell index will intentionally fail the build.

#### 3. Run the Normalization Script
Run the build script in your terminal:

```powershell
pnpm run normalize:srd
```

This script will automatically:
- Discover all `data/srd/srd-spells-2024_<LANG>.json` files via BCP 47 tags.
- Cross-validate mechanics against English.
- Generate the normalized runtime dataset in `src/data/spells.srd.<lang>.json` (e.g., `src/data/spells.srd.de.json`).
- Rebuild `src/data/spell-languages.json` to include the language code, localized display name (via `Intl.DisplayNames`), and dataset URL.

#### 4. Launch and Refresh the Browser
1. Start your development server:
   ```powershell
   pnpm run dev
   ```
2. Because the application uses `vite-plugin-pwa` with aggressive offline precaching, your browser may still hold the previous service-worker cache. Perform a hard refresh (**Ctrl+F5** / **Cmd+Shift+R**) or open DevTools → **Application** → **Storage** → **Clear site data**.
3. The new language will now appear in the header's language dropdown selector.

---

### 5. Custom Spell Format & Import Specification

Custom spells are authored, stored, and imported in the application's **internal `Spell` domain schema** (`src/domain/spells.ts`, `spellSchema`) — they do **not** use the raw SRD source structure described in §2. A custom spell has no `index`, `school` name string, `classes` name strings, `subclasses` identifier strings, `casting_time`, `higher_level`, or `damage.damage_type`; its fields are already normalized (`school` is a canonical enum string, `components` is a boolean object, `classes` is a plain string array).

#### A. Raw SRD vs. custom spell shape

| Concept                    | Raw SRD input (§2)                    | Custom spell / `Spell` schema                                                    |
| -------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| Top level                  | JSON array of entries                 | import envelope `{version,type,spells:[...]}`; each stored record is one `Spell` |
| Identity                   | `index` slug → `id: "srd-<index>"`    | `id` supplied directly (UUID for new spells); `srd-` prefix reserved             |
| Level                      | `level`                               | `level`                                                                          |
| School                     | `school` canonical name (`Evocation`) | `school` canonical enum name (`Evocation`)                                       |
| Classes                    | `classes` canonical names             | `classes` plain string array                                                     |
| Subclasses                 | `subclasses` `"<Class>: <Sub>"`       | `subclasses` plain string array (optional)                                       |
| Casting / range / duration | `casting_time`, `range`, `duration`   | `castingTime`, `range`, `duration`                                               |
| Components                 | `components: ["V","S"]` + `material`  | `components` object with boolean flags                                           |
| Higher levels              | `higher_level` / `higher_levels`      | `higherLevels`                                                                   |
| Source                     | implied canonical (`SRD-5.2.1`)       | `source: "Custom"`                                                               |
| Timestamp                  | —                                     | `updatedAt` (set by the app on save)                                             |

#### B. Import envelope

Custom-spell export/import uses versioned strict schemas in `src/domain/payloads.ts`. The
**deck** payload version stays `EXPORT_VERSION = "1.0.0"`; custom-spell payloads use
`CUSTOM_SPELL_EXPORT_VERSION = "1.1.0"`.

Version `1.0.0` (`customSpellExportPayloadSchemaV1`, legacy, no overrides):

```json
{
  "version": "1.0.0",
  "type": "custom-spells",
  "spells": []
}
```

Version `1.1.0` (`customSpellExportPayloadSchemaV2`, adds an optional `srdSpellOverrides`
array):

```json
{
  "version": "1.1.0",
  "type": "custom-spells",
  "spells": [],
  "srdSpellOverrides": [
    { "spellId": "srd-fireball", "locale": "en", "verbalDescription": "Speak the word" }
  ]
}
```

- `type` must be exactly `"custom-spells"`; other payload types are rejected.
- New custom-spell exports always stamp `1.1.0`, even when `srdSpellOverrides` is empty.
- The importer accepts `1.0.0` and `1.1.0`. A `1.0.0` payload carries no overrides and leaves
  local overrides untouched. Any other version triggers the best-effort **Unknown version —
  Try Import** path: only fields recognized by the current schema are extracted, unknown
  fields are discarded, and all mandatory fields must still be present. A recognized
  `1.1.0` payload is never routed through this fallback.
- Unknown versions that contain a non-empty `srdSpellOverrides` (or other dropped fields) are
  marked **lossy**: the reported override record(s) and fields require explicit confirmation
  before commit, so overrides are never silently discarded.
- Each override record is validated with `validateSrdOverride` (`src/domain/srd-overrides.ts`):
  `spellId` must be a canonical `srd-` id present in the loaded SRD data, `locale` must be a
  manifest locale, only `verbalDescription`/`somaticDescription` may be present, both are
  bounded by `META_MAX` (500), and a description is only allowed for a component enabled on
  the canonical spell. Every invalid record is reported (index, `spellId`, `locale`, reason)
  and the whole import aborts atomically. Empty override records are no-ops.
- The envelope is a strict object, so unknown top-level keys are rejected. Individual spell
  objects are non-strict, so unknown spell keys are silently stripped.
- The import payload is capped at **5 MiB**; oversize files are rejected before parsing.
- Every custom-spell record must have `source: "Custom"`. SRD-sourced records (`SRD-5.2.1`)
  are rejected rather than relabeled.
- IDs beginning with the reserved `srd-` prefix are remapped to fresh UUIDs (reported as
  old → new); other valid IDs are preserved. Newly authored spells always use `newUuid()`.

#### C. Field requirements

**Mandatory** (a record fails validation if any is missing or out of bounds):

| Field           | Type / constraint                                         |
| --------------- | --------------------------------------------------------- |
| `id`            | trimmed non-empty string, ≤120 chars                      |
| `name`          | trimmed non-empty string, ≤120 chars                      |
| `level`         | integer 0–9                                               |
| `school`        | one of the 8 `SPELL_SCHOOLS` enum values                  |
| `castingTime`   | trimmed non-empty string, ≤500 chars                      |
| `range`         | trimmed non-empty string, ≤500 chars                      |
| `components`    | object; `verbal`, `somatic`, `material` booleans required |
| `duration`      | trimmed non-empty string, ≤500 chars                      |
| `concentration` | boolean                                                   |
| `ritual`        | boolean                                                   |
| `classes`       | string[] (each ≤80 chars, unique) — may be empty          |
| `description`   | string[] with at least 1 entry (each ≤20,000 chars)       |
| `source`        | `"SRD-5.2.1"` or `"Custom"`                               |

**Optional / nullable** (omitted fields validate as `undefined`; the schema adds no defaults):

| Field                                  | Type / constraint                                           | Default when omitted                            |
| -------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| `components.verbalDescription`         | trimmed string ≤500                                         | omitted                                         |
| `components.somaticDescription`        | trimmed string ≤500                                         | omitted                                         |
| `components.materialDescription`       | trimmed string ≤500                                         | omitted                                         |
| `components.materialCost`              | trimmed string ≤500                                         | omitted                                         |
| `components.materialConsumed`          | boolean                                                     | omitted (must match English for translations)   |
| `components.componentsDisplayOverride` | trimmed string ≤500                                         | omitted                                         |
| `savingThrow`                          | `ABILITY_SCORES` enum (`STR`,`DEX`,`CON`,`INT`,`WIS`,`CHA`) | omitted                                         |
| `damageTypes`                          | string[] (each ≤500 chars)                                  | omitted                                         |
| `subclasses`                           | string[] (each ≤500 chars, unique)                          | omitted                                         |
| `higherLevels`                         | string[] (each ≤20,000 chars)                               | omitted                                         |
| `sourceLabel`                          | trimmed string ≤500                                         | omitted                                         |
| `updatedAt`                            | non-negative integer                                        | set to `Date.now()` by `putCustomSpell` on save |

Two cross-field rules also apply: combined `description` + `higherLevels` text must be ≤50,000 chars, and `classes`/`subclasses` values must be unique. The runtime schema only enforces non-empty, unique, length-bounded `subclasses` entries; the `"<CORE_CLASS>: <Subclass>"` prefix rule is enforced by the raw SRD adapter, keeping custom spells and imports tolerant. The schema never invents mandatory game-rule values; the authoring draft (`createCustomSpellDraft(language)`) seeds UI defaults (localized casting time/range/duration, level `0`, school `Evocation`, all component flags `false`, `description: [""]`, empty `classes`) but those are not schema defaults — an imported record must supply the mandatory fields itself.

#### D. Storage

Custom spells persist in the Dexie `customSpells` table (`src/db/database.ts`), keyed by `id` with secondary indexes on `id`, `name`, and `updatedAt`. `putCustomSpell`, `updateCustomSpell`, `duplicateCustomSpell`, and the import commit all re-validate with `spellSchema` before writing; custom IDs that use the reserved `srd-` prefix are rejected.

#### E. Compact valid custom-spell example

```json
{
  "version": "1.0.0",
  "type": "custom-spells",
  "spells": [
    {
      "id": "9a6c1e2f-3b4d-5e6f-7a8b-9c0d1e2f3a4b",
      "name": "Frost Lance",
      "level": 2,
      "school": "Evocation",
      "castingTime": "1 Action",
      "range": "60 feet",
      "components": { "verbal": true, "somatic": true, "material": false },
      "duration": "Instantaneous",
      "concentration": false,
      "ritual": false,
      "classes": ["Sorcerer", "Wizard"],
      "damageTypes": ["cold"],
      "description": ["A lance of ice streaks toward a target..."],
      "higherLevels": ["The damage increases by 1d6 per slot level above 2."],
      "source": "Custom",
      "updatedAt": 1730000000000
    }
  ]
}
```

#### F. Component authoring & SRD component-text overrides

`components.verbalDescription`, `components.somaticDescription`, `components.materialCost`,
and `components.materialConsumed` exist in the domain schema (`src/domain/spells.ts`) and are
now authorable in the UI:

- **Custom spells** persist these fields directly in the `customSpells` table. `materialCost`
  and `materialConsumed` sit behind a collapsed **Advanced / Optional** section, gated by the
  `M` flag.
- **SRD spells** are never written to `customSpells` and `src/data/**` is never modified.
  Only `verbalDescription`/`somaticDescription` are editable in a restricted override dialog;
  they persist per spell **and** locale in the `srdSpellOverrides` Dexie table
  (`[spellId+locale], spellId, locale`), added by an additive `version(2)` migration. The
  merge is applied at read time over the loaded dataset, and an active override marks the
  source badge (`SRD 5.2.1 *`) via a transient, non-persisted `Spell.overridden` flag that is
  excluded from `spellSchema`, imports, and exports. **Reset to original** deletes only the
  current spell/locale record.

Because the merge happens after dataset parsing and copies rather than mutates, the shared
dataset cache in `src/services/data/load.ts` stays override-free and the drift gate
(`src/test/srd-dataset.test.ts`) is unaffected.
