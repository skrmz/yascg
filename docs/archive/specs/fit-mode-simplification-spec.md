# Fit Mode Simplification — Change Request Specification

Status: Ready for implementation
Date: 2026-11-24
Scope: Deck fitting modes, deck pane UI, deck persistence, deck/backup JSON import, tests, and documentation

Authoritative product behavior after implementation: `docs/specs/MAIN-spec.md` §9 (Card Layout and Text Fitting) and §6 (Active Deck).
Implementation notes: `docs/DEVELOPMENT.md`.
User-facing help: `README.md`.

This request is intentionally limited to removing the third fit mode and exposing the remaining choice as a binary toggle. It does not change card geometry, font thresholds, pagination, truncation, or printing behavior.

## 1. Summary

The application currently stores one of three fit modes per deck entry:

- `auto` (UI: **Best fit**, default)
- `auto-shrink` (UI: **Auto-shrink**)
- `multi-card` (UI: **Multi-card**)

`auto` is already a superset of `multi-card`: it first tries a complete single card at 8.5 pt and 8 pt, and otherwise runs the same continuation pagination as `multi-card`. `multi-card` differs only by rendering body text at 8 pt instead of 8.5 pt and by skipping the single-card attempt. It does not force continuation cards; a short body still renders as one card.

The request:

1. Remove the stored `multi-card` mode from the user-facing domain model.
2. Keep exactly two stored modes: `auto` (default, automatic layout) and `auto-shrink` (force one card, shrink to 6 pt, truncate with ellipsis if required).
3. Replace the per-entry fit-mode select with one binary checkbox: **Single card only** (unchecked = automatic, checked = auto-shrink).
4. Remove the **About fit modes** disclosure section in the deck pane.
5. Migrate persisted decks and accept retired values in older JSON files without data loss.

Removing `auto` instead of `multi-card` is explicitly rejected: it would either render every card at 8 pt or force truncation risk, losing the current 8.5 pt default and the "never truncate" guarantee.

## 2. Target behavior contract

### 2.1 Stored values

`CardFitMode` becomes:

```ts
export type CardFitMode = "auto" | "auto-shrink";
```

`CARD_FIT_MODES` becomes `["auto", "auto-shrink"] as const`.

`auto` remains the default for new entries (`src/db/active-deck.ts` already uses `fitMode: "auto"`).

### 2.2 Resolution behavior (unchanged)

| Stored value | UI state | Behavior |
|---|---|---|
| `auto` | Checkbox unchecked | Try the complete body on one card at 8.5 pt, then 8 pt. If the body does not fit there, use continuation pagination at 8 pt, preserving the existing per-block 6 pt fallback. Never ellipsizes the body and never shows the truncation warning. If the 100-continuation-card limit is exceeded, report the existing blocking overflow (content after the limit is not rendered and printing is blocked); this is unchanged behavior. |
| `auto-shrink` | Checkbox checked | Exactly one card. 8.5 pt down to 6 pt in 0.5 pt steps. If the complete body still does not fit at 6 pt, truncate to the largest safe prefix plus a measured trailing ellipsis and show the on-screen truncation warning. |

The "never truncates" guarantee for `auto` means the automatic layout never uses the auto-shrink ellipsis path; it does not override the existing continuation-card limit. Do not change the overflow behavior.

Do not change any constants, measurement logic, split behavior, table handling, notes handling, or print behavior. `src/cards/fit.tsx` continues to expose `AUTO_SHRINK_STEPS`, `AUTO_SHRINK_MIN_PT`, `MULTI_CARD_FONT_PT`, and `MULTI_CARD_MIN_FONT_PT`; the constant names describe the continuation layout, not a user-selectable mode.

`computeFit` may be simplified from:

```ts
if (fitMode === "auto-shrink") return fitAutoShrink(...);
if (fitMode === "auto") {
  const full = fitFullSourceSingleCard(...);
  if (full) return full;
}
return fitMultiCard(...);
```

to the equivalent two-mode form:

```ts
if (fitMode === "auto-shrink") return fitAutoShrink(...);
const full = fitFullSourceSingleCard(...);
if (full) return full;
return fitMultiCard(...);
```

No other algorithm change is permitted.

### 2.3 UI

Each `DeckRow` gets one checkbox in place of the current `NativeSelect`:

- Visible label: English `Single card only`, German `Nur eine Karte`.
- Accessible name: English `Single card only for {{name}}`, German `Nur eine Karte für {{name}}`.
- Checked when `entry.fitMode === "auto-shrink"`.
- Unchecked when `entry.fitMode === "auto"`.
- Changing the checkbox calls `onFitMode(event.target.checked ? "auto-shrink" : "auto")`.
- The checkbox stays available for resolved, missing, and translation-unavailable rows, matching today's selector behavior.

Use the existing `Checkbox` primitive (`src/ui/Checkbox.tsx`). Do not add a new component. The existing global CSS rule `label:has(input[type="checkbox"])` provides the 44 px touch target in compact and split workspace modes.

The `<details>` block for **About fit modes** (`deck.fitHelpTitle` / `deck.fitHelp`) and its `id="deck-fit-help"` element are removed. The `aria-description={t("deck.fitHelp")}` on the fit control is also removed. No replacement help paragraph is added.

### 2.4 Truncation warning copy

The on-screen warning shown by `DetailsPane` (`details.truncated`) must no longer name Best fit or multi-card:

- English: `Description truncated to fit on one card at {{min}}pt. Switch to automatic layout to display the full description.`
- German: `Die Beschreibung wurde gekürzt, damit sie bei {{min}} pt auf eine Karte passt. Wechsle zur automatischen Anpassung, um die vollständige Beschreibung anzuzeigen.`

The generic card badge `card.truncated` ("Content truncated" / "Inhalt gekürzt") is unchanged.

The warning deliberately names the mode ("automatic layout"), not the checkbox. `DetailsPane` and the deck entries can be on different tabs in compact workspace mode, and the warning is also shown in layouts where the deck controls are not adjacent. Naming the destination mode keeps the instruction stable; the checkbox label makes the required action discoverable when the deck pane is visible. Do not change the warning to reference the checkbox.

## 3. Implementation requirements

### 3.1 Domain model — `src/domain/spells.ts`

- Remove `"multi-card"` from `CARD_FIT_MODES`.
- Keep `cardFitModeSchema` accepting exported legacy data: older deck JSON and complete backups may contain `"multi-card"`, so the schema must accept it and normalize it to `"auto"` at the boundary:

```ts
export const cardFitModeSchema = z
  .enum([...CARD_FIT_MODES, "multi-card"] as const)
  .transform((value): CardFitMode => (value === "multi-card" ? "auto" : value));
```

Add a comment stating that `"multi-card"` is a retired alias accepted only at deck-entry validation boundaries and is never emitted. The schema output type must remain `CardFitMode` (two values).

This boundary is shared by every deck-entry schema in the application:

- `src/domain/payloads.ts` (`deckExportEntrySchema`) for deck JSON import.
- `src/domain/deck.ts` (`deckEntrySchema`, `uniqueDeckEntriesSchema`, `activeDeckRecordSchema`, `savedDeckSchema`) for complete-backup validation and persisted-record schemas.
- `src/db/active-deck.ts` (`replaceDeck`) for deck JSON import writes.
- `src/db/saved-decks.ts` (`storedActiveDeckSchema` via `persisted`, `savedDeckSchema`) for active and saved-deck writes, including `loadSavedDeck`.

Legacy values are therefore normalized on every path that validates or writes a deck entry. Direct database reads that bypass these schemas are covered by the Dexie migration.

The no-retired-value guarantee for new exports is enforced by two runtime mechanisms, not by TypeScript alone:

- the Dexie `version(9)` migration rewrites existing stored records, and
- every deck-entry validation and write path normalizes through `cardFitModeSchema`.

The two-value TypeScript type additionally prevents new application code from constructing a retired value. `buildDeckPayload` and `exportCompleteBackup` serialize persisted records directly, so they rely on those mechanisms.

### 3.2 Deck row UI — `src/components/deck/DeckPane.tsx`

- Remove `deck.fitHelpTitle` / `deck.fitHelp` and the `<details>` block inside `#deck-entries-container`.
- In `DeckRow`, replace the `NativeSelect` (`fit-mode-${entry.entryId}`) with a `Checkbox` (import it from `@/ui/Checkbox.tsx`):

```tsx
<Checkbox
  id={`one-card-${entry.entryId}`}
  label={<span className="text-xs">{t("deck.oneCard")}</span>}
  aria-label={t("deck.oneCardAria", { name })}
  checked={entry.fitMode === "auto-shrink"}
  onChange={(event) => onFitMode(event.target.checked ? "auto-shrink" : "auto")}
/>
```

- Remove the fixed `11rem`/`w-40` select column. Keep the existing responsive alignment: the checkbox occupies the former control slot, and the move/remove buttons stay in the same trailing group. Retain the narrow-screen start padding (`@min-[24rem]/deck-entries:ps-[2.625rem]`) and reset it at `@min-[36rem]/deck-entries:ps-0`. Verify no horizontal overflow with the existing workspace E2E tests.
- Keep the `NativeSelect` import; it is still used for card design, background, and repair.

Accessibility: the visible label text must remain a substring of the `aria-label` so the visible label is contained in the accessible name (WCAG 2.5.3). `Single card only` / `Single card only for {{name}}` and `Nur eine Karte` / `Nur eine Karte für {{name}}` satisfy this.

### 3.3 Locales — `src/locales/en.ts`, `src/locales/de.ts`

Remove these `deck` keys:

- `fitModeAria`
- `fitHelpTitle`
- `fitHelp`
- `bestFit`
- `autoShrink`
- `multiCard`

Add:

```ts
// en
oneCard: "Single card only",
oneCardAria: "Single card only for {{name}}",
```

```ts
// de
oneCard: "Nur eine Karte",
oneCardAria: "Nur eine Karte für {{name}}",
```

Update `details.truncated` to the copy in §2.4.

Review the in-app About section in both locale files as required by `AGENTS.md`. No About rewording is expected because the About text does not describe fit modes, but confirm this during implementation.

### 3.4 Storage migration — `src/db/database.ts`

Add a new Dexie `version(9)` migration. Versions 7 and 8 already exist, so the new version number must be 9.

Requirements:

- Rewrite every stored `multi-card` entry to `auto` in the active deck, the active baseline entries, and all saved deck snapshots.
- Read and write `collectionActiveDeck` and `collectionSavedDecks` inside the upgrade. Version 6 moved deck data into these stores; the deprecated alias stores (`activeDeck`, `savedDecks`) are guarded placeholders and must not be used.
- Bump `activeDeck.revision` by one when an active entry or baseline entry changed, matching the existing `version(5)` pattern.
- Do not bump saved deck revisions.
- Leave `baseline.savedRevision` untouched; migrating the saved snapshot and baseline together preserves association validity.
- Declare the version schema as `{ ...COLLECTION_STORES, personalBackgrounds: "id" }`, matching the effective version 8 schema. Do not pass `DECK_STORES`: since version 7, the deprecated alias stores (`customSpells`, `savedDecks`, `activeDeck`, `srdSpellOverrides`) use `collectionWriteGuard` indexes, and re-declaring `DECK_STORES` would revert them.
- Follow the existing transaction/table patterns in the file. Use a string comparison such as `(entry.fitMode as string) === "multi-card"` so it compiles after the type is narrowed.

Skeleton:

```ts
this.version(9)
  // Do not use DECK_STORES here: since version 7 the legacy alias stores
  // (customSpells, savedDecks, activeDeck, srdSpellOverrides) use
  // collectionWriteGuard indexes. Re-declaring DECK_STORES would revert them.
  .stores({ ...COLLECTION_STORES, personalBackgrounds: "id" })
  .upgrade(async (tx) => {
    // Version 6 moved deck data into the collection stores; the legacy alias
    // stores are guarded placeholders and must not be read or written here.
    const activeTable = tx.table("collectionActiveDeck") as Table<ActiveDeckRecord, string>;
    const savedTable = tx.table("collectionSavedDecks") as Table<SavedDeck, string>;

    // "multi-card" was retired; automatic fitting already paginates when needed.
    const normalize = (entries: DeckEntry[]): DeckEntry[] =>
      entries.map((entry) =>
        (entry.fitMode as string) === "multi-card"
          ? { ...entry, fitMode: "auto" as const }
          : entry,
      );

    for (const deck of await activeTable.toArray()) {
      const entries = normalize(deck.entries);
      const storedBaseline = deck.baseline;
      const baseline =
        storedBaseline === null
          ? null
          : { ...storedBaseline, entries: normalize(storedBaseline.entries) };
      const changed =
        entries.some((entry, index) => entry !== deck.entries[index]) ||
        (storedBaseline !== null &&
          baseline !== null &&
          baseline.entries.some((entry, index) => entry !== storedBaseline.entries[index]));
      if (changed) {
        await activeTable.put({ ...deck, entries, baseline, revision: deck.revision + 1 });
      }
    }
    for (const deck of await savedTable.toArray()) {
      const entries = normalize(deck.entries);
      if (entries.some((entry, index) => entry !== deck.entries[index])) {
        await savedTable.put({ ...deck, entries });
      }
    }
  });
```

### 3.4.1 Dirty state

Dirty state is derived, not stored: `isDeckDirty` (`src/domain/deck.ts`) compares the active name and ordered entries against the baseline. The migration normalizes active entries and baseline entries in the same transaction, so:

- A clean deck whose active and baseline copies both contain the same retired values stays clean.
- A deck whose only active/baseline difference was the retired mode becomes clean, because the retired difference no longer exists. This is intended: the unsaved change was the removed mode itself.
- Any remaining name or entry difference keeps the deck dirty.
- An unassociated working deck (`baseline === null`) keeps its existing dirty/empty rule; normalizing its entries does not make it clean.

Do not add a separate dirty flag or attempt to preserve a dirty marker for a difference that the migration removes. Verify the relevant outcomes: all copies retired → still clean; retired mode is the only difference → clean; another difference alongside retired values → still dirty.

### 3.5 Legacy-value boundary

With the `cardFitModeSchema` transform from §3.1, older deck exports and complete backups containing `"multi-card"` import successfully and resolve to `"auto"`. The same schema also normalizes active and saved-deck writes through `persisted`/`savedDeckSchema`. No write path can persist a retired value, and existing reads are covered by the Dexie migration.

This is a deliberate, documented exception to the previous "no historical shape migration" rule:

- Unknown values such as `"squish"` must still be rejected.
- New exports must never contain `"multi-card"`.
- Update `docs/specs/MAIN-spec.md` §8.2 accordingly.
- Do not create a separate legacy schema; one shared boundary is sufficient and avoids divergent validation.

No schema version bump is introduced; the deck JSON format remains unversioned.

## 4. Tests

### 4.1 Unit and component tests

`src/cards/fit.test.ts`

- Rename the `multi-card pagination` describe block to `continuation pagination`.
- Move pagination tests from `"multi-card"` to `"auto"` (`longBody`/`charBudget` fixtures already make the full-body single-card attempt fail, so behavior is unchanged).
- The test "does not reserve pagination space for a single multi-card page" cannot use an always-true measure with `auto`, because `auto` short-circuits at the single-card stage. In `computeFit`, `fitFullSourceSingleCard` calls the measure with three arguments, so a recording test receives `cardCount === undefined`; `fitMultiCard`'s first pagination pass passes `cardCount === 1`. Use `return cardCount === 1;` so the full-body attempts are rejected and the continuation first page is accepted. Assert one page and no call with `cardCount === 2`. Rename it to describe a continuation entry that fits one card.
- Keep all content-preservation, heading-orphan, list-splitting, overflow-limit, and pagination-line assertions.
- Update the `AUTO_MIN_FONT_PT` comment in `src/cards/fit.tsx` from "Best fit paginates" to automatic-fitting wording.

`src/components/deck/DeckPane.test.tsx`

- Replace the fit-mode-selector test with a checkbox test:
  - No `combobox` / select with the old name exists.
  - `About fit modes` is not rendered.
  - Unchecked `auto` entry: clicking calls `setDeckEntryFitMode("e1", "auto-shrink")`.
  - Checked `auto-shrink` entry: clicking calls `setDeckEntryFitMode("e1", "auto")`.
  - Accessible name includes the spell name.
  - A `missing` entry still renders the checkbox; its accessible name uses `referenceName`, and toggling calls the callback. Translation-unavailable rows share the same unconditional rendering path; no separate test is required.
- Keep existing `auto-shrink`/`auto` fixtures; only the control assertion changes.
- No new persistence test is required: `setDeckEntryFitMode`/`runDeckMutation` are unchanged, and the auto-shrink E2E test applies the resulting layout. A reload assertion would duplicate unchanged infrastructure.

`src/components/details/DetailsPane.test.tsx`

- Update the expected truncation warning string and the test description to reference automatic layout, not Best fit or multi-card.

`src/locales/messages.test.ts`

- Replace `deck.fitModeAria` with `deck.oneCardAria` in the interpolation tests; expected English text becomes `Single card only for Feuerball`.

`src/io/import-deck.test.ts`

- Replace `"multi-card"` fixtures with valid two-mode values in the round-trip test.
- Keep the invalid-mode rejection test (`"squish"`).
- Add a test that an older payload containing `"multi-card"` imports successfully and produces `"auto"` in the plan.
- In that same test, pass the normalized plan entries through `buildDeckPayload` (or `deckEntryToExport`) and assert the serialized `fitMode` values contain only `auto` and `auto-shrink`. This verifies the export boundary on runtime data rather than relying on types.

`src/io/complete-backup.test.ts`

- Replace the `"multi-card"` fixture with `"auto"` where the test is not about legacy normalization.
- Add or extend a test proving a complete backup containing `"multi-card"` validates, restores as `"auto"`, and that the restored collection contains only two-mode values. `exportCompleteBackup` serializes persisted collection records, so this restore assertion also covers the export input; no download-level test is required.

`src/db/db.test.ts`

Add migration tests next to "promotes legacy auto-shrink entries to automatic fitting" covering the distinct revision/write risks:

1. **Active + baseline + saved snapshot:** store `multi-card` in active entries, baseline entries, and a saved snapshot of a legacy database, alongside `auto` entries. Do not use `auto-shrink` in a v1 fixture to assert v9 no-op behavior: the existing `version(5)` migration promotes it to `auto`. Assert active, baseline, and saved entries become `auto`; existing `auto` values are unchanged; entry order, `entryId`, names, `savedRevision`, and saved-deck `revision`/`updatedAt` are unchanged; the active revision increments by one; `baseline.savedRevision` still matches the saved snapshot revision.
2. **Saved snapshot only:** active entries already use `auto` and a saved snapshot contains `multi-card`. Assert the snapshot is rewritten, the active revision is unchanged, and the baseline association remains valid.
3. **No retired values:** open a legacy database whose decks contain only `auto` values and assert no active or saved record was rewritten (revision and `updatedAt` unchanged).
4. **Dirty state:** assert that a deck whose only active/baseline difference is the retired mode becomes clean after migration, while a deck with a remaining name or entry difference stays dirty. Assert an unassociated working deck with a retired value remains not clean under the existing `baseline === null` rule.

Do not duplicate the existing `version(5)` auto-shrink test; keep it unchanged.

Legacy fixtures cannot use `"multi-card"` as a `CardFitMode` after the type change. Store the raw legacy value with a narrow cast (for example `fitMode: "multi-card" as unknown as CardFitMode`) in the database fixture, mirroring how a pre-migration record existed on disk.

### 4.2 E2E tests

`e2e/continuation-cards.spec.ts`

- Change the `addWunsch` helper to return the checkbox: `deck.getByRole("checkbox", { name: "Nur eine Karte für Wunsch" })`.
- Default test: assert `not.toBeChecked()` and keep the automatic pagination assertions.
- Auto-shrink test: `await oneCard.check()`, assert checked, one card at 6 pt, ellipsis, and the new German warning text (`Wechsle zur automatischen Anpassung …`).
- Convert the two `"multi-card"` tests to the default automatic layout: remove `selectOption` and mode-value assertions, keep the multi-card row layout and full-description assertions, and rename them to describe continuation cards under automatic fitting.

`e2e/card-designs.spec.ts`

- Remove `selectOption("multi-card")` in the Compact long-spell test; the default `auto` layout already paginates Wunsch. Keep the pagination assertions.

`e2e/workspace.spec.ts`

- Replace the `combobox` touch-target check with the checkbox: `page.getByRole("checkbox", { name: "Single card only for Fireball" })`.
- Measure the wrapping label for the 44 px target (`checkbox.locator("xpath=..")` or an equivalent `label:has(...)` locator), because the global CSS sizes the label, not the native input.

`e2e/i18n-cards.spec.ts`

- Update the explanatory comment from "Best fit" to automatic fitting. No behavior change.

Leave `e2e/complete-backup.spec.ts` and `e2e/table-deck.spec.ts` fixtures using `fitMode: "auto"` unchanged.

## 5. Documentation updates

| File | Required change |
|---|---|
| `docs/specs/MAIN-spec.md` §1 summary (line ~39) | Replace "automatic fitting with auto-shrink or continuation cards" with wording that describes automatic fitting plus an optional single-card shrink. |
| `docs/specs/MAIN-spec.md` type block (line ~133) | `CardFitMode = "auto" \| "auto-shrink"`. |
| `docs/specs/MAIN-spec.md` §6 deck UI (lines ~513–514) | Replace the three-mode selector description with the binary **Single card only** toggle: off = automatic, on = auto-shrink. |
| `docs/specs/MAIN-spec.md` §8.2 (lines ~727–732) | State that `auto` and `auto-shrink` are accepted, the retired `multi-card` alias is accepted and normalized to `auto`, and unknown values are rejected. |
| `docs/specs/MAIN-spec.md` §9 (lines ~879–901) | Rename **Best fit** to **Automatic** (stored `auto`) and remove the standalone **Multi-card** mode. Keep all pagination, continuation, table, notes, and 100-card-limit requirements, describing them as the automatic layout's continuation behavior. Update the warning sentence to "switching to the automatic layout preserves the full description" and remove "multi-card never truncates" / "Best fit or multi-card" wording. |
| `docs/specs/MAIN-spec.md` §9 continuation paragraph (lines ~903–921) | Retitle **Multi-card** to **Continuation cards (automatic mode)** and replace "multi-card mode" with "continuation pagination" throughout. |
| `docs/specs/MAIN-spec.md` test wording (line ~934) and verification matrix (lines ~1129–1130) | Rename Best fit/Multi-card rows to Automatic and continuation pagination; keep P1/P2 coverage intent. |
| `README.md` feature bullet (lines ~17–19) | Describe the automatic layout (one card at 8 pt or larger when it fits, otherwise continuation cards) and the optional forced single card shrinking to 6 pt. Remove "forced auto-shrink/multi-card". |
| `README.md` usage paragraph (lines ~64–67) | Describe the default automatic layout and the **Single card only** toggle; remove **Best fit**, **Auto-shrink**, and **Multi-card** mode names. |
| `README.md` printing text (line ~169) | Replace "multi-card spell" with "a spell with continuation cards". |
| `docs/DEVELOPMENT.md` `src/cards/` bullet (lines ~146–148) | Rename best-fit/multi-card wording to automatic fitting and continuation pagination. |
| `docs/DEVELOPMENT.md` persistence section (lines ~257–259) | Add `version(9)` after the existing `version(5)` note: retires `multi-card` by rewriting active, baseline, and saved-snapshot entries to `auto` and bumping the active revision when the active deck changed. Keep the `version(5)` history unchanged. |
| `docs/DEVELOPMENT.md` cards section (lines ~399–404) | Update the fitting description and rename "Compact multi-card fitting" to "Compact continuation fitting". |

Do not edit `docs/archive/`.

## 6. Acceptance criteria

1. `CardFitMode` and `CARD_FIT_MODES` contain only `auto` and `auto-shrink`; application code emits only these values.
2. No deck row renders a fit-mode select or the **About fit modes** disclosure; each row renders one **Single card only** checkbox with a spell-specific accessible name.
3. Unchecked means `auto`; checked means `auto-shrink`; toggling persists through the existing `setDeckEntryFitMode` path and marks the deck dirty.
4. Automatic fitting still produces one card at 8.5/8 pt when the body fits, otherwise continuation pages at 8 pt using the unchanged continuation behavior, including the per-block 6 pt fallback and the existing 100-card blocking overflow. Auto-shrink still produces one card with 6 pt minimum and a measured ellipsis only when the complete body does not fit at 6 pt.
5. The truncation warning points only to the automatic layout.
6. Opening an existing database rewrites `multi-card` entries to `auto` in the active deck, baseline, and saved snapshots, with the revision rules in §3.4.
7. Importing an older deck JSON or complete backup containing `multi-card` succeeds and normalizes to `auto`; `"squish"` and other unknown values are still rejected.
8. No user-facing English or German text uses the retired selectable mode names **Best fit**, **Auto-shrink**, or **Multi-card**. Descriptive wording such as "continuation cards" and internal identifiers such as `MULTI_CARD_FONT_PT` are permitted.
9. All mandatory verification in §7 passes. Recommended and optional checks are not merge gates.

## 7. Verification

Mandatory for acceptance (matches the project policy for behavior changes): run from the repository root on Windows PowerShell:

```powershell
pnpm run check
pnpm run test
pnpm exec playwright test e2e/continuation-cards.spec.ts e2e/card-designs.spec.ts e2e/workspace.spec.ts e2e/i18n-cards.spec.ts
```

Recommended because the deck row layout and touch targets change, but not a merge gate:

```powershell
pnpm run test:e2e
```

Optional confirmation of static-hosting impact:

```powershell
pnpm run build
```

No deployment or Cloudflare configuration change is required. Do not edit `dist/`, `.wrangler/`, or `wrangler.jsonc`.

Final residue check:

```powershell
rg -n "multi-card|multiCard|Mehrere Karten|Mehrkarten|Best fit|bestFit|Beste Anpassung|fitHelp" src e2e docs/specs/MAIN-spec.md README.md docs/DEVELOPMENT.md
```

Intentional remaining hits are limited to the `cardFitModeSchema` legacy alias, the database migration, migration/legacy tests and fixtures, and the historical migration note in `docs/DEVELOPMENT.md`. Descriptive continuation-layout wording and internal constants are not retired mode references. The command intentionally does not search `docs/archive/` or `docs/specs/requests/`.

## 8. Out of scope

- Changing the 8.5/8/6 pt thresholds or any fitting, pagination, truncation, table, or notes algorithm.
- Renaming internal constants such as `MULTI_CARD_FONT_PT` or `fitMultiCard`.
- Changing print layout, sheet geometry, card designs, backgrounds, or the printing dialog.
- Adding a replacement help paragraph or tooltip for fit modes.
- Changing the deck storage schema or introducing a JSON format version.
- Any backend, worker, deployment, or dependency change.

## 9. Risks and notes

- Users who explicitly stored `multi-card` keep their decks and entries but lose the explicit 8 pt cap. Their spells that fit one card at 8.5 pt will render at 8.5 pt; everything that needs continuation renders identically. This is the intended simplification and involves no content loss.
- The migration can turn a deck clean when the only active/baseline difference was the retired mode. This is intended because the difference no longer exists; all other differences remain dirty.
- "Automatic never truncates" refers to the ellipsis path only. Exceeding the existing 100-card continuation limit still reports blocking overflow and blocks printing; do not change that behavior.
- Older exported decks and complete backups are the main compatibility risk; the shared schema alias in §3.1 and the migration cover both. The no-retired-value export guarantee comes from those runtime paths plus the two-value type, not from TypeScript alone.
- The pagination unit tests need deliberate adaptation, not a blind `"multi-card"` → `"auto"` replacement: the single-card attempt omits `cardCount`, while the continuation first pass passes `1`. Preserve the continuation-path coverage as described in §4.1.
- The checkbox relies on the existing global touch-target CSS for labels; do not add a custom min-size that would break the workspace touch-target tests.
