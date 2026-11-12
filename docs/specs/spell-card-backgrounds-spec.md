# Spell card backgrounds

**Status:** Implemented

**Scope:** Developer reference for the selectable card-background feature: user-visible behavior,
invariants, build-time discovery, module responsibilities, rendering and print flow, offline
behavior, tests, the image-preparation script, and how to extend the feature.

The normative user-facing contract is in
[MAIN-spec.md](MAIN-spec.md#9-card-layout-and-text-fitting). User help is in the
[README](../../README.md), and the surrounding implementation notes are in
[DEVELOPMENT.md](../DEVELOPMENT.md).

## 1. Behavior summary

- A **Card background** selector in the Active Deck pane offers **None** (the default) and every
  JPEG discovered in `src/assets/images/card-backgrounds/`.
- The option value and label are the image file name, including its extension (for example
  `spell-card-bg-1.jpg`). Long names are truncated at 36 characters with `…`; the full name remains
  in the option `title`.
- The selection applies identically to the Details preview and the 9-up print output for both the
  Classic and Compact card designs.
- Selection is **session-only**: it is in-memory `AppProvider` state, is not persisted, and resets
  to `none` on reload.
- The feature is offline-capable: discovered JPGs are precached under their fingerprinted asset
  URLs.
- The selector and its hint are never printed.
- The print dialog tells users to enable **Background graphics**, because browsers omit background
  images by default.

## 2. Invariants and non-goals

1. **Default `none`.** `none` is reserved and always first. Absent, unknown, or invalid values
   normalize to `none`, preserving the original paper-colored card.
2. **Both designs.** Classic and Compact share the same `.spell-card` article and the same
   background mechanism.
3. **No fitting impact.** Backgrounds are decorative and do not participate in text fitting,
   pagination, fingerprinting, or fit-cache keys. The hidden measurement card stays untextured.
4. **No persistence.** There are no Dexie, schema, migration, import/export, broadcast, or
   saved-deck changes. A future per-deck setting would require schema and import/export work.
5. **No user-supplied images.** Only images bundled into the build are supported; the browser
   cannot load files from the local filesystem.
6. **No layout wrappers.** The image belongs on `.spell-card`; putting it on `PreviewFrame`,
   `.screen-preview-slot`, or `.screen-preview-transform` would be hidden by the opaque card or
   would not print.
7. **Build-time discovery only.** This is a static Vite/Cloudflare Workers build. The deployed app
   has no filesystem access and cannot scan `src/assets/` at runtime. Adding or removing an image
   requires a rebuild and redeploy. In development, Vite's glob watcher reloads the app when files
   are added or removed; if a reload does not occur, restarting `vp dev` is the fallback.
8. **JPEG runtime format.** The glob matches `jpg`/`jpeg` only. Other formats must be converted to a
   sibling `.jpg` with the prepare script; the original is ignored.

## 3. Discovery and identity

`src/cards/backgrounds.ts` discovers images with an eager Vite glob:

```ts
const BACKGROUND_MODULES = import.meta.glob("../assets/images/card-backgrounds/*.{jpg,jpeg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
```

- The list is computed once at module load. No registry, import list, or code edit is needed for a
  new image.
- Keys are relative to the importing module; the file name is derived from the last path segment.
- The glob result is sorted case-insensitively by file name for stable option order across
  filesystems.
- `CARD_BACKGROUND_NONE = "none"` is reserved even if a file is named `none.jpg`. The file would be
  unreachable because normalization prefers the reserved value.
- Unit tests run through the Vite pipeline, so the glob resolves to URL strings there just as JPG
  imports do. Assert on `/.jpg/` rather than a fingerprinted asset name.

## 4. Assets and identity mapping

| Concept    | Value                                                                |
| ---------- | -------------------------------------------------------------------- |
| Directory  | `src/assets/images/card-backgrounds/`                                |
| Runtime    | `*.jpg`, `*.jpeg`                                                    |
| Option ID  | Full file name with extension, for example `spell-card-bg-1.jpg`     |
| Display    | `cardBackgroundLabel(id)`: the file name, truncated at 36 characters |
| Full name  | Option `title` attribute                                             |
| Order      | Case-insensitive by file name, after the reserved `none` option      |

All bundled images are close to the card's 5:7 aspect ratio; `background-size: cover` crops at most
a small part of the height. Renaming a file changes its option value and resets a current session
selection to `none` on reload.

## 5. Module map

| Location                                  | Responsibility                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/cards/backgrounds.ts`                | Glob discovery, `CARD_BACKGROUNDS` option objects, reserved `none`, label truncation, URL/style helpers, normalization, and `loadCardBackground`.                                                |
| `src/state/AppProvider.tsx`               | Exposes in-memory `cardBackground` and the normalizing `setCardBackground`; no persistence.                                                                                                      |
| `src/cards/Card.tsx`                      | Defines `CardViewProps.background`, applies the attribute and custom property in Classic, and passes the prop through the Compact dispatch.                                                       |
| `src/cards/CompactCard.tsx`               | Applies the same attribute and custom property to Compact cards.                                                                                                                                 |
| `src/print/print.css`                     | Paints the texture on `.spell-card[data-card-background]` and enables exact color adjustment for print.                                                                                          |
| `src/components/deck/DeckPane.tsx`        | Renders the labeled selector and hint inside `#deck-design`; options come from `CARD_BACKGROUNDS`.                                                                                               |
| `src/components/details/DetailsPane.tsx`  | Passes the current selection to the preview `CardView`.                                                                                                                                          |
| `src/print/PrintSheet.tsx`                | Accepts an optional `background` and forwards it to every printed `CardView`.                                                                                                                    |
| `src/components/print/PrintDialog.tsx`    | Captures the selection in the print job, preloads the texture, and renders `PrintSheets` with the captured value.                                                                                 |
| `src/locales/en.ts`, `src/locales/de.ts`  | `card.background.label`, `card.background.hint`, `card.background.none`, and `print.backgroundGraphics`.                                                                                          |
| `scripts/prepare-card-backgrounds.ts`     | Developer-only normalization of source images to JPEG. Not run by the app, dev server, or build.                                                                                                 |
| `vite.config.ts`                          | Includes `jpg` in the Workbox precache glob and keeps `src/data` as `publicDir`.                                                                                                                 |

## 6. API and data flow

`src/cards/backgrounds.ts` exports:

```ts
export const CARD_BACKGROUND_NONE = "none";
export type CardBackground = string;
export interface CardBackgroundOption {
  id: string;
  label: string;
  url: string;
}
export const CARD_BACKGROUNDS: readonly CardBackgroundOption[];
export const DEFAULT_CARD_BACKGROUND: CardBackground;

export function cardBackgroundLabel(id: string, maxLength = 36): string;
export function cardBackgroundUrl(background?: string | null): string | null;
export function cardBackgroundStyle(background?: string | null): CSSProperties;
export function normalizeCardBackground(value: unknown): CardBackground;
export function loadCardBackground(background?: string | null): Promise<void>;
```

- `CARD_BACKGROUNDS` contains only discovered images; it never contains `none`.
- `cardBackgroundLabel` returns the file name unchanged when it fits; otherwise it returns a
  36-character label ending in `…`.
- `cardBackgroundUrl` returns `null` for `none`, missing, or unknown values; otherwise the imported
  JPG URL.
- `cardBackgroundStyle` returns `{}` when no URL resolves and
  `{ "--card-background-image": 'url("…")' }` for a texture.
- `normalizeCardBackground` accepts `none` and every discovered ID, and falls back to `none` for
  everything else, including null and non-strings.
- `loadCardBackground` resolves after the texture is decoded, or after load/error where `decode()`
  is unavailable. It also resolves on failure, so a missing image never blocks printing. It is a
  no-op for `none` or when `Image` is unavailable (for example in jsdom).

The state flow is:

```text
DeckPane select (option value = file name)
  -> AppProvider.cardBackground (normalized against discovered IDs)
     -> DetailsPane preview CardView
     -> PrintDialog.startPrint captures job.background
        -> loadCardBackground(job.background) + waitForCardFonts()
        -> PrintSheets background={job.background}
        -> printed CardView
```

## 7. Rendering

Both card views accept `background?: CardBackground`, default to `DEFAULT_CARD_BACKGROUND`, and
render the same shape:

```tsx
<article
  className="spell-card …"
  data-card-background={background === "none" ? undefined : background}
  style={{
    ["--body-font-pt" as string]: `${fontPt}pt`,
    ...cardBackgroundStyle(background),
  }}
>
```

Notes:

- `data-card-background` is absent for `none`, which keeps the default card DOM unchanged. For a
  texture it carries the full file name, which may contain dots; CSS uses the attribute only as an
  existence selector.
- `--card-background-image` carries the resolved Vite asset URL.
- `CardView`'s Compact dispatch removes only `design` and `presentation` before spreading the
  remaining props, so `background` flows through without a dispatcher change.
- The hidden measurement card in `src/cards/fit.tsx` is rendered without `background` on purpose.

## 8. CSS

`src/print/print.css` keeps the opaque base card color and adds a higher-specificity longhand rule
immediately after the `.spell-card` block:

```css
.spell-card {
  background: #fffdf8;
  …;
}

.spell-card[data-card-background] {
  background-image: var(--card-background-image);
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}
```

The attribute selector overrides only `background-image`; `#fffdf8` remains the fallback color.
Keep the base `background` shorthand before this rule so it cannot reset the image.

The card already has `border-radius: 0.06in` and `overflow: hidden`, so the texture is clipped by
the rounded border. Compact's inset `::before` rule is unaffected.

The existing print color-adjust block is extended for textured cards:

```css
@media print {
  .spell-card-compact,
  .spell-card[data-card-background] {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
```

This makes Chromium print the texture when the browser's **Background graphics** option is enabled.

## 9. Deck UI

The selector is the `NativeSelect` with `id="deck-background-select"` inside `#deck-design`. The
former card-design hint paragraph is removed.

- The visible label is `t("card.background.label")` ("Card background" / "Kartenhintergrund"),
  associated with the select through `htmlFor`, so `getByLabel("Card background")` works.
- The first option is `None` with value `none`.
- The remaining options come from `CARD_BACKGROUNDS`: `value={option.id}`, `title={option.id}`, and
  the truncated `cardBackgroundLabel(option.id)` as visible text.
- `onChange` passes the selected value to `setCardBackground`, which normalizes it.
- The hint below the selector uses `t("card.background.hint")`.
- The control is keyboard-operable and inherits Compact mode's **Deck settings** disclosure and
  Split/Wide visibility. It must stay inside `#deck-design`; moving it out breaks the sibling-order
  test and Compact disclosure behavior.

## 10. Preview, print, and fitting

- **Preview:** `DetailsPane` passes `background={cardBackground}` to the preview `CardView`. It does
  not pass the background to `useCardFit`.
- **Print sheet:** `PrintSheetsProps.background` defaults to `none` and is passed to every card.
- **Print job:** `PrintDialog` stores `background` in the immutable `job` object when printing
  starts. The print effect depends only on `[job]`, so changing the selector after the print portal
  mounts cannot trigger another `window.print()`.
- **Preload:** the print effect awaits
  `Promise.all([waitForCardFonts(), loadCardBackground(job.background)])` before
  `window.print()`, preventing a capture race with the texture.
- **Fit exclusion:** backgrounds are never passed to `useCardFit` or `useDeckCardFits`, never enter
  `src/cards/fingerprint.ts`, and never change cache keys. Switching backgrounds must not change
  card count, font size, or pagination.

## 11. Localization

Only the UI chrome is localized; image names are language-neutral file names.

```ts
card: {
  background: {
    label: string;
    hint: string;
    none: string;
  };
}
```

English and German also define `print.backgroundGraphics`, which is rendered as a list item before
`print.hardware` in the print dialog's settings list.

`src/locales/de.ts` uses `satisfies Translations`; edit `src/locales/en.ts` first, then update
German or type checking will report missing translations.

## 12. Offline and PWA

- `vite.config.ts` Workbox `globPatterns` includes `jpg`, so every discovered JPG is precached under
  Vite's fingerprinted `/assets/*.jpg` URLs. The per-file limit is 8 MiB.
- No `src/pwa/register.ts` change is required; Workbox precache installation remains atomic.
- Precache size follows the folder contents. Keep individual images at or below 1 MiB with the
  prepare script.
- `e2e/offline.spec.ts` does not hardcode file names or count. It reads all non-`none` option
  values, selects each texture, extracts the preview card's computed `background-image` URL as a
  same-origin pathname, and asserts one distinct `/assets/*.jpg` path per option.
- The same test asserts all paths are present in Cache Storage, reloads offline, and decodes each
  path with `new Image()` before the existing offline language-switch check.

## 13. Adding, renaming, or removing an image

1. Put a JPEG in `src/assets/images/card-backgrounds/`. Prefer a 5:7 aspect ratio, a longest edge of
   at most 1600 px, and at most 1 MiB. For PNG/WebP/AVIF sources, run
   `pnpm run backgrounds:prepare` to create a sibling `.jpg`.
2. Refresh or let `vp dev` reload. The option appears without a code change. The file name is the
   option value and label.
3. To remove an image, delete the file; the option disappears on the next dev reload or rebuild.
4. Run the verification commands below. No CSS, print, state, fit, localization, or PWA changes are
   needed.

A deployed build needs `pnpm run build` and a redeploy. A browser refresh cannot discover unbundled
files in production, so no refresh control is provided.

## 14. Prepare script

`scripts/prepare-card-backgrounds.ts` is exposed as `pnpm run backgrounds:prepare`. It is a
developer tool and is not run automatically on app start, during development, or in the build.

- Input directory defaults to `src/assets/images/card-backgrounds/`; override with `--input-dir`.
- Accepts `.jpg`, `.jpeg`, `.png`, `.webp`, and `.avif` (case-insensitive), files only.
- Default mode applies changes. `--dry-run` reports planned actions without writing.
- A file is skipped only when it is already a JPEG, its aspect ratio is within 2% of 5:7, its
  longest edge is at most 1600 px, and its size is at most 1 MiB.
- Otherwise Sharp applies `rotate()` (EXIF), flattens transparency onto `#fffdf8`, resizes with
  `fit: "cover"`, `position: "centre"`, `withoutEnlargement: true` to 900 × 1260, converts to sRGB,
  and encodes progressive mozjpeg at quality 82. It retries at 76 and 70 if the buffer exceeds
  1 MiB, and warns if the result is still larger.
- Output is `<stem>.jpg`. Non-JPEG sources are left in place and ignored by the app glob.
- Failures are reported per file; the process exits non-zero when any file fails.

`pnpm run build` does not invoke the script. Run it manually after adding source images.

## 15. Tests

| Test                                            | Coverage                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/cards/backgrounds.test.ts`                 | Discovery and sorting, reserved `none`, normalization, distinct non-empty JPG URLs, style helper, label truncation.   |
| `src/cards/Card.background.test.tsx`            | A discovered ID sets `data-card-background` and `--card-background-image`; the default leaves both unset.             |
| `src/components/deck/DeckPane.test.tsx`         | Option order derived from the registry and `setCardBackground(<discovered id>)` on selection.                          |
| `src/components/details/DetailsPane.test.tsx`   | The preview card receives the discovered `data-card-background` value.                                                |
| `src/print/PrintSheet.test.tsx`                 | Printed cards receive the discovered `data-card-background` value.                                                    |
| `e2e/card-designs.spec.ts`                      | Default None; selecting the first discovered image marks the preview and resolves a `.jpg`; reload resets.             |
| `e2e/print.spec.ts`                             | Default None prints untextured; a discovered image marks the printed card and resolves the same URL as the preview.    |
| `e2e/offline.spec.ts`                           | Every discovered texture is precached, distinct, and decodable after an offline reload.                               |
| `e2e/workspace.spec.ts`                         | `#deck-background-select` is hidden with collapsed Compact Deck settings and visible when expanded.                    |

E2E specs read the first non-`none` option value instead of hardcoding a file name. Unit tests
assert the attribute and `/\.jpg/` rather than a fingerprinted filename.

## 16. Verification

Run, in order:

```powershell
pnpm run check
pnpm run test
pnpm run backgrounds:prepare --dry-run
pnpm run build
pnpm exec playwright test e2e/card-designs.spec.ts e2e/print.spec.ts e2e/offline.spec.ts e2e/workspace.spec.ts
```

`pnpm run build` is required before E2E because Playwright runs against the Workers-runtime
preview. The build must show the discovered JPGs and a precache count that includes them.

Manual checks after changing the feature:

1. In `vp dev`, add a `.jpg` to the folder; confirm the app reloads and the option appears. Remove
   it; confirm it disappears. If the watcher misses the change, restart `vp dev`.
2. Select a discovered image in Classic and Compact; confirm preview and print match.
3. Confirm switching backgrounds causes no fit, font-size, or pagination change.
4. Run the prepare script on a temporary PNG or oversized image; confirm a normalized `.jpg`
   appears and the source is ignored.
5. Save a PDF with **Background graphics** enabled.

## 17. Guardrails

- Keep the texture on `.spell-card`; never move it to `PreviewFrame`, `.screen-preview-slot`, or
  `.screen-preview-transform`.
- Never pass a background into `useCardFit`/`useDeckCardFits`, the hidden measurement card,
  fingerprints, or cache keys.
- Do not add persistence, Dexie migrations, saved-deck fields, import/export fields, a runtime
  folder scan, or a server API for this feature.
- Do not invent a runtime refresh button; a static build cannot discover new files after deploy.
- Do not move the JPGs to `src/data` (`publicDir`); they belong in bundled `src/assets`.
- Keep the runtime glob restricted to `jpg`/`jpeg`; route other formats through the prepare script.
- Do not edit `dist/`, `.wrangler/`, `wrangler.jsonc`, `src/data/`, or `docs/archive/`.
- Keep the base `background: #fffdf8` shorthand before the `.spell-card[data-card-background]`
  longhand rule.

## 18. Open release tasks

1. **Licensing/attribution (required before release).** Establish the source and license of the
   bundled JPGs. If they are third-party, add the required notice or link (for example alongside the
   bundled font licenses). If they are original or AI-generated, record that explicitly. This change
   does not resolve it.
2. **Optional size reduction.** Run `pnpm run backgrounds:prepare` on images above the 1 MiB
   target. Do not upscale; the current resolution is sufficient for print.
3. **Physical print check.** Verify one printed sheet with **Background graphics** enabled.
   Chromium is the only verified browser for this project.
