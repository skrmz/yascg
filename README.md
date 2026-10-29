# YASCG - Yet Another Spell Card Generator

Offline-first generator for Dungeons & Dragons 5.5e (2024) spell cards. Browse the SRD 5.2.1
spell library in multiple languages, create custom spells, assemble one active deck, save and
load named decks, and print 2.5in x 3.5in (63.5mm x 88.9mm) cards 9-up on US Letter or A4
paper. All data stays in your browser unless you export it as JSON.

## Features

- Browse and search the bundled SRD 5.2.1 library with filters for level, class, school,
  components, casting time, concentration, ritual, and source.
- English and German bundled spell data, build-time translation support, and editable custom
  spells with JSON import/export.
- Keep one active deck and save or load named decks locally.
- Preview spell cards, open full details, render safe Markdown, and print with auto-shrink or
  multi-card continuation.
- Work offline after the app shell and bundled data are cached. The interface is localized in
  English and German and follows the selected spell-data language; a language without a UI
  catalog keeps its spell data and uses the English interface.

## Quick start

Local development requires **Node.js 24.11+ (24 LTS) or 26 LTS** and **pnpm v12+** with the
unified **Vite+ (`vp`)** toolchain.

```powershell
pnpm install
pnpm run dev
```

Run `pnpm run check` and `pnpm run test` before submitting changes. The complete command
reference, E2E setup, architecture, and testing workflow are in the
[development guide](docs/DEVELOPMENT.md#toolchain-and-commands).

Bundled SRD datasets are generated from `data/srd/` by `pnpm run normalize:srd`;
`pnpm run build` runs that step automatically. Never edit generated files under `src/data/` by
hand.

Hosting is a static SPA on Cloudflare Workers Static Assets with the SPA fallback and no server
API or secrets. Build, preview, Workers Builds, and `compatibility_date` operations are in the
[Cloudflare deployment guide](docs/cloudflare-deployment-guide.md).

## Using the app

Browse the library, open a spell for details, and add spells to the **Active Deck**. Create
custom spells from the library and edit them from the details view. Decks contain at most one
entry per spell; **Append all** skips spells already present and reports how many were added
and skipped. **Replace deck** replaces the active entries after confirmation.

The active deck is always stored locally as you edit it; "unsaved" never means "unpersisted".
Named snapshots are independent of the working deck:

- Edit the active deck name inline. Enter or blur commits, Escape cancels.
- **Save** updates the associated named snapshot. A deck without an association opens
  **Save As…** instead.
- **Save As…** in the deck actions menu always creates a new named snapshot, including from a
  blank workspace. Duplicate names are allowed.
- **Open…** lists saved snapshots by name and update time; open one to replace the active deck,
  or delete it from the same dialog. Opening while the active deck has unsaved changes asks for
  confirmation.
- **New deck** blanks the active workspace without deleting saved snapshots. **Clear entries**
  removes only the active entries and keeps the name and snapshot association.
- The status label distinguishes **Saved**, **Unsaved changes**, **Not saved as a deck**, and
  **New deck**.

**Import / export deck** in the deck actions menu exports the current active deck as unversioned
JSON: its name, ordered spell references, and display settings. Spell bodies and SRD edits are
not included; import replaces only the active deck and does not create or modify named snapshots
or spell definitions. **Custom spell import/export** in the Library pane next to **Create custom
spell** exports complete custom spell definitions and SRD component-text overrides (including
your edited verbal/somatic notes). The two formats are separate: deck export is **not** a backup
of custom spells or SRD overrides. For a complete backup, export custom spells first, then the
deck. The exact deck and import edge-case rules are in the
[product specification](docs/specs/MAIN-spec.md#7-active-and-saved-decks).

## Printing

Open **Print** in the Active Deck pane. Cards are 2.5in x 3.5in, nine per sheet on a centered
7.5in x 10.5in grid. In **Multi-Card** mode, the first card keeps the full header and metadata
block; continuation cards use a compact header with a localized `contd.`/`fortgesetzt` label and
omit repeated metadata so more description fits.

Before printing, configure your browser/printer:

- Paper: **US Letter** or **ISO A4** (matching the dialog selection).
- Scale: **100% / Actual Size** — do not use "Fit to page".
- Margins: **None** or **Minimum**.
- Disable browser **headers and footers**.

Cards whose spell body is unavailable in the selected language, or whose reference is missing,
are omitted from printing without changing the deck; the app shows separate counts and asks for
confirmation. Entries that would exceed the 100-continuation-card limit block printing with an
actionable error.

Exact physical sizing depends partly on hardware non-printable margins and driver scaling.
Verify with a test sheet and measure the printed grid; deviations outside the ±1mm tolerance
should be investigated rather than "fixed" with CSS scaling.

## Offline behavior and data safety

After the first successful load, the header shows **Setting up offline access** until the app
shell, local fonts, language manifest, and bundled datasets are cached. It then shows **Offline
ready**; failures show **Offline setup incomplete — Retry**. Language switching after precache
performs no network requests.

Spells, decks, and local SRD notes are stored in the browser's IndexedDB; the language
preference is stored separately in `localStorage`. The active deck is written automatically;
named snapshots change only through Save or Save As. IndexedDB is not guaranteed permanent. If
local storage is unavailable or quota is exceeded, the app shows an actionable banner. Because
browser storage may be cleared, use the export tools to keep backups: export custom spells
(including SRD component-text edits) from the Library and the active deck JSON from the deck
actions menu. To restore, import both files; the two exports cover different data.

## Limitations

- Bundled spells are SRD 5.2.1 only; no non-SRD material is included.
- Verbal/somatic notes added to an SRD spell are stored locally, scoped to that spell **and**
  the current language, and never modify the bundled SRD data. An edited SRD spell is marked
  `*` on its source badge; **Reset to original** removes only that local note. These notes are
  included only in custom-spell exports and are not part of deck exports.
- No accounts, cloud sync, backend, PDF engine, card backs, or third-party formats.
- Print geometry is verified in Chromium; Firefox/Safari and physical printers may differ and
  should be validated against the documented settings.

## Attribution and licensing

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by
Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is
licensed under the Creative Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/.

Bundled spells are SRD 5.2.1 only and labeled `SRD 5.2.1`; user-authored spells are labeled
`Custom`. No Wizards of the Coast logos or D&D trademarks are used.

## Documentation

- [Development guide](docs/DEVELOPMENT.md) — commands, architecture, implementation notes,
  localization, printing/offline internals, and testing.
- [Product specification](docs/specs/MAIN-spec.md) — current behavioral contract and
  verification matrix.
- [SRD data pipeline](docs/srd-data-pipeline.md) — source format, normalization, translations,
  migrations, and subclass reconciliation.
- [Cloudflare deployment guide](docs/cloudflare-deployment-guide.md) — Workers Static Assets,
  Workers Builds, and deployment operations.
- [Custom spell import guide](docs/custom-spell-import-guide.md) — JSON format and import
  behavior.
- [Official subclass catalog](docs/subclasses.md) — the canonical 2024 subclass list.
- [Agent and contributor guidance](AGENTS.md).
