# Locale-independent abbreviation catalogs and inflection-aware matching

## Goal

Refactor the abbreviation catalog model so locale inventories are independent and one catalog definition can match a small, explicitly configured set of inflected forms. Preserve the existing Abbreviate/Undo workflow, Markdown protection, boundaries, eligibility, exclusions, diagnostics, and all unrelated behavior.

## Decisions

- Keep the catalog data in `src/locales/en.ts` and `src/locales/de.ts`, but stop requiring cross-locale abbreviation keys. Abbreviation definitions are data inside the locale module; UI-string key parity continues to use `satisfies Translations`.
- Add an opt-in definition shape:
  ```ts
  interface AbbreviationDefinition {
    readonly full: string;      // base form
    readonly short: string;     // shared replacement
    readonly suffixes?: readonly string[]; // full + suffix
    readonly forms?: readonly string[];    // explicit irregular alternatives
  }
  ```
  Generated surfaces are `full` plus every `full + suffix`, plus every explicit `forms` entry. Entries without these fields keep exact-match behavior.
- Consolidate redundant German inflections and remove no-op parity-only entries. Do not add automatic stemming, grammar inference, or locale fallbacks.
- Keep the existing `abbreviationCatalog`, `isAbbreviationEligible`, exclusion, transform, and form APIs. Add a locale-safe shared-ID type for structured lookup accessors and extend `AbbreviationEntry` with generated `forms`.

## 1. Catalog types and typing

Files: `src/locales/en.ts`, `src/locales/de.ts`, new `src/locales/abbreviation-types.ts` (or equivalent), `src/locales/abbreviations.ts`, `src/locales/locales.test.ts`.

1. Add the `AbbreviationDefinition` type in a module that both locale files and `abbreviations.ts` can import without a runtime cycle.
2. In `en.ts`:
   - Keep `abbreviations` as `as const`.
   - Change `Translations` so it excludes `abbreviations` from the deep UI-string shape and accepts an independent catalog shape, for example:
     ```ts
     export type Translations = DeepString<Omit<typeof en, "abbreviations">> & {
       abbreviations: Record<string, AbbreviationDefinition>;
     };
     ```
   - This lets `de.ts` satisfy `Translations` while omitting English-only abbreviation keys and adding German-only keys.
3. In `abbreviations.ts`:
   - `AbbreviationId = keyof typeof en.abbreviations | keyof typeof de.abbreviations`.
   - Add `SharedAbbreviationId = keyof typeof en.abbreviations & keyof typeof de.abbreviations`.
   - Type school/class/component mappings and `abbreviationShort`/`abbreviationFull` with `SharedAbbreviationId`, so structured UI lookups cannot accidentally request a locale-specific prose-only ID.
   - Keep `AbbreviationEntry` as one entry per catalog definition:
     ```ts
     interface AbbreviationEntry {
       id: AbbreviationId;
       full: string;   // base definition full
       short: string;
       forms: readonly string[]; // base + suffixes + explicit forms, deduped
     }
     ```
   - Build `CATALOGS` from each locale’s own object, without casting German to the English key shape.
4. Update `locales.test.ts`: compare UI string leaf paths excluding `abbreviations`; the abbreviation catalog is validated by its own per-locale tests.
5. Update `docs/DEVELOPMENT.md` where it currently says `de` key parity covers all catalog keys and where it describes `abbreviations.ts`.

## 2. Catalog consolidation

Files: `src/locales/en.ts`, `src/locales/de.ts`, `src/locales/abbreviations.ts`, `src/locales/abbreviations.test.ts`, `docs/abbreviations.md`.

### English

- Remove exact duplicate `psychic2` and `psychic3`; keep one `psychic`.
- Remove no-op entries that exist only for cross-locale parity: `spell`, `self`, `touch`, `sight`, `sphere`, `cube`, `cone`, `line`, `bonus`, `or`, `hit`, `so-called`.
- Keep existing English inflection/plural entries (`foot`/`feet`, `object`/`objects`, `meter`/`meters`, `minute`/`minutes`, `hour`/`hours`) as explicit entries. They retain their IDs and outputs.
- Update `EXCLUDED_ABBREVIATION_IDS.en` to remove IDs no longer in the English catalog: `line`, `bonus`, `or`. Keep `round`, `turn`, `speed`, `presumably`, `possibly`, `inPart`.

### German

- Consolidate the adjective entries into one definition:
  ```ts
  psychic: { full: "psychisch", short: "psych.", suffixes: ["", "e", "er", "es", "em", "en"] }
  ```
  Remove `psychic2` and `psychic3`; the configured forms are `psychisch`, `psychische`, `psychischer`, `psychisches`, `psychischem`, `psychischen`.
- Consolidate nouns:
  ```ts
  object: { full: "Gegenstand", short: "Ggst.", forms: ["Gegenstände"] }
  meter:  { full: "Meter", short: "m", suffixes: ["", "s", "n"] }
  minute: { full: "Minute", short: "min", suffixes: ["", "n"] }
  hour:   { full: "Stunde", short: "h", suffixes: ["", "n"] }
  ```
  Remove `objects`, `meters`, `minutes`, and `hours`; outputs stay the same. The configured `meter` suffixes intentionally add `Meters` and `Metern`; no other new forms are introduced.
- Remove German no-op parity-only entries: `self`, `sight`, `cone`, `line`, `bonus`, `foot`, `feet`.
- Keep German-only meaningful definitions: `spell`, `touch`, `sphere`, `cube`, `or`, `so-called`, `hit`. They no longer need English counterparts.
- Update `EXCLUDED_ABBREVIATION_IDS.de` to remove `line` and `bonus`. Keep `round`, `turn`, `presumably`, `or`, `diameter`, `cube`.

Do not remove any ID used by `SCHOOL_ABBREVIATION_IDS`, `CLASS_ABBREVIATION_IDS`, `COMPONENT_ABBREVIATION_IDS`, Compact casting-time units (`minute`, `hour`), or the Compact/legend metadata lookups (`action`, `bonusAction`, `reaction`, `concentration`, `ritual`, `range`, `duration`). Every shared mapping ID must exist in both catalogs.

### Generated forms

In `abbreviations.ts`, generate `entry.forms` once while building `CATALOGS`:

```ts
new Set([full, ...(suffixes ?? []).map((suffix) => full + suffix), ...(forms ?? [])])
```

Trim/validate only for eligibility as today; matching uses the configured spelling exactly.

## 3. Validation

Files: `src/locales/abbreviations.ts`, `src/locales/abbreviations.test.ts`.

- Add a pure conflict detector that accepts catalog entries/definitions and a locale and checks normalized surfaces (`toLocaleLowerCase(locale).normalize("NFC")`).
- If one normalized surface maps to different `short` values, throw/report a validation error. Do not resolve by catalog order.
- If the same surface maps to the same `short` from multiple definitions, deduplicate deterministically. Use the lexicographically smallest `id` as the canonical diagnostic definition.
- Validate the full definition set, including excluded and ineligible definitions, before splitting eligible/excluded matchers.
- Export the conflict helper for tests; call it when building each locale matcher so a future catalog edit cannot silently create an ambiguous surface.
- Add a synthetic test proving two definitions with the same normalized surface and different shorts produce a conflict, plus tests proving the real catalogs have no conflicts.

## 4. Matcher integration

File: `src/locales/abbreviation-transform.ts`.

1. Replace the current `MatcherEntry` shape with:
   ```ts
   interface MatcherEntry {
     entry: AbbreviationEntry; // original catalog definition
     surface: string;          // generated form actually matched
     folded: string;           // locale-folded, normalized surface
   }
   ```
2. In `matcherFor(locale)`:
   - Build surface records for every form of every definition.
   - Validate conflicts and dedupe same-surface/same-short records.
   - Decide eligibility and exclusion per definition (`isAbbreviationEligible(entry, locale)` and `EXCLUDED_ABBREVIATION_IDS`). If a definition is ineligible or excluded, none of its forms become eligible; excluded definitions add all their forms to the excluded matcher.
   - Sort by descending `surface.length`, then folded surface, then `entry.id`, then surface, for deterministic longest-match precedence.
3. Update `foldedTerm` to take a surface string.
4. Update `matchAt` to use `candidate.surface.length` and compare the slice against `candidate.folded`; append `candidate.entry.short`; advance by `surface.length`.
5. Update `isPartOfLongerPhrase` to use `candidate.surface` and `longer.surface` for word comparisons and lengths, not the base `entry.full`.
6. Keep applied/skipped maps keyed by `AbbreviationId`; report `entry.full` (the base definition) and aggregate counts across all matched variants. Do not create diagnostics per generated form.
7. Preserve the existing Markdown mask, one-pass scan, idempotence, and unsupported-locale behavior unchanged.

## 5. Tests

Files: `src/locales/abbreviations.test.ts`, `src/locales/abbreviation-transform.test.ts`, `src/locales/locales.test.ts`, optionally `src/components/details/CustomSpellForm.test.tsx`.

### Catalog tests

- Rewrite documentation parity:
  - Parse `docs/abbreviations.md` into separate English and German inventories.
  - Support a missing-side marker, recommended `—`, so English-only and German-only definitions can be documented, for example `- foot = ft (—)` and `- — (Zauber = Z.)`.
  - Compare the English catalog to the documented English signatures and the German catalog to the documented German signatures independently. Do not pair entries by array index or compare locale key sets.
- Update i18n runtime assertions for retained shared IDs.
- Assert `forms` generation:
  - German `psychic` includes all six forms.
  - German `meter` includes `Meter`, `Meters`, `Metern`.
  - German `object` includes `Gegenstand` and `Gegenstände`.
- Assert locale-specific inventories:
  - English has no `spell`, `touch`, `sphere`, `cube`, `or`, `so-called`, or `hit`.
  - German has those and no `self`, `sight`, `cone`, `line`, `bonus`, `foot`, `feet`, `objects`, `meters`, `minutes`, `hours`.
- Assert every shared school/class/component/unit/metadata ID exists in both catalogs.
- Assert every locale exclusion ID exists in that locale’s catalog and remains ineligible.
- Assert no two generated surfaces in a locale map to different shorts.
- Assert no-op entries are ineligible wherever retained.

### Transform tests

Keep all existing tests. Add:

- German adjective inflection: every configured `psychisch*` form → `psych.`, including locale-insensitive case handling.
- German noun inflection: `Meter`, `Meters`, `Metern` → `m`; `Minute`/`Minuten` → `min`; `Stunde`/`Stunden` → `h`; `Gegenstand`/`Gegenstände` → `Ggst.`.
- Unsupported forms stay unchanged, e.g. `psychischste`, `MeterX`, `Gegenständlichkeit`, and embedded substrings.
- English exact behavior is unchanged, including existing `feet`, `objects`, `meters`, `minutes`, `hours` entries.
- English-only and German-only terms do not leak across locales (`spell` unchanged in English; `Zauber` → `Z.` in German).
- Longest-match precedence still wins with variants; exclusions apply to every form of an excluded definition.
- Diagnostics aggregate variants under the base definition ID/full and count, not one entry per generated form.
- Idempotence and Markdown protection remain correct with inflected forms.
- Conflicting generated variants are rejected by validation rather than resolved by order.
- Optionally add one `CustomSpellForm` integration assertion that a German inflected draft term is abbreviated and undone normally.

## 6. Documentation

Files: `docs/abbreviations.md`, `docs/DEVELOPMENT.md`, `docs/specs/MAIN-spec.md`, `docs/specs/abbreviation-of-spell-data-spec.md`.

- `docs/abbreviations.md`:
  - Document the definition shape (`full`, `short`, optional `suffixes`, optional `forms`) and that every generated form maps to the shared `short`.
  - Document that catalog inventories are locale-independent and that the parity test checks each locale separately.
  - Document the `—` missing-side convention for parity lines.
  - Replace plural-specific claims with generated-form examples.
  - Remove rows for removed entries and mark one-sided rows appropriately.
  - Document the German psychic noun/adjective forms and German noun variants.
  - Update the exclusion lists and no-op discussion to match the retained catalogs.
- `docs/DEVELOPMENT.md`: update the module map and localization section for independent catalogs, generated forms, conflict validation, and the matcher’s surface-based precedence.
- `docs/specs/MAIN-spec.md`: update the Abbreviate paragraph to say matching covers explicitly configured inflected forms and locale-specific definitions, while still never inferring unconfigured forms.
- `docs/specs/abbreviation-of-spell-data-spec.md`: reconcile the older key-parity and “no inflection” statements with this model.

## 7. Verification

Run:

- `vp check`
- `vp test`
- Focused tests while iterating: `vp test src/locales/abbreviations.test.ts src/locales/abbreviation-transform.test.ts`
- `pnpm run test:e2e` if the Workers preview suite is available, because prose matching behavior changes.

Acceptance:

- One German adjective definition matches all configured inflections.
- One German noun definition matches its configured case/number variants.
- Entries without inflection metadata match exactly as before.
- Unsupported inflections, unrelated words, and embedded substrings are unchanged.
- Generated variants obey longest-match, case, Unicode-boundary, exclusion, and idempotence rules.
- Conflicting generated surfaces fail validation.
- English-only and German-only definitions type-check and pass per-locale documentation parity.
- Markdown protection, undo, saved text, Classic/Compact rendering, and print behavior are unchanged.
- No generated SRD data, `dist/`, or `.wrangler/` changes.

## Risks

- Removing no-op parity entries changes `AbbreviationId`; keep every structured lookup ID shared and verified by tests.
- English plural IDs are intentionally retained while German plural IDs are consolidated, so docs parity must remain per-locale rather than key-count based.
- `suffixes` can add surfaces such as `Meters`/`Metern`; only explicitly configured forms may do so.
- Conflict validation must run on definition surfaces, not only eligible surfaces, to prevent excluded forms from masking ambiguity.
