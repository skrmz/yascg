# DetailsPane spell-preview simplification — implementation plan

Date: 2026-10-25
Spec: `docs/specs/details-pane-spell-details-refactoring-spec.md`

## Goal

Make rendered card preview(s) the only default spell content in `DetailsPane.tsx`. Move the
former metadata sidebar and description block into a reusable, responsive details dialog opened
from a persistent header button or a card actions menu. Preserve card rendering, fit modes,
pagination, printing, deck behavior, localization, and resolved spell data.

## Verified current state

- `DetailsPane.tsx` renders the header, `div.card-preview-frame`, a metadata sidebar
  (`DetailsPane.tsx:136-206`), and a description block (`DetailsPane.tsx:209-223`).
- Fit status notices (truncation, overflow, card count, fit error) currently live inside the
  metadata sidebar. These are status information, not duplicated metadata/description.
- `src/ui/Dialog.tsx` wraps Radix Dialog and scrolls the whole content box. It has no scrollable
  body slot or configurable close label.
- `src/ui/Popover.tsx` is a popover, not an accessible menu. No dropdown-menu or context-menu
  package is installed.
- `CardView`/`print.css` define fixed physical dimensions. `.card-preview-frame` is currently a
  vertical inline flex container.
- `Card.tsx` must not be modified; preview interaction must wrap it.
- `Spell` data is already fully resolved by `AppProvider` (`selectedSpell`), including language,
  SRD overrides, and custom spells.

## Decisions

1. **Keep fit status notices in the default pane.** Move them into a compact status block above
   the preview. They are not metadata/description duplicates, and existing tests rely on them
   (`DetailsPane.test.tsx`, `e2e/continuation-cards.spec.ts`, `e2e/i18n-cards.spec.ts`).
   Remove only the metadata sidebar and description block.
2. **Add Radix menu primitives.** Add `@radix-ui/react-dropdown-menu` and
   `@radix-ui/react-context-menu` (same Radix/shadcn component family already used). Build thin
   wrappers under `src/ui/`. Do not hand-build menu keyboard behavior on top of Popover.
3. **Pass the resolved `Spell` object down.** `DetailsPane` passes its existing `selectedSpell` to
   `SpellDetailsDialog`/`SpellDetailsContent`. No new data loading, JSON parsing, or DOM scraping.
4. **Dialog state is keyed by spell id.** Store `detailsSpellId` in `DetailsPane`; the dialog is
   open only while it equals the current selected spell id. Clear it when the selected id changes.
   This prevents stale content and prevents re-opening unexpectedly when switching back to a spell.
5. **Reuse `parseSpellBody`.** The dialog content gets the canonical description, higher-level
   text, and verbal/somatic component paragraphs via the same parser used by card fitting.
6. **Do not change card geometry or fit logic.** Keep `.spell-card` dimensions and
   `useCardFit`/`computeFit` untouched. Only the preview container layout changes.
7. **Localize new UI strings only.** Add keys for Show details, More actions, Edit (menu), and
   Close. Leave existing header Add/Edit/Duplicate/Delete labels and behavior unchanged to avoid
   changing existing flows and E2E expectations.
8. **No single-click card action.** Only the header button, ellipsis dropdown, and right-click
   context menu open actions. Do not add a zoom placeholder.

## Implementation tasks

### 1. Add menu dependencies and primitives

- Add `@radix-ui/react-context-menu` and `@radix-ui/react-dropdown-menu` to `package.json` and
  update `pnpm-lock.yaml` (`pnpm add ...` / `vp install`).
- Create `src/ui/DropdownMenu.tsx`:
  - Export Root, Trigger, Content (portal, `align="end"`, styled `bg-popover`, border, z-50,
    `app-no-print`), Item (focus/highlight/disabled styles), and any needed separator.
  - Follow the wrapper style of `src/ui/Popover.tsx`/`src/ui/Tabs.tsx` and use `cn`.
- Create `src/ui/ContextMenu.tsx` with the analogous Radix ContextMenu exports and identical
  item styling. Include `app-no-print` on portaled content.
- Do not modify `Popover.tsx` or add another component library.

### 2. Extend the existing dialog abstraction

Modify `src/ui/Dialog.tsx` only with backwards-compatible optional props:

- `bodyClassName?: string` applied to the existing content body wrapper.
- `closeLabel?: string` used as the close button `aria-label` (default `"Close"`).
- Add `shrink-0` to the header wrapper so a scrollable body works.
- Keep default sizing/overflow behavior unchanged for all existing dialogs.

### 3. Create `SpellDetailsContent.tsx`

File: `src/components/details/SpellDetailsContent.tsx`

- Props: `{ spell: Spell }`.
- Use `useTranslation`; do not access `useApp`.
- Render one coherent document:
  - Source badge (`SourceBadge`), concentration/ritual/damage-type badges.
  - Metadata grid using existing localized labels: casting time, range, duration, components,
    material detail, classes, subclasses. Reuse `classSummary`, `materialDetailText`,
    `componentKey`, `subclassLabel`, `damageTypeKey` rather than duplicating formatting logic.
  - Full description via
    `parseSpellBody(spell, t("spell.higherLevels"), { verbal: t(componentMarkerKey("verbal")), somatic: t(componentMarkerKey("somatic")) })`.
  - Render with existing `BlockList` from `src/markdown/render.tsx`.
- Use a scoped class, e.g. `className="spell-details-content space-y-4"`.
- No truncation, pagination, fit result, or dialog state inside this component.
- Metadata values must wrap (`break-words`/`min-w-0`) instead of clipping long values.

### 4. Create `SpellDetailsDialog.tsx`

File: `src/components/details/SpellDetailsDialog.tsx`

- Props: `{ spell: Spell; open: boolean; onOpenChange: (open: boolean) => void }`.
- Use `Dialog` + `DialogContent` from `@/ui/Dialog.tsx`.
- Title: `spell.name`.
- Description: localized level + school (use `levelLabelKey`/`schoolKey`), e.g.
  `Level 3 · Evocation`.
- Pass `lang={i18n.resolvedLanguage}`, `closeLabel={t("details.close")}`.
- Content sizing:
  - `className="app-no-print flex max-h-[85vh] w-[min(94vw,48rem)] flex-col overflow-hidden"`.
  - `bodyClassName="min-h-0 overflow-y-auto pr-1"`.
- Render `<SpellDetailsContent spell={spell} />` as the body.
- Do not resolve/load spells or own the persisted open state; the parent controls it.

### 5. Refactor `DetailsPane.tsx`

- Add `const [detailsSpellId, setDetailsSpellId] = useState<string | null>(null)`.
- Add an effect that clears `detailsSpellId` when `selectedSpell?.id` changes. Derive
  `detailsOpen = detailsSpellId !== null && detailsSpellId === spell.id` so the dialog closes
  immediately on id change and does not reopen when switching back.
- Add `openDetails = () => setDetailsSpellId(spell.id)`.
- Header actions, in order: existing Add, new Show details, existing Edit, then existing custom
  Duplicate/Delete. Use a small ghost/outline `Button` with lucide `Info`, localized visible text
  and `aria-label`. Make the action group wrap (`flex-wrap justify-end`) so mobile layouts do not
  overflow.
- Keep the existing `section` `aria-label="Spell preview and details"` and the header name/source.
- Move the fit status notices out of the removed sidebar into a compact block above the preview:
  - fit error
  - truncation notice (keep exact existing text)
  - overflow notice
  - `N physical card(s) at Xpt.`
- Remove the metadata sidebar and description block entirely from the default layout. Remove the
  now-unused imports (`BlockList`, `parseMarkdown`, `componentDescriptionBlocks`, `Badge`,
  `classSummary`, `materialDetailText`, `componentKey`, `damageTypeKey`, `subclassLabel`).
- Preview structure:

  ```tsx
  <ContextMenu>
    <ContextMenuTrigger asChild>
      <div className="card-preview-frame">
        {fit.result ? fit.result.pages.map(...CardView...) : measuringPlaceholder}
        <DropdownMenu>...</DropdownMenu>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>...same actions...</ContextMenuContent>
  </ContextMenu>
  ```

- Floating menu trigger:
  - One `DropdownMenuTrigger` inside the frame, absolutely positioned top-right.
  - `Button` with lucide `Ellipsis` (or `MoreHorizontal` if unavailable), `variant="ghost"` or
    `secondary`, small icon size, `aria-label={t("details.moreActions")}`, `title` same, and
    `app-no-print`.
  - Visible at all times, including touch; no hover-only behavior.
- Actions (shared handlers, rendered in both menu types):
  - Show details -> `openDetails`
  - Edit -> `setEditing(true)`
  - Do not add a zoom item.
- The Edit item mirrors the current header Edit: always available for the selected spell. Do not
  introduce new eligibility rules.
- Right-click anywhere in the preview frame must open the context menu and suppress the native
  browser menu only inside that frame. Radix `ContextMenuTrigger` provides this.
- Do not add a click handler to the card body. Do not modify `Card.tsx`.
- Multi-card previews use one menu for the selected spell; no per-card menus/dialogs.
- Render the dialog near the existing delete dialog:
  `<SpellDetailsDialog spell={spell} open={detailsOpen} onOpenChange={...} />`.
- Keep `CustomSpellForm`, Add/Duplicate/Delete, undo, and delete confirmation behavior unchanged.

### 6. Preview and details styling

Modify only the screen-preview/details sections of `src/print/print.css`; do not change
`@media print` or `.spell-card` geometry.

- `.card-preview-frame`:
  - `position: relative; display: flex; flex-direction: row; flex-wrap: wrap; width: 100%;`
  - `align-items: flex-start; align-content: flex-start; gap: 0.16in;`
  - Reserve a small top strip for the floating ellipsis (e.g. `padding-top: 2rem`) so it does not
    cover card content.
- `.card-preview-page`: `flex: 0 0 auto;` to guarantee physical card dimensions are not shrunk by
  flex layout. Keep existing shadow.
- Add scoped `.spell-details-content` styles for `BlockList` output outside `.card-body`:
  - readable paragraph/list/heading spacing and sizes,
  - table borders and padding,
  - `overflow-x: auto` on `.card-table` with `max-width: 100%` for wide tables,
  - `overflow-wrap: anywhere` for long text,
  - pre/code/hr styling.
- Existing print CSS and `.print-root` must remain untouched.

### 7. Localization

Add to `src/locales/en.ts` (and mirrored `src/locales/de.ts` via `satisfies Translations`):

```ts
details: {
  show: "Show details",          // de: "Details anzeigen"
  moreActions: "More actions",   // de: "Weitere Aktionen"
  edit: "Edit",                  // de: "Bearbeiten"
  close: "Close",                // de: "Schließen"
}
```

Use these keys for the header Show details button, ellipsis `aria-label`, both Edit menu items,
and the details dialog close label. Keep existing Add/Edit/custom header labels unchanged.

### 8. Unit tests

Update `src/components/details/DetailsPane.test.tsx`:

- Default layout renders preview card(s) and the physical-card status, but no metadata labels
  (`Casting Time`, `Subclasses`), description text, or material line.
- Show details is a persistent visible button and opens the dialog with the current spell.
- Opening details does not call `addSpellToDeck` and does not change selection/deck state.
- Switching `holder.spell` and re-rendering while the dialog is open closes it; clicking Show
  details again shows the new spell, not stale content.
- Ellipsis dropdown exposes Show details and Edit; Edit opens `CustomSpellForm`.
- Right-click (`fireEvent.contextMenu`) on the preview frame opens the same actions.
- Single click on the card does not open the dialog/menu.
- Existing fit-notice, Add-toast, SRD/custom action, and overridden-marker tests remain valid.
- Move the former sidebar/description assertions (subclasses row, component descriptions,
  material detail line) into the dialog/content tests.

Create `src/components/details/SpellDetailsDialog.test.tsx`:

- Complete metadata: casting time, range, duration, components, material detail, classes,
  subclasses, source, concentration/ritual/damage badges.
- Full description, higher-level text, verbal/somatic component paragraphs, lists, and a Markdown
  table (`getByRole("table")`).
- Very long description is rendered in full in the dialog even when a fit result would be
  truncated (the dialog must not depend on `useCardFit`).
- English and German labels/content (`i18n.changeLanguage`), including dialog title/description.
- Escape/close calls `onOpenChange(false)` and content is removed when controlled by a small
  test harness; close button has an accessible name.
- Reset i18n to English after each test.

### 9. E2E tests

Update `e2e/i18n-cards.spec.ts`:

- Keep the physical-card status assertion (status block remains).
- Damage-type badge assertions now open Show details, assert `Fire`/`Feuer` inside the dialog,
  and close it. Account for the localized Show details label in German.

Update `e2e/continuation-cards.spec.ts`:

- Existing truncation notice and multi-card assertions remain in the default pane.
- Add an arrangement assertion: at the default desktop viewport, the first two continuation cards
  share the same top coordinate (side by side); at a narrow viewport they wrap to different rows.
- Verify card width/height (240x336) remains unchanged.

Update `e2e/app.spec.ts`:

- Add coverage for the persistent header Show details button opening the dialog.
- Add coverage for the ellipsis menu and right-click context menu opening Show details/Edit.
- Verify the card body itself is not a single-click trigger.

Do not create new E2E files. Review `e2e/print.spec.ts` and keep it passing unchanged; interaction
affordances must not appear in print output.

## Validation

Run after implementation:

1. `vp check`
2. `vp test`
3. Targeted component tests if iterating:
   `vp test src/components/details/DetailsPane.test.tsx src/components/details/SpellDetailsDialog.test.tsx`
4. `vp build`
5. `vp run test:e2e` (Playwright preview server requires the build)
6. Targeted E2E while iterating, e.g.
   `pnpm exec playwright test e2e/app.spec.ts e2e/continuation-cards.spec.ts e2e/i18n-cards.spec.ts e2e/print.spec.ts`

## Acceptance checklist

- [ ] Default pane shows card preview(s) only, with no duplicate metadata/description blocks.
- [ ] Multiple physical cards sit in a wrapping row, keep 2.5x3.5in dimensions, and do not
      overflow horizontally at mobile/tablet/desktop widths.
- [ ] Persistent Show details button opens a responsive, scrollable dialog with the full
      canonical description and metadata.
- [ ] Dialog content comes from `selectedSpell`, not card DOM, fit output, or new data loads.
- [ ] Dialog closes on Escape/close and when the selected spell id changes; content never goes
      stale.
- [ ] Ellipsis dropdown and right-click context menu both expose the same Show details/Edit
      actions; Edit uses the existing editing flow.
- [ ] No single-click card action and no zoom placeholder.
- [ ] Menus/buttons are outside printable card markup and never appear in print.
- [ ] Add/Edit/deck/selection/unsaved-state behavior and auto-shrink/multi-card behavior are
      unchanged.
- [ ] English/German labels, accessible names, focus behavior, tables, and long text work on
      small screens.

## Risks / notes

- **New Radix packages:** required for correct menu semantics; keep wrappers thin and consistent
  with existing `src/ui` style.
- **Nested trigger:** the ellipsis dropdown lives inside the context-menu trigger. Verify both
  interactions independently in unit and E2E tests; right-click anywhere on the frame must still
  open the context menu.
- **Floating button overlap:** the reserved top strip in `.card-preview-frame` avoids covering
  card names; do not solve this by shrinking or transforming cards.
- **CSS scope:** the details content is outside `.card-body`, so it needs its own scoped styles.
  Do not globally restyle `.card-*` classes, and do not touch print selectors.
- **Localization scope:** only new controls are localized; existing header English labels remain
  to avoid changing current behavior and E2E expectations.
- **E2E prerequisite:** the Playwright preview server uses built assets; run `vp build` before
  E2E or restart a stale preview server.

## Out of scope

Compact-card glyphs/abbreviations, zoom preview, changes to auto-shrink's 6pt minimum, card
truncation/pagination/splitting logic, card templates, print/export appearance, saved
spell/deck JSON schemas, SRD data pipeline, and new data normalization.
