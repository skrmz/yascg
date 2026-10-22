# YASCG - Yet Another Spell Card Generator

Offline-first generator for Dungeons & Dragons 5.5e (2024) spell cards. Browse the SRD 5.2.1 spell library in multiple languages, create custom spells, assemble one active deck, save and load named decks, and print 2.5in x 3.5in (63.5mm x 88.9mm) cards 9-up on US Letter or A4 paper. All data stays in your browser unless you export it as JSON.

Specification: [`docs/specs/spell-card-generator-spec.md`](docs/specs/spell-card-generator-spec.md).

## Attribution

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/.

Bundled spells are SRD 5.2.1 only and labeled `SRD 5.2.1`; user-authored spells are labeled `Custom`. No Wizards of the Coast logos or D&D trademarks are used.

## Tech Stack

- React 19 + TypeScript strict
- Vite+ with `@vitejs/plugin-react`
- Tailwind v4 (`@tailwindcss/vite`)
- shadcn-style Radix primitives
- Lucide icons
- Dexie
- Zod
- Fuse.js,
- `marked` token walker
- i18next + react-i18next (spell-card terminology, EN/DE).

## Toolchain

Requires **Node.js >= 24** and **pnpm v12+** with the unified **Vite+ (`vp`)** toolchain (Vite, Rolldown, Vitest, Oxlint, Oxfmt). Repository guidance lives in [`AGENTS.md`](AGENTS.md).

```powershell
pnpm install         # or: vp install
pnpm run normalize:srd
pnpm run dev         # vp dev
pnpm run check       # vp check  (lint, format, typecheck)
pnpm run test        # vp test
pnpm run build       # normalize:srd + vp build
pnpm run preview     # vp preview
pnpm exec playwright install chromium
pnpm run test:e2e
```

## Bundled data and normalization

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

No bundled spell declares `subclasses` yet: the field exists so the later subclass phase can
populate it without another schema change, and nothing is merged from the
`data/reference/` file.

`scripts/normalize-srd.ts` discovers inputs, normalizes them into the application
`Spell` schema, cross-validates translations against the canonical English mechanics,
and writes build artifacts to `src/data/` (served as Vite's `publicDir`):

- `spells.srd.json` — canonical English dataset.
- `spells.srd.<lang>.json` — one dataset per discovered language.
- `spell-languages.json` — the static language manifest (`code`, `displayName`,
  `dataset`).

Stable IDs derive from the upstream `index` slug (`index: "acid-splash"` →
`id: "srd-acid-splash"`) and are identical across every language. Translated text is
preserved; language-independent mechanics are normalized to canonical values.

### Source structure adapters

- **Shared adapter** (`scripts/srd/shared-translation.ts` → `scripts/srd/english.ts`) handles
  the canonical source shape and is used for English and every translation, including `de`.
  There are no language-specific adapters, and the former German adapter and
  `convert:german-srd` repair script have been removed.
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

- Options: `--input-dir <dir>` (default `data/srd`), `--files <a,b>` (default both
  datasets), `--report <path>` (write the JSON report to a file).
- It converts `school`, `classes[]` and `damage.damage_type` to canonical scalars, removes
  the top-level `url`, preserves `damage.damage_at_slot_level` and `attack_type` verbatim,
  validates any existing `subclasses` as canonical identifiers, and keeps entry/property
  order with 2-space indentation, LF line endings and a trailing newline.
- Before writing anything it verifies the converted sources normalize back to the committed
  `src/data/spells.srd*.json` datasets; `--apply` stages and validates both outputs, then
  swaps them in atomically with a backup that is restored if a later replacement fails.
  Re-running on already-migrated files reports a no-op.
- Legacy files reaching `normalize:srd` fail with a message pointing at this tool. The
  utility is temporary and may be deleted once no legacy sources remain.

### Drift protection

`src/test/srd-dataset.test.ts` normalizes the checked-in `data/srd/` sources and asserts
they reproduce the committed `src/data/spells.srd*.json` datasets (baseline read from the
Git object store, so a local `pnpm run build` cannot mask a regression). Intentional source
updates are reviewed through `git diff` on the raw source and the regenerated datasets.

### Adding a translation

1. Add `data/srd/srd-spells-2024_<LANG>.json` using the canonical source shape described
   above. There is no separate adapter for `de`: localized free text is preserved while
   school/class/damage/subclass mechanics use the canonical English identifiers.
2. Run `pnpm run normalize:srd`. Partial coverage is valid; unknown IDs, duplicate
   indices, malformed JSON, malformed subclass identifiers, or conflicting canonical
   mechanics fail the build.
3. Confirm the language appears in `src/data/spell-languages.json` and the UI.

## Architecture

- `src/domain/` — Zod schemas, types, limits, deck/baseline rules, ID rules.
- `src/db/` — Dexie schema v1 (`customSpells`, `savedDecks`, singleton `activeDeck`)
  with compare-and-swap revisions and advisory `BroadcastChannel` notifications.
- `src/services/data/` — manifest/dataset loading, language preference, search and
  filters, and deck reference resolution.
- `src/markdown/` — safe `marked` token walker (raw HTML dropped, links as text), React
  renderer, and deterministic AST splitting/pagination.
- `src/cards/` — card chrome plus hidden-card measurement, `document.fonts.ready`
  gating, auto-shrink (8.5pt → 6pt) and multi-card pagination with heading-orphan
  prevention.
- `src/print/` — strict physical print CSS and 3x3 sheet rendering.
- `src/io/` — `1.0.0` JSON export/import with collision review and atomic commits.
- `src/pwa/` — service-worker registration and Cache Storage verification.
- `src/i18n.ts`, `src/locales/` — typed `react-i18next` configuration and EN/DE
  spell-card terminology catalogs.
- `src/state/`, `src/components/`, `src/ui/` — application state and UI.

## Localization

Spell-card terminology (card labels, metadata terms, school/class names, component
letters, damage-type badges, the "Higher Levels" heading, and the custom-spell form) is
localized with
`react-i18next`, using English as the fallback and German as the second locale. The
locale follows the existing **spell data language** selection (`en`/`de` in
`src/data/spell-languages.json`); there is no separate UI-language control. Unknown
codes (e.g. `fr` in tests) fall back to English.

- Catalogs are TypeScript modules under `src/locales/` (`en.ts`, `de.ts`) so no
  `resolveJsonModule` is needed; `de` is checked for key parity via
  `satisfies Translations`.
- School/class names, component letters, and damage-type names are localized at
  presentation time via `src/locales/labels.ts`; unknown damage types fall back to the
  raw stored value. Bundled and generated SRD datasets (`src/data/**`) are never
  modified, and canonical mechanics/enums stay English.
- The initial locale is seeded synchronously from the stored preference
  (`spellCards.language`) before first paint, and card fitting re-measures on locale
  change, so switching languages never leaves stale measurements.
- Localized content containers carry a `lang` attribute; `document.documentElement.lang`
  is intentionally left untouched.

Out of scope: app chrome, library filter dropdowns, the print dialog, deck pane, dialogs,
and status/error messages remain English.

## Printing

Open **Print** in the Active Deck pane. Cards are 2.5in x 3.5in, nine per sheet on a
centered 7.5in x 10.5in grid.

Before printing, configure your browser/printer:

- Paper: **US Letter** or **ISO A4** (matching the dialog selection).
- Scale: **100% / Actual Size** — do not use "Fit to page".
- Margins: **None** or **Minimum**.
- Disable browser **headers and footers**.

Cards whose spell body is not available in the selected language, or whose reference is
missing, are omitted from printing without changing the deck; separate counts are shown
and confirmation is required. Entries that would exceed the 100-continuation-card limit
block printing with an actionable error.

Exact physical sizing depends partly on hardware non-printable margins and driver
scaling. Verify with a test sheet and measure the printed grid; deviations outside the
±1mm tolerance should be investigated rather than "fixed" with CSS scaling.

## Offline behavior

`vite-plugin-pwa` precaches the app shell, JS/CSS, local fonts, the language manifest,
and every bundled dataset as one versioned release. The header shows **Setting up
offline access** until Cache Storage verifiably contains every required asset, then
**Offline ready**. Failures show **Offline setup incomplete — Retry**. Language
switching after precache performs no network requests.

IndexedDB is not guaranteed permanent. If local storage is unavailable or quota is
exceeded, an actionable banner appears; export custom spells and decks as JSON to keep
a backup.

## Limitations

- Bundled spells are SRD 5.2.1 only; no non-SRD material is included.
- No accounts, cloud sync, backend, PDF engine, card backs, or third-party formats.
- Print geometry is verified in Chromium; Firefox/Safari and physical printers may
  differ and should be validated against the documented settings.
