# DeckPane Drag-and-Drop Migration

**Status** — Proposed

## 1. Goal and scope

Replace native HTML5 drag-and-drop in the DeckPane entry list with one dnd-kit React implementation across desktop and mobile. The Lucide `GripVertical` icon is currently decorative and the entire row is draggable. Make the grip the sole drag activator so users can scroll from the row body and operate existing row controls normally. See the [workspace and active-deck requirements](../MAIN-spec.md).

## 2. Interaction requirements

- Keep the existing grip icon and row layout. Make the grip a focusable button with a localized accessible name that identifies the entry, a visible focus indicator, and keyboard drag instructions and feedback. Follow the existing workspace touch-target requirements and leave the row body available for scrolling. Keep focus on the moved entry's grip after a keyboard drop or cancellation.
- Use a shared pointer sensor for mouse, touch, and pen. Require a small movement threshold for mouse and pen and a brief hold with limited movement tolerance for touch. A mouse click, pen tap, quick touch tap, or touch movement beyond the tolerance before activation leaves the deck order intact.
- Use the keyboard sensor on the same grip. Space or Enter picks up or drops an entry, Up and Down move it within the list, and Escape cancels.
- Scope any required `touch-action: none` to the grip button. A vertical swipe beginning on the row body scrolls the deck naturally. Entry selection, fit controls, repair, removal, and other row actions retain their existing interactions.
- Keep **Move up** and **Move down** available with their existing accessible labels and behavior.
- During a pointer drag, holding near the top or bottom edge scrolls the deck's active vertical scroll region and lets the user drop on newly revealed rows. Use the entry list in the standard layout and the existing whole-pane scroller at short viewport heights. Stop auto-scrolling when the pointer leaves the edge zone or the drag ends. Keyboard reordering keeps the current drop position in view.

## 3. Implementation requirements

1. Install with `pnpm add @dnd-kit/react` and update the manifest and lockfile. Use the supported `DragDropProvider` and `useSortable` APIs, with one provider scoped to the DeckPane entry list. Use the supported sensor and auto-scroll features. Keep the React package as the only new direct dependency unless the installed version requires an additional package for a necessary public API. [React quickstart](https://dndkit.com/react/quickstart/) · [Sensor configuration](https://dndkit.com/react/guides/sensors/) · [AutoScroller](https://dndkit.com/extend/plugins/auto-scroller/)
2. Register each row by its stable `entry.entryId` and current deck index. Connect the sortable row and grip through the hook's row and handle refs. Include unresolved entries in the same order as resolved entries. [useSortable reference](https://dndkit.com/react/hooks/use-sortable/)
3. On a valid drop at a changed position, call the existing `reorderDeckEntries(fromIndex, toIndex)` once with the original and final positions. Keep sorting previews transient. A cancelled drag, a release outside a valid drop area, an unchanged position, or a deck change that invalidates the drag leaves the existing order and persistence state intact. With optimistic sorting, confirm that an out-of-list release cannot commit an earlier preview position. [Managing sortable state](https://dndkit.com/react/guides/sortable-state-management/)
4. Preserve active-deck persistence, saved-deck snapshot and dirty-state semantics, and existing row styling. Remove the native `draggable` attribute, native drag handlers, `dragProps`, `dragIndex`, and imports used only by the old implementation. Limit changes to DeckPane reordering, associated styles and translations, dependency files, tests, and relevant product documentation. Update the [main spec](../MAIN-spec.md) with the shipped interaction contract when implementing this request.

## 4. Acceptance and verification

Add automated coverage using the existing test stack. Use browser input for the gesture cases so the tests exercise drag activation and native scrolling.

| Scenario | Expected result |
| --- | --- |
| Mouse drag from the grip, both up and down | The entry lands at the intended position. The order survives reload. A drag attempt from the row body leaves the order intact. |
| Keyboard drop and cancellation | The grip can be reached by Tab. Pick up, move, and drop commits the new position. Escape after moving restores the original order with no reorder mutation. Focus stays on the entry's grip. |
| Invalid or unchanged drop | Releasing outside the valid drop area after crossing another row, or dropping without a position change, clears drag feedback without committing a reorder. |
| Touch activation, cancellation, and row-body scroll | A row-body swipe changes the scroll position and preserves order. A quick grip tap or early movement beyond the hold tolerance leaves the order intact. Holding the grip and dragging commits the new order. A browser `pointercancel` during an active drag clears drag feedback and preserves the original order. |
| Auto-scroll in a long deck | Dragging near either vertical edge reveals off-screen entries. A drop on a newly revealed entry commits the intended order, including in the short-height scroll layout. |
| Move buttons | Both controls remain accessible and move entries through the existing path. |

Run `pnpm run check`, `pnpm run test`, `pnpm run normalize:srd`, and the affected Playwright tests through `pnpm run test:e2e`.

Verify pen input with a supported pen device or browser pointer input that reports `pointerType: "pen"`. A tap leaves the order intact and a grip drag past the movement threshold reorders the entry.

Verify on Android Chrome and iOS Safari using real devices or a real-device testing service. On each browser, check row-body scrolling, quick grip taps, intentional touch reordering, edge auto-scroll, and a cancelled or invalid drop. Reload after a successful reorder to confirm persistence. Record device, OS and browser versions, results, and any checks that could not be run. Treat desktop mobile emulation as automated coverage and record device results separately.
