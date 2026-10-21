# SRD Data Pipeline & Normalization

This document details how SRD spells are processed, validated, and loaded into the application from JSON files, the architectural role of "canonical" concepts, and the step-by-step procedure for adding new language translations.

---

### 1. How Spells Are Loaded from JSON Files

The spell loading process is divided into two distinct phases: **Build/Normalization Time** (converting raw data to static public artifacts) and **Runtime Application Loading** (fetching, validating, and hydrating the app state).

#### A. Build-Time Generation & Serving
1. **Raw Input Files:** 
   Raw SRD spells reside in `data/srd/` as `5e-SRD-Spells.json` (canonical English) and `5e-SRD-Spells_<LANG>.json` (translated inputs, e.g., German `de`).
2. **Normalization Script (`scripts/normalize-srd.ts`):** 
   - Discovers inputs via adapters (`srd/english.ts`, `srd/german.ts`, `srd/shared-translation.ts`).
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

- `5e-SRD-Spells.json` — mandatory canonical English source (5e-bits 2024 schema).
- `5e-SRD-Spells_<LANG>.json` — optional translation sources.

Every raw file is a **JSON array of spell entries** (never a wrapper object such as `{ "spells": [...] }`). Each entry is validated at the raw level and then normalized into the internal `Spell` domain shape before the mechanics cross-check runs.

#### A. Expected top-level structure

- The top level must be an array; a non-array file fails the build with `top-level JSON must be an array of spells`.
- Each element must be an object with a string `index`. Duplicate `index`/`id` values within a file fail the build.

#### B. Raw fields consumed per entry

| Raw field | Type | Requirement | Normalized into |
| --- | --- | --- | --- |
| `index` | string | required; upstream slug | `id: "srd-<index>"` |
| `name` | string | required | `name` (translated text preserved) |
| `level` | integer 0–9 | required | `level` |
| `school.index` | string | required; canonical school slug (e.g. `evocation`) | `school` (canonical `SpellSchool`) |
| `classes[]` | array | required | `classes` (canonical `CoreClass[]`) — see shape rules below |
| `casting_time` | string | required | `castingTime` (translated text preserved) |
| `range` | string | required; must not contain `component`/`komponente` | `range` (translated text preserved) |
| `components` | string[] | required; at least one letter | `components.verbal` / `somatic` / `material` |
| `material` | string | optional | `components.materialDescription` when `M` is present |
| `duration` | string | required | `duration` (translated text preserved) |
| `concentration` | boolean | required (missing coerces to `false`) | `concentration` |
| `ritual` | boolean | required (missing coerces to `false`) | `ritual` |
| `description` | string \| string[] | optional (missing → `[""]`) | `description` |
| `higher_level` / `higher_levels` | string \| string[] | optional | `higherLevels` |
| `damage.damage_type.index` | string | optional | `damageTypes: [<lowercased index>]` |

Any other upstream properties (`url`, `attack_type`, `damage.damage_at_slot_level`, etc.) are not consumed; the adapters ignore unread properties rather than rejecting the entry.

Note: raw inputs do **not** supply `savingThrow`. It is never read from SRD sources, so a translation can only be cross-checked on `savingThrow` when it (unusually) declares one.

#### C. Component letters and class identifiers by adapter

The adapter is selected by probing the file with `isCanonicalSourceShape`:

- **Canonical / shared shape** (`scripts/srd/shared-translation.ts` → `normalizeEnglish`): component letters are `V` (verbal), `S` (somatic), `M` (material); classes are identified by `classes[].index` (canonical core-class slugs such as `wizard`).
- **German variant** (`scripts/srd/german.ts`): component letters are `V` (verbal), `G` (Geste → somatic), `M` (material); classes are identified by German `classes[].name` (e.g. `Magier` → `Wizard`); `higher_levels` is accepted as well as `higher_level`.

Selection rule: if the whole file satisfies the canonical-shape probe — every entry has a string `index`, a string `school.index`, a `classes[]` of objects each with a string `index`, and `components` limited to `V`/`S`/`M` — the shared adapter is used. Otherwise a language-specific adapter is required (currently only `de`); any other structure fails the build with a `unsupported translation source structure` error rather than being skipped.

#### D. Minimal representative raw example

```json
[
  {
    "index": "acid-splash",
    "name": "Acid Splash",
    "level": 0,
    "school": { "index": "evocation", "name": "Evocation" },
    "classes": [
      { "index": "sorcerer", "name": "Sorcerer" },
      { "index": "wizard", "name": "Wizard" }
    ],
    "casting_time": "Action",
    "range": "60 feet",
    "components": ["V", "S"],
    "duration": "Instantaneous",
    "concentration": false,
    "ritual": false,
    "description": "You hurl a bubble of acid...",
    "damage": { "damage_type": { "index": "acid" } }
  }
]
```

#### E. Mechanics that must strictly match canonical English

Translation files may localize free text (`name`, `description`, `casting_time`, `range`, `duration`, `material`), but every language-independent mechanic is cross-validated against the normalized English spell by `scripts/srd/validate.ts`. Normalization fails — reporting the source filename and the offending index — when a translated entry:

- references an unknown canonical English ID (translations must reuse the canonical `index`);
- disagrees on `level`, `school`, `concentration`, `ritual`, or `source`;
- disagrees on component presence (`verbal`, `somatic`, `material`);
- disagrees on `classes` (compared as a set) or on `components.materialConsumed` **when the translated entry provides it**;
- provides `damageTypes` or `savingThrow` that differ from English.

`index`, `school`, `classes`, and `damageType` identifiers are always mapped to canonical values, so both languages resolve to the same `srd-<index>` identity.

Canonical identifiers — including `damageType` (stored lowercased, e.g. `"fire"`) — are never translated in the data pipeline. Localized display labels (school names, class names, component letters, and damage-type names) are applied only at render time by the `src/locales/` catalogs, with English used as the fallback for any value absent from the catalog.

---

### 3. The Role of "Canonical"

The term **canonical** operates across multiple layers as the bedrock for data integrity, drift detection, and multilingual synchronization:

#### A. The Canonical English Snapshot (`canonical-english.snapshot.json`)
- **Pinned Golden Record:** After the English data is normalized and reviewed, it is pinned in `data/srd/canonical-english.snapshot.json`.
- **Drift Prevention / Build Gate:** On every subsequent build or normalization run (`pnpm run normalize:srd`), the newly normalized English data is compared against this snapshot for exact JSON equality, spell count, and IDs.
- **Intentional Updates:** If upstream SRD files change, the build will immediately fail unless the changes are deliberately reviewed and the snapshot is explicitly updated. This ensures no unintended data corruption or upstream schema shifts slip into production. Snapshots are strictly reserved for English regression testing; do not create snapshot files for translated languages.

#### B. Canonical Source of Truth for Mechanics
- **Enforcing Rules Across Languages:** The English dataset is the canonical baseline for all game rules and mechanics. 
- **Mechanics Cross-Validation:** While translated files (`5e-SRD-Spells_<LANG>.json`) supply localized display text (spell names, descriptions, material descriptions), the normalization pipeline validates all gameplay mechanics (spell level, school, concentration, ritual, verbal/somatic/material component flags, saving throws, core classes, damage types) against the canonical English spell.
- **Fail-Fast Policy:** If a translation file introduces conflicting mechanics or unknown properties, normalization fails the build rather than silently accepting incorrect rules.

#### C. Canonical Stable IDs (`id: "srd-<index>"`)
- Spells are assigned deterministic, canonical IDs derived from the upstream English slug (e.g., `index: "acid-splash"` becomes `id: "srd-acid-splash"`).
- These IDs are **identical across all languages**.
- This enables persistent decks and cross-language switching: a deck created in English still points to `srd-acid-splash` when switched to German (`srd-acid-splash` resolves to *Säurespritzer*), without mutating the deck entries or database records.

#### D. Canonical BCP 47 Locales and Adapters
- Discovered translation filenames are parsed and canonicalized using standard BCP 47 tags via `Intl.getCanonicalLocales` (e.g., `pt-BR`, `de`), rejecting case-insensitive duplicate tags or malformed locale identifiers.
- Canonical English serves as the standard schema model that custom source-structure adapters (such as mapping German components `G` (Geste) to canonical `somatic`, or German class names to canonical classes) must normalize into.

---

### 4. Adding or Updating SRD Translations (German, French, Spanish, etc.)

Follow this standard procedure to introduce new languages or update existing translation datasets:

#### 1. Place and Name the Input File Correctly
Save the translation input directly inside `data/srd/` following the naming convention:

```text
data/srd/5e-SRD-Spells_<LANG>.json
```

Where `<LANG>` is a valid canonical **BCP 47 language tag** (e.g., `de` for German, `fr` for French, `es` for Spanish, `pt-BR` for Brazilian Portuguese).

Examples:
- German: `data/srd/5e-SRD-Spells_de.json`
- French: `data/srd/5e-SRD-Spells_fr.json`
- Spanish: `data/srd/5e-SRD-Spells_es.json`

*(Note: Do not create files named `canonical-<lang>.snapshot.json`. The snapshot mechanism is strictly reserved for the English golden-record integrity check.)*

#### 2. Ensure Source Shape Compatibility
The normalization pipeline processes translation inputs through adapters:
- **Canonical Upstream Format:** For French, Spanish, or other standard translations following the upstream 5e-bits structure, `scripts/srd/shared-translation.ts` handles them automatically with zero code changes.
- **Structural Differences (German):** The repository includes a dedicated German adapter (`scripts/srd/german.ts`) which maps German conventions (e.g., component `G` → `somatic`, German class names like `Magier` → `Wizard`, and `higher_levels` → `higherLevels`).
- **Cross-Validation Rule:** Translated text (`name`, `description`, `materialDescription`) will be preserved, but **gameplay mechanics must match canonical English** (spell level, school, concentration, ritual, damage types, saving throws, core classes). Any discrepancy or unknown spell index will intentionally fail the build.

#### 3. Run the Normalization Script
Run the build script in your terminal:

```powershell
pnpm run normalize:srd
```

This script will automatically:
- Discover all `data/srd/5e-SRD-Spells_<LANG>.json` files via BCP 47 tags.
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

Custom spells are authored, stored, and imported in the application's **internal `Spell` domain schema** (`src/domain/spells.ts`, `spellSchema`) — they do **not** use the raw 5e-bits SRD structure described in §2. A custom spell has no `index`, `school.index`, `classes[].index`, `casting_time`, `higher_level`, or `damage.damage_type`; its fields are already normalized (`school` is a canonical enum string, `components` is a boolean object, `classes` is a plain string array).

#### A. Raw SRD vs. custom spell shape

| Concept | Raw SRD input (§2) | Custom spell / `Spell` schema |
| --- | --- | --- |
| Top level | JSON array of entries | import envelope `{version,type,spells:[...]}`; each stored record is one `Spell` |
| Identity | `index` slug → `id: "srd-<index>"` | `id` supplied directly (UUID for new spells); `srd-` prefix reserved |
| Level | `level` | `level` |
| School | `school.index` slug (`evocation`) | `school` canonical enum name (`Evocation`) |
| Classes | `classes[].index` / `classes[].name` | `classes` plain string array |
| Casting / range / duration | `casting_time`, `range`, `duration` | `castingTime`, `range`, `duration` |
| Components | `components: ["V","S"]` + `material` | `components` object with boolean flags |
| Higher levels | `higher_level` / `higher_levels` | `higherLevels` |
| Source | implied canonical (`SRD-5.2.1`) | `source: "Custom"` |
| Timestamp | — | `updatedAt` (set by the app on save) |

#### B. Import envelope

Custom-spell export/import uses `spellExportPayloadSchema` (`src/domain/payloads.ts`), a **strict** object:

```json
{
  "version": "1.0.0",
  "type": "custom-spells",
  "spells": []
}
```

- `type` must be exactly `"custom-spells"`; other payload types are rejected.
- `version` must be exactly `"1.0.0"` for strict validation. Any other version triggers the best-effort **Unknown version — Try Import** path: only fields recognized by the current `1.0.0` schema are extracted, unknown fields are discarded, and all mandatory fields must still be present.
- The envelope is a strict object, so unknown top-level keys are rejected. Individual spell objects are non-strict, so unknown spell keys are silently stripped.
- The import payload is capped at **5 MiB**; oversize files are rejected before parsing.
- Every record must have `source: "Custom"`. SRD-sourced records (`SRD-5.2.1`) are rejected rather than relabeled.
- IDs beginning with the reserved `srd-` prefix are remapped to fresh UUIDs (reported as old → new); other valid IDs are preserved. Newly authored spells always use `newUuid()`.

#### C. Field requirements

**Mandatory** (a record fails validation if any is missing or out of bounds):

| Field | Type / constraint |
| --- | --- |
| `id` | trimmed non-empty string, ≤120 chars |
| `name` | trimmed non-empty string, ≤120 chars |
| `level` | integer 0–9 |
| `school` | one of the 8 `SPELL_SCHOOLS` enum values |
| `castingTime` | trimmed non-empty string, ≤500 chars |
| `range` | trimmed non-empty string, ≤500 chars |
| `components` | object; `verbal`, `somatic`, `material` booleans required |
| `duration` | trimmed non-empty string, ≤500 chars |
| `concentration` | boolean |
| `ritual` | boolean |
| `classes` | string[] (each ≤80 chars, unique) — may be empty |
| `description` | string[] with at least 1 entry (each ≤20,000 chars) |
| `source` | `"SRD-5.2.1"` or `"Custom"` |

**Optional / nullable** (omitted fields validate as `undefined`; the schema adds no defaults):

| Field | Type / constraint | Default when omitted |
| --- | --- | --- |
| `components.verbalDescription` | trimmed string ≤500 | omitted |
| `components.somaticDescription` | trimmed string ≤500 | omitted |
| `components.materialDescription` | trimmed string ≤500 | omitted |
| `components.materialCost` | trimmed string ≤500 | omitted |
| `components.materialConsumed` | boolean | omitted (must match English for translations) |
| `components.componentsDisplayOverride` | trimmed string ≤500 | omitted |
| `savingThrow` | `ABILITY_SCORES` enum (`STR`,`DEX`,`CON`,`INT`,`WIS`,`CHA`) | omitted |
| `damageTypes` | string[] (each ≤500 chars) | omitted |
| `higherLevels` | string[] (each ≤20,000 chars) | omitted |
| `sourceLabel` | trimmed string ≤500 | omitted |
| `updatedAt` | non-negative integer | set to `Date.now()` by `putCustomSpell` on save |

Two cross-field rules also apply: combined `description` + `higherLevels` text must be ≤50,000 chars, and `classes` values must be unique. The schema never invents mandatory game-rule values; the authoring draft (`createCustomSpellDraft`) seeds UI placeholders (level `0`, school `Evocation`, all component flags `false`, `description: [""]`, empty `classes`) but those are not schema defaults — an imported record must supply the mandatory fields itself.

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
