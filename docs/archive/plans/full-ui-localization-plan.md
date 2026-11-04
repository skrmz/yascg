# Full UI localization (English / German) — implementation plan

Date: 2026-10-26  
Spec: `docs/specs/full-ui-localization.md`

## 1. Objective and boundaries

Localize **all application-controlled, user-facing UI text** (including ARIA, validation, notices and errors) into English and German using the existing `react-i18next` instance, catalogs and spell-data language picker. The picker remains the **only** language control; English is the UI fallback. Preserve existing behavior and English wording where practical.

**Do not change:** SRD/generated datasets, spell-data translations, canonical filter/sort/fit/paper identifiers, storage keys or formats, exported JSON/filenames, deck resolution/confirmation behavior, custom content, card-fitting and print geometry, or offline caching. Do not add languages, a second locale preference, loading UI, or per-spell locale metadata. The *existing* data-load failure notice may gain a localized Retry action.

**Intentionally untranslated:** brand/product name; exact `SRD_ATTRIBUTION` (mark `lang="en"`); manifest language endonyms; dataset-authored names/descriptions and option text; user-entered and persisted names/content (including generated `(Copy)` suffix); export identifiers/filenames; technical diagnostics (logs only, except constrained import validation details). Document these exclusions in README.

## 2. Non-negotiable design rules

1. **Catalogs:** Extend `src/locales/en.ts` (source) and `de.ts` (`satisfies Translations`) with identical keys. Organize into `app`, `common`, `language`, `library`, `deck`, `print`, `importExport`, `about`, `offline`, `details`, `form`, `error`; reuse existing terminology keys. Keep synchronous `src/i18n.ts` initialization. Never translate at module scope.
2. **Runtime messages:** Store **typed descriptors**, never translated strings, in state. Implement `src/locales/messages.ts` with a catalog-validated `MessageDescriptor { key; values? }`, `message()`, `translateMessage(t, descriptor)`, `AppError extends Error` (descriptor plus useful diagnostic `.message`), and `toMessageDescriptor(error)`. Keys must be typed against the source catalog; check required interpolation parameters and restrict values to supported primitives (`string | number | boolean`) unless justified. Do not weaken types with `any` or unrestricted keys; test malformed/missing keys/values.
3. **Error privacy:** Render intentional `AppError` descriptors or a localized `error.generic` descriptor. Log unexpected technical errors (`console.error`), never render raw exception messages, stacks, URLs, statuses or sensitive diagnostics. File-import validation may expose *only* actionable, deliberately selected schema paths, field names, parser issues and constraints inside localized framing; prefer structured descriptors, never arbitrary caught-error text. Non-UI errors need no refactor.
4. **Language semantics:** UI locale is `toUiLocale(resolvedDatasetLanguage)` through existing `UI_LOCALES` mapping; `document.documentElement.lang` tracks that UI locale. Content `lang` is **not** the UI locale: use `resolveContentLanguage(spell, datasetLanguage)` at each displayed content boundary. Return the actual resolved dataset language only for text reliably originating in bundled SRD content; return `undefined` for custom or mixed/uncertain-origin text (including imported custom spells and SRD overrides when provenance does not establish the rendered text's language). Do not infer from UI locale, identifier or import source. No custom locale field in this task. Keep `index.html` `lang="en"` before JS.
5. **Translations:** Use complete phrases/sentences, i18next interpolation and `_one`/`_other` plurals; split multi-count explanations into independently translatable sentences. Preserve canonical underlying values and dataset-authored labels. Check natural German wording and accessible names as well as visible labels. Type safety risk: i18next typed `t` / `ParseKeys` can reject base keys when `_one`/`_other` suffixes are used; address early with typed helper functions or exact key mappings rather than weakening catalog types with `any` or disabling strict checking.
6. **Transition atomicity:** No new language becomes visible before its dataset load and deck-impact processing succeed. Pending, rejected, cancelled and failed interactive switches retain the last committed application language, i18next locale and document `lang`. On success, synchronize UI/document locale **before paint** of committed state. Retain `requestLanguageSwitch`/`confirmLanguageSwitch` and existing confirmation logic. Only the latest applicable async operation may commit; ignore/cancel stale successes/failures and results after unmount.

## 3. Initialization and state transition contract

The current `UiLocaleBridge` can overwrite a persisted German locale with the provider's temporary initial "en" before the manifest/dataset resolves; correct this without adding another preference. Initial load has three distinct branches requiring explicit handling: supported persisted language (`ready`), unsupported preference fallback to English (`ready` plus descriptor notice), and dataset load failure (`failed`, English fallback, retry affordance; bridge currently lacks a status gate for this failure path).

- Add provider `languageStatus: "loading" | "ready" | "failed"` (initial `loading`): a resolution status, **not** a second selection.
- `src/i18n.ts`: derive persisted UI locale once, initialize i18next synchronously and apply initial document `lang` when DOM exists. Export `applyDocumentLanguage(code)`.
- `UiLocaleBridge` (`src/App.tsx`): **do nothing** while `loading`; in `ready`, pre-paint-sync i18next and document `lang` to `toUiLocale(language)`; in `failed`, pre-paint-sync both to English (layout effect or equivalent).
- Successful initial load: resolve via `resolveInitialLanguage`, commit dataset/language and `ready`. Unsupported persisted preference: resolve to English, clear stale preference, set `ready`, emit a **descriptor** fallback notice. Initial load failure: set application language to English, `failed`, and generic `dataError` descriptor; log detail, preserve stored preference for Retry, and **do not duplicate** the failure in `languageNotice`.
- Retry sets `loading`, re-resolves and obeys the same success/fallback/failure paths. Protect overlapping initialization, retry and switch requests with existing cancellation/sequencing or a minimal generation guard; stale responses cannot change dataset, language, status, errors or notices.
- Interactive switches commit as one logical operation only after confirmation, loading and deck-impact processing. Keep all three language representations consistent and never paint mixed-language chrome. A failure notice for an interactive switch uses the still-committed UI locale.

## 4. Implementation work packages (in order)

### A. Shared foundations and global state

**Files:** `src/locales/messages.ts` (new), `content-language.ts` (new), `en.ts`, `de.ts`, `i18n.ts`, `src/App.tsx`, `src/state/AppProvider.tsx`.

- Implement rules in §§2–3. Change `languageNotice`, `dataError`, `deckError`, `DeckConflictState.message`, import/export notices and `StorageNotice` to descriptors, translated **at render**; retain typed counts/codes (not translated confirmation text) in `pendingLanguageSwitch`.
- `AppShell`: translate tabs, dismiss ARIA, conflict and language-switch dialogs, pluralized affected-entry and distinct-spell counts, reassurance and actions. Render notice/conflict descriptors with `translateMessage`.
- Surface `dataError` via the **existing** notice banner with localized Retry (`retryData`) and working dismissal; do not add another status UI. Log storage failures while displaying generic localized messages.
- Expose `resolveContentLanguage` as a single provenance-aware boundary so future per-spell locale support changes only the helper, not call sites.

### B. Shared chrome and controls

| Component                | Required coverage                                                                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/Dialog.tsx`      | Optional `closeLabel`; default `t("common.close")` from `useTranslation` inside `DialogContent`; long-title wrapping.                                                                                                                                                                                                            |
| `src/ui/MultiSelect.tsx` | Default search/ARIA placeholder, All, selected count, No options, Clear; explicit caller labels override defaults. Note: adding useTranslation defaults to Dialog and MultiSelect changes default ARIA names globally; update or wrap isolated component tests that render without an I18nextProvider or mock translation hooks. |
| `LanguagePicker.tsx`     | Trigger/list ARIA (`Spell data language: …`, `Spell data languages`); retain manifest endonyms.                                                                                                                                                                                                                                  |
| `OfflineStatus.tsx`      | Four statuses, Retry label/ARIA, update action.                                                                                                                                                                                                                                                                                  |
| `AboutDialog.tsx`        | Trigger/ARIA/title/descriptions; exact English legal attribution with `lang="en"`.                                                                                                                                                                                                                                               |
| `AppShell.tsx` / header  | Application tabs/notices/dialogs; brand stays unchanged.                                                                                                                                                                                                                                                                         |

### C. Library, details and cards

- `library/LibraryPane.tsx`, `LevelRangeSlider.tsx`: localize search/region, slider values and thumb ARIA, filters (reuse `labels.ts`), advanced filters, source chips, reset, result counts, headings, add/append/replace/create, empty states, replace confirmation and toasts. Preserve filter/sort values and dataset-authored casting-time/range/duration options. Apply content `lang` to spell **names** only from `resolveContentLanguage`; metadata subtitles use UI locale.
- `details/DetailsPane.tsx`, `SpellDetailsDialog.tsx`, `SpellDetailsContent.tsx`: localize empty/measuring/fit states, card counts, Add/Edit/Duplicate/Delete, confirmations and toasts; log fit errors and display a generic localized error. Use resolved content `lang` for spell text, localized UI language for metadata. Keep the dialog's explicit localized close label.
- `cards/Card.tsx`: optional `contentLanguage`; emit `lang` only if defined, **never** default to UI locale. Pass the helper result from visible previews, Details, `PrintDialog`/`PrintSheets`; hidden measuring layers may omit it.
- `details/CustomSpellForm.tsx`: use `common.cancel`; map Zod `issue.path`/`issue.code` and explicit length constraints to localized validation keys, never display `issue.message`. Preserve canonical field values/defaults and SRD read-only behavior.

### D. Deck, print and import/export

- `deck/DeckPane.tsx`: localize labels/placeholders, unsaved state, saves and saved-deck selector, all actions/dialogs/repair flows, counts, fit labels, row statuses/ARIA, empty state and toasts. Keep `auto-shrink`/`multi-card` **values** and deck names unchanged. Widen/wrap fixed controls where German text truncates (e.g. `Automatisch` / `Mehrkarte`).
- `print/PrintDialog.tsx` and `PrintSheets`: localize title, descriptions, paper/borders/options/ARIA, pluralized card count, overflow/omissions, checkbox, preparing/empty states and actions. Preserve `letter`/`A4` identifiers, paper names and units. Pass actual dataset language to `PrintSheets` and resolve each visible card's content `lang`.
- `import-export/ImportExportDialog.tsx`: descriptors for `notice.text`, `analysis.error`, override `reason` and provider `dataError`; localize sections, collision choices, summaries/counts, lossy/unknown-version states, confirm/reset/commit and toast. Record/index/locale identifiers remain data. Preserve export shape, names, versions and collision behavior.

### E. UI-exposed errors only

Refactor **only** thrown errors currently intentionally surfaced to users; retain useful diagnostic `Error.message` and existing behavior.

| Area                                       | Handling                                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `db/active-deck.ts`                        | `DeckConflictError` descriptor; retain expected/actual values.                                                                |
| `db/saved-decks.ts`                        | Saved-deck conflict, name-length and missing-deck descriptors.                                                                |
| `db/custom-spells.ts`                      | Save/duplicate/delete/undo errors presented through provider.                                                                 |
| `domain/srd-overrides.ts`                  | Validation result descriptors; update form/import and `putSrdOverride` callers.                                               |
| `io/import-custom.ts`, `io/import-deck.ts` | Import errors/validation descriptors; include actionable, sanitized details only. `ImportConflictError` may include spell ID. |
| `services/data/load.ts`                    | Generic user-facing load descriptor; log technical details, never expose URL/status/underlying error.                         |

Leave database migrations, ID generation, context misuse and other purely internal errors untouched.

## 5. Catalog conventions

Use the groups in §2 and consistent terminology; only label strings translate, never stored data. Suggested EN → DE equivalents:

| English                 | German                         | English                | German                        |
| ----------------------- | ------------------------------ | ---------------------- | ----------------------------- |
| Library / Spell library | Bibliothek / Zauberbibliothek  | Details / Deck         | Details / Deck                |
| Active / Saved deck     | Aktives / Gespeichertes Deck   | Unsaved                | Nicht gespeichert             |
| Search / Results        | Suchen / Ergebnisse            | Advanced Filters       | Erweiterte Filter             |
| Reset filters / Any     | Filter zurücksetzen / Beliebig | Yes / No               | Ja / Nein                     |
| Source / Custom / SRD   | Quelle / Eigen / SRD           | Entries / Printable    | Einträge / druckbar           |
| Missing / Not available | fehlend / nicht verfügbar      | Print settings / Paper | Druckeinstellungen / Papier   |
| Cutting borders         | Schnittlinien                  | Import / Export        | Importieren / Exportieren     |
| Collision strategy      | Konfliktbehandlung             | Skip / Keep both       | Überspringen / Beide behalten |
| Overwrite existing      | Vorhandenes überschreiben      | About / Retry          | Über / Erneut versuchen       |
| Update available        | Update verfügbar               | Switch language        | Sprache wechseln              |
| Cancel / Close          | Abbrechen / Schließen          |                        |                               |

## 6. Verification (implement alongside each package)

**Unit/component tests**

- Catalog parity, representative German keys, valid/missing interpolation, `_one`/`_other` plurals (library/deck/print/switch), `toUiLocale`, document `lang`, and typed descriptor validity; test `translateMessage` and that unexpected errors log detail but yield only `error.generic` without raw text.
- Provider: persisted supported locale, unsupported preference + cleared preference + English notice, initial load failure + English + `failed` + Retry, retry resolution, overlapping/obsolete success/failure, unmount, and commit consistency. Verify notices created earlier re-render after success but stay unchanged on cancellation/failure; no stale messages/commits.
- Content provenance: bundled SRD, imported custom, SRD overrides and mixed-origin text; test actual dataset `lang` versus omission for uncertain/custom content.
- German labels, ARIA, plural messages, validation and preserved canonical values in `LibraryPane`, `DeckPane` (new), `PrintDialog` (new), `ImportExportDialog`, `DetailsPane`, `SpellDetailsDialog`, `CustomSpellForm`, and `OfflineStatus`/`AboutDialog` where not indirectly covered. Assert no raw Zod issues or technical exception details appear.

**E2E**

- `e2e/language.spec.ts`, `language-partial.spec.ts`: German switch, persistence/reload, `html[lang]`, confirmation-required/cancel/confirm flows, card/deck continuity and no interim language change.
- Failed interactive switch (e.g. German dataset HTTP 500) retains original labels/document `lang` and displays failure in existing locale; failed initial load falls back to English with Retry and no mixed-language chrome.
- Preseed `spellCards.language=de` before navigation. Verify that synchronous i18next initialization sets the document language to `de` before the first application paint, without an intervening English UI render. Preserve static `index.html` with `lang="en"` as the pre-JavaScript fallback.
- Cover library/deck/print/import/about/offline and accessible labels in German; verify canonical filter/paper values and no horizontal overflow at desktop/narrow widths. Update English-chrome assertions in `e2e/i18n-cards.spec.ts`, `continuation-cards.spec.ts` and other German-state tests.

**Manual/structural audit**

- Review German grammar, terminology, pluralization, interpolation and screen-reader wording; obtain proficient German review if available. Check long strings without changing card fitting/print geometry.
- Inspect **all** `src/**`, including non-JSX utilities/providers/db/io/services/cards, for user-visible JSX, ARIA/placeholder/title/alt, toast/dialog/notice/error strings, `document.title`/meta text and assembled sentences. Every remaining hardcoded string must be a documented exclusion. Verify no module-scope translation.
- Check content `lang`: bundled provenance → actual dataset; custom/uncertain → omitted; legal → `en`; document → UI locale. Ensure card fitting remeasures on language changes.
- Update README localization and architecture sections: full scope, sole picker, sync initialization, persisted preference and fallbacks, catalogs/key parity, canonical values, language statuses, document/content `lang`, error policy and exclusions.

## 7. Final validation and reporting

Run in order:

```sh
pnpm exec vp check
pnpm exec vp test
pnpm build
pnpm exec playwright test
```

Use targeted unit/E2E runs during development. Build **before** Playwright (preview uses built assets); avoid stale preview servers. Investigate failures and separately report genuinely pre-existing failures. In particular, verify the pre-existing possible mismatch at `src/print/PrintSheet.test.tsx:73` (`Card 2 of 2` vs `en.card.pageNumber` value `{{index}}/{{count}}`) before attributing it to localization.

**Done when:** all application-controlled visible/accessible text is EN/DE or explicitly excluded; descriptors, types, plurals and sanitized errors work; initial/interactive languages commit atomically without stale async effects; content provenance determines `lang`; prior canonical behavior and printed output remain intact; German UI fits; tests/build/E2E pass (or unrelated failures are itemized); README and final `src/**` audit are complete.

## 8. Acceptance checklist
    
- [ ] All app-controlled chrome, controls, placeholders, dialogs, notifications, validation, and accessibility labels render in EN/DE from existing catalogs.
- [ ] The existing LanguagePicker remains the sole control for spell-data and UI language.
- [ ] Successful switches update the UI immediately and persist; cancelled/failed switches retain previous language; confirmation-required switches keep current language until confirmed.
- [ ] Initial render uses persisted language without an English flash; supported, unsupported fallback, and load failure all synchronize document and UI language consistently.
- [ ] Dynamic messages, interpolation, and plurals work; no raw app-authored English appears in German UI outside documented exclusions.
- [ ] Unexpected exception details are logged (console.error), not rendered; import validation detail is the only intentional exception.
- [ ] Bundled SRD content uses resolved dataset lang; custom-spell content omits lang attribute.
- [ ] Language-dependent notices update correctly after successful switch, cancellation, fallback, and loading failure; no stale messages remain.
- [ ] Canonical filter/sort/fit/print values, persisted formats, datasets, and card fitting geometry remain unchanged.
- [ ] Language transitions commit atomically; cancelled or failed switches preserve previous committed state without mixed-language chrome.
- [ ] Stale async responses (initialization, retry, switch) cannot overwrite newer state or notices.
- [ ] Translation descriptors use catalog-validated keys and primitives; malformed interpolation is caught by unit tests.
- [ ] Imported custom spells and SRD overrides obey verified provenance rules.
- [ ] Import validation feedback exposes only intentionally selected schema paths/constraints, never raw exception text.
- [ ] German UI text, pluralization, terminology, and ARIA labels are verified for linguistic correctness.
- [ ] README accurately documents full localization, fallback, persistence, and exclusions.
