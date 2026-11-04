# Manual abbreviation of custom spell text — implementation plan

## Revision summary

This revision keeps the feature and the existing architecture, and replaces the previous plan's
ambiguous or conflicting rules with the following decisions:

- **Undo is a simple restoration.** Each abbreviation action snapshots the original values of the
  fields it actually changes. Undo restores those values in full, even if the user later edited a
  changed field. Fields untouched by that action are never restored. There is no conflict
  detection, diffing, merge, or selective restoration.
- **Markdown handling transforms visible prose, not syntax.** Prose inside bold, italic, headings,
  blockquotes, lists, and link display text is eligible. URLs, link destinations and reference
  identifiers, autolinks, inline/fenced code, HTML tags and attributes, escapes, and structural
  delimiters are protected.
- **Matching uses a deterministic, documented exclusion policy.** Only catalog `full` terms are
  eligible. No-op entries are skipped. An explicit per-language exclusion list removes ambiguous
  or prose-unsafe entries. Longest-match precedence, deterministic tie-breaking, Unicode word
  boundaries, locale-aware case-insensitive matching, single-pass replacement, and idempotence are
  mandatory.
- **Compact casting-time parsing preserves semantics.** Abbreviated values such as `A`, `BA`, `R`,
  `MIN`, and `HR` parse to the same base, glyph, accessible label, qualifier, caret, notes, fit,
  and print behavior as their full-text equivalents.
- **Spell data and UI labels are separate.** Only user-authored spell values are transformed. The
  UI labels **Casting Time**, **Range**, and **Duration** (and their German equivalents) are never
  abbreviated.

The previous plan's conflict-aware undo, automatic/de-abbreviation ideas, general Markdown
rewriting, and any suggestion to abbreviate UI field labels are removed. Post-save restoration and
persisted abbreviation backups remain out of scope.

Concretely, this revision:

- replaces the previous undo rule with full snapshot restoration and no conflict detection;
- replaces the protected-Markdown-only interpretation with visible-prose transformation plus
  functional-syntax protection;
- adds concrete English and German exclusion lists and a catalog-extension decision;
- makes Compact parser compatibility an explicit task rather than a follow-up note;
- adds the explicit spell-data-versus-UI-label boundary;
- reorganizes the work into dependency-ordered tasks T1–T7 with per-task acceptance criteria and a
  verification task.

## 1. Feature summary and retained requirements

- Add an explicit, user-triggered **Abbreviate** action to the custom-spell editor.
- Show it for every non-SRD draft: new custom spell, ordinary custom-spell edit, and **Create
  editable copy**. Do not show it in the restricted SRD override editor.
- The action mutates only the form's draft state. Nothing is persisted until the user saves;
  cancelling writes nothing.
- The action is independent of the selected card design. Classic and Compact display the saved
  values with no load-time, render-time, fit-time, pagination, preview, or print-time
  transformation.
- Both actions and status messages are localized in English and German; the actions are keyboard
  operable.
- Matching uses the language captured when the editor opens (`session.language`), not the live UI
  language. A language without an `en`/`de` catalog is a no-op with an explanatory status; do not
  fall back to English for prose.
- `Spell` has no stored content-language field. An existing custom spell or editable copy authored
  in a different language than the current `session.language` cannot be detected; this is a
  documented limitation, not a runtime error.
- Existing validation, `source: "Custom"`, ID retention, `updatedAt`, dirty-state handling,
  editable-copy deck replacement, import/export compatibility, saved-deck resolution, and
  unexposed-field preservation remain unchanged.
- Custom spell edits are resolved by ID; saved deck snapshots themselves are not rewritten,
  matching existing custom-spell behavior.
- No new persistence model, schema field, generated dataset, normalization change, server API, or
  backend runtime is introduced.

## 2. Decisions that supersede the previous plan

### 2.1 Undo abbreviation: full field restoration

- Before applying abbreviation, snapshot the original values of every draft field whose value
  actually changes.
- Undo restores all snapshotted fields in full.
- If the user manually edits a field that the corresponding action changed, Undo still restores
  that field's original value, overwriting the later manual edit for that field.
- Fields not changed by that action remain untouched.
- Keep a session-scoped, last-in-first-out (LIFO) stack for repeated actions.
- Clear the stack when the editor closes, a different spell is opened, or the draft is
  reset/reloaded.
- Do not implement conflict detection, selective restoration, text diffing, merge logic, or
  post-save restoration.

### 2.2 Markdown: visible prose is eligible, functional syntax is protected

Abbreviation is **allowed** in ordinary visible prose inside:

- bold and italic text,
- headings,
- blockquotes,
- ordered and unordered lists,
- link display text when changing it does not alter the link target or reference identifier,
- other Markdown structures containing ordinary author-written prose.

Abbreviation must **not** modify:

- actual URLs, standalone or embedded in Markdown links,
- Markdown link destinations, titles, or reference identifiers,
- autolinks containing URLs,
- link-related syntax or content whose modification would break link functionality,
- inline code and fenced code blocks,
- HTML tags and attributes,
- Markdown structural delimiters and escape sequences.

Required examples:

| Input                                                                  | Output                      |
| ---------------------------------------------------------------------- | --------------------------- |
| `**bonus action**`                                                     | `**BA**`                    |
| `> bonus action`                                                       | `> BA`                      |
| `- bonus action`                                                       | `- BA`                      |
| `[bonus action](https://example.com)`                                  | `[BA](https://example.com)` |
| `[https://example.com/bonus-action](https://example.com/bonus-action)` | unchanged                   |
| `https://example.com/bonus-action`                                     | unchanged                   |

Preserve the original Markdown formatting and source text outside the replaced ranges. Do not
serialize and regenerate the document.

### 2.3 Ambiguous or prose-unsafe abbreviations: deterministic baseline

- Match catalog definitions and their generated surfaces (base `full`, configured `suffixes`, and
  explicit `forms`) and replace them with the definition `short` value verbatim.
- Match each configured surface exactly apart from locale-aware case folding; do not collapse
  whitespace runs or infer inflections/plurals that are not explicitly configured.
- Skip entries where `full === short` and entries whose `short` is not shorter than `full`
  (case-only changes and expansions are not abbreviations).
- Apply one explicit, per-language exclusion list to all eligible spell-text fields.
- Do not use grammatical inference, contextual interpretation, or heuristic disambiguation.
- Use longest-match precedence and a deterministic tie-break.
- Use Unicode-aware word/phrase boundaries and locale-aware case-insensitive matching.
- Process the input in one pass so inserted abbreviations are never rescanned.
- Preserve skipped matches unchanged.
- Return excluded/skipped matches in the result and expose them through development-only
  diagnostics.

### 2.4 Compact casting-time parser: semantic equivalence

For every supported abbreviated casting time (`A`, `BA`, `R`, `MIN`, `HR`, and the localized
German equivalents such as `min` and `Std.`), the parser must preserve:

- the semantic casting-time category,
- the correct Compact glyph,
- the full accessible label,
- existing qualifiers and explanatory notes,
- caret-note handling,
- existing rendering and fitting behavior.

Unabbreviated values must keep working. Card rendering must never abbreviate stored data a second
time.

### 2.5 Spell data versus UI labels

The action transforms **user-authored spell data**, never application UI labels.

- `castingTime`, `range`, and `duration` are eligible only as values stored in the custom spell's
  editable draft.
- The UI labels **Casting Time**, **Range**, and **Duration** are not abbreviated in the custom
  spell editor, spell details, Classic cards, Compact cards, preview, print, or anywhere else.
- Do not edit `spell.metadata.*`, `library.castingTime`, `library.range`, `library.duration`, or
  their German equivalents to introduce abbreviations.
- New localization strings are limited to the new action, undo action, status messages, and
  genuinely new feature UI text.

## 3. Scope and transformation boundaries

### 3.1 Draft fields transformed

| Draft field           | Mode       | Notes                                                                                                    |
| --------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `description`         | Markdown   | Visible prose only; protected ranges preserved.                                                          |
| `higherLevels`        | Markdown   | Same rules as `description`.                                                                             |
| `castingTime`         | Plain text | URL protection only; caret markers preserved.                                                            |
| `range`               | Plain text | URL protection only.                                                                                     |
| `duration`            | Plain text | URL protection only; caret markers preserved.                                                            |
| `verbalDescription`   | Plain text | Transform the draft value even if the component checkbox is currently off; it remains part of the draft. |
| `somaticDescription`  | Plain text | Same as verbal.                                                                                          |
| `materialDescription` | Plain text | Same as verbal.                                                                                          |
| `materialCost`        | Plain text | Same as verbal.                                                                                          |

### 3.2 Never transformed

- `name` (identity and display name; not prose).
- `level`, `school`, `classes`, `concentration`, `ritual`, component booleans.
- `source`, IDs, `updatedAt`.
- `subclasses`, `savingThrow`, `damageTypes` (canonical or unexposed data).
- `componentsDisplayOverride` and any other unexposed field.
- Markdown syntax, link targets, code, HTML tags/attributes, or escape sequences.
- UI labels, including metadata labels and card-design labels.

### 3.3 Matching result contract

The transform result contains:

- `text`: the transformed source text.
- `applied`: the applied matches (`id`, `full`, `short`, `count`).
- `skipped`: excluded/skipped matches with a reason (`excluded`).
- `changed`: whether the text changed.

No production UI renders skipped terms or reasons.

## 4. Architecture

### 4.1 Catalog access and exclusion policy — `src/locales/abbreviations.ts`

Keep the existing school/class/component ID mappings, but type them with the shared-ID subset that
exists in both catalogs. Add:

```ts
export type AbbreviationId = keyof typeof en.abbreviations | keyof typeof de.abbreviations;
export type SharedAbbreviationId = keyof typeof en.abbreviations & keyof typeof de.abbreviations;

export interface AbbreviationEntry {
  id: AbbreviationId;
  full: string;
  short: string;
  forms: readonly string[];
}
```

Definitions inside each locale module use the shared `AbbreviationDefinition` shape
(`full`, `short`, optional `suffixes`, optional `forms`). `catalogEntries` generates `forms` once
per definition: the base `full`, every `full + suffix`, and every explicit `forms` entry,
deduplicated in that order.

- `abbreviationCatalog(locale: string): readonly AbbreviationEntry[] | null`
  - Return the `en` or `de` catalog only for exact `en`/`de` locale codes.
  - Return `null` for every other language. Do not use `toUiLocale` here; the UI may fall back to
    English, but prose must not.
- `EXCLUDED_ABBREVIATION_IDS: Record<AbbreviationLocale, ReadonlySet<AbbreviationId>>`
  - Contains the concrete exclusions from section 5.
- `isAbbreviationEligible(entry: AbbreviationEntry, locale: AbbreviationLocale): boolean`
  - `full.trim() !== short.trim()`
  - `short.trim().length < full.trim().length`
  - the ID is not in the active locale's exclusion set.
  - Eligibility is decided from the base definition, not from each generated form.
- `findAbbreviationSurfaceConflicts(entries, locale)` normalizes generated surfaces with
  `toLocaleLowerCase(locale).normalize("NFC")` and reports any surface that maps to different
  shorts. The matcher calls it over the full definition set before splitting eligible and excluded
  surfaces; conflicts are errors, never resolved by catalog order.
- Do not change existing caller behavior for school, class, and component abbreviations.

The `en` and `de` catalog objects remain the single runtime source, but their inventories are
independent: a definition may exist in only one locale, and docs parity compares each locale with
its own documented inventory. No automatic stemming, grammar inference, or locale fallback exists.

### 4.2 Transform module — new `src/locales/abbreviation-transform.ts`

Keep the algorithm separate from the catalog module:

```ts
export type AbbreviationTextMode = "markdown" | "plain";

export interface AppliedAbbreviation {
  id: AbbreviationId;
  full: string;
  short: string;
  count: number;
}

export interface SkippedAbbreviation {
  id: AbbreviationId;
  full: string;
  reason: "excluded";
}

export interface AbbreviationTransformResult {
  text: string;
  applied: readonly AppliedAbbreviation[];
  skipped: readonly SkippedAbbreviation[];
  changed: boolean;
}

export function transformAbbreviationText(
  text: string,
  options: { locale: string; mode: AbbreviationTextMode },
): AbbreviationTransformResult;
```

- `plain` mode protects bare URLs, `mailto:` links, and email addresses. It does not treat
  Markdown syntax specially.
- `markdown` mode builds the protected-range mask described in section 4.3 and transforms only
  unprotected prose runs.
- Cache the eligible matcher entries per locale (a module-level `Map` in the transform module, or a
  form-level `useMemo` keyed by `session.language`) and reuse them for the dialog session. Do not
  rebuild the matcher on every keystroke or status render.
- Do not use `marked` to parse and regenerate the document. `marked` is already used for rendering;
  using its AST for rewriting risks losing source formatting. Use a small source-range scanner.
- The module is pure and does not read React state, i18n live language, or card design.

The form owns the field map and assembles the field-level result (the type is internal to
`CustomSpellForm`):

```ts
interface AbbreviationFieldResult {
  values: Partial<DraftState>;
  changedFields: ReadonlyArray<keyof DraftState>;
  appliedCount: number;
  skipped: readonly SkippedAbbreviation[];
}
```

- `values` contains only fields whose transformed value differs.
- `changedFields` lists exactly those fields.
- `appliedCount` is the number of replacements across all changed fields.
- `skipped` concatenates excluded matches from every transformed field.
- This is the structured result used for the undo snapshot and status message.

For each field, `transformAbbreviationText` returns one `AppliedAbbreviation` per applied catalog
entry; its `count` is the number of occurrences in that field. `appliedCount` is the sum of those
counts.

### 4.3 Markdown protected-range scanner

Build a `Uint8Array`/boolean mask over the original source. Process the passes below in order and
skip characters that are already protected; later passes must never un-protect a range. Only treat
`<` as an HTML tag or autolink when it matches a tag/autolink pattern; an ordinary comparison `<`
stays transformable prose. Mark exactly these ranges protected:

1. **Fenced code blocks** — opening fence of three or more backticks or tildes, with up to three
   leading spaces, through the matching closing fence (or end of input if unclosed).
2. **Inline code spans** — a backtick run through the matching run of the same length; unclosed
   runs protect to the end of the line.
3. **HTML comments** — `<!--` through `-->`.
4. **HTML tags** — `<tag ...>` and `</tag>`, including quoted attributes.
5. **Autolinks** — `<scheme:...>` and `<email@example.com>` forms.
6. **Bare URLs and emails** — `http://`, `https://`, `mailto:`, `www.`, and email-address forms.
7. **Reference definitions** — line-start `[id]: destination "title"` definitions; protect the
   whole line.
8. **Images** — the complete image syntax, including alt text and destination, so image
   functionality and URLs are never altered.
9. **Inline link destinations and titles** — the `(...)` part of `[label](destination "title")`,
   including nested parentheses and angle-bracket destinations.
10. **Reference link identifiers** — protect the `[id]` part of `[label][id]`; the label is display
    text and may be transformed. Protect the entire `[label][]` of a collapsed reference and the
    entire `[label]` of a shortcut reference because the label is also the reference identifier in
    those forms.
11. **Escapes** — a backslash and the escaped punctuation character.
12. **Structural delimiters** — `*`, `_`, `~`, `#` at line start, `>` at line start, `|` in
    tables, line-start list markers (`-`, `+`, `*`, `1.`), horizontal-rule lines, brackets,
    parentheses, `!` before an image, and HTML entities (`&...;`).

The mask only protects syntax and functional targets. Text inside `**...**`, `*...*`, headings,
blockquotes, lists, tables, and inline/full-reference link display text remains unprotected and is
transformed; collapsed and shortcut reference labels remain protected because they are also the
reference identifier.

After masking:

- Split at line breaks (`\n`, `\r\n`) so a phrase never matches across a paragraph/soft line break.
- Transform each maximal unprotected run independently.
- Append protected characters byte-for-byte.

Do not implement a general Markdown parser or serializer. Do not change whitespace, delimiter
counts, table alignment, list markers, reference definitions, or link syntax.

### 4.4 Matcher algorithm

For the active locale:

1. Read the catalog, validate generated surfaces with `findAbbreviationSurfaceConflicts`, and
   filter each definition with `isAbbreviationEligible` (all of an excluded/ineligible definition's
   forms stay excluded).
2. Sort eligible surfaces by descending `surface.length`, then ascending folded surface, then
   catalog ID, then surface. This gives longest-match precedence and a deterministic tie-break.
3. For each unprotected line segment, scan left to right:
   - At the current index, try eligible surfaces in sorted order.
   - A match requires the case-folded candidate to equal the case-folded `surface`.
   - The character before the match and the character after the match must not be Unicode word
     characters. Use `[\p{L}\p{N}\p{M}_-]` as the word-character test, with the `u` flag. This
     treats hyphenated slugs/identifiers such as `creature-type` as one word.
   - When a boundary is adjacent to a contiguous emphasis delimiter run (`*`, `_`, `~`), look
     through that run and test the next visible source character. This makes `**bonus action**`
     eligible while rejecting `**bonus action**s` as a partial-word match.
   - Use `toLocaleLowerCase(locale)` for comparison. Do not normalize or rewrite the source; if
     Unicode normalization is needed for comparison, normalize only the comparison copy.
   - On a match, append `entry.short` verbatim and advance by `surface.length`.
   - On no match, append the current character and advance by one.
4. Never rescan appended text. This prevents cascading replacements and guarantees idempotence for
   the current catalog.
5. For diagnostics, when no eligible entry matches at the current index, check excluded entries
   starting there with the same boundary rules and record the first/longest excluded match with
   reason `excluded`. Do not report occurrences that are covered by a longer applied match.

Add a catalog test that no two eligible entries in a locale have the same normalized `full` with
different `short` values. If duplicate/equal full entries exist, the sort order must still be
deterministic; prefer the catalog order after the length and lexicographic checks.

### 4.5 Development diagnostics

- The transform result always contains `skipped` (excluded terms and reasons) for tests and
  development diagnostics.
- In the form, when `import.meta.env.DEV` is true and `skipped.length > 0`, log a concise
  `console.debug("[abbreviation]", { skipped })`. Do not log the full user text in production.
- Production UI shows only the concise status message.

## 5. Exclusion policy and concrete exclusion list

### 5.1 Automatic no-op rule

These are not eligible regardless of the exclusion list:

- `full.trim() === short.trim()`.
- `short.trim().length >= full.trim().length`.

This automatically skips any retained no-op definition:

| Locale  | Retained entries                                                        |
| ------- | ----------------------------------------------------------------------- |
| English | None; no-op parity entries are removed.                                 |
| German  | `target` (`Ziel` → `Ziel`)                                              |

Removed parity-only entries are not catalog definitions at all, so the transformer cannot match them. Do not add retained no-ops to the exclusion sets unless they also need a prose-safety explanation.

### 5.2 English exclusions

`EXCLUDED_ABBREVIATION_IDS.en` contains these IDs:

| Abbreviation ID | Full term  | Reason                                                                             |
| --------------- | ---------- | ---------------------------------------------------------------------------------- |
| `round`         | round      | Shape/around/common noun; ambiguous in prose.                                      |
| `turn`          | turn       | Verb and noun; ambiguous in prose. Long phrases containing “turn” remain eligible. |
| `speed`         | speed      | Common word.                                                                       |
| `presumably`    | presumably | `presum.` is not a standard running-text abbreviation.                             |
| `possibly`      | possibly   | `poss.` is ambiguous and non-standard.                                             |
| `inPart`        | in part    | `partly` is a synonym rewrite, not an abbreviation.                                |

`action`, `reaction`, `damage`, `advantage`, `disadvantage`, `target`, `object`/`objects`,
`minimum`, `maximum`, `example`, `compare`, `between`, `casting time`, `range`, and `duration` are
intentionally **not** excluded. They are approved standalone game terms or field-label terms that
are eligible in prose; longer phrases still win.

### 5.3 German exclusions

`EXCLUDED_ABBREVIATION_IDS.de` contains these IDs:

| Abbreviation ID | Full term   | Reason                                                                          |
| --------------- | ----------- | ------------------------------------------------------------------------------- |
| `round`         | Runde       | Common word.                                                                    |
| `turn`          | Zug         | Common word (train, move, turn). Long phrases containing `Zug` remain eligible. |
| `presumably`    | vermutlich  | `vmtl.` is not a standard running-text abbreviation.                            |
| `or`            | oder        | Conjunction; `o.` is unsafe in prose.                                           |
| `diameter`      | Durchmesser | `DM` collides with the common “Dungeon Master” abbreviation.                    |
| `cube`          | Würfel      | `Würfel` means both “cube” and “die”; `WÜRF` is ambiguous.                      |

`Aktion`, `Reaktion`, `Schaden`, `Vorteil`, `Nachteil`, `Ziel`, `Gegenstand`/`Gegenstände`,
`Minimum`, `Maximum`, `Beispiel`, `vergleiche`, `zwischen`, `Zeitaufwand`, `Reichweite`, and
`Wirkungsdauer` are intentionally **not** excluded. They are approved standalone game terms or
field-label terms that are eligible in prose; longer phrases still win.

German entries intentionally **not** excluded, despite English exclusion:

- `speed` → `Bewegungsrate` → `BR` (domain compound).
- `possibly` → `eventuell` → `evtl.` (standard German abbreviation).
- `inPart` → `zum Teil` → `z. T.` (standard German abbreviation).
- `soCalled` → `sogenannt` → `sog.` (standard German abbreviation).
- `touch` → `Berührung` → `Ber.` (German-only definition; the English `touch` parity entry is removed).
- `spell` → `Zauber` → `Z.` (German-only definition; the English `spell` parity entry is removed).

These language-specific allowances are deliberate. They still obey the same field scope and
boundary rules.

The tables above are a proposed baseline. Because the algorithm reads the per-locale sets, moving
an entry between allowed and excluded is a policy change only, not an algorithm change. Section 12
records the approved policy decisions.

### 5.4 Catalog extension: configured inflection forms

Locale catalogs are independent. Instead of requiring mirrored plural keys, a definition may opt
into generated surfaces:

```ts
interface AbbreviationDefinition {
  readonly full: string;
  readonly short: string;
  readonly suffixes?: readonly string[];
  readonly forms?: readonly string[];
}
```

Generated surfaces are `full`, every `full + suffix`, and every explicit `forms` entry, deduplicated;
all map to the same `short`. English retains explicit `minutes`, `hours`, and `meters` entries.
German consolidates them into definition-level forms:

| Definition | Generated forms                                                        |
| ---------- | ---------------------------------------------------------------------- |
| `psychic`  | `psychisch`, `psychische`, `psychischer`, `psychisches`, `psychischem`, `psychischen` |
| `meter`    | `Meter`, `Meters`, `Metern`                                            |
| `minute`   | `Minute`, `Minuten`                                                    |
| `hour`     | `Stunde`, `Stunden`                                                    |
| `object`   | `Gegenstand`, `Gegenstände`                                            |

- Add matching lines to `docs/abbreviations.md`; the parity test compares each locale against its
  own documented inventory. Use `—` for a side that does not define the entry.
- Add tests for `10 minutes` → `10 min`, `2 hours` → `2 h`, `30 meters` → `30 mtr`, and the German
  generated forms.
- Do not add speculative forms for excluded terms (`actions`, `reactions`, `rounds`, `turns`,
  `damage`, etc.) without a product decision. The matcher never infers unconfigured inflections.

### 5.5 Approved policy decisions

The product owner approved the following baseline adjustments. They are policy choices, not
algorithm changes: the matcher reads the per-locale exclusion sets, so revisiting an entry does not
change the implementation.

1. **`action` and `reaction` are eligible.** English `action` → `A` and `reaction` → `R`; German
   `Aktion` → `A` and `Reaktion` → `R`. Longer phrases such as `bonus action` still win.
2. **`damage`/`Schaden` are eligible.** English `damage` → `dmg` and German `Schaden` → `SCH`.
   Compound phrases such as `damage resistance` and `Schadensresistenz` still win.
3. **Plural unit catalog entries are approved.** `minutes`, `hours`, `meters`, `Minuten`,
   `Stunden`, and the shared German `Meter` spelling are explicit catalog entries.
4. **Hidden component-description fields are transformed** even when the component checkbox is off,
   because they remain part of the draft.
5. **German standard forms remain allowed** (`Bsp.`, `evtl.`, `sog.`, `bzw.`, `ca.`, `z. B.`,
   `d. h.`, `u. a.`, `usw.`, `etc.`, `z. T.`).
6. **Field-label terms in prose are eligible.** `casting time`, `range`, and `duration` (and
   `Zeitaufwand`, `Reichweite`, `Wirkungsdauer`) may appear in prose. The UI labels themselves are
   never transformed.
7. **Common prose terms are eligible.** The product owner approved automatic replacement of
   `between` → `b/w`, `advantage` → `adv.`, `disadvantage` → `disadv.`, `object`/`objects` →
   `obj.`, `target` → `tgt.`, `minimum` → `min.`, `maximum` → `max.`, `example` → `ex.`, and
   `compare` → `cf.`. German uses `zwischen` → `zw.`, `Vorteil` → `VT`, `Nachteil` → `NT`,
   `Gegenstand`/`Gegenstände` → `Ggst.`, `Minimum` → `Min.`, `Maximum` → `Max.`,
   `Beispiel` → `Bsp.`, and `vergleiche` → `vgl.`. These terms were removed from both per-locale exclusion sets;
   longer phrases such as `for example` and `zum Beispiel` still win.

There are no architecture blockers. The feature fits the existing form, locale catalog, and card
pipeline without schema or persistence changes.

## 6. UI behavior and undo

### 6.1 Action placement and visibility

- Add a toolbar row in `CustomSpellForm` above the field grid containing:
  - **Abbreviate** (`Button`, outline) for every `!isSrd` draft.
  - **Undo abbreviation** (`Button`, outline), disabled when the undo stack is empty.
- `isSrd` remains `spell?.source === "SRD-5.2.1"`.
  - New custom spell: `spell` undefined → action visible.
  - Custom edit: `source: "Custom"` → action visible.
  - Editable copy: the draft is a custom spell → action visible.
  - Restricted SRD override: `source` is SRD → action absent.
- Do not add the action to `DetailsPane`, `LibraryPane`, cards, or the print sheet.
- Do not call the transformer on dialog open, save, language change, or card-design change.

### 6.2 Form state

Add to `CustomSpellForm`:

```ts
type AbbreviationStatus =
  | { kind: "success"; count: number }
  | { kind: "noMatches" }
  | { kind: "unavailable" }
  | { kind: "undone" };

type UndoSnapshot = Partial<DraftState>;
```

- `undoStack: UndoSnapshot[]` — LIFO.
- `abbreviationStatus: AbbreviationStatus | null`.
- Clear `undoStack`, `abbreviationStatus`, and field errors whenever `open` becomes true for a new
  session or `spell` changes. Clear `undoStack` and `abbreviationStatus` when the dialog closes.
- Do not clear on live `language` changes; `session.language` is captured.

### 6.3 Apply action

1. `const locale = session.language`.
2. Resolve `abbreviationCatalog(locale)`. If `null`, set `{ kind: "unavailable" }` and return
   without touching the draft.
3. Transform each eligible draft field:
   - `description`, `higherLevels` → `mode: "markdown"`.
   - `castingTime`, `range`, `duration`, `verbalDescription`, `somaticDescription`,
     `materialDescription`, `materialCost` → `mode: "plain"`.
4. Collect fields whose transformed value differs from the current draft.
5. If no field changed, set `{ kind: "noMatches" }`; do not push an undo entry.
6. Otherwise:
   - Build one snapshot containing the original value of every changed field.
   - Apply the transformed values to the draft.
   - Push the snapshot onto `undoStack`.
   - Set `{ kind: "success", count: totalReplacements }`.
   - In development, log skipped/excluded matches.
7. Never mutate `name`, structured fields, or unexposed fields.
8. The transformed values still go through the existing `onSubmit` validation. Abbreviation
   normally shortens text, but the result must still satisfy `LIMITS.FREETEXT_MAX`,
   `LIMITS.META_MAX`, the description limits, and `spellSchema`.

### 6.4 Undo action

1. If `undoStack` is empty, do nothing.
2. Pop the last snapshot.
3. Set exactly the snapshot's fields to their original values. This overwrites any later manual edit
   to those fields and leaves all other fields untouched.
4. Set `{ kind: "undone" }`.
5. Do not attempt to detect whether the current value still matches the transformed value. Do not
   merge or diff.

### 6.5 Status messages and accessibility

- Render a single `role="status"` / `aria-live="polite"` message when
  `abbreviationStatus !== null`.
- The action and undo buttons are native `Button` components, so they are keyboard operable.
- Use the live UI translation function for the new UI strings; use the captured
  `session.language` only for matching.
- Production status messages:
  - success: localized count of applied replacements,
  - no matches: localized “No abbreviations were applied.”,
  - unsupported language: localized “No localized abbreviations are available for this language.”,
  - undo: localized “Abbreviation undone.”
- Provide a localized undo-availability hint for the disabled button (for example an
  `aria-describedby` hint: “Available until the editor closes.”).

### 6.6 New localization keys

Add to `src/locales/en.ts` and `src/locales/de.ts` under a new `form.abbreviate` group. Keep the
`satisfies Translations` UI-string shape and the UI key-parity test intact (the abbreviation blocks
are excluded from that shape):

| Key                                           | English                                                     | German                                                            |
| --------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `form.abbreviate.action`                      | Abbreviate                                                  | Abkürzen                                                          |
| `form.abbreviate.undo`                        | Undo abbreviation                                           | Abkürzung rückgängig machen                                       |
| `form.abbreviate.undoHint`                    | Available until the editor closes.                          | Verfügbar, bis der Editor geschlossen wird.                       |
| `form.abbreviate.success` / `_one` / `_other` | Abbreviated {{count}} term. / terms.                        | {{count}} Begriff abgekürzt. / {{count}} Begriffe abgekürzt.      |
| `form.abbreviate.noMatches`                   | No abbreviations were applied.                              | Es wurden keine Abkürzungen angewendet.                           |
| `form.abbreviate.unavailable`                 | No localized abbreviations are available for this language. | Für diese Sprache sind keine lokalisierten Abkürzungen verfügbar. |
| `form.abbreviate.undone`                      | Abbreviation undone.                                        | Abkürzung rückgängig gemacht.                                     |

Do not add or modify abbreviations for `spell.metadata.castingTime`, `spell.metadata.range`,
`spell.metadata.duration`, `library.castingTime`, `library.range`, or `library.duration`.

## 7. Compact casting-time parser changes

Affected file: `src/cards/compact.ts`.

- Keep the existing full-text patterns and their order: full phrases must win before short forms.
  Within short forms, order longer tokens first (`BA` before `B`) and use the same
  longest-first discipline for unit alternatives so `mins` is not parsed as `min` plus a leftover
  `s`.
- Add short-form patterns for the semantic bases:
  - action: `A` and optional `1 A`;
  - bonus action: `BA` and optional `1 BA`; also accept the existing Compact glyph alias `B` and
    `1 B` for compatibility. The transformer still emits the catalog short `BA`; the display glyph
    remains `B`;
  - reaction: `R` and optional `1 R`.
- Add localized short unit recognition to the quantity parser:
  - English: `min`, `mins`, `minute`, `minutes`, `hr`, `hrs`, `hour`, `hours` (case-insensitive);
  - German: `min`, `Min`, `Minute`, `Minuten`, `Std.`, `Std`, `Stunde`, `Stunden`.
- Require a boundary after the unit token. Use case-insensitive matching and a boundary that works
  with an optional trailing period. Do not use `\b` after `Std.`; use a Unicode letter/number
  negative lookahead.
- Preserve the existing qualifier rules: only comma/semicolon qualifiers are extracted; a
  qualifier plus a caret falls back losslessly.
- Preserve the trailing caret handling and `raw` value.
- Keep `castingBaseDisplay`, `castingTimeFullLabel`, `buildCompactPresentation`, note ownership,
  numbering, fitting, and print behavior unchanged. The parser changes only classify abbreviated
  input into the same semantic base.
- Do not run the abbreviation transformer during card rendering, fitting, or printing.

Test matrix:

| Full input                          | Abbreviated input            | Expected semantic result                         |
| ----------------------------------- | ---------------------------- | ------------------------------------------------ |
| `Action`, `1 Action`                | `A`, `1 A`                   | action base, glyph `A`, full label `action`      |
| `Bonus Action`, `1 Bonus Action`    | `BA`, `1 BA`, `B`, `1 B`     | bonus base, glyph `B`, full label `bonus action` |
| `Reaction`                          | `R`                          | reaction base, glyph `R`, full label `reaction`  |
| `1 minute`, `10 minutes`            | `1 MIN`, `10 MIN`            | quantity minute, display `1 MIN`/`10 MIN`        |
| `1 hour`, `2 hours`                 | `1 HR`, `2 HR`               | quantity hour, display `1 HR`/`2 HR`             |
| German `1 Minute`, `10 Minuten`     | `1 min`, `10 min`            | quantity minute, localized display               |
| German `1 Stunde`, `2 Stunden`      | `1 Std.`, `2 Std.`           | quantity hour, localized display                 |
| `Reaction, which you take when hit` | `R, which you take when hit` | same base and qualifier                          |
| `Reaction ^`                        | `R ^`                        | same base and caret                              |
| `Special`                           | `Special`                    | fallback unchanged                               |

Also verify `buildCompactPresentation` gives the same `displayCastingTime`, `displayDuration`,
`castingNoteNumber`, `durationNoteNumber`, `notes`, and block fingerprint for corresponding full
and abbreviated inputs.

## 8. Task-based implementation plan

Tasks are ordered by dependency. Each task is independently reviewable and testable.

### T1 — Catalog access, eligibility, and exclusion policy

**Depends on:** none.

**Files:**
- `src/locales/abbreviations.ts`
- `src/locales/en.ts`
- `src/locales/de.ts`
- `src/locales/abbreviations.test.ts`
- `docs/abbreviations.md`

**Changes:**
- Add `AbbreviationLocale`, `AbbreviationEntry` with generated `forms`, `abbreviationCatalog(locale)`,
  `findAbbreviationSurfaceConflicts`, `EXCLUDED_ABBREVIATION_IDS`, and `isAbbreviationEligible`.
- Keep locale inventories independent; add definition-level `suffixes`/`forms` from section 5.4
  instead of mirrored plural keys.
- Add the English and German exclusion sets from sections 5.2 and 5.3.
- Extend the catalog tests:
  - docs parity passes per locale (independent inventories, `—` missing-side marker);
  - every exclusion ID exists in its own catalog and is ineligible;
  - no generated surface maps to different shorts;
  - conflicting synthetic surfaces are reported;
  - structured lookup IDs exist in both catalogs;
  - no-op entries are ineligible;
  - generated inflection forms resolve.
- Update `docs/abbreviations.md` with the plural lines, the exclusion policy/list, and a
  clarification that catalog identity is case-sensitive while the manual prose matcher is
  locale-aware case-insensitive.

**Acceptance:**
- `abbreviationCatalog("en")` and `("de")` return entries; `("fr")` and other codes return `null`.
- Exclusion sets contain only valid IDs and match the documented lists.
- `vp test src/locales/abbreviations.test.ts` passes.
- No generated SRD data or canonical enum changes.

### T2 — Transformer core matcher

**Depends on:** T1.

**Files:**
- new `src/locales/abbreviation-transform.ts`
- new `src/locales/abbreviation-transform.test.ts`

**Changes:**
- Implement `transformAbbreviationText` with `plain` mode and the matcher algorithm from section
  4.4.
- Implement eligibility filtering, sorting, case-folded longest-match, Unicode boundaries,
  single-pass replacement, idempotence, and the result contract.
- Implement excluded-match diagnostics in the result.
- Return unchanged text with no applied matches when the locale has no catalog. The form decides the
  `unavailable` status before calling the transformer.
- Do not import `marked` or React.

**Acceptance:**
- English and German terms, case-insensitivity, multi-word phrases, internal periods/spaces,
  longest match, overlapping terms, word boundaries, no-op/excluded skips, idempotence, and
  diagnostics pass.
- `transformAbbreviationText(transformAbbreviationText(text))` is stable for representative text.
- No inserted abbreviation is rescanned.
- Unknown locale does not transform.

### T3 — Markdown-aware protected ranges

**Depends on:** T2.

**Files:**
- `src/locales/abbreviation-transform.ts`
- `src/locales/abbreviation-transform.test.ts`

**Changes:**
- Add the `markdown` mode mask scanner from section 4.3.
- Implement protected ranges for fenced/inline code, HTML comments/tags, autolinks, bare URLs and
  emails, reference definitions, images, inline link destinations/titles, reference identifiers,
  escapes, and structural delimiters.
- Transform only unprotected line segments.
- Keep plain mode limited to URL/email protection.
- Add the required examples from section 2.2 and the tests listed in section 9.1.

**Acceptance:**
- `**bonus action**` → `**BA**`; `>`, `-`, and heading forms transform.
- Link display text transforms while the destination/title/reference identifier is byte-identical.
- `[https://example.com/bonus-action](https://example.com/bonus-action)` and standalone URLs are
  unchanged.
- Code, fenced code, HTML tags/attributes, escapes, and delimiters are preserved.
- Source formatting is not serialized or regenerated.

### T4 — Form action, undo, status, and localization

**Depends on:** T1, T2, T3.

**Files:**
- `src/components/details/CustomSpellForm.tsx`
- `src/components/details/CustomSpellForm.test.tsx`
- `src/locales/en.ts`
- `src/locales/de.ts`
- `src/locales/locales.test.ts` (only if the key-parity coverage needs extension)

**Changes:**
- Add the toolbar, action, undo button, status live region, state, and handlers from section 6.
- Add the field orchestration: Markdown mode for `description`/`higherLevels`; plain mode for
  metadata and component fields.
- Use `session.language` for matching; use the live `t` for UI strings.
- Snapshot only changed fields; push one snapshot per successful action; restore snapshots in
  LIFO order on undo.
- Clear the stack/status on open, spell change, and close.
- Add development-only skipped diagnostics logging.
- Add the localization keys from section 6.6.
- Do not modify any existing metadata label strings.

**Acceptance:**
- Action visible for new, custom-edit, and editable-copy drafts; absent for SRD override drafts.
- Action does not run automatically on open, save, language change, or card-design change.
- Applying changes only the scoped draft fields; `name`, structured fields, and unexposed fields
  are unchanged.
- Undo restores all fields changed by the corresponding action, overwrites later edits to those
  fields, and leaves unrelated fields untouched.
- Repeated actions use LIFO; closing/reopening or opening a different spell clears the stack.
- No-match and unsupported-language statuses are correct and accessible.
- Saving a transformed draft still passes `spellSchema` and uses the existing save path.
- UI labels remain **Casting Time**, **Range**, and **Duration** (and German equivalents).
- `vp test src/components/details/CustomSpellForm.test.tsx` passes.

### T5 — Compact casting-time parser compatibility

**Depends on:** T1 (catalog shorts). Independent of T2–T4; can run in parallel.

**Files:**
- `src/cards/compact.ts`
- `src/cards/compact.test.ts`
- optionally `src/cards/CompactCard.test.tsx` for rendering assertions

**Changes:**
- Add short-form action patterns (`A`, `BA`, `B`, `R`) after the full patterns.
- Extend the quantity pattern with `min`/`mins`/`MIN` and `hr`/`hrs`/`HR`, plus German
  `min`/`Std.` forms.
- Keep the existing qualifier, caret, fallback, display, full-label, note, and fit behavior.
- Do not add any render-time abbreviation call.

**Acceptance:**
- The full/abbreviated matrix in section 7 produces the same semantic parse, glyph, full label,
  qualifiers, caret, and notes.
- Existing unabbreviated parser tests still pass.
- No double abbreviation occurs in Compact rendering.
- `vp test src/cards/compact.test.ts` passes.

### T6 — Documentation updates

**Depends on:** T1–T5.

**Files:**
- `docs/abbreviations.md` (finish the manual transformation section; T1 owns the catalog lines)
- `docs/custom-spells-guide.md`, `docs/custom-spells-guide.de.md` (user-facing guide)
- `docs/specs/MAIN-spec.md` §6, §9, §12
- `docs/DEVELOPMENT.md` (module map, Localization, and Cards sections)
- `README.md` (custom-spell usage and limitations)
- `docs/specs/abbreviation-of-spell-data-spec.md` (this plan)

**Changes:**
- `docs/abbreviations.md`: document manual prose transformation, Markdown protected regions,
  exclusion policy/list, explicitly configured inflected forms (no inference), and
  non-reversibility.
- `docs/custom-spells-guide.md` and `docs/custom-spells-guide.de.md`: add the **Abbreviate** /
  **Undo abbreviation** behavior, the captured-language limitation, UI-label separation, and the
  fact that saving does not keep a reversible backup.
- `docs/specs/MAIN-spec.md` §6: add the custom-spell abbreviation action, scope, undo semantics,
  captured-language limitation, SRD-copy path, and UI-label separation.
- `docs/specs/MAIN-spec.md` §9: document Compact short-form parsing and that rendering never
  transforms stored text.
- `docs/specs/MAIN-spec.md` §12: add verification rows for the abbreviation action/undo and the
  Compact parser equivalence.
- `docs/DEVELOPMENT.md`: document the module-map entry for
  `src/locales/abbreviation-transform.ts`, `abbreviations.ts` catalog selection/exclusions,
  the matcher/protected-range scanner, form wiring/undo snapshots, and `compact.ts` short-form
  parsing.
- `README.md`: describe the user-facing **Abbreviate**/**Undo abbreviation** actions, the fact that
  UI labels are never abbreviated, the captured-language limitation, and that saved abbreviations
  are not automatically reversible.
- `docs/custom-spell-import-guide.md`: **no change**; no persisted backup field or import/export
  format change.

**Acceptance:**
- Each change-prone fact has one authoritative location per the documentation-ownership table.
- Relative links and anchors are valid.
- No command tables, schemas, or deployment procedures are duplicated.
- The docs match the implemented behavior and exclusion list.

### T7 — Verification and regression coverage

**Depends on:** T1–T6.

**Files:**
- `e2e/abbreviation.spec.ts` (new) or `e2e/editable-copy.spec.ts` (extend)
- any test files touched above

**Changes:**
- Add one Playwright scenario:
  - open **Create custom spell** (or **Create editable copy**),
  - enter a description with `**bonus action**`, a Markdown link, and a bare URL,
  - click **Abbreviate**,
  - assert the visible text changed to `**BA**` while the URL/link destination is unchanged,
  - assert the **Casting Time** UI label is still unchanged,
  - click **Undo abbreviation** and assert the original text returns,
  - apply again, save, and verify the custom spell saves normally (and, if practical, that Compact
    renders the stored abbreviated body).
- Run the required checks.

**Acceptance:**
- `vp check` passes.
- `vp test` passes.
- `pnpm run test:e2e` passes for the affected scenario(s) when the Workers preview suite is
  available.
- `git status` shows no changes to generated SRD datasets, `dist/`, or `.wrangler/`.

## 9. Test plan

### 9.1 Transformer unit tests (`src/locales/abbreviation-transform.test.ts`)

- **Approved policy terms:** English `action` → `A`, `reaction` → `R`, `damage` → `dmg`,
  `bonus action` → `BA`; German `Aktion` → `A`, `Reaktion` → `R`, `Schaden` → `SCH`,
  `Bonusaktion` → `BA`.
- **English terms:** `armor class` → `AC`, `temporary hit points` → `THP`, `willing creature` →
  `WILL`, `damage resistance` → `RES`, `concentration` → `Conc.`, `until dispelled` → `DISP`.
- **German terms:** `Rüstungsklasse` → `RK`, `Bonusaktion` → `BA`, `Schadensresistenz` → `RES`,
  `Konzentration` → `Konz.`, `Bis gebannt` → `BG`, `Berührung` → `BER`.
- **Case-insensitivity:** `Bonus Action`, `BONUS ACTION`, `bonus action` all → `BA`;
  `BONUSAKTION` → `BA`.
- **Internal spaces/periods:** `zum Beispiel` → `z. B.`; `das heißt` → `d. h.`; shorts remain
  stable on a second pass.
- **Longest match:** `temporary hit points` → `THP` (not `temporary HP`); `willing creature` →
  `WILL` (not `willing CRE`); `damage resistance` → `RES`; `Schadensresistenz` → `RES`.
- **Overlapping terms:** the longest phrase wins at the same start position.
- **Word boundaries/exactness:** `unwilling creature` unchanged; `creatures` unchanged;
  `12minutes` unchanged; `willing_creature` unchanged; `creature-type` unchanged; `bonus  action`
  (double space) unchanged because whitespace runs are not collapsed; `**bonus action**s`
  unchanged because the emphasis delimiter is looked through and the trailing `s` is a word
  character.
- **No-op entries:** `spell`, `self`, `touch`, `sight`, and `day` unchanged in English; `Selbst`,
  `Sicht`, and `Tag` unchanged in German.
- **English exclusions:** `round`, `turn`, `line`, `speed`, `bonus`, `presumably`, `possibly`,
  `in part`, and `or` unchanged.
- **German exclusions:** `Runde`, `Zug`, `Linie`, `Bonus`, `vermutlich`, `oder`, `Durchmesser`,
  and `Würfel` unchanged.
- **Newly eligible policy terms:** `between` → `b/w`, `advantage` → `adv.`, `disadvantage` →
  `disadv.`, `object`/`objects` → `obj.`, `target` → `tgt.`, `minimum` → `min.`, `maximum` →
  `max.`, `example` → `ex.`, `compare` → `cf.`; German `zwischen` → `zw.`, `Vorteil` → `VT`,
  `Nachteil` → `NT`, `Gegenstand`/`Gegenstände` → `Ggst.`, `Minimum` → `Min.`,
  `Maximum` → `Max.`, `Beispiel` → `Bsp.`, `vergleiche` → `vgl.`. Each works as a standalone
  word, matches case-insensitively, does not match inside longer words, and yields to longer
  eligible phrases such as `for example` and `zum Beispiel`.
- **Language-specific allowances:** `Berührung` → `BER`, `Zauber` → `Z.`, `Beispiel` → `Bsp.`,
  `eventuell` → `evtl.`, `zum Teil` → `z. T.`, `sogenannt` → `sog.`, `Bewegungsrate` → `BR`.
- **Idempotence:** transforming each eligible `short` leaves it unchanged; transforming a
  representative mixed text twice equals one pass.
- **Single pass/no rescan:** a text where a short form contains another full term must not cascade.
- **Diagnostics:** excluded terms appear in `skipped` with reason `excluded`; applied terms do not.
- **Unknown locale:** text unchanged and no applied matches.
- **Markdown structures:**
  - `**bonus action**` → `**BA**`
  - `*bonus action*` → `*BA*`
  - `# bonus action` → `# BA`
  - `> bonus action` → `> BA`
  - `- bonus action` → `- BA`
  - `1. bonus action` → `1. BA`
  - `` `bonus action` `` unchanged
  - fenced code block unchanged
  - `| bonus action |` → `| BA |`
- **Links and URLs:**
  - `[bonus action](https://example.com)` → `[BA](https://example.com)`
  - `[bonus action](https://example.com "bonus action")` → label `BA`, title unchanged
  - `[bonus action][ref]` → `[BA][ref]`; `[ref]: https://example.com "bonus action"` unchanged
  - `[bonus action][]` unchanged because the label is also the collapsed reference identifier
  - `[bonus action]` shortcut unchanged
  - `![bonus action](https://example.com)` unchanged
  - `[https://example.com/bonus-action](https://example.com/bonus-action)` unchanged
  - `<https://example.com/bonus-action>` unchanged
  - standalone `https://example.com/bonus-action` unchanged
- **HTML:** `<span title="bonus action">bonus action</span>` keeps the attribute and transforms the
  inner text to `BA`.
- **Escapes/entities:** `\*bonus action\*` keeps the escapes and transforms the visible text;
  `&amp;` remains unchanged.
- **Caret/paragraphs:** `bonus action ^` → `BA ^`; newlines remain; a phrase split across a line
  break is not joined.
- **Plural units:** `10 minutes` → `10 MIN`; `2 hours` → `2 HR`; `30 meters` → `30 MTR`;
  `30 feet` → `30 FT`; German `10 Minuten` → `10 min`; `2 Stunden` → `2 Std.`; `30 Meter` →
  `30 m`.

### 9.2 Form component tests (`src/components/details/CustomSpellForm.test.tsx`)

- Action visible for new, custom-edit, and editable-copy drafts; absent for SRD override drafts.
- Clicking the action transforms `description`, `higherLevels`, metadata, and component fields;
  `name` and structured/unexposed fields are unchanged.
- No automatic transformation on render, language change, or saving.
- No-match status and unavailable-language status.
- Undo restores all changed fields, including overwriting a later manual edit to a changed field;
  unrelated fields remain edited.
- LIFO undo for two actions.
- Undo stack cleared on close/reopen and on opening a different spell.
- Status is exposed through `role="status"`.
- Save-through-validation: transformed draft reaches `saveCustomSpell`, retains ID/`source`, and
  passes `spellSchema`.
- Cancel persists nothing.
- UI labels remain **Casting Time**, **Range**, and **Duration** after the action; German labels
  remain **Zeitaufwand**, **Reichweite**, and **Wirkungsdauer**.
- Captured-language behavior: open in German, change live language to English, apply; matching
  still uses German.

### 9.3 Parser/Compact tests (`src/cards/compact.test.ts`)

- The full/abbreviated matrix in section 7.
- Qualifier and caret behavior for short forms.
- German `Std.` period boundary and `min` case-insensitivity.
- `buildCompactPresentation` equivalence for full vs abbreviated inputs.
- Existing fallback behavior (`Special`, `Action or Reaction`) unchanged.
- No render-time double abbreviation: a stored `BA` or `1 MIN` is displayed through the parser, not
  transformed again.

### 9.4 E2E

- New `e2e/abbreviation.spec.ts` or an extension of `e2e/editable-copy.spec.ts` covering the
  create/edit/abbreviate/undo/save flow described in T7.
- Run against the existing Playwright/Workers preview setup.

## 10. Documentation updates

| Document                                                        | Update                                                                                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/abbreviations.md`                                         | Manual prose transformation rules; protected regions; exclusion policy/list; configured inflection forms; case-sensitivity clarification; non-reversibility note. |
| `docs/custom-spells-guide.md`, `docs/custom-spells-guide.de.md` | User-facing **Abbreviate**/**Undo abbreviation**, language limitation, UI-label separation, non-reversibility after save.                                 |
| `docs/specs/MAIN-spec.md`                                       | §6 custom-spell action/scope/undo/language/SRD-copy path/UI-label separation; §9 Compact short-form parsing; §12 verification rows.                       |
| `docs/DEVELOPMENT.md`                                           | Independent catalogs/generated forms/conflict validation, transform module and protected-range scanner, form wiring/undo snapshots, Compact parser changes. |
| `README.md`                                                     | User-facing **Abbreviate**/**Undo abbreviation**, language limitation, non-reversibility after save, UI labels unchanged.                                 |
| `docs/custom-spell-import-guide.md`                             | No change. No schema field, backup, or import/export format change.                                                                                       |
| `docs/specs/abbreviation-of-spell-data-spec.md`                 | This revised plan.                                                                                                                                        |

## 11. Acceptance criteria

1. The **Abbreviate** action appears in new, custom-edit, and editable-copy drafts and is absent from
   the restricted SRD editor.
2. Applying it transforms only the scoped free-text fields from section 3.1; `name`, structured
   fields, unexposed fields, and Markdown syntax/URLs/code stay unchanged.
3. Visible prose inside bold, italic, headings, blockquotes, lists, and link display text is
   transformed; URLs, link destinations/identifiers, autolinks, code, HTML tags/attributes,
   escapes, and delimiters are preserved.
4. **Undo abbreviation** restores all fields changed by the corresponding action, overwrites later
   edits to those fields, leaves unrelated fields untouched, and works until the dialog closes.
5. Repeated application is idempotent; longest phrases win; word boundaries hold; excluded terms
   remain unchanged.
6. Matching uses the captured draft language and the `en`/`de` catalogs; unsupported languages are
   a no-op with an explanatory status.
7. Excluded/skipped terms are visible through development diagnostics and never through production
   UI.
8. Abbreviated casting-time values still render with the correct Compact glyph, accessible full
   label, qualifiers, notes, caret handling, and fitting; abbreviated `range` and `duration` values
   render verbatim and fit correctly.
9. Saving a transformed draft produces an ordinary custom spell through the existing validation and
   persistence path; cancelling persists nothing.
10. The SRD **Create editable copy** flow remains the only path for editing SRD spell text.
11. UI labels for **Casting Time**, **Range**, and **Duration** (and their German equivalents) are
    never abbreviated in the editor, details, Classic, Compact, preview, or print.
12. No new persistence model, schema field, generated dataset, normalization change, import/export
    format change, or render-time automatic transformation is introduced.

## 12. Approved policy decisions

The product owner approved the following decisions; they are reflected in the implementation and in
section 5.5.

1. **Standalone `action`/`reaction` are eligible.** English `1 Action` → `1 A` and `Reaction` → `R`;
   German `1 Aktion` → `1 A` and `Reaktion` → `R`.
2. **Standalone `damage`/`Schaden` are eligible.** English `damage` → `dmg`; German
   `Schaden` → `SCH`. Longer compounds still win.
3. **Plural unit catalog entries are approved.** `minutes`, `hours`, `meters`, `Minuten`,
   `Stunden`, and the shared German `Meter` spelling are explicit entries.
4. **Hidden component-description fields are transformed** because they remain part of the draft.
5. **German standard forms remain allowed** (`Bsp.`, `evtl.`, `sog.`, `bzw.`, `ca.`, `z. B.`,
   `d. h.`, `u. a.`, `usw.`, `etc.`, `z. T.`), including `vergleiche` → `vgl.`.
6. **Field-label terms in prose are eligible.** `range`, `casting time`, and `duration` (and their
   German equivalents) may be abbreviated in prose; the UI labels are never transformed.
7. **Common prose terms are eligible.** English replaces `between`, `advantage`, `disadvantage`,
   `object`/`objects`, `target`, `minimum`, `maximum`, `example`, and `compare`; German replaces
   `zwischen`, `Vorteil`, `Nachteil`, `Gegenstand`/`Gegenstände`, `Ziel`, `Minimum`, `Maximum`,
   `Beispiel`, and `vergleiche`. Longer phrases and exact-word boundaries still take precedence.

No architectural conflict remains. Post-save restoration, persisted backups, automatic
de-abbreviation, icon/glyph substitution, build-time preprocessing, and render-time abbreviation
remain out of scope.

## 13. Out of scope

- Automatic abbreviation of Compact card content at render, fit, pagination, preview, or print time.
- Build-time or normalization-time preprocessed abbreviation datasets.
- Direct editing of canonical SRD descriptions; use **Create editable copy**.
- Automatic de-abbreviation or inference of original wording.
- A persisted abbreviation backup or post-save restore unless separately approved.
- Conflict detection, selective restoration, text diffs, or merge logic for undo.
- Icon/glyph/SVG substitution for abbreviations.
- Abbreviating UI labels, canonical enums, structured fields, or unexposed data.
