# Abbreviation Refactoring and Extensions — Implementation Plan

## Goal

Split the raw EN/DE abbreviation catalogs into dedicated modules, extend both catalogs with the
approved mappings, correct the English range/duration/spell-slot shorts, and keep behavior, tests,
and documentation in sync.

## Resolved decisions

- Refactor: **minimal split**. Add `abbreviations-en.ts` / `abbreviations-de.ts`; import them from
  `en.ts` / `de.ts`. Do not change `i18n.ts`, `abbreviations.ts`, runtime APIs, or `Translations`.
- `round` / `Runde`: remove from `EXCLUDED_EN` / `EXCLUDED_DE`; update shorts to `rnd.` / `Rnd.`.
- German `object`: keep `Gegenstand` → `Ggst.`; add `objects` with `Gegenstände` → `Ggstd.` and
  form `Gegenständen`.
- Number words participate in `up to` / `bis zu` so `up to one hour` → `≤ 1h`.
- `physisch`: add the same inflected suffixes as `psychisch`.
- English counterparts approved: `point`, `physical`, `following`, `option`, `illusory`,
  `at least`, `strength check`, and the six ability saving throws. `within` and the
  spellcasting-ability phrase are **not** approved.
- Numbers: add zero–ten and hundred; German uses `null`, `eins`–`zehn`, `hundert`.
- Item 3 is English-only: `rng.`, `dur.`, `slot`; German `RWt`, `WD`, `ZP` remain unchanged.

## 1. Refactor the catalog data

Create:

- `src/locales/abbreviations-en.ts`
- `src/locales/abbreviations-de.ts`

Each file exports the current `abbreviations` object:

```ts
import type { AbbreviationDefinition } from "./abbreviation-types.ts";

export const abbreviationsEn = {
  // current entries plus the changes below
} as const satisfies Record<string, AbbreviationDefinition>;
```

In `en.ts` / `de.ts`, import the matching const and replace the inline block with
`abbreviations: abbreviationsEn,` / `abbreviations: abbreviationsDe,`. Keep `Translations` and
`abbreviations.ts` unchanged. `docs/abbreviations.md` line 30 and the module notes in
`docs/DEVELOPMENT.md` (around lines 153–159, 296–299, and 361–367) must name the new data files.

## 2. Catalog changes

### Numbers (shared IDs in both catalogs)

| IDs | English full → short | German full → short |
| --- | --- | --- |
| zero | zero → 0 | null → 0 |
| one–nine | one → 1 … nine → 9 | eins → 1 … neun → 9 |
| ten | ten → 10 | zehn → 10 |
| hundred | hundred → 100 | hundert → 100 |

No eleven+, compound, or ordinal entries.

### German additions / updates

| ID | Full | Short |
| --- | --- | --- |
| add | addieren | add. |
| point | Punkt | Pkt. |
| for | für | f. |
| atLeast | mindestens | mind. |
| physical | physisch (suffixes `""`, `e`, `er`, `es`, `em`, `en`) | phys. |
| following | folgenden | folg. |
| option | Option | Opt. |
| spellcastingAbilityModifier | Zauberwirken-Attributsmodifikator | Zauberwirken-Attr.mod. |
| illusory | illusionär | illus. |
| object | Gegenstand (remove the current `Gegenstände` form) | Ggst. |
| objects | Gegenstände (form `Gegenständen`) | Ggstd. |
| strengthCheck | Stärkewurf | ST-Wurf |
| strengthSavingThrow | Stärkerettungswurf | ST-RW |
| constitutionSavingThrow | Konstitutionsrettungswurf | KO-RW |
| dexteritySavingThrow | Geschicklichkeitsrettungswurf | GE-RW |
| intelligenceSavingThrow | Intelligenzrettungswurf | IN-RW |
| wisdomSavingThrow | Weisheitsrettungswurf | WE-RW |
| charismaSavingThrow | Charismarettungswurf | CH-RW |
| against | gegen | gg. |
| within | innerhalb | innerh. |
| round | Runde | Rnd. (update from `RD`) |

### English additions / updates

| ID | Full | Short |
| --- | --- | --- |
| including | including | incl. |
| condition | condition | cond. |
| against | against | vs. |
| round | round | rnd. (update from `RD`) |
| obviously | obviously | obv. |
| obvious | obvious | obv. |
| range | range | rng. (update from `RNG`) |
| duration | duration | dur. (update from `DUR`) |
| spellSlot | spell slot | slot (update from `SLOT`) |
| point | point | pt. |
| physical | physical | phys. |
| following | following | foll. |
| option | option | opt. |
| illusory | illusory | illus. |
| atLeast | at least | ≥ |
| strengthCheck | strength check | STR check |
| strengthSavingThrow | strength saving throw | STR save |
| dexteritySavingThrow | dexterity saving throw | DEX save |
| constitutionSavingThrow | constitution saving throw | CON save |
| intelligenceSavingThrow | intelligence saving throw | INT save |
| wisdomSavingThrow | wisdom saving throw | WIS save |
| charismaSavingThrow | charisma saving throw | CHA save |

### Exclusions

In `abbreviations.ts` remove `round` from `EXCLUDED_EN` and `EXCLUDED_DE`. Keep the remaining
entries. Update the documented exclusion lists and the exclusion tests.

## 3. Quantity matcher enhancement

In `abbreviation-transform.ts`, extend `matchQuantityAfter`:

- After skipping horizontal space, if the cursor is not a digit, try `matchAt` with the eligible
  catalog entries.
- Accept the match only when `entry.short` matches `/^\d+$/`.
- Use the entry's `short` as the numeric output, then continue with the existing time-unit
  compaction.
- Add an optional `number: MatcherEntry | null` to `QuantityMatch`, set it for this path, and
  record it with `recordApplied` in the caller.
- Leave the existing digit path unchanged.

This yields `up to one hour` → `≤ 1h`, `up to ten minutes` → `≤ 10min`, and
`bis zu zwei Stunden` → `≤ 2h`.

## 4. Documentation

- `docs/abbreviations.md`
  - Add the new catalog lines and number entries.
  - Update `range`, `duration`, `spell slot`, `round` / `Runde`, and `object` / `objects` lines.
  - Remove `round` / `Runde` from the exclusion lists.
  - Update disambiguation notes: `rng.` vs `RNG-R`; `Ggst.` singular vs `Ggstd.` plural.
  - Document number behavior: standalone number words convert; compounds, hyphenated forms,
    ordinals, and larger numbers do not; idioms such as `one another` / `no one` are not
    context-filtered.
  - Document that number words participate in `up to` / `bis zu`.
  - Mention the new data-file names.
- `docs/DEVELOPMENT.md`: update the abbreviation module description for the split data files.
- `docs/specs/MAIN-spec.md` §6: add written-number conversion and the `up to one hour` → `≤ 1h`
  behavior.
- `README.md`: mention written-number conversion in the Abbreviate paragraph.

## 5. Tests

Update and extend:

- `src/locales/abbreviations.test.ts`
  - `range.short` → `rng.`; add duration `dur.`, spellSlot `slot`, round `rnd.` / `Rnd.`.
  - Remove `round` from the remaining-exclusions test.
  - Update German `object` forms to `["Gegenstand"]`; add `objects` forms
    `["Gegenstände", "Gegenständen"]`; add `physical` forms.
  - Add number-entry and new-mapping assertions.
  - Update the locale-inventory test: German now has `objects`; English lacks `add`, `for`,
    `within`, and `spellcastingAbilityModifier`.
- `src/locales/abbreviation-transform.test.ts`
  - Update `point within RNG` → `point within rng.`.
  - Update `Gegenstände` / `Gegenständen` to `Ggstd.` and the affected prose expectations.
  - Update `up to one hour` → `≤ 1h`; add applied counts for the number entry.
  - Remove `Runde` from the excluded list; add `Runde` → `Rnd.`.
  - Replace the synthetic `round` exclusion test ID with `turn`.
  - Add tests for all new German/English mappings, numbers, case-insensitivity, longest-match
    behavior, and word-boundary negatives (`often`, `someone`, `one-handed`, `twenty-one`,
    `Gegenständlichkeit`, unconfigured inflections).
- `e2e/abbreviation.spec.ts`: optionally include a written number to exercise the end-to-end path.

## 6. Validation

Run:

- `pnpm exec vp check`
- `pnpm exec vp test --run`
- `pnpm run build`
- `pnpm exec playwright test e2e/abbreviation.spec.ts`

Do not commit generated `dist/` or `.wrangler/`.

## 7. Completion

After checks pass, update the documentation listed above and use this commit message:

```
feat(abbreviations): split catalog data and extend mappings

Move EN/DE abbreviation data into dedicated modules, add written-number
conversions, apply the approved German/English mappings and spell-slot
short corrections, and update the catalog documentation and tests.
```
