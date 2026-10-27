# YASCG - Yet Another Spell Card Generator

Offline-first generator for Dungeons & Dragons 5.5e (2024) spell cards. Browse the SRD 5.2.1
spell library in multiple languages, create custom spells, assemble one active deck, save and
load named decks, and print 2.5in x 3.5in (63.5mm x 88.9mm) cards 9-up on US Letter or A4
paper. All data stays in your browser unless you export it as JSON.

## Features

- Browse and search the bundled SRD 5.2.1 library with advanced filters for level, class,
  school, components, casting time, concentration, ritual, and source.
- English and German bundled spell data, build-time translation support, and editable custom
  spells with JSON import/export.
- Keep one active deck and save or load named decks locally.
- Preview spell cards, open full details, render safe Markdown, and print with auto-shrink or
  multi-card continuation.
- Work offline after the app shell and bundled data are cached, with the interface localized
  in English or German alongside the spell data.

## Getting started

Local development requires **Node.js >= 26** and **pnpm v12+** with the unified
**Vite+ (`vp`)** toolchain.

```powershell
pnpm install         # or: vp install
pnpm run dev         # vp dev
pnpm run check       # vp check  (lint, format, typecheck)
pnpm run test        # vp test
pnpm run build       # normalize:srd + vp build
pnpm run preview     # vp preview
pnpm exec playwright install chromium
pnpm run test:e2e
```

Open the local URL printed by the development server. Bundled SRD datasets are generated
from `data/srd/` by `pnpm run normalize:srd`; `pnpm run build` runs that step automatically.
The full toolchain workflow and architecture are documented in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Contributor guidance lives in
[AGENTS.md](AGENTS.md).

## Deployment

The app is a static SPA and deploys to **Cloudflare Workers with Static Assets** using the
Cloudflare Vite plugin and Wrangler. `wrangler.jsonc` defines the `yascg` Worker and the
single-page-application fallback; no server API or secrets are involved.

```powershell
pnpm run build
pnpm exec wrangler deploy --dry-run
pnpm run preview      # Workers runtime preview
pnpm run deploy       # build + wrangler deploy
```

For Cloudflare's Git integration, set the build command to `pnpm run build` and the deploy
command to `pnpm exec wrangler deploy`, with `yascg` as the Worker name and `/` as the root
directory. `pnpm preview` and the E2E suite also run against the local Workers runtime.
Deployment details, the Workers Builds settings, and the `compatibility_date` rule are in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#cloudflare-workers-deployment) and the
[Cloudflare deployment guide](docs/cloudflare-deployment-guide.md).

## Usage

Browse the library, open a spell for details, and add spells to the **Active Deck**. Create
custom spells from the library and edit them from the details view. The Active Deck pane
manages the single active deck, saved decks, and JSON import/export for custom spells and
decks. Decks contain at most one entry per spell; **Append all** skips spells that are already
present and reports how many were added and skipped.

### Printing

Open **Print** in the Active Deck pane. Cards are 2.5in x 3.5in, nine per sheet on a centered
7.5in x 10.5in grid. In **Multi-Card** mode, the first card keeps the full header and
metadata block; continuation cards use a compact header with a localized
`contd.`/`fortgesetzt` label and omit repeated metadata so more description fits.

Before printing, configure your browser/printer:

- Paper: **US Letter** or **ISO A4** (matching the dialog selection).
- Scale: **100% / Actual Size** — do not use "Fit to page".
- Margins: **None** or **Minimum**.
- Disable browser **headers and footers**.

Cards whose spell body is unavailable in the selected language, or whose reference is
missing, are omitted from printing without changing the deck; the app shows separate counts
and asks for confirmation. Entries that would exceed the 100-continuation-card limit block
printing with an actionable error.

Exact physical sizing depends partly on hardware non-printable margins and driver scaling.
Verify with a test sheet and measure the printed grid; deviations outside the ±1mm tolerance
should be investigated rather than "fixed" with CSS scaling.

## Technology stack

- React 19 + TypeScript (strict) on Vite+ with `@vitejs/plugin-react`, Tailwind v4
  (`@tailwindcss/vite`), and shadcn-style Radix primitives.
- Sonner notifications, Lucide icons, Dexie (IndexedDB), Zod, Fuse.js, and a safe `marked`
  token walker.
- i18next + react-i18next for English/German presentation; `vite-plugin-pwa` for offline
  caching.
- Cloudflare Workers Static Assets via `@cloudflare/vite-plugin` and Wrangler for production
  hosting.

## Offline behavior and data storage

The app precaches its shell, scripts, styles, local fonts, language manifest, and every
bundled dataset as one versioned release. The header shows **Setting up offline access**
until Cache Storage verifiably contains every required asset, then **Offline ready**.
Failures show **Offline setup incomplete — Retry**. Language switching after precache
performs no network requests.

Spells, decks, and local SRD notes are stored in the browser's IndexedDB; the language
preference is stored separately in `localStorage`. IndexedDB is not guaranteed permanent. If
local storage is unavailable or quota is exceeded, the app shows an actionable banner —
export custom spells and decks as JSON to keep a backup.

## Limitations

- Bundled spells are SRD 5.2.1 only; no non-SRD material is included.
- Verbal/somatic notes added to an SRD spell are stored locally, scoped to that spell **and**
  the current language, and never modify the bundled SRD data. An edited SRD spell is marked
  `*` on its source badge; **Reset to original** removes only that local note. These notes
  are included only in custom-spell exports (`1.1.0`) and are not part of deck exports
  (`1.0.0`).
- No accounts, cloud sync, backend, PDF engine, card backs, or third-party formats.
- Print geometry is verified in Chromium; Firefox/Safari and physical printers may differ
  and should be validated against the documented settings.

## Attribution and licensing

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by
Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is
licensed under the Creative Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/.

Bundled spells are SRD 5.2.1 only and labeled `SRD 5.2.1`; user-authored spells are labeled
`Custom`. No Wizards of the Coast logos or D&D trademarks are used.

## Documentation

- [Development guide](docs/DEVELOPMENT.md) — toolchain, architecture, SRD maintenance,
  localization, technical printing/offline details, and Cloudflare deployment.
- [Cloudflare deployment guide](docs/cloudflare-deployment-guide.md) — Workers setup,
  Workers Builds settings, and framework-specific notes.
- [SRD data pipeline](docs/srd-data-pipeline.md) — source format, normalization, migrations,
  and the translation workflow.
- [Custom spell import guide](docs/custom-spell-import-guide.md) — JSON format and import
  behavior.
- [Official subclass catalog](docs/subclasses.md) — the canonical 2024 subclass list.
- [Product specification](docs/specs/MAIN-spec.md).
- [Agent and contributor guidance](AGENTS.md).
