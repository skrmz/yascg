# Spell Card Designs — Classic Preservation and Compact Addition: Spec

**Status:** Implemented (Classic remains the default; Compact is additive). Acceptance notes in this
document are aligned with `MAIN-spec.md` §9–§10; the deferred backlog in §10 remains deferred.
**Primary objective:** Preserve the existing plain spell-card design as **Classic** and add an optional **Compact** design with higher information density and improved visual hierarchy/readability, without losing rules information or breaking print output.
**Existing abbreviation infrastructure:** `src/locales/en.ts` and `src/locales/de.ts` already contain a preparation-only `abbreviations` namespace (121 semantic entries with `.full` and `.short`); `src/locales/abbreviations.test.ts` verifies parity with `docs/abbreviations.md`, i18next runtime access, and duplicate short forms. Treat this as existing work to integrate, not a catalog to recreate. The catalog's addition did not change UI or runtime card behavior.
**Source of truth:** Inspect the actual application and documentation before modifying anything; this handoff describes product requirements, not an assertion about the present code architecture.

## 1. Scope and implementation approach

Review the current spell-card components, data types, Markdown renderer, print CSS, text measurement/auto-fit engine, localization, and source/pagination behavior. Then implement a **focused, incremental second card design** using the existing stack. Keep the current card design available and visually/functionally intact as **Classic**; implement this document’s revamped card layout as **Compact**:

- React 19, strict TypeScript, Vite + `@vitejs/plugin-react`
- Tailwind CSS v4, shadcn-style Radix primitives, `@radix-ui/react-tooltip`
- Lucide icons and existing Sonner notifications (no notification changes required)
- Existing fonts: `--font-card-title: "Vollkorn", serif`; `--font-card-body: "Alegreya Sans", "Barlow Semi Condensed", sans-serif`

Prefer **semantic React/HTML and CSS Grid/Flexbox** with modest CSS borders/badges. Reuse the app's established styling patterns. **Do not** start with a monolithic SVG/`foreignObject` card or an elaborate overlay frame. New libraries and custom SVG icon collections are not needed for this phase. Preserve card size and the existing physical print dimensions (currently targeted at **2.5 × 3.5 in / 63.5 × 88.9 mm**, subject to verification against the actual code/docs).

**Nonnegotiable constraints:** Do not replace or restyle the Classic card in the course of implementing Compact. Never silently omit game rules; maintain current data compatibility; preserve localization, Markdown, print/pagination, source display, and accurate screen/print measurement. Do not overwrite stored spell records to produce view-specific formatting.

## 2. Design priorities (in order)

1. **Density (Compact only):** Replace the Classic design’s multirow casting-time/range/components/duration table with a compact, well-aligned metadata header in the new Compact design; leave Classic unchanged.
2. **Hierarchy:** Make title, level, casting time, and primary mechanics immediately scannable.
3. **Legibility:** Keep rules prose readable; use whitespace strategically rather than ornate borders.
4. **Reliability:** Accommodate long spell names, unusual values, long rules, printed cards, and multiple languages.

Avoid trading usable text area for decoration. The Compact layout should look designed while remaining practical at physical card size. All layout/design prescriptions in §§3–7 apply **only to Compact**, unless explicitly identified as shared infrastructure or cross-design compatibility requirements.

### 2.1 Card design selector in `DeckPane` (required)

- Add a new **card design selector section** in `DeckPane`, placed in DOM and visual order **after `deck-controls` and before `deck-entries`**. Keep those existing sections and their functionality intact.
- Provide exactly two user-facing options: **Classic** (the existing plain/simple card design) and **Compact** (the new design specified in §§3–7). Use existing accessible selector/control patterns, and localize its label and option names for English and German.
- **Classic must remain the default** for existing users and for any absent/invalid design selection, so deploying this feature does not silently alter existing card appearance. If the app has a suitable existing preference persistence mechanism, reuse it; otherwise keep selection in the appropriate generator/deck state without introducing new storage infrastructure solely for this feature. Do not infer a persistence contract from this spec.
- Selection applies consistently to **all cards in the relevant deck**, preview, print and print-to-PDF, including card measurement/fit and pagination. A card must not print or measure in a different design from the one selected. Switching designs must recompute design-dependent measurements/pagination when necessary without modifying spell records or deck contents.
- Keep reusable spell-data presentation/formatting utilities separate from the two visual designs where practical, but do not force Classic to adopt Compact-only abbreviations, notes, header/footer structure, or styling. Any shared functional bug fix must be evaluated for Classic compatibility rather than assumed safe.
- The design selector is interactive generator UI only: **do not render the selector in printable output**. Ensure keyboard/screen-reader use, visible active selection, and normal operation when switching between designs and languages.
- Verify exact component and state boundaries in the existing app before implementation. The terms `deck-controls` and `deck-entries` identify the required placement, not a claim about their underlying component structure.

## 3. Compact design — target information architecture

This is a **conceptual structure**, not a fixed pixel template:

```text
[LEVEL 2] [Dragon's Breath                        ]
    [B]    [target icon Touch] [hourglass icon up to 1 min]
           [V] [S] [M]                            a hot pepper

[C]  You touch one willing creature ...
     Each creature ... half as much damage ...

[+]  The damage increases by 1d6 for each spell slot
     level above 2.            [only when higherLevels exists]

[SRD] | [TRN] |                                    [SOR · WIZ]
```

Exact grouping/alignment may change after testing with real content. Preserve existing source and pagination functionality; do not hardcode card numbers, specific school names, or class labels. A compact border/accent is welcome.

### 3.1 Header: spell level, title, and casting time

- Display spell level as a small, single-outline circular badge containing only the numeric spell level (0–9), without additional text such as "Level". The badge must be visually subordinate to the spell title and occupy minimal space. Do not use double circles, prominent decorative rings, or oversized badges. Display casting time separately as a compact abbreviation or short quantity/unit value, without explanatory labels.
- Casting-time short forms: `A` = Action, `B` = Bonus Action, `R` = Reaction; for longer casting times show a concise quantity/unit form using the active-language catalog short (`1 MIN`, `10 MIN`, `1 HR` in English; `1 min`, `10 min`, `1 Std.` in German). Support cantrips (`0`) and level 1–9.
- The printed card and standard preview must not display redundant explanatory text alongside casting-time abbreviations. For example, display only `B`, not `B Bonus Action`. Retain full meanings in accessible labels, tooltips, and the generator-level glossary. Preserve all mechanically relevant casting-time qualifiers through the numbered footnote mechanism defined in §4.
- Title uses existing Vollkorn; allow wrapping for long titles. Never force single-line clipping.
- Casting-time qualifiers/overflow are a required functional fix; see §4.

### 3.2 Range and duration

- Use Lucide `Target` (or `Crosshair` after visual review) next to the **actual `range` string**.
- Use Lucide `Hourglass` next to a compact, semantically faithful representation of the **actual `duration` string**; preserve qualifiers such as `up to` where omission would distort the rules. Concentration is shown independently.
Display `range` and `duration` as compact, icon-first metadata items, without visible explanatory labels such as "Range" or "Duration". Each item consists of its Lucide icon followed directly by the actual semantic value, for example `[Target] Touch` and `[Hourglass] up to 1 min`. Avoid large containers, explanatory subtitles, and redundant text. Preserve relevant duration qualifiers and the complete original meaning. Do not infer area of effect from the range field.
- For unusually long values, wrap/adapt the metadata layout rather than silently clip the data.

### 3.3 Spell components and materials

- Show `V`, `S`, `M` as CSS-drawn square letter boxes, rendered only when the respective boolean is true. The boxes must form one continuous horizontal group with no gaps between adjacent boxes and no doubled internal borders. Use simple square, consistent box dimensions, centered letters, and a thin shared border treatment. Do not use circular component badges or Unicode enclosed-letter glyphs.
- If material is present, show `materialDescription` in readable italic text, preserving the entire description (including costs/consumption when present). **No ellipsis-only truncation** of game-relevant text.
- Make abbreviations discoverable via tooltip + glossary; see §6.

### 3.4 Body and special indicators

- Preserve the current trusted Markdown rendering pipeline and content semantics; don't introduce unsupported inline icon tokens.
- Show `concentration` as a compact standalone `C` indicator, without the visible word "Concentration". Position it immediately to the right of the connected `V`/`S`/`M` component group, separated only by a small, consistent spacing. Render `C` only when concentration is required, independently of the duration text. If `ritual` is applicable, display a distinct `R` indicator in an unambiguous location that does not interfere with the component/concentration group. Retain accessible full labels and tooltip/glossary definitions.
- A separated `(+)` section is shown **only for an explicitly defined and nonempty `higherLevels` property**. See §5 for exact behavior.
- School accent color should be restrained and come from centralized mapping/tokens with a neutral fallback. Avoid assigning specific school palettes in scattered component CSS.

### 3.5 Footer

- **Footer structure:** Divide the footer into exactly three horizontally arranged sections: Source | School | Classes. Use simple thin vertical separators between sections. Keep the footer compact, with consistent baseline alignment and minimal vertical padding.
- **Abbreviation source of truth:** Use the existing active-language i18next `abbreviations` namespace defined in `src/locales/en.ts` and `src/locales/de.ts`. Each of its stable semantic identifiers exposes `.full` and `.short`. Do not read or parse `docs/abbreviations.md` at app runtime, duplicate the catalog in component-local constants, or use abbreviation text as lookup keys. `docs/abbreviations.md` remains the documentation/reference used by the existing parity test, not the UI's runtime lookup source.
- **Semantic resolution:** Resolve sources, schools, classes, and other shortened labels through explicit semantic identifiers or existing typed/domain mappings, not a reverse lookup keyed only by short text. Reused short strings such as `R`, `FT`, and `INIT` represent distinct meanings. Use the active language's `.short` for display and `.full` for accessible labels/tooltips/glossary. If a spell label cannot be mapped confidently to a catalog semantic ID, retain the original appropriate localized label. Do not invent short forms or mutate spell data. Inspect the actual namespace identifiers and i18next access conventions before wiring UI.
- **Source (left):** Display the matching localized catalog `.short` where there is a supported semantic mapping (e.g. `SRD` if defined); otherwise keep the existing source label. Preserve `source`/`sourceLabel` and pagination semantics; do not hardcode sources or replace identifiers indiscriminately.
- **School (center):** Display the matching localized catalog `.short` when available (e.g. `TRN` if defined), otherwise the full school label. Use centralized restrained school-color tokens and a neutral fallback. Expose localized `.full` through accessible labels/tooltips.
- **Classes (right):** Display only applicable classes. Resolve each individual class through its own catalog semantic identifier (e.g. Sorcerer and Wizard separately, potentially `SOR · WIZ`). Unmapped labels remain full. Preserve existing `classes` versus `subclasses` semantics; never conflate entries merely because their short forms coincide. A spell with no classes renders `—` with a localized accessible label.
- **Separators and fitting:** Use a simple `|` or an equivalent CSS vertical border between the three footer sections. Separate multiple classes with a consistent delimiter, preferably `·`. Allocate space adaptively rather than enforcing rigid equal-width columns. Allow long or localized values to wrap when necessary. Do not truncate mechanically relevant information.
- **Accessibility and consistency:** Display abbreviations must retain their corresponding full names through tooltips, accessible labels, and the generator-level glossary where applicable. Reuse the localized `abbreviations` namespace through i18next rather than maintaining conflicting hardcoded mappings or parsing Markdown at runtime. Resolve abbreviations for the active language where supported, and fall back to the original localized name when no appropriate mapping exists. Abbreviations are presentation-only and must never overwrite stored spell data.

## 4. Required casting-time normalization and qualifier footnotes

**Problem:** Some `castingTime` strings contain additional conditions/comments following `Action`, `Bonus Action`, or `Reaction`, and currently become clipped. Need a compact badge without losing the extra rule.

**Required behavior:**

1. Normalize **presentation only**, never mutate original `spell.castingTime` or `spell.description`.
2. Parse common leading forms case-insensitively: `Action`, `Bonus Action`, `Reaction`, and time definitions expressed in minutes/hours. Preserve relevant number and unit. Respect localized spell content where applicable; do not assume English-only parsing without checking existing i18n/data.
3. **Do not use a blind fixed-character truncation.** The restriction is semantic: the header displays the recognized short base casting time (`A`, `B`, `R`, `10 MIN`, `1 HR` in English; `10 min`, `1 Std.` in German), not arbitrary first N characters.
4. If extra explanatory/conditional text follows a recognized base, attach a **superscript reference** (e.g. `A¹`, `R¹`) and append the complete qualifier as a readable **numbered note associated with the description section**, without changing the stored description. The exact note position and line-breaking should be chosen to maximize clarity and avoid accidental mixing with core spell text.
5. If no safe base/qualifier split is possible, show a readable compact fallback (wrapping/alternate header treatment) and retain the full text. **Never invent a qualifier or silently drop the unparsed remainder.**
6. Reference numbers must be unique **within the card** when more than one card-local annotation exists; assign them with an incrementing counter in metadata order (casting time, then duration), so a duration-only note is `¹` and a synthetic casting note plus a duration note is `¹`, `²`. The marker must link the header to its note unambiguously, in both screen and print. If the card has multiple casting-time clauses, preserve their meaning rather than assuming a single suffix.
7. A tooltip may additionally expose the original full casting-time string on screen, but **is not a substitute for the printed/readable qualifier note**.
8. Ensure special casting times, e.g. reactions with triggers, are tested. If a qualifier is integral to using a reaction, make it visibly available in the card body, not hover-only.

**Example (illustrative; verify actual library strings):**

```text
castingTime: "Reaction, which you take when a creature you can see ..."
header:      [R¹]
description: [original description unchanged]
             ¹ Casting time: which you take when a creature you can see ...
```

Agent should examine real casting-time variants in the spell library and implement a conservative parser with tests. Document known unsupported formats and their non-destructive fallback. Avoid duplicate text when a qualifier is already clearly present in a structured existing field or explicitly repeated in the description: normalize case/whitespace and check exact-substring containment only; do not apply broad fuzzy deduplication.

## 5. Optional `higherLevels`: simple, strict contract

Decision for this phase: Use `higherLevels` only when the property is explicitly present and nonempty. Otherwise do nothing special.

- When `higherLevels` is present, render it in a separate subsection marked by a circled `+`, applying the existing content/Markdown processing as appropriate.
- When absent, null, or empty, **do not search, parse, move, or strip higher-level passages from `description`**. Render `description` exactly through the existing pipeline, even if it contains an inline heading such as `Using a Higher-Level Spell Slot.`
- Do not automatically extract higher-level text from any free-text description. Do not duplicate it in an empty separate section.
- If both `higherLevels` and similar text in `description` are present, **preserve both source fields rather than silently deleting or guessing which text is redundant**. Note this as a spell-library data quality concern; avoid adding fuzzy automated cleanup to the redesign.
- A future library update may reliably populate `higherLevels`. The presentation should then use it automatically without requiring a new design refactor.

**Dragon's Breath sample:** The English JSON lacks `higherLevels`, so the full description remains inline and the conceptual `(+)` section is not rendered for it. German *Drachenodem* contains `higherLevels`, so it renders the separated `(+)` section. Both variants must be tested.

## 6. Tooltip and legend/glossary UX

Compact abbreviations must be discoverable; **do not print or display a glossary under every card by default**. Existing Classic rendering does not need to adopt Compact abbreviation UI.

- Reuse installed `@radix-ui/react-tooltip` and current app patterns for hover/focus clarification where feasible. Expose tooltips for casting-time abbreviations (`A/B/R`), square component letters (`V/S/M`), concentration `C`, ritual `R`, and icon-only metadata headings such as range and duration. Tooltips and accessible names must provide contextual meanings without adding explanatory text to the printed card. Tooltips must show the **full contextual term**, distinguishing e.g. `R` (Reaction) from `R` (Ritual).
- Add one **Legend / Abbreviations** entry at the card generator/page level, opening a dialog (prefer existing Radix/shadcn-style dialog primitive) containing all abbreviations/icons currently in use, grouped sensibly (casting time, properties, components, school/classes, range/duration). Avoid showing a separate glossary dialog trigger on every printed card.
- Use the existing i18next `abbreviations` catalog for glossary entries and abbreviation tooltips, selecting by semantic identifier and reading `.full` / `.short`; centralize any icon-only explanatory labels alongside existing localization without duplicating abbreviation strings. Provide localized accessible names where the app already supports i18n.
- The legend must remain usable with keyboard and touch devices. Tooltips should work on keyboard focus; **the dialog is the reliable non-hover fallback**. Semantic `aria-label`/accessible names should convey short-form meaning.
- Render tooltips, dialog triggers, and dialogs in the interactive app UI, **not in printable card output**. Printed cards remain self-contained for rule-critical text (including casting-time notes); optional legend may be a future separate printable reference sheet (not required now).
- Scope the legend to the abbreviations/icons actually supported, not a complete glossary of shape/damage glyphs (those are deferred).

## 7. Typography, layout, and fitting rules

- Retain Vollkorn for title and Alegreya Sans / Barlow Semi Condensed fallback for body. Use consistent font weights, line heights, and measured physical sizes.
- Prioritize compactness through removal of redundant visual labels and consolidation of metadata, not through excessive text shrinking. The level badge must remain small and secondary to the title. Component squares must remain connected without gaps. The concentration indicator must align visually with the component group. Icon/value metadata and the three-part footer must remain legible at physical print dimensions.
- Use the current card dimensions/print units and source-controlled CSS rules; avoid refactoring print dimensions into ad-hoc Tailwind utilities. Verify existing documented dimensions before adjusting styles.
- **Do not prescribe a new hardcoded global auto-shrink range**; inspect and preserve existing fit algorithm and minimum readability constraints unless there is a demonstrated defect. Metadata should adapt before body text becomes too small.
- For **each selected design**, screen previews and hidden measurement DOM must use equivalent component structure, styles, font loading, and actual text. The print view must match the measured layout. Print constraints are authoritative.
- Test with the final installed fonts loaded and print color handling enabled as already supported by the app. Accent color must not be the sole carrier of meaning.
- Prevent overlapping badges/spines/footers, clipped text, and page overflow. Optimize for readable use of space rather than cosmetic whitespace elimination.
- If content truly cannot fit at the readable minimum, **use the app's existing overflow/continuation behavior** (inspect and preserve it) or identify the gap and report it rather than silently hide content.

## 8. Execution sequence

1. **Audit first:** Identify `DeckPane`, `deck-controls`, `deck-entries`, existing Classic card implementation and shared preview/print/measurement pathways. Map Markdown, data model for `higherLevels`, casting-time values, class/school mappings, i18next `abbreviations` namespace and its tests, and source/pagination. Record Classic compatibility constraints.
2. **Small implementation plan:** Identify files/components and expected changes. Define design selection/state and dispatch to Classic vs Compact; reuse existing i18next semantic identifiers. Prefer reusable presenters/formatters over parsing inside JSX.
3. **Preserve Classic and add selector:** Keep the existing plain card as Classic; add the accessible, localized Classic/Compact selector between `deck-controls` and `deck-entries`; propagate selection consistently through preview/measurement/print. **Build Compact layout:** Level/time cluster, title, range/duration chips, components/materials, body, conditional higher-level section, compact footer.
4. **Implement casting-time qualifier notes** with safe parser and unmodified source data.
5. **Add Compact tooltips and a single generator-level glossary dialog**, backed by the existing localized abbreviation catalog. Ensure accessible focus/touch operation and print exclusion.
6. **Validate both designs on many real spells**, including switching designs, in preview and physical print/print-to-PDF. Iterate density, typography, and line wrapping without regressing functionality.
7. **Update documentation:** Review and update `README.md`, `docs/DEVELOPMENT.md`, and `docs/specs/MAIN-spec.md` as appropriate to explain Classic vs Compact, selection/default behavior, preview/print consistency, and the runtime abbreviation catalog. **At least the documentation that describes card generation, UI, architecture, or localization must be updated; do not treat this as optional simply because the exact document ownership must be checked.** Do not claim documentation was updated without changing relevant files.
8. **Deliver:** Brief change summary, files changed, screenshots or before/after references where tooling permits, test results, and any known exceptions/data issues. Do not introduce deferred features as part of this patch.

## 9. Acceptance criteria / test matrix

**Design coexistence and integration**

- [ ] Existing simple/plain card stays available as **Classic**, with its existing visual appearance and expected behavior preserved; the redesign is a separately selectable **Compact** design and is not a replacement.
- [ ] `DeckPane` contains a labeled design selector section **between `deck-controls` and `deck-entries`**, with exactly **Classic** and **Compact** options (localized in English and German).
- [ ] Classic is the safe/default selection when no valid selection is available; switching to Compact and back does not alter spell/deck data or damage existing control/entry behavior.
- [ ] Selection produces the same chosen design in deck entries/cards, preview, hidden fit measurement, print and print-to-PDF; design changes trigger necessary remeasurement/pagination. Selector UI does not print.
- [ ] Regression tests confirm Classic stays intact and Compact visual/functional requirements below apply only to Compact.
- [ ] Abbreviation UI resolves `.short` and `.full` from semantic keys in the **active language** via i18next; no runtime `docs/abbreviations.md` reader, ambiguous reverse lookup, or duplicated abbreviation catalog is introduced.
- [ ] Existing `src/locales/abbreviations.test.ts` parity/runtime/duplicate-short-form tests continue passing; add specific Compact usage, fallback, and language-switching tests as needed.
- [ ] Documentation is updated in the relevant file(s) among `README.md`, `docs/DEVELOPMENT.md`, and `docs/specs/MAIN-spec.md`, covering design selector, Classic default/coexistence, Compact layout, print behavior, and abbreviation integration.

**Compact-specific visual and functional criteria**

- [ ] Existing *Dragon's Breath* sample: mid size single-outline level circle containing only `2`; casting-time abbreviation `B` without explanatory text; range icon plus `Touch`; hourglass icon plus faithful `up to 1 minute` duration; directly connected square `V`, `S`, `M` boxes with no gaps; standalone `C` immediately to their right; full italic material description `a hot pepper`; and a three-part footer displaying Source | School | Classes, separated by `|`. Each value uses its corresponding active-language i18next `abbreviations` entry when semantically mapped; otherwise, its original full name is displayed. For example, when all relevant abbreviations are defined, the footer displays `SRD | TRN | SOR · WIZ`. Abbreviations are resolved independently for each source, school, and class.
- [ ]  In this spell the description remains fully inline because `higherLevels` is absent. All data-driven source and pagination behavior remains intact.
- [ ] Components use adjacent square boxes with shared internal borders and no visible gaps, including spells with only one or two components.
- [ ] Level badges use a mid size single circle containing only the numeric spell level, including cantrips and levels 1–9.
- [ ] `Concentration` is displayed exclusively as a standalone `C` indicator adjacent to the component group, without redundant printed text.
- [ ] The footer consistently uses Source | School | Classes, with vertical separators. Each value is abbreviated only when a corresponding semantic mapping exists in the active-language i18next catalog; otherwise, its full name is displayed. Mixed abbreviated and unabbreviated values are supported. Unknown or homebrew names are preserved without truncation or invented abbreviations.
- [ ] `Range`, `Duration`, and `Casting Time` metadata omit redundant visible labels while preserving all essential rules values, qualifiers, and accessible explanations.
- [ ] Spell with **explicit `higherLevels`** renders a separated `+` subsection; one without it does not.
- [ ] A qualified `Reaction`/`Action`/`Bonus Action` has compact badge + correct matching superscript and complete visible description note; no clipped qualifier.
- [ ] Casting times in minutes/hours, unknown forms, and localized variants either parse accurately or use a lossless readable fallback.
- [ ] Long titles, long materials, long range/duration labels, complex Markdown, and maximum-body-length spells fit or use documented non-lossy overflow handling.
- [ ] Ritual and concentration indicators are correct, independently of duration text; `R` collision resolved through position/context and accessible wording.
- [ ] Only abbreviations supported by the existing localized catalog and unambiguous semantic mapping are displayed for sources, schools, and classes. Undefined, unusual, localized, or homebrew names fall back to their original full text without data loss. Abbreviation lookup does not modify stored spell data.
- [ ] Tooltips work on mouse and keyboard; glossary dialog works with keyboard/touch and is **not repeated under every spell**.
- [ ] No tooltip/dialog UI is printed; rules notes **are** printed.
- [ ] Source labels, existing pagination, localization, and auto-fit/measurement remain functional.
- [ ] Printed 2.5 × 3.5 in cards (or dimensions confirmed from code) do not overlap or crop in supported print flows.
- [ ] Regression coverage for cantrips, short/long spells, costly/consumed materials, class variations, and spells with no material component.

## 10. Deferred ideas — RETAIN THIS SECTION FOR FUTURE PHASES

**Important instruction to the coding agent:** Preserve this backlog intact in your implementation summary or project design notes. **Do not implement these items now, and do not discard them** merely because they are out of scope. If a later change makes one obsolete, document why instead of silently deleting it.

1. **Inline semantic glyphs in descriptions:** Explicit markup/token support for actions (`[A]`, `[B]`, `[R]`), area shapes (cone, cube, sphere, line, cylinder), and potentially damage types. Requires a deliberate data/Markdown token contract, sanitization rules, rendering/print compatibility, and fallback text; do **not** infer shape tokens indiscriminately from prose.
2. **Area-of-effect metadata:** Future optional structured area data for e.g. 15-foot cones in a range/effect chip. Today's `range: "Touch"` does not contain that area; do not guess it from descriptions now.
3. **Richer decorative frame:** Vertical school name, left spine, notched decorative corners, ornamental school borders, or elaborate border-mounted symbols `C`/`R`/`+`. These remain deferred. The current phase uses a simple, compact level circle, connected square component boxes, a standalone concentration indicator, and a plain three-part footer. Do not introduce decorative treatments that compete with these intentionally minimal elements.
4. **Custom glyph/icon library:** Purpose-built class emblems, school icons, area/damage icons, optional circular icon treatments. Current phase uses Lucide + CSS letters + text abbreviations.
5. **Optional inactive-class icon strip:** Greyed-out ineligible classes as a visual legend; not required, and likely worse for density than displaying eligible classes only.
6. **Automated higher-level extraction / library cleanup:** Do **not** implement detection of higher-level phrases in free-text `description` now. A future data curation pass can populate `higherLevels` for all spells; an explicit normalization/migration tool may be considered separately with validation.
7. **Richer rules emphasis:** Opt-in, tested dice/damage/save highlighting or semantic markup, rather than broad regex-based `<strong>` injection.
8. **Printable standalone legend sheet / card back:** A separately printable glossary reference could be offered later, while keeping individual spell cards compact.
9.  **Advanced layout modes:** Optional ultra-compact or ornamented themes after the baseline design and print-fidelity benchmarks are stable.

## 11. Implementation guardrails

- Keep the existing Classic renderer intact; add the Compact renderer or a well-isolated design variant without rebuilding the generator. Avoid a single global restyle that changes Classic.
- Avoid unrequested dependencies, ad-hoc SVG assets, implicit data mutation, hidden semantic changes, and brittle regex for arbitrary game prose.
- Reuse the existing semantic-keyed i18next abbreviation catalog (`.short`/`.full`); only add domain-to-semantic-key adapters where needed. Do not duplicate translation data or infer meanings from repeated abbreviation text.
- Ensure printed spell cards never require hover for mechanically important information.
- Favor deterministic, tested rules over clever heuristics. Report ambiguous data formats and preserve them faithfully.

## 12. Documentation update requirement (deliverable)

After implementation, inspect and update **`README.md` and/or `docs/DEVELOPMENT.md` and/or `docs/specs/MAIN-spec.md`** according to which files currently document the relevant concerns. Cover the existence and naming of Classic/Compact, the selector location in `DeckPane`, default/fallback selection, any actual persistence semantics, design-specific rendering/measurement/print behavior, and the active-language abbreviation catalog in `src/locales/en.ts` / `src/locales/de.ts` with its parity test against `docs/abbreviations.md`. State that Compact is additive and Classic remains supported. Do not document unimplemented storage or UI functionality. Include updated documentation paths in the delivery summary.
