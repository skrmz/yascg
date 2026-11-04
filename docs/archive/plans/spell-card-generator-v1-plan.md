# Spell Card Generator v1.0.0 — Implementation Plan

**Spec:** `docs/specs/MAIN-spec.md` (normative)  
**Goal:** Ship the complete offline-first PWA described by spec v1.0.0: multilingual SRD library, custom spells, one active deck + named saved decks, safe Markdown cards, Letter/A4 3×3 printing, JSON import/export, and offline precache.

## Current State

- Repository is a fresh Vite+ vanilla-TS scaffold (`src/main.ts`, `src/counter.ts`, starter CSS/assets).
- `data/srd/srd-spells-2024.json` (full 2024 English SRD, 5e-bits schema) and `data/srd/srd-spells-2024_de.json` (3-spell partial German sample) are present.
- No React, Dexie, Zod, Tailwind, tests, or PWA setup yet.
- Vite+ (`vp`) is the toolchain. Use `vp install`, `vp check`, `vp test`, `vp build`; browser E2E via Playwright.

## Key Decisions

1. **Stack:** React 19 + TypeScript strict, Vite+ with `@vitejs/plugin-react`, Tailwind v4 (`@tailwindcss/vite`), shadcn-style Radix primitives, Lucide icons, Dexie, Zod, Fuse.js, `marked` token walker.
2. **Generated data location & static assets:** `scripts/normalize-srd.ts` writes generated build artifacts only to `src/data/`: `spells.srd.json`, `spells.srd.<lang>.json`, and `spell-languages.json`. Configure Vite `publicDir: "src/data"` so these artifacts are served at stable URLs (`/spells.srd.de.json`, `/spell-languages.json`) and copied into `dist/` root for precache. **Never place TypeScript source files in `src/data/`**; all data services, fetching, and search logic live strictly in `src/services/data/`.
3. **Canonical snapshot:** Generate and commit `data/srd/canonical-english.snapshot.json` after reviewing the normalized English output. The normalize script fails if normalized English differs from the snapshot (full JSON equality, count, IDs).
4. **Normalization is adapter-based and language-extensible:** English is the canonical normalization reference. Implement a shared normalization pipeline for translation files following the canonical upstream structure, plus explicit source-shape adapters for structural variations (initially German). Language discovery must not depend on a hardcoded language allowlist. Newly discovered valid translation files must be processed automatically when their source structure is supported. Unsupported structures must fail the build with a clear filename/index/field diagnostic, never silently skip the language or weaken the runtime `Spell` schema. All adapters normalize `description` to `string[]` and `higherLevels` to `string[] | undefined`.
5. **Markdown is parsed to a safe AST:** `marked` tokens → own `BlockNode[]`/`InlineNode[]`; raw HTML disabled; links rendered as non-clickable text. No `innerHTML` for imported content.
6. **Card fitting uses real DOM measurement & font readiness:** Hidden fixed-size card rendered with print CSS, awaiting `document.fonts.ready` before taking measurements. Auto-shrink/truncate or multi-card pagination splits over AST blocks, enforcing block, sentence, word, and grapheme boundaries (`Intl.Segmenter`). Never orphan a heading when its following body block can move with it. String splitting is deterministic and unit-testable; DOM measurement and font layout are browser-tested.
7. **Persistence & preference fallback:** Dexie schema version 1 with `customSpells`, `savedDecks`, and singleton `activeDeck` (`id: "active"`). Language preference is stored exclusively in `localStorage` (`spellCards.language`), wrapped in try/catch; if preference storage throws (quota, disabled, private browsing), retain the selection in memory and show a visible warning that preference will not survive reload.
8. **Concurrency:** One `compareAndSwapActiveDeck` helper and one `compareAndSwapSavedDeck` helper, both using Dexie read-write transactions; `BroadcastChannel` is advisory only.
9. **PWA & local fonts:** `vite-plugin-pwa` precaches shell + manifest + every dataset + bundled local fonts. Offline-ready is only claimed after verifying each dataset URL and font asset is in Cache Storage; failures show **Offline setup incomplete — Retry**.
10. **Printing:** Strict physical CSS (separate from Tailwind), hidden print root, 3×3 grid, dynamic `@page { size: letter|A4; margin: 0 }` injected from the selected paper size.

## Target File Structure

```text
scripts/
  normalize-srd.ts                 # discovery, adapters, validation, snapshot, manifest
  srd/english.ts                   # English source adapter (emits description: string[])
  srd/shared-translation.ts        # Generic translation normalization for supported canonical source shapes
  srd/german.ts                    # German source adapter (G→S, class map, higher_levels, description: string[])
  srd/discovery.ts                 # file discovery, BCP 47 canonicalization
  srd/validate.ts                  # cross-language canonical-mechanics checks
src/
  data/                            # generated build artifacts only (Vite publicDir)
                                   # spells.srd.json, spells.srd.<lang>.json, spell-languages.json
  assets/
    fonts/                         # bundled local print/display fonts
  domain/
    spells.ts                      # consts, TS types, Zod Spell/component schemas, limits
    deck.ts                        # DeckEntry, ActiveDeck, SavedDeck, baselines, dirty
    payloads.ts                    # custom-spell + deck export/import Zod schemas
    ids.ts                         # srd- reservation, UUID/remap helpers
  db/
    database.ts                    # Dexie schema v1
    active-deck.ts                 # CAS transactions, mutations, delete/undo, repair
    saved-decks.ts                 # save/load/overwrite/delete CAS
    custom-spells.ts               # CRUD + transactional deletion
    notifications.ts               # BroadcastChannel wrapper
  services/
    data/
      load.ts                      # manifest + dataset fetch/validation/cache
      language.ts                  # preference persistence, try/catch fallback rules
      search.ts                    # Fuse index, filters, collator sorting
  markdown/
    parse.ts                       # marked tokens → safe block/inline AST
    render.tsx                     # React renderer; links as text
    split.ts                       # block/sentence/word/grapheme prefix, heading-orphan prevention, page chunks
  cards/
    Card.tsx                       # screen/print card chrome
    fit.ts                         # measurement, fonts.ready, auto-shrink, truncation, multi-card
    fingerprint.ts                 # cache keys (content + language + mode + styles)
  print/
    print.css                      # physical card/grid/@page rules, font faces
    PrintSheet.tsx                 # 9-up sheets, omission/count handling
  io/
    export.ts                      # filenames, stable sorted exports
    import-custom.ts               # validation, collisions, remap, atomic commit
    import-deck.ts                 # validation, reference resolution, replace
  pwa/
    register.ts                    # registerSW, offline verification, update prompt
  ui/                              # shadcn-style Button/Dialog/Tabs/Tooltip/Popover/etc.
  components/
    AppShell.tsx, Header.tsx, AboutDialog.tsx, OfflineStatus.tsx
    library/, details/, deck/, custom-spells/, import-export/, print/
  state/
    AppProvider.tsx                # session state, undo, dirty, pending confirmations
  test/
    setup.ts, fixtures/
  App.tsx
  main.tsx
  index.css                        # Tailwind entry + app styles
e2e/
  *.spec.ts
```

## Ordered Implementation Tasks

### 0. Scaffold and Tooling
- Remove starter demo (`counter.ts`, hero assets, starter markup/CSS).
- Add deps: `react`, `react-dom`, `dexie`, `dexie-react-hooks`, `zod`, `fuse.js`, `marked`, `tailwindcss`, `@tailwindcss/vite`, Radix packages (`dialog`, `tabs`, `tooltip`, `popover`, `slot`, `label`), `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `vite-plugin-pwa`.
- Dev deps: `@vitejs/plugin-react`, `tsx`, `@playwright/test`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `fake-indexeddb`, `@types/react`, `@types/react-dom`.
- Set up local web fonts under `src/assets/fonts/` and register them in CSS with `@font-face` for offline and print determinism.
- Configure `tsconfig.json` (`jsx: react-jsx`, `strict`, DOM libs, include tests/e2e where safe), `vite.config.ts` (React, Tailwind, PWA, test block, `@` alias, `publicDir: "src/data"`).
- Add scripts strictly matching the spec appendix:
  - `"normalize:srd": "tsx scripts/normalize-srd.ts"`
  - `"build": "pnpm run normalize:srd && vp build"`
  - `"dev": "vp dev"`
  - `"preview": "vp preview"`
  - `"test": "vp test"`
  - `"check": "vp check"`
  - `"test:e2e": "playwright test"`
- Acceptance: `vp dev` renders an app shell; `vp check` and `vp test` run.

### 1. Domain Schemas and Validation
- Implement `SPELL_SCHOOLS`, `CORE_CLASSES`, types, and Zod schemas for `SpellComponents`, `Spell`, `DeckEntry`, `ActiveDeck`, `SavedDeck`, `SpellExportPayload`, `DeckExportPayload`.
- Enforce all §4 limits:
  - `name`: trimmed, 1–120 characters; `level`: integer 0–9; `school`: one of 8 enum values.
  - `castingTime`, `range`, `duration`: trimmed, non-empty free-text strings up to 120 characters.
  - `classes`: zero or more unique, non-empty trimmed strings up to 80 characters each.
  - `description`: `z.array(z.string()).min(1)`, max 20,000 characters per item, combined description/higher-level cap of 50,000 characters.
  - `higherLevels`: optional array of strings, max 20,000 characters per item.
  - Optional metadata and damage types: max 500 characters per value.
  - `source`: `"SRD-5.2.1" | "Custom"`.
  - ID rules: `srd-` prefix strictly reserved for bundled spells; custom spells use non-empty strings (UUID for newly created custom spells, `entryId`s and saved deck IDs).
  - Limits: JSON custom import max 5 MiB; JSON deck import max 5 MiB and 2,000 entries.
- Use `.strict()` for `1.0.0` export/import envelopes; provide a separate "extract recognized fields" parser for unknown-version Try Import. Stored records strip unknown fields.
- Add `dirty` comparison between active name/entries and baseline (comparing `entryId`, `spellId`, `fitMode`, `reference`), ignoring `revision`.
- Acceptance: unit tests for every field limit, enum, duplicate class, invalid fit/source, and baseline dirty rules.

### 2. Multilingual SRD Normalization + Manifest
- Implement discovery of `data/srd/srd-spells-2024.json` plus `srd-spells-2024_<LANG>.json` in `./data/srd/`; validate filenames, canonicalize tags with `Intl.getCanonicalLocales`, reject duplicate tags case-insensitively and duplicate assets.
- English adapter (`scripts/srd/english.ts`):
  - `id = srd-${index}`.
  - `school` from `school.index`.
  - `classes` from `classes[].index` (core only; fail on unknown).
  - `components` mapped to boolean flags (`verbal`, `somatic`, `material`), `material` text preserved in `materialDescription`.
  - `damage.damage_type.index` → `damageTypes`.
  - `higher_level` → `higherLevels: string[]`.
  - `description`: preserve paragraph/markdown blocks as an array of strings (`string[]`), never a bare string.
  - `source: "SRD-5.2.1"`, `sourceLabel: "SRD 5.2.1"`.
- Generic translation adapter:
  - Process every discovered language using the shared adapter when its input matches the supported canonical urce structure.
  - Normalize language-independent mechanics to canonical English values and identifiers.
  - Preserve translated free-text fields.
  - Use explicit adapters only for structural differences requiring special handling.
  - Reject unsupported source structures with actionable diagnostics; never silently omit discovered nguages.
  - Test automatic discovery and successful normalization with an additional non-German translation fixture requiring no new language-specific implementation.
- German adapter (`scripts/srd/german.ts`):
  - `school.index` → canonical `SpellSchool` key.
  - Component `G` (Geste) mapped to `somatic: true`.
  - Class map (`Barde→Bard`, `Kleriker→Cleric`, `Druide→Druid`, `Paladin→Paladin`, `Waldläufer→Ranger`, `Zauberer→Sorcerer`, `Hexenmeister→Warlock`, `Magier→Wizard`).
  - `higher_levels` → `higherLevels: string[]`.
  - `description`: map to `string[]`.
  - Localized free text preserved; unknown class/school/component/damage identifiers fail the build with source filename + index.
- Cross-validation: validate every translated entry against the normalized `Spell` schema; reject unknown canonical IDs, duplicate indices/IDs within a file, and conflicting canonical mechanics vs English (level, school, concentration, ritual, component presence/consumption, savingThrow, canonical classes, damage types, source). Partial coverage is valid.
- Manifest generation: write `src/data/spell-languages.json` with `{ code, displayName, dataset }`. `displayName` derived via `Intl.DisplayNames([tag], { type: "language" })` with code fallback; local dataset path `/spells.srd.<tag>.json`.
- Source provenance and release review:
  - Pin canonical English and every translation input to reviewed upstream commits or checked-in snapshots.
  - Record each input's source, revision, and licensing/attribution status.
  - Keep the reviewed input set and generated manifest/datasets tied to the same release.
  - Fail normalization for invalid data; do not silently skip malformed translation files.
  - Document the source-update and review process in README.
- Commit `data/srd/canonical-english.snapshot.json` once reviewed; subsequent runs of `normalize:srd` verify normalized English against the snapshot and fail on any drift or incompleteness.
- Acceptance: fixture tests for invalid filename/tag, duplicate tags, missing index, unknown ID, conflicting mechanics, malformed JSON, partial valid translation, and matching IDs across languages.

### 3. Persistence and Concurrency
- Initialize Dexie database (v1): `customSpells` keyed by `id`, `savedDecks` keyed by `id` (indexed on `updatedAt`), `activeDeck` keyed by `id`.
- Initialize singleton `{ id: "active", name: "", entries: [], revision: 0, baseline: null }` lazily inside transactions.
- Persist optional fields according to the canonical Zod schemas. Represent an absent `savedDeckId` by omitting the property, not by storing `null`. The internal singleton Dexie key `id: "active"` is storage metadata and must be handled consistently by the persisted-record schema.
- Implement active-deck mutations with expected-revision compare-and-swap (CAS): add, add copy, remove, move up/down, drag reorder, fit mode, clear, save, load, import, repair, delete-linked, and undo. On mismatch, throw a typed `DeckConflictError`; UI preserves uncommitted user intent and offers **Reload Latest / Cancel**.
- Implement saved-deck overwrite with `SavedDeck.revision` CAS.
- Transactions touching multiple stores (e.g., custom spell deletion removing active deck entries) must include all affected stores (`customSpells`, `activeDeck`).
- BroadcastChannel publishes advisory change notifications so other tabs reload latest data without bypassing transactional CAS.
- Acceptance: `fake-indexeddb` tests for stale active writes, stale saved overwrites, two-tab conflict handling, rollback on error, and atomic deletion/undo.

### 4. App Shell, Language, Attribution, Workspace
- React app shell with responsive three-pane layout: **Library**, **Preview & Details**, **Active Deck** (stacked/tabs below 1024px).
- Upper-right header: title, language selector combobox (Radix Popover + ARIA listbox with keyboard focus management), About/Attribution dialog, offline status indicator.
- Attribution view and README include exact verbatim SRD 5.2.1 notice; custom spells labeled `Custom`, bundled labeled `SRD 5.2.1`; no WotC logos or D&D trademarks.
- Data loading service (`src/services/data/load.ts`): load manifest and selected language dataset; validate with Zod; cache in memory.
- Language preference service (`src/services/data/language.ts`):
  - Read from `localStorage` (`spellCards.language`). Restore only if the tag exists in the manifest; otherwise fall back to English and explain the change visibly.
  - Wrap `localStorage` writes in try/catch; if storage fails, keep the in-memory selection and display an actionable notice indicating the preference will not survive reload.
  - If a dataset listed in the manifest fails to load/validate, display an error with retry; fall back cleanly to English without ever displaying English text under a non-English language tag.
- Language switch flow:
  - Check active deck entries against target language.
  - If any SRD entry becomes translation-unavailable, display modal stating target language, exact count of affected *entries*, exact count of affected *distinct spell IDs*, and reminder that cards are temporarily omitted from print but **not deleted**. Offer **Switch Language / Cancel**.
  - Cancel preserves current language, preference, and deck.
  - Before applying confirmation, re-read latest `activeDeck.revision` and recompute counts; if concurrent deck edits occurred, refresh modal and require a new decision.
  - Successful switch updates presentation only; never mutates deck entries, revisions, baselines, or dirty state.
- Acceptance: unit tests for preference persistence and try/catch fallback; tests for translation-unavailable placeholders vs true missing references; tests for non-destructive language switching and concurrent revision re-check.

### 5. Library: Search, Filters, Add/Bulk Add
- In-memory Fuse.js search over selected-language SRD spells plus all custom spells; rebuild index when language or custom spells change.
- Case- and accent-insensitive searching on name, classes, and description. For SRD spells, search translated text while matching canonical class filters. Deterministic sort order: `Intl.Collator` by localized name, tie-breaking by stable `id`.
- Filters: level (0–9), school (8 schools), class (core classes + dynamic custom classes), casting time (trimmed/case-folded exact match), concentration, ritual, source (`SRD-5.2.1` / `Custom`). OR within filter group, AND across groups. Changing filters never changes the active deck.
- Single-click add adds an entry to the active deck. Preserves selected spell preview by ID; if unavailable, displays an unavailable message.
- Bulk add: **Append** (appends matching spells preserving existing duplicates) or **Replace** (requires confirmation). Both disabled when matching results count is zero.
- Acceptance: unit tests for filter combinations, search normalization, and collator sorting; component tests for single add and bulk append/replace.

### 6. Custom Spell Management
- Custom spell CRUD via `db.customSpells`; bundled SRD spells remain read-only.
- New spells assign `crypto.randomUUID()` and `updatedAt = Date.now()`; duplication creates a new UUID; edits update timestamp and preserve ID.
- Form defaults: level 0, school Evocation, casting time `1 Action`, range `Self`, duration `Instantaneous`, components all false, concentration/ritual false, classes `[]`, description `[""]`.
- Inline validation for all limits. Failed IndexedDB write never displays success. Updates refresh all active cards referencing the ID without rewriting saved snapshots.
- Delete custom spell:
  - Display confirmation explaining that deleting removes all its entries from the active deck while saved snapshots remain untouched.
  - Atomically delete spell and matching active entries in a single transaction, checking and incrementing `activeDeck.revision`.
- Session-only safe Undo:
  - Keep deleted spell and removed active entries (with original positions) in session memory.
  - Undo verifies the spell ID is unallocated and expected active-deck revision matches; restores spell and entries at original indices and increments revision.
  - If a conflicting edit, import, active deck mutation, or cross-tab write occurred, disable Undo with a clear explanation.
- Trigger search index rebuild and reference re-resolution after custom spell changes.
- Acceptance: tests for cancel, multi-copy deletion, atomic position restore, refused Undo on stale revision, and untampered saved decks.

### 7. Active and Saved Decks
- Active deck pane: ordered entries, copy counts, add copy (new UUID `entryId`), remove, move up/down, drag reorder, per-entry fit mode (`auto-shrink` vs `multi-card`), and clear (with confirmation).
- Save New / Save As: require trimmed name (1–120 characters); create new saved deck UUID; update `activeDeck.savedDeckId` and set `activeDeck.baseline` to snapshot name/entries in the same transaction. Allow duplicate deck names (distinguish by ID/timestamp).
- Overwrite Saved: require explicit target selection; replace snapshot, update `updatedAt`, increment `SavedDeck.revision`, set active `savedDeckId`, and sync baseline. Never overwrite implicitly.
- Load Saved: if active deck is dirty, prompt **Replace Active Deck / Cancel**; loading replaces name, entries, `savedDeckId`, and baseline with the snapshot, incrementing revision. Loading the identical clean snapshot requires no prompt.
- Dirty state calculation: compare active `name` and ordered `entries` against `baseline`, ignoring `revision`. `baseline: null` is clean only when active deck is unnamed and has 0 entries; otherwise dirty. Baseline is updated **only** by Save New, Save As, Overwrite Saved, or Load Saved. Clear, import, repair, and Undo never update baseline directly (dirty becomes false only if Undo exactly recreates baseline).
- Saved deck deletion: explicit confirmation; if deleted deck ID equals `savedDeckId`, atomically clear active `savedDeckId` and set `baseline: null` so active becomes unsaved.
- Reference repair: missing entries allow rebinding `spellId` and `reference` (`source`, `name`) together, preserving `entryId`, position, and `fitMode`. Modifies only active deck; saved snapshots never change implicitly. Re-importing a deleted spell with original ID auto-resolves references.
- Unavailable translations render non-printable placeholder cards with stored reference name; distinct from broken references eligible for repair.
- Acceptance: full coverage of spec §15 deck matrix; CAS conflict recovery; baseline and dirty state preservation across reloads.

### 8. Markdown, Preview, Card Fitting, and Pagination
- Safe parser (`src/markdown/parse.ts`): parse Markdown tokens to AST blocks (headings, list items, paragraphs, Higher Levels) and inline nodes (text, strong, em, code). Strip raw HTML. Render links as plain non-clickable text. Forbid remote images and external assets.
- Card layout (`src/cards/Card.tsx`): 2.5″ × 3.5″ (63.5 × 88.9 mm) using strict CSS physical units. Fixed header (name, level, school, icons), metadata (casting time, range, components V/S/M with `—` fallback, duration), body (description, higher levels, classes), and footer (source, continuation info). Fixed fields truncate with visible ellipsis if tight; level/icons stay visible.
- DOM measurement (`src/cards/fit.ts`):
  - Hidden offscreen card rendered with strict print styles.
  - Always await `document.fonts.ready` before reading layout heights to avoid measurement race conditions.
  - Cache measurement results keyed by `(spellId, language, fitMode, contentFingerprint)`. Recompute on spell edits, fit mode change, language switch, or font load. Never measure on scroll.
  - Recompute card fitting and physical-card expansion whenever selected-language content changes. Use the same resolved spell content and pagination results for preview and print. Never reuse English measurement results for translated content merely because the canonical spell ID is unchanged.
- Auto-shrink mode:
  - Font size starts at 8.5 pt, steps down by 0.5 pt to 6.0 pt.
  - If content still overflows at 6.0 pt, render the largest safe prefix of the AST plus a visible ellipsis on the last text node. Truncate at block → sentence → word → Unicode grapheme (`Intl.Segmenter`) boundaries. Never emit broken markup or split graphemes.
  - Same truncated output rendered in preview and print; display an on-screen-only overflow badge/warning.
- Multi-card mode:
  - Body font 8 pt (6 pt if an unbreakable block requires it).
  - Split description and Higher Levels across continuation cards at paragraph → sentence → word → grapheme boundaries. Reopen and close list and emphasis tags safely across card breaks.
  - **Heading orphan prevention:** Never orphan a heading at the bottom of a card when the next body block could instead move with it to the subsequent card.
  - Continuations repeat compact header/metadata, showing `Continued from Card N` and `Card X of N`.
  - Class tags may move to the final continuation card.
  - Enforce maximum 100 continuation cards per entry; if exceeded, block printing for that entry with an actionable error.
- Acceptance: deterministic unit tests for AST splitting, unicode grapheme boundaries, list preservation, and heading orphaning; browser tests verifying auto-shrink font steps and multi-card pagination integrity.

### 9. JSON Import and Export
- Custom spell export:
  - Filename `spell-card-generator-custom-spells-YYYY-MM-DD.json`.
  - Strict payload: `{ version: "1.0.0", type: "custom-spells", spells: [...] }`, sorted by name then ID, `source: "Custom"` only.
- Custom spell import:
  - Cap at 5 MiB. Parse and validate before writing. Reject invalid JSON, wrong type, duplicate IDs in file, or invalid required fields.
  - Version handling: version `"1.0.0"` validated strictly; any other version displays **Unknown version — Try Import / Cancel**. Try Import extracts only recognized fields, discards unknown fields, and rejects if mandatory fields fail.
  - Source safety: reject any record with `source: "SRD-5.2.1"`.
  - ID namespace: remap any ID starting with `srd-` to a newly generated UUID; report all old/new remapped IDs.
  - Existing collision review: detect existing custom IDs and show collision count and names. Offer batch-wide **Overwrite Existing**, **Keep Both**, or **Skip**. Capture the validated current state of each overwrite target during collision review. Before committing, re-read the targets inside the same Dexie read-write transaction and verify that they still match the reviewed state. If any target was changed, deleted, or newly created since review, abort the entire transaction and require fresh collision review. Do not rely on timestamps alone for concurrency detection. Validate final remapped IDs and the resulting records before committing atomically.
- Deck export:
  - Filename `spell-deck-YYYY-MM-DD.json`.
  - Payload: `{ version: "1.0.0", type: "deck", name, exportedAt, entries: [{ spellId, fitMode, reference }] }`. References only; no spell bodies, `entryId`, `revision`, or `baseline`.
- Deck import:
  - Cap at 5 MiB and 2,000 entries. Unknown versions prompt Try Import / Cancel.
  - Confirmation required before replacing active deck. Generate new UUID `entryId`s, preserve order and duplicates, remove/omit the optional `savedDeckId` field, set `baseline: null`, and increment revision. Validate the resulting active-deck record before persistence.
  - Resolve `SRD-5.2.1` against bundled IDs and `Custom` against custom IDs; never rebind across sources or by name. Unresolved references retained and excluded from print.
- Acceptance: tests covering all import/export rows of spec §15, rollback on failure, collision remapping report, and unknown-version safe degradation.

### 10. Printing
- Dedicated print layout (`src/print/print.css`):
  - Uses strictly physical units (`pt`, `in`, `mm`); no Tailwind utility spacing for card and grid geometry.
  - Dynamic `@page { size: letter; margin: 0; }` or `@page { size: A4; margin: 0; }` based on user paper size selection.
  - 3 × 3 card grid (7.5″ × 10.5″) centered on physical sheet, printing up to nine 2.5″ × 3.5″ cards per sheet. Unused cells on the last sheet remain blank. No page breaks inside cards, no forced scaling, no extra blank sheets.
- Pre-print modal:
  - Toggle paper size (US Letter vs ISO A4) and cutting borders.
  - Display exact configuration guidance: 100% / Actual Size, margins None/Minimum, disable headers/footers, plus driver margin disclaimer.
- Omission handling before print:
  - Omit translation-unavailable placeholders and genuinely missing references without mutating deck entries.
  - If either count is nonzero, show separate counts and require confirmation before launching `window.print()`.
  - Disable print button if zero printable entries remain or if any entry exceeds the 100-card continuation cap.
  - Screen warnings, placeholders, and UI controls are excluded via `@media print`.
- Acceptance:
  - Browser tests verify 9-up sheet pagination, Letter/A4 centering, omission confirmation, and no trailing ank sheets.
  - Verify print geometry using current stable Chrome, Firefox, and Safari where available.
  - Measure generated output at 100% scale, targeting 63.5 × 88.9 mm per card with ±1 mm tolerance.
  - Investigate and document deviations instead of silently applying CSS scaling.
  - Confirm that browser headers/footers, printer margins, and user scaling settings are documented mitations.
  - Ensure continuation cards remain consecutive, including across sheet boundaries.

### 11. PWA, Offline Lifecycle, and Local Fonts
- Configure `vite-plugin-pwa` to precache the application shell, bundles, CSS, local fonts under `src/assets/fonts/`, `src/data/spell-languages.json`, and all `src/data/spells.srd*.json` datasets as a single versioned release.
- Ensure the generated manifest, every generated dataset, and required fonts are included in the actual Workbox precache manifest after Vite builds. Verify cache completeness against the language manifest and the current release, not only against a hardcoded list of initially supported languages. Offline-ready must not be reported while any required asset is absent or belongs to an incompatible release.
- Registration lifecycle (`src/pwa/register.ts`):
  - First-load state: display **Setting up offline access** until Cache Storage explicitly contains the shell, fonts, manifest, and every bundled language dataset.
  - If caching fails, display **Offline setup incomplete — Retry** with an explicit retry action. Never claim offline readiness from service-worker registration alone.
  - Prompt user cleanly when a versioned cache update is ready; reload without wiping IndexedDB user data.
- Offline language switching: once precached, language switching performs zero network requests.
- Storage resilience: handle IndexedDB quota or initialization errors with an actionable banner directing users to JSON export for backups.
- Acceptance: Playwright offline tests (first load, offline simulation, offline reload, offline language switch), cache completeness verification, and update prompt behavior.

### 12. Hardening, Accessibility, and Documentation
- Accessibility: ARIA combobox pattern for language picker; accessible Radix dialogs, tabs, and tooltips; full keyboard navigability; visible focus rings; target WCAG 2.2 AA.
- Sanitization: ensure all Markdown output disables raw HTML, renders links as plain text, rejects remote images, and handles complex Unicode/combining characters via `Intl.Segmenter`.
- Performance: verify search/filter response is under 200 ms for bundled spells + 1,000 custom spells; active deck operations under 300 ms for 200 entries.
- README & About View:
  - Include verbatim SRD 5.2.1 CC-BY-4.0 attribution statement.
  - Document Vite+ (`vp`) workflow, script commands, data normalization, snapshot verification, and print driver guidance.
- Acceptance: `vp check`, `vp test`, and Playwright E2E suites passing cleanly.

## Validation Commands

```powershell
vp install
vp run normalize:srd
vp check
vp test
vp build
vp exec playwright install chromium
vp run test:e2e
```

## Definition of Done

All 26 acceptance criteria in spec §12 pass with automated test coverage; `vp check`, `vp test`, `vp build`, and Playwright E2E pass; all language datasets, manifest, and local fonts precache offline as a single release; and physical print output produces centered 9-up Letter and A4 sheets within ±1 mm tolerance with no unresolved cards or application chrome.