# TABLE_DECK — Alternative Active Deck Table View

## General requirements

- Review the relevant application documentation, architecture, data models, components, persistence, localization, preview, export, and print implementations before making changes.
- Reuse existing spell-resolution, deck-state, deck-mutation, localization, multi-select, modal, and print workflows wherever practicable. Avoid parallel sources of truth.
- Preserve deck data integrity, accessible interaction, localization, and the existing spell-card preview/printing behavior.
- Identify architectural conflicts before implementation and select the simplest viable approach consistent with this specification.
- Avoid unnecessary complexity and premature optimization. Update affected specifications/documentation and add appropriate automated and manual tests.
- The **active deck is the sole data source** for both views. A view change must never modify deck contents, spell data, or persisted deck order.

## 1. Views, workspace, and responsive behavior

### 1.1 Card preview and Table view

- Provide a **Spell Cards / Table** switch for the Active Deck's **main workspace**. Spell Cards is the existing main-area rendered spell-card preview; Table is an alternative representation of the same active deck.
- On wide viewports, render the table in the **main content area**, **not inside the narrow Active Deck sidebar**. Keep the existing Active Deck management panel available where the layout supports it. Switching back restores the existing spell-card preview.
- On mobile, retain the existing Library / Details / Deck navigation pattern as appropriate. Make the Table view accessible from the active deck workflow without adding an extra top-level application tab. The agent should adapt the existing navigation rather than duplicating it.
- The Cards/Table switch is a *presentation choice*, not a new or separately persisted deck.
- Switching views must preserve the current active deck, its order, selected table entries, and table display state; it must not trigger a save, reload, or print-order change.
- If there is no active deck or it is empty, display a clear empty state and disable inapplicable actions.

### 1.2 Responsive presentation

- **Wide screens:** Render the full table in the main workspace with usable column widths; allow horizontal scrolling within the table container if required.
- **Constrained desktop/tablet:** Keep readable minimum widths and use horizontal scrolling inside the table container, not across the whole application. Consider sticky selection and spell-name columns where this is robust and accessible.
- **Mobile:** By default render a compact, touch-friendly *table-mode list* showing spell identity, key metadata, a selection checkbox, and access to details/actions. This is a responsive presentation of the same Table view and uses exactly the same search, filters, sorting, selection, and bulk actions.
- Provide an explicit **Full table** option on mobile for horizontally scrollable access to every enabled column. Its horizontal scrolling must be discoverable; do not compress a dense table until text becomes unreadable.
- Define the responsive breakpoint using available **workspace/container width** where practical, rather than only the device type.
- Keep the current scroll position where reasonable on view switches; avoid surprising jumps after incremental updates.
- Accommodate touch targets, text zoom, reflow, and keyboard/screen-reader navigation. The compact list must use appropriate accessible list/group semantics rather than pretending to be a full grid.

## 2. Table data and columns

### 2.1 Supported columns

| Column        | Behavior                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| Select        | Row checkbox identifying a deck entry                                                                                |
| Spell name    | Localized spell name or clearly identified fallback                                                                  |
| Level         | Numeric spell level; cantrip = 0                                                                                     |
| School        | Localized spell school                                                                                               |
| Classes       | Associated classes; localized when possible                                                                          |
| Components    | Compact V/S/M indicators, with accessible labels and material details available in spell details                     |
| Casting time  | Localized casting time                                                                                               |
| Range         | Localized range                                                                                                      |
| Duration      | Localized duration                                                                                                   |
| Concentration | Accessible Yes/No indicator                                                                                          |
| Ritual        | Accessible Yes/No indicator                                                                                          |
| Description   | Truncated preview and action to open complete description                                                            |
| Source        | SRD / Custom or existing source categories if the data model supports more                                           |
| Actions       | Compact accessible entry actions, including Remove and Open details; reuse existing supported actions as appropriate |

**Default visible columns:** Select, Spell name, Level, School, Components, Casting time, Concentration, Actions.

- Offer a column-visibility menu for optional columns. Keep **Select**, **Spell name**, and **Actions** visible in the interactive table.
- Visible column configuration is a display preference, not part of deck or spell data.
- Use localized headings, values, sort announcements, control labels, and fallback messages.
- Use semantic table markup for the full table, including headers and appropriate sort state. Do not rely only on color, icons, or hover tooltips to convey meaning.
- Provide accessible full-text access for truncated content via an existing spell-details dialog or equivalent accessible dialog/panel.
- The compact mobile presentation may use fewer fields on each row; all data remains accessible via details and the Full table option.

### 2.2 Long and missing values

- Use bounded, readable widths and ellipsis/clamping for interactive table cells with long text. Provide a keyboard- and touch-accessible way to inspect the full value; do not rely exclusively on a mouse hover tooltip.
- Allow multi-line wrapping for fields where it improves readability (for example, classes) without allowing an unusually long description to dominate the interactive table.
- For Description, show a short excerpt and an explicit **Show full description** action. Preserve text content and localization in the details view.
- When localized spell data is unavailable, use the application's existing fallback language/data rules and clearly label fallback text where useful. A missing translation must not cause the deck entry to vanish.
- If a spell reference cannot be resolved, render a distinct, non-destructive placeholder row with whatever stable identification is available. Preserve that deck entry until the user intentionally removes it or a supported recovery workflow resolves it.
- Empty/unknown values should be displayed consistently (for example, an em dash with accessible "Not available"). Unknown values sort last in either direction. Provide a discoverable "Unknown / unavailable" filter choice when applicable.
- Use the real data model to distinguish missing values from valid values such as a non-concentration spell.

## 3. Search and filtering

- Provide a compact search/filter toolbar above the Table view; on mobile use a compact search field and an accessible filter panel.
- Include the following filters:
  - **Spell name:** dynamic, case-insensitive, whitespace-normalized text search against the displayed localized/fallback name.
  - **School:** multi-select using the application's existing multi-select component where possible.
  - **Classes:** multi-select, reusing the Library's established multi-select interaction where suitable.
  - **Concentration:** Any / Yes / No.
  - **Ritual:** Any / Yes / No.
  - **Casting time:** single-select based on distinct normalized casting-time values present in the active deck, plus Any.
- Different filter groups combine with **AND**. Selected values within multi-select groups combine with **OR**.
- Filters apply only to the Table view's result set. They must not alter deck contents, the Library's filters, or persisted deck order.
- Filtering is based on the currently selected spell-data language, with documented fallback behavior for missing translations. Recompute displayed labels and derived filter choices when the language changes; reconcile chosen filter values against stable underlying identifiers where possible.
- Show both the number of matching entries and the total number of active-deck entries. Provide **Reset filters and sort** to clear filters and restore **original active-deck order** (not alphabetical order).
- Resetting filters and sort must **not** clear the user's selection; offer a distinct **Clear selection** action.
- Changing filters updates results immediately. Reset to the first page when filters change. Changing the page size likewise resets to page one.
- If filters produce no results, display an explicit empty-results state and an action to reset filters; do not imply the deck itself is empty.

## 4. Sorting, pagination, and selection

### 4.1 Sorting and paging

- Default table order is the **current order of entries in the active deck**, including user reordering performed in the existing Deck view.
- Support optional sorting by appropriate data columns. Use stable sorting, with active-deck position as a tie-breaker. Do not change the persisted order when sorting.
- Sorting applies to **entries matching the current filters**; results are then paginated. A change to sort order resets the table to page one.
- Default page size: **10** entries. Support other practical page sizes and page navigation; consider an **All** option if safe for expected deck sizes.
- Keep page index within valid bounds when deck contents or matching counts change.
- Manual drag-and-drop reordering is not provided in Table view. To reorder the deck, use the existing Deck view; the table's default order must immediately reflect that updated deck order.

### 4.2 Selection

- Identify selections using the application's **stable active-deck entry identity**. First verify the existing identity contract. If spell IDs are in fact unique per deck entry and duplicates are disallowed, reuse them; do not introduce a new ID scheme unnecessarily. If duplicates are supported, distinct occurrences must remain independently selectable.
- A row checkbox toggles its entry. Selections persist across pages, filtering, sorting, and switching between Cards and Table for the same active deck.
- The header **Select all** checkbox selects **all entries matching the current filters across every page**, not only the current page. Unchecking it deselects those matching entries across every page.
- Selection outside the current filter remains untouched by header select/deselect. With no filters, header select/deselect covers the entire active deck.
- The header checkbox is checked when all currently matching entries are selected, unchecked when none are selected, and indeterminate for partial selection. Its accessible label must make the *all matching pages* scope explicit.
- Provide a separate **Clear selection** command that deselects **all selected entries**, including entries not matching current filters.
- Show the total selected-entry count, including any entries hidden by filters or pagination, and indicate when the selection includes entries outside the current filtered result set.
- If the active deck changes, reconcile selection against valid entry identities so stale entries are removed. Clear selection when replacing, loading, or creating a **different active deck**; preserve it when simply switching presentation or updating the same deck.
- Do not select unresolved or missing-translation entries implicitly unless they are in the relevant filtered result set; they remain individually selectable.

## 5. Live deck synchronization

- The Table view always shows the **currently active deck**, never a stale snapshot.
- Prefer **automatic reactive updates**, reusing the existing deck store/state and mutation notifications. A manual refresh button must not be needed for ordinary deck changes.
- Reflect additions, edits, removals, spell resolution changes, language changes, and Deck-view reordering immediately as appropriate to the active filters and sort. Newly added/edited entries appear only if they match the current filters.
- Recompute matching counts, sort order, derived filter choices, and valid page bounds after data changes; retain filters and valid selections.
- A user action must execute against the current deck state, not against an obsolete rendered row or cached index. Revalidate entry identities when applying bulk mutations.
- Follow the application's existing persistence, dirty-state, concurrency, and save/load mechanisms. Do not add a separate mutable copy of the deck for the table.
- If implementation inspection reveals a genuine limitation to reactive updates, document it before choosing a refresh mechanism; do not silently degrade to stale data.

## 6. Bulk removal

- Provide **Remove selected** in the Table toolbar, available on desktop and mobile.
- Remove all currently selected valid entries, including selected entries hidden by pagination or filters; the action is based on the **total selected set**, not only currently matching entries.
- Show a confirmation dialog with the exact number of entries that would be removed, and explicitly disclose when selected entries are outside the current filters or page. Offer Cancel and a clearly labeled destructive confirmation action.
- Revalidate against the latest deck before committing. If the number of valid entries has changed, update the confirmation rather than silently removing a different set.
- Execute removal as **one logical deck mutation** through existing mutation/persistence mechanisms; preserve relative order of remaining entries.
- Clear selection of removed entries after success. On failure, keep selection and show actionable feedback.
- Respect current active-deck dirty-state rules. Do not modify any saved deck snapshot until the user explicitly saves the active deck.
- Add undo only if a suitable existing undo/transaction mechanism makes it straightforward and safe; confirmation is sufficient for the first implementation.

## 7. Separate printing workflows

### 7.1 Card printing — unchanged

- Retain the existing Deck **Print cards** functionality, layout, fit modes, continuation-card handling, preview, and default persisted-deck order.
- Table filters, table selections, and table sorting must **not** affect card printing.
- Do not add a global "Print in table order" option to card printing. Keep card and table printing as clearly distinct commands.

### 7.2 Table printing — new

- Provide a dedicated **Print table** action **only in Table view**, with its own print preview and settings. This prints a **tabular document**, not spell cards.
- **WYSIWYG scope:** Print all entries **matching the active table filters**, in the **active table sort order** (or current deck order when no sort is applied), **across every pagination page**. Pagination affects screen browsing only and must never silently omit matching entries from the printout.
- Print the **currently enabled data columns** in their displayed order, excluding interactive-only **Select** and **Actions** columns. This is the explicit exception to WYSIWYG because checkboxes and buttons are not useful in print.
- The full table printout must include complete data values for included columns, not the screen's ellipses or clipped/truncated snippets. In particular, when **Description** is enabled, print its full text with line wrapping; the result may require many pages.
- Reflect current translations and fallback values in print consistently with the visible table.
- Print preview must clearly state the effective filters, sort order, total printable row count, orientation, page size, and included columns. The user should see page breaks and the actual expected layout before printing.
- Provide **Portrait / Landscape** orientation controls, defaulting to whichever yields the more readable fit for the chosen columns (or to the application's established print default if there is one). Use the existing supported paper sizes and print margins; do not hard-code a single region's paper size.
- Fit **all included columns within the printable width of each page**; do **not** split columns across horizontal pages, clip data, or silently omit columns. Calculate widths dynamically based on headings and cell data, balancing minimum readable widths with wrapping rather than allowing a few long cells to dominate.
- Start at a readable default print size (preferably around **8–10 pt**, adapted to existing print typography). Reduce font size only as necessary, with **6 pt as the hard minimum**. Prefer wrapping and additional vertical pages over reducing below 6 pt.
- Wrap long cell contents onto multiple lines. Allow rows to grow vertically. Repeat table headers on each printed page; avoid splitting rows across pages where practicable, but permit clearly continued rows for unusually long descriptions that cannot fit on one page.
- Account for headers, margins, borders, and other print elements when sizing columns. Maintain visible row/column associations, good contrast, and legible line spacing.
- **Feasibility safeguard:** If the requested paper/orientation/column combination cannot be rendered without clipping or going below 6 pt, show an explicit preview warning and ask the user to change orientation, paper size, or visible columns. Do not pretend the layout can always fit automatically. Provide an easy route back to column visibility settings.
- A browser or operating-system print dialog may offer its own scaling/orientation settings; generate a correct, deterministic in-app print preview and print CSS/document, while documenting any limits imposed by the browser.
- Table printing is read-only. It must not modify active-deck contents, saved snapshots, table selection, or persisted/exported deck order.
- If no rows match the filters, disable Print table with an explanation rather than producing a misleading blank output.

## 8. Preference persistence and integration

- Store presentation settings separately from deck/spell data, using the application's established local or session persistence strategy after inspecting existing patterns.
- Persist at least the Cards/Table preference, column visibility, full-table versus compact mobile preference (if user-selectable), page size, and chosen filter/sort settings where consistent with existing UX conventions.
- Do not persist row selection as a durable preference across reloads by default; selection is transient and should start empty in a new session/reload unless a strong existing convention justifies otherwise.
- On reload, restore valid preferences and reconcile them with the active deck and language; unknown/obsolete saved settings should be ignored or migrated safely.
- Saved deck snapshots and deck imports/exports must not contain table UI preferences, selection state, filtered ordering, or temporary print order.
- Existing save/load, import/export, spell editing, removal, fit mode, deck reordering, card preview, and card printing must continue to work.
- Reuse existing localization mechanisms for all newly introduced labels, accessible descriptions, print settings, warnings, and confirmation messages.

## 9. Accessibility and interaction

- Use semantic HTML table elements for the full data table, with column headers and programmatically exposed sort state. Give selection controls accessible names that identify the spell/entry.
- Ensure all controls work by keyboard and touch, including filters, multi-selects, dialogs, pagination, view switching, column visibility, and row actions.
- Give icon-only actions text labels for assistive technology. Announce changes in matching count, selection count, loading/error states, and relevant print-preview warnings without excessive screen-reader noise.
- Support an indeterminate select-all state and clearly describe whether the action affects all filtered entries or the whole deck.
- Avoid hover-only access to full text, hidden actions, or horizontal-scroll discovery. Manage focus when opening/closing details, confirmation dialogs, and print preview.
- Test mobile layouts, high zoom/text scaling, and both keyboard and screen-reader navigation.

## 10. Testing and acceptance criteria

Add focused tests for:

1. Cards/Table switching without data mutation or deck-order changes, including mobile navigation.
2. Main-workspace table layout, responsive compact rows, Full table horizontal scrolling, and column visibility.
3. Localized names, fallbacks, unresolved spell references, missing values, and long descriptions.
4. Each filter, AND/OR combination rules, language changes, reset behavior, live filtering, and empty results.
5. Stable sorting, default deck order, reordering in the existing Deck view, and paging after data changes.
6. Select all across *all filtered pages*, partial/indeterminate state, selected entries outside the current filter, global Clear selection, and selection reconciliation.
7. Bulk removal of visible and hidden selected entries, confirmation-count changes under concurrent edits, one logical mutation, dirty-state behavior, and snapshot preservation.
8. Automatic synchronization after active-deck load/replace, add/edit/remove, external state changes, and active-deck switching.
9. Card printing remaining unaffected by table sorting/filtering/selection.
10. Table-print preview and output matching filtered/sorted results across all screen pages; exclusion of interactive-only columns; enabled column order; localized content; full descriptions; portrait/landscape; dynamic widths; line wrapping; repeating headers; long-row pagination; minimum 6 pt; and impossible-fit warnings.
11. Preference restoration without mixing it into saved/exported deck data; transient selections not surviving a fresh reload by default.
12. Accessibility of table semantics, controls, dialogs, focus, and responsive presentation.

### Definition of done

- The table always represents the current active deck and never mutates deck data through display-only interactions.
- A user can find, filter, sort, select, remove, and inspect spells on desktop and mobile.
- Select-all and bulk-remove scope is clear and consistent across filters and pagination.
- Card printing is unchanged; Table printing independently prints the entire filtered/sorted result set with all selected print-data columns across pages and an accurate preview.
- No data or columns are silently lost to print overflow; the 6 pt floor and explicit infeasible-layout warning are honored.
- Existing functionality passes regression tests, and documentation/localization/tests are updated.

## Implementation notes requiring codebase inspection (not open product decisions)

- Verify that existing spell IDs uniquely identify each *deck entry*. If true, use them directly; otherwise distinguish duplicate deck occurrences without unnecessary model changes.
- Inspect existing store subscriptions, deck mutations, save/snapshot semantics, localization fallback rules, print/PDF/browser capabilities, and user-preference storage before choosing integration points.
- Confirm which existing row actions are meaningful in Table view and reuse them consistently; never create parallel editing or removal logic.
- Prefer existing print preview infrastructure, but separate its Table configuration/rendering from the existing card layout.
