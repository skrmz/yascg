# Development

Technical and maintenance documentation for YASCG. For product behavior and acceptance
criteria, see the [product specification](specs/MAIN-spec.md). For user help, backup guidance,
and printing settings, see the [README](../README.md).

## Documentation map

| Document | Owns |
| --- | --- |
| [README](../README.md) | Product overview, quick start, user help, printing settings, backup guidance, attribution |
| [Product specification](specs/MAIN-spec.md) | Current behavioral contract and verification matrix |
| **This guide** | Contributor setup, commands, module map, implementation details, debugging, tests |
| [SRD data pipeline](srd-data-pipeline.md) | Raw source shape, normalization, translations, generated artifacts, migrations, subclass reconciliation, drift protection |
| [Cloudflare deployment guide](cloudflare-deployment-guide.md) | Workers Static Assets configuration, Workers Builds, deployment operations, `compatibility_date` |
| [Custom spell import guide](custom-spell-import-guide.md) | Custom-spell JSON format, examples, collisions, SRD override import/export |
| [Official subclass catalog](subclasses.md) | Canonical official 2024 subclass list |
| [AGENTS.md](../AGENTS.md) | Agent/contributor workflow, tests to run, review checklist, documentation ownership |

## Toolchain and commands

Requires **Node.js 24.11+ (24 LTS) or 26 LTS** and **pnpm v12+** with the unified **Vite+
(`vp`)** toolchain (Vite, Rolldown, Vitest, Oxlint, Oxfmt). The repository is currently
developed on Node.js 26 LTS. `vp <name>` runs a built-in command, while `vp run <name>` runs a
`package.json` script or a `vite.config.ts` task; scripts cannot overwrite built-ins. Check
`package.json` and `vite.config.ts` before adding or invoking a command.

| Command | Purpose |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `pnpm install` (or `vp install`) | Install dependencies. |
| `pnpm run normalize:srd` | Normalize `data/srd/` into the committed `src/data/` artifacts. |
| `pnpm run dev` (`vp dev`) | Start the development server in the local Workers runtime. |
| `pnpm run check` (`vp check`) | Format, lint, and type-check. |
| `pnpm run test` (`vp test`) | Run unit and integration tests. |
| `pnpm run build` | Run `normalize:srd`, then `vp build`. |
| `pnpm run preview` (`vp preview`) | Preview the production build in the local Workers runtime. |
| `pnpm run deploy` | Build, then `wrangler deploy` to Cloudflare Workers. |
| `pnpm exec wrangler deploy --dry-run` | Validate the Wrangler configuration and build output without uploading. |
| `pnpm exec playwright install chromium` | Install the Chromium browser for E2E tests. |
| `pnpm run test:e2e` | Run the Playwright end-to-end tests. |

Run `vp check` and `vp test` after relevant changes. Changing data processing or application
behavior also requires normalization and the affected E2E tests. The complete review checklist
is maintained in [AGENTS.md](../AGENTS.md).

Generated datasets under `src/data/` are committed build artifacts. Vite serves `src/data/` as
its `publicDir`; do not hand-edit generated SRD datasets or bypass normalization validation.

## Architecture

Paths are relative to the repository root.

- `src/domain/` — Zod schemas, types, limits, deck/baseline/status rules, ID rules, subclass
  registry, and import/export payload schemas (`payloads.ts`).
- `src/db/` — Dexie schema v4 (`customSpells`, `savedDecks`, singleton `activeDeck`,
  `srdSpellOverrides`) with compare-and-swap revisions, saved-snapshot revision tokens,
  deck-entry normalization, and advisory `BroadcastChannel` notifications.
- `src/services/data/` — manifest/dataset loading, language preference, search and filters, and
  deck reference resolution.
- `src/markdown/` — safe `marked` token walker (raw HTML dropped, links as text), React
  renderer, and deterministic AST splitting/pagination.
- `src/cards/` — card chrome plus hidden-card measurement, `document.fonts` gating, single-card
  auto-shrink (8.5pt → 6pt) with a measured trailing ellipsis at the floor, and multi-card
  pagination with heading-orphan prevention.
- `src/components/details/` — card-preview-first details pane, on-demand spell details dialog,
  and card actions menus backed by the edit flow.
- `src/print/` — strict physical print CSS and 3x3 sheet rendering.
- `src/io/` — unversioned JSON export/import with collision review and atomic commits.
- `src/pwa/` — service-worker registration and Cache Storage verification.
- `src/i18n.ts`, `src/locales/` — typed `react-i18next` configuration and EN/DE catalogs.
- `src/state/`, `src/components/`, `src/ui/` — application state and UI.

## Cloudflare Vite plugin integration

Deployment configuration and Workers Builds settings are owned by the
[Cloudflare deployment guide](cloudflare-deployment-guide.md). Keep these repository-specific
integration constraints in mind:

- `vite.config.ts` registers `cloudflare()` after the React and Tailwind plugins. The plugin is
  intentionally omitted in Vitest's `test` mode because Vitest cannot attach a server to the
  extra Vite environments the plugin creates.
- `vp dev` and `vp preview` run through the Cloudflare plugin in the local `workerd` runtime, so
  routing, headers, and asset serving match production. `pnpm run test:e2e` uses this preview.
- `vp build` writes the client build plus the generated `dist/wrangler.json` and
  `.wrangler/deploy/config.json`; never edit `dist/` or `.wrangler/`.
- `wrangler.jsonc` remains the input configuration; do not set `assets.directory`, because the
  plugin fills it from the build output.
- No server API, backend runtime, or secrets may be introduced.

## Deck persistence and migration

Product semantics for statuses, Save/Save As/Open, dirty state, import, Clear entries, repair,
and language switching are owned by [MAIN-spec §7](specs/MAIN-spec.md#7-active-and-saved-decks).
This section maps those contracts to the implementation.

- `getDeckStatus` (`src/domain/deck.ts`) derives the four-state status from association and dirty
  state; inconsistent persisted combinations are errors rather than statuses.
- The active deck is a Dexie singleton whose `revision` is the active CAS token. An associated
  deck stores `savedDeckId` and a non-null `baseline`; an unassociated deck omits the
  `savedDeckId` property entirely and stores `baseline: null`. Do not serialize
  `savedDeckId: undefined`. Each saved snapshot has its own `revision` (starting at `1`); the
  active baseline records the observed `savedRevision`. `updatedAt` is display-only.
- `mutateActiveDeck` (`src/db/active-deck.ts`) performs active-only edits with an expected
  revision. `saveNewDeck`, `saveAssociatedDeck`, `loadSavedDeck`, `deleteSavedDeck`,
  `newActiveDeck`, and `renameActiveDeck` (`src/db/saved-decks.ts`) implement the lifecycle
  operations. Associated Save and Delete verify both the expected active revision and
  `baseline.savedRevision` inside the same transaction. Missing or stale snapshots raise
  `SavedDeckConflictError`; the deck pane routes that to Save As/Open recovery.
- `DeckPane` owns the inline name edit session (tied to the active revision) and flushes pending
  edits before Save/Save As/Open/New deck/import/Clear. Inline rename staleness returns a
  non-destructive stale outcome and must not open the global cross-tab conflict dialog.
- `SaveAsDialog` and `OpenDeckDialog` perform their own validation/confirmation through provider
  actions; the deck actions menu holds Save As, New deck, deck import/export, and Clear entries.
  A saved-snapshot Save conflict offers Save As or Open.
- `src/db/database.ts` defines `version(4)`. It normalizes saved-deck revisions below `1` to
  `1`, and sets `baseline.savedRevision` only when the stored baseline name and ordered
  deduplicated entries exactly match the associated saved snapshot. Unverifiable associations
  keep the token absent (no fabricated token, association preserved, no active revision bump);
  Save then blocks until the user opens the snapshot or uses Save As.
- Cross-tab notifications (`src/db/notifications.ts`) are advisory. Revision checks inside
  transactions are authoritative; a conflict keeps the user's uncommitted intent available and
  routes to the Reload Latest/Cancel or Save As/Open recovery described in the specification.

## Import and export routing

The authoritative format semantics are in
[MAIN-spec §8](specs/MAIN-spec.md#8-json-import-and-export); the user-facing custom format is
in the [custom spell import guide](custom-spell-import-guide.md). Implementation structure:

- `src/domain/payloads.ts` — strict wire schemas, payload types, and `deckEntryToExport`.
- `src/io/export.ts` — payload builders and JSON download helper.
- `src/io/import-deck.ts`, `src/io/import-custom.ts` — full-payload validation, collision
  analysis, ID remapping, override validation, and atomic commit paths.
- `src/components/import-export/DeckImportExportDialog.tsx` — deck import/export dialog.
- `src/components/import-export/CustomSpellImportExportDialog.tsx` — custom-spell dialog,
  triggered from `LibraryPane` next to **Create custom spell**.
- Both dialogs share presentation helpers in `components/import-export/shared.tsx` but keep
  separate analysis, validation, and commit paths.
- Custom spells persist in the Dexie `customSpells` table; SRD component-text overrides persist
  per `[spellId+locale]` in `srdSpellOverrides` (added by the additive `version(2)` migration).
  The override merge happens at read time over the loaded dataset and never mutates the shared
  dataset cache or `src/data/**`.

## Localization

The interface is localized with `react-i18next` in English and German. The locale follows the
selected spell-data language; `toUiLocale` maps `de` to German and every other code to English,
so manifest languages without a UI catalog keep their spell data and use the English UI.
Product-level switching and confirmation behavior is owned by
[MAIN-spec §5](specs/MAIN-spec.md#5-workspace-and-library) and
[§7](specs/MAIN-spec.md#7-active-and-saved-decks).

- Catalogs are TypeScript modules under `src/locales/` (`en.ts`, `de.ts`) so no
  `resolveJsonModule` is needed. `de` is checked for key parity via `satisfies Translations`; use
  complete sentences, interpolation, and `_one`/`_other` plural keys rather than concatenating
  translated fragments.
- School/class names, component letters, damage-type names, and subclass labels are localized at
  presentation time via `src/locales/labels.ts`; unknown values fall back to the raw stored
  value or English name. Bundled and generated SRD datasets (`src/data/**`) are never modified,
  and canonical mechanics, filter values, paper identifiers, and persisted data stay unchanged.
- Runtime notices and errors are stored as typed descriptors from `src/locales/messages.ts` and
  translated only at render time. Unexpected exception text is logged to the console and
  replaced with a generic localized message. Import validation may expose deliberately selected
  field paths and constraints within localized framing, but never raw exception text.
- The initial locale is seeded synchronously from the stored preference
  (`spellCards.language`) before first paint. Initial data loading, unsupported preferences,
  retry, and interactive switches keep the last committed language until a new dataset is ready.
  `document.documentElement.lang` follows the resolved UI locale (`applyDocumentLanguage` in
  `src/i18n.ts`).
- Bundled, unmodified SRD content carries its actual dataset language via
  `resolveContentLanguage`; custom spells, imported content, and SRD overrides can mix author
  languages and therefore omit a content `lang`. Card fitting re-measures on locale change, so
  switching languages never leaves stale measurements.

Intentional exclusions: the YASCG product name, exact SRD legal attribution (rendered with
`lang="en"`), manifest language endonyms, dataset-authored spell names and content, user-entered
or persisted names/content, export filenames and identifiers, paper product names (US Letter /
ISO A4), and technical diagnostics that are logged but not shown.

## Cards, printing, and offline

Product geometry, typography, pagination, print omission, and offline guarantees are owned by
the [product specification](specs/MAIN-spec.md#9-card-layout-and-text-fitting); user print
settings are in the [README](../README.md#printing). Implementation details:

- `src/cards/fit.tsx` measures actual rendered heights in a hidden fixed-size card, caches by
  content/language/fit mode, and implements auto-shrink and multi-card pagination. Measurement
  runs only on content/style changes, never on every scroll event.
- `src/cards/fonts.ts` explicitly requests and checks every card face/weight before measurement
  and `window.print()`; `src/print/print.css` self-hosts the card families as WOFF2 assets.
- `src/print/PrintSheet.tsx` builds the 3x3 sheets and `src/print/print.css` owns the physical
  `@page`, grid, and card CSS.
- `src/pwa/register.ts` verifies that the shell, manifest, every bundled dataset, and at least
  one local font are present in Cache Storage before the UI claims offline readiness. It uses a
  `prompt` update flow and never infers readiness from service-worker registration alone.
- Application data lives in the Dexie tables declared in `src/db/database.ts`; the language
  preference lives in `localStorage` under `spellCards.language`.
- To debug offline behavior, build and preview through the Workers runtime, then inspect Cache
  Storage, the service worker, and IndexedDB in DevTools. A new build publishes new hashed
  assets and prompts before reloading.

## SRD data integration

The [SRD data pipeline](srd-data-pipeline.md) is authoritative for raw source shape,
normalization, translations, generated artifacts, migrations, subclass reconciliation, and
drift protection. Day-to-day integration points:

- Run `pnpm run normalize:srd` after changing `data/srd/`; `pnpm run build` runs it first.
- Generated outputs are `src/data/spells.srd.json`, `src/data/spells.srd.<lang>.json`, and
  `src/data/spell-languages.json`. They are committed but must never be edited by hand.
- `src/test/srd-dataset.test.ts` normalizes the checked-in sources and compares them with the
  committed datasets read from the Git object store, so a local build cannot mask drift.
- Code entry points are `scripts/normalize-srd.ts`, `scripts/srd/`, and the runtime loaders in
  `src/services/data/load.ts`. Do not add language-specific adapters or weaken the raw schema;
  unsupported source structures fail the build with a filename and index.

## Local verification

```powershell
pnpm install
pnpm run check
pnpm run test
pnpm run normalize:srd
pnpm run build
pnpm exec wrangler deploy --dry-run
pnpm run preview
pnpm exec playwright install chromium
pnpm run test:e2e
```

- Unit/integration tests run under Vitest with `jsdom` and `fake-indexeddb`; the Cloudflare
  plugin is excluded in `test` mode.
- E2E tests run with Playwright against `pnpm run preview`, which serves the Workers-runtime
  build.
- Print checks should use the print preview and a 100%-scale PDF test sheet. Chromium is the
  verified browser to date; Firefox and Safari are validation targets, not yet verified.
- When adding a language or changing generated data, clear the service-worker cache or hard
  refresh after rebuilding so the preview does not serve stale assets.

## Limitations

User-facing limitations (SRD-only content, local SRD notes, no accounts/sync/PDF/card backs,
and print variability) are documented in the [README](../README.md#limitations). Product scope
exclusions are in [MAIN-spec §1](specs/MAIN-spec.md#1-purpose-and-scope).
