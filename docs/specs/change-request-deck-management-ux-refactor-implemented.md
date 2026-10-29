# Deck Management UX Refactor — Implementation Handoff

**Status:** Implemented and verified  
**Source request:** [`change-request-deck-management-ux-refactor.md`](./change-request-deck-management-ux-refactor.md)  
**Implementation plan:** `.kilo/plans/1793304604176-deck-management-ux-refactor.md`

## Summary

Replaced the permanent Load/Overwrite/Rename deck controls with **Save / Save As… / Open… / New deck / Clear entries**. Deck and custom-spell JSON import/export are now separate dialogs; custom-spell tools live in the Library pane. The refactor adds association-based saves, saved-snapshot revision CAS, a Dexie v4 migration, inline rename validation, and four-state deck status.

No wire-format, backend, or Cloudflare behavior changed. Deck JSON remains `1.0.0`; custom-spell JSON remains `1.1.0`.

## Implemented behavior

### Deck status
- Four user-visible states: **Saved**, **Unsaved changes**, **Not saved as a deck**, **New deck**.
- Inconsistent persisted states (associated with no baseline/token, unassociated with a baseline) are treated as invalid and block Save.
- Active decks are always persisted locally; “unsaved” describes the named snapshot only.

### Save
- Enabled only when dirty and the association is valid.
- Associated decks update **only** the linked saved snapshot, CAS-checking active revision plus `baseline.savedRevision`.
- Unassociated dirty decks open Save As.
- Clean decks are a no-op: no write, revision bump, or success toast.
- Missing/stale saved snapshots show a local conflict dialog offering **Save As…** or **Open…**.
- Active-deck CAS conflicts continue to use the global cross-tab conflict dialog.

### Save As
- Always creates a new saved-deck ID at saved revision `1`.
- Available from the actions menu even for clean/blank decks; first-time Save reuses it.
- Requires a trimmed 1–120 character name; duplicate names are allowed.
- Applies the chosen name to both the new snapshot and active deck and binds baseline/association atomically.

### Inline rename
- Enter/blur commit; Escape cancels and suppresses the following blur commit.
- Associated decks: blank/whitespace/overlong drafts revert with inline feedback and no write.
- Unassociated decks: blank commits as `""`; overlong drafts revert.
- Unchanged normalized names are no-ops.
- Drafts are tied to the active revision at edit start. Stale edits after Open/import/New deck/other-tab writes are rejected with a stale message, not committed or globally retried.
- Pending edits are flushed once before Save/Save As/Open/New deck/import/Clear, including pointer-down on a disabled Save while clean.

### Open
- Lists saved snapshots by name and `updatedAt`; duplicate names gain a shortened ID.
- Per-row Open and Delete.
- Dirty active decks require **Replace active deck** confirmation, including reopening the currently associated snapshot.
- Identical clean snapshots are a no-op; externally changed saved revisions refresh the active deck.
- Deleting the associated snapshot clears `savedDeckId` (property omitted), sets `baseline: null`, and advances active revision. Other snapshots leave active content untouched.
- Delete CAS-checks both active and saved revisions.

### New deck / Clear entries
- **New deck** blanks name/entries, omits `savedDeckId`, nulls baseline, keeps saved snapshots, and advances revision only on a real change. Dirty content requires confirmation; already-blank is a silent no-op.
- **Clear entries** keeps name/association/baseline and only clears entries. Disabled when already empty. Nonempty clear requires confirmation.

### Import/export
- `ImportExportDialog` was removed and split into:
  - `DeckImportExportDialog` — deck actions menu, active-deck export, validated replacement import.
  - `CustomSpellImportExportDialog` — Library pane beside **Create custom spell**.
- Both retain per-dialog file selection, analysis, pending-review discard protection, errors, and success feedback.
- Deck import adopts the imported name (including legitimate empty `""`), clears association/baseline, advances revision, and never touches named snapshots.
- Deck exports explicitly state they are not custom-spell/SRD-override backups.
- Custom import collision strategies, overrides, lossy/unknown-version handling, and atomic commits are unchanged.

## Code changes by area

| Area | Changes |
| --- | --- |
| `src/domain/deck.ts` | `DeckBaseline.savedRevision`, `DECK_NAME_MAX_LENGTH`, `DeckStatus`, `getDeckStatus`, `normalizeDeckName`, `isValidDeckName`; saved revisions tightened to positive. |
| `src/db/active-deck.ts` | Name trimming without silent slicing; overlong names rejected; `clearEntries` no-op when empty; `DeckSnapshot`/`withBaseline` carry saved revision; `replaceDeck` preserves it. |
| `src/db/saved-decks.ts` | Rewritten around `saveNewDeck`, `saveAssociatedDeck`, `loadSavedDeck`, `deleteSavedDeck`, `newActiveDeck`, `renameActiveDeck`; added `InvalidDeckStateError`; CAS active + saved revisions. |
| `src/db/database.ts` | Dexie `version(4)`: saved revisions below `1` become `1`; baseline `savedRevision` only set when legacy baseline content matches the associated snapshot. No active revision bump for metadata-only migration. |
| `src/state/AppProvider.tsx` | Consolidated dirty logic; added `deckStatus`, `deckBusy`, Save/Open/Delete/New/Import/rename actions with typed outcomes; removed `replaceActiveDeck`, `overwriteDeck`, `loadSaved`, `deleteSaved`, `renameDeck`. |
| `src/components/deck/DeckPane.tsx` | New header/action layout, inline name editor, status copy, pending-edit flushing, actions menu, Save conflict/New/Clear/repair dialogs; keyboard reorder controls retained. |
| `src/components/deck/SaveAsDialog.tsx` | New focused Save As dialog with validation and provider commit. |
| `src/components/deck/OpenDeckDialog.tsx` | New saved-snapshot list with Open/Delete, duplicate disambiguation, dirty confirmation, and CAS-aware deletion. |
| `src/components/import-export/` | New `shared.tsx`, `DeckImportExportDialog.tsx`, `CustomSpellImportExportDialog.tsx`; old combined dialog and test deleted. |
| `src/components/library/LibraryPane.tsx` | Added **Custom spell import/export** trigger and dialog. |
| `src/locales/en.ts`, `src/locales/de.ts` | Added deck status/actions/dialog/error copy; removed obsolete combined-dialog and legacy deck keys; EN/DE parity preserved. |
| `docs/specs/MAIN-spec.md` | Updated §4 model, §7 Save/Save As/Open/New/Clear/import/status/CAS/migration rules, acceptance criteria, and §15 test matrix. |
| `docs/DEVELOPMENT.md` | Documented Dexie v4, state/persistence contracts, UI/import-export routing, and migration behavior. |
| `README.md` | Documented local persistence vs named snapshots, actions, import/export split, and backup caveat. |
| `docs/custom-spell-import-guide.md` | Updated the custom import entry point to the Library pane. |
| `docs/specs/change-request-deck-management-ux-refactor.md` | Status marked implemented and verified. |

## Tests added/updated

- Domain: deck status matrix, name validation, saved-revision dirty behavior.
- DB: Save/Save As/Open/Delete/New/rename/no-op/stale-CAS cases; saved revision starting at `1`; migration matching, mismatching, and revision normalization; `savedDeckId` property omission.
- Import: import name/adoption and association clearing.
- Components: `DeckPane`, `SaveAsDialog`/`OpenDeckDialog` flows, deck import/export, custom-spell import/export, Library entry point.
- E2E: Save → Save As → Open → re-Save, New deck preserving snapshots, Clear entries, German import/export dialogs, and updated language-picker selectors.

## Verification

Run from the repository root:

```powershell
pnpm run check      # format + lint + typecheck
pnpm run test       # 364 tests / 32 files
pnpm run build
pnpm run test:e2e   # 31 Playwright tests
```

All passed on 2026-10-29.

## Notes for the next agent

- Do not change deck/custom JSON payload versions or validation; the refactor is internal/UI-only.
- Keep the `savedDeckId` property omitted (not `undefined`) for unassociated active decks.
- `baseline.savedRevision` is the saved-snapshot CAS token; `updatedAt` is display-only.
- Legacy associations the v4 migration cannot verify intentionally have no token and remain blocked from Save until Open/Save As.
- Unrelated pre-existing working-tree edits in `docs/cloudflare-deployment-guide.md`, `docs/specs/change-request-component-authoring-and-srd-overrides.md`, and `docs/specs/srd-source-data-refactoring.md` were left untouched.
