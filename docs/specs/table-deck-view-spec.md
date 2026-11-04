## General requirements

- Review the relevant documentation and implementation before making changes.
- Reuse existing models, components, localization mechanisms, and workflows wherever possible.
- Preserve data integrity, accessibility, and preview/print consistency.
- Identify potential architectural conflicts before implementation and recommend reasonable alternatives.
- Avoid unnecessary complexity and premature optimization.
- Update affected specifications/documentation and add appropriate tests.

## 1. Alternative Active Deck view: Table

Introduce a **Table** view alongside the existing Cards view for the Active Deck.

Both views operate on the same underlying deck. Switching between them must not change deck contents or ordering.

### 1.1 Columns and visibility

Support the following columns:

| Column        | Behavior                                                |
| ------------- | ------------------------------------------------------- |
| Select        | Row checkbox                                            |
| Spell name    | Spell name                                              |
| Level         | Numeric level                                           |
| School        | Spell school                                            |
| Classes       | Associated classes                                      |
| Components    | Compact V/S/M indicators                                |
| Casting time  | Casting time                                            |
| Range         | Spell range                                             |
| Duration      | Duration                                                |
| Concentration | Boolean indicator                                       |
| Ritual        | Boolean indicator                                       |
| Description   | Truncated text with button to show the full description |
| Source        | SRD / Custom                                            |
| Actions       | Compact action icons, including Remove                  |

**Default visible columns:** Select, Spell name, Level, School, Components, Casting time, Concentration, and Actions.

Requirements:
- Allow users to show/hide optional columns through a column-visibility menu.
- Keep essential selection/name/action columns available.
- Use horizontal scrolling for narrow screens rather than shrinking content excessively.
- Use localized column labels and accessible controls.
- The full-description action opens an existing details dialog or an equivalent accessible dialog.

### 1.2 Search and filters

Provide a compact search/filter toolbar above the table.

Filters:
- Spell name: dynamic text search.
- School: dropdown.
- Classes: dropdown.
- Concentration: Any / Yes / No.
- Ritual: Any / Yes / No.
- Casting time: dropdown derived from distinct casting-time values in the active deck.

Combine different filter groups using AND logic, and multiple values within a group using OR.

Table filters:
- Affect only the table's displayed rows.
- Do not modify the deck, Library filters, or stored deck order.
- Work with the currently selected spell-data language.
- Handle missing references and unavailable translations without silently removing those entries from the deck.

### 1.3 Pagination, sorting, and selection

- Default page size: 10 entries.
- Support page navigation and configurable page sizes.
- Display entries in original deck order by default.
- Allow optional column sorting without changing persisted deck order.
- Retain selected entries across pages and filtering.
- The select-all checkbox selects/deselects entries on the current visible page only.
- Display the total number of selected entries.
- When active deck contents change, reconcile selection by entry ID and remove stale selections.
- Clear selections when replacing, loading, or creating a different active deck.

### 1.4 Bulk actions

Add **Remove selected** to the table action toolbar.

Requirements:
- Remove selected entries in a single deck mutation.
- Require confirmation showing the total number of affected entries.
- Include selected entries hidden by pagination or filters; explicitly communicate this in the confirmation.
- Preserve the relative order of remaining deck entries.
- Respect existing persistence, dirty-state, and concurrency mechanisms.
- Clear the removed selection after successful completion.
- Do not modify saved deck snapshots unless the user explicitly saves the active deck.

### 1.5 Printing and table ordering

Keep existing card-based printing unchanged by default.

Additionally, support an optional **Print in table order** setting when the Table view is active and a table sort is applied.

Requirements:
- Use the currently displayed table sort order for printing when enabled.
- Do not modify the stored deck order.
- Preserve correct continuation-card ordering and pagination.
- Print all printable deck entries by default, including entries hidden by table filters.
- Clearly indicate the selected print order in the print preview.
- Ensure that the temporary print order does not affect deck persistence or exported deck order.

### 1.6 Integration

- Cards and Table views must always reflect the same active deck.
- Existing save/load, import/export, editing, removal, fit mode, and print functionality must remain available.
- Show unresolved spell references and missing translations as distinct, non-destructive placeholder rows.
- Keep table display settings separate from persisted spell and deck data.
- Reuse existing spell-resolution and deck-mutation logic rather than introducing parallel implementations.