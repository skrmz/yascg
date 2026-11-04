# Plan: `react-i18next` for spell cards / details (en + de)

## Goal

Add `react-i18next` (installed with `pnpm`) with full TypeScript key typing and English
(fallback/default) + German locales, scoped strictly to **spell-card terminology**: card
labels, spell metadata terms, school/class names, component abbreviations, the card-body
"Higher Levels" heading, and the custom-spell edit form. No other app UI is localized.

## Decisions (confirmed with user)

1. **Locale source = existing spell-data language.** The `LanguagePicker` already sets
   `useApp().language` (`en`/`de` from `src/data/spell-languages.json`). A bridge syncs that
   value into i18next, so selecting "Deutsch" localizes both the SRD text and the card labels.
   No new UI control. Unknown codes (e.g. `fr` in tests) fall back to `en`.
2. **Coverage** = all hardcoded spell-card terms wherever rendered + `CustomSpellForm`:
   `Card.tsx`, `DetailsPane.tsx`, `LibraryPane.tsx` result-row subtitle, the card-body
   "Higher Levels" heading (`parse.ts` via `fit.tsx`), and `CustomSpellForm.tsx` field labels.
3. **Data-derived values localized at presentation only** (datasets untouched):
   school names, class names, and derived component letters (`V/S/M` → `V/G/M`).
4. **Locale storage** = TypeScript modules under `src/locales/` (no `resolveJsonModule` needed).
5. **German wording** = standard D&D 5e terms (catalog below).

## Approved adjustments (must hold)

1. **No global `document.documentElement.lang`.** Do not set it in the bridge. Instead set
   `lang` on the localized content containers: `CardView`'s `<article>`, the localized wrapper
   in `DetailsPane`, the `LibraryPane` row subtitle `<span>`, and the `CustomSpellForm`
   `DialogContent`. Use the resolved locale (`i18n.resolvedLanguage`).
2. **No temporary English render / stale fit.** (a) Set `initImmediate: false` in `src/i18n.ts`
   so resources exist on the first render. (b) Seed initial `lng` synchronously from the stored
   preference (`readLanguagePreference()` → `toUiLocale`) instead of hardcoding `"en"`, so a
   German user never flashes English before `AppProvider` resolves the manifest. (c) Derive all
   localized rendering **and** the fit heading from `i18n.resolvedLanguage` (via
   `useTranslation`), never from a separately-timed state, so labels and measurements always use
   the same locale. (d) Include the localized heading (and the resolved locale) in the
   `useCardFit`/`useDeckCardFits` deps so a language change forces a re-measure in the same tick
   as the label change (no stale cached fit).
3. **Class-name localization consistent everywhere in scope.** Classes render only in
   `Card.tsx` footer (text + `title`) and `DetailsPane` Classes value; both use the same helper.
   `CustomSpellForm`'s classes input is free-text authoring and the `LibraryPane` class filter
   are intentionally left raw (out of scope).
4. **`componentsDisplayOverride` preserved verbatim.** `componentSummary` returns the override
   untouched; only the derived letters are localized. `DetailsPane` keeps deriving letters (no
   override) with localized letters.
5. **Language-switch test (EN → DE → EN) covering fit + overflow** (see Tests).
6. **`satisfies Translations`** for German resources (not a type annotation).
7. **Single-lookup class helper, no non-null assertions** (see `labels.ts` / usage pattern).
8. **`pnpm build` is mandatory validation**, not optional.

## Exact German terminology (authoritative)

- Metadata: Casting Time → `Zeitaufwand`; Range → `Reichweite`; Components → `Komponenten`;
  Duration → `Wirkungsdauer`; Material → `Material`; Classes → `Klassen`;
  Higher Levels → `Höhere Grade`.
- Terms: Cantrip → `Zaubertrick`; Level {{n}} → `Grad {{n}}`; Concentration → `Konzentration`;
  Ritual → `Ritual`.
- Schools: Abjuration→`Bannmagie`, Conjuration→`Beschwörung`, Divination→`Erkenntnismagie`,
  Enchantment→`Verzauberung`, Evocation→`Hervorrufung`, Illusion→`Illusion`,
  Necromancy→`Nekromantie`, Transmutation→`Verwandlung`.
- Classes: Bard→`Barde`, Cleric→`Kleriker`, Druid→`Druide`, Paladin→`Paladin`,
  Ranger→`Waldläufer`, Sorcerer→`Zauberer`, Warlock→`Hexenmeister`, Wizard→`Magier`.
- Components: Verbal→`V`, Somatic→`G`, Material→`M`.
- Card-only: Content truncated → `Inhalt gekürzt`; Card {{i}} of {{n}} → `Karte {{i}} von {{n}}`;
  Continued from Card {{n}} → `Forts. von Karte {{n}}`.

## Dependencies

- `pnpm add i18next react-i18next` (runtime deps in `package.json`).
- Then run `vp install`.

## Files to create

### `src/locales/en.ts`
- `export const en = { ... } as const;` — full catalog (see below).
- Export `type Translations` = deep-shape version of `typeof en` where every string leaf
  becomes `string` (so German values may differ). Keep `en` `as const` so i18next can infer
  key paths **and** `{{interpolation}}` variables from English literals.
- Pattern:
  ```ts
  type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };
  export type Translations = DeepString<typeof en>;
  ```

### `src/locales/de.ts`
- `import type { Translations } from "./en.ts";`
- `export const de = { ... } satisfies Translations;` — compile-time key/shape parity with
  English, retaining literal value types.

### `src/locales/labels.ts`
Presentation-layer helpers that return **translation keys** (keeps `t()` fully typed and
avoids passing `TFunction` around). Single lookup, no non-null assertions:
- `SCHOOL_KEYS: Record<SpellSchool, ...>` (keyed by canonical enum value, e.g. `Abjuration`)
  and `schoolKey(school: SpellSchool)`.
- `CORE_CLASS_KEYS: Record<CoreClass, ...>` and `classKey(name: CharacterClass)` returning the
  exact key literal or `null` for custom classes. Callers do:
  ```ts
  const key = classKey(name);
  return key ? t(key) : name;
  ```
- `COMPONENT_KEYS` + `componentKey(component: "verbal" | "somatic" | "material")`.
- `levelLabelKey(level: number)` → `"spell.level.cantrip"` when `level === 0`, else
  `"spell.level.level"` (caller passes `{ level }`).

### `src/i18n.ts` (entry config)
- `import i18n from "i18next"; import { initReactI18next } from "react-i18next";`
- Init: `resources: { en: { translation: en }, de: { translation: de } }`,
  `lng: toUiLocale(readLanguagePreference() ?? "en")`, `fallbackLng: "en"`,
  `supportedLngs: ["en", "de"]`, `interpolation: { escapeValue: false }`, `returnNull: false`,
  and **`initImmediate: false`** (synchronous init, first render has resources).
- Export `UI_LOCALES = ["en", "de"] as const`, `type UiLocale`, and
  `toUiLocale(code: string): UiLocale` (`de` → `de`, everything else → `en`).
- Module augmentation for strong typing:
  ```ts
  declare module "i18next" {
    interface CustomTypeOptions {
      defaultNS: "translation";
      resources: { translation: typeof en };
    }
  }
  ```
- If i18next's `resources` type rejects the `as const` object, cast that init object `as const`
  or `as { translation: typeof en }` (only known friction point).

## Files to modify

### `src/main.tsx`
- Add `import "./i18n.ts";` as the first import (before `./App.tsx`) so i18next is initialized
  before any component renders.

### `src/App.tsx`
- Add `UiLocaleBridge`: read `useApp().language`, map via `toUiLocale`, and call
  `i18n.changeLanguage(code)` when `i18n.resolvedLanguage !== code`. **Do not** touch
  `document.documentElement.lang`. Render it inside `<AppProvider>`.

### `src/markdown/parse.ts`
- Change `parseSpellBody(spell, higherLevelsHeading: string = "Higher Levels")` and build the
  heading block from the parameter (keep the existing `HIGHER_LEVELS_HEADING` export; the default
  preserves current English behavior and the existing test).

### `src/cards/fit.tsx`
- In `useCardFit` and `useDeckCardFits`, call `useTranslation()` and pass
  `t("spell.higherLevels")` into `parseSpellBody`. Add **both** the resolved heading string and
  `i18n.resolvedLanguage` to the relevant `useMemo`/`useEffect` deps so a language change
  re-measures in the same tick as the label change (no stale fit). The fit cache key already
  includes `language`; the fingerprint now also includes the localized heading.

### `src/cards/Card.tsx`
- `useTranslation()` in `CardView`; set `lang={i18n.resolvedLanguage}` on the `<article>`.
- `metadataRows(spell, t)`: labels via `spell.metadata.castingTime|range|components|duration`.
- Level label: `t(levelLabelKey(spell.level), { level: spell.level })`.
- Flags: `t("spell.flag.concentration")` / `t("spell.flag.ritual")`.
- School: `t(schoolKey(spell.school))` in the subtitle.
- `componentSummary`: if `componentsDisplayOverride` is present, return it **verbatim**;
  otherwise map enabled components to `t(componentKey(...))` joined with `", "`.
- Classes: `const key = classKey(name); key ? t(key) : name` joined with `", "`, used for both
  the `title` and the visible text.
- Footer: `t("card.continuedFrom", { index: cardIndex - 1 })` and
  `t("card.continuation", { index: cardIndex, count: cardCount })`.
- Overflow badge: `t("card.truncated")`.

### `src/components/details/DetailsPane.tsx`
- Translate the spell-attribute labels (Casting Time/Range/Duration/Components/Material/
  Classes), the component letter block (localized letters, `—` unchanged), the Concentration/
  Ritual badges, and the "Higher Levels" heading.
- Classes value: single lookup per name (`const key = classKey(name); key ? t(key) : name`).
- Set `lang` on the localized detail wrapper (not `document.documentElement`).
- Leave non-spell chrome in English (empty state, fit/status/truncation messages, delete
  dialog) per scope.

### `src/components/library/LibraryPane.tsx`
- Only the result-row subtitle: replace `spell.level === 0 ? "Cantrip" : `Level ${level}`` and
  raw `spell.school` with `t(levelLabelKey(...), { level })` and `t(schoolKey(spell.school))`,
  and set `lang` on that subtitle `<span>`.
- Do **not** touch the School/Class `MultiSelect` filters or other library chrome.

### `src/components/details/CustomSpellForm.tsx`
- Field labels: Name, Level (0-9), School, Casting time, Range, Duration, Concentration,
  Ritual, Verbal, Somatic, Material, Material description, Classes (comma-separated),
  Description (Markdown), Higher levels (Markdown, optional).
- School `<option>` display via `t(schoolKey(school))` while `value` stays the canonical enum.
- Dialog title (`form.title.new`/`form.title.edit`), description, and `Save spell`.
- Validation messages with `{{max}}`: `form.error.castingTime|range|duration`.
- The classes input stays raw free text (authoring; not localized).
- Set `lang` on `DialogContent`. Keep generic chrome (e.g. `Cancel`) in English.

### `src/test/setup.ts`
- Add `import "../i18n.ts";` so any component test has translations initialized.

## Key catalog (single `translation` namespace)

```
spell.metadata.castingTime   "Casting Time" / "Zeitaufwand"
spell.metadata.range         "Range" / "Reichweite"
spell.metadata.components    "Components" / "Komponenten"
spell.metadata.duration      "Duration" / "Wirkungsdauer"
spell.metadata.material      "Material" / "Material"
spell.metadata.classes       "Classes" / "Klassen"
spell.higherLevels           "Higher Levels" / "Höhere Grade"
spell.level.cantrip          "Cantrip" / "Zaubertrick"
spell.level.level            "Level {{level}}" / "Grad {{level}}"
spell.flag.concentration     "Concentration" / "Konzentration"
spell.flag.ritual            "Ritual" / "Ritual"
component.verbal             "V" / "V"
component.somatic            "S" / "G"
component.material           "M" / "M"
school.abjuration|conjuration|divination|enchantment|evocation|illusion|necromancy|transmutation
class.bard|cleric|druid|paladin|ranger|sorcerer|warlock|wizard
card.truncated               "Content truncated" / "Inhalt gekürzt"
card.continuedFrom           "Continued from Card {{index}}" / "Forts. von Karte {{index}}"
card.continuation            "Card {{index}} of {{count}}" / "Karte {{index}} von {{count}}"
form.title.new               "New custom spell" / "Neuer eigener Zauber"
form.title.edit              "Edit custom spell" / "Eigenen Zauber bearbeiten"
form.description             (English sentence) / local DE sentence
form.name/level/school       Name / Grad (0-9) / Schule
form.materialDescription     "Material description" / "Materialbeschreibung"
form.classes                 "Classes (comma-separated)" / "Klassen (durch Kommas getrennt)"
form.descriptionField        "Description (Markdown)" / "Beschreibung (Markdown)"
form.higherLevels            "Higher levels (Markdown, optional)" / "Höhere Grade (Markdown, optional)"
form.save                    "Save spell" / "Zauber speichern"
form.error.castingTime|range|duration   "... at most {{max}} characters." / DE equivalents
```
Reuse `spell.metadata.*` for the form's casting-time/range/duration labels.

## Tests

- `src/locales/locales.test.ts`:
  - Runtime key-parity walk between `en` and `de`.
  - Spot-check `i18n.t("spell.level.cantrip", { lng: "de" }) === "Zaubertrick"`, a school name,
    a class name, and a component letter.
- `src/cards/fit.i18n.test.ts` (deterministic, no layout): call `parseSpellBody(spell, heading)`
  with an English and a German heading and drive `computeFit` with a **fake deterministic
  `measure`** so fitting and the overflow path are asserted for both locales (multi-card and
  auto-shrink). Confirms localized headings fit/overflow identically in logic.
- `src/cards/Card.i18n.test.tsx`: render `CardView` under `de` and assert `Zaubertrick`,
  `Zeitaufwand`, `G`, `Hervorrufung`, `Konzentration`, and localized class names.
- **EN → DE → EN test** (`src/cards/language-switch.test.tsx` or E2E): switch locale en→de→en and
  assert (a) labels localize and revert, (b) `lang` attributes update, (c) card fitting output is
  stable/consistent across the round trip (same font size / card count for identical content),
  and (d) overflow/truncation state is unchanged for the same spell. Real layout is needed for
  (c)/(d), so cover it with a small Playwright spec `e2e/i18n-cards.spec.ts` (add a spell, cycle
  EN→DE→EN via `LanguagePicker`, assert localized card terms, `.card-preview-page` visible, and
  no overflow/truncation warning). Keep the unit-level deterministic `computeFit` test as the
  fast guard.

## Boundaries / explicitly out of scope

- No edits to bundled/generated SRD datasets (`src/data/**`) or normalization scripts; all
  school/class/component localization is presentation-only.
- Not localized: header/app chrome, library filter dropdowns (`MultiSelect` values double as
  `filterSpells` enums, so labels cannot change without a value/label split), print dialog, deck
  pane, dialogs, About/Offline status, aria labels, error/status messages.
- The `CustomSpellForm` classes input stays raw (authoring).
- Licensing notices/attribution untouched.

## Validation (mandatory)

1. `vp install` then `vp check` (typecheck + lint) — must pass, including new key typing.
2. `vp test` — all suites above.
3. `pnpm build` — **required**; must succeed (runs `normalize:srd` + `vp build`).
4. Targeted E2E: `pnpm test:e2e e2e/app.spec.ts e2e/language.spec.ts e2e/print.spec.ts
   e2e/i18n-cards.spec.ts`. Default locale stays `en`, so existing assertions hold; switching to
   Deutsch now also localizes card labels (expected; no existing spec asserts those labels).

## Risks / notes

- i18next `resources` may need a cast to accept the `as const` locale object (only friction
  point).
- `initImmediate: false` + preference-seeded `lng` are essential to avoid a first-paint English
  flash for German users; verify by loading with `spellCards.language = "de"` persisted.
- `useCardFit`/`useDeckCardFits` must re-run on locale change; keep the heading string and
  `i18n.resolvedLanguage` in deps or measurements go stale.
- German cards now show `Grad 3 · Hervorrufung` and `Waldläufer`, while library filter dropdowns
  still list canonical English values — documented, intentional boundary.