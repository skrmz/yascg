# YASCG - Yet Another Spell Card Generator — Product Specification

**Status:** Living specification of current required behavior

**Ruleset:** Dungeons & Dragons 5.5e (2024); bundled spells are SRD 5.2.1 only

**Product type:** Offline-first web app / installable PWA

This document is the normative product contract. It describes expected user/system behavior,
invariants, and acceptance criteria. It does not describe the implementation plan, package
scripts, data-migration commands, or deployment procedures.

| Document                                                         | Responsibility                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [README](../../README.md)                                        | Product overview, user help, printing setup, backup guidance, attribution, documentation index                            |
| **This specification**                                           | Current behavioral contract and verification matrix                                                                       |
| [DEVELOPMENT](../DEVELOPMENT.md)                                 | Contributor setup, module map, implementation details, debugging, tests                                                   |
| [SRD data pipeline](../srd-data-pipeline.md)                     | Raw source shape, normalization, translations, generated artifacts, migrations, subclass reconciliation, drift protection |
| [Cloudflare deployment guide](../cloudflare-deployment-guide.md) | Workers Static Assets configuration, Workers Builds, deployment operations, `compatibility_date` maintenance              |
| [Custom spell import guide](../custom-spell-import-guide.md)     | Custom-spell JSON format, examples, collision handling, SRD override import/export                                        |
| [Official subclass catalog](../subclasses.md)                    | Canonical official 2024 subclass list                                                                                     |

---

## 1. Purpose and Scope

Build a small, offline-first app to browse SRD spells, manage custom spells, assemble one
active printable deck, save and load named decks, and print standard poker-size cards. Data is
local unless the user exports it.

Language selection chooses the bundled spell-data language. The application interface is
localized in English and German and follows the selected spell-data language when a UI catalog
exists; languages without a UI catalog use the English interface while their spell data is
still selectable. Language selection never translates custom spells, imported content, saved
decks, user-entered text, or canonical stored game mechanics.

**Included:** spell-data language selection; localized UI (EN/DE); search and filters; custom
spell CRUD and JSON import/export; unique spell entries and ordering; named local saved decks;
deck JSON import/export; automatic fitting with auto-shrink or continuation cards; US Letter/A4
printing; offline PWA.

**Excluded:** non-SRD bundled spells, accounts/cloud sync/backend, PDF rendering engines, card
backs, duplex controls, external spell APIs, and third-party format adapters.

**Non-binding future ideas:** card backs/duplex alignment, visual themes, crop marks, and
third-party import formats. These are not current requirements.

## 2. Bundled Data and Attribution

Bundle only spells in the 2024 SRD 5.2.1 dataset; do not bundle PHB-only or other non-SRD
material. The raw source shape, normalization rules, generated artifacts, translation
workflow, and migration procedures are owned by the [SRD data pipeline](../srd-data-pipeline.md).
Runtime schemas in `src/domain/` are authoritative for normalized data.

- **Stable identity:** every bundled spell derives its ID from the unchanged English upstream
  `index` slug (`index: "acid-splash"` → `id: "srd-acid-splash"`). The same spell has the same
  `srd-` ID in every language. Names are never identity keys.
- **Canonical mechanics:** only user-facing text may differ across languages. Level, school,
  concentration, ritual, component presence/consumption, saving throws, classes, subclasses,
  damage identities, source, and other language-independent mechanics must remain identical to
  English. Localized labels are applied at presentation time from `src/locales/`.
- **Partial translations:** a translated dataset may contain any subset of canonical English
  spell IDs, including an empty subset, but every supplied entry must validate against the
  schema and agree with canonical mechanics. Unknown IDs, duplicate IDs within a language,
  malformed files, or conflicting mechanics fail the build rather than silently dropping data.
- **Subclasses:** bundled data carries canonical `"<Class>: <Subclass>"` identifiers reconciled
  from the official 48-subclass catalog. Reference-only subclasses are preserved verbatim;
  Artificer subclasses are excluded and reported. Reconciliation mechanics and current counts
  live in the [pipeline document](../srd-data-pipeline.md); the official catalog is
  [subclasses.md](../subclasses.md).
- **Provenance:** pin inputs to reviewed commits or checked-in snapshots. The manifest and all
  datasets are produced and cached as one coherent build release. Runtime language discovery,
  network APIs, and downloadable language packs are not used.

**Attribution:** the README and the in-app About view must include the required SRD 5.2.1
Creative Commons Attribution 4.0 notice, as implemented in `src/components/AboutDialog.tsx`.
The full legally required text is maintained in the README; the About view keeps its own
distributed copy. Do not display Wizards of the Coast logos or D&D trademarks. Label custom
spells `Custom` and bundled spells `SRD 5.2.1`.

## 3. Technology and Architecture

- **Runtime/toolchain:** Node.js 24.11+ (24 LTS, pinned by `.nvmrc`) or 26 LTS, pnpm v12+,
  React, TypeScript (strict), and the unified Vite+ (`vp`) toolchain. The complete command
  reference is in [DEVELOPMENT](../DEVELOPMENT.md#toolchain-and-commands).
- **Hosting:** the static SPA deploys to Cloudflare Workers Static Assets using
  `@cloudflare/vite-plugin` and Wrangler. The committed `wrangler.jsonc` sets the Worker name
  and `assets.not_found_handling: "single-page-application"` for client-side routes. There is
  no server API, SSR entry point, backend runtime, or secret. The SPA fallback must not alter
  static asset paths. Operational deployment details are in the
  [Cloudflare deployment guide](../cloudflare-deployment-guide.md).
- **Offline:** `vite-plugin-pwa` / Workbox precaches the application shell, JS/CSS, local
  fonts, the language manifest, and every bundled language dataset as one versioned release.
  Behavioral guarantees are specified in §11.
- **Persistence:** Dexie.js (IndexedDB) stores `customSpells`, `savedDecks`, the singleton
  `activeDeck`, and `srdSpellOverrides`. The language preference is stored separately in
  `localStorage` under `spellCards.language`, never in deck or spell records. Failed preference
  storage does not block an in-memory language selection.
- **Validation:** Zod schemas are the runtime authority for stored records, imported JSON, and
  normalized SRD data. Explicit Dexie schema versions are used from the initial release.
- **Search:** Fuse.js in-memory index over the selected language's bundled spells plus custom
  spells, rebuilt when the language or custom spells change.
- **UI & styling:** Tailwind CSS for the application shell and shadcn-style Radix primitives
  for accessible dialogs, menus, comboboxes, tabs, and tooltips, with Lucide icons. Card and
  print geometry use dedicated strict CSS (§9–10), not utility-class geometry.
- **Typography:** application chrome uses Karla (body/controls), Cormorant Garamond (display
  headings), and IBM Plex Mono (labels). Card typography is specified in §9.
- **Markdown:** safe AST-based parsing with raw HTML disabled except the harmless `<br>` tag,
  which renders a line break. Authored newlines render as line breaks in preview, details, and
  print. Render only an allowlisted node set; links display as non-clickable text. No remote
  images or external resources in spell content.
- **Tests:** `vp test` for unit/integration tests and Playwright for browser E2E tests.
  Commands and test-file conventions are in [DEVELOPMENT](../DEVELOPMENT.md#local-verification).

## 4. Data Models and Invariants

The TypeScript declarations below are **illustrative**. The Zod schemas in
`src/domain/spells.ts`, `src/domain/deck.ts`, and `src/domain/payloads.ts` are the executable
authority; if this section and those schemas disagree, the schemas win. Do not maintain a
second independent type definition for import/export.

```ts
export type SpellSchool =
  | "Abjuration" | "Conjuration" | "Divination" | "Enchantment"
  | "Evocation" | "Illusion" | "Necromancy" | "Transmutation";

export type CoreClass =
  | "Barbarian" | "Bard" | "Cleric" | "Druid" | "Fighter" | "Monk"
  | "Paladin" | "Ranger" | "Rogue" | "Sorcerer" | "Warlock" | "Wizard";

export type SpellSource = "SRD-5.2.1" | "Custom";
export type CardFitMode = "auto" | "auto-shrink" | "multi-card";

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
  classes: CoreClass[];
  subclasses?: string[];
  savingThrow?: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
  damageTypes?: string[];
  description: string[];
  higherLevels?: string[];
  source: SpellSource;
  sourceLabel?: string;
  updatedAt?: number;
}

export interface DeckEntry {
  entryId: string;
  spellId: string;
  fitMode: CardFitMode;
  reference: { source: SpellSource; name: string };
}

export interface SavedDeck {
  id: string;
  name: string;
  updatedAt: number;
  revision: number;
  entries: DeckEntry[];
}

export interface ActiveDeck {
  name: string;
  savedDeckId?: string;
  entries: DeckEntry[];
  revision: number;
  baseline: { name: string; entries: DeckEntry[]; savedRevision?: number } | null;
}
```

`Spell.overridden` is a transient, non-persisted marker set by the SRD override merge; it is
excluded from the runtime schema and from imports/exports.

**Import/export wire shapes:** the authoritative definitions are
`customSpellExportPayloadSchema` and `deckExportPayloadSchema` in `src/domain/payloads.ts`.

- `CustomSpellExportPayload` is `{ type: "custom-spells", spells: Spell[], srdSpellOverrides?: SrdSpellOverrideExport[] }`.
  Custom spell records include their optional `updatedAt`. Override export records are
  `{ spellId, locale, verbalDescription?, somaticDescription? }` and deliberately omit the
  storage-only `updatedAt`.
- `DeckExportPayload` is `{ type: "deck", name, exportedAt, entries: [{ spellId, fitMode, reference: { source, name } }] }`.
  It never includes `entryId`, `revision`, `baseline`, or spell bodies.

**Spell-data language model (generated manifest; no deck schema changes):**

```ts
export type SpellLanguage = string; // validated, canonical BCP 47 tag

export interface BundledSpellLanguage {
  code: SpellLanguage;
  displayName: string;
  dataset: string;
}
```

The manifest lists exactly one available asset per unique canonical language tag and always
includes `en`. Reject invalid tags, duplicate tags/assets, and non-local asset paths. Language
preference is presentation state, not part of `Spell`, `DeckEntry`, `ActiveDeck`, `SavedDeck`,
revisions, baselines, or export payloads. The `Spell` schema includes the optional `subclasses`
field; no deck schema changes result. All language variants of one SRD spell share the canonical
`id` and `source: "SRD-5.2.1"`. Custom spells keep their IDs and author-written contents.
Localized subclass labels come from `src/locales/` and fall back to the English name for
unknown identifiers.

**SRD deck-reference resolution:** use `DeckEntry.spellId` and `reference.source`, never
`reference.name`, for matching. Distinguish **resolved** (SRD record in the selected language or
existing custom record), **translation unavailable** (canonical English SRD ID exists but is not
in the selected translation), and **missing reference** (canonical English SRD ID or referenced
custom record absent). A translation-unavailable spell is not a broken reference and must not
invoke reference repair. `reference.name` is a historical display fallback, not an identity key.

**Validation contract:**

- `id`: non-empty and trimmed; UUID for newly created custom spells; the `srd-` prefix is
  reserved exclusively for bundled IDs. Imported custom IDs may be non-UUID if valid and not
  reserved. `entryId` and saved-deck IDs are UUIDs.
- `name`: trimmed, 1–120 characters. `level`: integer 0–9. `school`: one of the eight defined
  values.
- `castingTime`, `range`, `duration`: trimmed, non-empty free text. Both bundled data and
  custom-spell authoring admit up to 500 characters, so official SRD rules text is never
  truncated and a copied spell stays editable within the same limit. There is no rigid enum for
  actions, reactions, minutes, or hours.
- `classes`: zero or more unique, non-empty names drawn from the 12 canonical `CoreClass`
  values. Unknown class names are rejected on import and in the custom-spell form; UI filters
  list exactly those 12 classes.
- `subclasses`: optional array of unique, non-empty trimmed strings up to 500 characters each.
  Bundled SRD data uses canonical `"<Class>: <Subclass>"` identifiers whose parent is a core
  class; the raw SRD adapter enforces the prefix rule. Custom spells and imports accept any
  trimmed string. The runtime schema is intentionally tolerant of non-catalog identifiers.
- `description`: at least one string (it may be empty); `higherLevels`: optional array. Limit
  each item to 20,000 characters and combined description/higher-level text to 50,000
  characters.
- Optional metadata strings and damage types: max 500 characters per value; optional arrays
  contain strings only. Component booleans are required; absent optional details are allowed.
- `source` is required. `updatedAt` is set/updated for custom spells and may be absent on
  bundled spells.
- Reject invalid required fields rather than inventing game-rule values. Reject unknown
  top-level payload fields; unknown fields inside a spell record are stripped. Never preserve
  unknown fields on export. JSON formats are unversioned.
- Reject duplicate spell IDs **within an import file** before writing anything. Check
  uniqueness before and after any ID remapping; remapped IDs must be newly generated UUIDs not
  already used in the bundled dataset, local database, or current import batch.
- Translation build validation rejects duplicate `index`/SRD IDs within one file and
  conflicting canonical mechanics across files; the same SRD ID across separate language files
  is expected and valid.
- Import strings are never coerced into numbers, booleans, or IDs. Defaults apply only to
  genuinely optional fields; mandatory game-rule data is never invented. Validate normalized
  values again before commit.
- Limits: 5 MiB per custom-spell JSON import; 5 MiB and 2,000 entries per deck JSON import.
  Reject before persistence with a readable size/count error. Export has no artificial size
  cap.

## 5. Workspace and Library

Three responsive panes: **Library** (search/filter/list), **Preview & Details** (selected
spell/card), and **Active Deck** (ordered unique entries, fit mode, save/load/print). Layout
uses measured workspace container width: **Compact below 720px** shows Library / Details / Deck
tabs; **Split at 720–1199px** keeps Library visible beside a Details / Deck tab switcher;
**Wide at ≥1200px** shows all three panes without tabs. Split columns are
`clamp(320px, 36%, 420px) minmax(400px, 1fr)`; Wide columns are
`clamp(320px, 24%, 400px) minmax(560px, 1fr) clamp(300px, calc(50% - 300px), 640px)`.
Selecting a Library spell or resolved Deck row reveals Details, including reselection of the
current spell. All panes stay mounted across modes; search, filters, list scroll, selection,
deck, right-pane choice, and unsubmitted deck-name edits survive resizing. Hidden panes are
excluded from keyboard navigation. The Library is list-first in Compact/Split: search and a **Filters**
trigger share one row, filters open in a bottom sheet with removable active-filter chips,
secondary and destructive bulk actions live in a labeled **Library actions** menu, and the spell
list is the only vertical scroll container in the pane. Search, filters, and list scroll position
survive tab switches. Adding a spell requires one click. Spell names wrap to at most two lines;
the selectable button retains the full name. The selected spell exposes `aria-current` and a
leading border cue. Empty results offer **Clear search and filters**, preserving selection and
deck and returning focus to search. Filter multi-select names include their current summary.
Primary workflow controls have 44×44px effective targets in Compact/Split and on Wide layouts
with a coarse primary pointer; fine-pointer Wide retains its existing density.
At short viewport heights (including browser zoom), the Deck uses a single whole-pane scroll
region so pinned controls cannot squeeze its entries out of reach. The page remains fixed.
In Compact mode, deck settings start collapsed. The deck name, entry count, status,
persistence help, and Save/Print/Open actions stay visible; a **Deck settings** disclosure
reveals name editing, card design, and legend. Split/Wide always show these settings. Expanding
or collapsing settings preserves their values, and validation/action errors remain visible.
Deck entry names wrap without truncation. Narrow deck entries use two aligned rows: name
above, fit selector and actions below. When the entry list's content width reaches 36rem,
entries use one row with aligned fit and action columns. Narrow entries use a compact fit
selector beside adjacent action touch targets, without stretching to fill unused space.

**Preview & Details pane:** the default pane shows the rendered physical card preview(s) for
the selected spell, arranged in wrapping rows while preserving 2.5in × 3.5in dimensions. Fit
status notices remain visible above the preview. The preview group is horizontally centered.
A localized **Preview scale** selector defaults to **Physical (100%)** and offers **Fit width**
up to 200%. Screen transforms and visual wrapper bounds never change physical card geometry,
fit inputs/results, pagination, the details dialog, or printed output. Full spell metadata and the complete canonical
description are available on demand in a responsive, scrollable details dialog, opened from the
persistent localized **Show details** header control. No single click on the card body opens
details or menus, the preview exposes no duplicate actions menu or context menu, and all
interaction affordances are excluded from print. The dialog reads the
resolved selected spell, never card DOM or fit output, and closes immediately if the selected
spell changes.

When the selected spell is `source: "SRD-5.2.1"` and has a matching entry in the active deck,
the pane header also offers **Create editable copy**. Selecting a deck row already opens that
spell here, so no separate per-row copy action is required.

**Language selector:** place a compact, labeled, keyboard-accessible dropdown/combobox in the
upper-right application header, reachable on small screens. Show only languages in the
generated manifest, using native display names and optional language tags. Default to `en`
unless a persisted choice remains available. Changing language changes the interface (when a UI
catalog exists) and bundled SRD text in library, details, preview, deck presentation, and
printed cards. The UI locale is `de` only when German is selected and `en` otherwise; manifest
languages without a UI catalog keep their spell data but use the English interface. Custom
spells, attribution, and canonical game-rule identifiers are never translated or rewritten.

**Language-dependent library behavior:** search and filter the selected language's available
SRD spells plus all custom spells; recompute the Fuse index, results, available counts, and
sorting after successful language changes. Search translated names/classes/descriptions when
present; retain original matching fields and filter OR/AND rules. Use locale-aware case/accent
processing and `Intl.Collator` for name sorting, with ID as the deterministic tie-breaker.
Canonical school/class keys still drive rule-based filters; the class filter always lists the
12 core classes, not arbitrary names derived from custom spells. Untranslated SRD entries do
not appear in target-language library or bulk-add results. Preserve the selected spell by ID if
available; otherwise show an unavailable message rather than silently displaying English under
another language.

Search name, classes, and description (case/accent insensitive); for SRD spells use their
selected-language textual values where the normalized schema supports them, while canonical
class identifiers remain filterable. Rank with Fuse.js and use name then ID as deterministic
tie-breakers. Filters: level, school, class, subclass, casting time, range, duration, components,
concentration, ritual, source. Multiple choices within a group are OR except components, where
every selected component (verbal, somatic, material) must be present; groups combine with AND.
Empty groups impose no restriction. Casting-time, range, and duration filter values are
normalized by trimming and case folding but otherwise compared as exact strings. Their option
lists are derived from the selected language's SRD dataset only, because custom spells retain
author-written values across language switches and would otherwise mix languages in one list; a
language change clears the selected casting-time, range, and duration values. Empty results show
a clear message. Changing filters never changes the deck.

**Subclass filter:** match spells by their canonical `"<Class>: <Subclass>"` identifiers so the
same selection applies to SRD and custom spells. Options combine the selected language's SRD
dataset with custom spells, are de-duplicated by identifier, and are grouped by parent class.
Labels use the localized subclass catalog with the English subclass name as fallback for
reference-only identifiers; group headings use the localized class name with a raw-name fallback.
Subclass selections are canonical and language-independent, so valid selections survive language
changes. Do not translate or rewrite stored identifiers.

**Add all filtered results:** present **Append all** (adds only matching spells not already in
the active deck, retains existing entries, and reports added/skipped counts in one
notification) or **Replace deck** (confirmation required). Disable both when there are no
results. This bulk operation is optional UI convenience, not a separate deck model.

**Compact/Split Library layout:** render search and a **Filters** trigger with an
active-group count in one row, followed by a horizontally scrollable row of removable chips for
active filter groups. Chips never include the search query; removing a chip clears only its
filter group, while **Reset filters** keeps its existing behavior of clearing the search query and
every filter. The **Filters** bottom sheet contains the filter fields, applies changes
immediately, closes without discarding them, and exposes **Reset filters** and **Done**. Level,
Class, and Source are visible initially; eight advanced groups live under **Advanced filters**,
collapsed unless advanced filters are active when opening. Its badge shows the active advanced
count. A polite live match count in the sticky footer uses the same search/filter results.
Source is a single-choice **All / SRD / Custom** group with pressed semantics. All maps to
empty sources; selecting an already-selected specific source keeps it selected. Legacy both-source
state displays All and no active source chip; filtering semantics stay unchanged. The
**Library actions** menu contains **Append all**, **Replace deck**, **Create custom spell**, and
**Custom spell import/export**; it remains available when the result list is empty so custom-spell
creation is always reachable. The result count and actions stay outside the result scroll area;
the results list scrolls independently and preserves its position across tab changes. Do not
introduce a second vertical scroll container or page-level horizontal overflow.

## 6. Custom Spell Management

- Create, edit, duplicate, and delete custom spells in `db.customSpells`; bundled SRD spells are
  read-only.
- **Creation entry point:** the Library pane always offers **Create custom spell**, independent
  of active-deck contents, search/filter results, and the selected spell. Saving adds the spell
  to `db.customSpells` and refreshes the library/search index; it never adds the spell to the
  active deck, which changes only through an explicit add action.
- New spells use `crypto.randomUUID()` and `updatedAt = Date.now()`; edits update the timestamp;
  duplication creates a new UUID.
- Defaults: level 0, school Evocation, casting time `1 Action`, range `Self`, duration
  `Instantaneous`, components false, concentration/ritual false, classes `[]`, description
  `[""]`.
- Validate before saving. Report errors inline. A failed IndexedDB write must not appear
  successful. A custom spell edit or overwrite retains its ID, and cards resolve the current
  spell body by that ID; saved snapshots are not rewritten.
- **Editable copies of SRD spells:** the Details pane offers **Create editable copy** for an SRD
  spell present in the active deck. Clicking it creates an in-memory custom draft with a new
  UUID and opens the custom-spell editor; nothing is persisted until **Save spell** succeeds.
  - The draft is a schema-aware deep copy of the resolved source spell. Identity fields
    (`id`, `source`, `updatedAt`) are replaced, SRD provenance (`sourceLabel`) and the transient
    `overridden` marker are dropped, and the result is validated through `spellSchema`. Every
    field recognized by the current `Spell` schema is preserved; unknown fields are stripped as
    for any persisted spell.
  - Preserve the source spell's name and captured text exactly. Do not add a language-specific
    suffix. The copy is an ordinary `source: "Custom"` record, so it is not translated when the
    app language changes.
  - Cancelling the editor writes nothing. If saving fails, the editor remains open and no copy
    or deck change exists.
  - If saving succeeds, ask for confirmation before replacing the active deck entry. Cancelling
    that confirmation keeps the saved custom copy in the library, selects it, and leaves the
    active deck unchanged. Confirming replaces only the matching entry (see §7).
  - The editor preserves unexposed fields on later ordinary edits: it saves from the existing
    record and only overwrites fields it exposes, including merging component fields so
    `componentsDisplayOverride` and other unexposed component data survive.
  - Copies are ordinary custom spells for import, export, backup, saved-deck resolution, and
    deletion. No new format or persistence model is required.
- **Abbreviate custom prose:** every non-SRD draft (new custom spell, ordinary custom edit, and
  editable copy) offers **Abbreviate** and **Undo abbreviation** in the custom-spell editor. The
  restricted SRD override editor does not offer them.
  - The action transforms only user-authored draft values: `description` and `higherLevels` as
    Markdown visible prose, and `castingTime`, `range`, `duration`, `verbalDescription`,
    `somaticDescription`, `materialDescription`, and `materialCost` as plain text. It never
    changes `name`, structured or canonical fields, unexposed fields, or UI labels. Hidden
    component descriptions are transformed because they remain part of the draft.
  - Markdown code, HTML tags and attributes, autolinks, URLs, email addresses, reference
    definitions, images, link destinations/titles/reference identifiers, backslash escapes, and
    structural delimiters are preserved byte-for-byte. Bold, italic, heading, blockquote, list,
    table-cell, and inline/full-reference link-label prose is eligible.
  - Matching uses the language captured when the editor opened, not the live UI language. Only
    exact `en` and `de` catalogs exist; another language is a no-op with an explanatory status and
    never falls back to English prose. Catalog display remains case-sensitive while prose matching
    is locale-aware case-insensitive. Longest surfaces win, whitespace is not collapsed, and only
    explicitly configured spellings match: catalogs may define inflected `suffixes`/`forms`, but
    unconfigured inflections are never inferred. Locale inventories are independent, so English
    plural entries and German generated forms need not mirror each other.
  - English `up to` and German `bis zu` become `≤` only when followed by a numeric quantity.
    Written number words from zero through ten and hundred also count as numeric quantities
    (`up to one hour` → `≤ 1h`, `up to ten minutes` → `≤ 10min`, `bis zu zwei Stunden` → `≤ 2h`).
    A following catalog time unit is compacted without a space (`≤ 1h`, `≤ 10min`, `≤ 3d`,
    `≤ 3t`); other units and nouns keep normal spacing (`≤ 30 ft`, `≤ 3 creatures`). Phrases
    without a number, such as `up to the DM's discretion`, are unchanged. Standalone number words
    convert only as complete words; compounds, hyphenated forms, ordinals, and larger numbers are
    not inferred.
  - **Undo abbreviation** is session-scoped and last-in-first-out. Each action snapshots only the
    fields it changes; Undo restores exactly those fields, overwriting later manual edits to them
    and leaving unrelated fields untouched. The stack and status clear when the editor closes,
    reopens, or a different spell opens. Saving stores the abbreviated text; no reversible backup,
    diff, conflict detection, or post-save restore exists. UI labels such as **Casting Time**,
    **Range**, and **Duration** (and their German equivalents) are never abbreviated.
- **Delete:** show a confirmation explaining that deleting a custom spell also removes *its
  entry from the active deck*. Confirm or cancel. Delete the spell and matching active entry
  atomically, checking the active-deck revision and incrementing it. **Never** silently rewrite
  saved decks. Loading a saved deck later may produce unresolved references (§8).
- **Undo:** this applies only to custom-spell deletion. Keep the deleted spell and removed
  entry/position in session memory. Undo remains available only during the same open session
  until a conflicting spell edit/import or active-deck mutation occurs. Undo verifies both the
  spell ID is free and the expected active-deck revision; it atomically restores the spell and
  entry at its original position and increments the revision. If either check fails, disable
  Undo with an explanation. No persistent trash is required. Clear entries has no Undo.
- If another tab changes the affected spell or active deck, discard unsafe Undo rather than
  overwriting newer data. Deletion, restoration, and imports must trigger search-index refresh
  and missing-reference re-resolution.

## 7. Active and Saved Decks

This section is the authoritative owner of deck-state semantics. Implementation mappings
(Dexie tables, CAS functions, migration code) are in
[DEVELOPMENT](../DEVELOPMENT.md#deck-persistence-and-migration).

- Exactly **one active deck** exists at a time. Store it as a singleton Dexie record with
  `name`, `savedDeckId?`, ordered `entries`, `revision`, and `baseline`. Initial state:
  `{name: "", entries: [], revision: 0, baseline: null}`. Persist every successful mutation;
  never treat "unsaved" as "unpersisted".
- **Uniqueness:** a deck contains at most one entry per unique `spellId`, regardless of how the
  spell is added. Individual add attempts for a spell already in the deck leave the deck
  unchanged and show a bottom-right notification; bulk append skips existing spells and reports
  added/skipped counts. Shared deck mutation logic and persisted active/saved deck schemas
  enforce uniqueness rather than relying on UI checks alone. Legacy duplicate entries are
  normalized to the first occurrence when the database is upgraded or a saved deck is loaded.
  Reference repair must not rebind an entry to a spell already present in the deck. Entry IDs
  must be unique within a deck.
- Support add, remove, move up/down, drag reorder, per-entry fit mode (**Best fit** by default,
  **Auto-shrink**, or **Multi-card**), and **Clear entries** (with confirmation).
- **Status and Save enablement:** derive a four-state status from association and dirty state —
  **Saved** (associated, clean), **Unsaved changes** (associated, dirty), **Not saved as a
  deck** (unassociated, populated), and **New deck** (unassociated, empty and unnamed).
  Inconsistent persisted combinations (associated with a null baseline, unassociated with a
  non-null baseline, or an associated baseline without an expected saved revision) are errors,
  not statuses. **Save** is enabled only while dirty and the association is valid; a disabled
  Save performs no write, revision increment, or success message.
- **Inline rename:** edit the active name in the deck pane. Enter and blur commit the trimmed
  draft; Escape cancels and restores the committed name. Associated decks require a trimmed
  1–120 character name; unassociated decks may commit the empty working name. Blank or overlong
  associated drafts and overlong unassociated drafts show an inline error, revert the input, and
  write nothing. Unchanged normalized names are no-ops. A draft is tied to the active revision
  at edit start; a stale Enter/blur never renames replacement content after Open, New deck,
  import, or another tab. A rejected or stale rename must block Save until the user resolves
  it.
- **Save As:** always create a new saved-deck UUID at saved revision `1`, even when the active
  deck is already associated. Require a trimmed 1–120 character name; assign it to both the new
  snapshot and the active deck, capture the current ordered entries, set the
  association/baseline (including `savedRevision: 1`), and increment the active revision in one
  transaction. Duplicate names are allowed; the previously associated snapshot is unchanged.
  **Save as…** is the visible primary action for an unassociated deck and opens its naming
  dialog directly; its status hint names this action. It remains in the actions menu for
  duplication and for a clean or blank workspace. Existing busy/invalid/clean guards apply.
- **Save:** when the active deck is associated, update **only that snapshot** with the committed
  active name/entries, bump the saved `revision`, refresh `updatedAt`, update the active
  baseline token, and increment the active revision atomically. Never select a target by name
  and never recreate a deleted snapshot. If the active deck already matches its baseline, Save
  is a no-op. If the snapshot is missing, modified elsewhere, or the expected saved revision is
  absent/stale, abort without writing and offer **Save As…** or **Open…**. When the active deck
  is unassociated and dirty, the primary action is labeled **Save as…** instead.
- **Open:** list saved snapshots by name and `updatedAt`, disambiguating duplicate names with
  shortened IDs. Per-row **Open** and **Delete**. If the active deck is dirty, opening **any**
  snapshot — including the currently associated one — requires **Replace active deck / Cancel**.
  A clean Open proceeds without a warning. Opening replaces name, entries, `savedDeckId`, and
  baseline (including the selected saved revision), increments the active revision, and never
  writes the saved record. Reopening an identical clean snapshot is a no-op; reopening a
  snapshot whose saved revision changed is a real refresh.
- **Dirty state:** compare the committed active `name` and ordered `entries` (including
  `entryId`, `spellId`, `fitMode`, and `reference`) against the persisted `baseline`, ignoring
  active `revision` and `baseline.savedRevision`. `baseline: null` is dirty if the active name
  is nonempty or entries exist. An empty unnamed active deck with null baseline is clean.
- **Replace an entry with an editable copy:** when the user confirms the copy flow, replace
  only the matching active entry. Preserve its `entryId`, array position, and `fitMode`; update
  `spellId` and `reference` to the saved custom copy. Check the captured active revision and the
  captured `{name, savedDeckId}` identity inside the compare-and-swap mutation. Abort without
  writing when the deck identity changed, the entry is missing or rebound, the entry is no
  longer SRD, or another entry already uses the copy ID. Never modify `db.savedDecks`, any other
  entry, or the baseline. Dirty state recalculates from the live active-deck query.
  Baseline is created/updated **only** by successful Save As, Save, or Open. Edits, deletion,
  Undo, repair, Clear entries, and deck import never update the baseline. If Undo exactly
  restores the baseline, dirty becomes false.
- **Start new deck:** the action and confirmation use this label, distinct from the **New deck**
  empty status. Replace the active contents with `name: ""`, no entries, no `savedDeckId`
  property, and `baseline: null`; retain the singleton identity, increment the active revision
  once, and never touch saved snapshots. Require discard confirmation only when dirty. On an
  already blank workspace it is a silent no-op.
- **Import Deck:** replaces the active name and entries after review and one explicit
  replacement confirmation; adopts the imported name (empty `""` when the payload legitimately
  has none) and clears `savedDeckId` and `baseline`. A dirty active deck requires explicit
  discard confirmation even for identical-looking data. Import never changes saved decks and
  never invents a nonempty name. Import/export format semantics are in §8.2.
- **Clear entries:** confirmation is required whenever entries exist; clears only active entries
  while preserving the committed name, saved association, and baseline. It does not delete or
  update saved snapshots. When the deck is already empty it is disabled and performs no write.
  There is no general Undo for Clear entries; Undo is limited to custom-spell deletion (§6).
- **Saved deck deletion:** allow explicit deletion of a named saved deck with confirmation and a
  saved-revision CAS check. Do not change active content for non-associated snapshots. If the
  deleted ID equals `savedDeckId`, transactionally clear the association (omit the property) and
  baseline and increment the active revision, leaving **Not saved as a deck**.
- **Reference repair:** a missing entry may be rebound to an existing spell. Update `spellId` and
  `reference` (`source`, `name`) together, keeping `entryId`, position, and `fitMode`; change
  **only** the active deck. Saved snapshots change only through an explicit Save. If a missing
  spell with the original ID and source is later imported/restored, its entry resolves
  automatically without changing the reference.

**Language switching (non-destructive):** changing the selected spell-data language affects
rendering and the UI locale only. Never add/remove/reorder/rebind active or saved entries,
modify `reference`, baselines, saved associations or revisions, or change dirty state solely
due to a language switch. All entries persist and reappear automatically when translations
become available again. Language preference is saved separately from deck transactions.

**Missing translation confirmation:** before switching, resolve current entries by source and
canonical ID against the target dataset. True missing references are not counted as missing
translations; custom spells are unchanged. If no active SRD entry becomes translation-unavailable,
switch immediately. Otherwise, leave the current language and deck presentation unchanged and
show a modal naming the target language, the exact number of affected *entries*, and the number
of *distinct spell IDs*, plus the consequence that cards are temporarily unavailable and omitted
from print but **not deleted**. Offer **Switch Language** / **Cancel**. Cancel changes neither
language, preference nor deck. Confirm changes only language and preference. This applies even
if every SRD entry is unavailable.

**On-screen deck presentation:** keep translation-unavailable entries in original positions
with original entry IDs and fit modes; show non-printable `Not available in <language>`
placeholders using the canonical English or stored reference name for identification. Keep them
distinct from genuinely unresolved entries eligible for repair. Explicit normal deck edits
remain available; removal still requires an actual user deck edit.

**Concurrent changes while confirming:** re-read the latest active-deck revision and recompute
affected counts before applying a pending confirmation. If the deck changed, refresh the warning
and require a new decision for the new state, even when counts happen to be equal. Language-only
updates do not increment the deck revision or use deck compare-and-swap. Cross-tab preference
notifications may update language presentation but never mutate decks.

**Physical expansion:** a `DeckEntry` expands into one or more *physical* cards at print time.
Expansion preserves entry order and keeps continuation cards consecutive, even across sheet
boundaries.

**Concurrency:** every active-deck write (including linked spell deletion/Undo, Save/Save As/
Open, New deck, Clear entries, import, and repair) performs a compare-and-swap within one Dexie
read-write transaction: read the singleton, compare persisted `revision` with the editor's
expected revision, abort on mismatch, otherwise write with `revision + 1`. Never retry by
silently overwriting. On an active-revision conflict, keep the user's uncommitted UI intent
available, show **Reload Latest / Cancel**, and require a new explicit action against current
state. Use `BroadcastChannel` or Dexie change notifications to refresh other tabs; notification
is advisory, revision checks are authoritative. Transactions that also modify `savedDecks` or
`customSpells` must include all affected stores. Saved snapshots use a persisted monotonic
`SavedDeck.revision` (starting at `1`); associated Save and Delete also CAS the expected saved
revision captured in `baseline.savedRevision`. Both expected revisions are verified inside the
same transaction before any write. A saved-snapshot conflict is reported in the deck pane with
**Save As… / Open…** recovery, not resolved by matching names. Legacy associations whose
baseline content cannot be verified against the associated snapshot during the Dexie v4
migration keep the token absent and block Save until the user uses Open or Save As.

## 8. JSON Import and Export

Both formats are **unversioned** and strictly validated; there is no legacy, unknown-version,
or fallback-parsing path. Import validation is atomic: no record is written unless the entire
payload is valid and the user confirms the operation. Runtime schemas live in
`src/domain/payloads.ts`; the custom format is documented for users in the
[Custom Spell JSON & Import Guide](../custom-spell-import-guide.md).

### 8.1 Custom spells

- Export `CustomSpellExportPayload` sorted by name then ID; include only `source: "Custom"`
  spells plus all local SRD component-text overrides (verbal/somatic descriptions). Custom spell
  records retain their `updatedAt`; override export records omit the storage-only `updatedAt`.
  Filename `spell-card-generator-custom-spells-YYYY-MM-DD.json`.
- Editable copies of SRD spells are ordinary custom spells and use the same payload unchanged.
  Export preserves their UUIDs and fields; importing into an empty store restores them with
  those UUIDs, and existing collision review applies when a UUID is already present.
- Import cap: 5 MiB. Parse and validate the entire payload before applying changes. The
  supported payload is `{type:"custom-spells",spells:[...],srdSpellOverrides?:[...]}`. Invalid
  JSON, wrong `type`, unknown top-level fields, duplicate IDs inside the input, or invalid
  required fields cause **no import** and a readable error report. Validate duplicate input IDs
  before any collision remapping. Optional fields may use safe schema defaults only; there is no
  legacy or unknown-version path.
- **Source safety:** accept only records whose source is `Custom` for custom-spell imports. If a
  record says `SRD-5.2.1`, reject it rather than silently converting licensed SRD content. Do
  not import bundled spells as custom content.
- **ID namespace:** `srd-` (case-sensitive) is reserved for bundled spells. Remap any imported
  custom ID beginning `srd-` to a new UUID, whether or not that exact SRD ID currently exists.
  Preserve other valid IDs so deck references remain stable. Report all remaps with old/new IDs.
  Reject blank IDs and duplicate original IDs; guarantee unique final IDs.
- **SRD overrides:** `srdSpellOverrides` is optional and carries only `spellId`, `locale`,
  `verbalDescription`, and `somaticDescription`. Each record is validated against the loaded
  SRD data and language manifest (known `srd-` ID, supported locale, description only for an
  enabled component, bounded length); empty records are no-ops, and any invalid record aborts
  the whole import. Importing a payload without the field leaves local overrides unchanged.
- **Existing custom ID collisions:** before commit, display count and names of all conflicting
  spells. Offer **Overwrite Existing**, **Keep Both** (new UUID for each incoming conflicting
  spell), or **Skip** as a single batch-wide choice. Overwrite retains the ID, updates
  `updatedAt`, and refreshes all cards that reference it; show a prominent warning naming the
  affected records. Keep Both does not rebind existing deck entries. SRD records are never
  overwritten.
- Commit chosen records in a single Dexie transaction; validate final IDs and payloads before
  commit. An unexpected storage error rolls back the batch; show counts (imported/overwritten/
  copied/skipped/remapped) only after success. If another tab changes a collision target before
  commit, abort and re-run collision review rather than overwrite silently.

### 8.2 Decks

- Export `DeckExportPayload` with references only (not full spell bodies). Filename
  `spell-deck-YYYY-MM-DD.json`. Export the current active deck, not the saved-deck collection.
  Do not export `entryId`, `revision`, or `baseline`. The format is unversioned.
- Import maximum: 5 MiB JSON and 2,000 entries. The supported payload is
  `{type:"deck",name,exportedAt,entries:[{spellId,fitMode,reference:{source,name}}]}`. Validate
  the entire payload and all entries before any write; unknown top-level fields, wrong `type`,
  `fitMode` outside `auto` / `auto-shrink` / `multi-card`, missing/invalid `spellId`, invalid
  reference source/name, or excess limits cause atomic rejection. Do not infer references from
  names, migrate historical shapes, or claim future compatibility.
- Deck import/export and custom-spell import/export are separate workflows: deck JSON tools live
  in the deck actions menu, while custom-spell import/export lives in the Library pane next to
  **Create custom spell**. A deck export is not a backup of custom spell definitions or SRD
  overrides; the dialog must say so.
- Import replaces the active deck only after review and one explicit confirmation; a dirty
  active deck shows a discard warning. Cancel, validation failure, stale-revision conflict, or
  storage failure must leave persisted state unchanged. Generate unique UUID `entryId` values on
  import; deduplicate imported entries by `spellId` (keep the first occurrence and preserve
  relative order) and report the removed count. Adopt the imported name (empty `""` when the
  format legitimately permits it), omit `savedDeckId`, set `baseline` to null, and increment
  revision. Import never creates, updates, or deletes a saved snapshot; a populated imported
  deck shows **Not saved as a deck** and first-time Save opens Save As.
- Resolve `SRD-5.2.1` references **only** against bundled SRD IDs and `Custom` references
  **only** against custom IDs. Never silently rebind by name or across sources. If absent,
  retain an unresolved entry labeled by `reference.name`; allow repair to an existing spell or
  removal. Re-evaluate resolution on library changes. Unresolved entries remain visible but are
  **excluded from printing**, with a count and confirmation before print.
- **Cross-device transfer:** import custom spells first, then the deck. IDs ordinarily remain
  stable. If custom import remapped an ID, display a remap report; deck references are not
  automatically rewritten across separately imported files. Repair affected entries manually. No
  combined package or persistent remapping database is required.

**Language compatibility:** export payloads are unversioned and contain canonical SRD IDs and
`reference` hints, not the selected language or bundled spell bodies. Import/load decks in any
selected language without migrating or rewriting their entries. The stored `reference.name` may
be English or translated and is never used for matching. A missing translation yields a
placeholder, not a missing-reference repair suggestion. Imported custom spells retain their
contents and behavior regardless of the selected SRD language.

## 9. Card Layout and Text Fitting

**Physical size:** 2.5in × 3.5in (63.5 × 88.9 mm), `box-sizing: border-box`. Application-shell
controls and surrounding UI use Tailwind/shadcn. Card containers and all geometry that must
match print output use dedicated strict CSS with physical units (`pt`, `in`, `mm`); do not
derive physical dimensions from Tailwind spacing scales, pixels, viewport units, or transforms.

**Card typography:** spell titles use Vollkorn at weight 700 with natural Title Case; never
force uppercase. Titles wrap within the card header instead of clipping, allowing long names to
remain fully visible while measurement accounts for the added height. Body, rules, labels, and
stats use Alegreya Sans at weight 500 by default, with 400/700 and true italics available for
mixed formatting, followed by `"Barlow Semi Condensed"` and `sans-serif`. Card text uses
near-black `#111`, line-height `1.28`, and `0.01em` tracking so 7–8.5 pt output remains legible.
These rules are scoped to `.spell-card`; application-shell typography is unchanged. Card
typography must never override the application `--font-sans`, `--font-display`, or
`--font-mono` tokens.

**Card designs:** Classic is the unchanged original layout and the default for every session and
for any absent or invalid selection. Compact is an additive selectable layout. The **Card
design** selector sits in the Active Deck pane after `#deck-controls` and before the deck entries,
offers exactly Classic and Compact in the active UI language, is not persisted, and resets to
Classic on reload. A Legend button stays available for both designs and opens a localized
glossary describing Compact icons/abbreviations and abbreviations applied by **Abbreviate** to
editable spell text in either design. Neither the selector, its
hint, the Legend trigger, the Legend dialog, nor any tooltip is printed. The selected design is
part of the fit cache key and is used identically by the preview, hidden measurement card,
pagination, and print output; switching designs re-measures without changing stored spell or deck
data. Preview scale is a screen-only view setting as specified in §5; it is excluded from fit
cache inputs and print rendering. The Deck exposes a touch/keyboard-operable fit-mode help
disclosure and an accessible description on each fit selector.

Compact keeps the same 2.5 × 3.5 in card, safe Markdown pipeline, truncation, continuation, and
print rules. Its first card shows a single-outline level circle with the numeric level only, a
wrapping title, ritual `R` in the title row, casting-time glyph/quantity, `Target` plus the actual
range, `Hourglass` plus the verbatim duration, connected `V`/`S`/`M` boxes (localized catalog
shorts, or the full component override), a standalone `C` beside the component group when
concentration applies, and italic wrapping material detail. Casting-time and duration use fixed
glyphs or catalog unit shorts with catalog `.full` accessible labels; a retained casting-time or
duration caret becomes a numbered note. Notes are built before fitting as one atomic leading
block, are rendered on the first card only, are never split or ellipsized, and block printing with
a notes-specific message if they cannot fit even at the minimum size. Higher-level blocks are
opted into a separated `(+)` section only when `higherLevels` is non-empty; the wrapper survives
continuation pagination and is absent for inline higher-level prose. The Compact footer is exactly
Source | School | Classes, using the actual `sourceLabelText` (including `*`), the school catalog
short or full localized label, and per-class catalog shorts with full names for homebrew entries;
empty classes render `—`. Continuation cards keep title, level, continuation label, body,
page number, and footer, and omit metadata, material, notes, and tooltips. The school remains in
the three-part footer rather than repeating in the continuation header.

Compact casting-time parsing accepts authored abbreviated values (`A`, `BA`, the Compact glyph
alias `B`, `R`, and localized `min`/`MIN`, `Std.`, `hr`/`HR` forms) as the same semantic base as
their full-text equivalents, preserving qualifiers, caret notes, full accessible labels, fitting,
and print behavior. Rendering, fitting, and printing never run the abbreviation transformer and
never rewrite stored spell text.

- **Header (first card):** name, level, school, ritual/concentration indicators. Continuation cards
  add a localized continuation label (`contd.` / `Forts.`) aligned to the right of the header
  and omit the school from the header.
- **Metadata:** casting time, range, components, duration. Rendered on the first card only;
  continuation cards omit this section.
- **Body:** description, Higher Levels, classes, then any enabled verbal and somatic descriptions.
  Component descriptions use the same outlined `V`/`S`/`G` marker as the Compact component boxes
  in Classic and Compact cards, the details pane, and print, with localized `Verbal` and
  `Somatic`/`Gestisch` accessible labels.
- **Footer:** source and `Card X of N` for continuations.
- Components use V/S/M indicators; absent components display `—`. Material details may use one
  line with ellipsis on the first card; full details remain available in the Show details dialog.
- Fixed fields (school, range, duration and other header/metadata strings) never disappear:
  truncate with visible ellipsis if they cannot fit. The spell name wraps within the header
  instead of truncating; measurement includes the resulting header height. Full untruncated
  values remain available in spell details. Level and icons stay visible.

**Language-sensitive content:** card details, preview, and print use the selected translated
SRD record where available, or the unchanged custom record. On language changes, invalidate
measurements and pagination for changed content; content/language and fit mode must be
reflected in cache keys. Translation-unavailable placeholders appear only on screen, not on
printed cards. All existing truncation, Markdown safety, continuation, and Unicode rules remain
in force.

**Measurement:** use a hidden, fixed-size card matching print styles to measure actual rendered
heights after explicitly loading and checking the required card fonts (not only
`document.fonts.ready`). Recompute on spell edits, fit-mode changes, card-design changes, and
relevant style/font changes; cache per content, design, language, and mode. Cache keys include the
design, the content fingerprint (including the override marker), and the actual fitted block
fingerprint. A missing measured body element is a hard measurement error, not a silent fit
success; the preview and print dialog show a fit error and printing stays blocked. Never perform
measurement for every scroll event.

**Best fit (default, stored value `auto`):** new entries start in Best fit, and existing stored
entries that used the former implicit default migrate to it. Fit the complete body on one card at
the largest size from 8.5 pt down to 8 pt. When even 8 pt cannot hold the complete body, use the
multi-card layout at 8 pt instead, so Best fit never truncates a description, never shows the
truncation warning, and never renders single-card body text below 8 pt. The stored mode stays
`auto`; preview, details, hidden measurement, and print resolve the same effective layout, and
changing the language or card design re-resolves it. Multi-card's existing per-block 6 pt fallback
for an individual unbreakable block is unchanged.

**Auto-shrink (explicit single card):** always produces exactly one physical card. Body font
starts at 8.5 pt and decreases in 0.5 pt steps to 6 pt; choose the largest size that fits. If the
complete body still overflows at 6 pt, render the largest safe prefix of the parsed Markdown
document that fits **together with a trailing visible ellipsis (`…`)**, measuring the ellipsis as
part of that prefix rather than appending it afterwards. Prefer block boundaries, then sentence,
word, and finally Unicode grapheme boundaries; never output malformed HTML, a broken list
container, half a Unicode grapheme, or an empty trailing block. Drop a trailing heading or rule
that has no remaining body text so the ellipsis stays visible. Preview and print use the same
truncated card, and the ellipsis is printed. Show an **on-screen-only** warning that the
description was truncated at 6 pt because it did not fit on one card and that switching to
Best fit or multi-card mode preserves the full description. An explicit fit mode is
authoritative: Auto-shrink never switches to multiple cards automatically, multi-card never
truncates, and changing the mode immediately updates preview and print. Do not silently drop
content without the ellipsis and warning.

**Multi-card:** body font 8 pt; use 6 pt only when an individual block cannot fit at 8 pt.
Split description/Higher Levels at paragraph boundaries, then sentence/word boundaries as
needed; preserve words, punctuation, and reading order. The first card keeps the full header,
metadata, body, and footer. Continuation cards keep the compact header (name, level, and
a localized `contd.` / `Forts.` label) but omit the metadata section and material line,
using the reclaimed space for body content. Pagination measures the actual first-card and
continuation-card layouts separately. Continuations show `Continued from Card N` and
`Card X of N` in the footer. Keep a spell's physical cards consecutive. If a single unbreakable
token cannot fit, wrap it at Unicode grapheme boundaries without dropping characters; if fixed
chrome alone is too tall, ellipsize its strings rather than clipping outside the card. Class tags
may move to the last continuation card. No description text may be silently lost in multi-card
mode. Define a maximum of 100 continuation cards per deck entry; if exceeded, block printing
that entry with a visible actionable error rather than silently discard content.

Markdown parsing must build safe document nodes (not HTML string slicing). Treat headings, list
items, paragraphs, and Higher Levels as ordered blocks; split a block at safe text-node
boundaries and reopen/close list and emphasis structure on each card. Never orphan a heading
when the next body block could instead move with it. Preserve punctuation and all original
visible body text in multi-card mode. Use grapheme-aware splitting (`Intl.Segmenter` or
equivalent) for emoji/combining marks.

Markdown rendering must preserve the authored structure in the preview, details dialog,
measurement card, and printed output. Headings use a depth-based type hierarchy, blockquotes
use a distinct indented rule, and unordered, ordered, and nested lists keep their visible
markers, numbering, and indentation. Bold, italic, code, and table rendering remain supported.
Tables are never rewritten automatically: a table that exceeds the available card width or
height is reported as a table-specific overflow, the on-screen preview warns that it is too
large, and printing is blocked for that entry until the table is shortened or reduced in
columns.

Preview warnings and controls are never printed. Use deterministic fixture tests for empty
text, long strings, Markdown, headings/lists/emphasis, multi-card pagination, auto-shrink
truncation with a measured ellipsis (including split paragraphs and list items), extremely long
tokens, and unusual Unicode.

## 10. Printing

Print with `window.print()` and dedicated strict CSS only. The application shell may use
Tailwind/shadcn, but print sheets, grid geometry, card containers, typography sizing, gaps, and
margins use physical units (`pt`, `in`, `mm`) plus page-size-specific `@page` rules so correctly
configured output can meet the ±1 mm physical tolerance. Support **US Letter** (8.5in × 11in)
and **ISO A4** (210 × 297 mm). A 3 × 3 card grid occupies 7.5in × 10.5in; print up to nine
physical cards per sheet, leaving unused cells blank on the last sheet. The selected Classic or
Compact design is printed as measured. Tooltip and dialog portals (including Radix popper
wrappers) are screen-only and must not print; card-local rules notes are part of the card DOM and
must print.

- The user selects Letter or A4 and toggles cutting borders. The initial paper selection follows
  the active data/UI language: **A4** for German and **US Letter** for English.
- Before printing, set the document title to the active deck name, or to a dated generic name
  (`spell-cards-deck-YYYY-MM-DD`) when the deck is unnamed, so browser print-to-PDF filenames are
  descriptive. Restore the application title after printing.
- Before programmatic printing, explicitly load and verify the Vollkorn and Alegreya Sans faces,
  including italics, rather than relying solely on `document.fonts.ready`. Card fonts are
  self-hosted and precached, so print output must not depend on network font loading or
  mid-render fallback.
- Use page-size-specific `@page { size: letter | A4; margin: 0; }` rules via separate print
  classes/stylesheets as appropriate. Use physical `in` units for card and grid dimensions, not
  `vw`/`vh`.
- Center the fixed-size grid on the physical sheet; avoid forced scaling, page breaks inside
  cards, trailing blank sheets, and browser header/footer content.
- Pre-print dialog: choose matching paper size; 100% / Actual Size; no headers/footers; margins
  None or Minimum. Warn that hardware non-printable margins or driver scaling can still alter
  physical dimensions.
- Printing never changes the deck or the selected language.
- Print only entries whose spell bodies are available in the current language, including
  resolvable custom spells. Omit translation-unavailable placeholders and genuinely missing
  references without modifying deck entries. Before print, show separate counts for omitted
  missing translations and missing references, and require confirmation if either is nonzero.
  Disable print if no printable entries remain. Keep the 100-continuation-card error and print
  geometry rules.
- **Verification status:** physical print geometry is verified in Chromium to date. Current
  Chrome, Firefox, and Safari are the cross-browser target; Firefox/Safari and physical printers
  remain to be validated. Measure a printed or 100%-scale PDF test grid: target card dimensions
  63.5 × 88.9 mm, with ±1 mm acceptable measurement tolerance under correctly configured print
  settings; deviations outside tolerance require investigation/documentation, not silent CSS
  scaling. Verify nine cards fit without page overflow and no extra blank sheet is emitted.
  Verify print preview and 100%-scale output render card titles in Vollkorn and body copy in
  Alegreya Sans without fallback substitution, clipping, or content overflow. Document
  browser/printer limitations; exact physical sizing depends partly on user print settings and
  hardware.

## 11. Offline, Persistence, Security, and Quality

- First-load readiness means required assets, the language manifest, and **every** bundled
  language dataset are available together in the service-worker cache. Until then, show an
  offline-status icon whose accessible name is **Setting up offline access**; if
  installation/precache fails, show **Offline setup incomplete** with a retry control. Hovering,
  focusing, or tapping the icon reveals the status text. The online app may remain usable while
  caching completes. Retry requests a fresh cache/install attempt. Once readiness is verified,
  hide the status icon and announce **Offline ready** to assistive technology; never claim
  offline-ready based only on service-worker registration.
- Cache the manifest and all corresponding datasets as a coherent versioned release, never
  advertising mixed-version or absent assets as offline-ready. After the first successful
  precache, core data, card measurement, preview, and printing require no runtime network
  requests. Language switching after full precache must work without network access.
- Card typography assets are self-hosted WOFF2 files included in the precache release. Offline
  card preview, measurement, and printing must use those local faces; Google Fonts is not
  required for card rendering. Application-shell Google Fonts are progressive enhancement and
  may fall back to system fonts offline.
- Production hosting is static: Cloudflare serves the built client assets and the service
  worker over HTTPS, and all user data remains in the browser. Deployment must not introduce
  server-side storage, API endpoints, or secrets, and public `VITE_*` variables must never
  contain secrets. The SPA fallback must not intercept or alter static asset paths, and the PWA
  service worker and precached datasets must deploy as ordinary immutable static files.
- Restore the saved language preference only if its tag occurs in the current manifest;
  otherwise use English. If a previously selected language was removed, visibly explain the
  fallback to English and clear/update the stale preference without changing any deck. If a
  dataset cannot be loaded/validated despite being listed, show an error and offer retry; retain
  the current working language where possible, or visibly fall back to English if necessary.
  Never silently show English spell bodies under a different language selection. If preference
  persistence fails, keep the in-memory selection and indicate that it may not survive reload.
- Use existing keyboard, label, focus, and modal accessibility rules for the language dropdown
  and confirmation. Apply the same untrusted-JSON/Markdown sanitation and Unicode-safe
  rendering rules to every language.
- Version caches; prompt when an update is ready and reload cleanly to avoid mixed-version
  assets. Do not erase IndexedDB during app updates.
- Use an explicit Dexie schema version from the initial release. Future schema upgrades must
  preserve user data or fail visibly; failed writes must not be reported as saved. Use
  transactions for linked operations.
- If IndexedDB is unavailable or quota is exceeded, show an error and explain that local data
  cannot be safely saved. Export is the user backup path; storage may be evicted or cleared.
- For concurrent tabs, enforce the transactional revision checks in §7. Notifications refresh
  other tabs but must not replace compare-and-swap checks. Apply equivalent stale-write
  prevention to associated saved-snapshot updates and custom-spell conflict overwrites.
- Treat imported JSON and Markdown as untrusted. Disable raw HTML and executable links, do not
  inject imported content into `innerHTML`, and avoid external assets. Validate before
  storing/rendering.
- Support keyboard navigation, labeled controls, modal focus management, and visible focus
  states. Target WCAG 2.2 AA for core workflows.
- Performance targets on a typical modern laptop: search/filter response under 200 ms for the
  bundled dataset plus 1,000 custom spells; ordinary deck edits under 300 ms for 200 entries.
  Printing/layout may take longer; show progress when computation is noticeable. These are test
  targets, not strict real-time guarantees.

## 12. Verification Matrix

This is the single acceptance matrix. Each row names the authoritative requirement and the
distinctive expected outcome; tests may live in unit, integration, or Playwright suites. Do not
duplicate these outcomes as a second invariants list.

| ID  | Area            | Scenario                                                                                            | Expected outcome                                                                                                                                                                                               | Requirement |
| --- | --------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| B1  | Build           | Strict TypeScript build                                                                             | Build succeeds; no runtime external requests during normal use after first load                                                                                                                                | §3, §11     |
| B2  | Build           | SRD input missing, malformed, incomplete, or duplicate-ID                                           | Build fails with a readable indexed error; no partial English dataset; bundled spells remain SRD-only with attribution                                                                                         | §2          |
| B3  | Build           | New valid language file                                                                             | Discovered without an allowlist; manifest and dataset generated; English remains selectable                                                                                                                    | §2, §11     |
| B4  | Build           | Translation changes `index`, duplicates an index, uses an unknown ID, or conflicts on mechanics     | Build fails; no fallback parsing and no invalid dataset shipped                                                                                                                                                | §2, §4      |
| B5  | Build           | Translation omits some spells                                                                       | Incomplete but valid dataset passes; untranslated IDs remain valid deck references                                                                                                                             | §2, §4      |
| S1  | Search          | Search/filter matching, OR/AND, components, and ordering                                            | Rules in §5 hold; empty groups impose no restriction; filters never change the deck                                                                                                                            | §5          |
| S2  | Search          | Language change                                                                                     | A fully covered deck switches immediately; incomplete coverage requires confirmation; Fuse index, results, counts, sorting, details, preview, and print reflect the selected language; custom spells unchanged | §5, §7      |
| S3  | Search          | Selected spell absent in target language                                                            | Show unavailable message; never silently display English under another language tag                                                                                                                            | §5, §7      |
| S4  | Search          | Active deck changes in another tab during a switch dialog                                           | Re-read the latest revision and require a new confirmation for the new state                                                                                                                                   | §7          |
| S5  | Search          | Missing translations; cancel or confirm switch                                                      | Exact affected entry and distinct-spell counts; cancel changes nothing; confirm preserves active/saved entries, ordering, dirty state, baseline, and revisions while showing placeholders                      | §7          |
| S6  | Search          | Translation-unavailable spell already in deck                                                       | Single entry preserved as an unavailable placeholder; switching back restores its text                                                                                                                         | §7          |
| S7  | Search          | Custom spell and true broken reference in a translated deck                                         | Custom spell unchanged; broken reference remains repairable and is not categorized as untranslated                                                                                                             | §7, §8.2    |
| L1  | Library UI      | Narrow-viewport Library layout and state preservation                                               | Search and **Filters** trigger visible first; sheet, removable chips, actions menu, and always-available create entry point work; the result list is the only vertical scroll container; query, filters, and scroll position survive tab switches; no page-level horizontal overflow | §5          |
| C1  | Custom spells   | Create/edit/duplicate                                                                               | UUID/timestamps/validation/defaults follow §6; saved snapshots are not rewritten                                                                                                                               | §6          |
| C1a | Custom spells   | Create editable copy of an SRD spell in the active deck                                             | Draft is unsaved; save asks to replace only the matching entry (ID/position/fit mode preserved); cancelling the editor writes nothing; save failure leaves the editor open; replacement failure, retry, and a concurrent deck switch/identity change keep the saved copy and never write the wrong deck | §6, §7      |
| C2  | Custom spells   | Delete                                                                                              | Confirmation; spell and matching active entry removed atomically; saved decks unchanged                                                                                                                        | §6          |
| C2a | Custom spells   | Cancel custom deletion                                                                              | Spell and active deck unchanged                                                                                                                                                                                | §6          |
| C3  | Custom spells   | Undo immediately after deletion                                                                     | Original spell and entry ID/position restored; dirty state recalculated                                                                                                                                        | §6          |
| C4  | Custom spells   | Undo after intervening edit or cross-tab write                                                      | Undo refused with explanation; newer work preserved                                                                                                                                                            | §6          |
| C5  | Custom spells   | Abbreviate and Undo abbreviation in non-SRD drafts                                                  | Action absent from the SRD override editor; only scoped draft fields change; Markdown code/links/URLs/IDs and UI labels unchanged; captured-language matching with explicitly configured inflected forms and no inferred variants; unsupported language is a no-op; session LIFO undo restores only changed fields; save persists normally and cancel writes nothing | §6, §9      |
| D1  | Decks           | Reload / ordinary edits                                                                             | Active deck survives reload; every successful mutation is persisted                                                                                                                                            | §7          |
| D2  | Decks           | Duplicate add and bulk append                                                                       | Individual duplicate rejected with bottom-right notification; Append all skips and reports added/skipped counts                                                                                                | §5, §7      |
| D3  | Decks           | Status and Save enablement                                                                          | Four statuses remain correct across reload, deletion, Undo, Save As, and unassociated name-only content; Save is enabled only when dirty with a valid association; disabled Save writes nothing                | §7          |
| D4  | Decks           | Save clean/disabled deck                                                                            | No write, revision increment, or success message                                                                                                                                                               | §7          |
| D5  | Decks           | Save associated dirty deck                                                                          | Only the associated snapshot changes; saved revision increments; baseline token and active revision advance atomically                                                                                         | §7          |
| D6  | Decks           | Save As from associated or blank deck                                                               | New saved ID at revision 1; original snapshot unchanged; name applied to both records; association/baseline updated                                                                                            | §7          |
| D7  | Decks           | Open while dirty                                                                                    | **Replace active deck** confirmation, including the associated snapshot; cancel leaves persisted state unchanged                                                                                               | §7          |
| D8  | Decks           | Open clean identical/changed snapshot                                                               | Identical clean reopen is a no-op; changed saved revision is a real refresh                                                                                                                                    | §7          |
| D9  | Decks           | Inline rename invalid, unchanged, Escape, or stale                                                  | No write; committed name reverts; Save is blocked until resolved                                                                                                                                               | §7          |
| D10 | Decks           | New deck clean or twice while blank                                                                 | Blank replacement without confirmation; second attempt is a no-op with no revision change                                                                                                                      | §7          |
| D11 | Decks           | Clear entries with empty/nonempty deck                                                              | Empty clear is disabled with no write; nonempty clear keeps name/association/baseline and offers no Undo                                                                                                       | §7          |
| D12 | Decks           | Delete associated saved snapshot                                                                    | Snapshot removed; association omitted; baseline null; active revision advanced; status becomes **Not saved as a deck**                                                                                         | §7          |
| D13 | Decks           | Delete non-associated saved snapshot                                                                | Snapshot removed; active content, association, and revision unchanged                                                                                                                                          | §7          |
| D14 | Decks           | Repair missing spell in active deck                                                                 | Only the active reference changes; saved snapshot unchanged; no rebind to a spell already in the deck                                                                                                          | §7          |
| D15 | Decks           | Re-import deleted spell with original ID/source                                                     | Existing missing references resolve automatically                                                                                                                                                              | §7, §8.2    |
| D16 | Decks           | Legacy association matching/mismatching baseline                                                    | Dexie v4 sets the token only when verifiable; mismatches stay tokenless and block Save with Open/Save As recovery                                                                                              | §7          |
| D17 | Decks           | Two tabs mutate the same active revision or custom-spell revision                                   | Exactly one succeeds; the other receives a conflict with no silent overwrite; stale custom-spell revisions abort                                                                                               | §7, §11     |
| D18 | Decks           | Two tabs save the same associated snapshot                                                          | Both expected revisions are checked; exactly one succeeds; the other receives Save As/Open conflict                                                                                                            | §7          |
| D19 | Decks           | IndexedDB quota or transaction failure                                                              | No success message and no partial linked operation                                                                                                                                                             | §7, §11     |
| I1  | Import/export   | Valid custom-spell payload                                                                          | Strict validation; collision/remap/override review applied; atomic commit                                                                                                                                      | §8.1        |
| I2  | Import/export   | Custom import duplicate IDs, unknown top-level field, missing required field, or SRD-sourced record | Whole batch rejected with a readable error; no fallback parsing; SRD records never relabeled Custom                                                                                                            | §8.1        |
| I3  | Import/export   | Custom import reserved `srd-` ID                                                                    | Unique UUID remap with old/new mapping; bundled SRD unchanged                                                                                                                                                  | §8.1        |
| I4  | Import/export   | Custom import collisions                                                                            | Batch-wide Skip/Keep Both/Overwrite Existing; counts and names shown; commit rechecks collisions                                                                                                               | §8.1        |
| I5  | Import/export   | SRD override import                                                                                 | Known ID/locale/enabled component/length enforced; invalid record aborts atomically; omitted field leaves overrides unchanged                                                                                  | §8.1        |
| I6  | Import/export   | Valid deck payload                                                                                  | Strict validation; export contains references without spell bodies; active deck replaced only after confirmation; order retained; duplicates removed with reported count                                       | §8.2        |
| I7  | Import/export   | Deck import while dirty                                                                             | One explicit replacement confirmation; cancel/invalid/stale commit leaves active data intact                                                                                                                   | §7, §8.2    |
| I8  | Import/export   | Deck limits and unknown/version-like fields                                                         | 5 MiB/2,000-entry rejection; unknown top-level fields and legacy/version shapes rejected atomically                                                                                                            | §8.2        |
| I9  | Import/export   | Deck import same name as saved deck                                                                 | Active deck replaced; no saved snapshot modified; imported deck is **Not saved as a deck**                                                                                                                     | §7, §8.2    |
| I10 | Import/export   | Custom vs deck formats                                                                              | Separate dialogs and files; deck export states it does not back up custom spells or SRD overrides; no combined package required                                                                                | §8          |
| I11 | Import/export   | Export and reimport a partially translated deck                                                     | Canonical IDs and all entries preserved; no language-specific payload rewriting                                                                                                                                | §8.2        |
| P1  | Cards/print     | Best fit and explicit auto-shrink on long Markdown                                                  | Best fit: one card at 8.5–8 pt when the full body fits, otherwise multi-card at 8 pt with no truncation or warning; explicit auto-shrink: one card down to 6 pt with a safe measured ellipsis and preview-only warning; print matches preview | §9          |
| P2  | Cards/print     | Multi-card on long Unicode/Markdown content                                                         | No dropped text, invalid markup, or split grapheme; continuation order retained; complete text preserved                                                                                                       | §9          |
| P3  | Cards/print     | More than 100 continuation cards                                                                    | Visible blocking error for that entry; no silent omission                                                                                                                                                      | §9, §10     |
| P4  | Cards/print     | Long spell title and fixed fields                                                                   | Title wraps within the header without clipping; fixed fields truncate visibly; level/icons remain visible                                                                                                      | §9          |
| P5  | Cards/print     | Card typography and font readiness                                                                  | Vollkorn 700 title, Alegreya Sans 500 body with fallbacks; required faces verified before measurement and `print()`; app chrome fonts unchanged                                                                | §9, §10     |
| P6  | Cards/print     | Letter/A4 nine-card sheet                                                                           | Up to nine 2.5in × 3.5in cards on a centered grid; no clipping, unwanted scaling, or extra blank sheet at correct settings                                                                                     | §10         |
| P7  | Cards/print     | Unresolved or untranslated entries at print                                                         | Separate counts; confirmation; omitted without deleting entries; print disabled if none resolved                                                                                                               | §10         |
| P8  | Cards/print     | Cross-browser verification                                                                          | Chromium geometry verified; Chrome/Firefox/Safari remain the target for current and future validation                                                                                                          | §10         |
| P9  | Cards/print     | Offline card preview and print                                                                      | Self-hosted card fonts load from precache; typography and measurement work without network                                                                                                                     | §9, §11     |
| P10 | Cards/print     | Compact abbreviated casting-time parsing                                                            | `A`, `BA`/`B`, `R`, and localized `MIN`/`HR`/`min`/`Std.` values parse to the same base, glyph, accessible label, qualifier, caret, notes, fit, and print behavior as full text; stored text is never transformed at render | §9          |
| U1  | Details UI      | Preview-only default pane                                                                           | No duplicated metadata/description pane by default; details open from the header control; no duplicate preview menu or context menu; dialog closes on spell change; print unchanged                                                        | §5          |
| U2  | Workspace       | Compact / Split / Wide and container boundaries | Modes follow measured container width, including viewport mismatch; 720px starts Split and 1200px starts Wide; pane minima hold; one relevant tab list; selection reveals Details; state and focus survive resizing without page scrolling | §5 |
| U3  | Preview         | Physical / Fit width and continuation rows | Physical is the default; centered visual bounds scale up to 200%; rows wrap without overlap; physical dimensions, fit result, card count, text and print remain unchanged | §5, §9 |
| U4  | Library filters | Progressive disclosure and live results | Level/Class/Source initially visible; Advanced opens for active advanced filters; sticky polite match count updates immediately; Reset clears query and filters; All/SRD/Custom expose pressed state; specific-source reselection is stable | §5 |
| U5  | Accessibility   | Selected spell, filter summaries, recovery and targets | Current row has aria-current and a leading cue; two-line names retain accessible full names; multi-select names include values; empty reset restores focus; 44px touch targets in Compact/Split and coarse-pointer Wide | §5 |
| U6  | Deck UI         | Save vocabulary, Legend and fit help | Unassociated primary action says Save as…; associated says Save; Start new deck differs from empty status; Legend explains both designs; touch/keyboard users can open fit explanations and each selector has an accessible description | §7, §9 |
| H1  | Hosting         | Static production build                                                                             | Static assets plus SPA fallback deploy to Workers; no API/backend/secrets; PWA and client routes intact                                                                                                        | §3, §11     |
| O1  | Offline/quality | First-load precache and retry                                                                       | Accurate **Setting up offline access**, **Offline ready**, or **Offline setup incomplete** with retry states; status is icon-only with hover/focus/tap text, hidden when ready, and still announced to assistive technology; no premature readiness claim; runtime asset errors show an actionable retry/fallback | §11         |
| O2  | Offline/quality | Offline language switch after readiness                                                             | No runtime network request; only manifest-listed assets are selectable                                                                                                                                         | §11         |
| O3  | Offline/quality | Persisted language removed or invalid                                                               | Visible English fallback; saved/active decks unchanged; preference cleared or updated                                                                                                                          | §11         |
| O4  | Offline/quality | Untrusted Markdown/JSON                                                                             | Raw HTML/scripts cannot execute; links are non-clickable; validation precedes storage/rendering                                                                                                                | §3, §11     |
| O5  | Offline/quality | Accessibility and performance targets                                                               | Keyboard/labels/focus/modals hold; WCAG 2.2 AA core workflows; search/edit performance targets met or measured                                                                                                 | §11         |
| O6  | Offline/quality | Cache update                                                                                        | Versioned cache update prompt and clean reload; IndexedDB is not erased during app updates                                                                                                                     | §11         |

**Storage implementation note:** the `activeDeck` singleton and `savedDecks` records use
explicit Dexie keys. Explicit Dexie schema versions govern future evolution; migrations must
preserve user data or fail visibly. Keep the service-worker cache lifecycle independent from
IndexedDB schema evolution.

**Data-source implementation note:** pin canonical English SRD and every translation input to
reviewed commits or checked-in snapshots for reproducible builds. The upstream TypeScript schema
is a mapping reference; the application's canonical Zod schema is the runtime/build validation
authority. Dataset set, manifest, and precached assets belong to the same build release.
