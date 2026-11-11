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
- Create an editable custom copy of an SRD spell that is in the active deck, then replace that
  deck entry with the saved copy while keeping its position and fit mode.
- Keep one active deck and save or load named decks locally.
- Preview spell cards, open full details, render safe Markdown, and print with best-fit layout
  (one card at 8 pt or larger when it fits, otherwise multi-card continuation), or forced
  auto-shrink/multi-card.
- Choose the **Classic** card layout (the default) or a denser **Compact** layout, with a Legend
  for Compact abbreviations and icons. The selection applies to preview and print and is not
  stored across reloads.
- Work offline after the app shell and bundled data are cached. The interface is localized in
  English and German and follows the selected spell-data language; a language without a UI
  catalog keeps its spell data and uses the English interface.

## Quick start

Local development requires **Node.js 24.11+** and **pnpm v12+** with the unified **Vite+
(`vp`)** toolchain. Node.js 26 LTS is also supported; the repository's `.nvmrc` pins the
intended major version (24).

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

On narrow screens the library is list-first: search and **Filters** share one row, filters open
in a bottom sheet with removable chips for active filters, and **Append all**, **Replace deck**,
**Create custom spell**, and **Custom spell import/export** are grouped in the **Library actions**
menu. Search, filters, and the list scroll position are kept when switching tabs; **Reset
filters** clears the search text and every filter.

Each deck entry uses **Best fit** by default: a description that fits on one card is shrunk only
down to 8 pt, and a longer description continues on multiple cards without truncation. The
per-entry fit selector can instead force **Auto-shrink** (always one card, shrinking to 6 pt with
a visible ellipsis and warning when the text does not fit) or **Multi-card**.

When the selected spell is an SRD spell that is already in the active deck, the details header
offers **Create editable copy**. It opens the custom-spell editor with an unsaved copy; nothing
is stored until you save. After saving, confirm **Replace entry** to point only that deck entry
at the copy, keeping its position and fit mode. Cancelling the confirmation keeps the saved copy
in your library and leaves the deck unchanged. If the deck changed before you confirm, the
dialog explains the outcome and offers **Retry** where retrying is safe; a different active deck
requires cancelling and restarting the flow. The original SRD spell and saved decks are never
modified.

The custom-spell editor offers **Abbreviate** for non-SRD drafts. It shortens eligible spell-data
text only, including the description, higher levels, casting time, range, duration, and component
notes; UI labels such as **Casting Time**, **Range**, and **Duration** remain spelled out.
Matching uses the language captured when the editor opened, and only English and German prose
catalogs are available (other languages show an explanatory status instead of falling back to
English). Numeric quantities introduced by `up to`/`bis zu` become `≤` (for example
`up to 1 hour` → `≤ 1h` or `up to one hour` → `≤ 1h`), while non-numeric phrases are left
unchanged. Standalone number words from zero through ten and hundred are also shortened, but
compounds and hyphenated forms such as `twenty-one` are not. **Undo abbreviation** restores the
fields changed by the latest action until the editor closes. Saving stores the abbreviated text,
so there is no automatic way to reverse it afterwards.

Editable copies of bundled SRD spells also offer **Apply short description** when a reviewed short
text for that spell exists in the language the editor opened in. It replaces the description and,
when supplied, the higher-level text with the shorter bundled text; **Undo short description**
shares the same last-in-first-out undo as **Abbreviate**. The action is disabled with a short hint
when no short text is available, and it is not offered after a saved copy is reopened through the
ordinary edit path, because saved copies no longer know which SRD spell they came from. Create a
new editable copy to apply a short description again. No text is generated in your browser and no
data is sent anywhere.

The active deck is always stored locally as you edit it; "unsaved" never means "unpersisted".
Named snapshots are independent of the working deck:

- Edit the active deck name inline. Enter or blur commits, Escape cancels.- **Save** updates the associated named snapshot. A deck without an association opens
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

The **Card design** selector below the deck controls chooses **Classic** (the default) or
**Compact**. Compact replaces the metadata table with compact casting-time, range, and duration
items, connected component boxes, a standalone concentration indicator, numbered rules notes,
optional higher-level sections, and a three-part Source | School | Classes footer. Its
**Legend** button explains the abbreviations and icons. The design choice affects the preview,
measurement, pagination, and print output; it is kept for the session and resets to Classic after
a reload.

**Import / export deck** in the deck actions menu exports the current active deck as unversioned
JSON: its name, ordered spell references, and display settings. Spell bodies and SRD edits are
not included; import replaces only the active deck and does not create or modify named snapshots
or spell definitions. **Custom spell import/export** in the Library pane (next to **Create custom
spell** on desktop, in the **Library actions** menu on narrow screens) exports complete custom
spell definitions and SRD component-text overrides (including
your edited verbal/somatic notes). The two formats are separate: deck export is **not** a backup
of custom spells or SRD overrides. For a complete backup, export custom spells first, then the
deck. The exact deck and import edge-case rules are in the
[product specification](docs/specs/MAIN-spec.md#7-active-and-saved-decks).

## Printing

Open **Print** in the Active Deck pane. Cards are 2.5in x 3.5in, nine per sheet on a centered
7.5in x 10.5in grid. The paper selection defaults to **A4** for German and **US Letter** for
English. When saving as PDF, the browser suggests the active deck name, or a dated generic name
when the deck is unnamed. The selected Classic or Compact card design is used consistently in
preview, measurement, and print. Automatic fitting and **Multi-Card** mode use the same
continuation layout: the first card keeps the full header and metadata block; continuation cards
use a compact header with a localized `contd.`/`Forts.` label and omit repeated metadata so more
description fits.

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

After the first successful load, the header shows an offline-status icon while the app shell,
local fonts, language manifest, and bundled datasets are being cached. Hover, focus, or tap the
icon to read **Setting up offline access**; on failure it reads **Offline setup incomplete** and
a retry control appears. The retry control re-runs the cache check. Once everything is cached,
the icon disappears and **Offline ready** is announced to assistive technology. Language
switching after precache performs no network requests.

Spells, decks, and local SRD notes are stored in the browser's IndexedDB; the language
preference is stored separately in `localStorage`. The active deck is written automatically;
named snapshots change only through Save or Save As. IndexedDB is not guaranteed permanent. If
local storage is unavailable or quota is exceeded, the app shows an actionable banner. Because
browser storage may be cleared, use the export tools to keep backups: export custom spells
(including SRD component-text edits) from the Library and the active deck JSON from the deck
actions menu. To restore, import both files; the two exports cover different data.

The header menu includes a bilingual **Privacy Policy** entry. All UI and card fonts are
self-hosted; the app makes no Google Fonts or other third-party font requests. Existing deletion
mechanisms are unchanged: individual custom-spell deletion, saved-deck deletion, deck-entry
removal and Clear entries, and SRD override reset. Clearing a browser's site data removes
IndexedDB, `localStorage`, and Cache Storage. The app intentionally provides no bulk
"delete all local data" action.

## Limitations

- Bundled spells are SRD 5.2.1 only; no non-SRD material is included.
- Verbal/somatic notes added to an SRD spell are stored locally, scoped to that spell **and**
  the current language, and never modify the bundled SRD data. An edited SRD spell is marked
  `*` on its source badge; **Reset to original** removes only that local note. These notes are
  included only in custom-spell exports and are not part of deck exports.
- No accounts, cloud sync, backend, PDF engine, card backs, or third-party formats.
- Editable copies of SRD spells keep the text and language captured when they were created.
  Changing the app language does not translate a custom copy; edit its text or create a new copy
  from the translated SRD spell if needed.
- Print geometry is verified in Chromium; Firefox/Safari and physical printers may differ and
  should be validated against the documented settings.

## Attribution and licensing

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by
Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is
licensed under the Creative Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/.

Bundled spells are SRD 5.2.1 only and labeled `SRD 5.2.1`; user-authored spells are labeled
`Custom`. No Wizards of the Coast logos or D&D trademarks are used.

Fonts are self-hosted under the SIL Open Font License 1.1. The full license text and upstream
copyright notices are in [font-licenses.txt](src/data/font-licenses.txt), served at
`/font-licenses.txt`.

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
- [Privacy and legal audit](docs/privacy-and-legal.md) — verified storage/network behavior, font
  licensing, Impressum assessment, and Cloudflare verification checklist.
- [Privacy Policy](docs/privacy-policy.md) / [Datenschutzerklärung](docs/privacy-policy.de.md) —
  the in-app policy text (German is authoritative).
- [Agent and contributor guidance](AGENTS.md).
