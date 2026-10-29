# Change Request — Component Authoring, Localized Form Defaults, and SRD Component-Text Overrides

**Status:** Proposed (Rev 2 — review decisions applied)
**Application version:** `1.1.0`
**Custom-spell payload version:** `1.1.0` (supersedes `1.0.0`)
**Deck payload version:** `1.0.0` (unchanged)
**Date:** 2026-10-23
**Related specs:** [`MAIN-spec.md`](./MAIN-spec.md), [`srd-source-data-refactoring.md`](./srd-source-data-refactoring.md), [`../srd-data-pipeline.md`](../srd-data-pipeline.md), [`../../README.md`](../../README.md), [`DEVELOPMENT.md`](../DEVELOPMENT.md)

---

## 1. Summary

This change request adds three related capabilities to YASCG:

- **Component-text authoring.** Users can author free-text descriptions for the **Verbal** (`V`) and **Somatic** (`S`/`G`) components. These render on the card, in the details pane, and on the printed sheet, each prefixed with a localized circle-glyph marker (`ⓥ` / `ⓢ` / `ⓖ`).
- **Material details for custom spells.** `materialCost` and `materialConsumed` (already present in the domain schema but unused) become authorable for custom spells behind a collapsed "Advanced / Optional" section, and are displayed on the form, details pane, and card.
- **SRD component-text overrides.** Every SRD spell becomes editable in a restricted override mode, but **only** for `verbalDescription` and `somaticDescription`, which are not part of the SRD structure and must be authored by the user. Overrides are stored in a separate, locale-scoped store (per spell **and** locale), merged at read time, flagged with a `*` on the source badge, and can be reset to the vanilla SRD spell.

Additionally, prefilled **defaults** and **input placeholders** for the custom-spell form's free-text fields (Casting Time, Range, Duration) are localized so the German locale no longer shows English values such as `Instantaneous`, `Self`, or `1 Action`.

Bundled SRD datasets (`src/data/**`) and the normalization pipeline are **never** modified by this feature.

### 1.1 Versioning model (three independent versions)

These must not be conflated in code, schema, or docs:

| Version                          | Constant / location                                       | Meaning                                              | Change in this CR                                                         |
| -------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| **Application version**          | app/package version                                       | Shipped YASCG release.                               | Bumps to `1.1.0`.                                                         |
| **Custom-spell payload version** | `CUSTOM_SPELL_EXPORT_VERSION` in `src/domain/payloads.ts` | Version stamped on custom-spell export/import files. | New `1.1.0`; writer always stamps it. Reader accepts `1.0.0` and `1.1.0`. |
| **Deck payload version**         | `EXPORT_VERSION` in `src/domain/payloads.ts`              | Version stamped on deck export/import files.         | **Unchanged at `1.0.0`.** Deck behavior is untouched.                     |

`EXPORT_VERSION` currently backs **both** payload families; this CR splits them so deck round-trips stay exactly as they are today.

### 1.2 Storage decision (Option A)

SRD component-text overrides use a **separate, locale-scoped override store** (Dexie table `srdSpellOverrides`), merged over the bundled spell at read time.

**Rejected alternative — Option B (duplicate the SRD spell into `customSpells` on first edit).** Rejected for the following reasons, established against the current code:

- Deck entries store `{ spellId, reference: { source, name } }`, and `resolveEntry` (`src/services/data/resolution.ts`) selects the lookup map from `reference.source`. To keep existing deck entries pointing at an edited copy, the copy would have to retain the original `srd-*` id — but `putCustomSpell` → `validateCustomSpell` (`src/db/custom-spells.ts`) rejects reserved `srd-` ids via `isReservedSrdId` (`src/domain/ids.ts`). Option B therefore must assign a **new UUID**, so existing deck entries keep resolving to the *unedited* SRD spell: edits silently fail to appear on already-added cards.
- The copy would render with the `Custom` badge and appear alongside the original in `librarySpells`, producing two visually distinct entries for one spell and destroying SRD identity.
- A full copy snapshots stale mechanics at edit time and never follows dataset updates.
- It inflates storage/export (a whole `Spell` per edit) and entangles SRD notes with the custom-spell collision/remap/fingerprint machinery.

Option A preserves id, source, deck references, offline behavior, and SRD identity, and keeps `src/data/**` and the drift test untouched.

---

## 2. Motivation

- **Incomplete component model.** `SpellComponents` already declares `verbalDescription`, `somaticDescription`, `materialCost`, `materialConsumed`, and `componentsDisplayOverride` (`src/domain/spells.ts`), but the authoring form only exposes the three booleans plus `materialDescription`. Users cannot record what a spell actually requires verbally/somatically.
- **SRD spells are read-only.** The Edit affordance is gated to custom spells in `DetailsPane` (`isCustom ? …`). Users often want to add table-specific phrasing (a verbal incantation, a somatic gesture) to an official spell without duplicating it and losing its SRD identity.
- **Partial localization.** Form labels are localized, but the seeded defaults are hardcoded English literals in `createCustomSpellDraft()` (`src/db/custom-spells.ts`), so German users see `1 Action` / `Self` / `Instantaneous`.

---

## 3. Scope

**In scope**

- Authoring `verbalDescription` / `somaticDescription` (custom spells and SRD overrides).
- Authoring `materialCost` / `materialConsumed` (custom spells only).
- Per-language SRD override storage, read-time merge, badge marker, and reset.
- Localized default values and placeholders for Casting Time / Range / Duration.
- Rendering of component text + material cost/consumed on card, details pane, and print sheet.
- Export/import of SRD overrides (custom-spell payload only).
- Docs and tests.

**Out of scope**

- Editing any SRD mechanic (name, level, school, casting time, range, duration, classes, description, component booleans).
- Authoring `componentsDisplayOverride` (stays data-only, honored verbatim by `componentSummary` in `src/cards/Card.tsx`).
- Changing bundled datasets, `scripts/normalize-srd.ts`, or the drift test `src/test/srd-dataset.test.ts`.
- Changing deck payload version or deck import/export behavior.
- App chrome / library / deck-pane localization (still governed by the existing localization exclusions in [`DEVELOPMENT.md`](../DEVELOPMENT.md)).

---

## 4. Requirements

### R1 — Verbal & Somatic description authoring

- Add two text inputs to the custom-spell form: **Verbal description** and **Somatic description**.
- **Gating:** each input is rendered/editable **only when** its component boolean is checked (`draft.verbal` / `draft.somatic`).
- **Keep-but-hide:** unchecking a component must **not** clear authored text; the value is retained in the draft/record but is not rendered on the card/details while the flag is false.
- Persist into `components.verbalDescription` / `components.somaticDescription`; omit when empty (mirroring the existing `materialDescription` handling in `CustomSpellForm.tsx`).
- Enforce the existing `META_MAX` (500 char) bound via `spellComponentsSchema` (`src/domain/spells.ts`).

### R2 — Material cost & consumed (custom spells only)

- Add an "**Advanced / Optional**" collapsible inside the form's material block.
- The collapsible is **collapsed by default** and reachable **only when `M` is checked**.
- Fields: `materialCost` (free text, `undefined` default) and `materialConsumed` (checkbox, `false` default).
- Not editable for SRD spells (fixed SRD rules).
- Display values on the form, the details pane, and the card/print sheet (see R5 and R5.1).

### R3 — SRD component-text overrides (storage, merge, badge, reset)

- **Storage:** new Dexie table `srdSpellOverrides` in `src/db/database.ts`, added via an additive `version(2)` migration. Record shape (type + Zod schema live in `src/domain/spells.ts`):

  ```ts
  interface SrdSpellOverride {
    spellId: string;            // canonical stable SRD id, e.g. "srd-fireball"
    locale: string;             // BCP 47 tag, e.g. "en" | "de"
    verbalDescription?: string; // trimmed, <= META_MAX
    somaticDescription?: string;// trimmed, <= META_MAX
    updatedAt: number;
  }
  ```

- **Keying:** compound, per-language primary key. Dexie stores string:

  ```ts
  srdSpellOverrides: "[spellId+locale], spellId, locale"
  ```

  The compound key is the Dexie primary key; `spellId` and `locale` are secondary indexes. Flavor text therefore stays within its locale.

- **Eligibility:** an override may contain a description only for a component that is enabled on the **canonical** SRD spell. A description for a disabled component is rejected (see R6 import validation and R7 form gating).
- **Empty records:** a record with neither verbal nor somatic description (after trimming) must not be persisted. Clearing both fields deletes an existing record.

- **Merge at read time:** in `src/state/AppProvider.tsx`, a merge step applies the override matching the dataset's locale onto each loaded dataset **before** building `languageById`, `englishById`, and `librarySpells`, so `selectedSpell`, deck resolution, card, and print all see the merged values.
  - The `en` dataset (`englishSpells`) receives `en` overrides only; non-English datasets receive their own locale's overrides. The selected locale must never leak into the English fallback.
  - Overrides are applied **after** canonical dataset schema parsing and **before** the derived maps are constructed.
  - The transient `overridden` marker is re-derived on every merge (see R3.1).
- **Badge marker:** an SRD spell with an active override for the current locale displays its source as **`SRD 5.2.1 *`** (asterisk denotes user modification), via `SourceBadge` (`src/ui/Badge.tsx`) and the card footer label (`src/cards/Card.tsx`). Canonical `source`/`sourceLabel` data is never mutated to encode this; see R3.1 and R5.2.
- **Reset:** a **Reset to original** action deletes the override record for the **currently edited spell + captured locale only** and reverts the spell to vanilla SRD. It must not delete overrides for the same spell in other locales. Offered in the SRD edit dialog when an override exists.
- Writing/deleting an override emits a cross-tab notification and triggers a refresh so all tabs update (see M1 in §4.7).

#### R3.1 — Transient `overridden` marker

- Add a transient, **non-persisted** `overridden?: boolean` to the `Spell` TypeScript interface for badge rendering.
- It is derived **only** in the read-time merge, **after** schema parsing. `spellSchema` is a non-strict `z.object`, so unknown keys are stripped; `overridden` is therefore never persisted by dataset loading, `putCustomSpell`, or import, and never reaches export.
- `overridden` is `true` **only** when a valid override record exists for that spell in the relevant locale. It must be `false` when no valid record exists.
- The marker disappears immediately after reset.

### R4 — Localized form defaults & placeholders

- **Defaults for new drafts** are seeded from the application spell-data `language` (from `AppProvider`) via `createCustomSpellDraft(language)` (`src/db/custom-spells.ts`):
  - Casting Time — EN `1 Action` / DE `1 Aktion`
  - Range — EN `Self` / DE `Selbst`
  - Duration — EN `Instantaneous` / DE `Unmittelbar`
- **Placeholder hints** on the free-text inputs are resolved through the same language/translation system:
  - Casting Time — EN `action | bonus action | reaction | x minutes | x hours` / DE `Aktion | Bonusaktion | Reaktion | x Minuten | x Stunden`
  - Range — EN `x feet | x miles | Self | Touch | Sight | Special | Unlimited` / DE `x Meter | x Kilometer | Selbst | Berührung | Sichtweite | Spezial | Unbegrenzt`
  - Duration — EN `Instantaneous | x minutes/hours/days | up to x minutes... | Special | Until dispelled` / DE `Unmittelbar | x Minuten/Stunden/Tage | bis zu x Minuten... | Spezial | Bis gebannt`
- Casting Time / Range / Duration remain **free-text inputs** (`Input` in `src/ui/Field.tsx` supports `placeholder`).
- **Draft lifecycle:**
  - The locale is captured when a **new** custom-spell form is opened.
  - A new draft is initialized **once per form-opening session**.
  - A locale change while the form is open must **not** reset, replace, or overwrite the draft.
  - Reopening a new-spell form may seed fresh defaults using the then-current locale.
  - Editing an **existing** spell preserves its stored values and never applies new defaults.
  - The live `language` value must not be added to any dependency that resets an existing form draft.

### R5 — Rendering (card, details, print)

- `verbalDescription` and `somaticDescription` render at the **end of the spell body**, in this exact order:

  > original description → higher-level description → verbal description → somatic description

- **They are modeled as `BlockNode`s, not separate JSX.** Extend `parseSpellBody` (`src/markdown/parse.ts`) — or its shared parsing pipeline — to append component-description blocks after description and higher-level content.
  - Append verbal first, then somatic.
  - Each nonempty description becomes its own block (a `paragraph` whose text is `${marker} ${description}`).
  - A block is generated **only** when the corresponding component boolean is enabled **and** the description is nonempty after trimming.
  - The marker is the localized `ⓥ` (verbal) or `ⓢ`/`ⓖ` (somatic) value.
- Because the component text is ordinary blocks, it automatically participates in existing body measurement, `computeFit`, pagination (`paginateToPages` / `truncateBlocksToFit`), and the `fitCacheKey` fingerprint (which already fingerprints `JSON.stringify(blocks)`). **No separate `fitCacheKey` addition is required.**
- Pagination must preserve block order and render each component-description block **exactly once**, including across continuation cards. No unconditional JSX may be appended inside `CardView` for component text.
- A **locale change** must regenerate the localized blocks and invalidate the relevant fit results (the locale is already part of `fitCacheKey`).
- Rendered in **all three** surfaces, which share the card-rendering pipeline:
  1. Card view — `src/cards/Card.tsx` (`CardView`)
  2. Details pane — `src/components/details/DetailsPane.tsx` (see R5.3)
  3. Print sheet — `src/print/PrintSheet.tsx` (renders `CardView`; cards assembled in `src/components/print/PrintDialog.tsx`)
- Rendering honors R1 keep-but-hide (not shown when the corresponding component flag is false).

#### R5.1 — Material details rendering

- `materialDescription`, `materialCost`, and `materialConsumed` display **only when `components.material === true`**.
- Authored material values are retained when `M` is unchecked but are hidden from rendered output.
- When enabled, render the material description, optionally followed by cost and consumed information:
  - `materialConsumed` displays a localized qualifier only when `true`.
  - Missing cost or description must **not** produce empty parentheses or stray separators.
- `componentsDisplayOverride` continues to control the compact component summary verbatim; it does **not** suppress the separate material-detail text.
- Material fields remain read-only for SRD spells.
- Material-detail rendering must be **consistent between card, details pane, and print**.
- **Fitting:** the material-detail line's rendered height must be accounted for during fitting. Attach the measured region (`bodyRef`) so that it includes the material-detail line (e.g. a wrapper around the material line and the body), or otherwise include that height in measurement. A taller material line must not overflow the card.

#### R5.2 — Source badge and footer

- Preserve canonical `source` and `sourceLabel` values in the underlying spell data; do not mutate `sourceLabel` to encode modification state.
- Add an `overridden` prop to `SourceBadge`.
- Add a shared source-label formatting helper (e.g. `sourceLabelText(spell, t)` in `src/locales/labels.ts`) that renders the localized source label followed by ` *` when `overridden === true`.
- Use the same helper in the card footer (`CardView`) and the details-pane badge.
- Both surfaces display `SRD 5.2.1 *` for an overridden SRD 5.2.1 spell.
- The `overridden` marker must not be persisted or exported.

#### R5.3 — Details pane consistency

- The details pane has two distinct visual representations and **both** must include component text:
  1. The **textual details section** (`BlockList`) must include the verbal/somatic blocks after description and higher-level content.
  2. The **card preview** must independently render those blocks as part of its own card body.
- These are two distinct representations, not an accidental duplicate within one card.
- Reuse the same component-block construction logic (the shared `parseSpellBody` extension) to guarantee identical ordering, markers, and gating.

### R6 — Export / import

#### R6.1 — Versioning

- `EXPORT_VERSION = "1.0.0"` remains the **deck** payload version and is unchanged.
- Introduce `CUSTOM_SPELL_EXPORT_VERSION = "1.1.0"` in `src/domain/payloads.ts` for **custom-spell** payloads.
- New custom-spell exports **always** write `1.1.0`, even when the override array is empty.
- The custom-spell importer accepts both `1.0.0` and `1.1.0`.
  - `1.0.0` = legacy structure, no overrides.
  - `1.1.0` = permits an optional `srdSpellOverrides` array.
- Use explicit discriminated/version-aware schemas (e.g. `customSpellExportPayloadSchemaV1` keyed on `z.literal("1.0.0")` and `customSpellExportPayloadSchemaV2` keyed on `z.literal("1.1.0")`) rather than one widened literal.
- Do **not** route recognized `1.1.0` payloads through the tolerant unknown-version fallback.
- Unknown future versions must **not** silently discard overrides. Reject unsupported versions, or require explicit user confirmation for any lossy partial import (see R6.3).
- Older app builds are not required to import `1.1.0` files.

#### R6.2 — Export

- Extend the custom-spell export payload with an **optional** `srdSpellOverrides` array; serialize the `srdSpellOverrides` table.
- Export only the override records; do **not** export merged SRD spells or the transient `overridden` marker.
- Read overrides directly from the DB or through an explicit provider API (the export dialog does not currently have the override table in its app context).

#### R6.3 — Import

- Extend `analyzeCustomImport` (`src/io/import-custom.ts`) so the plan distinguishes **custom-spell records** from **SRD override records**.
- Validate overrides using their dedicated schema; do **not** apply the `source === "Custom"` rule to override records.
- Validate, for each imported override:
  - `spellId` is a recognized canonical SRD id (reject or explicitly report unknown ids rather than silently creating orphaned records);
  - `locale` is a supported locale (present in the manifest);
  - only `verbalDescription` / `somaticDescription` are present;
  - field lengths within `META_MAX`;
  - **eligibility:** descriptions exist only for components enabled on the canonical SRD spell; imported records must not bypass this rule.
- Extend the Dexie transaction to include both `customSpells` and `srdSpellOverrides`; apply validated custom-spell and override changes in **one transaction** for atomicity.
- Upsert imported overrides by `[spellId+locale]` using **last-imported-value-wins** for matching keys, consistent with an explicitly documented import policy. `updatedAt` is regenerated locally at import and is not trusted from the file.
- Normalize **empty** overrides to deletion or a no-op rather than storing meaningless records.
- Extend import counts, preview, and the final UI summary to distinguish custom spells from overrides.
- An absent override array is valid. Both an absent array and an explicit empty array leave existing local overrides **unchanged** (only records present in the file are upserted).
- Importing a legacy `1.0.0` custom-spell payload must **not** delete or modify local SRD overrides.
- Import operations must not modify bundled datasets.
- Unknown-version handling: perform best-effort recognized-field extraction; if the payload contains a non-empty `srdSpellOverrides` (or any field that would be dropped), mark the plan `lossy: true` and require explicit user confirmation. Never silently drop overrides.

### R7 — SRD "Edit" UX

Reuse `CustomSpellForm` with an explicit SRD override mode and two distinct submission paths.

- The details-pane **Edit** button becomes available for SRD spells, not just custom (`DetailsPane.tsx`). Duplicate/Delete remain custom-only.

**Custom mode (existing submission behavior; component/material fields are added by R1/R2):**

- Preserve existing custom-spell creation and editing.
- Continue using `saveCustomSpell`.
- Keep existing custom-spell validation and selection behavior.

**SRD mode:**

- Load the canonical SRD spell plus any override matching its ID and the current locale.
- Display all standard fields read-only/disabled (name, level, school, casting time, range, duration, concentration/ritual, component booleans, material fields, classes, description, higher levels), leaving **only** `verbalDescription` and `somaticDescription` editable.
- Respect the component booleans: descriptions for disabled components are not editable or rendered.
- Preserve existing descriptions when saving unless the user explicitly clears them.
- Submit only the override record through `saveSrdOverride`.
- Never change `source`, create a custom-spell record, or call `saveCustomSpell`.
- Never convert an `srd-*` id into a custom spell.
- Keep the selected spell's canonical SRD identity unchanged.
- If both descriptions are empty after trimming, **delete** any existing override rather than persisting an empty override.
- **Reset to original** deletes the override for this spell/locale and returns the displayed values to the bundled SRD version.
- The dialog description is reworded for the SRD case (`form.descriptionSrd`): bundled data is never modified; only local notes are stored.
- The `overridden` marker must only be true when a valid override record exists.

#### R7.1 — Override locale capture

- Capture the active locale when the SRD edit dialog opens.
- Save and reset operations target that **captured** locale, even if the application language changes before the dialog closes.
- Safer alternative if locale is switched while the dialog is open: close/reopen the dialog on language changes **without discarding dirty input** (per R4 draft-lifecycle rules).

---

## 5. Data model & i18n changes

### 5.1 Domain / DB

- `SpellComponents` fields already exist; **no schema change required** for the component fields themselves (`src/domain/spells.ts`).
- Add `SrdSpellOverride` (type + Zod schema) to `src/domain/spells.ts`. Persistence operations (list/get/put/delete) live in `src/db/srd-overrides.ts`.
- Add the transient, non-persisted `overridden?: boolean` to the `Spell` interface (see R3.1). It is intentionally excluded from `spellSchema`.
- `src/db/database.ts`: add `srdSpellOverrides` under an additive `version(2)` migration, retaining existing tables and data:

  ```ts
  this.version(2).stores({
    customSpells: "id, name, updatedAt",
    savedDecks: "id, updatedAt",
    activeDeck: "id",
    srdSpellOverrides: "[spellId+locale], spellId, locale",
  });
  ```

- `src/domain/payloads.ts`: split payload versions (`EXPORT_VERSION` for decks, `CUSTOM_SPELL_EXPORT_VERSION` for custom spells) and add version-aware custom-spell schemas plus the override export schema.

### 5.2 i18n (`src/locales/en.ts`, `src/locales/de.ts`, helpers in `src/locales/labels.ts`, parity enforced by `satisfies Translations`)

- `form.verbalDescription`, `form.somaticDescription`
- `form.advanced` (e.g. "Advanced / Optional" / "Erweitert / Optional")
- `form.materialCost`, `form.materialConsumed`
- `form.resetToOriginal`
- `form.description` (existing) and `form.descriptionSrd` (SRD read-only notice)
- `form.default.castingTime` / `form.default.range` / `form.default.duration`
- `form.placeholder.castingTime` / `form.placeholder.range` / `form.placeholder.duration`
- `component.marker.verbal` (`ⓥ`), `component.marker.somatic` (`ⓢ` / `ⓖ`)
- `spell.metadata.materialConsumed` (localized "consumed" qualifier)
- `source.srd` (`SRD 5.2.1`), `source.custom` (`Custom` / `Eigen`)
- Helpers in `src/locales/labels.ts`:
  - `componentMarkerKey(kind)` alongside `componentKey()` — returns `component.marker.verbal` / `component.marker.somatic`.
  - `sourceLabelText(spell, t)` — canonical label (`spell.sourceLabel ?? t(sourceKey(spell.source))`) plus ` *` when `spell.overridden`.

---

## 6. Most relevant files

| File                                                               | Change                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/spells.ts`                                             | Add transient `overridden?` to `Spell`; add `SrdSpellOverride` type + Zod schema. Component fields already exist.                                                                                                    |
| `src/domain/payloads.ts`                                           | Split `EXPORT_VERSION` (deck) from `CUSTOM_SPELL_EXPORT_VERSION` (custom spells); add version-aware custom-spell schemas + override export schema.                                                                   |
| `src/db/database.ts`                                               | `version(2)` additive migration adding `srdSpellOverrides` (`"[spellId+locale], spellId, locale"`).                                                                                                                  |
| `src/db/srd-overrides.ts` (new)                                    | CRUD for overrides (per `[spellId+locale]`).                                                                                                                                                                         |
| `src/db/notifications.ts`                                          | Extend `ChangeKind` with an SRD-override change type.                                                                                                                                                                |
| `src/db/custom-spells.ts`                                          | Localize `createCustomSpellDraft(language)` defaults (R4).                                                                                                                                                           |
| `src/state/AppProvider.tsx`                                        | `useLiveQuery(() => listSrdOverrides())`; read-time merge after parsing and before derived maps; English fallback uses `en` overrides; expose `saveSrdOverride` / `resetSrdOverride`; notification + refresh wiring. |
| `src/markdown/parse.ts`                                            | Extend `parseSpellBody` to append component-description blocks (verbal then somatic) — shared by all surfaces.                                                                                                       |
| `src/components/details/CustomSpellForm.tsx`                       | V/S description inputs, material advanced collapsible, placeholders, SRD override mode (read-only fields, captured locale, distinct submit path, reset action).                                                      |
| `src/components/details/DetailsPane.tsx`                           | Allow Edit for SRD; render component text in the textual section and badge marker.                                                                                                                                   |
| `src/cards/Card.tsx`                                               | Render component blocks via the shared parse pipeline; footer uses `sourceLabelText`; material-detail line included in the measured region.                                                                          |
| `src/cards/fit.tsx`                                                | Component text flows through `blocks` (no separate fingerprint change); locale-driven regeneration invalidates fits.                                                                                                 |
| `src/components/print/PrintDialog.tsx`, `src/print/PrintSheet.tsx` | Ensure component text is present in `PrintCardData`/`CardView` output via the shared pipeline.                                                                                                                       |
| `src/io/export.ts`, `src/io/import-custom.ts`                      | Serialize/read `srdSpellOverrides`; version-aware validation; override validation + one-transaction apply.                                                                                                           |
| `src/components/import-export/ImportExportDialog.tsx`              | Read overrides for export; surface override counts/preview; lossy-unknown-version confirmation.                                                                                                                      |
| `src/ui/Badge.tsx`                                                 | `SourceBadge` gains an `overridden` prop; render via `sourceLabelText`.                                                                                                                                              |
| `src/locales/en.ts`, `src/locales/de.ts`, `src/locales/labels.ts`  | All new i18n keys/helpers.                                                                                                                                                                                           |

---

## 7. Migration & compatibility

- Dexie `version(2)` is additive; existing `customSpells`/`savedDecks`/`activeDeck` data is untouched.
- Custom-spell payloads: new exports write `1.1.0`; the importer reads `1.0.0` (legacy, no overrides) and `1.1.0` (optional overrides). `srdSpellOverrides` is optional.
- Deck payloads remain `1.0.0` and are unaffected.
- Importing a `1.0.0` custom-spell payload leaves local overrides unchanged.
- New `1.1.0` custom-spell files are not guaranteed to be readable by older builds (older builds may hit the unknown-version path); older builds are not required to support them.
- Unknown future versions must not silently discard overrides (reject or require explicit confirmation for lossy partial import).
- No change to `src/data/**`, `normalize-srd.ts`, canonical SRD identity, or drift protection; `src/test/srd-dataset.test.ts` must remain green.

---

## 8. Testing & verification plan

- **Unit / integration**
  - Override merge: given overrides for `en`/`de`, the merged spell exposes the correct description per locale and the `overridden` marker; English fallback uses `en` overrides only.
  - Override CRUD + reset restores the vanilla spell; reset affects only the current spell/locale.
  - Export/import round-trip including `srdSpellOverrides` without silent data loss; import of `1.0.0` payloads without the field leaves overrides unchanged.
  - Version split: custom export stamps `1.1.0`, deck export stamps `1.0.0`; legacy custom `1.0.0` import; null array vs missing array; unknown-version lossy handling.
  - Override import validation: unknown `spellId`, unsupported `locale`, disabled-component description, over-length fields; empty override normalized to deletion/no-op.
  - `createCustomSpellDraft(language)` seeds localized defaults; placeholders resolve per locale.
  - i18n: `de` key parity (`src/locales/locales.test.ts`).
  - Cross-tab override reactivity (notification kind + `useLiveQuery`).
- **Component / rendering** (`src/cards/Card.i18n.test.tsx`, `src/cards/fit.i18n.test.ts`, `src/components/details/DetailsPane.test.tsx`)
  - Card + details + print render `ⓥ`/`ⓢ`/`ⓖ` text only when the component flag is true.
  - Keep-but-hide: text retained but hidden when the flag is off.
  - Multi-card pagination shows each component-description block exactly once (no duplication across continuation cards).
  - DetailsPane textual section and card preview are consistent in ordering/markers/gating.
  - Fit re-measures when component text changes and on locale change.
  - Material rendering with `M` disabled and with `componentsDisplayOverride` set (no empty parentheses/separators; qualifier only when consumed).
  - Form locale changes while open do not lose a dirty draft.
  - SRD edit/save/reset does not create a custom spell and preserves canonical identity.
- **Commands:** `vp check`, `vp test`; affected E2E per `AGENTS.md` when form/print behavior changes.

---

## 9. Documentation updates

- `README.md` — Limitations summary (SRD component-text notes are local, language-scoped).
- `docs/DEVELOPMENT.md` — export format (custom-spell payload `1.1.0` with SRD overrides; deck payload remains `1.0.0`) and the technical details behind those limitations.
- `docs/srd-data-pipeline.md` — note that `verbalDescription`/`somaticDescription`/`materialCost`/`materialConsumed` are now surfaced in the UI and, for SRD, stored as local overrides rather than in `src/data/**`.
- This change request.

---

## 10. Risks & open implementation notes

- **Measurement coupling.** Component text is ordinary body blocks (R5), so it is inside the measured region (`bodyRef`) and paginates correctly. The material-detail line's height must also be accounted for (R5.1); wrapping it into the measured region is the simplest remedy.
- **Fit cache.** Because component text is inside `blocks`, the existing `JSON.stringify(blocks)` fingerprint already covers it; no separate fingerprint field is added. Locale is already part of `fitCacheKey`.
- **Draft re-seeding.** Locale-aware defaults are captured at open time (R4); the live `language` value must not be a dependency that resets an existing draft.
- **Badge plumbing.** The `*` marker reaches both `SourceBadge` and the card footer via `sourceLabelText`; the transient `overridden` flag is deliberately not persisted or exported and disappears after reset.
- **Override locale semantics.** An override authored while viewing `de` is not shown in the `en` view (per-language keying). This is a deliberate trade-off versus a single shared note.
- **Merge reactivity.** Overrides change independently of datasets; the dedicated `useLiveQuery(() => listSrdOverrides())` must not force bundled dataset reloads.

---

## 11. Acceptance criteria

- Users can author `verbalDescription`/`somaticDescription` for custom spells and for **any** SRD spell (SRD: only these two fields editable; save/reset never create a custom spell or change canonical identity).
- Component text renders on card, details pane (textual section **and** card preview), and print sheet at the end of the body with the localized `ⓥ`/`ⓢ`/`ⓖ` markers, gated by the component flags, as body blocks that participate in fit/pagination and appear exactly once across continuation cards.
- `materialCost`/`materialConsumed` are authorable for custom spells behind a collapsed Advanced/Optional section, defaulting to `undefined`/`false`, are gated by `M`, and render consistently on form, details, and card with no empty separators.
- SRD overrides persist per locale, survive reload, are exported/imported without silent data loss, mark the source as `SRD 5.2.1 *`, and can be reset (current spell/locale only) to the original.
- German locale shows German defaults (`1 Aktion`, `Selbst`, `Unmittelbar`) and German placeholders; switching locale never overwrites an open draft.
- Custom-spell exports stamp payload `1.1.0`; deck exports remain `1.0.0`; legacy custom `1.0.0` imports still work and leave local overrides untouched.
- `src/data/**` and normalization/drift tests are unchanged and green; `vp check` and `vp test` pass.
