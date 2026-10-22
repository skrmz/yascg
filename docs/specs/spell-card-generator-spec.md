# YASCG - Yet Another Spell Card Generator — Specification v1.0.0

**Status:** Implementation specification  
**Ruleset:** Dungeons & Dragons 5.5e (2024); SRD 5.2.1 only for bundled spells  
**Product type:** Offline-first web app / installable PWA  
**Version:** 1.0.0 (specification and JSON wire/payload version)

---

## 1. Purpose and Scope

Build a small, offline-first app to browse SRD spells, manage custom spells, assemble one active printable deck, save and load named decks, and print standard poker-size cards. Data is local unless the user exports it. Bundled SRD spell data supports selectable languages; English is the canonical/default dataset and translated datasets may be incomplete. Language selection affects bundled spell content, not UI language, custom spells, or stored decks.

**Included:** Spell-data language selection; search and filters; custom spell CRUD and JSON import/export; multiple copies and ordering; named local saved decks; deck JSON import/export; auto-shrink or continuation cards; Letter/A4 printing; offline PWA.

**Excluded:** Non-SRD bundled spells, accounts/cloud sync/backend, PDF rendering engines, card backs, duplex controls, external spell APIs, and third-party format adapters.

## 2. Bundled Data and Attribution

Bundle only spells in the 2024 SRD 5.2.1 dataset; do not bundle PHB-only or other non-SRD material.

- Data: `https://github.com/5e-bits/5e-database/blob/main/src/2024/en/srd-spells-2024.json`
- Upstream schema: `https://github.com/5e-bits/5e-database/blob/main/src/2024/schemas/srd-spells-2024.ts`
- **Inputs and discovery:** The configured raw SRD input directory is `./data/srd/`. The canonical English input is `./data/srd/srd-spells-2024.json`, manually provided/downloaded from 5e-bits/5e-database and stored in the canonical source shape — a fresh upstream download arrives in the legacy nested shape and must be converted with `scripts/migrate-srd-source-format.ts` before committing. Discover additional checked-in or pinned translation files matching `./data/srd/srd-spells-2024_<LANG>.json` (for example `./data/srd/srd-spells-2024_de.json`) at build time. `<LANG>` is a valid canonical BCP 47 tag (examples: `de`, `fr`, `pt-BR`); tags are case-insensitive for uniqueness and normalized to canonical form. English is always `en`, not a second suffixed dataset. New valid translation files require no language allowlist changes.
- **Build script and outputs:** `scripts/normalize-srd.ts` enumerates language inputs from `./data/srd/` and writes build artifacts only to `src/data/`: canonical English as `src/data/spells.srd.json`, translations as `src/data/spells.srd.<lang>.json` (for example `src/data/spells.srd.de.json`), and the static manifest as `src/data/spell-languages.json`. The manifest contains language tags, native display names (or a deterministic tag fallback), and local asset references. Do not discover languages through runtime GitHub APIs or directory listings.
- **Stable IDs:** For all languages, derive `Spell.id` using the *existing English normalization rule* from the unchanged upstream `index` slug: for example, `index: "acid-splash"` maps to `id: "srd-acid-splash"`. The translation input contract requires the exact original `index` for each spell. Names are not keys, and translated names must never determine IDs. The same spell has the exact same `srd-` ID in every language. Updates to bundled data are build-time changes, never user edits.
- **English validation:** Validate normalized English against the canonical Zod schema and the committed generated datasets (`src/data/spells.srd.json`). Fail the build on missing source, malformed JSON, invalid required fields, duplicate indices/IDs or incomplete English output; never ship partial English data. Drift is guarded by `src/test/srd-dataset.test.ts`, which reproduces the committed dataset from the raw source (the former `canonical-english.snapshot.json` was removed as a duplicate of a committed artifact).
- **Translation validation:** A translated dataset may contain any subset of canonical English spell IDs, including an empty subset, but each supplied entry must validate against the expected normalized Spell schema. Reject malformed files, missing/invalid `index`, duplicate indices/IDs within a language, unknown canonical English IDs, conflicting language-independent fields or duplicated canonical language tags. Do not silently omit bad entries or skip invalid files. Report the source filename and offending index/field. Duplicate IDs *across* languages are required for the same spell and are not errors.
- **Localized vs canonical fields:** Only user-facing text may differ across languages. Keep canonical `id`, `level`, `school` enum, `concentration`, `ritual`, component-presence and consumption flags, `savingThrow` codes, source and other language-independent game mechanics identical to English. Translate source school/class labels through explicit normalization into canonical `SpellSchool` / `CoreClass` keys; never pass localized enum strings into the runtime schema. Localized free-text fields (such as name, descriptions, casting-time, range, duration and material descriptions) remain translated. English and every translation use one shared adapter for the canonical source shape; legacy 5e-bits sources must be migrated with `scripts/migrate-srd-source-format.ts`, and any genuinely different structure requires a new explicit build adapter — never a weakened schema. `classes` class identities and damage-type identifiers must remain canonically comparable; translated display wording belongs in existing free-text fields where applicable.
- **Release/provenance:** Review each translation's SRD 5.2.1 scope and licensing/attribution before bundling. Pin all inputs to reviewed commits or checked-in snapshots. The manifest and all datasets must be produced and cached as one coherent build release; no runtime language-pack download/import is added.

Show in an accessible About/Attribution view and README:

> This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/.

Do not display Wizards of the Coast logos or D&D trademarks. Label custom spells `Custom` and bundled spells `SRD 5.2.1`.

## 3. Technology and Architecture

- **Runtime/toolchain:** Node.js >= 24, pnpm v12+, React, TypeScript (strict), and the unified Vite+ (`vp`) toolchain. Repository-level implementation guidance in `AGENTS.md` is normative for agent-assisted work unless it conflicts with this specification.
- **Offline:** `vite-plugin-pwa` / Workbox precache of application shell, JS/CSS, the generated language manifest, every bundled language dataset, and required local fonts.
- **Persistence:** Dexie.js (IndexedDB) stores `customSpells`, `savedDecks`, and singleton `activeDeck` state. Store the language preference separately (for example `localStorage`), never in deck or spell records. Failed preference storage does not block an in-memory language selection.
- **Validation:** Zod for stored records, imported JSON, and normalized SRD data.
- **Search:** Fuse.js in-memory index of bundled spells available in the selected language plus custom spells, rebuilt when the language or custom spells change.
- **UI & Styling:** Tailwind CSS for the application shell, shadcn/ui using Radix UI primitives for accessible Combobox, Dialog, Tabs, and Tooltip components, and Lucide React icons. Print sheets and physical card containers are governed by dedicated strict print/card CSS (§9–10), not utility-class geometry.
- **Markdown parser:** Use a safe AST-based parser (for example `marked` with an AST walker, or `unified`/`remark`) with raw HTML disabled. Render only an allowlisted node set; links display as non-clickable text. No remote images or external resources in spell content.
- **Tests:** `vp test` for unit/integration tests and browser end-to-end tests for storage, workflows, layout, print geometry, and offline behavior.

Core functionality makes no runtime network requests after the first successful precache. Browser-local storage is not guaranteed permanent; JSON export is the backup mechanism.

## 4. Data Models and Validation

```ts
export const SPELL_SCHOOLS = [
  "Abjuration", "Conjuration", "Divination", "Enchantment",
  "Evocation", "Illusion", "Necromancy", "Transmutation"
] as const;
export const CORE_CLASSES = [
  "Bard", "Cleric", "Druid", "Paladin",
  "Ranger", "Sorcerer", "Warlock", "Wizard"
] as const;
export type SpellSchool = typeof SPELL_SCHOOLS[number];
export type CoreClass = typeof CORE_CLASSES[number];
export type CharacterClass = CoreClass | (string & {});
export type AbilityScore = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
export type SpellSource = "SRD-5.2.1" | "Custom";
export type CardFitMode = "auto-shrink" | "multi-card";

export interface SpellComponents {
  verbal: boolean;
  verbalDescription?: string;
  somatic: boolean;
  somaticDescription?: string;
  material: boolean;
  materialDescription?: string;
  materialCost?: string;
  materialConsumed?: boolean;
  componentsDisplayOverride?: string;
}
export interface Spell {
  id: string;
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  components: SpellComponents;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  classes: CharacterClass[];
  subclasses?: string[]; // canonical "<Class>: <Subclass>" identifiers; optional
  savingThrow?: AbilityScore;
  damageTypes?: string[];
  description: string[];
  higherLevels?: string[];
  source: SpellSource;
  sourceLabel?: string;
  updatedAt?: number;
}
export interface DeckEntry {
  entryId: string; // unique UUID per occurrence
  spellId: string; // reference by stable ID, never by name
  fitMode: CardFitMode;
  // Only for missing-reference display and manual repair; not a spell backup.
  reference: { source: SpellSource; name: string };
}
export interface SavedDeck {
  id: string; // UUID
  name: string;
  updatedAt: number;
  revision: number; // monotonic concurrency token for saved snapshot writes
  entries: DeckEntry[];
}
export interface ActiveDeck {
  name: string;
  savedDeckId?: string;
  entries: DeckEntry[];
  // Monotonic revision for optimistic concurrency; persisted with the deck.
  revision: number;
  // Baseline of last explicitly loaded/saved snapshot; null means unsaved.
  baseline: { name: string; entries: DeckEntry[] } | null;
}
export interface SpellExportPayload {
  version: "1.0.0";
  type: "custom-spells";
  spells: Spell[];
}
export interface DeckExportPayload {
  version: "1.0.0";
  type: "deck";
  name: string;
  exportedAt: number;
  entries: Array<Pick<DeckEntry, "spellId" | "fitMode" | "reference">>;
}
```

**Spell-data language model (generated manifest; no deck schema changes):**

```ts
export type SpellLanguage = string; // validated, canonical BCP 47 tag
export interface BundledSpellLanguage {
  code: SpellLanguage;       // e.g. "en", "de", "fr"
  displayName: string;       // native name, with code fallback
  dataset: string;           // generated immutable local asset reference
}
```

The language manifest lists exactly one available asset per unique canonical language tag, including mandatory `en`; reject invalid tags, duplicate tags/assets, and nonlocal asset paths. Language preference is presentation state, not part of `Spell`, `DeckEntry`, `ActiveDeck`, `SavedDeck`, revisions, baselines, or export payloads. The `Spell` schema is unchanged apart from the optional `subclasses` field. All language variants of one SRD spell share the canonical `id` and `source: "SRD-5.2.1"`. Custom spells keep their existing IDs and unchanged author-written contents.

**Subclass reference material (later phase):** `data/reference/srd-spells-2024_extended-props.json` is reference data, not an input dataset (reference material never lives in `data/srd/`). Populating `subclasses` from it — including reconciling classes beyond `CORE_CLASSES` and localized subclass labels via `src/locales/` catalogs — is a separate, later phase. This specification only adds lossless optional support for the field.

**SRD deck-reference resolution:** Use `DeckEntry.spellId` and `reference.source`, never `reference.name`, for matching. Distinguish **resolved** (SRD record in the selected language or existing custom record), **translation unavailable** (canonical English SRD ID exists but is not in the selected translation), and **missing reference** (canonical English SRD ID or referenced custom record absent). A translation-unavailable spell is not a broken reference and must not invoke reference repair. `reference.name` remains a historical fallback label, not a translated identity key.

**Validation contract:**

- `id`: non-empty and trimmed; UUID for newly created custom spells; `srd-` is reserved exclusively for bundled IDs. Imported custom IDs may be non-UUID IDs if valid and not reserved. `entryId` and saved-deck IDs are UUIDs.
- `name`: trimmed, 1–120 characters; `level`: integer 0–9; `school`: one of eight defined values.
- `castingTime`, `range`, `duration`: trimmed, non-empty free-text strings up to 120 characters. No rigid enum: actions, reactions, minutes, and hours are all valid.
- `classes`: zero or more unique, non-empty trimmed names up to 80 characters each. Core classes are predefined; arbitrary custom names are supported and filterable.
- `subclasses`: optional array of unique, non-empty trimmed strings up to 500 characters each (canonical `"<Class>: <Subclass>"` identifiers for bundled SRD data; any trimmed string is accepted for custom/imported spells). The prefix rule is enforced only by the raw SRD adapter. Subclass assignments are populated by a separate later phase; the current SRD data supplies none.
- `description`: at least one string (may be empty); `higherLevels`: optional array. Limit each item to 20,000 characters and combined description/higher-level text to 50,000 characters.
- Optional metadata strings and damage types: max 500 characters per value; optional arrays contain strings only. Component booleans required; absent optional details are allowed.
- `source` required. `updatedAt` is set/updated for custom spells; it may be absent on bundled spells.
- Reject invalid required fields rather than inventing game-rule values. Ignore unknown JSON fields after warning on version mismatch; never preserve unknown fields on export.
- Reject duplicate spell IDs *within an import file* before writing anything. Check uniqueness before and after any ID remapping; remapped IDs must be newly generated UUIDs not already used in the bundled dataset, local database, or current import batch. Existing-database collisions are handled separately (§8).
- Translation build validation rejects duplicate `index` or SRD IDs within any one file and conflicting canonical mechanics across files; the same SRD ID across separate language files is expected and valid.
- Zod schemas are the runtime authority. Infer validated application types from Zod schemas where possible; interfaces above document the wire/storage shape, not a substitute for runtime validation. Define explicit schemas for each export format and the persisted active/saved deck records.
- Import strings must not be coerced into numbers, booleans, or IDs. Apply defaults only to genuinely optional fields; never silently invent mandatory game-rule data. Validate normalized values again before commit.
- Limits: maximum 5 MiB per custom-spell JSON import; maximum 5 MiB and 2,000 entries per deck JSON import. Reject before persistence and give a readable size/count error. Export has no artificial size cap.

## 5. Workspace and Library

Three responsive panes: **Library** (search/filter/list), **Preview & Details** (selected spell/card), **Active Deck** (ordered cards, copy counts, fit mode, save/load/print). Below 1024px, use tabs or stacked views. Adding a spell requires one click.

**Language selector:** Place a compact, labeled, keyboard-accessible dropdown/combobox in the upper-right application header (reachable on small screens). Show only languages in the generated manifest, using native display names and optional language tags. Default to `en` unless a persisted choice remains available. Changing language changes bundled SRD text in library, details, preview, deck presentation, and printed cards; it does not translate UI controls, custom spells, attribution, or canonical game-rule enum/class labels.

**Language-dependent library behavior:** Search and filter the selected language’s available SRD spells plus all custom spells; recompute Fuse index, results, available counts, and sorting after successful language changes. Search translated names/classes/descriptions when present; retain original matching fields and filter OR/AND rules. Use locale-aware case/accent processing and `Intl.Collator` for name sorting, with ID as deterministic tie-breaker. Canonical school/class keys still drive rule-based filters; core classes remain present and additional custom classes remain derived from custom spells. Untranslated SRD entries do not appear in target-language library or bulk-add results. Preserve selected spell by ID if available; otherwise show an unavailable message rather than silently displaying English under another language.

Search name, classes, and description (case/accent insensitive); for SRD spells use their selected-language textual values where the normalized schema supports them, while canonical class identifiers remain filterable. Rank with Fuse.js and use name then ID as deterministic tie-breakers. Filters: level, school, class, casting time, concentration, ritual, source. Multiple choices within a group are OR; groups combine with AND. Empty groups impose no restriction. Core classes always appear; additional class names are derived from custom spells. Casting-time filter values are normalized by trimming and case folding but otherwise compared as exact strings. Empty results show a clear message. Changing filters never changes the deck.

**Add all filtered results:** Present **Append** (one new entry per matching spell, retaining existing entries and duplicates) or **Replace** (confirmation required). Disable both when there are no results. This bulk operation is optional UI convenience, not a separate deck model.

## 6. Custom Spell Management

- Create, edit, duplicate, and delete custom spells in `db.customSpells`; bundled SRD spells are read-only.
- New spells use `crypto.randomUUID()` and `updatedAt = Date.now()`; edits update the timestamp; duplication creates a new UUID.
- Defaults: level 0, school Evocation, casting time `1 Action`, range `Self`, duration `Instantaneous`, components false, concentration/ritual false, classes `[]`, description `[""]`.
- Validate before saving. Report errors inline. A failed IndexedDB write must not appear successful. A custom spell edit or overwrite retains its ID, and cards resolve the current spell body by that ID; saved snapshots are not rewritten.
- **Delete:** Show a confirmation explaining that deleting a custom spell also removes *all its entries from the active deck*. Confirm or cancel. Delete the spell and matching active entries atomically, checking the active-deck revision and incrementing it. **Never** silently rewrite saved decks. Loading a saved deck later may produce unresolved references (§8).
- **Undo:** Keep the deleted spell and removed entries/positions in session memory. Undo remains available only during the same open session until a conflicting spell edit/import or active-deck mutation occurs. Undo verifies both the spell ID is free and the expected active-deck revision; it atomically restores the spell and entries at their original positions and increments the revision. If either check fails, disable Undo with an explanation. No persistent trash is required.
- If another tab changes the affected spell or active deck, discard unsafe Undo rather than overwriting newer data. Deletion, restoration, and imports must trigger search-index refresh and missing-reference re-resolution.

## 7. Active and Saved Decks

- Exactly **one active deck** exists at a time. Store it as a singleton Dexie record with `name`, `savedDeckId?`, ordered `entries`, `revision`, and `baseline`. Initial state: `{name: "", entries: [], revision: 0, baseline: null}`. Persist every successful mutation; never treat unsaved as unpersisted.
- Support add, add copy (new `entryId`), remove, move up/down, drag reorder, per-entry fit mode, and clear (with confirmation). Entry IDs must be unique within a deck; duplicate cards get new entry IDs.
- **Save New / Save As:** Require a non-empty trimmed name (1–120 characters); create a new saved-deck UUID and snapshot. Set the active `savedDeckId` to the new ID and its baseline to the newly saved name/entries in the same transaction. Duplicate names are allowed; show modification timestamps and IDs to distinguish them.
- **Overwrite Saved:** Require explicit choice of target saved deck; replace that saved snapshot atomically with current name/entries, update its `updatedAt`, set `savedDeckId` to the target, and reset baseline. Never overwrite implicitly, even when `savedDeckId` is present.
- **Load Saved:** If active is dirty, prompt **Replace Active Deck / Cancel**; loading replaces name, entries, `savedDeckId`, and baseline with the chosen saved snapshot, increments revision, and never merges. Loading the same deck with no unsaved changes needs no warning. Cancel or failure leaves both persisted records unchanged.
- **Dirty state:** Compare active `name` and ordered `entries` (including `entryId`, `spellId`, `fitMode`, and `reference`) against the persisted `baseline`, ignoring `revision`. `baseline: null` is dirty if the active name is nonempty or entries exist. An empty unnamed active deck with null baseline is clean. Baseline is created/updated **only** by successful Save New, Save As, Overwrite Saved, or Load Saved. Edits, deletion, Undo, repair, clear, and deck import never update the baseline. If Undo exactly restores the baseline, dirty becomes false.
- **Import Deck:** Replaces the active name and entries, clears `savedDeckId`, and sets `baseline: null`; it is unsaved unless the imported deck is completely empty and unnamed. A dirty active deck requires confirmation. Import never changes saved decks.
- **Clear:** Confirmation required; clears active entries but preserves active name, saved association, and baseline. It does not delete saved snapshots.
- **Saved deck deletion:** Allow explicit deletion of a named saved deck with confirmation. Do not change active content; if its ID equals `savedDeckId`, clear the association and baseline so the active deck becomes unsaved. Perform both changes transactionally.
- **Reference repair:** A missing entry may be rebound to an existing spell. Update `spellId` and `reference` (`source`, `name`) together, keeping `entryId`, position, and `fitMode`; change **only** the active deck. Saved snapshots change only through an explicit overwrite. If a missing spell with the original ID and source is later imported/restored, its entry resolves automatically without changing the reference.
**Language switching (non-destructive):** Changing the selected spell-data language affects rendering only. Never add/remove/reorder/rebind active or saved entries, modify `reference`, baselines, saved associations or revisions, or change dirty state solely due to a language switch. All entries, including duplicate copies, persist and reappear automatically when translations become available again. Language preference is saved separately from deck transactions.

**Missing translation confirmation:** Before switching, resolve current entries by source and canonical ID against the target dataset. True missing references are not counted as missing translations; custom spells are unchanged. If no active SRD entry becomes translation-unavailable, switch immediately. Otherwise, leave the current language and deck presentation unchanged and show a modal naming the target language, exact number of affected *entries* and number of *distinct spell IDs*, and the consequence that cards are temporarily unavailable and omitted from print but **not deleted**. Offer **Switch Language** / **Cancel**. Cancel changes neither language, preference nor deck. Confirm changes only language and preference. This applies even if every SRD entry is unavailable.

**On-screen deck presentation:** Keep translation-unavailable entries in original positions with original entry IDs, fit modes, and copy counts; show non-printable `Not available in <language>` placeholders using the canonical English or stored reference name for identification. Keep them distinct from genuinely unresolved entries eligible for repair. Explicit normal deck edits remain available; removal still requires an actual user deck edit.

**Concurrent changes while confirming:** Re-read the latest active-deck revision and recompute affected counts before applying a pending confirmation. If the deck changed, refresh the warning and require a new decision for the new state, even when counts happen to be equal. Language-only updates do not increment the deck revision or use deck compare-and-swap. Cross-tab preference notifications may update language presentation but never mutate decks.

- A `DeckEntry` expands into one or more *physical* cards at print time. Expansion preserves entry order and keeps continuation cards consecutive, even across sheet boundaries.
- **Concurrency:** Every active-deck write (including linked spell deletion/Undo, save/load, clear, import, and repair) performs a compare-and-swap within one Dexie read-write transaction: read the singleton, compare persisted `revision` with the editor's expected revision, abort on mismatch, otherwise write with `revision + 1`. Never retry by silently overwriting. On conflict, keep the user's uncommitted UI intent available, show **Reload Latest / Cancel**, and require a new explicit action against current state. Use `BroadcastChannel` or Dexie change notifications to refresh other tabs; notification is advisory, revision checks are authoritative. Transactions that also modify `savedDecks` or `customSpells` must include all affected stores. Apply the same expected-version check for saved-deck overwrites using a persisted monotonically increasing `SavedDeck.revision`, so two tabs cannot overwrite the same snapshot silently.

## 8. JSON Import and Export

### 8.1 Custom spells

- Export `SpellExportPayload` with `version: "1.0.0"`, sorted by name then ID; include only `source: "Custom"`. Filename `spell-card-generator-custom-spells-YYYY-MM-DD.json`.
- Import cap: 5 MiB. Parse and validate the entire payload before applying changes. The supported payload is `{version:"1.0.0",type:"custom-spells",spells:[...]}`. Invalid JSON, wrong `type`, duplicate IDs inside the input, or invalid required fields cause **no import** and a readable error report. Validate duplicate input IDs before any collision remapping.
- If `version` is `"1.0.0"`, validate strictly against the current schema. For any other version, show **Unknown version — Try Import / Cancel**. **Try Import** extracts only fields recognized by the current `1.0.0` schema, discards unknown fields, and succeeds only if all required fields pass current validation. Never infer missing mandatory fields or imply compatibility with unknown semantics. Reject unknown top-level payload shapes and incorrect `type` values. Optional fields may use safe schema defaults only.
- **Source safety:** Accept only records whose source is `Custom` for custom-spell imports. If a record says `SRD-5.2.1`, reject it rather than silently converting licensed SRD content. Do not import bundled spells as custom content.
- **ID namespace:** `srd-` (case-sensitive) is reserved for bundled spells. Remap any imported custom ID beginning `srd-` to a new UUID, whether or not that exact SRD ID currently exists. Preserve other valid IDs so deck references remain stable. Report all remaps with old/new IDs. Reject blank IDs and duplicate original IDs; guarantee unique final IDs.
- **Existing custom ID collisions:** Before commit, display count and names of all conflicting spells. Offer **Overwrite Existing**, **Keep Both** (new UUID for each incoming conflicting spell), or **Skip** as a single batch-wide choice. Overwrite retains the ID, updates `updatedAt`, and refreshes all cards that reference it; show a prominent warning naming the affected records. Keep Both does not rebind existing deck entries. SRD records are never overwritten.
- Commit chosen records in a single Dexie transaction; validate final IDs and payloads before commit. An unexpected storage error rolls back the batch; show counts (imported/overwritten/copied/skipped/remapped) only after success. If another tab changes a collision target before commit, abort and re-run collision review rather than overwrite silently.

### 8.2 Decks

- Export `DeckExportPayload` with `version: "1.0.0"` and references only (not full spell bodies). Filename `spell-deck-YYYY-MM-DD.json`. Export current active deck, not the saved-deck collection. Do not export `entryId`, `revision`, or `baseline`.
- Import maximum: 5 MiB JSON and 2,000 entries. The supported payload is `{version:"1.0.0",type:"deck",name,exportedAt,entries:[{spellId,fitMode,reference:{source,name}}]}`. Validate the entire payload and all entries before any write; wrong `type`, invalid `fitMode`, missing/invalid `spellId`, invalid reference source/name, or excess limits cause atomic rejection.
- If `version` is `"1.0.0"`, validate strictly against the current schema. For any other version, show **Unknown version — Try Import / Cancel**. **Try Import** extracts only fields recognized by the current `1.0.0` schema and rejects any entry missing mandatory `spellId`, `fitMode`, or `reference.source/name`. Unknown fields are discarded. Do not infer references from names, migrate historical shapes, or claim full future compatibility.
- Import replaces the active deck only after confirmation; cancel, validation failure, stale-revision conflict, or storage failure must leave persisted state unchanged. Generate unique UUID `entryId` values on import; preserve entry order and duplicates. Set active `savedDeckId` and `baseline` to null and increment revision.
- Resolve `SRD-5.2.1` references **only** against bundled SRD IDs and `Custom` references **only** against custom IDs. Never silently rebind by name or across sources. If absent, retain an unresolved entry labeled by `reference.name`; allow repair to an existing spell or removal. Re-evaluate resolution on library changes. Unresolved entries remain visible but are **excluded from printing**, with a count and confirmation before print.
- **Cross-device transfer:** Import custom spells first, then the deck. IDs ordinarily remain stable. If custom import remapped an ID, display a remap report; deck references are not automatically rewritten across separately imported files. Repair affected entries manually. No combined package or persistent remapping database is required.

**Language compatibility:** Export payloads use wire version `"1.0.0"`. Exports contain canonical SRD IDs and `reference` hints, not selected language or bundled spell bodies. Import/load decks in any selected language without migrating or rewriting their entries. The stored `reference.name` may be English or translated and is never used for matching. A missing translation yields a placeholder, not a missing-reference repair suggestion. Imported custom spells retain their contents and behavior regardless of selected SRD language.

## 9. Card Layout and Text Fitting

**Physical size:** 2.5″ × 3.5″ (63.5 × 88.9 mm), `box-sizing: border-box`. Application-shell controls and surrounding UI use Tailwind/shadcn. Card containers and all geometry that must match print output use dedicated strict CSS with physical units (`pt`, `in`, `mm`); do not derive physical dimensions from Tailwind spacing scales, pixels, viewport units, or transforms.

- **Header:** Name, level, school, ritual/concentration indicators.
- **Metadata:** Casting time, range, components, duration.
- **Body:** Description, Higher Levels, classes.
- **Footer:** Source and `Card X of N` for continuations.
- Components use V/S/M indicators; absent components display `—`. Material details may use one line with ellipsis; full details remain visible in the details pane.
- Fixed fields (name, school, range, duration and other header/metadata strings) never disappear: truncate with visible ellipsis if they cannot fit. Full untruncated values remain available in spell details. Level and icons stay visible.

**Language-sensitive content:** Card details, preview and print use the selected translated SRD record where available, or the unchanged custom record. On language changes, invalidate measurements and pagination for changed content; content/language and fit mode must be reflected in cache keys. Translation-unavailable placeholders appear only on screen, not on printed cards. All existing truncation, Markdown safety, continuation and Unicode rules remain in force.

**Measurement:** Use a hidden, fixed-size card matching print styles to measure actual rendered heights after fonts are ready. Recompute on spell edits, fit-mode changes, and relevant style/font changes; cache per content and mode. Never perform measurement for every scroll event.

**Auto-shrink (default):** Body font starts at 8.5 pt, decreases in 0.5 pt steps to 6 pt. Choose largest size that fits. If body content still overflows at 6 pt, render a safe, valid prefix of the parsed Markdown document that fits and append a visible ellipsis to the last displayed text node. Prefer block boundaries, then sentence, word, and finally Unicode grapheme boundaries; never output malformed HTML, a broken list container, or half a Unicode grapheme. Use the same resulting truncation in preview and print, but show an **on-screen-only** overflow warning. Full content remains in spell details. Do not silently drop content without the ellipsis.

**Multi-card:** Body font 8 pt; use 6 pt only when an individual block cannot fit at 8 pt. Split description/Higher Levels at paragraph boundaries, then sentence/word boundaries as needed; preserve words, punctuation, and reading order. Continuations repeat a compact header and metadata, with `Continued from Card N` and `Card X of N`. Keep a spell's physical cards consecutive. If a single unbreakable token cannot fit, wrap it at Unicode grapheme boundaries without dropping characters; if fixed chrome alone is too tall, ellipsize its strings rather than clipping outside the card. Class tags may move to the last continuation card. No description text may be silently lost in multi-card mode.

Markdown parsing must build safe document nodes (not HTML string slicing). Treat headings, list items, paragraphs, and Higher Levels as ordered blocks; split a block at safe text-node boundaries and reopen/close list and emphasis structure on each card. Never orphan a heading when the next body block could instead move with it. Preserve punctuation and all original visible body text in multi-card mode. Use grapheme-aware splitting (`Intl.Segmenter` or equivalent) for emoji/combining marks. Define a maximum of 100 continuation cards per deck entry; if exceeded, block printing that entry with a visible actionable error rather than silently discard content.

Preview warnings and controls are never printed. Use deterministic fixture tests for empty text, long strings, Markdown, headings/lists/emphasis, multi-card pagination, extremely long tokens, and unusual Unicode.

## 10. Printing

Print with `window.print()` and dedicated strict CSS only. The application shell may use Tailwind/shadcn, but print sheets, grid geometry, card containers, typography sizing, gaps, and margins use physical units (`pt`, `in`, `mm`) plus page-size-specific `@page` rules so correctly configured output can meet the ±1 mm physical tolerance. Support **US Letter** (8.5″ × 11″) and **ISO A4** (210 × 297 mm). A 3 × 3 card grid occupies 7.5″ × 10.5″; print up to nine physical cards per sheet, leaving unused cells blank on the last sheet.

- User selects Letter or A4 and toggles cutting borders.
- Use page-size-specific `@page { size: letter | A4; margin: 0; }` rules via separate print classes/stylesheets as appropriate. Use physical `in` units for card and grid dimensions, not `vw`/`vh`.
- Center the fixed-size grid on the physical sheet; avoid forced scaling, page breaks inside cards, trailing blank sheets, and browser header/footer content.
- Pre-print dialog: choose matching paper size; 100% / Actual Size; no headers/footers; margins None or Minimum. Warn that hardware non-printable margins or driver scaling can still alter physical dimensions.
- Print only entries whose spell bodies are available in the current language, including resolvable custom spells. Omit translation-unavailable placeholders and genuinely missing references without modifying deck entries. Before print, show separate counts for omitted missing translations and missing references, and require confirmation if either is nonzero. Disable print if no printable entries remain. Keep existing 100-card continuation errors and print geometry rules. Printing never changes the deck or selected language.
- Verify physical-size output in current stable Chrome, Firefox, and Safari where available, for Letter and A4. Measure a printed or 100%-scale PDF test grid: target card dimensions 63.5 × 88.9 mm, with ±1 mm acceptable measurement tolerance under correctly configured print settings; deviations outside tolerance require investigation/documentation, not silent CSS scaling. Verify nine cards fit without page overflow and no extra blank sheet is emitted. Document browser/printer limitations; exact physical sizing depends partly on user print settings and hardware.

## 11. Offline, Persistence, Security, and Quality

- First-load readiness means required assets, the language manifest, and **every** bundled language dataset are available together in the service-worker cache. Until then, show **Setting up offline access**; if installation/precache fails, show **Offline setup incomplete — Retry** and explain that offline use is not yet guaranteed. The online app may remain usable while caching completes. Retry requests a fresh cache/install attempt; never claim offline-ready based only on service-worker registration.
- Cache the manifest and all corresponding datasets as a coherent versioned release, never advertising mixed-version or absent assets as offline-ready. Language switching after full precache must work without network access.
- Restore the saved language preference only if its tag occurs in the current manifest; otherwise use English. If a previously selected language was removed, visibly explain the fallback to English and clear/update the stale preference without changing any deck. If a dataset cannot be loaded/validated despite being listed, show an error and offer retry; retain the current working language where possible, or visibly fall back to English if necessary. Never silently show English spell bodies under a different language selection. If preference persistence fails, keep the in-memory selection and indicate that it may not survive reload.
- Use existing keyboard, label, focus and modal accessibility rules for the language dropdown and confirmation. Apply the same untrusted-JSON/Markdown sanitation and Unicode-safe rendering rules to every language.
- Version caches; prompt when an update is ready and reload cleanly to avoid mixed-version assets. Do not erase IndexedDB during app updates.
- Use an explicit Dexie schema version from the initial release. Future schema upgrades must preserve user data or fail visibly; failed writes must not be reported as saved. Use transactions for linked operations.
- If IndexedDB is unavailable or quota is exceeded, show an error and explain that local data cannot be safely saved. Export is the user backup path; storage may be evicted or cleared.
- For concurrent tabs, enforce the transactional revision checks in §7. Notifications refresh other tabs, but must not replace compare-and-swap checks. Apply equivalent stale-write prevention to saved-deck overwrites and custom-spell conflict overwrites.
- Treat imported JSON and Markdown as untrusted. Disable raw HTML and executable links, do not inject imported content into `innerHTML`, and avoid external assets. Validate before storing/rendering.
- Support keyboard navigation, labeled controls, modal focus management, and visible focus states. Target WCAG 2.2 AA for core workflows.
- Performance targets on a typical modern laptop: search/filter response under 200 ms for the bundled dataset plus 1,000 custom spells; ordinary deck edits under 300 ms for 200 entries. Printing/layout may take longer; show progress when computation is noticeable. These are test targets, not strict real-time guarantees.

## 12. Acceptance Criteria

1. Strict TypeScript build succeeds; normal use requires no runtime external requests after successful first load.
2. Build fails on missing, malformed, incomplete, or duplicate-ID SRD input; bundled spells are SRD-only with attribution.
3. Search and filters obey defined case, matching, OR/AND, and ordering rules.
4. Custom spell CRUD, duplication, validation, deletion, and session-only safe Undo work; deletion/Undo are atomic and never silently mutate saved decks.
5. Deleting a custom spell removes all its active-deck entries after confirmation, without modifying saved snapshots.
6. Active deck survives reload; named decks can be saved, overwritten, and loaded; loading unsaved changes requires confirmation.
7. Bulk add supports Append or confirmed Replace; copies and ordering persist.
8. Custom imports strictly support the `1.0.0` envelope; reject duplicate IDs and SRD-sourced records; batch collision review, namespace remapping, rollback, remap reporting, and unknown-version safe fallback are tested.
9. Deck exports use version `1.0.0` and reference stable IDs without spell bodies; imports replace only after confirmation, enforce 5 MiB/2,000-entry limits, and handle unresolved references without incorrect rebinding; unknown versions use the explicit safe fallback.
10. Auto-shrink uses 8.5–6 pt steps, applies ellipses when necessary, and shows preview-only warnings.
11. Multi-card mode retains complete description/Higher Levels text across consecutive continuation cards.
12. Letter and A4 print previews arrange up to nine 2.5″ × 3.5″ cards per sheet, optional cutting borders, and no printed warnings.
13. Raw HTML/scripts cannot execute from Markdown or imported files; links are non-clickable.
14. Offline startup, cache updates, storage/schema errors, and main workflows have automated or browser tests.
15. Print geometry is checked in current Chrome, Firefox, and Safari where available, with ±1 mm test tolerance under correctly configured settings; hardware/browser limitations are documented.
16. Save New/As, overwrite, load, clear, repair, import, and saved-deck deletion follow §7 baseline and association rules; dirty state remains correct across reload, deletion, Undo, and Save As.
17. Two-tab tests demonstrate that stale active-deck writes and stale saved-deck/custom-spell overwrites abort without data loss; notifications alone are insufficient.
18. Restoring a missing spell with the same ID/source resolves saved/active references; repairing an active reference does not mutate saved snapshots; unresolved entries never print.
19. Auto-shrink truncation produces safe Markdown with a visible ellipsis; multi-card rendering preserves all visible text, valid list structure, Unicode graphemes, and reading order; >100-card entries fail visibly rather than silently truncate.
20. Offline first-load setup, retry, update, and IndexedDB/schema failures show accurate actionable states; all required assets are cached before claiming offline readiness.
21. Discover English and valid suffixed language files at build time without a language allowlist; include only validated languages in the UI and default to English.
22. Every translation `index` is identical to its canonical English spell; normalization produces the same `srd-` ID. Unknown/missing/duplicate indices, invalid schema, conflicting canonical mechanics or bad language filenames fail the build; incomplete but valid translations pass.
23. A fully covered deck switches languages immediately. For incomplete coverage, confirmation reports accurate affected entry and distinct-spell counts; cancel changes nothing; confirmation preserves all active/saved entries, ordering, copies, dirty state, baseline and revisions.
24. Unavailable translations show distinguishable deck placeholders and are omitted from printing with separate counts/confirmation; switching back restores their content. Search, filters, sorting, details, layout and print reflect selected language while custom spells remain unchanged.
25. Selected language persists outside deck records; missing selected languages visibly fall back to English. Import/export wire version is `1.0.0`; unknown versions require explicit best-effort opt-in and never invoke historical migration adapters. A pending switch is revalidated after concurrent deck edits.
26. Manifest and all language assets precache as one offline release; switching works without runtime requests. Runtime asset errors, accessibility and safe multilingual Unicode/Markdown handling are tested.

## 13. Implementation Plan

1. Define Zod schemas, types, canonical `index`-based SRD identity, language discovery/manifest, and multilingual SRD normalization/build validation.
2. Set up Dexie stores, versioning, active/saved deck persistence, baseline tracking, and transactional revision checks.
3. Implement library, per-language Fuse search/filters/sorting, language selector and preference, and custom spell CRUD.
4. Build safe Markdown details, card preview, and measured text-fitting/pagination.
5. Implement deck ordering, copies, save/load, dirty-state confirmation, delete/undo, and non-destructive language switching with confirmation.
6. Implement `1.0.0` JSON import/export, unknown-version safe fallback, collision/remapping review, limits, missing-reference repair, and atomic validation.
7. Implement Letter/A4 print layout, pre-print guidance, and cross-browser verification.
8. Configure PWA cache/update lifecycle for all language assets; test offline behavior, accessibility, storage/schema failures, two-tab concurrency, and language compatibility.

## 14. Post-v1.0.0

Card backs/duplex alignment, visual themes, crop marks, and third-party import formats.

## 15. Implementation Invariants and Test Matrix

These invariants are normative and must be covered by automated tests:

| Scenario                                                                       | Required result                                                                                                             |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Cancel custom deletion                                                         | Spell and active deck unchanged                                                                                             |
| Delete spell with multiple active copies                                       | Spell and all active occurrences removed in one transaction; saved decks unchanged                                          |
| Undo immediately after deletion                                                | Original spell and original entry IDs/positions restored; dirty state recalculated                                          |
| Undo after intervening active edit or cross-tab write                          | Undo refused; newer work preserved                                                                                          |
| Load saved deck while dirty                                                    | Explicit confirmation; cancel leaves persisted state unchanged                                                              |
| Save As from an existing saved deck                                            | New saved ID; original snapshot unchanged; active association and baseline updated                                          |
| Import a deck with same name as saved deck                                     | Active deck replaced; no saved snapshot modified; imported deck unsaved                                                     |
| Repair missing spell in active deck                                            | Only active reference changed; saved snapshot unchanged                                                                     |
| Re-import deleted spell with original ID/source                                | Existing missing references automatically resolve                                                                           |
| Import valid `1.0.0` custom-spell payload                                      | Strictly validated; collision/remap review applied; atomic commit                                                           |
| Import valid `1.0.0` deck payload                                              | Strictly validated; active deck replaced only after confirmation; order/duplicates retained                                 |
| Import duplicate IDs                                                           | Whole batch rejected without writes                                                                                         |
| Import reserved `srd-` custom ID                                               | Unique UUID remap, old/new mapping shown; bundled SRD unchanged                                                             |
| Import SRD-sourced record as custom                                            | Rejected; not relabeled as Custom                                                                                           |
| Unknown JSON version                                                           | **Unknown version — Try Import / Cancel**; opt-in extracts recognized fields only and never infers missing mandatory fields |
| Two tabs mutate same active revision                                           | Exactly one succeeds; other receives conflict, no silent overwrite                                                          |
| Two tabs overwrite same saved snapshot                                         | Exactly one succeeds; other receives conflict                                                                               |
| IndexedDB quota or transaction failure                                         | No success message or partial linked operation                                                                              |
| Auto-shrink on long Markdown list                                              | Valid rendered structure and visible ellipsis; full details retained                                                        |
| Multi-card on long Unicode/Markdown content                                    | No dropped text, invalid markup, or split grapheme; continuation order retained                                             |
| More than 100 continuation cards                                               | Visible blocking error for that entry; no silent omission                                                                   |
| Unresolved entries at print                                                    | Counted and omitted only after confirmation; print disabled if none resolved                                                |
| Letter/A4 nine-card print                                                      | No clipping, unwanted scaling, or extra blank sheet at correct settings                                                     |
| Offline setup incomplete                                                       | Accurate not-ready state and Retry action                                                                                   |
| Add valid German source and rebuild                                            | `de` discovered and usable; English remains selectable                                                                      |
| Add partial French source and rebuild                                          | `fr` discovered; untranslated canonical spell IDs remain valid deck references                                              |
| Translation changes canonical `index` or duplicates an index within file       | Build fails with indexed error; no name matching                                                                            |
| Translation contains unknown English ID, invalid JSON or conflicting mechanics | Build fails; no invalid/partial dataset shipped                                                                             |
| Change to fully covered language                                               | Switch immediately with deck records/revisions/baseline unchanged                                                           |
| Missing translations; cancel switch                                            | Exact entry/unique-spell counts; language/preference/deck unchanged                                                         |
| Missing translations; confirm switch                                           | Unavailable entries remain in deck as on-screen placeholders; switching back restores text                                  |
| Multiple copies of untranslated spell                                          | All occurrences preserved; entry count and distinct-ID count differ accurately                                              |
| Custom spell and true broken reference in translated deck                      | Custom spell unchanged; broken reference remains repairable, not categorized as untranslated                                |
| Export and reimport partially translated deck                                  | Canonical IDs and all entries preserved; no language-specific payload rewriting                                             |
| Print with untranslated and broken references                                  | Separate counts, confirmation and omissions; no entry deleted                                                               |
| Persisted language removed in update                                           | Visible English fallback; saved decks and active deck unchanged                                                             |
| Switch languages offline after readiness                                       | No runtime network request; only manifest-listed assets selectable                                                          |
| Active deck changes in another tab during switch dialog                        | Recheck latest revision and require confirmation of new state                                                               |
| Long translated Markdown and Unicode on cards                                  | Safe remeasurement, truncation, continuations and print retained                                                            |

**Storage implementation note:** The `activeDeck` singleton and `savedDecks` records must use explicit Dexie keys. Start the greenfield database schema with the revision/baseline fields defined in §4 and use explicit Dexie schema versions for future evolution. Any future migration must preserve user data and fail visibly rather than partially applying. Keep the service worker cache lifecycle independent from IndexedDB schema evolution.

**Data-source implementation note:** Pin canonical English SRD and every translation input to reviewed commits or checked-in source snapshots for reproducible builds. Verify English completeness and that every translated upstream `index` matches an existing canonical English index exactly; derive each bundled ID as `srd-<index>`. Network access may be required during intentional source updates, but never for runtime language discovery or switching. The upstream TypeScript schema is a mapping reference; the application's canonical Zod schema is the runtime/build validation authority. Dataset set, manifest, and precached assets belong to the same build release.

## Appendix: Package Scripts

Runtime: **Node.js >= 24** with **pnpm v12+**. Use the unified **Vite+ (`vp`)** toolchain and follow repository guidance in `AGENTS.md`.

```json
{
  "scripts": {
    "dev": "vp dev",
    "normalize:srd": "tsx scripts/normalize-srd.ts",
    "build": "pnpm run normalize:srd && vp build",
    "preview": "vp preview",
    "test": "vp test",
    "check": "vp check"
  }
}
```

`vp check` is the single verification command for linting, formatting, and typechecking, using oxlint, oxfmt, and `tsc` through the configured Vite+ workflow.
