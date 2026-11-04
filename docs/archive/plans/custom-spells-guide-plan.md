# Hamburger Menu + In-App Custom Spells Guide

## Goal

Replace the header **About** button with a hamburger dropdown containing **About App** and **Custom Spells Guide**. Open the existing About dialog from the menu, and add a new Markdown-rendered, localized guide dialog for custom spells.

## Key decisions

- Reuse `src/ui/DropdownMenu.tsx` (already wraps `@radix-ui/react-dropdown-menu`); add no dependencies.
- Use the `Menu` icon from `lucide-react` in a ghost icon `Button`.
- Convert `AboutDialog` to a controlled dialog (`open`/`onOpenChange`) and remove its trigger. Preserve its content and attribution exactly.
- Add two localized guide files: `docs/custom-spells-guide.md` and `docs/custom-spells-guide.de.md`. Select with `toUiLocale(i18n.resolvedLanguage ?? "en")`.
- Import Markdown with Vite `?raw`; content is bundled into JS, so it works offline and in production without a runtime fetch.
- Extend the existing safe Markdown pipeline with opt-in link support. Default behavior (spell descriptions) must continue rendering links as plain text.
- Keep the parser change minimal: add an optional option parameter with a default, leave existing public call sites and `parseSpellBody` unchanged, and add a regression test proving spell descriptions still render links as text.
- Keep `docs/custom-spell-import-guide.md` as the developer field reference; the new guides are concise end-user guides.
- Validate both localized guide examples against the real importer and downstream compact-card parsing, not just `JSON.parse`.
- UI chrome is localized through `en.ts` / `de.ts`; guide body text stays in the separate Markdown files.

## Files

### New

- `src/components/HeaderMenu.tsx` — hamburger trigger, Radix menu, dialog state.
- `src/components/CustomSpellsGuideDialog.tsx` — raw Markdown loading, parsing, rendering, copy buttons.
- `docs/custom-spells-guide.md`
- `docs/custom-spells-guide.de.md`
- `src/components/HeaderMenu.test.tsx` (or `CustomSpellsGuideDialog.test.tsx`) — menu/dialog/locale/copy behavior.
- `src/io/guide-examples.test.ts` — extracts the fenced JSON example from both Markdown guides, validates it with `analyzeCustomImport`, and checks downstream compact-card parsing.

### Modified

- `src/components/Header.tsx` — render `<HeaderMenu />` instead of `<AboutDialog />`.
- `src/components/AboutDialog.tsx` — controlled props only.
- `src/markdown/parse.ts` — opt-in `link` inline node and safe href allowlist.
- `src/markdown/render.tsx` — render link nodes; add optional `renderCode` hook for custom code-block rendering.
- `src/markdown/parse.test.tsx` — keep the existing default-links-as-text assertion and add anchor-mode/unsafe-URL coverage.
- `src/locales/en.ts`, `src/locales/de.ts` — add `menu.*` and `guide.*`; remove now-unused `about.trigger` / `about.triggerAria`.
- `e2e/language.spec.ts` — open About and the guide through the hamburger menu; update the old trigger selector.

## Implementation tasks

### 1. Markdown link + code-block support

Keep this change as small as possible. Do not alter `parseSpellBody`, `componentDescriptionBlocks`, or any existing caller's behavior.

In `src/markdown/parse.ts`:

- Add `LinkInline = { type: "link"; href: string; value: string }` to `InlineNode`.
- Add `ParseMarkdownOptions = { links?: "text" | "anchor" }`, default `"text"`.
- Add `options` as an optional second parameter to `parseInline` and `parseMarkdown`; thread it only through the internal helpers (`parseBlocks`, `parseList`, `parseTable`). Existing calls without the option must behave exactly as today.
- For `link` tokens:
  - In default mode, keep current behavior: emit the link text only.
  - In `"anchor"` mode, emit a `link` node only when `href` passes a strict allowlist: `http:`, `https:`, or `mailto:` (trim first; reject `javascript:`, `data:`, `vbscript:`, relative paths, and other schemes).
  - Unsafe links fall back to text.
- Preserve raw-HTML dropping and image-as-alt-text behavior.

In `src/markdown/render.tsx`:

- Render `link` nodes as `<a href={href} target="_blank" rel="noopener noreferrer">` with `text-primary underline underline-offset-2 hover:text-primary/80`.
- Add an optional `renderCode?: (value: string, key: string) => ReactNode` prop to `Block` and `BlockList`; pass it through blockquote/list recursion.
- Keep the default `<pre className="card-pre">` behavior when no renderer is supplied.

### 2. About dialog refactor

- Change `AboutDialog` to accept `open` and `onOpenChange`; remove `DialogTrigger`, `Info`, and `Button` usage.
- Keep the title, description, SRD attribution paragraph (`lang="en"`), and local-data paragraph unchanged.
- Remove obsolete `about.trigger` / `about.triggerAria` locale keys.

### 3. Header menu

Create `HeaderMenu`:

- `Menu` icon, `Button variant="ghost" size="icon"`, `aria-label={t("menu.triggerAria")}`, `aria-hidden` icon.
- `DropdownMenuTrigger asChild`, `DropdownMenuContent align="end" className="min-w-48"`.
- Items, each with a lucide icon (`Info`, `BookOpen`) and `onSelect` that sets the corresponding dialog open state:
  - `t("menu.aboutApp")` → `AboutDialog`
  - `t("menu.customSpellsGuide")` → `CustomSpellsGuideDialog`
- Radix closes the menu on selection; rely on that and verify with a test.
- Render both dialogs outside the menu in the same component.
- Replace `<AboutDialog />` with `<HeaderMenu />` in `Header.tsx`.

### 4. Guide dialog

Create `CustomSpellsGuideDialog`:

- `import enGuide from "../../docs/custom-spells-guide.md?raw"` and the `.de.md` equivalent.
- Select by `toUiLocale(i18n.resolvedLanguage ?? "en")`; memoize `parseMarkdown(guide, { links: "anchor" })`.
- Use the existing `Dialog` / `DialogContent`:
  - `title={t("guide.title")}`
  - `description={t("guide.description")}`
  - `className="app-no-print flex max-h-[85vh] w-[min(94vw,56rem)] flex-col overflow-hidden"`
  - `bodyClassName="min-h-0 overflow-y-auto pr-1"`
- Wrap rendered content in `<div lang={locale} className="spell-details-content">` so Markdown typography (headings, lists, tables, blockquotes, pre) reuses existing screen styles from `print.css`.
- Render with `BlockList` and the new `renderCode` hook.
- `GuideCodeBlock`:
  - `pre` with `card-pre`, horizontal scrolling, and `style={{ whiteSpace: "pre" }}` so JSON lines do not reflow.
  - Copy button (`Copy`/`Check` icons) using `navigator.clipboard?.writeText(value)`.
  - Localized `aria-label` from `t("guide.copyCode")`; visible `aria-live="polite"` status for `t("guide.copied")` / `t("guide.copyFailed")`.
  - Handle missing/failed clipboard access gracefully; do not throw.
- External links open in a new tab with `noopener noreferrer`.

### 5. Locale keys

Add to both `en.ts` and `de.ts` (keep key shapes identical):

```ts
menu: {
  triggerAria: "Open menu",
  aboutApp: "About App",
  customSpellsGuide: "Custom Spells Guide",
},
guide: {
  title: "Custom Spells Guide",
  description: "Create, import, export, and generate custom spells.",
  copyCode: "Copy code",
  copied: "Copied",
  copyFailed: "Copy failed. Select the text and copy it manually.",
},
```

German equivalents:

- `triggerAria`: `Menü öffnen`
- `aboutApp`: `Über die App`
- `customSpellsGuide`: `Leitfaden für eigene Zauber`
- guide title/description/copy labels translated idiomatically.
- `guide.description`: mention creating, importing, exporting, and AI generation.

### 6. Guide content

Both guides must be structurally identical and equally complete. Sections:

1. Intro: what custom spells are; stored locally; not SRD; back up with exports.
2. Create a custom spell in the app:
   - Library → **Create custom spell**.
   - Form covers name, level, school, casting time, range, duration, concentration, ritual, components/material, classes, description, higher levels.
   - Save stores it locally and shows the **Custom** badge; edit from the details pane.
   - The form does not expose `subclasses`, `savingThrow`, `damageTypes`, `sourceLabel`, or `componentsDisplayOverride`; use JSON import for those.
   - In-app casting time/range/duration are limited to 120 characters; import/schema allows up to 500.
3. Import:
   - Library → **Custom spell import/export** → **Import custom spells…**.
   - JSON file, max 5 MiB; wait for library/SRD validation to finish.
   - Review validation; collisions: **Skip**, **Keep both**, **Overwrite existing**; commit.
   - Import is atomic; invalid records reject the whole file; import never changes the active deck.
4. Export:
   - Same dialog → **Export custom spells**.
   - Exports custom spell definitions and SRD component-text overrides; not a deck backup.
   - Recommend exporting regularly; deck export is separate.
5. JSON format:
   - Envelope object: required `type: "custom-spells"`, required `spells` array, optional `srdSpellOverrides` (normal exports include `[]`).
   - Unknown top-level keys are rejected; unknown keys inside a spell are silently discarded.
   - No `locale`/`language` field. Custom spells are language-agnostic records; use distinct IDs for language variants.
   - Required fields table: `id`, `name`, `level`, `school`, `castingTime`, `range`, `components`, `duration`, `concentration`, `ritual`, `classes`, `description`, `source`.
   - Optional fields table: `subclasses`, `savingThrow`, `damageTypes`, `higherLevels`, `sourceLabel`, `updatedAt`.
   - Allowed values: 8 school names, 12 core class names, 6 ability scores, 13 lowercase damage slugs.
   - Component fields: three required booleans; optional `verbalDescription`, `somaticDescription`, `materialDescription`, `materialCost`, `materialConsumed`, `componentsDisplayOverride` (max 500 each).
   - `description` must be a non-empty array; each entry max 20,000 chars; combined with `higherLevels` max 50,000. Entries render as Markdown paragraphs; raw HTML is dropped and links inside spell descriptions are plain text.
   - `id`: non-empty, max 120, unique in the file, must not start with `srd-`; UUID recommended.
   - `source` must be `"Custom"`.
   - `overridden` is app-managed and not part of the import format.
   - Include a `>` caution block and a troubleshooting table for common errors.
6. Complete example (valid JSON, fenced `json`):
   - One spell demonstrating every supported property, including all optional fields.
   - English file values: name `The Funniest Joke in the World`; id `funniest-joke-of-the-world-en`; level `3`; school `Enchantment`; casting time `1 Action`; range `60 feet`; duration `Up to 1 minute`; `concentration: true`; `ritual: true`; classes `["Bard", "Sorcerer", "Warlock"]`; subclasses `["Bard: College of Lore", "Sorcerer: Draconic Sorcery"]`; saving throw `WIS`; damage types `["psychic"]`; source `Custom`; source label `Custom (Playtest)`; `updatedAt: 1767225600000`; all three component flags true with all component descriptions/cost/consumed/override set; two description entries and one higher-levels entry describing lethal laughter and scaling damage.
   - German file uses the same structure with localized human-readable values: name `Der tödlichste Witz der Welt`, id `funniest-joke-of-the-world-de`, `1 Aktion`, `18 Meter`, `Bis zu 1 Minute`, German descriptions/higher-levels, German component text, source label `Eigen (Playtest)`.
   - Keep keys, `school`, `classes`, `subclasses`, `savingThrow`, `damageTypes`, `source`, and other machine-readable values canonical/unchanged.
   - Include `srdSpellOverrides: []` in the example envelope.
7. Generate with an AI assistant:
   - Explain copying the example as the template.
   - Provide a reusable fenced `text` prompt: return only valid JSON; preserve the envelope; use `source: "Custom"`; unique id not starting `srd-`; exact enum values; arrays for `description`/`higherLevels`; no extra top-level keys; no comments/trailing commas; replace all human-readable values.
   - Explain the workflow: generate → save as `.json` → import → review → commit.
   - Warn that the app validates structure, not game balance or rules correctness; review the result.
8. Limitations:
   - Local browser storage only; no accounts/cloud sync.
   - No automatic translation/variant linking.
   - Import does not add spells to a deck.
   - SRD records/overrides are separate from custom spells.
   - 5 MiB import limit.

Links: use only absolute external links, because relative repository links do not resolve inside the packaged app. Use the user-provided Monty Python links in the appropriate language and optionally the SRD link (`https://www.dndbeyond.com/srd`).

### 7. Tests and validation

Unit tests:

- `HeaderMenu`: open menu, verify both items, About opens the existing dialog, menu closes, guide opens; repeat guide in German and assert the German heading.
- Guide dialog: known English/German headings, a table, a blockquote, a link (`href` present), and a JSON code block; mock `navigator.clipboard.writeText`, click copy, assert the copied text contains `"type": "custom-spells"`.
- Markdown parser: default mode still renders links as text (existing test); `{ links: "anchor" }` renders an anchor; `javascript:`/relative links remain text. Add a regression test that `parseSpellBody` still renders description links as plain text.
- Guide example validation in `src/io/guide-examples.test.ts`:
  - Read `docs/custom-spells-guide.md` and `docs/custom-spells-guide.de.md` with `readFileSync`/`resolve` (same pattern as `abbreviations.test.ts`).
  - Extract each fenced `json` block and assert exactly one is the custom-spells envelope.
  - `JSON.parse` it, then call `analyzeCustomImport(json, [])`; assert `analysis.ok === true`, exactly one entry, and no collision/remap.
  - Assert the parsed record contains every supported property, including all optional ones: `subclasses`, `savingThrow`, `damageTypes`, `higherLevels`, `sourceLabel`, `updatedAt`, and every optional component field (`verbalDescription`, `somaticDescription`, `materialDescription`, `materialCost`, `materialConsumed`, `componentsDisplayOverride`). Assert `srdSpellOverrides` is present as an empty array.
  - Downstream compatibility: `parseCastingTime(record.castingTime)` must return a base `action` for both `"1 Action"` and `"1 Aktion"`; `parseDuration(record.duration)` must retain the localized value without caret handling; `buildCompactPresentation` must produce the fixed `A` casting badge and the localized duration (e.g. `"Bis zu 1 Minute"`) without falling back to raw text.
  - Assert the localized human-readable values are preserved (`"18 Meter"`, `"1 Aktion"`, German name/descriptions/source label) while canonical enum values remain English (`school`, `classes`, `subclasses`, `savingThrow`, `damageTypes`, `source`).
  - Run with the matching i18n language (`en`/`de`) and reset to `en` afterward.
- Locale shape test already enforces `en`/`de` key parity.

E2E:

- Update `e2e/language.spec.ts`:
  - Replace the old About trigger assertion with the hamburger `Menü öffnen`.
  - Open **Über die App** through the menu and keep the existing About content assertion.
  - Open **Leitfaden für eigene Zauber**, assert the dialog title, a German heading, and a visible JSON code block/copy button.
- Optionally add an English guide assertion to an existing E2E spec.

Commands:

```powershell
pnpm run check
pnpm run test
pnpm run build
pnpm exec wrangler deploy --dry-run
pnpm run test:e2e
```

`pnpm run build` is required before E2E because the preview serves the production build. Verify the guide appears in the built app, not only dev mode.

## Risks / notes

- `?raw` imports are supported by Vite/Vitest through `vite/client`; no new type declaration should be needed.
- Do not change default Markdown link behavior for spell descriptions; the opt-in parser flag is what protects the existing card behavior and test.
- Localized human-readable values are safe for the importer: `castingTime`/`range`/`duration` are free-text strings, and `parseCastingTime` already recognizes German `Aktion`/`Bonusaktion`/`Reaktion`. Do not localize enum fields (`school`, `classes`, `savingThrow`, `damageTypes`, `source`) or structural identifiers (`subclasses`).
- Keep `docs/custom-spell-import-guide.md` unchanged.
- Do not edit generated SRD datasets or `dist/`.
- Avoid adding README/AGENTS links unless a documentation-ownership update is explicitly requested.
