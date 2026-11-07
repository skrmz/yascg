# Mobile LibraryPane List-First Redesign

## Goal

On viewports below the existing desktop breakpoint, make the Library pane a list-first screen:

- Search and a compact filter trigger occupy one top row.
- Filters live in a mobile bottom sheet with removable active-filter chips.
- Secondary and destructive actions live in a labeled actions menu.
- The spell list receives most of the viewport and is the only vertical scroll container in the pane.
- Desktop three-pane behavior and all existing data/search semantics remain unchanged.

## Decisions

1. **Keep the current 1200 px breakpoint.** `AppShell.tsx` switches layouts at `min-[1200px]`; the spec currently says 1024 px. Do not change tablet/desktop behavior in this iteration. Update the spec to describe the actual 1200 px breakpoint; revisiting 1024 px is a separate responsive decision.
2. **Use the existing Radix primitives.** The bottom sheet is a `DialogContent` visual variant; actions use the existing `DropdownMenu`; filter fields keep `MultiSelect`, `Select`, and `Slider`.
3. **Mount one filter UI at a time.** Use a `useIsDesktop()` media-query hook so desktop and mobile do not render duplicate controls with duplicate accessible names. The `LibraryPane` and the results `<ul>` must remain the same mounted instances across viewport changes.
4. **Do not change Details navigation.** Keep the current Library/Details/Deck tabs and the existing auto-switch when `selectedSpellId` changes. Details-as-contextual-view is analyzed below and deferred.
5. **Do not change add-to-deck navigation.** Tapping `+` still selects the spell and therefore switches to Details on mobile. Suppressing that behavior is a separate navigation decision; note it as a follow-up rather than hiding it inside this layout change.
6. **Preserve existing reset semantics.** `resetAll` clears the search query and every filter. Keep that behavior and label it consistently; do not silently redefine “Reset filters”.
7. **No new dependencies.** Use the existing Radix dialog/dropdown/popover components and Lucide icons.

## Current behavior and evidence

- `src/components/AppShell.tsx:58-88` uses a fixed-height shell and a 1200 px three-pane breakpoint.
- `src/components/AppShell.tsx:90-103` renders the tab strip on narrow screens.
- `src/components/AppShell.tsx:48-53` switches to Details whenever `selectedSpellId` changes.
- `src/components/AppShell.tsx:104-135` uses `forceMount` for all three panes, so pane state is retained while tabs change. Preserve this.
- `src/components/library/LibraryPane.tsx:180-398` keeps the entire desktop filter stack visible on mobile.
- `src/components/library/LibraryPane.tsx:402-445` adds the result toolbar plus two full-width custom-spell buttons.
- `src/components/library/LibraryPane.tsx:447-505` is the only part of the pane allowed to grow; it therefore receives very little height on mobile.
- `src/components/Header.tsx:7-16` lets the long application title wrap the header to two rows at 390 px.
- `src/ui/Field.tsx:17` uses `text-sm` (14 px) for inputs, which triggers zoom on focus in iOS Safari.
- `src/ui/Button.tsx:19-23` uses 28 px `sm` and 32 px `icon` sizes, below recommended primary mobile touch targets.
- `src/ui/Dialog.tsx:39-44` centers all dialogs and caps them at `85vh`; it needs a sheet variant for bottom placement and keyboard-safe height.
- `src/test/setup.ts:14-28` stubs `matchMedia` with `matches: false`.

## Implementation tasks

### 1. Make the shell keyboard- and safe-area-aware

Files: `index.html`, `src/components/AppShell.tsx`, `src/index.css`, `src/print/print.css`

- Update the viewport meta to:
  `width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content`.
- Replace `h-screen` on the app shell with a dynamic viewport height, for example an inline
  `height: calc(100dvh - var(--app-keyboard-inset, 0px))`, plus `overflow-hidden`.
- Add a small `visualViewport` effect in `AppShell` that sets `--app-keyboard-inset` on
  `document.documentElement` when `window.innerHeight - visualViewport.height` is greater than a
  keyboard threshold (about 80 px), and removes it when the keyboard closes. Guard for missing
  `visualViewport`.
- Add `height: 100%` and `overflow: hidden` to `html`, `body`, and `#root` in `index.css` so the
  page itself never scrolls. Add an `@media print` override restoring `height: auto` and
  `overflow: visible`; otherwise the print root can be clipped.
- Add safe-area padding:
  - Header top inset.
  - Bottom of the results list.
  - Bottom of the filter-sheet content/footer.
- Do not use `viewport-fit=cover` without the corresponding padding.

### 2. Compact the mobile header

File: `src/components/Header.tsx`

- Keep one row on narrow screens. Render a short visible brand (`YASCG`) below the desktop
  breakpoint and the full title at `min-[1200px]`.
- Give the `h1` an explicit accessible label with the full application name so the mobile visual
  abbreviation does not change the accessible name.
- Use `min-w-0`, `truncate`, and `shrink-0` so the title truncates instead of forcing a second row.
- Reduce mobile horizontal/vertical padding and restore the current desktop padding with
  `min-[1200px]` variants.
- Keep the language picker, offline status, and header menu reachable and unchanged.

### 3. Add the responsive breakpoint hook

Files: `src/components/library/use-is-desktop.ts` (new), `src/test/setup.ts`

- Add a small hook using `window.matchMedia("(min-width: 1200px)")` with a change listener and
  cleanup.
- Use the hook only for structural choices: which filter UI to mount, whether the mobile actions
  menu exists, and whether the mobile sheet trigger exists.
- Use responsive CSS (`max-[1199px]:...`) for purely visual density changes so rows do not
  re-render on resize.
- Update the test `matchMedia` stub so unit tests default to desktop (`min-width: 1200px` matches)
  and add an override helper for mobile tests.

### 4. Extract reusable filter controls and the active-filter model

Files: `src/components/library/LibraryFilters.tsx` (new),
`src/components/library/filter-summary.ts` (new),
`src/components/library/filter-summary.test.ts` (new),
`src/components/library/LibraryPane.tsx`

- Extract the level slider, class filter, advanced fields, source chips, and reset control from
  `LibraryPane` into `LibraryFilters`.
- Support two variants:
  - `inline`: current desktop layout; advanced fields remain inside the existing `Collapsible`
    with its active-count badge.
  - `sheet`: all fields visible inside the bottom sheet; no nested collapsible required, because
    the sheet body is the scroll container.
- Pass the existing derived options (`castingOptions`, `rangeOptions`, `durationOptions`,
  `subclassOptions`) into the component. Do not move data derivation out of `LibraryPane`.
- Add `buildActiveFilterChips(filters, labels)` returning one descriptor per active, non-default
  group: level range, class, subclass, school, casting time, range, duration, components,
  concentration, ritual, source. `labels` supplies the translated group/value formatter; keep the
  helper pure and unit-testable.
- Each descriptor contains a stable key, a concise label, and the partial filter patch that
  clears only that group. Level uses the existing range label; multi-value groups use the first
  label plus `+N` when necessary.
- Return an empty list for `DEFAULT_FILTERS`. Never emit chips for the default level range, empty
  arrays, or `null` booleans.
- Do not add a search-query chip; the search field already exposes the query.
- Unit-test default suppression, each group, multi-value summary labels, and selective clearing.

### 5. Build the mobile top area and bottom sheet

File: `src/components/library/LibraryPane.tsx`, `src/ui/Dialog.tsx`

- Search stays outside the sheet and is always visible.
- Mobile layout for the top area:
  - One row: search input (flex-1) + `Filters` button.
  - The filter button uses `SlidersHorizontal`, an accessible name, and a `Badge` with the number
    of active filter groups.
  - Below the search row, render the active-filter chip row only when at least one chip exists.
- The chip row must be horizontally scrollable on its own (`overflow-x-auto`,
  `overscroll-x-contain`, hidden scrollbar) and must not widen the page.
- Each chip is a button whose accessible label is “Remove … filter”; activating it clears only
  that filter group. Do not reset the search query.
- Add a `sheet` variant to `DialogContent` (or a thin `SheetContent` wrapper around it) that:
  - anchors to the bottom edge, full width, top-rounded;
  - uses `max-h` based on `dvh` and the keyboard inset;
  - uses `flex flex-col` and `overflow-hidden` on the content;
  - scrolls only the body (`min-h-0 flex-1 overflow-y-auto overscroll-contain`);
  - applies bottom safe-area padding.
- The sheet contains `LibraryFilters` with `variant="sheet"` and a sticky footer:
  - `Reset filters` on the left, preserving the current reset behavior.
  - `Done` on the right, closing the sheet.
- Filters apply live; closing the sheet does not discard changes.
- Do not auto-focus a text field when the sheet opens. The dialog’s close button is an acceptable
  initial focus target.
- Verify that `MultiSelect` and `Select` popovers opened from inside the sheet render above the
  sheet and remain keyboard-operable.

### 6. Replace mobile secondary actions with a labeled menu

File: `src/components/library/LibraryPane.tsx`

- Keep the desktop `Append all`, `Replace deck`, `Create custom spell`, and import/export controls
  exactly as they are.
- On mobile, render a single compact `DropdownMenu` trigger with a visible `Actions` label and an
  overflow icon. Keep the visible label at 320 px; use an accessible name such as
  `Library actions` as well.
- Menu items:
  - `Append all` — disabled when there are no results.
  - `Replace deck` — disabled when there are no results; opens the existing confirmation dialog.
  - Separator.
  - `Create custom spell` — always enabled, including empty or filtered-empty results.
  - `Custom spell import/export` — opens the existing dialog.
- Use icons where they improve recognition, but keep text labels for discoverability.
- The menu trigger must remain visible when the result list is empty so “Create custom spell”
  remains an always-available entry point.
- Do not change the existing replace-deck confirmation or import/export dialog behavior.

### 7. Compact the results toolbar and spell rows

File: `src/components/library/LibraryPane.tsx`

- Remove the visible `Spells` heading on mobile and keep it `sr-only` there. Keep the current
  visible heading on desktop.
- Make the result count a compact, non-sticky toolbar row outside the scroll container:
  count on the left, actions on the right.
- Keep `aria-live="polite"` on the result count.
- Mobile row layout:
  - `flex-nowrap`, `min-w-0`, small gap and vertical padding.
  - The spell-name button remains the primary row tap target.
  - Name and metadata truncate rather than wrapping the row.
  - Keep level and school metadata readable; keep the source badge or a compact source label.
  - Add button uses at least a 44 × 44 px touch area on mobile.
  - Ensure the selected-row state remains visible.
- Keep desktop row spacing and wrapping behavior via `min-[1200px]` variants.
- The list remains:
  `min-h-0 flex-1 overflow-y-auto overscroll-contain`, with `[scrollbar-gutter:stable]` and
  bottom safe-area padding.
- Do not make the page or any ancestor a second vertical scroll container.

### 8. Preserve view state and list scroll position

Files: `src/components/AppShell.tsx`, `src/components/library/LibraryPane.tsx`

- Keep `forceMount` on all tab panels; do not change the selection/auto-switch architecture.
- Pass a boolean such as `active={tab === "library"}` from `AppShell` to `LibraryPane`.
- In `LibraryPane`, keep a `useRef` for the list element and a `useRef` for the last
  `scrollTop`. Update the ref in `onScroll`.
- Restore the saved `scrollTop` in a `useLayoutEffect` when `active` becomes true.
- Do not store scroll position in React state; this would cause avoidable re-renders and possible
  scroll feedback loops.
- Search and filters already live in `LibraryPane` state and remain mounted, so they survive tab
  switches. Add regression tests rather than lifting them into a global store.

### 9. Desktop preservation

Files: `src/components/AppShell.tsx`, `src/components/library/LibraryPane.tsx`,
`src/components/Header.tsx`

- At `min-width: 1200px`, render the existing:
  - full title header;
  - inline filter stack with collapsible advanced filters;
  - `Append all` and `Replace deck` buttons;
  - full-width create/import-export buttons;
  - existing row spacing and source badges;
  - three-pane grid.
- Do not show the mobile filter trigger, chip row, actions menu, or sheet on desktop.
- Add one desktop regression test asserting that the mobile trigger/actions menu are absent and
  the inline filters and action buttons are present.

### 10. Localization, documentation, and test updates

Files: `src/locales/en.ts`, `src/locales/de.ts`, `README.md`,
`docs/specs/MAIN-spec.md`, `docs/DEVELOPMENT.md`, `src/components/library/LibraryPane.test.tsx`,
`src/ui/MultiSelect.tsx`, `e2e/mobile-library.spec.ts` (new)

- Add keys for:
  - filter trigger/title and filter-sheet description;
  - active-filter row label;
  - “remove {{filter}} filter” accessible label;
  - “{{label}} +{{count}}” multi-value summary;
  - library actions trigger label;
  - `Done`.
- Set the mobile search input (and the searchable `MultiSelect` input) to at least 16 px to
  prevent iOS focus zoom:
  - Add `text-base min-[1200px]:text-sm` to the Library search input.
  - Add an optional `searchInputClassName` to `MultiSelect` and pass the same override from
    `LibraryFilters`, or use an equivalent scoped mechanism.
  - Do not change unrelated form typography.
- Update locale parity tests if they assert key coverage.
- Update `MAIN-spec.md` §5 to document:
  - the 1200 px breakpoint;
  - the mobile filter sheet and removable chips;
  - the mobile actions menu, including the always-available create entry point;
  - the independently scrollable results list and preserved state.
- Add a verification-matrix row for mobile Library layout and state preservation.
- Update `README.md` where it says custom-spell import/export is “next to Create custom spell”;
  describe the Library actions menu on mobile.
- Update `DEVELOPMENT.md` module notes and the custom-spell entry-point description.
- Update existing unit tests that assume desktop controls; keep desktop coverage, add mobile
  coverage using a `matchMedia` override.

## Details navigation analysis (deferred)

Current behavior:

- Details is a permanent tab on narrow screens.
- Selecting a library or deck row sets `selectedSpellId`, and `AppShell` auto-switches to Details.
- With no selection, the Details tab shows only an empty message.
- All panes stay mounted via `forceMount`, so selection and pane state survive tab changes.

Assessment:

- Details is already selection-driven in practice; the permanent tab is a destination that is
  empty whenever nothing is selected.
- A contextual mobile Details view (full-screen view opened by row selection, with a Back control)
  would remove the empty tab, reclaim navigation space, and better match list-first browsing.
- It is not implemented here because it changes navigation/back semantics, tab discoverability,
  deck-row selection behavior, and the add-to-deck auto-switch behavior.

Follow-up decisions, not part of this plan:

1. Remove Details from the mobile tab strip and open it as a contextual full-screen view.
2. Decide whether adding a spell should stop auto-switching to Details on mobile so users can add
   several spells without leaving the list.
3. Revisit the 1024 px vs 1200 px breakpoint discrepancy.

## Risks and edge cases

- **Duplicate controls:** never render desktop and mobile filter panels simultaneously. Hidden
  duplicate controls break accessible names and unit queries.
- **Pane remount:** do not key `LibraryPane` or the list by viewport. Remounting would lose search,
  filters, and scroll position.
- **Nested scroll:** the only vertical scroll container in the Library must be the results list.
  The sheet body and select popovers are modal overlays, not part of that scroll chain.
- **Nested Radix overlays:** verify that MultiSelect/Select popovers inside the sheet receive focus
  and appear above the sheet overlay. If a popover is clipped, adjust z-index/portal behavior
  rather than converting filters to native selects.
- **iOS keyboard:** `dvh` alone does not shrink for the iOS keyboard. The visualViewport inset is
  required; verify on a real device or Safari responsive mode.
- **Safe areas:** adding `viewport-fit=cover` without padding can place content under the notch or
  home indicator. Test portrait and landscape.
- **Horizontal overflow:** long class/subclass/source chips and long localized spell names must
  truncate or scroll inside the chip row, never widen the document.
- **Chip semantics:** one chip per filter group is intentional. Removing a multi-value chip clears
  the group; the sheet is the place to refine individual values.
- **Reset semantics:** the existing reset clears search as well as filters. Do not change this
  without updating the spec and E2E expectations.
- **Desktop regression:** the sheet variant and media-query hook must not affect dialogs or
  panes above 1200 px.

## Validation

Run:

```powershell
pnpm run check
pnpm run test
pnpm run build
pnpm run test:e2e
```

Add Playwright coverage at 320 × 568, 390 × 844, and 430 × 932:

- Header stays one row and the app has no page-level horizontal overflow.
- Search and `Filters` trigger are visible on first load.
- The spell-results list occupies substantially more than half of the usable pane and is the
  only vertical scroll container.
- Opening Filters shows the bottom sheet; level, class, source, advanced filters, reset, and Done
  are reachable; the sheet stays within the viewport.
- Applying a filter creates a chip; the chip row shows no defaults; removing the chip restores
  results; resetting restores defaults.
- The actions menu contains Append all, Replace deck, Create custom spell, and custom-spell
  import/export; the menu trigger remains available with zero results.
- Search and add still work on mobile.
- Scroll the list, open Details by selecting a row, return to Library, and assert the list
  scroll offset, query, and filters are preserved.
- At 1280 px, assert the mobile trigger/menu are absent and the existing desktop controls are
  present.

Manual verification:

- iOS Safari keyboard: focusing search must not hide the list behind the keyboard; the list
  should shrink to the visual viewport.
- Focus order: search → filter trigger → chips → list add buttons; the sheet traps focus, Escape
  closes it, and focus returns to the trigger.
- Screen-reader names for the filter count, chip removal, actions menu, and result count.
- 320 px width, 200% zoom, and landscape safe areas.

## Out of scope

- Removing or restructuring the Details tab.
- Changing add-to-deck auto-navigation.
- Bottom navigation bars.
- Result grouping, A–Z indexes, virtualization, or new sorting controls.
- Any data/search/filter semantics changes.
- Changing the desktop three-pane layout.