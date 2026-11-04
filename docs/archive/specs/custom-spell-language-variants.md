# Custom Spell Language Variants (Deferred Design)

> **Status:** Deferred design proposal. Not approved and not implemented.
> **Chosen approach:** translation group plus locale with language-aware resolution.
> **Last updated:** 2026-10-25

## 1. Problem

Custom spells currently have no language dimension. The `Spell` model has no `locale`, `language`, or grouping field, the Dexie table is keyed only by `id`, and the library combines the selected language's SRD spells with *all* custom spells.

Consequences:

- The same homebrew spell cannot exist as linked English and German variants.
- Importing a second-language version under the same `id` is reported as a collision; the only choices are Skip, Keep both (unrelated random ID), or Overwrite (destructive).
- A deck entry stores one concrete custom `spellId`, so switching the spell-data language never swaps the card to another language.
- Users work around this by creating unrelated records such as `mind-sliver-en` and `mind-sliver-de`, which duplicate library entries and have no semantic link.

Bundled SRD spells already solve this problem differently: each language dataset contains the same canonical IDs, and the app resolves the selected language with an English fallback. This proposal applies the same idea to custom spells with the smallest practical schema change.

### Verified current behavior

| Area            | Current behavior                                     | Location                                                               |
| --------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Spell shape     | No `locale`/`language`/group field                   | `src/domain/spells.ts` (`Spell`, `spellSchema`)                        |
| Custom payload  | Current version `1.1.0`, strict top-level envelope   | `src/domain/payloads.ts`                                               |
| Import identity | Collision key is `id` only                           | `src/io/import-custom.ts` (`analyzeCustomImport`, `applyCustomImport`) |
| Persistence     | `customSpells` primary key is `id`                   | `src/db/database.ts`                                                   |
| Library         | `librarySpells = [...languageSpells, ...customList]` | `src/state/AppProvider.tsx`                                            |
| Deck entry      | Stores `spellId` plus `{source, name}` reference     | `src/domain/deck.ts`                                                   |
| Deck resolution | Source-specific lookup by exact `spellId`            | `src/services/data/resolution.ts`                                      |
| Deck uniqueness | One entry per `spellId`                              | `src/domain/deck.ts` (`dedupeDeckEntries`, `uniqueDeckEntriesSchema`)  |

## 2. Goals

- Let multiple custom spell records represent the same spell in different languages.
- Keep a stable shared identity across variants without making the language part of the database primary key.
- Show exactly one variant per spell in the library for the active language, with a deterministic fallback.
- Make deck cards and printing follow the active language when a translation exists.
- Preserve all existing custom spells and decks without a destructive data migration.
- Keep older `1.0.0` and `1.1.0` custom-spell files importable.

## 3. Non-goals

- Automatic translation or any machine-translation integration.
- Side-by-side bilingual cards or printing two languages at once.
- Region-aware negotiation such as `de-DE` versus `de-AT`. Only codes listed in the language manifest are supported.
- Unifying SRD and custom localization into one normalized data model.
- Changing SRD spell data, SRD override semantics, or the spell-data language selector.
- Translating UI terminology per custom spell; UI labels continue to follow the selected language.

### Integration with Full UI Localization

This feature builds on the existing full UI localization infrastructure.

- Reuse the existing `react-i18next` configuration, `UiLocaleBridge`, translation catalogs (`src/locales/en.ts`, `src/locales/de.ts`), and application language preference (`spellCards.language`).
- Do not introduce a separate UI localization system, i18next instance, global language state, or language selector.
- The existing application language determines both the UI locale and the active locale used for custom-spell variant resolution.
- Custom-spell variants must resolve against the successfully applied application language, not a requested or pending language selection.
- Preserve the existing language-switch confirmation, cancellation, asynchronous loading, error handling, and deck-impact calculation workflow.
- Language-switch impact calculations must recognize successfully resolved custom-spell variants and fallbacks without incorrectly treating them as missing spells.
- A successful language switch must update the UI, spell library, details pane, deck cards, and print output consistently. A cancelled or failed switch must leave the current language and displayed variants unchanged.
- All newly introduced application-controlled UI text, including badges, fallback notices, form controls, validation errors, import collision messages, confirmation dialogs, tooltips, and notifications, must use the existing i18next translation catalogs.
- Spell `locale` and `translationGroup` values remain canonical domain data. They must not be translated or derived from translated display labels.
- User-authored spell content must never be automatically translated. The selected variant determines the spell content; i18next determines surrounding application UI terminology.
- The authoring interface must support editing a spell variant whose locale differs from the active application language.
- Add integration tests covering successful, cancelled, and failed language switches; fallback behavior; authoring across locales; and correct localization after reload.

## 4. Proposed model

Add two optional fields to `Spell`:

| Field              | Type / constraint                        | Meaning                                                                                                      |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `translationGroup` | non-empty string, trimmed, max 120 chars | Shared identity across language variants. Opaque stable key, recommended UUID or slug such as `mind-sliver`. |
| `locale`           | non-empty string, trimmed, max 35 chars  | Language of this record. On import it must match a language code from the manifest (`en`, `de` today).       |

Rules:

1. **Both fields are provided together, or neither is.** A localized variant has both; a legacy/language-neutral record has neither. Reject `locale` without `translationGroup` and vice versa in `1.2.0`.
2. **`id` remains unique and is still the database primary key.** Variants need distinct IDs, e.g. `mind-sliver-en` and `mind-sliver-de`. The group is not a primary key.
3. **At most one record per `(translationGroup, locale)`.** This is a logical constraint enforced by import and authoring UI; it is not a database constraint in this approach.
4. **Language-neutral records remain valid.** Existing records without the new fields stay visible in every language and resolve to themselves. They cannot be retroactively assigned a language without editing/re-importing them.
5. **`translationGroup` is case-sensitive and opaque.** Only surrounding whitespace is trimmed. Documentation must recommend stable slugs or UUIDs to avoid accidental group splits.
6. **`id` collisions still exist.** The database cannot store two records with the same ID, even in different locales. This is why the variant ID must be unique.

Example `1.2.0` payload:

```json
{
  "version": "1.2.0",
  "type": "custom-spells",
  "spells": [
    {
      "id": "mind-sliver-en",
      "translationGroup": "mind-sliver",
      "locale": "en",
      "name": "Mind Sliver",
      "level": 0,
      "school": "Enchantment",
      "castingTime": "1 action",
      "range": "60 feet",
      "components": { "verbal": true, "somatic": false, "material": false },
      "duration": "1 round",
      "concentration": false,
      "ritual": false,
      "classes": ["Sorcerer", "Warlock", "Wizard"],
      "savingThrow": "INT",
      "damageTypes": ["psychic"],
      "description": ["..."],
      "higherLevels": ["..."],
      "source": "Custom"
    },
    {
      "id": "mind-sliver-de",
      "translationGroup": "mind-sliver",
      "locale": "de",
      "name": "Gedankensplitter",
      "level": 0,
      "school": "Enchantment",
      "castingTime": "1 Aktion",
      "range": "18 Meter",
      "components": { "verbal": true, "somatic": false, "material": false },
      "duration": "1 Minute",
      "concentration": false,
      "ritual": false,
      "classes": ["Sorcerer", "Warlock", "Wizard"],
      "savingThrow": "INT",
      "damageTypes": ["psychic"],
      "description": ["..."],
      "higherLevels": ["..."],
      "source": "Custom"
    }
  ],
  "srdSpellOverrides": []
}
```

## 5. Payload and import/export changes

### Versioning

- Introduce custom-spell payload version `1.2.0` that adds `translationGroup` and `locale`.
- Continue parsing `1.0.0` (no overrides) and `1.1.0` (overrides) unchanged. Their spells import as language-neutral records.
- Export always writes `1.2.0`. Language-neutral records simply omit the two new fields.
- Keep the strict envelope rule: unknown top-level keys are rejected. Inside a spell record, unknown keys are still silently discarded, so add the new keys to the recognized-key list in `import-custom.ts` to keep unknown-version lossy reporting accurate.
- Older app versions importing a `1.2.0` file take the unknown-version best-effort path and drop the new fields. This is acceptable but means older clients silently lose the linking metadata.

### Validation

- `translationGroup`: trimmed, non-empty, max 120.
- `locale`: trimmed, non-empty, max 35, and present in the manifest on import. The domain schema stays tolerant because stored data must remain readable even if a language is removed.
- Both fields or neither.
- IDs unique within the file and globally as today.
- `(translationGroup, locale)` unique within the file and against stored custom spells.
- `source` must remain `"Custom"`.
- `srd-` ID remapping stays unchanged. If the ID is remapped, the group is unaffected because the group is explicit in `1.2.0`.

### Collision semantics

Collision detection needs two layers:

1. **Variant collision** — an existing record has the same `(translationGroup, locale)`.
2. **ID collision** — an existing record has the same `id` but belongs to another group/locale.

Proposed behavior:

| Situation                                            | Behavior                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same group + locale, same ID                         | Normal variant collision. Apply the chosen strategy.                                                                                                                                                                                                           |
| Same group + locale, different ID                    | Variant collision. **Overwrite** updates the stored record in place and keeps the stored ID so deck references stay valid; report that the incoming ID was not adopted. **Skip** discards the incoming record. **Keep both** creates a new group *and* new ID. |
| Same ID, different group/locale                      | Reject with an explicit per-record error. Silently converting a record between groups could orphan variants and break decks. The author must use a distinct ID or remove the old record first.                                                                 |
| Duplicate group + locale inside one file             | Reject the entire import.                                                                                                                                                                                                                                      |
| Duplicate ID inside one file                         | Reject the entire import, as today.                                                                                                                                                                                                                            |
| Language-neutral incoming record with an existing ID | Treat as an ordinary ID collision. **Overwrite** converts the neutral record into a localized variant; the UI must warn that this changes its global visibility.                                                                                               |

`Keep both` deliberately creates an unrelated spell: two records for the same group and locale would violate rule 3. The import result must say that the link was not preserved.

The existing review-before-commit fingerprint check and atomic transaction stay in place.

### Export

- `buildCustomSpellsPayload` sorts by group/locale/name for deterministic output and includes the new fields when present.
- `srdSpellOverrides` is unchanged; it already has its own `locale`.
- The deck export stays at version `1.0.0` and does not gain group metadata in this approach; see limitations.

## 6. Library behavior

Build two in-memory structures from `customSpells`:

- `customByGroup: Map<string, Map<string, Spell>>` for localized variants.
- Neutral records (`translationGroup === undefined`) remain standalone.

Resolution algorithm for a custom spell or group:

```text
resolveCustomVariant(spell, activeLocale, byGroup):
  group = spell.translationGroup
  if group is undefined:
    return spell
  variants = byGroup.get(group)
  return variants.get(activeLocale)
      ?? variants.get("en")
      ?? first variant ordered by locale
      ?? spell
```

Rules:

- The library shows one entry per group, chosen by the algorithm above.
- Neutral records are always shown individually, regardless of language.
- English is the fallback when the active language lacks a variant.
- If neither the active language nor English exists, show the group's first variant ordered by locale code, deterministically, with a "translation unavailable" badge.
- Add a language badge to the list/details, e.g. `EN`, `DE`, `EN (fallback)`, `No translation`.
- The search index must be built from the resolved library set, not from raw custom records, so hidden variants do not appear in search results.
- Filter option lists already derive from the localized SRD dataset only; keep that behavior to avoid mixing "Action"/"Aktion".
- `selectedSpell` must resolve through the same helper so the details pane and print output match the list.

## 7. Deck behavior

### Resolution

`DeckEntry` keeps its current shape (`spellId`, `fitMode`, `reference`). No deck schema or Dexie migration is required.

Extend `resolveEntry` for custom spells:

1. Look up the stored spell by `entry.spellId`.
2. If missing → `missing`.
3. If it is language-neutral → return it.
4. Otherwise resolve the variant for the active language with the same algorithm as the library.
5. Optionally report `fallbackLocale` so the card can display a badge. Treating a fallback as `translation-unavailable` would remove the card, which is not desired.

Consequences:

- Switching the language re-resolves deck cards, print output, and the details pane.
- A language switch does not mark the deck dirty because it does not change stored entries.
- Saved decks and baselines keep their concrete IDs and continue to compare unchanged.

### Uniqueness and add behavior

Deck uniqueness is currently by `spellId`. Without a change, adding both language variants creates two cards for the same spell.

- Add group-aware duplicate detection at add time: an incoming localized custom spell is a duplicate if the active deck already contains a custom spell with the same `translationGroup`.
- Keep the persisted `uniqueDeckEntriesSchema` keyed by `spellId`; no deck migration is needed.
- If a stored entry's spell has been deleted, fall back to exact-`spellId` comparison because the group is unknown.
- `addSpellsToDeck` should count group duplicates in its existing `skipped` result.

### Deletion and duplication

- **Delete variant:** remove that variant and its deck entries, as today. Other variants and the group remain.
- **Delete group:** add an explicit action that removes all variants and all active-deck entries for the group. Saved decks stay untouched, consistent with current deletion behavior.
- **Duplicate spell:** treat a duplicate as a new independent spell. Assign a new `translationGroup` (or no group) so it does not collide with the source group's locale.
- **Add translation:** when duplicating explicitly as a translation, reuse the source group, assign a new unique ID, and ask for the target locale.

## 8. Authoring UI

The JSON import remains the primary bulk-authoring path. The custom spell form needs only a small extension:

- New spells default to the active language and a new group (UUID) — or remain language-neutral if the team prefers the current behavior. Pick one rule and document it.
- Editing an existing localized spell shows `locale` as editable and `translationGroup` as read-only metadata.
- Offer an **Add translation** action that opens the form prefilled from the current spell with a blank target locale and a new ID.
- Changing a group manually is not exposed; it can silently split or merge variants.
- Validation mirrors import rules: both fields or neither, manifest locale, unique `(group, locale)`.

## 9. Persistence

- No Dexie version bump is required: IndexedDB stores extra object properties without a schema change, grouping is computed in memory, and the custom-spell table remains keyed by `id`.
- A future Dexie version could add a `translationGroup` index if database-level queries become necessary. It is not needed for this approach.
- Do not backfill `translationGroup = id` for existing records. Neutral records must stay neutral for backward-compatible visibility and deck resolution.
- The only integrity guarantee for `(group, locale)` is import/UI validation. Direct database edits could create duplicates; treat that as unsupported.

## 10. Compatibility and migration

| Data                           | Behavior                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ |
| Existing custom spells         | No fields → language-neutral, visible everywhere, resolve to themselves. |
| Existing decks                 | Unchanged; entries keep concrete IDs.                                    |
| Existing saved decks/baselines | Unchanged.                                                               |
| `1.0.0` import                 | Still accepted; records are neutral.                                     |
| `1.1.0` import                 | Still accepted; records are neutral, overrides unchanged.                |
| `1.2.0` export                 | Includes fields only when present.                                       |
| Older app importing `1.2.0`    | Imports spells but drops group/locale as unknown fields.                 |
| SRD spells and overrides       | Completely unchanged.                                                    |

## 11. Staged delivery

### Stage 2a — model, import/export, library

- Add fields and validation.
- Add `1.2.0` payload support and backward-compatible parsing.
- Build the group/locale index and resolve the library set.
- Add language badges and authoring support.
- Do not touch deck resolution yet.

At the end of 2a, the library shows the right variant per language, but decks still keep the variant they were built with.

### Stage 2b — deck resolution and group-aware dedupe

- Extend `resolveEntry` and `selectedSpell`.
- Add group-aware duplicate detection for add/append operations.
- Extend deletion/duplication actions.
- Verify print and fallback behavior.

This split keeps the riskier deck semantics separate from the mostly presentational library work.

## 12. Testing plan

### Domain and schema

- Optional fields accepted; both-or-neither enforced for `1.2.0`.
- Locale/group length and trim rules.
- Legacy records without fields still validate.

### Import/export

- `1.0.0`, `1.1.0`, and `1.2.0` payloads parse.
- Same group + different locale imports successfully.
- Duplicate `(group, locale)` inside a file aborts the import.
- Duplicate `(group, locale)` against stored data triggers collision review.
- Same ID with a different group/locale is rejected.
- Overwrite keeps the stored ID and deck references.
- Keep both creates a new group and ID.
- `srd-` ID remapping still works.
- Round-trip export/import preserves groups and locales.
- Unknown keys inside records are still stripped, and the recognized-key list includes the new fields.

### Library and state

- Active-language variant is shown; no duplicate group entries.
- English fallback when the active language is missing.
- Deterministic fallback when neither active nor English exists.
- Neutral records remain visible in every language.
- Search does not reveal hidden variants.
- `selectedSpell` and details match the resolved variant.

### Deck and print

- A deck with one variant swaps to the other on language change.
- Fallback variant is used when the active translation is missing.
- Adding the other language variant does not duplicate the group in the deck.
- Deck dirty state is unchanged by a language switch.
- Print and multi-card pagination use the resolved variant.
- Deleting one variant leaves the group intact; deleting a group removes all active-deck entries for it.
- Saved decks are never mutated.

### E2E

- Import the English and German variants in one file, verify the library shows one entry per language, switch languages, add to a deck, print, and restart the app to verify persistence.

### Required commands

- `vp check`
- `vp test`
- Relevant Playwright E2E suites for import, language switching, deck, and print.

## 13. Pros

- Solves the real requirement: linked language variants with language-aware decks and printing.
- Reuses the proven SRD concept of shared identity plus English fallback.
- No destructive Dexie migration and no change to existing deck storage.
- Backward compatible with existing custom spells, decks, and `1.0.0`/`1.1.0` files.
- Can be staged into a low-risk presentation release followed by deck semantics.
- Keeps SRD and custom data paths independent, avoiding a large refactor.

## 14. Cons and risks

- Touches domain, payloads, import/export, state, library UI, deck resolution, authoring, print, and tests; it is a cross-cutting feature despite avoiding a DB migration.
- Overwrite/Keep both semantics become more nuanced and need clear UI wording.
- The group relation is metadata and can drift if users author inconsistent group strings.
- The database does not enforce one variant per group/locale; import and UI are the only guards.
- Fallback may display English content in a German UI; a badge is required to avoid confusion.
- Deck export remains variant-specific, so cross-device deck portability is imperfect (see restrictions).
- Deletion semantics need explicit product decisions and clear UI.
- The feature does not provide translation management beyond basic authoring; JSON remains the bulk workflow.

## 15. Potential restrictions and limitations

- **One language per card.** A card never shows two languages side by side.
- **No automatic translation.** Every variant must be authored.
- **Manifest-bound locales.** Only `en` and `de` are valid today; adding a language requires adding it to the manifest. Region-specific variants are not modeled.
- **IDs remain per record.** Two variants cannot share an ID because the custom-spell table is keyed by `id`.
- **Logical uniqueness only.** Nothing at the database level prevents duplicate `(group, locale)` records.
- **Neutral legacy records are not linked.** Users must re-import or edit them to make them part of a group.
- **Older clients lose linking metadata.** A `1.2.0` file imported by an older app version is stored without group/locale.
- **Deck export portability.** Deck exports still reference a concrete variant ID. On another installation, the entry resolves only if that variant exists; the group is not exported with the deck. If this becomes important, a follow-up deck payload version can add an optional `translationGroup` to the export reference.
- **Saved decks are immutable snapshots.** Deleting a variant or group does not rewrite saved decks; those decks may later resolve as missing, matching current behavior.
- **No bulk variant management UI.** Adding/removing translations is per-spell and per-file.

## 16. Open decisions

- Default for newly created custom spells: localized to the active language, or language-neutral until explicitly translated? Recommendation: localized to the active language.
- Fallback when neither the active language nor English exists: deterministic first-locale fallback versus a visible "translation unavailable" state. Recommendation: deterministic fallback plus a badge so cards never disappear.
- Should the details pane allow editing a variant's locale without re-importing? Recommendation: yes, with duplicate `(group, locale)` validation.
- Whether deleting a variant should also offer "delete whole group" in the same confirmation. Recommendation: yes, with explicit counts of affected variants and deck entries.
- Whether deck export should gain group metadata in a later deck payload version. Out of scope for this proposal.

## 17. Affected files (implementation checklist)

| Area                     | Files                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Domain model             | `src/domain/spells.ts`                                                                 |
| Payload versions/schemas | `src/domain/payloads.ts`                                                               |
| Custom import            | `src/io/import-custom.ts`                                                              |
| Custom export            | `src/io/export.ts`                                                                     |
| Database access          | `src/db/custom-spells.ts`, `src/db/database.ts`                                        |
| State and resolution     | `src/state/AppProvider.tsx`, `src/services/data/resolution.ts`                         |
| Library UI               | `src/components/library/LibraryPane.tsx`, list/details components                      |
| Import/export UI         | `src/components/import-export/ImportExportDialog.tsx`                                  |
| Authoring UI             | `src/components/details/CustomSpellForm.tsx`                                           |
| Deck model               | `src/domain/deck.ts`                                                                   |
| Cards/print              | `src/cards/Card.tsx`, `src/print/print.css` (only if fallback badges are rendered)     |
| Fixtures/tests           | `src/test/fixtures/spells.ts`, import/library/deck/resolution tests, Playwright suites |
| Docs                     | `docs/custom-spell-import-guide.md`, this document                                     |

## 18. Related documentation

- [`custom-spell-import-guide.md`](custom-spell-import-guide.md) — current custom spell format and import behavior.
- [`specs/MAIN-spec.md`](specs/MAIN-spec.md) — product specification.
- [`feature and change requests.md`](feature%20and%20change%20requests.md) — localization background and existing change requests.
- [`srd-data-pipeline.md`](srd-data-pipeline.md) — SRD per-language dataset model and fallback behavior.
