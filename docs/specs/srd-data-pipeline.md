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

### 2. The Role of "Canonical"

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

### 3. Adding or Updating SRD Translations (German, French, Spanish, etc.)

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
