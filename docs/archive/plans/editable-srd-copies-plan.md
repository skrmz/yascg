# Plan: Create editable copies of SRD spells

## Goal

Add a **Create editable copy** action for an SRD spell that is present in the active deck. The
flow creates an ordinary custom-spell draft, opens it in the existing custom-spell editor, and
after the user saves and confirms, replaces only that active-deck entry with the saved custom
copy while preserving entry ID, position, and fit mode.

## Verification findings

1. **Deck identity:** the active-deck revision is monotonic and every deck switch/open/new/import
   increments it, so a captured revision identifies the state at flow start. It is not a deck
   identity token, and a retry after a conflict would otherwise read the new revision. The plan
   therefore adds a non-persisted `{ name, savedDeckId }` identity guard checked inside the
   mutation; no schema or storage change is needed.
2. **Validation scope:** `FREETEXT_AUTHORED_MAX` (120) was enforced only by `CustomSpellForm` as
   an authoring guideline. `spellSchema` has always admitted `FREETEXT_MAX` (500), and official
   SRD metadata can exceed 120. Unifying authoring to 500 matches the product's persisted
   contract and avoids a copied spell becoming unsavable when edited later.
3. **Mutation consistency:** extending `runDeckMutation` with an explicit expected revision and a
   local-conflict mode centralizes revision CAS, notifications, deck-error handling, and live
   dirty-state recalculation. Existing callers keep the same behavior via a structured outcome.
4. **Component lifecycle:** the copy flow uses a ref for the captured draft payload, keeps the
   form mounted, passes `selectOnSave={false}`, and renders the confirmation outside the
   `selectedSpell` early-return branch. The transition does not depend on callback ordering or
   on the form unmounting.
5. **Import/export semantics:** export preserves custom UUIDs. Import into an empty store keeps
   the UUID and fields. An existing UUID triggers the established Skip/Keep Both/Overwrite
   review; Keep Both assigns a new UUID. Reserved `srd-` IDs are remapped. Tests will assert
   these existing semantics rather than a fictional unconditional round-trip.
6. **Documentation wording:** schema-aware copying will be described as preserving every field
   recognized by the current `Spell` schema. Unknown fields are stripped by schema validation.

## Resolved design decisions

- **Entry point:** the Details pane header offers **Create editable copy** when the selected
  spell is `source: "SRD-5.2.1"` and has a matching entry in the active deck. Selecting a deck
  row already opens that spell in Details, so this is the "from the active deck" path without
  adding another crowded icon to every deck row.
- **No eager persistence:** clicking the action creates an in-memory custom draft with a new
  UUID. Nothing is written to IndexedDB until the editor's **Save spell** succeeds. Cancelling
  the editor leaves neither a custom copy nor a deck change.
- **Schema-aware copy:** deep-clone the source record, then explicitly replace identity fields
  (`id`, `source`, `updatedAt`), remove provenance/transient fields (`sourceLabel`,
  `overridden`), and validate through `spellSchema`. This preserves every field recognized by
  the current `Spell` schema without maintaining a hand-written property list; unknown fields
  are stripped by validation, as they are for all persisted spells.
- **Unexposed fields are preserved on later edits:** `CustomSpellForm` must save from `base`
  and only override fields it exposes. In particular, merge `components` so unexposed component
  fields such as `componentsDisplayOverride` survive, while still clearing fields the user
  explicitly clears.
- **Name and language:** preserve the source spell's name and captured text exactly. Do not add
  a translated `" (Copy)"` suffix; adding an English suffix would violate the captured-language
  requirement. The user may rename it in the editor.
- **Source identity:** the copy is an ordinary `source: "Custom"` record. Drop the transient
  `overridden` marker and the SRD `sourceLabel` so the copy is not mislabeled as SRD.
- **Validation consistency:** use the runtime `LIMITS.FREETEXT_MAX` (500 characters) for all
  custom-spell authoring, including ordinary edits of a copied SRD spell. Remove the separate
  120-character form-only limit. Verification confirms 120 was a specification authoring
  guideline enforced only by `CustomSpellForm`, while the persisted schema has always admitted
  500; official SRD metadata can exceed 120. The runtime schema remains the single source of
  truth.
- **Separate save and replacement:** saving the custom copy and replacing the deck entry are two
  operations. If saving fails, the editor remains open and no copy exists. If saving succeeds
  but replacement fails, the saved copy is preserved, the failure is explained, and the
  confirmation dialog offers recovery.
- **After-save confirmation:** confirm before replacing the deck entry. Confirming replaces the
  matching entry. Cancelling keeps the successfully saved custom copy in the library but leaves
  the active deck unchanged; state this explicitly in the dialog.
- **Deck identity and concurrency:** the active-deck revision is monotonic and every deck switch
  (`Open`, `New deck`, deck import) increments it, so a captured revision identifies the deck
  state at the start of the flow. Because it is not a deck identity token, also capture
  `{ name, savedDeckId }` and require both to match inside the revision-controlled mutation.
  This prevents a retry from targeting a different deck even if its revision and entry IDs
  happen to match. Do not add a new persistence model.
- **Mutation side effects:** extend the existing `runDeckMutation` helper with an explicit
  expected revision and a local-conflict mode, returning a structured outcome. This keeps
  revision management, dirty-state recalculation through live queries, notification publishing,
  deck-error handling, and conflict handling centralized.
- **Global copy semantics:** the copy is stored in `db.customSpells`, like any other custom
  spell. Saved decks that reference its UUID reflect later edits automatically. Existing
  custom-spell import/export backs it up and restores it with no format change.

## Implementation tasks

### 1. Add the schema-aware copy helper

In `src/db/custom-spells.ts`, add:

```ts
export function createCustomSpellCopy(source: Spell): Spell;
```

- Deep-clone the source with `structuredClone` (the project targets ES2023 and the test
  environment is Node 24).
- Delete `sourceLabel` and `overridden` from the clone.
- Override `id` with `newUuid()`, `source` with `"Custom"`, and `updatedAt` with `Date.now()`.
- Return `spellSchema.parse(...)`. Parsing validates every required field and strips unknown
  fields, so the result preserves every field recognized by the current `Spell` schema and
  never carries arbitrary unvalidated fields forward.
- Keep the helper independent of IndexedDB so it is directly unit-testable.
- Add a short comment only if the identity/provenance decisions are not evident from the code.

### 2. Make form saves preserve unexposed properties and unify validation

In `src/components/details/CustomSpellForm.tsx`:

- Add optional props:
  - `editableCopy?: boolean` (selects the copy title/description).
  - `onSaved?: (spell: Spell) => void` (called after a successful custom-spell save).
  - `selectOnSave?: boolean` (default `true`; the copy flow passes `false` so the original SRD
    spell remains selected until the user decides whether to replace the deck entry).
- Use `form.title.copy` and `form.descriptionCopy` when `editableCopy` is true. The copy
  description must explain that the text/language is captured at creation, custom copies are
  not translated on app-language changes, and saving will be followed by a deck-replacement
  confirmation.
- Build the saved candidate from `...base` so unexposed top-level fields (`subclasses`,
  `savingThrow`, `damageTypes`, etc.) survive.
- Rebuild `components` by starting from `base.components`, removing only the fields the form
  exposes, then applying draft values. This preserves `componentsDisplayOverride` and every
  other component field recognized by the current schema. Keep the existing keep-but-hide
  behavior for verbal/somatic descriptions and the existing material gating.
- Replace the 120-character `FREETEXT_AUTHORED_MAX` checks with `LIMITS.FREETEXT_MAX` in both
  the manual checks and `validationDescriptor`. Remove `FREETEXT_AUTHORED_MAX` from
  `src/domain/spells.ts` and update the explanatory comment so there is no dead or contradictory
  limit. The runtime schema remains authoritative.
- After `saveCustomSpell` succeeds: call `selectSpell(saved.id)` only when `selectOnSave` is not
  `false`; close the dialog; then call `onSaved?.(saved)`.
- Do not change SRD override behavior (`isSrd` path), duplicate/delete flows, or ordinary
  custom-spell creation behavior except for the unified free-text limit and unexposed-field
  preservation.

### 3. Add a testable active-deck replacement mutator

In `src/db/active-deck.ts`, add a pure helper next to the other mutators:

```ts
export interface DeckIdentity {
  name: string;
  savedDeckId?: string;
}

export type ReplaceEntryWithSpellResult =
  | { status: "replaced"; deck: ActiveDeckRecord }
  | { status: "deck-changed" }
  | { status: "missing" }
  | { status: "duplicate" };

export function replaceEntryWithSpell(
  current: ActiveDeckRecord,
  identity: DeckIdentity,
  entryId: string,
  sourceSpellId: string,
  target: { spellId: string; reference: { source: SpellSource; name: string } },
): ReplaceEntryWithSpellResult;
```

- First compare `current.name` and `current.savedDeckId` with `identity`; return
  `"deck-changed"` without changes when they differ.
- Find the entry by `entryId`.
- Return `"missing"` when the entry does not exist, its `spellId` no longer matches
  `sourceSpellId`, or its `reference.source` is not `"SRD-5.2.1"`.
- Return `"duplicate"` when another entry already uses `target.spellId`.
- Otherwise delegate to the existing `repairEntry`, which preserves `entryId`, position, and
  `fitMode`, and change only that entry. Return the new deck.
- This helper never touches saved decks.

### 4. Extend the existing mutation helper and add the provider action

In `src/state/AppProvider.tsx`:

- Change `runDeckMutation` to return a structured outcome instead of a bare boolean, so the new
  action can preserve all existing side effects while distinguishing local conflicts:
  - Accept `options?: { publish?: boolean; expectedRevision?: number; handleConflict?: "global"
    | "return" }`.
  - Use `options.expectedRevision` when provided; otherwise keep the current behavior of reading
    the latest revision immediately before the mutation.
  - On success, publish the active-deck notification, clear the deck error, and return
    `{ status: "ok" }`.
  - On `DeckConflictError`, call `refreshAll()`. Return
    `{ status: "conflict", actualRevision }`; set the existing global `conflict` state only when
    `handleConflict !== "return"`.
  - On other errors, set the existing deck-error descriptor and return `{ status: "error" }`.
  - Update the existing callers mechanically from `const ok = await runDeckMutation(...)` to
    the structured outcome. Dirty state still recalculates from the live active-deck query.
- Add a `DeckIdentity` capture at the flow level using the exported type from
  `src/db/active-deck.ts`.

- Export:

```ts
export type ReplaceDeckEntryWithCopyResult =
  | { status: "replaced" }
  | { status: "conflict"; actualRevision: number }
  | { status: "deck-changed" }
  | { status: "missing" }
  | { status: "duplicate" }
  | { status: "error" };
```

- Add to `AppContextValue`:

```ts
replaceDeckEntryWithCopy: (
  expectedRevision: number,
  deckIdentity: DeckIdentity,
  entryId: string,
  sourceSpellId: string,
  copy: Pick<Spell, "id" | "name" | "source">,
) => Promise<ReplaceDeckEntryWithCopyResult>;
```

- Implement through `runDeckMutation(..., { expectedRevision, handleConflict: "return" })`, not a
  new storage model:
  - Run `replaceEntryWithSpell(current, deckIdentity, entryId, sourceSpellId, target)` and return
    `current` unchanged for every non-`replaced` outcome.
  - Map the structured mutation outcome to `ReplaceDeckEntryWithCopyResult`.
  - Never touch `db.savedDecks`, `db.customSpells`, or any entry other than the matched
    `entryId`.
- Add the method to the context value and its dependency list.
- The revision check handles deck switches that happen before confirmation. The deck-identity
  check handles a retry after a revision conflict: retry keeps the original identity, so a
  different deck cannot be modified even if revision/entry IDs match. Allowing retry on the same
  deck after unrelated changes remains possible because its identity is unchanged.

### 5. Wire the Details pane flow with recovery and duplicate-submit protection

In `src/components/details/DetailsPane.tsx`:

- Reuse the existing active-deck entry lookup to know both the selected spell's fit mode and
  whether the selected SRD spell is in the active deck.
- Show a header button with the `Copy` icon labeled `details.createEditableCopy` only when
  `selectedSpell.source === "SRD-5.2.1"` and the matching entry exists. Place it with the
  existing Add/Show details/Edit controls. Do not change the existing SRD restricted-edit
  behavior.
- Keep flow state local to the pane:
  - `copyDraft: { draft: Spell; sourceSpellId: string; entryId: string; expectedRevision:
    number; deckIdentity: DeckIdentity } | null`.
  - `copyConfirmation: { copy: Spell; sourceSpellId: string; entryId: string; expectedRevision:
    number; deckIdentity: DeckIdentity; error: MessageDescriptor | null } | null`.
  - A ref mirroring the active `copyDraft` payload. `onSaved` reads the ref instead of relying
    on a closure over state that may already have been cleared by `onOpenChange(false)`.
  - `replacing` state plus a `replacingRef` guard so a double click cannot submit twice. Disable
    both dialog buttons while a replacement is in flight.
- On click, capture `activeDeck.revision` and `{ name: activeDeck.name, savedDeckId:
  activeDeck.savedDeckId }`, build `createCustomSpellCopy(selectedSpell)`, and open
  `CustomSpellForm` with:
  - `spell={copyDraft.draft}`
  - `editableCopy`
  - `selectOnSave={false}`
  - an `onSaved` handler that reads the flow ref, closes the draft state, and opens the
    confirmation state with the saved spell and captured revision/identity.
- If `saveCustomSpell` returns `null`, the form stays open and no confirmation state is created.
- Editor cancellation calls `onOpenChange(false)`; clear the draft state and ref and write
  nothing.
- Render a confirmation `Dialog`:
  - Title `details.copyReplaceTitle`.
  - Description `details.copyReplaceDescription` with the saved copy name; explain that the
    active entry's position and fit mode are preserved, the original SRD spell and saved decks
    are unchanged, and cancelling keeps the custom copy in the library.
  - Show a localized error area when `copyConfirmation.error` is set.
  - Cancel closes without a deck write. Because the copy has already been saved, select the copy
    and show `details.copySavedDeckUnchanged` so the partial success is visible.
  - Confirm calls `replaceDeckEntryWithCopy(...)` once, guarded by `replacingRef`.
  - On `"replaced"`: close, select the saved copy, and show `details.copyReplaceSuccess`.
  - On `"conflict"`: keep the dialog open, set the expected revision to `actualRevision`, show
    `details.copyReplaceConflict`, and expose **Retry**. `refreshAll` has already refreshed the
    live active deck. Retry keeps the original deck identity and re-enters the same
    single-submit path; it never writes automatically.
  - On `"deck-changed"`: keep the dialog open and show `details.copyReplaceDeckChanged`. Do not
    offer Retry, because the original deck identity no longer matches; cancel leaves the saved
    copy available in the library. The user can restart the flow against the current deck if
    they still want a replacement.
  - On `"missing"`: keep the dialog open and show `details.copyReplaceMissing` (the copy was
    saved; the deck was not changed). Offer **Retry** in case the user restores the entry.
  - On `"duplicate"`: keep the dialog open and show `details.copyReplaceDuplicate`. Offer
    **Retry** in case the user removes the conflicting entry.
  - On `"error"`: keep the dialog open and show `details.copyReplaceError`; the provider also
    sets the existing deck-error banner. Offer **Retry**.
  - Clear the error when starting a retry. Always release the busy guard in `finally`.
- Do not rely on component mounting or callback ordering for the save-to-confirmation
  transition: the form is mounted by the pane, `onSaved` uses the current flow ref, and the
  confirmation dialog is rendered outside the `selectedSpell` early-return branch so a
  temporarily missing selection cannot discard it. Keep the original SRD selected until the
  confirmation resolves (`selectOnSave={false}`).
- The recovery path is explicit: the saved copy can be retried against the same deck identity,
  or the user can cancel and use the copy through the normal library/import/export workflows.

### 6. Localization

Add matching keys to both `src/locales/en.ts` and `src/locales/de.ts` (the catalog parity test
will enforce the shape):

- `details.createEditableCopy`
- `details.copyReplaceTitle`
- `details.copyReplaceDescription` (interpolates `{{name}}`)
- `details.copyReplaceConfirm`
- `details.copyReplaceRetry`
- `details.copyReplaceSuccess`
- `details.copyReplaceConflict`
- `details.copyReplaceDeckChanged`
- `details.copyReplaceMissing`
- `details.copyReplaceDuplicate`
- `details.copyReplaceError`
- `details.copySavedDeckUnchanged`
- `form.title.copy`
- `form.descriptionCopy`

Use complete sentences rather than concatenated fragments. The copy description must clearly
state the language limitation. Failure messages must state that the custom copy was saved and
that the active deck was not changed.

### 7. Tests

- `src/db/custom-spells.test.ts` (new, or extend `db.test.ts`):
  - Copy helper creates a different UUID, sets `source: "Custom"` and a new `updatedAt`.
  - Every schema field is preserved: metadata, components (including
    `componentsDisplayOverride`), subclasses, saving throw, damage types, description, and
    higher-level text.
  - `sourceLabel` and `overridden` are absent.
- `src/db/db.test.ts`:
  - `replaceEntryWithSpell` keeps entry ID, array position, and `fitMode`; updates `spellId` and
    `reference` to `Custom`/copy name.
  - Missing entry, rebound entry, and duplicate copy ID produce no change.
  - A stale expected revision aborts through `mutateActiveDeck` with `DeckConflictError`.
  - Replacing in the active deck leaves baseline and saved decks untouched.
  - A different active deck with a different identity is rejected even if it contains a
    matching entry ID and source spell ID.
- `src/components/details/CustomSpellForm.test.tsx`:
  - `editableCopy` renders the copy title/description.
  - Saving calls `onSaved`; `selectOnSave={false}` does not call `selectSpell`.
  - Long metadata beyond 120 characters can be saved for ordinary custom spells and for copied
    spells, matching the runtime 500-character schema limit.
  - Unexposed fields (`subclasses`, `savingThrow`, `damageTypes`,
    `componentsDisplayOverride`) survive a save, including a subsequent ordinary edit of a
    copied spell.
  - Save failure (`saveCustomSpell` returns `null`) leaves the form open and does not call
    `onSaved`.
- `src/components/details/DetailsPane.test.tsx`:
  - Action hidden for custom spells and SRD spells not in the active deck.
  - Action shown for an SRD spell in the active deck.
  - Cancel in the editor calls neither `saveCustomSpell` nor the replacement action.
  - Save opens the replacement confirmation; cancelling leaves the deck action uncalled and
    retains/selects the saved copy.
  - Confirming calls `replaceDeckEntryWithCopy` with the captured expected revision, entry ID,
    source ID, and copy; success selects the copy and shows success.
  - Double-clicking Confirm submits only once.
  - `conflict`, `deck-changed`, `missing`, `duplicate`, and `error` outcomes keep the dialog
    open, show the specific message, and retry uses the updated revision/authoritative state.
    `deck-changed` does not offer retry.
  - Save failure produces no confirmation and no replacement call.
  - A deck switch/concurrent revision change is not applied; the saved copy remains.
  - A retry after a conflict on a switched deck is rejected as `deck-changed` even if the new
    deck contains matching entry/source IDs.
- `src/io/import.test.ts` (or a focused custom-spell test):
  - Build a custom-spell export payload containing an editable copy with unexposed fields.
  - Confirm the actual export semantics: IDs are preserved in the payload; importing into an
    empty custom-spell table preserves the UUID and all fields, and a deck entry referencing
    that UUID still resolves.
  - Confirm collision semantics before asserting: importing the same UUID alongside an existing
    record triggers collision review; `Skip`, `Keep Both` (new UUID), and `Overwrite` follow the
    existing behavior rather than inventing new expectations.
- `e2e/editable-copy.spec.ts` (new):
  - Add an SRD spell to the active deck, open Details, choose **Create editable copy**, edit the
    name, save, confirm replacement, and verify the deck still has one entry now resolving to
    the Custom copy. Optionally verify the original SRD spell still exists in the library.
- Update `src/locales/locales.test.ts` only if direct translation assertions are useful; parity
  coverage is automatic.

### 8. Documentation

- `docs/specs/MAIN-spec.md`:
  - §4: replace the 120-character custom-authoring guideline with the runtime 500-character
    limit for `castingTime`/`range`/`duration`, so creation and later editing are consistent.
  - §5: note that the Details pane offers **Create editable copy** for an SRD spell present in
    the active deck.
  - §6: add the authoritative workflow, schema-aware copy rules that preserve every field
    recognized by the current `Spell` schema, no-eager-persistence/cancel behavior,
    name/language preservation, partial-success recovery, duplicate-submit protection, and
    global-copy semantics.
  - §7: add the deck replacement rule: only the matching active entry changes; `entryId`,
    position, and `fitMode` are preserved; the captured active revision and deck identity are
    checked inside the CAS transaction; baseline and saved snapshots are untouched; dirty state
    recalculates normally; a changed/removed/duplicated entry or a different deck is not
    replaced.
  - §8.1: state that copies are ordinary custom spells and require no import/export format
    change.
  - §12: add an acceptance row (for example `C1a`) covering success, cancellation, save failure,
    replacement failure, retry, and concurrent deck changes.
- `README.md`: add the feature to **Features**, describe the user flow and recovery behavior in
  **Using the app**, and add the language limitation to **Limitations** (custom copies retain
  the language captured at creation and are not auto-translated).
- `docs/DEVELOPMENT.md`: add a concise implementation note for the copy helper, the pure
  replacement mutator, the provider CAS action, the Details pane flow, form props, unified
  validation, and tests. Do not duplicate product rules owned by MAIN-spec.

## Edge cases and failure modes

- **Cancel editor before save:** no custom record, no deck write, no revision change.
- **Save failure:** form remains open; no copy; no deck change; no confirmation.
- **Cancel replacement confirmation after save:** custom copy remains in the library; active
  deck unchanged; select the copy and show the partial-success notice.
- **Source entry removed, rebound, or deck switched before confirmation:** expected-revision CAS
  fails or entry identity/reference checks fail; no write; copy preserved.
- **Retry after the deck changed:** retry keeps the original `{ name, savedDeckId }` identity.
  A different deck is rejected as `deck-changed` even if revision and entry IDs match.
- **Copy ID already present in the active deck:** return `"duplicate"`, do not write.
- **Double confirmation:** a synchronous guard plus disabled controls prevents a second
  submission; CAS would also reject a duplicate write.
- **Replacement storage failure:** transaction rolls back; copy preserved; existing deck-error
  banner and retry dialog explain the outcome.
- **Language switch during editing:** the draft keeps the captured source text; the copy is
  `Custom`, so it is not translated and omits a content `lang` attribute.
- **SRD spell with V/S overrides:** copy the merged text at copy time, but strip the transient
  `overridden` marker.
- **SRD metadata over 120 characters:** valid up to the runtime 500-character schema limit and
  remains editable later because ordinary custom-spell authoring uses the same limit.
- **Unexposed fields after later ordinary edits:** `subclasses`, `savingThrow`, `damageTypes`,
  and `componentsDisplayOverride` survive because the form saves from `base` and preserves
  unexposed component keys.
- **Saved decks referencing the copy:** continue to resolve the copy by UUID and reflect later
  edits; replacement does not rewrite saved snapshots.
- **Import/export:** copies are ordinary custom spells; the existing payload includes them with
  no format changes. Importing into an empty custom-spell table preserves their UUID and fields.
  Importing a UUID that already exists follows the existing Skip/Keep Both/Overwrite collision
  review; Keep Both assigns a new UUID by design.

## Validation

Run the repository toolchain after the changes:

1. `pnpm run check` (`vp check`) — format, lint, type-check.
2. `pnpm run test` (`vp test`) — unit and integration tests.
3. `pnpm exec playwright test e2e/editable-copy.spec.ts` — affected E2E flow (uses the Workers
   preview server).
4. `pnpm run test:e2e` if the change affects shared app behavior beyond the new spec.
5. `pnpm run build` if any type/config/data-adjacent change could affect the production build.

## Out of scope

- Direct unrestricted editing of canonical SRD records.
- Changing the existing SRD V/S override editor.
- New import/export formats, combined backup packages, or a new persistence schema.
- A separate deck-row copy button (the Details pane action covers the required flow; adding a
  row action would require a shared cross-pane flow controller and is not necessary).
- Automatic translation of custom copies.
