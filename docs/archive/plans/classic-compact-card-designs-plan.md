# Classic + Compact Card Designs — Implementation Plan

Revised: 2026-10-31T00:35Z. This revision resolves cache-key completeness, caret ambiguity,
protected-note fitting, measurement failure, note-ID uniqueness, and plan redundancy before
implementation.

## Goal

Keep the current card as **Classic** and add an additive, selectable **Compact** design. Compact
improves density and hierarchy without changing stored spell/deck data, Classic markup or print
output, Markdown safety, localization, source display, or pagination semantics. Classic stays the
default.

## Verified current state

- `src/cards/Card.tsx` is the only card layout, used by `DetailsPane`, `fit.tsx`, and
  `PrintSheet.tsx`. `CardViewProps.bodyRef` is attached to `.card-body-measured` in Classic
  (`Card.tsx:134`).
- `src/cards/fit.tsx` parses raw spell bodies and paginates those raw blocks with no presentation
  hook before fitting. `useMeasurer` returns `true` when `bodyRef.current` is missing
  (`fit.tsx:141-143`), so measurement silently succeeds today.
- `parseSpellBody` appends a localized Higher Levels heading plus parsed `higherLevels` blocks;
  `BlockList` maps blocks directly and cannot mark or wrap a higher-level section.
- `src/cards/fingerprint.ts` keys the **in-memory** `fitCache` with spell id, language, fit mode,
  `CARD_STYLE_VERSION`, and a fingerprint. `contentFingerprint` is exported but unused; current
  callers fingerprint only parsed blocks. There is no persisted fit cache.
- SRD data convention (verified across all 339 EN and 339 DE records): at most **one**
  caret-bearing metadata field and at most **one** non-empty caret paragraph per spell. Examples:
  `Reaction ^` / `^ which you take …` (Counterspell), `Until dispelled ^` /
  `^ or glyph triggered` (Glyph of Warding, Symbol). No bare `^` paragraphs exist.
- English *Dragon's Breath* has no `higherLevels`; German *Drachenodem* does. Both must be tested.
- `sourceLabelText` returns the actual label (`SRD 5.2.1`, plus `*` when overridden); the catalog
  has no source semantic ID, so Compact must keep that label instead of inventing `SRD`.
- The active-language `abbreviations` catalog has 121 entries (`minute.short` EN `MIN` / DE
  `min`, `hour.short` EN `HR` / DE `Std.`, components EN `V/S/M` / DE `V/G/M`). School and class
  IDs are the lowercase names (`transmutation`, `sorcerer`, …). `abbreviations.test.ts` enforces
  exact parity with `docs/abbreviations.md`; do not add, rename, or duplicate entries.
- `@media print` hides `.app-shell`, `.app-no-print`, and `.card-measure-layer`, but not Radix
  portals. `TooltipProvider` currently exists only inside `Slider`; there is no app-root provider.

## Authoritative data flow

```text
AppProvider.cardDesign (classic | compact, in-memory)
        |
        v
parseSpellBody(spell, heading, markers, { markSections: design === "compact" })
   Classic: raw blocks
   Compact: every higher-level block carries section: "higherLevels"
        |
        v
buildCompactPresentation(spell, blocks, t)          (Compact only, pure)
   display metadata, caret/qualifier notes, stable numbers,
   one atomic notes block, higher-level sections
        |
        v
computeFit(blocks, measure, fitMode, maxCards)
   protected notes block, overflowReason
        |
        v
FitResult.pages + overflowReason
        |
        +--> hidden measurer (same design + presentation)
        +--> DetailsPane preview (same design + presentation)
        +--> PrintDialog -> PrintSheets (same design + presentation)
```

Cache key composition (both designs):

```text
fitCacheKey = [spellId, language, fitMode, design, CARD_STYLE_VERSION,
               contentFingerprint(spell),
               blocksFingerprint(design === "compact" ? presentation.blocks : parsedBlocks)]
```

`contentFingerprint` must also include `overridden` so the footer `*` invalidates layout. Adding
`design` namespaces Classic and Compact keys; the cache is in-memory and empty on reload, so no
persisted entry is invalidated. Existing in-memory Classic keys become unreachable after the
change, which causes one remeasurement per card and no rendered difference. Do **not** bump
`CARD_STYLE_VERSION`: Classic CSS/markup are unchanged and design is already part of the key. If
shared fit/layout semantics later change, bump it then.

## Behavioral contracts

### 1. Design state and selection

- `src/cards/design.ts`: `CARD_DESIGNS = ["classic", "compact"]`, `CardDesign`,
  `DEFAULT_CARD_DESIGN = "classic"`, `normalizeCardDesign(value): CardDesign` (invalid/absent →
  `classic`), and label keys `card.design.classic` / `card.design.compact`.
- `AppProvider` adds `cardDesign` and `setCardDesign` as `useState(DEFAULT_CARD_DESIGN)`; the
  setter normalizes. Nothing is persisted: no Dexie, deck schema, export/import, service-worker,
  or localStorage change.
- `DeckPane` renders `#deck-design` after `#deck-controls` and before
  `#deck-entries-container`, with a localized `NativeSelect` containing exactly Classic and
  Compact, one localized Legend button, and a short “applies to preview and print” hint. The
  selector/legend live inside `.app-shell` and never print.
- `CardLegendDialog` uses the existing `Dialog`/`DialogContent`/`Button` and the abbreviations
  catalog. Group casting-time glyphs/units, properties (`C`, ritual `R`), components,
  range/duration icon meanings, schools, and classes. Fixed glyphs show catalog `.full`;
  footer/component entries show `.short` + `.full`. It is keyboard/touch accessible and relies on
  the shared print exclusion. Add one app-root `TooltipProvider` in `App.tsx`; keep the nested
  Slider provider.

### 2. Block metadata and higher-level sections

- Extend the parsed block model with optional `section?: "higherLevels"` on all blocks and
  `role?: "notes"` on `ListBlock` only. `cloneBlock` and `splitBlockToFit` already object-spread,
  so both fields survive cloning and pagination.
- `parseSpellBody` gains optional `{ markSections?: boolean }`. Only Compact passes `true`; then
  the higher-level heading and every block parsed from `higherLevels` get
  `section: "higherLevels"`. Classic sets neither field, so Classic block fingerprints and DOM
  are unchanged.
- `CompactBlockList` groups consecutive `section: "higherLevels"` blocks into a separated
  `.compact-higher` section with a `(+)` marker and accessible label
  (`spell.higherLevels`). A card that begins mid-section still renders the wrapper and marker;
  higher-level text is never downgraded to ordinary body text.
- Absent/empty `higherLevels` → no wrapper and no marker; the description is rendered as parsed,
  including any inline higher-level heading. If both `higherLevels` and similar description text
  exist, both source fields are preserved.

### 3. Casting time, duration, carets, and qualifiers

`parseCastingTime(raw)` returns a recognized base with an optional qualifier, or a lossless
fallback. `parseDuration(raw)` is lexical only and returns `{ value, caret }` where `value` is the
trimmed raw string (caret included) and `caret` says whether it ends with `^`.

**Casting-time grammar**

- Case-insensitive EN bases `Action`, `Bonus Action`, `Reaction`, optionally prefixed by `1`;
  DE bases `Aktion`, `Bonusaktion`, `Reaktion`, optionally prefixed by `1`. Match `Bonus Action` /
  `Bonusaktion` before `Action` / `Aktion`.
- EN quantities `1 minute`, `10 minutes`, `1 hour`, `8 hours`, …; DE quantities `1 Minute`,
  `10 Minuten`, `1 Stunde`, `8 Stunden`, ….
- Display fixed glyphs `A`, `B`, `R` for the three action bases. Quantities display
  `<number> <abbreviationShort("minute"|"hour", t)>` (`1 MIN`, `10 MIN`, `1 HR` EN; `1 min`,
  `10 min`, `1 Std.` DE).
- A qualifier is accepted only when the text after the base starts with a comma or semicolon
  (`Reaction, which you take …`). Its leading punctuation/whitespace is removed. Text after the
  base that starts with a word (for example `Action or Reaction`) is not guessed: the whole raw
  string is the lossless fallback.
- Strip a trailing caret for parsing only. A recognized base with a caret remains eligible for a
  caret note. If the caret cannot be matched, display the complete raw value (caret included).
- If a recognized casting-time value has both a non-empty inline qualifier and a trailing caret,
  use the lossless full-string fallback; do not choose between two qualifier sources.
- A parse failure never drops text: display the full trimmed raw value, no superscript, no note.

**Duration**

- Display the duration verbatim in the active language (`up to 1 minute`, `bis zu 1 Minute`).
  Strip the trailing caret for display only when a matching caret note is attached; otherwise
  keep the raw value including the caret.

**Caret matching and numbering**

- Collect description paragraphs (blocks without `section`) whose first non-whitespace inline
  text begins with `^` and has non-whitespace text after it. A bare `^` paragraph is not a note.
- A metadata field is caret-bearing only when its trimmed raw value ends with `^`.
- Attach a caret note **only when there is exactly one caret-bearing field and exactly one
  non-empty caret paragraph**. In that case the note belongs to that field, the paragraph is
  removed from the description, and the field's caret is stripped for display. Otherwise leave
  every caret paragraph in place and display every caret-bearing field raw; do not guess.
- Assign numbers with an incrementing counter over actual notes in metadata order (casting time,
  then duration), never fixed slots. A duration-only note is `¹`; a synthetic casting-time note
  plus a duration caret note is `¹`, `²`.
- A caret-bearing field with no matched paragraph is not eligible for a synthetic inline note.

**Inline qualifiers**

- Only a recognized casting-time qualifier can create a synthetic note. If the casting-time field
  already has a caret note, do not synthesize another.
- Normalize case and whitespace only. If the complete normalized qualifier already occurs in any
  non-note body text (description, higher levels, component descriptions), create no note and add
  no superscript; the body already carries the rule. This is exact-substring containment, not
  fuzzy deduplication.
- Otherwise create one synthetic note for the qualifier. Prefer the note over risking omission.

**Header display summary**

| Case | Header value | Superscript | Note |
| --- | --- | --- | --- |
| Recognized base, no qualifier/caret | base | no | no |
| Recognized base + qualifier already in body | base | no | no |
| Recognized base + qualifier absent | base | yes | synthetic |
| Recognized base + matched caret | base | yes | caret |
| Recognized base + unmatched caret | full raw, caret included | no | no |
| Unknown or multiple clauses | full raw | no | no |

### 4. `CompactPresentation`

```ts
interface CompactNote {
  number: number;
  owner: "castingTime" | "duration";
  label: string;            // t("spell.metadata.castingTime" | "duration")
  children: InlineNode[];   // qualifier text
}

interface CompactPresentation {
  displayCastingTime: string;   // base glyph/quantity or lossless raw fallback
  displayDuration: string;      // verbatim, caret stripped only when noted
  castingNoteNumber?: number;
  durationNoteNumber?: number;
  notes: readonly CompactNote[];
  blocks: BlockNode[];
}
```

`buildCompactPresentation(spell, blocks, t)` is pure: it never mutates the spell, its strings, or
the parsed arrays. `blocks` begins with at most one atomic `ListBlock` carrying
`role: "notes"`; its `items` are the note qualifiers in `notes` order. Remaining blocks are the
description with matched caret paragraphs removed, the marked higher-level section, then
component-description paragraphs.

Rendering notes:

- `CompactCardView` derives a per-instance prefix with `useId()` (sanitize `:` to `-`) and passes
  it to `CompactBlockList`. `compactNoteId(prefix, n)` names **only the note item**; the header
  marker has no id and uses `aria-describedby={compactNoteId(prefix, n)}` plus an accessible
  label such as `t("card.noteReference", { number: n })`. Do not put the same id on both marker
  and note item.
- `CompactBlockList` renders the notes block as an accessible notes section
  (`aria-label={t("card.notes")}`), one `<li id={compactNoteId(prefix, n)}>` per note containing
  the superscript number, the localized owner label, and the qualifier. List markers are removed
  in CSS; text wraps.
- Display superscripts as `¹`, `²`, … via a small helper; accessible labels use plain numbers.
  Ids are presentation-only and never persisted. Per-instance `useId` keeps preview, hidden
  measurement, and print cards unique in the same DOM, including print.

### 5. Fitting, pagination, and overflow

- `splitBlockToFit` returns `null` for a `role: "notes"` block, so it is never split.
- `appendEllipsis` must never be applied to the notes block.
- Auto-shrink: try `AUTO_SHRINK_STEPS` as today. If none fits:
  1. If a notes block exists and `measure([notes], AUTO_SHRINK_MIN_PT, false)` is false, return
     `pages: [[notes]]`, `fontPt: 6`, `truncated: false`, `overflow: true`,
     `overflowReason: "notes"`.
  2. Otherwise truncate only the non-note remainder with the measured ellipsis, keeping the notes
     prefix intact. If no body text fits, return the notes block plus a separate `…` paragraph;
     never append the ellipsis to the note text. If even notes + `…` cannot fit while notes alone
     do, return the notes-only page with `truncated: true`, `overflow: true`, and
     `overflowReason: "notes"`; print stays blocked rather than dropping the note or emitting an
     unmarked ellipsis-only card.
- Multi-card: paginate as today. If `result.overflow` and a notes block exists and
  `measure([notes], fontPt, false)` is false, set `overflowReason: "notes"`; otherwise set
  `"continuation-limit"`. The atomic first block keeps notes on page 1 only; when it fits,
  pagination continues normally.
- `FitResult` gains `overflowReason?: "continuation-limit" | "notes"`. `overflow` still blocks
  printing. `DetailsPane` and `PrintDialog` use the reason to show the notes-specific warning;
  existing truncation, multi-card splitting, heading-orphan avoidance, continuation cap, and
  no-silent-loss behavior are unchanged.
- Derive the protected prefix from leading `role: "notes"` blocks; do not add a redundant
  `protectedPrefixLength` field or option.

### 6. Measurement, preview, and print

- `useCardFit` returns `{ result, presentation, ready, error, measureLayer }`;
  `useDeckCardFits` returns per-entry `{ fit, presentation }` plus `ready` and `error`.
- Both hooks build the presentation once per spell/language/design before fitting, pass
  `presentation.blocks` to `computeFit`, and use `design` + `contentFingerprint(spell)` +
  presentation-block fingerprint in the cache key/dependencies. `useDeckCardFits` includes
  `design` and each item's content fingerprint in its effect signature so edits and design
  changes rerun fitting.
- The hidden measurer receives the same `design` and `presentation` as preview/print. Its
  `measure` contract stays `(blocks, fontPt, continuation) => boolean`; design and presentation
  are captured in the closure used by `computeFit`.
- Fail closed **and distinguishably**: when `bodyRef.current` is missing after the synchronous
  layout flush, `measure` throws a descriptive `Error`. `useCardFit` already catches and sets
  `error`; `useDeckCardFits` gains a `try/catch` that logs, sets `error`, and finishes with
  `ready: true`. `PrintDialog` blocks printing and shows a fit-error message. This prevents a
  missing/misplaced ref from being mistaken for ordinary content overflow.
- `.compact-card-measured` is the single measured region (header, metadata, material, notes, body,
  footer). To make overflow detection deterministic, its direct children are `flex: 0 0 auto`
  and the footer uses `margin-top: auto`; `.compact-body` does not clip its own content. The
  wrapper is `display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;
  overflow: hidden`, so its `scrollHeight` includes overflowing body content.
- `DetailsPane` reads `cardDesign`, passes it to `useCardFit`, and passes `design` plus the
  returned `presentation` to preview `CardView`. `PrintDialog` reads `cardDesign`, passes it to
  `useDeckCardFits`, copies each `presentation` into `PrintCardData`, and passes `design` to
  `PrintSheets`. `PrintSheets` passes both to every `CardView`.
- Compact continuation cards keep header, title, level, school, continuation label, body, and
  footer; they omit metadata, material, notes, and tooltips. Pagination is a small separate line
  above the footer using the existing `card.pageNumber` label (`X/N`), not a fourth footer
  section.
- Tooltips are screen-only and non-layout-affecting; measurement and print never depend on them.

### 7. Compact rendering

- `CompactCardViewProps = Omit<CardViewProps, "design" | "presentation"> & {
  presentation: CompactPresentation }`. It does not accept `design`.
- Root: `spell-card spell-card-compact`; measured wrapper `.compact-card-measured` with
  `ref={bodyRef}` containing header, first-card metadata, material, body, footer.
- Header: wrapping title row; a single-outline circle containing only the numeric level with a
  localized accessible label; ritual `R` visually separated in the title row; continuation label
  where applicable.
- First-card metadata: casting glyph/quantity plus superscript from
  `presentation.castingNoteNumber`; `Target` icon plus the actual range value; `Hourglass` icon
  plus `presentation.displayDuration` and superscript from `presentation.durationNoteNumber`.
  No visible Range/Duration/Casting Time labels. Values wrap, never clip. Each superscript has an
  accessible note reference (`aria-describedby` + label) and the notes item uses
  `compactNoteId`.
- Components: adjacent CSS square boxes only for true `verbal`/`somatic`/`material` booleans,
  using localized catalog shorts (`V/S/M`, `V/G/M`). A non-empty `componentsDisplayOverride`
  replaces the boxes with the full text. `C` renders independently and immediately to the right
  whenever concentration is true, including with an override. Material detail
  (`materialDetailText`, including cost/consumed) is italic, wrapping, and never ellipsized.
- Body: `CompactBlockList` with the per-instance note prefix. Notes section first, description,
  `(+)` higher-level section, then component-description paragraphs.
- Footer: exactly three sections Source | School | Classes with `|` separators. Source uses
  `sourceLabelText` (actual `SRD 5.2.1` plus `*`); never invent a source abbreviation. School
  uses catalog `.short` or the full localized label. Classes use catalog `.short` per core class
  or the full name for homebrew, joined with ` · `. Empty classes render `—` with a localized
  accessible label. Accessible labels/tooltips expose `.full`.
- Reuse the existing overflow badge. Wrap Compact abbreviation/icon triggers in the existing
  `Tooltip` with contextual full labels and keyboard-focusable triggers. Do not add a per-card
  `TooltipProvider`; the app root owns one.
- `Card.tsx`: keep the existing implementation as `ClassicCardView`; add optional `design` and
  `presentation` to `CardViewProps`; export `CardView` as a thin dispatcher. `compact` requires
  `presentation` and renders `CompactCardView`; otherwise render the unchanged Classic branch.
  Compact without a presentation fails fast with a descriptive error. Classic markup, labels,
  metadata table, material line, and footer are untouched.

### 8. Classic invariance and print exclusion

- Classic renders through the existing code path with the same markup, labels, truncation,
  pagination, visual layout, and print output. The only shared changes are the measurement
  fail-closed/error path and richer cache-key inputs, which do not alter rendered output. Do not
  restyle existing `.spell-card`/Classic selectors.
- In `src/print/print.css`, add only `.spell-card-compact…` rules: physical units, print-safe
  sizes/line heights, wrapping (`min-width: 0`, `overflow-wrap`), no ellipsis on materials, notes,
  or metadata, connected component boxes, level circle, metadata row, notes, `(+)` section,
  pagination line, and three-part footer. Use centralized `--compact-accent` values per
  `[data-school="…"]` with a neutral fallback; accent is decorative only. Keep the 2.5 × 3.5 in
  card size and print grid untouched.
- Add `app-no-print` to `TooltipContent`, `DialogOverlay`, and `DialogContent`. Add defensive
  print selectors for `[data-radix-popper-content-wrapper]` and `[role="dialog"]`. Rule notes are
  in card DOM and remain printed.

## Implementation steps

1. **Design model/state.** Add `design.ts`; extend `AppProvider` context/memo with
   `cardDesign`/`setCardDesign`; update test mocks that enumerate `useApp()` fields.
2. **Block metadata.** Add optional `section`/`role`; add `markSections` to `parseSpellBody`;
   verify `cloneBlock`, splitting, and pagination preserve both.
3. **Abbreviations and compact model.** Add `src/locales/abbreviations.ts` with semantic-ID maps
   for schools, core classes, and `verbalComponent`/`somaticComponent`/`materialComponent`, plus
   `abbreviationShort|Full`, `schoolAbbreviation`, `classAbbreviation` (unknown/homebrew → `null`
   so callers keep the original label). Add `src/cards/compact.ts` with the fixed glyphs,
   `parseCastingTime`, `parseDuration`, and `buildCompactPresentation` per §3–§4. Never reverse
   lookup by short text or read `docs/abbreviations.md` at runtime.
4. **Compact renderer.** Add `CompactCard.tsx` and `CompactBlockList` per §7; convert `Card.tsx`
   to `ClassicCardView` + dispatcher; export the compact presentation type.
5. **CSS.** Add the Compact-only rules and portal print exclusions per §8.
6. **Fit/measurement/print propagation.** Extend `fingerprint.ts` (`design` + content fingerprint
   + `overridden`); extend `fit.tsx` (`design`, `presentation`, `overflowReason`, notes protection,
   fail-closed measurement, `useDeckCardFits` error handling); update `DetailsPane`,
   `PrintDialog`, and `PrintSheet` per §5–§6.
7. **Selector and legend.** Add `#deck-design`, `src/components/deck/CardLegendDialog.tsx`, and
   one app-root `TooltipProvider` in `App.tsx`; keep the nested Slider provider behavior.
8. **Localization.** Add mirrored EN/DE keys: `card.design.label|classic|compact|hint|legend|
   legendTitle|legendDescription`, legend group headings, `card.notes`,
   `card.noteReference`, `details.notesOverflow`, `print.notesOverflow`, and `print.fitError`.
   Keep all localization presentation-only.
9. **Tests** per the matrix below.
10. **Documentation** per the list below.

## Test matrix

- `src/cards/compact.test.ts`: EN/DE parsing, quantities and localized unit shorts (`1 MIN`,
  `10 MIN`, `1 HR`, `1 min`, `10 min`, `1 Std.`), caret stripping/fallback, comma/semicolon
  qualifier, `Action or Reaction` lossless fallback, inline-qualifier + caret ambiguity fallback,
  duration verbatim; counter-based numbering;
  duration-only `¹`, synthetic casting + duration `¹`/`²`; conservative 1-field/1-paragraph
  matching and ambiguous-count fallback; matched caret paragraph removed once and prepended as one
  atomic notes block; unmatched caret paragraphs left; no source mutation; qualifier dedupe vs.
  synthetic note; EN *Dragon's Breath* no section vs. DE *Drachenodem* marked section.
- `src/cards/CompactCard.test.tsx` (or extend `Card.i18n.test.tsx`): Dragon's Breath EN (`2`,
  `B`, Target + `Touch`, Hourglass + `up to 1 minute`, connected `V/S/M`, adjacent `C`, italic
  `a hot pepper`, footer `SRD 5.2.1 | TRN | SOR · WIZ`) and DE (`B`, `V/G/M`, footer
  `SRD 5.2.1 | VWD | ZAU · MAG`, `(+)` section); higher-level section present/absent and
  continuation cards; Glyph of Warding/Symbol note marker + visible note + unique id linkage on
  the first card only; materials/costs/consumed, no material, override + `C`, long title/values,
  homebrew fallback, empty classes `—`, ritual + reaction; continuation omits
  metadata/material/notes; `bodyRef` placement and wrapper contents.
- `src/cards/fit.test.ts` / fingerprint test: distinct classic/compact cache keys;
  `CARD_STYLE_VERSION` unchanged; notes never split or truncated; body truncates while notes
  remain; notes-only too tall → `overflow: true`, `overflowReason: "notes"`, print blocked;
  multi-card notes on page 1 only; `section` survives splitting/pagination; missing `bodyRef`
  throws rather than reporting fit.
- `src/print/PrintSheet.test.tsx`: compact print uses `.spell-card-compact`, prints notes, omits
  tooltip/dialog content, and omits metadata/notes on continuation cards.
- `src/components/deck/DeckPane.test.tsx`: selector between `#deck-controls` and
  `#deck-entries-container`, exactly Classic/Compact, Classic selected by default, calls
  `setCardDesign`, legend opens.
- `src/components/details/DetailsPane.test.tsx`: mock includes `cardDesign` and presentation;
  preview follows the selected design; notes overflow uses the notes warning.
- `src/locales/locales.test.ts`: German key parity and new labels; existing
  `abbreviations.test.ts` passes unchanged.
- E2E `e2e/card-designs.spec.ts`: switch to Compact, preview class change, print output in
  Compact, return to Classic, default Classic after reload; long-title/long-material with
  short-body; Glyph/Symbol continuation; DOM/portal assertions under print emulation plus a manual
  100% print check. Keep existing print, i18n, and continuation specs passing.

## Documentation

- `docs/specs/MAIN-spec.md` §9–§10: Classic/Compact coexistence, selector placement, Classic
  default/fallback, in-memory selection, design-aware measurement/cache/print, Compact information
  architecture, fixed badge glyphs vs. catalog shorts, pre-fit presentation/notes lifecycle,
  atomic notes, higher-level sections, footer including empty classes, and print-excluded
  tooltips/legend/portals.
- `docs/DEVELOPMENT.md`: module map (`design.ts`, `compact.ts`, `CompactCard.tsx`,
  `CompactBlockList`), AppProvider state, presentation flow, cache key, protected-prefix fitting,
  measurement/print propagation, and tests.
- `README.md`: brief user-facing description of the selector, Classic default, Compact features,
  and legend; keep printing settings unchanged.
- `docs/abbreviations.md`: add a short note that Compact fixed badges use catalog `.full` meanings
  while footer/component abbreviations use catalog `.short`; keep it outside the
  `^- full = short (full = short)$` parity line pattern and do not change the 121 entries.
- `docs/specs/spell-card-designs.md`: align the previously ambiguous acceptance notes (German
  Dragon's Breath, note numbering, units, empty classes, inline-qualifier dedupe) without
  duplicating the MAIN-spec; preserve the §10 deferred backlog.

## Acceptance criteria

- Classic stays the default with unchanged markup, labels, truncation, pagination, visual layout,
  and print output.
- The localized selector sits between deck controls and deck entries, and neither it nor the
  legend prints.
- Compact meets the Dragon's Breath criteria, three-part footer, connected components, `C`,
  conditional `(+)`, and casting-time/duration notes.
- The presentation is built before fitting; notes are numbered once, rendered on the first card,
  protected from truncation, and never orphaned on continuations.
- The measured region includes header, metadata, material, notes, body, and footer; a missing ref
  errors; long header/material with short body cannot clip silently.
- Design and presentation propagate consistently to preview, measurement, print, and pagination;
  cache keys include design and all layout-relevant content.
- Abbreviations come from semantic catalog IDs; no tooltip/dialog/legend UI prints while rule
  notes do.
- Existing Classic, abbreviation parity, print, i18n, and continuation tests pass; docs are
  updated.

## Validation

1. `vp install` if dependencies are stale.
2. `vp check`
3. `vp test`
4. `pnpm run build` (SRD normalization output must remain unchanged).
5. `pnpm run preview`, then `pnpm run test:e2e` against the Workers-runtime preview, including
   the new design spec and existing print/i18n/continuation specs.
6. Manual 100% print check: one Classic and one Compact 3 × 3 sheet; no overlap/cropping; notes
   printed; tooltips/legend absent; include a long-title/short-body card and a Glyph/Symbol
   multi-card print.

## Risks and edge cases

- **Caret data:** SRD carets live inside `description` and follow the verified 1-field/1-paragraph
  convention; custom spells may not. The conservative matcher must leave ambiguous input
  untouched rather than misassociate a note.
- **Note atomicity:** the notes block is a single protected block; splitting or ellipsizing it
  would reintroduce the original defect.
- **Section pagination:** `section` must survive cloning, splitting, and pagination; a continuation
  page must still render the `(+)` wrapper.
- **Source:** no catalog short ID exists; keep `sourceLabelText` rather than inventing one.
- **Homebrew/unmapped classes:** keep full names; never conflate `classes` with `subclasses`.
- **Measurement equivalence:** preview, hidden measurement, and print must use identical design,
  presentation text, structure, fonts, and styles; tooltips must not affect layout.
- **Print portals:** hide Radix tooltip/dialog portals in print; rule notes are card DOM and must
  print.
- Do not edit generated SRD datasets or hand-modify raw source data for this feature.

## Out of scope

All items in the feature spec’s §10 deferred backlog stay deferred: inline semantic glyphs,
structured AoE metadata, decorative frames/spines, custom icon libraries, inactive-class strips,
automated higher-level extraction, dice/damage highlighting, printable legend sheets, and advanced
layout themes.
