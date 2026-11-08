# YASCG Workspace UI Improvement Specification

**Status:** Implemented — H-01/H-02 approved by owner; final verification recorded below  
**Date:** 2026-11-07  
**Scope:** Main application workspace, shared UI controls, and responsive behavior  
**Implementation state:** UI, regression coverage, and documentation alignment implemented  
**Document role:** Initiative design record; implemented behavior is owned by [MAIN-spec](../MAIN-spec.md) and implementation guidance by [DEVELOPMENT](../../DEVELOPMENT.md).

This document consolidates the read-only UI critique, the owner's clarifications, and a technical evaluation of the current React implementation. It is a specification, not an implementation plan. A separate coding agent may derive a task-based plan from the workstreams in §F.

---

## A. Overview and objectives

### A.1 Context

YASCG is a browser-only, offline-first spell-card generator for Dungeons & Dragons 5.5e. Its primary users are dungeon masters and players who:

1. find and filter spells from the SRD or their custom spells;
2. inspect a spell's printable 2.5in × 3.5in card;
3. assemble an ordered active deck;
4. save named deck snapshots; and
5. print cards at a chosen card design.

The app is a static Cloudflare SPA with no backend, no API, no server-side storage, and no secrets. Local data lives in IndexedDB. The current UI is dark-only, uses warm ink/parchment tones, gold interactive accents, serif display faces, and a paper-white card preview. The physical card preview and print output are core product artifacts.

### A.2 Current UI problems and impact

The original manual critique scored the workspace **30/40 (Good)** on Nielsen's heuristics, with the weakest scores for aesthetic/minimalist design and workspace hierarchy. The problems that materially affect the primary task are:

- On wide screens, the workspace grid assigns **20% / 60% / 20%** of the width to Library, Preview & Details, and Active Deck. At 1440px this gives a cramped library while a fixed **240 × 336px** card preview occupies about 11% of an **864 × 843px** details pane. The preview has no screen-only zoom, and long spell names ellipsize without a full-name affordance.
- At tablet widths, the app drops all the way from a three-pane workspace to full-screen tabs. At 820px portrait and 1024px landscape, users must switch between Library, Details, and Deck even though the available width can support Library and a second pane simultaneously.
- The mobile filter sheet presents eleven filter groups at once (three primary groups plus eight advanced fields) and hides the filtered result count behind the sheet, forcing trial-and-error.
- Several mobile controls are 28–32px high (tabs, deck actions, deck-row controls, fit selector), below the project's chosen 44×44 usability target. The library add control is already 44×44, so the treatment is inconsistent.
- The selected spell is conveyed only through background colour and is not exposed in the accessibility tree. Multi-select filter triggers announce only a generic label ("Class") rather than the current selection.
- The deck's save vocabulary is inconsistent: the visible action says **Save**, the hint references **Save As…**, and Save As is available only in the overflow menu. "New deck" is used for both the current status and a destructive action.
- The source filter's default state shows both SRD and Custom chips inactive while all sources are included. A user cannot tell whether "inactive" means "no restriction" or "excluded."
- Minor issues include an empty-results state without an inline reset action, unexplained 2rem top padding in the preview frame, and a Legend description that implies it is only relevant to Compact designs. The owner confirmed the Legend must remain available for both card designs.

### A.3 Desired experience and improvement objectives

The target experience is a responsive card-building workbench that preserves context as the viewport narrows:

- **O1 — Preserve context on tablets.** A tablet user can browse the Library while seeing the selected spell's card without losing the Library view, and can reach the Deck in one deliberate action.
- **O2 — Give the working surfaces proportionate space.** The Library earns enough width to scan names and controls; the preview uses its available space for a legible card; the Deck remains usable without dominating.
- **O3 — Reduce mobile decision load and improve recovery.** Filters are progressively disclosed, the result count is visible while filtering, and empty results offer an immediate reset.
- **O4 — Make touch interaction reliable.** Primary controls meet the chosen 44×44 target in compact and split layouts, without increasing desktop visual density.
- **O5 — Expose state to assistive technology.** Selection, filters, and result changes are programmatically available, not only visual.
- **O6 — Make deck persistence self-explanatory.** The visible action and status copy use the same vocabulary, so a first-time user can create a named deck without opening a hidden menu.

The improvements must remain incremental. They should not require a UI rewrite, new runtime dependencies, a new data model, a routing change, or changes to printed card output.

### A.4 Scope

In scope:

- Workspace layout modes, breakpoints, and container-width adaptation.
- Library row density and long-name presentation.
- Preview scaling, centering, and removal of unused preview padding.
- Mobile/split filter sheet progressive disclosure and live result count.
- Source filter scope clarity.
- Touch target sizing for compact and split layouts.
- Selection and filter-summary semantics for assistive technology.
- Deck save/status terminology and visibility.
- Legend availability and explanatory copy.
- Empty-results recovery.
- Small contextual help for card fit modes.
- Supporting tests, documentation, and specification alignment.

### A.5 Non-goals

- Visual rebranding, palette replacement, or typography changes beyond the explicitly listed copy and state treatments.
- Changes to card layouts, pagination, text fitting, font sizes, or printed card output.
- Data-model, IndexedDB schema, saved-deck, import/export, or deck-ordering changes.
- New backend endpoints, server-side rendering, APIs, secrets, analytics, or third-party UI libraries.
- Redesign of the custom-spell editor, print dialog content, About/legal pages, or the active deck's future Table view.
- Implementing the pending Table view specification; this initiative must not conflict with it.
- A light theme. The current app is dark-only; that is treated as an existing product decision, not a defect to fix here.
- Arbitrary device-specific layouts (for example, "iPad mode"). Layout decisions must be driven by available workspace width and content minima.

### A.6 Relationship to existing specifications and conflicts

- **`docs/specs/MAIN-spec.md`** remains authoritative for current product behavior. This specification proposes changes to:
  - §5 Workspace and Library: replace the current "three panes at ≥1200px, tabs below 1200px" statement with the three-mode layout in §D; refine narrow-viewport filter presentation; add preview scaling and Library rows with two-line names.
  - §5 Narrow-viewport Library layout: filters continue to apply immediately; advanced filters become progressively disclosed in the sheet; the result count becomes visible inside the sheet.
  - §9 Card Layout and Text Fitting: clarify that screen preview scaling is a view-only transform; the card's physical print size, measurement, pagination, and fit cache remain unchanged. Update the localized Legend description referenced by that section, which currently describes Compact-only abbreviations.
  - §12 Verification Matrix: add rows for compact, split, and wide workspace behavior; right-pane switching; preview scaling; touch targets; selection semantics; save vocabulary; source scope.
  - The 1200px wide-layout threshold is retained, but the fractional `2fr 6fr 2fr` column model is replaced by content-minimum columns. The 720px split threshold and compact tab behavior are new.
- **`docs/DEVELOPMENT.md`** currently documents `AppShell`'s 1200px grid and `useIsDesktop` as the single JavaScript breakpoint. It must be updated after implementation to describe the workspace layout observer, new modes, and test harness changes.
- **`docs/specs/todo/table-deck-view-spec.md`** plans a Table view inside the Active Deck. The split-layout right-pane switcher must be able to host the existing card-based Deck pane and any future Table view without changing the shared deck model. Do not implement the table specification here.
- **`docs/specs/todo/ci-cd-adjustment-spec.md`**, **`docs/specs/todo/impressum-legal_notice-spec.md`**, and **`docs/specs/todo/buymeacoffee-integration-spec.md`** are unrelated.
- No existing specification is modified by this document. Approved design decisions (H-01/H-02) must be resolved before implementation begins. Final synchronization of `MAIN-spec.md`, `DEVELOPMENT.md`, and the verification matrix (§R-DOC-01) is scheduled after implementation behavior is finalized, not as a prerequisite for coding.

### A.7 Requirement, evidence, and status conventions

- **Confirmed:** The owner has accepted the finding/recommendation; implementation is in scope subject to technical feasibility.
- **Recommended:** The specification recommends the approach, but a product or architecture decision is still required or validation may alter the exact thresholds.
- **Decision needed:** A consequential choice is unresolved and recorded in §H.
- **Observed:** Confirmed by rendered UI inspection.
- **Source-supported:** Confirmed by reading implementation or tests.
- **Inferred:** A reasonable consequence of the evidence, not directly exercised.
- Priority uses the audit's P0–P3 scale: P0 blocking, P1 major, P2 minor/annoyance with workaround, P3 polish.

---

## B. Current-state assessment

### B.1 Current implementation

- `src/components/AppShell.tsx:112` uses `grid-cols-[2fr_6fr_2fr]` at `min-width: 1200px`; below that, the shell renders a three-tab interface with every pane mounted via `forceMount`.
- `src/components/library/use-is-desktop.ts:3` defines `(min-width: 1200px)` as the single JavaScript viewport breakpoint. It selects which Library filter tree and actions UI are mounted.
- `src/components/library/LibraryFilters.tsx` renders one filter tree per mode: inline (desktop) or sheet (narrow). The desktop branch collapses advanced filters; the sheet branch renders all advanced fields expanded.
- `src/components/library/LibraryPane.tsx:420` styles the selected spell row with `bg-accent` only. The row button at `:423-427` has no selection attribute.
- `src/ui/MultiSelect.tsx:104` sets the trigger `aria-label` to the generic group label, replacing the visible label-plus-summary name.
- `src/components/deck/DeckPane.tsx:377` shows the unsaved-deck hint; the primary action at `:386` is labeled Save, while Save As appears only at `:416`. Save on an unassociated deck opens the Save As dialog at `:247-249`. The status "New deck" at `:130` shares its label with the "New deck" action at `:419`.
- `src/print/print.css:894-905` makes `.card-preview-frame` a wrapping flex row with fixed card dimensions, `align-items: flex-start`, and `padding-top: 2rem` reserved for a "floating preview actions trigger" that is not present in the reviewed UI.
- `src/services/data/search.ts:36` defaults `sources` to `[]`; source chips are active only when their value is included, so the default renders both chips inactive while all sources pass the filter.
- `src/ui/Tabs.tsx:26` gives tab triggers `px-3 py-1 text-sm` with no minimum height. `src/ui/Button.tsx:21` defines `sm` as `h-7` and `icon` as `h-8 w-8`. `src/ui/Field.tsx` uses `h-9` for inputs and selects. `src/ui/Slider.tsx:28` uses a 16px thumb.
- The shell uses `100dvh` minus a keyboard inset, locks page scrolling, and gives each pane its own scroll region. This behavior must be preserved.

Current width consequences:

| Workspace width | Current layout | Approximate pane widths | Consequence                                                                                   |
| --------------: | -------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
|          1920px | Three panes    | 384 / 1152 / 384        | Preview is far larger than needed; library and deck remain narrow fractions.                  |
|          1440px | Three panes    | 288 / 864 / 288         | Library is cramped; a 240px card occupies ~11% of the details pane area.                      |
|          1280px | Three panes    | 256 / 768 / 256         | Library controls approach their practical minimum.                                            |
|          1200px | Three panes    | 240 / 720 / 240         | The breakpoint produces the narrowest three-pane experience rather than a natural transition. |
|          1199px | Tabs           | One pane at a time      | All side-by-side context disappears immediately below 1200px.                                 |
|          1024px | Tabs           | One pane at a time      | Tablet landscape wastes available width and requires tab switching.                           |
|           820px | Tabs           | One pane at a time      | iPad portrait cannot view Library and card together.                                          |
|           390px | Tabs           | One pane at a time      | Appropriate for phone, but mobile target sizes and filter discovery need refinement.          |

### B.2 Audit findings

The following finding IDs are used throughout this document. Severity is the original audit's priority, not a new measurement.

| ID   | Area                | Finding                                                                                                                                                                                               | Severity       | Evidence                                       | Impact                                                                                                                   | Source                                                          |
| ---- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| F-01 | Layout / preview    | Desktop allocates 60% of width to a details pane that contains a fixed 240×336px card; the library gets 20% and truncates long names. The card has no fit/zoom control and sits against the top-left. | P1             | Observed + source-supported                    | The core preview needs close viewing or "Show details"; primary browsing gets the least space; long names are ambiguous. | `AppShell.tsx:112`, `print.css:894`, `LibraryPane.tsx:429`      |
| F-02 | Responsive          | The app switches directly from three panes to full-screen tabs below 1200px. Tablet portrait and landscape cannot show Library and card simultaneously.                                               | P1             | Observed + source-supported                    | Tab switching costs context and navigation steps; available tablet width is underused.                                   | `AppShell.tsx:112-159`, `use-is-desktop.ts:3`                   |
| F-03 | Mobile filters      | The sheet presents all filters, including eight advanced fields, and does not show the live match count.                                                                                              | P2             | Observed + source-supported                    | Users adjust blind, close the sheet to check results, and must remember prior adjustments.                               | `LibraryFilters.tsx:234-260`, `LibraryPane.tsx:458-481`         |
| F-04 | Touch               | Tabs, deck toolbar actions, deck-row controls, fit selectors, and several sheet controls are 28–36px; the library add button is already 44×44.                                                        | P2             | Observed + source-supported                    | Mis-taps on adjacent actions, especially reorder/remove; one-handed use is harder.                                       | `Tabs.tsx:26`, `Button.tsx:21`, `DeckPane.tsx:756`, `Field.tsx` |
| F-05 | Accessibility       | The selected spell is indicated only by background colour and has no programmatic selected/current state. Multi-select triggers expose only the generic filter label, not the current value.          | P2             | Observed accessibility tree + source-supported | Screen-reader users cannot identify the selected spell or active filter values without opening each control.             | `LibraryPane.tsx:420-427`, `MultiSelect.tsx:104`                |
| F-06 | Deck copy           | Save/Save As vocabulary is inconsistent and Save As is hidden in overflow. "New deck" is both status and action.                                                                                      | P2             | Observed + source-supported                    | A first-time user may not know how to create a named deck; the hint points to a control they cannot see.                 | `DeckPane.tsx:377-419`                                          |
| F-07 | Source filter       | Empty `sources` means "all sources," but both chips appear inactive. No explicit "All" state exists.                                                                                                  | P3             | Source-supported + observed                    | "Inactive" can be read as "excluded"; source filtering semantics are ambiguous.                                          | `search.ts:36`, `LibraryFilters.tsx:264-273`                    |
| F-08 | Library density     | Long spell names truncate to one line with no full-name affordance. At the observed desktop width, "Protection from Evil and Good" needed 193px but had 131px.                                        | P2             | Observed + measured                            | Users cannot distinguish similarly prefixed spells without selecting them.                                               | `LibraryPane.tsx:429-437`                                       |
| F-09 | Empty results       | "No spells match…" offers no inline clear/reset action; reset lives inside the filter sheet on mobile.                                                                                                | P3             | Observed + source-supported                    | Recovery from an empty result set costs extra navigation.                                                                | `LibraryPane.tsx:408-411`                                       |
| F-10 | Preview polish      | `.card-preview-frame` reserves `padding-top: 2rem` for a floating trigger that does not exist.                                                                                                        | P3             | Source-supported + observed                    | Unexplained blank space above the card reduces the preview's usable area.                                                | `print.css:894-905`                                             |
| F-11 | Legend              | The Legend stays visible for both designs, but its copy says it describes Compact cards only. The owner confirmed abbreviations can also be applied to editable spells in Classic.                    | P3             | Observed + owner clarification                 | Users may dismiss the Legend as irrelevant to Classic or miss the abbreviation path.                                     | `DeckPane.tsx:469-478`, `locales/en.ts:657`                     |
| F-12 | Responsive strategy | The owner is open to replacing the fixed 1200px/tab strategy and asked for evaluation of two-pane tablet layout and container-based adaptation.                                                       | P1/P2 planning | Owner input + source-supported                 | Current strategy underuses tablet space and has no container awareness.                                                  | `AppShell.tsx`, `use-is-desktop.ts`                             |
| F-13 | Fit-mode help       | "Best fit / Auto shrink / Multi-card" have no contextual explanation in the deck pane.                                                                                                                | P3             | Source-supported                               | New users must infer fit semantics or consult outside documentation.                                                     | `DeckPane.tsx:760-762`                                          |
| F-14 | Text hierarchy      | `--color-foreground` is mapped to `--primary`, so default body/interactive text is gold and the cream foreground token is effectively unused.                                                         | P3 (open)      | Source-supported + observed                    | The palette is cohesive but flatter than intended; gold is used for both body labels and primary emphasis.               | `index.css:16`                                                  |
| F-15 | Dark-only           | No light mode exists.                                                                                                                                                                                 | Open question  | Observed                                       | Not a defect by itself; it may limit accessibility/user preference.                                                      | `index.css`                                                     |

### B.3 Strengths to preserve

- **S-01 — Distinct product identity.** The ink/parchment dark palette, gold accent, Vollkorn/Cormorant headings, Karla body text, and paper-card artifact are specific to a tabletop spell-card tool. Do not replace them with a generic dashboard aesthetic.
- **S-02 — Domain-fit workflow and bulk actions.** Search/filter, one-click add, ordered deck, named snapshots, card designs, print settings, and bulk append/replace match the DM's task.
- **S-03 — Guardrails and feedback.** Confirmations for replace/clear/new/delete, duplicate prevention, inline deck validation, save-conflict recovery, toasts, undo delete, and status text are strong. Preserve them while changing labels.

### B.4 Evidence limits

The findings are from a manual, read-only critique using rendered desktop/tablet/mobile evidence and source inspection. The Impeccable detector was not run. Contrast was calculated from OKLCH tokens (muted text approximately 5.6:1 on cards and 6.0:1 on the background) but was not a full WCAG audit. The original review did not exercise keyboard flows end-to-end, a screen reader, 200% zoom, actual print output, German long-string layouts, or runtime error recovery. Treat those as validation obligations for implementation.

---

## C. Proposed changes and requirements

### C.1 Requirement summary

| ID           | Requirement                                                    | Priority               | Status                                                 | Dependencies                                          |
| ------------ | -------------------------------------------------------------- | ---------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| R-LAY-01     | Three-mode adaptive workspace with a two-pane tablet layout    | P1                     | Recommended — decisions H-01/H-02                      | R-LAY-02, R-LAY-03                                    |
| R-LAY-02     | Container-width-driven layout observation                      | P2 (technical enabler) | Recommended                                            | None; prerequisite for R-LAY-01                       |
| R-LAY-03     | Content-minimum wide-pane proportions and state preservation   | P1                     | Recommended — decision H-01                            | R-LAY-02                                              |
| R-PREVIEW-01 | Screen-only preview scale control and centering                | P2                     | Confirmed — H-03 resolved (Physical default)           | R-LAY-03                                              |
| R-PREVIEW-02 | Remove unused preview frame padding                            | P3                     | Confirmed                                              | R-PREVIEW-01                                          |
| R-LIB-01     | Two-line spell names and usable Library density                | P2                     | Confirmed                                              | R-LAY-03                                              |
| R-LIB-02     | Inline recovery from empty results                             | P3                     | Confirmed                                              | —                                                     |
| R-FILT-01    | Progressive disclosure and live count in the filter sheet      | P2                     | Confirmed                                              | R-LAY-01, R-FILT-02                                   |
| R-FILT-02    | Explicit All / SRD / Custom source scope                       | P3                     | Confirmed                                              | —                                                     |
| R-TOUCH-01   | 44×44 touch targets in compact and split layouts               | P2                     | Confirmed                                              | R-LAY-01                                              |
| R-A11Y-01    | Programmatic and visual selected-spell state                   | P2                     | Confirmed                                              | R-LIB-01                                              |
| R-A11Y-02    | Current filter values in accessible names                      | P2                     | Confirmed                                              | R-FILT-01/02                                          |
| R-DECK-01    | Consistent Save / Save As / New deck vocabulary and visibility | P2                     | Confirmed                                              | —                                                     |
| R-LEGEND-01  | Legend available for both designs with accurate copy           | P3                     | Confirmed — H-05 resolved                              | R-DECK-01                                             |
| R-HELP-01    | Contextual, accessible fit-mode explanation                    | P3                     | Recommended                                            | R-DECK-01                                             |
| R-DOC-01     | Align MAIN-spec, DEVELOPMENT, and verification matrix          | P1 (process)           | Confirmed — final synchronization after implementation | H-01/H-02 approval; implementation behavior finalized |

### C.2 Detailed requirements

#### R-LAY-01 — Three-mode adaptive workspace

- **Affected:** `AppShell`, `LibraryPane`, `DetailsPane`, `DeckPane`, `Tabs`, the new workspace layout hook; e2e layout tests.
- **Current problem (F-02, F-01):** Below 1200px the app drops all panes into full-screen tabs. At 720–1199px, Library and Preview cannot be seen together even though their content minima fit. At ≥1200px the fractional grid under-serves the Library.
- **Desired behavior:** Introduce three layout modes based on available workspace width:
  - **Compact:** full-screen Library / Details / Deck tabs, as today.
  - **Split:** Library always visible on the left; the right pane shows either Details or Deck through a labeled two-tab switcher. Both right-pane views stay mounted when hidden so state is preserved.
  - **Wide:** all three panes visible, with Library and Deck at content-minimum widths and Preview taking the remainder.
- **Functional requirements:**
  - In Split mode, the right pane has a `Details | Deck` tab list with the active view exposed through standard tab semantics. The Library remains visible.
  - Deck access is one deliberate action from the right-pane switcher. The switcher may show the deck entry count and unsaved indicator, but must not introduce a second deck model.
  - Selecting a spell from the Library or a resolved deck row switches the right pane to Details so the selection is visible.
  - Adding a spell keeps the existing one-click behavior. If the existing selection behavior moves focus/visibility to Details, preserve that behavior consistently across modes.
  - Crossing layout modes must not lose search text, filter state, Library list scroll, selected spell, active deck, right-pane selection, or open-but-unsubmitted deck-name edits that the current app preserves.
  - The full three-tab bar appears only in Compact mode. Wide mode shows no full-screen tab bar. Split mode shows the two-tab right-pane switcher only.
  - Filter and Library action chrome follows the layout: Compact and Split use the `Filters` trigger plus sheet and the `Library actions` menu; Wide uses the existing inline filter stack and inline actions.
- **Visual/UX requirements:**
  - Reuse existing pane surfaces, borders, focus rings, typography, and tab styling. Do not introduce a new navigation visual language.
  - The Library/right split must remain legible at the minimum library width. Long names are handled by R-LIB-01.
  - The right-pane switcher must not compete with the library search row. Place it in the right pane's local header/toolbar area.
- **Responsive behavior:** Defined in §D. The mode is determined by the **measured inline width of the workspace container**, not the viewport. Container thresholds are 720px (Compact→Split) and 1200px (Split→Wide) unless H-01 changes them. Split is intended to cover iPad portrait (820px), iPad landscape (1024–1180px), and narrow desktop windows. Viewport dimensions in acceptance tests are representative device scenarios; they are not authoritative breakpoint inputs.
- **Accessibility:**
  - Only one tab list may be present in the accessibility tree per context; hidden alternate tab lists must be hidden appropriately.
  - Right-pane tabs must support arrow-key navigation, focus-visible rings, and programmatic selection.
  - Pane content must remain reachable in a logical keyboard order. Library is not repeated in the right-pane switcher.
  - When a hidden pane becomes visible after a mode change, focus must not be trapped in a hidden subtree.
- **Acceptance criteria:**
  - With a workspace container of 820px, 1024px, and 1180px, Library and one right pane are simultaneously visible; the Deck is reachable with one action. These widths are representative device scenarios, not viewport breakpoint inputs.
  - With a workspace container of 390px and 320px, the three full-screen tabs are present and the right-pane switcher is absent.
  - With a workspace container of 1200px and wider, all three panes are present and the full-screen tab bar is absent.
  - Resizing the container across all thresholds preserves search, filters, Library scroll, selection, right-pane choice, and deck contents.
  - A controlled test where the viewport and workspace container widths differ (for example, a 1440px viewport containing a 700px workspace) selects the mode from the container width, not the viewport.
  - Selecting a Library spell or Deck row makes Details visible in Split mode.
  - No page-level horizontal overflow and no additional page-level vertical scroll.
- **Dependencies:** R-LAY-02, R-LAY-03, R-TOUCH-01; decisions H-01/H-02.

#### R-LAY-02 — Container-width-driven layout observation

- **Affected:** New workspace layout hook, `AppShell`, `use-is-desktop.ts`, CSS container rules, test setup.
- **Current problem (F-02, F-12):** Layout is controlled by a single viewport `matchMedia` query. All visual density classes are hard-coded to `min-[1200px]`/`max-[1199px]`, and the JS breakpoint determines which filter tree is mounted.
- **Desired behavior:** Determine layout mode from the inline width of the workspace container, not the viewport. Centralize the thresholds and expose one layout mode (`compact`, `split`, `wide`) for React mount decisions; use CSS container queries for purely visual adaptations where practical.
- **Functional requirements:**
  - Observe one workspace container with `ResizeObserver`; update only when the derived mode changes, not on every pixel.
  - Keep thresholds in one module/constant set. Do not scatter new breakpoints across components.
  - Keep a safe fallback for environments without `ResizeObserver` or during initial render; default to a deterministic mode and update on mount.
  - The mode drives which Library filter tree and actions UI are mounted (inline vs sheet/menu), the pane arrangement, and the tab presentation.
  - CSS container queries may handle borders, spacing, and other purely visual adaptations; do not render duplicate form controls solely to switch with CSS.
  - Remove or reduce hard-coded `min-[1200px]`/`max-[1199px]` responsive classes that encode layout decisions now owned by the layout hook or container queries. Retain viewport-based rules only where the rule is genuinely viewport-specific (for example, the application header).
- **Visual/UX:** No user-visible change except the correct layout at each width. Avoid layout flash on first paint after resize.
- **Responsive:** Thresholds are content minima, not device names (see §D.3).
- **Accessibility:** Mode changes must not duplicate IDs, duplicate landmark names, or leave hidden panes focusable.
- **Acceptance criteria:**
  - A unit-level test can render the workspace in containers of 700px, 800px, 1300px and observe Compact/Split/Wide respectively without changing the viewport.
  - Resizing the workspace container from 390 to 820 to 1180 to 1200 to 1440 changes mode at the documented thresholds and preserves state.
  - A test where the viewport and workspace container widths differ (for example, a 1440px viewport with a 700px container, and a 390px viewport with an 800px container) derives the mode from the container width, not the viewport.
  - The implementation uses one observed workspace container and one threshold source; no new per-component `matchMedia` breakpoints are introduced.
  - No continuous re-render occurs while scrolling or during a resize that stays within one mode.
- **Dependencies:** None; prerequisite for R-LAY-01/R-LAY-03.

#### R-LAY-03 — Content-minimum wide-pane proportions

- **Affected:** `AppShell` grid, pane wrappers, `LibraryPane`/`DeckPane` minimum widths.
- **Current problem (F-01):** The `2fr 6fr 2fr` grid gives the Library and Deck 20% each at every wide width, including 240px at 1200px. The preview's fixed card uses only a fraction of its 60% share.
- **Desired behavior:** Replace fractional shares with content-derived minimums:
  - Library: `clamp(320px, 24%, 400px)`
  - Preview: `minmax(560px, 1fr)`
  - Active Deck: `clamp(300px, 22%, 360px)`
  - At 1200px the resulting preview is ≥560px; at 1440px the Library is ~346px and Deck ~317px; at 1920px Library/Deck cap at 400/360px and Preview receives the remaining width.
- **Functional requirements:**
  - The three panes remain mounted in Wide mode; no unmount/remount when resizing.
  - The Library uses the inline filter stack and inline actions in Wide mode.
  - The Deck's existing content, reordering, save/print/open, and card design controls remain unchanged except for the copy and touch requirements in this spec.
  - The preview pane uses the remaining width for R-PREVIEW-01; no new metadata pane is introduced (MAIN-spec §5 U1 remains in force).
- **Visual/UX:** The Library must not look like a narrow sidebar; the Deck remains usable at 300px. Borders and internal padding use existing tokens. No horizontal overflow at the minimum width.
- **Responsive:** Wide is ≥1200px of workspace container width, but the exact threshold is derived from the 320 + 300 + 560 content minimum plus breathing room.
- **Accessibility:** Pane landmarks and headings remain unique. Hidden tab content (Compact/Split) must not be exposed in Wide.
- **Acceptance criteria:**
  - At a 1200px workspace container: Library ≥320px, Deck ≥300px, Preview ≥560px; no horizontal overflow; inline filters and inline actions are present.
  - At a 1440px workspace container: Library 320–400px, Deck 300–360px, Preview fills the remainder; card preview is centered according to R-PREVIEW-01.
  - At a 1920px workspace container: Library and Deck clamp to their maxima; Preview grows without stretching the card beyond the configured scale.
  - Resizing between Split and Wide preserves state and does not duplicate pane content.
- **Dependencies:** R-LAY-02; H-01.

#### R-PREVIEW-01 — Screen-only preview scaling and centering

- **Affected:** `DetailsPane`, `.card-preview-frame`, card preview DOM/wrapper, `print.css`, locale strings, tests.
- **Current problem (F-01):** The physical card preview is fixed-size and top-left aligned in a large pane; there is no way to enlarge it for reading without using Show details or browser zoom. The pane's space does not serve the core artifact.
- **Desired behavior:** Keep the card's physical print size as the source of truth, but add a screen-only preview scale control:
  - **Physical (100%)** — render at the current 2.5in × 3.5in physical size.
  - **Fit width** — scale the rendered card(s) to the available preview width, capped at **200%**, so text becomes readable without making a single card unreasonably large.
  - Center the preview group horizontally when it fits; keep top alignment and wrapping for multi-card layouts.
- **Functional requirements:**
  - Default to Physical (100%); H-03 is resolved in favor of this default, with Fit width available as an alternative.
  - The scale control is localized, labeled, keyboard-operable, and is not printed.
  - Scale only the rendered screen preview. Do not change the card DOM dimensions used by hidden measurement, fit computation, pagination, or print. Do not change the effective font point size, fit result, card count, or printed output.
  - Multi-page previews scale consistently; rows wrap without overlap and without clipping.
  - Fit width accounts for the preview's horizontal padding and, if applicable, any scrollbar; it must not introduce horizontal scrolling.
  - When the pane is too narrow for the selected scale, the preview area scrolls or fits; the page itself must not scroll horizontally.
  - Remove any dependence on the card's untransformed width for centering the visual result.
- **Visual/UX:** The scale control should be a small, unobtrusive segmented control or labeled select near the preview status, not another primary action. Centering applies to the visual group, including a single card and wrapped multi-card rows.
- **Responsive:** The control appears in Compact, Split, and Wide. Fit width is especially useful in Compact; Physical remains available. The split/wide preview must not be dominated by the control.
- **Accessibility:** Label the group ("Preview scale") and each option. Selection must be programmatic. Do not rely on tooltip-only explanations. The transform must not create a focus or reading-order trap.
- **Acceptance criteria:**
  - Physical mode renders the card at the same CSS physical width as the current preview (approximately 240px at 96 CSS px/in); Fit width enlarges it to the available width up to 200%.
  - Selecting either mode does not change the fit font size, page count, truncated/overflow status, details dialog content, or print dialog count.
  - The card(s) are horizontally centered in the preview frame; a single card is not left-aligned.
  - The scale control is absent from print and from the printed card DOM.
  - Toggling scale at 390×844, 820×1180, 1024×768, and 1440×900 preserves state and causes no page-level horizontal overflow.
  - Keyboard users can change the scale and see a visible focus state.
- **Dependencies:** R-LAY-03; H-03 resolved (Physical default).

#### R-PREVIEW-02 — Remove unused preview frame padding

- **Affected:** `.card-preview-frame` and the preview toolbar/status area.
- **Current problem (F-10):** A 2rem top padding is reserved for a floating trigger that does not exist in the reviewed UI.
- **Desired behavior:** Remove the reserved strip. Place the scale control from R-PREVIEW-01 in normal flow, using existing spacing tokens. No floating trigger is required.
- **Functional/visual:** The preview frame's top spacing is explained by real content; no unexplained blank area above the card. Removing the padding must not cause the card to touch the pane header or the status notices.
- **Responsive:** Applies at all widths; the toolbar/toggle wraps without overlap at 320px.
- **Accessibility:** No impact on reading order; the scale control remains labeled.
- **Acceptance criteria:** No 2rem hard-coded top padding remains for the missing trigger; the visual gap above the preview is accounted for by the status/toolbar layout; print styles are unchanged.
- **Dependencies:** R-PREVIEW-01.

#### R-LIB-01 — Library row density and full-name access

- **Affected:** `LibraryPane` result rows, long-name rendering, add button, SRD badge, tests.
- **Current problem (F-08, F-01):** Names are single-line truncated. At the observed desktop width, a long name had 131px client width for 193px of content and no title/tooltip. The result row also has to fit the SRD badge and add control.
- **Desired behavior:** Allow spell names to wrap to at most **two lines** with ellipsis in **Compact, Split, and Wide** layouts, preserving the metadata line, SRD badge, and add control. The full name remains available in the button's accessible name and in Details.
- **Functional requirements:**
  - Use a two-line clamp/wrap with a stable minimum row height. Do not let the add button or source badge overlap the name.
  - Keep the spell-name target one-click for selection; the add control remains separate.
  - At the minimum Library width (320px in Split/Wide), the name gets sufficient text width to distinguish likely spell names; no horizontal scrolling.
  - No reliance on hover-only `title` for full-name access; hover tooltips may be added but are not the sole mechanism.
- **Visual/UX:** The list remains scannable: two-line names only when needed; metadata stays one line; row heights can vary. Do not increase all rows unnecessarily.
- **Responsive:** Two-line wrapping applies in Compact, Split, and Wide. Compact must not reduce the list's usable height excessively; the list remains the only vertical scroll container.
- **Accessibility:** The selectable button's accessible name contains the full spell name; the visual ellipsis must not truncate the accessible name.
- **Acceptance criteria:**
  - "Protection from Evil and Good" and a representative long custom name render up to two lines at the minimum Library width (320px in Split/Wide; full width in Compact) without overlapping the badge or add control, in Compact, Split, and Wide.
  - Names longer than two lines ellipsize; full name remains in the accessible name and the Details pane.
  - The row does not cause horizontal overflow; the list remains scrollable.
  - Clicking the spell-name target selects the spell; clicking the add button adds it without selecting a different row.
- **Dependencies:** R-LAY-03.

#### R-LIB-02 — Inline recovery from empty results

- **Affected:** Library results empty state, `resetAll` behavior, focus management, locales.
- **Current problem (F-09):** The empty state says no spells match but provides no reset control. On mobile the reset control is inside the closed filter sheet.
- **Desired behavior:** Show a clear "Clear search and filters" action adjacent to the empty message. It performs the existing reset-all behavior (search plus filters) and returns the result list.
- **Functional requirements:** Use the same reset semantics as Reset Filters; do not clear the selected spell or deck. On activation, move focus to the search input or a sensible results control, and expose the updated count. Localize the label.
- **Visual/UX:** Keep the empty state compact and centered; the action is visible without opening another surface. Do not turn it into a large primary button.
- **Responsive:** Available in Compact, Split, and Wide.
- **Accessibility:** The action is keyboard-accessible with a visible focus ring; the result count change is available to assistive technology.
- **Acceptance criteria:** With a query and/or filters producing zero results, the inline action is visible; activating it clears query and filters, restores results, and updates the count. The action is not present when results exist. Focus is not lost to a hidden element.
- **Dependencies:** None.

#### R-FILT-01 — Progressive filter disclosure and live match count

- **Affected:** `LibraryFilters` sheet variant, `LibraryPane` sheet footer, advanced filter grouping, locale strings, mobile e2e/unit tests.
- **Current problem (F-03):** The sheet expands every advanced field and has no live result count. Changes apply immediately, so users must close the sheet to evaluate them.
- **Desired behavior:** The sheet keeps the primary filters — **Level**, **Class**, and **Source** — visible without expanding anything, and places subclass, school, casting time, range, duration, components, concentration, and ritual under a collapsed **Advanced filters** section. The sticky footer shows a live "N spells match" count.
- **Functional requirements:**
  - Advanced is collapsed by default when no advanced filters are active.
  - If any advanced filter is active when the sheet opens, expand Advanced and show the active-filter count.
  - The count reflects the current search query plus all filters, updates immediately, and is visible without closing the sheet. Use the existing computed `results.length`; do not recompute filtering inside the footer.
  - Reset Filters keeps the existing behavior: it clears the search query and all filters. Done closes the sheet without discarding changes.
  - The sheet remains the only place where Compact/Split filter fields are mounted. Do not mount both the inline and sheet filter trees simultaneously for responsive hiding; use one tree per active layout.
  - Keep the active filter chips outside the sheet as today.
- **Visual/UX:** Use the existing collapsible pattern and badge. The primary controls fit without horizontal overflow at 320px. The count is visually subordinate but unambiguous. The "applies immediately" explanation remains.
- **Responsive:** Applies to Compact and Split. Wide keeps the existing inline collapsible stack, with the same primary/advanced grouping and the explicit source scope from R-FILT-02.
- **Accessibility:**
  - The count container is a polite live region, announced as the count changes; avoid assertive announcements.
  - The Advanced trigger exposes expanded/collapsed state and is keyboard-operable.
  - If auto-expanded because filters are active, the state must still be announced.
  - The sheet's Reset and Done controls remain reachable and keyboard-operable.
- **Acceptance criteria:**
  - At 390×844 and 1024×768, opening Filters shows Level, Class, Source and a collapsed Advanced section; the eight advanced fields are not visible until Advanced is activated.
  - Applying a class or source filter updates the footer count while the sheet remains open.
  - When an advanced filter is active, reopening the sheet shows Advanced expanded and the active count.
  - Reset clears search and filters and the count returns to the full result count.
  - Existing filter tests are updated for the new disclosure; no test relies on Concentration being visible without opening Advanced.
- **Dependencies:** R-LAY-01, R-FILT-02.

#### R-FILT-02 — Explicit All / SRD / Custom source scope

- **Affected:** `LibraryFilters` source group, filter state/defaults, active-filter summary, tests, locales.
- **Current problem (F-07):** No source selection means "all sources" while both chips appear inactive. Selecting a source toggles inclusion, so the UI never states the default scope.
- **Desired behavior:** Present source scope as a single-choice group: **All**, **SRD**, **Custom**. All is active by default and corresponds to the empty `sources` list. Selecting SRD or Custom filters to that source; selecting All clears the source filter. No UI state represents "both SRD and Custom explicitly selected," because that is equivalent to All.
- **Functional requirements:**
  - Default `sources` remains `[]`; the All chip is active.
  - Clicking an active SRD/Custom chip may leave it active (single-choice semantics) or return to All; document the chosen behavior. Prefer clicking the selected specific source to keep it selected; All is the explicit way to clear.
  - Normalize any legacy both-source state to All in the UI; filters are not persisted, so no migration is required.
  - Active-filter chips should continue to show "Source: SRD" or "Source: Custom"; All produces no chip.
  - Preserve the filter logic in `filterSpells`; only the UI mapping changes.
- **Visual/UX:** Use the existing chip styling and the group label "Source." Three chips must fit at 320px without wrapping onto overlapping lines; allow wrapping if needed. Distinguish selected from unselected by more than colour alone (existing `aria-pressed`, selected fill, and focus ring).
- **Accessibility:** Each chip exposes `aria-pressed`; the group has a group label. The default All state is programmatically active. No chip is disabled.
- **Acceptance criteria:** Default shows All active. Clicking SRD produces only SRD results and an active Source: SRD chip; clicking Custom produces only custom results; clicking All returns to the full source set and removes the source chip. Screen readers announce the pressed state. Tests cover all three states and reset.
- **Dependencies:** None; R-FILT-01 consumes it.

#### R-TOUCH-01 — 44×44 touch targets in Compact and Split

- **Affected:** `Tabs`, `Button` usages, `Field`, `Slider`, `LibraryFilters`, `LibraryPane`, `DeckPane`, modal footers, tests.
- **Current problem (F-04):** Several primary table/phone controls are 28–36px. Adjacent reorder/remove actions are 32px. The slider thumb is 16px. The library add control is already 44×44 below 1200px.
- **Desired behavior:** In Compact and Split modes, interactive controls that participate in the primary workflow must have an effective hit area of at least **44×44 CSS px**. On Wide layouts with a coarse pointer, apply the same minimum. Visual icons may remain small; increase padding or wrap the hit area.
- **Functional requirements:** At minimum, apply to:
  - the three full-screen tab triggers and the Split right-pane switcher;
  - application header controls (language selector, menu, interactive offline status);
  - Filters and Library actions triggers;
  - search input and filter selects/inputs;
  - Level slider thumbs;
  - source chips, active-filter chips, and popover option rows;
  - library add buttons;
  - Deck Save/Print/Open, Deck actions, Legend, and overflow-menu trigger;
  - deck row fit selector, move up/down, repair, and remove;
  - filter-sheet footer buttons and print/dialog footer actions.
  - Adjacent destructive controls must have separation and must not share an overlapping hit area. Use a shared sizing utility or component variant rather than duplicating arbitrary heights at each call site.
- **Visual/UX:** Increase spacing/padding without making the desktop UI larger. Preserve the current visual glyph sizes where practical. The deck row may wrap or become taller; keep the row scannable.
- **Responsive:** Compact/Split always; Wide only when the pointer is coarse or the platform reports touch as primary.
- **Accessibility:** The project target is 44×44 as a usability goal. This exceeds WCAG 2.2 AA's 24×24 minimum target size; do not claim that 28px controls violate AA. The larger target reduces motor-error risk.
- **Acceptance criteria:** Measured bounding boxes for the listed controls are at least 44×44 at 390×844, 820×1180, and 1024×768 (or have an explicit 44px effective hit region). Adjacent controls do not overlap. Automated tests cover the tab, deck toolbar, deck row, fit selector, filter footer, and slider where feasible. A coarse-pointer Wide check is documented.
- **Dependencies:** R-LAY-01.

#### R-A11Y-01 — Programmatic and visual selected-spell state

- **Affected:** `LibraryPane` result row and selection styling, accessibility tests.
- **Current problem (F-05):** Selection is `bg-accent` only; no current/selected attribute is exposed. The accessibility tree treats every row identically.
- **Desired behavior:** The selected spell row is programmatically identifiable and has a non-colour visual cue.
- **Functional requirements:**
  - Put `aria-current="true"` (or an equivalent appropriate selection attribute) on the selected row's selectable button, and remove/avoid it on unselected rows.
  - Add a visible non-colour cue such as an inset leading bar, check icon, or selected marker that does not shift the row content unexpectedly.
  - Keep the full spell name in the accessible name.
  - The Details heading continues to identify the selected spell.
- **Visual/UX:** The cue should be subtle and consistent with the ink/gold language; it must not be a second competing badge.
- **Responsive:** All modes.
- **Accessibility:** The state must be exposed without relying on background colour. Focus and selection states must both be visible.
- **Acceptance criteria:** With a selected spell, the accessibility tree reports the current state on that row and not on others; a visible non-colour marker is present; tests assert the selected row and the unselected row. Selecting another row moves the state.
- **Dependencies:** R-LIB-01.

#### R-A11Y-02 — Current filter values in accessible names

- **Affected:** `MultiSelect` trigger, accessible naming, tests; all filter multi-selects (class, school, subclass, components).
- **Current problem (F-05):** The trigger's `aria-label` is the generic group label. The visible summary ("All classes", "Wizard", "2 selected") is not in the accessible name.
- **Desired behavior:** The accessible name includes the group label and current summary, for example "Class: All classes", "Class: Wizard", or "Class: 2 selected".
- **Functional requirements:**
  - Include the current summary in the accessible name or provide an equivalent accessible description exposed on focus.
  - Preserve the trigger's existing popover behavior, expanded state, and visible summary.
  - Apply to Class, Subclass, School, and Components. Other single-value selects already expose their values through native/combobox semantics and must not regress.
  - The source group's chips expose `aria-pressed` via R-FILT-02.
- **Visual/UX:** No visual change required.
- **Accessibility:** Screen readers must hear the current filter value without opening the popover. Do not use an aria-label that discards the summary.
- **Acceptance criteria:** The accessibility tree reports names containing the current summary for each multi-select. Tests using exact `"Class"` names are updated to match the new accessible name. Opening the popover still exposes checkbox options and the clear action.
- **Dependencies:** R-FILT-01/R-FILT-02 (for source grouping context).

#### R-DECK-01 — Consistent deck persistence vocabulary

- **Affected:** `DeckPane` toolbar/status/menu, locale catalogs (EN/DE), deck tests.
- **Current problem (F-06):** The primary action is "Save," the hint refers to "Save As…," and Save As is hidden in overflow. "New deck" is both a status and an action.
- **Desired behavior:**
  - When the active deck has no saved association and can be saved (`not-saved` with entries), the visible primary action is labeled **Save as…** and opens the Save As dialog. The status hint references that visible label.
  - When the active deck is associated with a saved snapshot, the visible primary action is **Save** and behaves as today.
  - Save As remains available in the overflow menu for duplicating an associated snapshot.
  - Rename the destructive "New deck" action to **Start new deck** (and the confirmation accordingly). The status label "New deck" may remain for an empty unsaved deck, but the action and status must not share the same label in the same view.
  - Keep the existing disabled logic: no save action on an empty deck with no changes; invalid/stale/busy states remain guarded.
  - Update the persistence hint to name the visible action, for example: "Stored locally. Save as… creates a named snapshot."
- **Visual/UX:** The primary deck action stays in the same position and styling; only the label and disclosure change. Do not add a second primary button beside Save.
- **Responsive:** Applies in all modes; Split/Compact also receive R-TOUCH sizing.
- **Accessibility:** Button names and status text are programmatically associated where appropriate; the hint remains visible text and is not tooltip-only. Confirmation dialogs keep their accessible titles.
- **Acceptance criteria:** An unsaved, changed deck shows a visible "Save as…" primary action; activating it opens the Save As dialog. An associated deck shows "Save" and saves the snapshot. The hint names the visible action. "Start new deck" is the action label and "New deck" is not reused for a command. English and German catalogs are updated and tests cover the states.
- **Dependencies:** None.

#### R-LEGEND-01 — Legend availability and accurate copy

- **Affected:** Deck card-design section, `CardLegendDialog`, locale catalogs, tests.
- **Current problem (F-11):** The Legend button is present for both designs, but the description says it covers Compact cards only. The owner confirmed abbreviations can also be applied to editable spells in Classic.
- **Desired behavior:** Keep the Legend trigger available with both Classic and Compact selected, in the existing card-design/Deck area. H-05 is resolved in favor of the wording below. Update the explanatory copy so it covers:
  - abbreviations and icons used by the Compact design, and
  - abbreviations applied by the Abbreviate action to editable custom spell text, independently of the card design.
  Optionally update the card-design hint to indicate that the Legend applies to both designs.
- **Functional/visual:** Do not conditionally hide the Legend based on card design. Keep its placement near the Card design selector; improve the copy rather than adding another control. It must not be printed.
- **Responsive:** Trigger participates in R-TOUCH; at narrow widths it may wrap below the select without truncation.
- **Accessibility:** The dialog keeps its accessible title and Close action. The description is plain language and localized.
- **Acceptance criteria:** The Legend button is visible with Classic and Compact. The dialog copy mentions Compact abbreviations and the Abbreviate action on editable spell drafts. No printed output changes. EN/DE copy is updated. Tests assert visibility under both designs.
- **Dependencies:** R-DECK-01 (same deck section).

#### R-HELP-01 — Contextual fit-mode explanation

- **Affected:** Deck fit mode labels, `DeckPane`, `Tooltip`/help copy, locales.
- **Current problem (F-13):** Best fit, Auto shrink, and Multi-card are not explained in context.
- **Desired behavior:** Provide a concise, accessible explanation of the three fit modes near the deck entries or the fit control, using existing help/tooltip patterns. It should explain:
  - Best fit: largest single-card layout down to 8pt, falling back to multi-card when needed;
  - Auto shrink: shrink to 6pt with truncation warning;
  - Multi-card: paginate at 8pt across continuation cards.
- **Visual/UX:** Do not add a large help panel or repeat the print documentation. A terse visible hint or an info tooltip is sufficient. Do not increase row height materially on Compact.
- **Responsive:** The explanation is reachable by touch and keyboard; tooltips must have a non-hover path.
- **Accessibility:** Accessible name/description, not tooltip-only; no information conveyed solely by the icon. Not printed.
- **Acceptance criteria:** Users can discover each mode's meaning from the deck UI with keyboard or touch; the text is localized; no card/print output changes. Tests cover the accessible description.
- **Dependencies:** R-DECK-01.

#### R-DOC-01 — Specification and verification alignment

- **Affected:** `docs/specs/MAIN-spec.md`, `docs/DEVELOPMENT.md`, `docs/specs/MAIN-spec.md` §12 verification matrix.
- **Current problem:** The existing specification mandates three panes at ≥1200px and tabs below, fractional grid widths, Compact-only Legend wording, and a fixed physical preview. Those statements would conflict with the approved implementation.
- **Desired behavior:** Resolve the approved design decisions (H-01/H-02) before implementation begins. After implementation behavior is finalized, update the authoritative specification and development documentation to match:
  - three layout modes and thresholds;
  - right-pane Deck access in Split;
  - content-minimum grid widths;
  - screen-only preview scaling and physical print invariants;
  - progressive filter disclosure, live count, source scope;
  - selection/filter accessibility;
  - deck save vocabulary;
  - Legend copy;
  - touch-target and test expectations.
  Add verification-matrix rows for the requirements in this document.
- **Constraints:** Do not modify `MAIN-spec.md` before implementation behavior is finalized; the current spec remains authoritative during implementation. Final synchronization is a post-implementation step, not a prerequisite for coding.
- **Acceptance criteria:** No contradictory statements remain between this specification and `MAIN-spec.md`/`DEVELOPMENT.md`; the verification matrix references all new behavior; links and anchors remain valid.
- **Dependencies:** H-01/H-02 approval before implementation; implementation behavior finalized before final synchronization.

### C.3 Traceability to the original audit

| Original finding                                                          | Disposition                                    | Requirement / decision                                                                      |
| ------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| F-01 Desktop preview dominates; library cramped; card unreadable; no zoom | Addressed                                      | R-LAY-03, R-PREVIEW-01/02, R-LIB-01                                                         |
| F-02 Tablet tabs / responsive strategy                                    | Addressed                                      | R-LAY-01/02/03, §D, H-01                                                                    |
| F-03 Mobile filter sheet overload and hidden count                        | Addressed                                      | R-FILT-01                                                                                   |
| F-04 Mobile touch targets 28–32px; inconsistent with 44px add             | Addressed                                      | R-TOUCH-01                                                                                  |
| F-05 Selected state and filter values not exposed to AT                   | Addressed                                      | R-A11Y-01/02                                                                                |
| F-06 Save/Save As/New deck vocabulary                                     | Addressed                                      | R-DECK-01                                                                                   |
| F-07 Source chips default semantics                                       | Addressed                                      | R-FILT-02                                                                                   |
| F-08 Long names truncated                                                 | Addressed                                      | R-LIB-01                                                                                    |
| F-09 Empty results no inline reset                                        | Addressed                                      | R-LIB-02                                                                                    |
| F-10 Unused 2rem preview padding                                          | Addressed                                      | R-PREVIEW-02                                                                                |
| F-11 Legend context                                                       | Addressed per owner clarification              | R-LEGEND-01                                                                                 |
| F-12 Two-pane tablet / container width                                    | Addressed as recommendation                    | R-LAY-01/02, §D, H-01/H-02                                                                  |
| F-13 Fit-mode help                                                        | Addressed as low-priority help                 | R-HELP-01                                                                                   |
| F-14 Gold default text / token hierarchy                                  | Deferred; no implementation in this initiative | H-04; rationale in §H                                                                       |
| F-15 Dark-only theme                                                      | No action; existing product decision assumed   | H.2 assumptions                                                                             |
| Strengths S-01 visual identity                                            | Preserve                                       | Non-goal: no rebrand                                                                        |
| Strengths S-02 workflow, bulk actions                                     | Preserve                                       | Non-goal: no data/workflow rewrite                                                          |
| Strengths S-03 guardrails/feedback                                        | Preserve                                       | R-DECK-01 changes labels only; no removal of confirmations                                  |
| Original minor “help buried in menu” observation                          | Partly addressed; global menu unchanged        | R-HELP-01 adds contextual fit-mode help; existing About/guide navigation remains acceptable |
| Original audit score observation: help/documentation                      | Improved without a navigation rewrite          | R-HELP-01                                                                                   |

---

## D. Responsive design specification

### D.1 Principle

Layout is determined by the **available inline width of the workspace container** and by the minimum widths the content needs. Device names are used only to describe representative test viewports, never to select behavior. The design must remain usable at arbitrary widths, including split-screen windows, browser zoom, and orientation changes.

### D.2 Layout modes

| Mode        | Container width | Primary navigation                                            | Panes                                                      | Filter/actions chrome                                |
| ----------- | --------------: | ------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| **Compact** |         < 720px | Three full-screen tabs: Library, Details, Deck                | One visible pane at a time; all panes mounted              | Filters trigger + bottom sheet; Library actions menu |
| **Split**   |      720–1199px | Library always visible; right-pane `Details \| Deck` switcher | Two visible regions: Library + one right pane; all mounted | Filters trigger + bottom sheet; Library actions menu |
| **Wide**    |        ≥ 1200px | No full-screen tab bar                                        | Three visible panes                                        | Inline filter stack; inline Library actions          |

The `Details` region contains the existing Preview & Details pane. The `Deck` region contains the existing Active Deck pane and must remain compatible with a future Table view.

### D.3 Thresholds and content minima

The thresholds are derived from minimum usable content widths, not arbitrary device classes:

- **Split minimum:** Library minimum 320px + right-pane minimum 400px = **720px**. The right-pane minimum is enough for the 240px card with padding and a readable deck row.
- **Wide minimum:** Library 320px + Preview 560px + Deck 300px = **1180px**, with **1200px** retained as the mode threshold for breathing room.
- **Wide grid:** `clamp(320px, 24%, 400px) minmax(560px, 1fr) clamp(300px, 22%, 360px)`.
- **Split grid:** `clamp(320px, 36%, 420px) minmax(400px, 1fr)`.
- **Compact:** one pane at a time; no split grid.

Resulting representative widths:

|                  Container | Mode    |    Library | Right / Preview |           Deck |
| -------------------------: | ------- | ---------: | --------------: | -------------: |
|                      320px | Compact | full width |      full width |     full width |
|                      390px | Compact | full width |      full width |     full width |
|                      700px | Compact | full width |      full width |     full width |
|                      720px | Split   |      320px |           400px | right-pane tab |
| 744px (iPad mini portrait) | Split   |      320px |           424px | right-pane tab |
|      820px (iPad portrait) | Split   |      320px |           500px | right-pane tab |
|    1024px (iPad landscape) | Split   |     ~369px |          ~655px | right-pane tab |
|                     1180px | Split   |      420px |           760px | right-pane tab |
|                     1199px | Split   |      420px |           779px | right-pane tab |
|                     1200px | Wide    |      320px |           580px |          300px |
|                     1440px | Wide    |     ~346px |          ~777px |         ~317px |
|                     1920px | Wide    |      400px |          1160px |          360px |

At 1200px, the preview meets its 560px minimum and can show two 240px cards side by side. At 1440px and above, the Library and Deck stay bounded while the preview grows.

### D.4 Navigation and panel behavior

- **Compact:** Preserve the current three-tab navigation and auto-switch to Details when a new spell is selected. The tab bar is the only navigation. Filters use the sheet; Library actions are in the menu. Touching a deck row opens Details.
- **Split:** Library is persistent. The right pane is an independent two-tab area:
  - Default to Details.
  - Selecting a Library spell or resolved Deck row shows Details.
  - The Deck switcher is one action; it may show the entry count and an unsaved indicator.
  - Switching right panes does not clear the Library or deck state.
  - The right-pane selection persists across resize and orientation changes for the session; it is not persisted to IndexedDB.
- **Wide:** Library, Preview & Details, and Deck are all visible. No right-pane switcher and no full-screen tabs. Selecting a Library or Deck row updates Details without changing pane visibility.
- **Across mode changes:** Keep all panes mounted, as the current `forceMount` approach does, and hide inactive panes with layout/CSS rather than unmounting them. Do not duplicate pane DOM. If a filter variant changes (inline ↔ sheet), preserve the shared filter state in `LibraryPane`; the filter tree may remount without losing values.
- **Focus:** When a pane becomes visible, do not move focus unexpectedly unless the user's action caused a selection. Escape/close behavior for sheets and dialogs remains as today. Hidden panes must not be in the tab order.
- **Scroll:** The page never scrolls. Each pane keeps its own scroll region. Library search/results/actions stay pinned; the result list is the only vertical scroll container in Library. Preview and Deck lists scroll independently. No horizontal page scrolling at any target width.

### D.5 Tablet strategy evaluation

| Option                                                 | Usability / context                                                                    | Information density                                                     | Navigation efficiency                                             | Implementation complexity                                                                 | Verdict                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Current: full-screen tabs below 1200**               | Library and card cannot be seen together; selection context requires switching tabs.   | Poor at 820–1180: one pane uses the full width, often with empty space. | One tab action per context switch.                                | Lowest; already implemented.                                                              | Insufficient for tablet.                                           |
| **Split: Library + right-pane switcher (recommended)** | Library remains visible while Details or Deck is shown; the user keeps browse context. | Good: 320–420px Library + 400–760px right region.                       | One action to switch Details/Deck; adding/searching is immediate. | Moderate: layout hook, right-pane tabs, state preservation, tests. Reuses existing panes. | **Recommended.**                                                   |
| **Split: Library + Deck, Details as drawer**           | Library and deck visible; reading the card requires an overlay.                        | Good for deck management; card preview is hidden by default.            | More actions to inspect and return.                               | Medium–high: new drawer/overlay, focus, dismissal, card state.                            | Not preferred; preview is central.                                 |
| **Two-pane with a Deck drawer**                        | Library + card visible; deck opens over the card.                                      | Good; deck can be wider than a sidebar when needed.                     | Deck is one action; dismissal returns to preview.                 | Medium–high: new drawer component/focus behavior.                                         | Acceptable fallback if tests show frequent preview↔deck switching. |
| **Three panes at tablet widths (720–1199)**            | All context visible.                                                                   | Poor: each pane is far below its content minimum (e.g., ~240–330px).    | No switching.                                                     | High risk: complex dense layout and cramped controls.                                     | Rejected.                                                          |

**Recommendation:** Implement the Split mode with a right-pane Details/Deck switcher. It preserves the Library browsing context, keeps the preview central, and concentrates new complexity in the workspace shell rather than in every pane. If the owner wants the deck to remain visible simultaneously, prefer a future Deck drawer over a cramped three-pane tablet layout.

### D.6 Container-based adaptation

**Recommendation:** Use a hybrid approach.

1. A single `ResizeObserver`-based workspace layout hook observes the workspace container and derives `compact`, `split`, or `wide` from the thresholds in §D.3.
2. The hook exposes the mode to React for mount decisions (filter tree, actions UI, right-pane switcher), because those alternatives use different component trees and form controls.
3. CSS container queries (or `data-layout` selectors) handle visual-only adaptation such as borders, spacing, tab visibility, and density. They must not duplicate interactive controls.
4. Keep the thresholds in one shared module; tests use the same thresholds.
5. During the initial render or when `ResizeObserver` is unavailable, choose a deterministic fallback and reconcile after measurement. Avoid a visible flash where possible.
6. Update `src/test/setup.ts` to support the workspace width helper; the existing `matchMedia` stub's desktop/mobile binary is insufficient for three modes.

**Rationale:** Container width is closer to the actual layout constraint than viewport width. It remains valid if the app is embedded, placed in a split-screen window, or gains a future side panel. A pure CSS solution is insufficient because Library mounts different filter trees per mode; a purely JS solution misses cheap visual optimizations. A hybrid keeps one mode source of truth without duplicating forms.

**Complexity:** Moderate. The main costs are the hook, removal of scattered breakpoint classes, test updates, and state-preservation tests. No routing or data-model change is required.

### D.7 Touch, orientation, and state

- **Touch target:** In Compact and Split, primary workflow controls meet 44×44 effective hit areas; Wide uses 44×44 when the primary pointer is coarse. See R-TOUCH-01.
- **Orientation:** Rotating a tablet must not reload the app or reset state. The layout mode may change between Split variants; the Library/split selection, filters, scroll, and deck state persist.
- **Keyboard:** The right-pane switcher uses tab semantics with arrow-key navigation; the filter disclosure is a button with expanded state; the sheet traps focus and restores it on close using the existing Dialog behavior.
- **Safe areas/keyboard:** Preserve the existing `100dvh`, `--app-keyboard-inset`, and safe-area handling. The Split right pane must also respect the keyboard inset when the deck-name input or filter sheet is focused.
- **Scroll containment:** No page-level scroll; the Library result list, Deck entries, and preview area remain independently scrollable.

### D.8 Responsive acceptance matrix

The viewport dimensions below are **representative device scenarios**, not authoritative breakpoint inputs. The expected mode is determined by the **measured inline width of the workspace container**. When the viewport and container widths differ, the container width governs; tests must include such cases explicitly.

| Viewport                      | Expected mode | Required observations                                                                                          |
| ----------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| 320×568                       | Compact       | Three tabs; no split; filter sheet; 44px controls; two-line names; no horizontal overflow; no page scroll      |
| 390×844                       | Compact       | Same as 320; two-line names; empty-state reset; filter advanced collapsed; live count                          |
| 430×932                       | Compact       | Same; two-line names; tab/add/row targets ≥44; filter sheet fits                                               |
| 700×900                       | Compact       | Threshold boundary remains compact; no split; two-line names                                                   |
| 720×900                       | Split         | Library ≥320 + right ≥400; right-pane Details/Deck switcher; no full tabs                                      |
| 744×1133 (iPad mini portrait) | Split         | Library + right pane; card preview fits; no horizontal overflow                                                |
| **820×1180 (iPad portrait)**  | **Split**     | **Library + right pane simultaneously; deck one action away; filters in sheet; 44px controls; no page scroll** |
| 1024×768 (iPad landscape)     | Split         | Library + right pane; filter sheet; deck one action; 44px controls                                             |
| 1180×820 (iPad landscape)     | Split         | Library ≤420; right pane ≥760; preview not clipped; one-tap deck                                               |
| 1199×800                      | Split         | Upper split boundary                                                                                           |
| 1200×800                      | Wide          | Three panes; Library ≥320, Deck ≥300, Preview ≥560; inline filters/actions; no full tabs                       |
| 1280×800                      | Wide          | Three panes; content-minimum columns; no horizontal overflow                                                   |
| 1440×900                      | Wide          | Three panes; balanced widths; centered preview; no wasted 2rem strip                                           |
| 1920×1080                     | Wide          | Library/Deck clamp; preview grows; card scale control still caps at 200%                                       |

Container-width tests must also cover cases where the viewport and workspace container widths differ, for example a 1440px viewport containing a 700px workspace (Compact) and a 390px viewport containing an 800px workspace (Split). The mode must follow the container, not the viewport.

Touch/coarse-pointer checks must also be run for Wide (for example, a touch-enabled laptop or tablet in landscape at ≥1200px); the 44px requirement applies when the primary pointer is coarse.

---

## E. Implementation considerations

### E.1 Relevant existing components and architecture

| Area                | Current implementation                                                                           | Relevance                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Workspace shell     | `src/components/AppShell.tsx`, tabs, `forceMount`, `PANE_CONTENT`                                | Mode layout, right-pane switcher, state preservation                    |
| Breakpoint          | `src/components/library/use-is-desktop.ts`                                                       | Replace with workspace layout hook; keep a compatibility path for tests |
| Tabs                | `src/ui/Tabs.tsx`                                                                                | Reuse for Compact tabs and Split right-pane switch; increase hit area   |
| Library             | `src/components/library/LibraryPane.tsx`                                                         | Filter/actions chrome, row density, empty state, selection              |
| Filters             | `LibraryFilters.tsx`, `filter-summary.ts`, `LevelRangeSlider.tsx`                                | Progressive disclosure, source scope, live count, touch sizing          |
| Preview             | `src/components/details/DetailsPane.tsx`, `.card-preview-frame` in `src/print/print.css`         | Scaling, centering, remove dead padding                                 |
| Deck                | `src/components/deck/DeckPane.tsx`, `SaveAsDialog`, `CardLegendDialog`                           | Save vocabulary, legend copy, touch sizing, status                      |
| Accessible controls | `src/ui/MultiSelect.tsx`, `src/ui/Button.tsx`, `src/ui/Field.tsx`, `src/ui/Slider.tsx`           | Accessible names, target sizes                                          |
| Localization        | `src/locales/en.ts`, `src/locales/de.ts`                                                         | All new/changed copy; typed catalog consistency                         |
| Tests               | `src/test/setup.ts`, `src/components/library/LibraryPane.test.tsx`, `e2e/mobile-library.spec.ts` | Layout-mode test harness; touch; filter disclosure; state preservation  |

### E.2 Architectural constraints

- The app is a static Cloudflare SPA. No server endpoints, secrets, or runtime dependencies may be introduced.
- All user data remains in IndexedDB; no deck/spell schema changes are needed for this initiative.
- The app uses React, Radix primitives, Tailwind tokens, and typed i18n catalogs. Reuse these patterns.
- Printing, fit measurement, and card layout are measured and cached. Screen scaling must never participate in measurement or print.
- Panes are currently force-mounted to preserve search/filter/scroll state. The new layout must preserve that property; do not replace it with conditional rendering that loses state.
- The shell is height-constrained (`100dvh` minus `--app-keyboard-inset`) with no page scrolling. New layouts must keep the page non-scrolling and avoid nested scroll traps.
- Tests rely on a global desktop/mobile `matchMedia` stub. A three-mode workspace requires a dedicated test helper and updates to tests that assume the binary breakpoint.

### E.3 Reuse, refactor, and design-system opportunities

- **Layout mode:** Introduce one workspace layout hook and a small shared mode enum. Replace ad hoc breakpoint classes with mode/data attributes or container queries. Do not create parallel pane components.
- **Right-pane switch:** Reuse `Tabs`/`TabsTrigger` rather than building a custom segmented control. Ensure only the visible tab list participates in the accessibility tree.
- **Filter disclosure:** Reuse the existing `Collapsible` pattern and `Badge` for the advanced section and active count.
- **Touch sizing:** Prefer a shared utility or a Button/Field variant for "touch" sizing over repeating `h-11 w-11`/`min-h-11` at every call site. Keep desktop `sm` density.
- **Accessible name helper:** For `MultiSelect`, centralize the label-plus-summary name composition to avoid four duplicated implementations.
- **Source chips:** Extend the existing `Chip` pattern with an explicit All state; do not create a second filter control type.
- **Preview controls:** Use existing Button/Select/Tabs primitives for the scale control; no new dependency.
- **Live count:** Reuse the existing result count computation and update a single polite region; do not add a second filtering pipeline.

### E.4 Compatibility and regression risks

| Risk                                                  | Why it matters                                                      | Safeguard                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Layout-mode remount loses state                       | The current shell deliberately force-mounts panes.                  | Keep all panes mounted; test search/filter/scroll/selection across mode changes.                              |
| Filter variant switch resets values                   | Inline vs sheet trees may remount.                                  | Keep filter state in `LibraryPane`; verify values survive resize and sheet open/close.                        |
| Duplicate controls/IDs in hidden panes                | Two tab trees or two filter trees can confuse AT and tests.         | Render only the active variant; hide alternate tab lists correctly; test accessible tree.                     |
| Preview scaling changes measurement/print             | Fit computation is core and has strict invariants.                  | Scale only the screen wrapper; never include the transform in measurement; verify print card count/output.    |
| Touch sizing increases row height/list overflow       | Deck rows may wrap and reduce visible entries.                      | Allow wrapping; keep list scroll; test page has no vertical scroll.                                           |
| Breakpoint changes invalidate existing tests          | `mobile-library` and `LibraryPane` tests assume 1200/mobile binary. | Update the test harness and add 720/1200 boundary tests; keep existing behavior assertions where still valid. |
| Source semantics change filter summary/tests          | Source state now has an explicit All.                               | Update `filter-summary` and tests; verify filter logic unchanged.                                             |
| Save-label change affects tests and user expectations | Tests may target "Save" in unsaved states.                          | Update test selectors and add both associated/unassociated cases.                                             |
| Container queries/ResizeObserver unsupported          | Unexpected fallback mode could break layout.                        | Fallback to viewport mode, reconcile on mount; test no-`ResizeObserver` path.                                 |
| Table view future conflict                            | Both touch DeckPane.                                                | Keep split Deck pane container generic; sequence Table-view work separately; do not build a parallel deck.    |
| Header density remains viewport-based                 | Header text/collapse may not match container width.                 | Keep header viewport rules; verify at 1200/1199 and tablet; no requirement to convert header.                 |
| Print CSS and screen-only UI leak                     | New controls could print.                                           | Mark new controls `app-no-print`/screen-only; verify actual print output.                                     |

### E.5 Compatibility with existing functionality

The change must preserve:

- search ranking/filter semantics and language-switch behavior;
- deck ordering, fit modes, save/open/import/export, conflict handling, and undo;
- preview/printing card dimensions, pagination, truncation/overflow notices, and cache keys;
- custom spell create/edit/duplicate/delete;
- offline precache, IndexedDB persistence, cross-tab notifications, and safe-area/keyboard behavior;
- all existing confirmation dialogs and recovery pathways;
- current localization coverage and language fallback rules.

No change should require a new IndexedDB schema version or alter stored data.

---

## F. Implementation planning guidance

This section defines workstreams and dependencies; it is not a decomposed task list.

### F.1 Workstreams

| Workstream                              | Scope                                                                          | Primary areas                                                             | Notes                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **WS0 — Approval**                      | Resolve H-01/H-02; confirm resolved H-03/H-05                                  | Docs only                                                                 | Prerequisite to coding; no code changes. Final MAIN-spec/DEVELOPMENT synchronization is WS4. |
| **WS1 — Responsive layout foundation**  | R-LAY-01/02/03; workspace hook; modes; right-pane switcher; grid minima        | `AppShell`, layout hook, `Tabs`, test harness                             | Must precede WS2/WS3. Owner of `AppShell` and mode contracts.                                |
| **WS2 — Library discovery and filters** | R-LIB-01/02, R-FILT-01/02, R-A11Y-01/02, Library/Filter touch targets          | `LibraryPane`, `LibraryFilters`, `MultiSelect`, `filter-summary`, locales | Starts after WS1's mode/filter contract is available.                                        |
| **WS3 — Preview and deck clarity**      | R-PREVIEW-01/02, R-DECK-01, R-LEGEND-01, R-HELP-01, Deck/Preview touch targets | `DetailsPane`, `print.css`, `DeckPane`, `CardLegendDialog`, locales       | Can run in parallel with WS2 after WS1.                                                      |
| **WS4 — Integration and verification**  | Cross-mode acceptance, accessibility, visual checks, regression, doc updates   | Tests, docs                                                               | Sequential after WS1–WS3.                                                                    |

### F.2 Dependencies and sequencing

1. **WS0** resolves the responsive strategy (H-01/H-02). H-03 and H-05 are already resolved. Without WS0, WS1 cannot finalize thresholds and split behavior.
2. **WS1** establishes the layout mode contract, pane arrangement, and state-preservation behavior. WS2 and WS3 rely on it.
3. **WS2 and WS3** can run in parallel after WS1 because they primarily touch different panes. Coordinate shared locale files, test fixtures, and any `LibraryPane`/`DeckPane` shared selectors.
4. **WS4** follows all implementation work. It owns the integration matrix, accessibility verification, print checks, and final spec updates.

### F.3 Parallelism and integration points

- **Safe parallel:** WS2 Library work and WS3 Preview/Deck work after the WS1 interfaces are fixed and locale key ownership is agreed.
- **Do not parallelize:** WS1 with WS2/WS3, because mode thresholds, filter variant decisions, and pane mounting behavior are dependencies.
- **Shared touchpoints:** `src/locales/en.ts`/`de.ts` (both streams), `AppShell` (WS1 only), `LibraryPane` (WS2 and small touch-target/ARIA changes), `DeckPane` (WS3 and touch sizing), test suites and e2e specs. Assign a single owner per shared file change or merge in sequence.
- **Table view:** Do not implement the Table view in this initiative. When it lands, it must integrate into the Deck pane without changing the split-layout shell.

### F.4 Suggested priority and sequencing

1. Resolve the layout decision (H-01/H-02) (WS0).
2. Implement WS1 and validate the 720/1200 boundaries and state preservation.
3. Implement WS2 and WS3 in parallel; verify mobile filters, touch targets, preview scaling, and deck copy.
4. Run WS4 across the full viewport and accessibility matrix.
5. Complete documentation alignment and close the initiative.

The P1 layout work must not be deferred behind cosmetic P3 items. R-LAY-01/03 and the container/layout foundation are the highest-value changes; touch/accessibility P2 work should be delivered in the same release because it affects the same controls.

---

## G. Validation and acceptance

### G.1 Project verification commands

Use the repository's existing toolchain:

- `pnpm run check` — formatting, lint, type checking.
- `pnpm run test` — Vitest unit/integration tests.
- `pnpm run test:e2e` — Playwright against the local Workers preview (`vp preview` on port 4173).
- `pnpm run build` — production build, including SRD normalization.
- `pnpm run preview` — manual responsive and print review in the Workers runtime.
- Deployment-only changes are not part of this initiative. If any are eventually required, verify with `pnpm exec wrangler deploy --dry-run` per project policy.

### G.2 Functional verification

- Search, filter, source scope, and result counts remain correct in all modes.
- The selected spell updates Details in Compact and Split and never loses selection on resize.
- Filters apply immediately in the sheet; Reset and Done preserve current behavior.
- Deck add/remove/reorder/fit-mode/save/open/import-export/print continue to work.
- Save as… creates a snapshot from an unassociated deck; Save updates an associated deck; no state is lost.
- The preview scale does not change fit results, page counts, print dialog content, or stored deck/spell data.
- Empty-result reset clears search and filters without clearing the deck or selected spell.
- Legend copy and fit-mode help are available in both languages.
- Existing language switching, custom spell workflows, offline readiness, and cross-tab synchronization are unaffected.

### G.3 Responsive and cross-device testing

Execute the acceptance matrix in §D.8. The viewport sizes are representative device scenarios; the layout mode must be derived from the measured workspace container width. Include controlled cases where viewport and container widths differ. In particular:

- 820×1180 iPad portrait must show Library plus a right pane, with one-action Deck access and no horizontal overflow.
- 1180×820 and 1024×768 tablet landscape must use Split, not full-screen tabs.
- 1200×800 must show three panes with Library ≥320px, Deck ≥300px, Preview ≥560px.
- 1440×900 and 1920×1080 must use content minima and use the preview space without a fixed empty strip.
- 390×844, 320×568, 430×932, and 700×900 remain Compact.
- Resize/orientation changes preserve search, filters, list scroll, selection, right-pane choice, and deck state.
- No page-level horizontal overflow, no page-level vertical scroll, and no unintended nested scroll containers.
- Touch target measurements are at least 44×44 for the listed controls in Compact/Split; document the coarse-pointer Wide check.

### G.4 Accessibility and interaction checks

- Keyboard-only completion of the primary flow in Compact, Split, and Wide: search, filter, select, add, switch right pane, save as, print.
- Focus order and focus visibility after mode changes, sheet open/close, right-pane switches, and selection auto-switch.
- Accessibility tree:
  - selected spell exposes `aria-current`/equivalent;
  - multi-select triggers expose current summaries;
  - source chips expose pressed state;
  - only one tab list is active per context;
  - the live match count is announced politely;
  - the Legend and fit-mode help have accessible names/descriptions.
- Slider thumbs and all listed touch targets have effective hit areas ≥44×44 where required.
- No information conveyed by colour alone.
- Muted-text contrast remains at least the token-calculated values; run a focused contrast check if tokens change. Target WCAG 2.2 AA for core workflows.
- Browser zoom to 200% (or equivalent) at representative widths; no horizontal page scrolling or clipped primary controls.
- Screen-reader check (VoiceOver/NVDA or equivalent) for the primary flow; do not claim compliance without a real pass.

### G.5 Regression testing

At minimum, re-run or extend coverage for:

- Library filters (all groups, OR/AND rules, components, source scope, language changes).
- Selected spell and empty/unavailable-language states.
- Deck save/open/import/export/replace/clear/new/undo/conflict behavior.
- Fit modes, truncation/overflow notices, continuation cards, print preview, and print output.
- Custom spell create/edit/duplicate/delete and editable SRD copies.
- Offline precache readiness, language switching, IndexedDB persistence, and cross-tab notifications.
- Mobile/library E2E tests; update assertions for advanced filter disclosure and any new accessible names.
- Existing “desktop” test at 1280px remains Wide with inline filters; add Split tests at 1024/1180 and Compact tests at 320/390. Where practical, drive these through controlled workspace container widths rather than viewport size, and add at least one case where viewport and container widths differ.
- Build and preview in the Workers runtime; ensure no new external requests or server dependencies.

### G.6 Overall completion criteria

The initiative is complete when:

- All Confirmed requirements are implemented, and Recommended requirements are either approved and implemented or explicitly deferred with owner agreement.
- No unresolved P1/P2 finding from the original audit remains; P3 items are implemented or documented as deliberately deferred.
- The responsive matrix passes at all listed widths, including iPad portrait, with no page-level overflow or state loss.
- The accessibility checks pass for the primary flow; no state is conveyed by colour alone; keyboard and screen-reader gaps found in the audit are closed.
- Print output and fit behavior are unchanged, and the preview scale is provably screen-only.
- `pnpm run check`, `pnpm run test`, `pnpm run test:e2e`, `pnpm run build`, and the Workers preview verification pass.
- MAIN-spec §5/§9/§12 and DEVELOPMENT documentation are aligned with the implemented behavior.
- The implementation introduces no new runtime dependencies, server endpoints, data migrations, or print changes.

---

## H. Open decisions and assumptions

### H.1 Decisions

Only **H-01** and **H-02** require explicit owner approval before implementation. **H-03** and **H-05** are resolved. **H-04** is deferred and outside the current implementation scope.

**H-01 — Approve the Split/Wide responsive strategy.**
Approved by the owner during implementation: use the recommended thresholds and content-minimum grids.
Recommendation: keep **1200px** as the Wide threshold, introduce **Split at 720–1199px**, and **Compact below 720px**; use the content-minimum grid in §D.3. Rationale: 820–1180px devices gain simultaneous Library + Details/Deck; 1200px gains a usable 320px Library, 580px Preview, and 300px Deck; no device-specific assumptions. If rejected, the fallback is to retain the current 1200px tab transition but still rebalance the wide columns and add preview scaling. The fallback does not solve the tablet context problem.

**H-02 — Choose the Split right-pane interaction.**
Approved by the owner during implementation: use the Details | Deck switcher.
Recommendation: a **Details | Deck** right-pane switcher. It has the lowest additional interaction model and keeps Library visible. The alternative is a Deck drawer over Details; it preserves a visible preview while the deck is open but requires new overlay/focus behavior and adds complexity. Approve the switcher unless testing shows the deck must remain visible while previewing.

**H-03 — Preview scale default and maximum. (Resolved)**
Decision: default to **Physical (100%)** to preserve WYSIWYG expectations; offer **Fit width**, capped at **200%**, for reading. Physical remains the print source of truth. The cap and the screen-only invariant remain in force.

**H-04 — Gold body-text token hierarchy.**
The audit noted that mapping `--color-foreground` to `--primary` makes gold the default body text and flattens hierarchy. This is a broad visual identity change, not required for the accepted layout/usability fixes. Recommendation: **defer** it to a separate visual pass; keep the current palette in this initiative. If changed later, use the cream `--foreground` for body copy, reserve gold for primary/interactive/active states, and re-run contrast/visual regression. This decision is not blocking the current workstreams.

**H-05 — Legend copy. (Resolved)**
Decision: use the wording in R-LEGEND-01. The copy explains the Legend's relevance to both Compact cards and abbreviations applied to editable spell text in Classic mode. The functional requirement (visible in both designs) is confirmed.

### H.2 Assumptions

- The current dark-only theme is intentional; no light theme is added in this initiative.
- The physical card size, print CSS, fit measurement, card designs, and pagination are out of scope and must remain unchanged.
- The app has no route-level navigation; the workspace is a single SPA surface.
- No new UI dependency (for example, a drawer library) is required; existing Radix/Tabs/Collapsible primitives cover the recommended design.
- Container queries and `ResizeObserver` are available in the supported modern browser baseline; a deterministic fallback is required but not a design target.
- The 44×44 touch target is a project usability target; the app continues to target WCAG 2.2 AA, whose target-size minimum is 24×24.
- The pending Table view will integrate into the same Deck pane; this initiative must not assume a cards-only deck.
- The app remains a static Cloudflare SPA with no API, server storage, or secrets.

### H.3 Deferred or no-action items

- **F-14 gold text hierarchy:** deferred to a separate visual decision; no requirement in this initiative.
- **F-15 dark-only:** no action; recorded as an existing product decision.
- **A full light theme:** out of scope.
- **Sort controls or additional Library power-user features:** not part of the audit findings; do not add.
- **Table view, print layout redesign, and custom-spell editor redesign:** separate initiatives.
- **A new global “undo” for bulk append:** not required by the accepted findings; existing duplicate prevention and confirmations remain.

---

### Verification note

The original critique was a manual consolidation, not an automated Impeccable detector run or a full accessibility audit. Implementation verification:

- Formatting, lint, and type checks passed without warnings; all **607 unit/integration tests** passed.
- Production build and SRD normalization passed. The build still reports the large JavaScript chunk advisory.
- All **77 Playwright tests** passed against the local Workers-runtime preview, including the 320–1920px responsive matrix, container/viewport mismatch in both directions, resize state preservation, keyboard primary flows, German Split layout, coarse-pointer targets, physical/fit-width preview invariants, offline behavior, continuation cards, and print geometry.
- Equivalent 200% zoom dimensions exposed clipped deck rows in short windows. The deck now uses one whole-pane scroll region at short viewport heights; both regression cases pass.
- MAIN-spec §5/§7/§9/§12 and DEVELOPMENT are synchronized. H-04 remains deliberately deferred as specified.

Real screen-reader verification and physical printed-output review remain manual acceptance checks; the automated keyboard/semantics/print tests do not establish those results. No full accessibility-compliance claim is made.
