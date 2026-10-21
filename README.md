# YASCG - Yet Another Spell Card Generator

Offline-first generator for Dungeons & Dragons 5.5e (2024) spell cards. Browse the
SRD 5.2.1 spell library in multiple languages, create custom spells, assemble one
active deck, save and load named decks, and print 2.5in x 3.5in (63.5mm x 88.9mm)
cards 9-up on US Letter or ISO A4 paper. All data stays in your browser unless you
export it as JSON.

Specification: [`docs/specs/spell-card-generator-spec.md`](docs/specs/spell-card-generator-spec.md).

## Attribution

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1")
by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD
5.2.1 is licensed under the Creative Commons Attribution 4.0 International License,
available at https://creativecommons.org/licenses/by/4.0/.

Bundled spells are SRD 5.2.1 only and labeled `SRD 5.2.1`; user-authored spells are
labeled `Custom`. No Wizards of the Coast logos or D&D trademarks are used.

## Toolchain

Requires **Node.js >= 24** and **pnpm v12+** with the unified **Vite+ (`vp`)**
toolchain (Vite, Rolldown, Vitest, Oxlint, Oxfmt). Repository guidance lives in
[`AGENTS.md`](AGENTS.md).

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

- `5e-SRD-Spells.json` — canonical English input (5e-bits 2024 schema).
- `5e-SRD-Spells_<LANG>.json` — optional translation inputs (`<LANG>` is a canonical
  BCP 47 tag, e.g. `de`, `pt-BR`). New files are discovered automatically; there is no
  language allowlist.

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

- **English / shared adapter**: canonical upstream structure (`index`, `school.index`,
  `classes[].index`, `V`/`S`/`M` components, canonical damage identifiers).
- **German adapter**: maps `G` (Geste) to `somatic`, German class names to canonical
  classes, and `higher_levels` to `higherLevels`.
- Unsupported source structures fail the build with the offending filename and index
  instead of being skipped.

### Canonical English snapshot

`data/srd/canonical-english.snapshot.json` pins the reviewed normalized English output.
The first run creates it; subsequent runs fail if normalized English diverges, so
source updates are intentional and reviewable. Translation inputs and the snapshot
belong to the same release as the generated manifest and datasets.

### Adding a translation

1. Add `data/srd/5e-SRD-Spells_<LANG>.json` in the canonical upstream shape (or add a
   dedicated adapter under `scripts/srd/` for a genuinely different structure).
2. Run `pnpm run normalize:srd`. Partial coverage is valid; unknown IDs, duplicate
   indices, malformed JSON, or conflicting canonical mechanics fail the build.
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
- `src/state/`, `src/components/`, `src/ui/` — application state and UI.

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
