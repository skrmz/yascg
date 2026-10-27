# Development

Technical and maintenance documentation for YASCG. For the project overview, features, and
usage, see the [README](../README.md). For the raw SRD source format, normalization,
translation, and migration procedures, see [SRD Data Pipeline & Normalization](srd-data-pipeline.md).
Repository guidance for contributors and coding agents is in [AGENTS.md](../AGENTS.md), and
the product specification is [MAIN-spec.md](specs/MAIN-spec.md).

## Toolchain and commands

Requires **Node.js >= 26** and **pnpm v12+** with the unified **Vite+ (`vp`)** toolchain
(Vite, Rolldown, Vitest, Oxlint, Oxfmt). `vp <name>` runs a built-in command, while
`vp run <name>` runs a `package.json` script or a `vite.config.ts` task; scripts cannot
overwrite built-ins. Check `package.json` and `vite.config.ts` before adding or invoking a
command.

| Command | Purpose |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `pnpm install` (or `vp install`) | Install dependencies. |
| `pnpm run normalize:srd` | Normalize `data/srd/` into the committed `src/data/` artifacts. |
| `pnpm run dev` (`vp dev`) | Start the development server. |
| `pnpm run check` (`vp check`) | Format, lint, and type-check. |
| `pnpm run test` (`vp test`) | Run unit and integration tests. |
| `pnpm run build` | Run `normalize:srd`, then `vp build`. |
| `pnpm run preview` (`vp preview`) | Preview the production build. |
| `pnpm exec playwright install chromium` | Install the Chromium browser for E2E tests. |
| `pnpm run test:e2e` | Run the Playwright end-to-end tests. |

Run `vp check` and `vp test` after relevant changes. Changing data processing or application
behavior also requires normalization and the affected E2E tests. The complete review checklist
is maintained in [AGENTS.md](../AGENTS.md).

Generated datasets under `src/data/` are committed build artifacts. Vite serves `src/data/`
as its `publicDir`; do not hand-edit generated SRD datasets or bypass normalization
validation.

## Architecture

Paths are relative to the repository root.

- `src/domain/` — Zod schemas, types, limits, deck/baseline rules, ID rules.
- `src/db/` — Dexie schema v3 (`customSpells`, `savedDecks`, singleton `activeDeck`,
  `srdSpellOverrides`) with compare-and-swap revisions, deck-entry normalization, and
  advisory `BroadcastChannel` notifications.
- `src/services/data/` — manifest/dataset loading, language preference, search and
  filters, and deck reference resolution.
- `src/markdown/` — safe `marked` token walker (raw HTML dropped, links as text), React
  renderer, and deterministic AST splitting/pagination.
- `src/cards/` — card chrome plus hidden-card measurement, `document.fonts.ready`
  gating, single-card auto-shrink (8.5pt → 6pt) that truncates at the 6pt floor with a
  measured trailing ellipsis, and multi-card pagination with heading-orphan
  prevention. Continuation cards use a compact header with a localized
  `contd.`/`fortgesetzt` label and omit repeated metadata to maximize body space.
- `src/components/details/` — card-preview-first details pane, on-demand spell details
  dialog with full metadata and canonical description, and card actions menus (ellipsis
  dropdown plus right-click context menu) backed by the existing edit flow.
- `src/print/` — strict physical print CSS and 3x3 sheet rendering.
- `src/io/` — JSON export/import with collision review and atomic commits. Custom-spell
  payloads are version `1.1.0` (they may carry SRD component-text overrides); deck
  payloads remain version `1.0.0`.
- `src/pwa/` — service-worker registration and Cache Storage verification.
- `src/i18n.ts`, `src/locales/` — typed `react-i18next` configuration and EN/DE
  spell-card terminology catalogs.
- `src/state/`, `src/components/`, `src/ui/` — application state and UI.

## SRD data and normalization

The [SRD Data Pipeline & Normalization](srd-data-pipeline.md) document is the authoritative
reference for the raw source specification, field table, mechanics cross-validation,
normalization implementation, and step-by-step translation workflow. This section summarizes
the responsibilities and the details that are unique to day-to-day maintenance.

### Inputs and generated artifacts

Raw inputs live in `data/srd/`:

- `srd-spells-2024.json` — canonical English input.
- `srd-spells-2024_<LANG>.json` — optional translation inputs (`<LANG>` is a canonical
  BCP 47 tag, e.g. `de`, `pt-BR`). New files are discovered automatically; there is no
  language allowlist.

Both use the canonical source shape: a bare JSON array of spells with a string `school`
holding a canonical English school name, `classes` as canonical English class-name
strings, `components` as `V`/`S`/`M` letters, `damage.damage_type` as a canonical
lowercase slug, and an optional `subclasses` array of `"<Class>: <Subclass>"` identifiers.
`damage.damage_at_slot_level` and `attack_type` are retained verbatim as raw-source
metadata but are ignored by normalization. Non-dataset reference material (for example
`srd-spells-2024_extended-props.json`) belongs in `data/reference/`, not `data/srd/`,
because every `srd-spells-2024*` JSON file there is treated as an input.

Bundled spells populate `subclasses` with canonical identifiers reconciled from
`data/reference/srd-spells-2024_extended-props.json` (204 of 339 spells, 698 assignments).
Only the 48 official 2024 subclasses (see [subclasses.md](subclasses.md)) are localized;
reference-only subclasses are preserved verbatim and fall back to the English name, and
Artificer subclasses are excluded and reported. See "Subclass reconciliation" below.

`scripts/normalize-srd.ts` discovers inputs, normalizes them into the application `Spell`
schema, cross-validates translations against the canonical English mechanics, and writes
build artifacts to `src/data/` (served as Vite's `publicDir`):

- `spells.srd.json` — canonical English dataset.
- `spells.srd.<lang>.json` — one dataset per discovered language.
- `spell-languages.json` — the static language manifest (`code`, `displayName`,
  `dataset`).

Stable IDs derive from the upstream `index` slug (`index: "acid-splash"` →
`id: "srd-acid-splash"`) and are identical across every language. Translated text is
preserved; language-independent mechanics are normalized to canonical values.

### Source structure adapters

- **Shared adapter** (`scripts/srd/shared-translation.ts` → `scripts/srd/english.ts`)
  handles the canonical source shape and is used for English and every translation,
  including `de`. There are no language-specific adapters, and the former German adapter
  and `convert:german-srd` repair script have been removed.
- Unsupported source structures fail the build with the offending filename and index
  instead of being skipped.

### Source format migration

`scripts/migrate-srd-source-format.ts` is the one-time utility that converts a legacy
5e-bits source (object `school.index`, `classes[].index`, object `damage.damage_type`,
top-level `url`) into the canonical shape:

```powershell
pnpm exec tsx scripts/migrate-srd-source-format.ts           # dry run (default): report only
pnpm exec tsx scripts/migrate-srd-source-format.ts --apply   # write the converted sources
```

It converts `school`, `classes[]`, and `damage.damage_type` to canonical scalars, removes
the top-level `url`, validates any existing `subclasses` as canonical identifiers, and
preserves `damage.damage_at_slot_level` and `attack_type` verbatim. Entry and property order
are kept with 2-space indentation, LF line endings, and a trailing newline. Before writing,
it verifies the converted sources normalize back to the committed
`src/data/spells.srd*.json` datasets; `--apply` stages and validates both outputs, then swaps
them in atomically with a backup that is restored if a later replacement fails. Re-running on
already-migrated files reports a no-op. Options are `--input-dir <dir>` (default `data/srd`),
`--files <a,b>` (default both datasets), and `--report <path>`. Legacy files reaching
`normalize:srd` fail with a message pointing at this tool. The utility is temporary and may
be deleted once no legacy sources remain. Full conversion and atomic-write guarantees are
documented in
[§2.F of the data pipeline](srd-data-pipeline.md#f-legacy-source-migration-one-time-utility).

### Subclass reconciliation

`scripts/migrate-srd-subclasses.ts` is the one-time utility that populates the optional raw
`subclasses` field from `data/reference/srd-spells-2024_extended-props.json`:

```powershell
pnpm exec tsx scripts/migrate-srd-subclasses.ts                                   # dry run (default)
pnpm exec tsx scripts/migrate-srd-subclasses.ts --apply --report data/reference/subclass-reconciliation.json
```

Reference identifiers are reconciled to canonical `"<Class>: <Subclass>"` identifiers via an
explicit alias table (no fuzzy matching), reference-only subclasses are preserved verbatim,
and Artificer subclasses are excluded and reported. English is matched by spell name (with
the single `Arance Hand` → `Arcane Hand` typo alias); the German source is matched by
`index` because its names are localized, so EN/DE assignments are identical. The tool
inserts `subclasses` immediately after `classes`, sorts identifiers, omits empty lists, and
never touches any other field. Before writing it normalizes both sources in memory and
asserts every field **except** `subclasses` still matches the committed
`src/data/spells.srd*.json` datasets (mechanics unchanged), then writes atomically with
backup/rollback. Re-running is a no-op. Options are `--input-dir <dir>` (default `data/srd`),
`--reference <path>`, `--files <a,b>` (default both datasets), `--report <path>`, and
`--apply`. The committed report (`data/reference/subclass-reconciliation.json`) records
catalog coverage, the alias map, reference-only and excluded identifiers, unmatched names,
dedup collisions, and per-file population counts. Full options and guarantees are in
[§2.G of the data pipeline](srd-data-pipeline.md#g-subclass-reconciliation-one-time-utility).

### Drift protection

`src/test/srd-dataset.test.ts` normalizes the checked-in `data/srd/` sources and asserts
they reproduce the committed `src/data/spells.srd*.json` datasets (baseline read from the
Git object store, so a local `pnpm run build` cannot mask a regression). Intentional source
updates are reviewed through `git diff` on the raw source and the regenerated datasets. The
test also verifies the 339-spell count, unique and sorted IDs, populated subclass counts,
subclass parent validity, unchanged non-subclass mechanics, and EN/DE assignment parity; see
[§3.A of the data pipeline](srd-data-pipeline.md#a-drift-protection-regression-test-no-snapshot-file).

### Adding a translation

1. Add `data/srd/srd-spells-2024_<LANG>.json` using the canonical source shape described
   above. There is no separate adapter for `de`: localized free text is preserved while
   school/class/damage/subclass mechanics use the canonical English identifiers.
2. Run `pnpm run normalize:srd`. Partial coverage is valid; unknown IDs, duplicate
   indices, malformed JSON, malformed subclass identifiers, or conflicting canonical
   mechanics fail the build.
3. Confirm the language appears in `src/data/spell-languages.json` and the UI.

The full procedure, including BCP 47 naming, source-shape validation, cross-validation
rules, and the service-worker refresh step after adding a language, is documented in
[§4 of the data pipeline](srd-data-pipeline.md#4-adding-or-updating-srd-translations-german-french-spanish-etc).

## Deck rules

A deck contains at most one entry per unique spell ID, regardless of how the spell is added.
Individual add attempts for a spell already in the active deck show a bottom-right Sonner
notification and leave the deck unchanged. **Append all** adds only spells not already
present and reports how many were added and skipped.

Deck imports replace the active deck and deduplicate imported entries by spell ID, keeping
the first occurrence and preserving the relative order of retained entries. The import
summary reports how many duplicates were removed. Loading a saved deck and upgrading an
existing database also normalize duplicate entries; no print-quantity or multiple-copy
mechanism exists.

## Localization

The complete application interface is localized with `react-i18next` in English and
German, including navigation, library controls, deck management, print and import/export
dialogs, confirmations, validation, toasts, status messages, and accessible names. The
locale follows the existing **spell data language** selection (`en`/`de` in
`src/data/spell-languages.json`); there is no separate UI-language control. English is
the fallback for unknown codes. Switching languages updates the UI without a reload.

- Catalogs are TypeScript modules under `src/locales/` (`en.ts`, `de.ts`) so no
  `resolveJsonModule` is needed. `de` is checked for key parity via
  `satisfies Translations`; use complete sentences, interpolation, and
  `_one`/`_other` plural keys rather than concatenating translated fragments.
- School/class names, component letters, and damage-type names are localized at
  presentation time via `src/locales/labels.ts`; unknown damage types fall back to the
  raw stored value. Bundled and generated SRD datasets (`src/data/**`) are never
  modified, and canonical mechanics, filter values, paper identifiers, and persisted
  data stay unchanged.
- Runtime notices and errors are stored as typed descriptors from
  `src/locales/messages.ts` and translated only at render time. Unexpected exception
  text is logged to the console and replaced with a generic localized message. Import
  validation may expose deliberately selected field paths and constraints within
  localized framing, but never raw exception text.
- The initial locale is seeded synchronously from the stored preference
  (`spellCards.language`) before first paint. Initial data loading, unsupported
  preferences, retry, and interactive switches keep the last committed language until a
  new dataset is ready. `document.documentElement.lang` follows the resolved UI locale.
- Bundled, unmodified SRD content carries its actual dataset language via
  `resolveContentLanguage`; custom spells, imported content, and SRD overrides can mix
  author languages and therefore omit a content `lang`. Card fitting re-measures on
  locale change, so switching languages never leaves stale measurements.

Intentional exclusions: the YASCG product name, exact SRD legal attribution (rendered
with `lang="en"`), manifest language endonyms, dataset-authored spell names and content,
user-entered or persisted names/content, export filenames and identifiers, paper product
names (US Letter / ISO A4), and technical diagnostics that are logged but not shown.

## Printing

User-facing print steps and browser/printer settings are documented in the
[README](../README.md#printing). The print pipeline renders cards at 2.5in x 3.5in, nine
per sheet on a centered 7.5in x 10.5in grid.

In **Multi-Card** mode, the first card keeps the full header and metadata block.
Continuation cards keep the card header with a localized `contd.`/`fortgesetzt` label,
omit the repeated metadata, and use the extra space for description text; pagination is
measured against these continuation layouts so preview and print match.

Cards whose spell body is not available in the selected language, or whose reference is
missing, are omitted from printing without changing the deck; separate counts are shown
and confirmation is required. Entries that would exceed the 100-continuation-card limit
block printing with an actionable error.

Exact physical sizing depends partly on hardware non-printable margins and driver
scaling. Verify with a test sheet and measure the printed grid; deviations outside the
±1mm tolerance should be investigated rather than "fixed" with CSS scaling. Print geometry
is verified in Chromium; Firefox/Safari and physical printers may differ and should be
validated against the documented settings.

## Offline behavior and storage

`vite-plugin-pwa` precaches the app shell, JS/CSS, local fonts, the language manifest,
and every bundled dataset as one versioned release. The header shows **Setting up
offline access** until Cache Storage verifiably contains every required asset, then
**Offline ready**. Failures show **Offline setup incomplete — Retry**. Language
switching after precache performs no network requests.

IndexedDB is not guaranteed permanent. If local storage is unavailable or quota is
exceeded, an actionable banner appears; export custom spells and decks as JSON to keep
a backup. The language preference is stored separately in `localStorage` under
`spellCards.language`; application data lives in Dexie tables. See
[SRD Data Pipeline & Normalization](srd-data-pipeline.md#b-runtime-loading-in-the-app)
for manifest and runtime dataset loading.

## Limitations and data constraints

- Bundled spells are SRD 5.2.1 only; no non-SRD material is included.
- Verbal/somatic notes added to an SRD spell are stored locally, scoped to that spell
  **and** the current language, and never modify the bundled SRD data. An edited SRD spell
  is marked `*` on its source badge; **Reset to original** removes only that spell/language
  note. These notes are included only in custom-spell exports (`1.1.0`) and are not part of
  deck exports (`1.0.0`).
- No accounts, cloud sync, backend, PDF engine, card backs, or third-party formats.
- Print geometry is verified in Chromium; Firefox/Safari and physical printers may
  differ and should be validated against the documented settings.

Related references:

- [Custom Spell JSON & Import Guide](custom-spell-import-guide.md)
- [Official subclass catalog](subclasses.md)
- [Product specification](specs/MAIN-spec.md)
- [SRD data pipeline](srd-data-pipeline.md)
