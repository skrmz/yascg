# DetailsPane spell-preview simplification — implementation summary

Date: 2026-10-25
Spec: [`details-pane-spell-details-refactoring-spec.md`](details-pane-spell-details-refactoring-spec.md)
Plan: [`.kilo/plans/1792965796387-details-pane-spell-details-plan.md`](../../.kilo/plans/1792965796387-details-pane-spell-details-plan.md)

## Outcome

`DetailsPane` now presents the rendered physical card preview(s) as the only default spell content.
The former metadata sidebar and description block were removed from the default layout and replaced
by an on-demand, responsive details dialog. Full spell metadata and the complete canonical
description remain available from a persistent header button, an accessible actions dropdown, and a
right-click context menu on the preview.

Card geometry, measurement, auto-shrink, multi-card pagination, printing, deck behavior, and spell
data resolution are unchanged.

## Implemented changes

### New UI primitives

- `src/ui/DropdownMenu.tsx` — Radix dropdown-menu wrapper (portal, `align="end"`, popover styling,
  `app-no-print`, shared item/separator styles).
- `src/ui/ContextMenu.tsx` — Radix context-menu wrapper with matching styling.
- Added dependencies: `@radix-ui/react-dropdown-menu`, `@radix-ui/react-context-menu`.

### Dialog extension

- `src/ui/Dialog.tsx` — backwards-compatible optional `bodyClassName` and `closeLabel` props, plus
  `shrink-0` on the header so a scrollable body works. Default dialog behavior is unchanged.

### New details components

- `src/components/details/SpellDetailsContent.tsx` — presentational component rendering:
  - source, concentration/ritual, and localized damage-type badges,
  - casting time, range, duration, components, material detail, classes, and subclasses,
  - the full description, higher-level text, and verbal/somatic component paragraphs through
    `parseSpellBody`, rendered with the existing safe `BlockList`.
- `src/components/details/SpellDetailsDialog.tsx` — controlled dialog with spell name title,
  localized level/school description, localized close label, responsive width, and a scrollable
  body. It receives the already-resolved `Spell` and performs no data loading or card fitting.

### DetailsPane refactor

- Default layout is now the status block plus `card-preview-frame`; the metadata sidebar and
  description block were removed.
- Fit notices (fit error, truncation, continuation overflow, `N physical cards at Xpt.`) moved into a
  compact status block above the preview with unchanged text.
- Header actions: Add, Show details, Edit, then custom-only Duplicate/Delete. The action group wraps
  on narrow layouts.
- Added a floating ellipsis (`More actions`) dropdown in the preview frame and a right-click context
  menu on the frame. Both expose the same Show details and Edit actions.
- Dialog state is keyed by spell id (`detailsSpellId`), closing immediately when the selected spell
  changes and not reopening when switching back.
- No single-click action was added to the card body.
- Localized new strings via `details.show`, `details.moreActions`, `details.edit`, and
  `details.close` in `src/locales/en.ts` and `src/locales/de.ts`.

### Styling

- `src/print/print.css` screen-preview section only:
  - `.card-preview-frame` is a wrapping flex row with reserved top strip for the floating trigger.
  - `.card-preview-page` uses `flex: 0 0 auto` to preserve 2.5in × 3.5in card dimensions.
  - Scoped `.spell-details-content` styles cover paragraphs, headings, lists, tables (with
    horizontal scrolling), code, and rules.
- `@media print` rules and card geometry were not modified.

## Tests

- `src/components/details/DetailsPane.test.tsx` updated for preview-only defaults, persistent Show
  details, dialog state, dropdown/context menus, single-click behavior, and relocated content
  assertions.
- `src/components/details/SpellDetailsDialog.test.tsx` added for complete metadata, full description
  (including long text, lists, and tables), EN/DE localization, and dismissal/focus behavior.
- `e2e/app.spec.ts` added coverage for the header button, ellipsis/context menus, and single-click
  behavior.
- `e2e/continuation-cards.spec.ts` added responsive row/wrap assertions and retained physical
  dimensions.
- `e2e/i18n-cards.spec.ts` now verifies damage-type badges inside the localized details dialog.

## Validation performed

- `pnpm exec vp check` — passed.
- Targeted component tests — 26/26 passed.
- `pnpm run build` — passed.
- Targeted Playwright suites (`app`, `continuation-cards`, `i18n-cards`, `print`) — 14/14 passed.

The full `vp test` run still reports three pre-existing, unrelated failures in
`Card.i18n.test.tsx`, `PrintSheet.test.tsx`, and `srd-migration.test.ts` (stale card-footer
expectations from the compact page-numbering change and a JSON formatting expectation in the SRD
migration test). No failures originate from this refactor.

## Out of scope

Compact-card glyphs, zoom preview, auto-shrink minimum changes, card truncation/pagination logic,
print appearance, saved spell/deck schemas, and the SRD data pipeline.
