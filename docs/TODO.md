# TODO

## Abbreviation catalog management

- German inflection makes the abbreviation catalog repetitive. Adjectives change their endings
  with gender, number, case, and determiner type, so supporting common prose forms currently
  requires near-duplicate entries such as:

  ```ts
  psychic: { full: "psychisch", short: "psych." },
  psychic2: { full: "psychischer", short: "psych." },
  psychic3: { full: "psychischen", short: "psych." },
  ```

  The same applies to nouns with different cases, for example `Zentimeter`, `Zentimeters`, and
  `Zentimetern`, which would each need a separate entry. A better solution is needed, such as
  locale-specific inflection rules or a stem/pattern-based entry model.
- `src/locales/en.ts` always needs a catalog entry even when `full` and `short` are identical in
  English, solely because the German term should be abbreviated. The catalog shape should allow
  language-specific entries that do not require a redundant English no-op entry.
