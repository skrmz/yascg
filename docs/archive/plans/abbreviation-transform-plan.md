# Manual abbreviation of custom spell text — implementation plan

Source specification: `docs/specs/abbreviation-of-spell-data-spec.md`.
This plan keeps the specification’s architecture and adopts the approved policy adjustments that
override its §5.2, §5.3, §5.4, and §12 baseline recommendations.

## 1. Goal and approved policy

Add a user-triggered **Abbreviate** action and **Undo abbreviation** action to the non-SRD
custom-spell editor. The actions transform only draft spell-data fields, never UI labels, and
nothing is persisted until the existing save path succeeds.

Approved policy decisions:

- **Standalone game terms are eligible.** Do not exclude `action`, `reaction`, or `damage`
  (English) or their localized equivalents (German) merely because they are common words.
  - English: `action` → `A`, `reaction` → `R`, `damage` → `dmg`.
  - German: `Aktion` → `A`, `Reaktion` → `R`, `Schaden` → `SCH` from the localized catalog.
  - Longer phrases still win: `bonus action` → `BA`, `damage resistance` → `RES`,
    `Schadensresistenz` → `RES`.
- **Time-unit abbreviations are eligible, including plurals.** Existing catalog shorts remain
  authoritative: English `minute`/`minutes` → `MIN`, `hour`/`hours` → `HR`,
  `meter`/`meters` → `MTR`; German `Minute`/`Minuten` → `min`, `Stunde`/`Stunden` → `Std.`,
  `Meter`/`meters` → `m`. Do not change these shorts to lowercase: `castingBaseDisplay` uses the
  same catalog values, and changing them would alter existing Compact card output.
- **Field-label terms in prose are eligible.** Do not exclude `casting time`, `range`, or
  `duration` only because the same words are UI labels. UI labels themselves remain untouched.
- **Preserve existing Classic/Compact behavior.** Do not edit design-dependent card labels,
  Compact glyph/quantity rendering, the Legend, or any `spell.metadata.*` / `card.design.*`
  localization values.
- **Hidden component descriptions are transformed** even when their component checkbox is off,
  because they remain part of the draft.
- **Remaining baseline exclusions stay in force.** Final exclusion sets:
  - English: `round`, `turn`, `line`, `speed`, `advantage`, `disadvantage`, `target`, `object`,
    `objects`, `bonus`, `minimum`, `maximum`, `example`, `presumably`, `compare`, `possibly`,
    `inPart`, `or`, `between`.
  - German: `round`, `turn`, `line`, `advantage`, `disadvantage`, `target`, `object`, `objects`,
    `bonus`, `minimum`, `maximum`, `presumably`, `compare`, `or`, `between`, `diameter`, `cube`.
  - No-op entries stay ineligible regardless of these sets: English `spell`, `self`, `touch`,
    `sight`, `day`; German `Selbst`, `Sicht`, `Tag`.
- **Undo is full restoration.** Snapshot only fields changed by that action; restoring overwrites
  later manual edits to those fields and leaves unrelated fields untouched. No conflict detection,
  diffing, merge, or post-save restore.
- **Matching language is captured** as `session.language` when the editor opens. Unsupported
  languages are a no-op with an explanatory status; no English prose fallback.

## 2. Files and ordered implementation tasks

### T1 — Catalog access, eligibility, exclusions, and docs parity

Files:
- `src/locales/abbreviations.ts`
- `src/locales/en.ts`
- `src/locales/de.ts`
- `src/locales/abbreviations.test.ts`
- `docs/abbreviations.md`

Changes:
- Add `AbbreviationLocale = "en" | "de"`, `AbbreviationEntry` (`id`, `full`, `short`),
  `abbreviationCatalog(locale)`, `EXCLUDED_ABBREVIATION_IDS`, and
  `isAbbreviationEligible(entry, locale)`.
- `abbreviationCatalog` returns a catalog only for exact `"en"` or `"de"`; return `null` for every
  other code. Do not use `toUiLocale`; prose must not fall back to English.
- `isAbbreviationEligible`: trimmed `full !== short`, trimmed `short` is shorter than trimmed
  `full`, and ID is not in the active locale’s exclusion set.
- Add plural unit entries to both catalogs in the same positions, next to their singular entries:
  - `minutes` → `MIN`, `hours` → `HR`, `meters` → `MTR`
  - German `Minuten` → `min`, `Stunden` → `Std.`, `Meter` → `m` (duplicate German `Meter`
    signature is intentional and documented).
- Change `en.abbreviations.damage.short` from `DMG` to `dmg` per the approved policy. Do not change
  German `Schaden` (`SCH`) or any unit short used by Compact rendering.
- Add the final exclusion sets from §1. Do not change existing school/class/component mappings or
  any UI-label localization entry.
- Extend `abbreviations.test.ts`:
  - docs parity still passes with new lines;
  - `abbreviationCatalog("en")` / `("de")` return entries and `"fr"` / unknown codes return `null`;
  - every exclusion ID exists in both catalogs;
  - no two eligible entries in a locale share the same normalized `full` with different `short`;
  - no-op entries are ineligible;
  - plural unit entries resolve;
  - `damage.short` is `dmg`.
- Update `docs/abbreviations.md`:
  - change the English damage line to `dmg`;
  - add plural unit lines;
  - document the final exclusions and the reason they are policy, not algorithm;
  - clarify catalog identity is case-sensitive while manual prose matching is locale-aware
    case-insensitive;
  - keep docs parity lines in the exact `- full = short (full = short)` shape.

Acceptance:
- Catalog and exclusion tests pass.
- No generated SRD data, canonical enum, or UI-label string changes.

### T2 — Plain-text transformer and matcher

Files:
- new `src/locales/abbreviation-transform.ts`
- new `src/locales/abbreviation-transform.test.ts`

Changes:
- Export `AbbreviationTextMode = "markdown" | "plain"`, `AppliedAbbreviation`,
  `SkippedAbbreviation`, `AbbreviationTransformResult`, and
  `transformAbbreviationText(text, { locale, mode })`.
- Implement a module-level per-locale matcher cache keyed by `"en"`/`"de"`; filter with
  `isAbbreviationEligible`, precompute case-folded/normalized `full`, and sort by descending
  `full.length`, ascending normalized `full`, then deterministic catalog order/ID.
- Match by locale-aware case folding (`toLocaleLowerCase(locale)`), exact full phrase, and Unicode
  word boundaries using `[\p{L}\p{N}\p{M}_-]` with the `u` flag. Do not collapse whitespace or
  infer plurals/inflections; plural forms are explicit catalog entries.
- At a boundary adjacent to a contiguous `*`, `_`, or `~` delimiter run, look through the run and
  test the next visible source character. This makes `**bonus action**` eligible while rejecting
  `**bonus action**s`.
- Single-pass replacement: append `short` verbatim and advance by the matched full length; never
  rescan inserted text. Return one `AppliedAbbreviation` per catalog entry with occurrence `count`.
- When no eligible entry matches at a position, detect excluded matches with the same boundary
  rules and record them in `skipped` with reason `"excluded"`; never report occurrences covered by
  a longer applied match.
- Unknown locale returns unchanged text with no applied matches.
- `plain` mode protects only bare URLs, `mailto:` links, and email addresses; otherwise scan
  line-by-line.
- Do not import `marked` or React.

Acceptance:
- English/German terms, case-insensitivity, multi-word phrases, internal spaces/periods, longest
  match, overlapping terms, boundaries, no-op/excluded skips, idempotence, single-pass behavior,
  and diagnostics pass.
- `transformAbbreviationText(transformAbbreviationText(text))` is stable on representative text.
- Required policy tests include `action` → `A`, `reaction` → `R`, `damage` → `dmg`,
  `Aktion` → `A`, `Reaktion` → `R`, `Schaden` → `SCH`, and `bonus action` → `BA`.

### T3 — Markdown protected-range scanner

Files:
- `src/locales/abbreviation-transform.ts`
- `src/locales/abbreviation-transform.test.ts`

Changes:
- Build a boolean/`Uint8Array` protected mask over the original source. Process passes in order and
  never un-protect a range; skip already-protected characters.
- Protect:
  1. fenced code blocks (up to three leading spaces, three or more backticks/tildes, through the
     matching close or end of input);
  2. inline code spans (same-length backtick run; unclosed to end of line);
  3. HTML comments;
  4. HTML tags and closing tags, including quoted attributes;
  5. autolinks (`<scheme:...>`, `<email@example.com>`);
  6. bare URLs, `www.`, `mailto:`, and email addresses;
  7. line-start reference definitions;
  8. complete image syntax, including alt text and destination;
  9. inline link destinations/titles, including nested parentheses and angle-bracket destinations;
  10. reference link identifiers; protect whole collapsed `[label][]` and shortcut `[label]`
      forms because the label is also the identifier;
  11. backslash escapes;
  12. structural delimiters: emphasis markers, line-start `#`/`>`/list markers, table pipes,
      horizontal rules, brackets, parentheses, leading `!`, and HTML entities.
- Split at line breaks and transform each maximal unprotected run. Append protected characters
  byte-for-byte. Preserve source formatting; do not serialize/regenerate Markdown.
- Add all required cases from spec §9.1, including:
  - `**bonus action**` → `**BA**`, `*bonus action*` → `*BA*`, headings, blockquotes, ordered and
    unordered lists, and table cells;
  - link display text transforms while destinations/titles/reference IDs remain byte-identical;
  - `[https://example.com/bonus-action](https://example.com/bonus-action)`, autolinks, and
    standalone URLs remain unchanged;
  - inline/fenced code, HTML tags/attributes, escapes, entities, images, collapsed/shortcut
    references, and delimiters are preserved;
  - `**bonus action**s` remains unchanged;
  - `\*bonus action\*` transforms visible text while preserving escapes;
  - newlines remain and phrases do not match across line breaks.

Acceptance:
- Markdown examples in spec §2.2 and §9.1 pass.
- No source formatting is regenerated or normalized.

### T4 — Form action, undo, status, and localization

Files:
- `src/components/details/CustomSpellForm.tsx`
- `src/components/details/CustomSpellForm.test.tsx`
- `src/locales/en.ts`
- `src/locales/de.ts`
- optionally `src/locales/locales.test.ts` for new key coverage

Changes:
- Add a toolbar row above the field grid:
  - **Abbreviate** (`Button`, outline, `type="button"`) for every `!isSrd` draft;
  - **Undo abbreviation** (`Button`, outline), disabled when the undo stack is empty;
  - a `role="status"` / `aria-live="polite"` status message when status is set;
  - `aria-describedby` hint for the undo button (“Available until the editor closes.”).
- Keep action visibility based on `isSrd` (`spell?.source === "SRD-5.2.1"`): visible for new,
  ordinary custom edit, and editable-copy drafts; absent for the restricted SRD override editor.
- Add `AbbreviationStatus` (`success`, `noMatches`, `unavailable`, `undone`) and
  `UndoSnapshot = Partial<DraftState>`.
- Clear undo stack and abbreviation status when the dialog opens, when `spell` changes, and when
  the dialog closes. Do not clear on live UI-language changes; use captured `session.language`.
- Apply handler:
  1. resolve `abbreviationCatalog(session.language)`; if `null`, set `unavailable` without touching
     the draft;
  2. transform `description`/`higherLevels` with `markdown` mode and `castingTime`, `range`,
     `duration`, `verbalDescription`, `somaticDescription`, `materialDescription`, `materialCost`
     with `plain` mode;
  3. collect only changed fields and total applied replacement count;
  4. if none changed, set `noMatches` and push no undo entry;
  5. otherwise snapshot original values of exactly the changed fields, apply transformed values,
     push one snapshot, set `success` with the count;
  6. in `import.meta.env.DEV`, log skipped/excluded terms via
     `console.debug("[abbreviation]", { skipped })`;
  7. never mutate `name`, structured fields, unexposed fields, or UI labels.
- Undo handler: pop the last snapshot, restore exactly those fields, leave other fields untouched,
  and set `undone`. Do not compare current values or merge.
- Add localization keys under `form.abbreviate` in both catalogs with identical shape:
  `action`, `undo`, `undoHint`, `success_one`, `success_other`, `noMatches`, `unavailable`,
  `undone`.
- Do not modify `spell.metadata.*`, `library.castingTime`, `library.range`, `library.duration`, or
  their German equivalents.
- Tests:
  - action visible for new/custom-edit/editable-copy and absent for SRD override;
  - no automatic transform on open, save, language change, or card-design change;
  - transforms description/higher levels/metadata/component fields; `name` and structured/
    unexposed fields unchanged;
  - no-match and unsupported-language statuses;
  - undo restores changed fields, overwrites later edits to those fields, and leaves unrelated
    edits intact;
  - LIFO undo for two actions; stack cleared on close/reopen and spell change;
  - status is exposed through `role="status"`;
  - save-through-validation reaches `saveCustomSpell`, preserves ID/source, and passes
    `spellSchema`; cancel persists nothing;
  - UI labels remain **Casting Time**, **Range**, **Duration** (and German equivalents);
  - captured-language behavior: open in German, switch live UI to English, apply; matching still
    uses German.

Acceptance:
- `CustomSpellForm` tests pass; no UI-label or card-design changes.

### T5 — Compact casting-time parser compatibility

Files:
- `src/cards/compact.ts`
- `src/cards/compact.test.ts`
- optionally `src/cards/CompactCard.test.tsx`

Changes:
- Keep existing full-text action patterns first.
- Add short-form patterns after the full patterns: `A`, `BA`, `B`, `R`, each with optional `1 `
  prefix. Keep `B` as the Compact glyph alias for bonus action; the transformer emits catalog
  `BA`, while display remains `B`.
- Extend quantity recognition:
  - English: `min`, `mins`, `minute`, `minutes`, `hr`, `hrs`, `hour`, `hours` (case-insensitive);
  - German: `min`, `Min`, `Minute`, `Minuten`, `Std.`, `Std`, `Stunde`, `Stunden`.
- Require a boundary after the unit token using a Unicode letter/number (and combining-mark)
  negative lookahead, not `\b` after `Std.`. Preserve optional trailing period handling.
- Keep existing qualifier rules (comma/semicolon only; qualifier plus caret falls back), caret
  handling, `raw`, display, full-label, note ownership, numbering, fitting, and print behavior.
- Do not run the abbreviation transformer during rendering, fit, or printing.
- Tests: full/abbreviated matrix from spec §7, including `Action`/`A`, `Bonus Action`/`BA`/`B`,
  `Reaction`/`R`, `1 minute`/`1 MIN`, `10 minutes`/`10 MIN`, `1 hour`/`1 HR`, German
  `1 Minute`/`1 min`, `10 Minuten`/`10 min`, `1 Stunde`/`1 Std.`, qualifiers, carets, and
  `Special` fallback; verify `buildCompactPresentation` equivalence for full vs abbreviated input.
- Existing unabbreviated parser tests must keep passing; no double abbreviation in Compact
  rendering.

Acceptance:
- `compact.test.ts` passes; Compact output for existing full values is unchanged.

### T6 — Documentation updates

Files:
- `docs/specs/abbreviation-of-spell-data-spec.md` (reconcile approved policy deltas)
- `docs/abbreviations.md` (finish manual transformation/exclusion documentation; T1 owns catalog
  lines)
- `docs/custom-spells-guide.md`
- `docs/custom-spells-guide.de.md`
- `docs/specs/MAIN-spec.md` §6, §9, §12
- `docs/DEVELOPMENT.md` (module map, Localization, Cards)
- `README.md`
- `docs/custom-spell-import-guide.md`: **no change**

Changes:
- Reconcile the source spec’s exclusion tables, `damage` short, unit entries, and §12 approval
  notes with the decisions in §1 of this plan so the docs do not contradict the implementation.
- `docs/abbreviations.md`: document manual prose transformation, protected Markdown ranges, final
  exclusions, exact full-term matching, plural unit entries, case-sensitivity clarification, and
  non-reversibility after save.
- Custom spell guides: add **Abbreviate** / **Undo abbreviation**, captured-language limitation,
  UI-label separation, and no reversible save backup.
- MAIN-spec §6: custom-spell abbreviation action, field scope, undo semantics, captured-language
  limitation, SRD-copy path, and UI-label separation.
- MAIN-spec §9: Compact short-form parsing and that rendering never transforms stored text.
- MAIN-spec §12: add verification rows for the abbreviation action/undo and Compact parser
  equivalence (use the next free C/P IDs).
- DEVELOPMENT: document `src/locales/abbreviation-transform.ts`, catalog selection/exclusions,
  matcher/protected-range scanner, form wiring/undo snapshots, and `compact.ts` short-form
  parsing.
- README: user-facing actions, UI labels never abbreviated, captured-language limitation, and
  saved abbreviations not automatically reversible.
- Keep one authoritative location per fact and valid relative links/anchors.

### T7 — E2E and verification

Files:
- new `e2e/abbreviation.spec.ts` (or extend `e2e/editable-copy.spec.ts`)

Scenario:
1. Open **Create custom spell**.
2. Enter a description containing `**bonus action**`, a Markdown link whose label is
   `bonus action`, and a bare URL.
3. Click **Abbreviate**.
4. Assert the visible editor value contains `**BA**`, the link label became `BA`, the link
   destination/URL stayed unchanged, and the **Casting Time** label is still present.
5. Click **Undo abbreviation** and assert the original text returns.
6. Apply again, save, and verify the custom spell saves normally; if practical, switch to Compact
   and verify the stored abbreviated body renders through the parser.

Validation:
- `pnpm run check`
- `pnpm run test`
- Affected focused tests (catalog, transformer, form, Compact).
- `pnpm run test:e2e` when the Workers preview suite is available.
- `git status` shows no changes to generated SRD datasets, `dist/`, or `.wrangler/`.

## 3. Edge cases and risks to verify

- Longest-match precedence: `bonus action` must beat `action`; `damage resistance` must beat
  `damage`; `Schadensresistenz` must beat `Schaden`.
- No cascading: inserted `A`/`BA`/`R`/`MIN` must never be rescanned; output must be idempotent.
- Boundaries: `unwilling creature`, `creatures`, `12minutes`, `willing_creature`,
  `creature-type`, `minimal`, and `**bonus action**s` remain unchanged; double spaces are not
  collapsed.
- Markdown safety: link destinations/titles/IDs, autolinks, URLs, images, code, HTML attributes,
  escapes, entities, and delimiters remain byte-identical.
- UI labels: `Casting Time`, `Range`, `Duration`, German equivalents, Compact design labels,
  Legend text, and all existing localization entries remain unchanged after abbreviation.
- Captured language: open in German, switch live UI language, apply; matching uses German.
- Unsupported locale: returns `unavailable`, draft untouched; no English fallback for prose.
- Undo: later manual edits to changed fields are overwritten by restore; unrelated fields and
  later edits to them remain.
- Compact parser: full patterns must win before short patterns; `Std.` boundary must work;
  `mini`/`minimal`/`hoursomething` must not partially match.
- Catalog recursion/import cycles: `abbreviations.ts` may import `de.ts`; neither catalog imports
  the abbreviation module.

## 4. Out of scope

- Automatic abbreviation at render, fit, pagination, preview, or print time.
- Build-time/normalization-time abbreviation datasets.
- Persisted backups, post-save restoration, conflict detection, selective undo, or diffing.
- Icon/glyph substitution.
- Abbreviating UI labels, canonical enums, structured fields, or unexposed data.
- Changing existing Classic/Compact label or card-display behavior.
- Import/export format changes (`docs/custom-spell-import-guide.md` stays unchanged).
