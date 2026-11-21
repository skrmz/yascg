# Print optimization refinement decisions

## Status

D1–D10 are approved. The [consolidated specification](print-optimization-spec.md) is ready for final review. Personal backgrounds follow the print work in implementation order and remain required within this change request.

## Verified repository facts

| Area | Evidence and implications |
| --- | --- |
| Selection and fitting | [DeckPane](../../../src/components/deck/DeckPane.tsx) opens the print dialog. [PrintDialog](../../../src/components/print/PrintDialog.tsx) already resolves and measures the active deck, then expands each entry into physical cards in deck order. It has no print-selection state. The existing focused spell is used for browsing and preview. |
| Continuation identity | [PrintDialog](../../../src/components/print/PrintDialog.tsx) assigns each fitted card its original index and total, and [CardView](../../../src/cards/Card.tsx) uses those fields to render its continuation treatment and numbering. A reprint can reuse the full measured expansion and emit the chosen cards. Changes to language, design, fit mode, or spell content can affect that expansion. The app has no record of a prior print job to recover historical pagination. |
| Print issues | [PrintDialog](../../../src/components/print/PrintDialog.tsx) requires confirmation for missing and untranslated entries, disables print when there are no printable cards, and blocks on a fit error or continuation-limit, notes, or table overflow. A subset needs an explicit rule for which entries count toward these gates. |
| Placement and guides | [PrintSheets](../../../src/print/PrintSheet.tsx) groups a flat card array in nines and fills each sheet to nine cells with placeholders. [Print CSS](../../../src/print/print.css#L1066) centers the same physical grid on both paper sizes and draws optional cutting outlines around empty and occupied cells alike. Reused slots need an explicit rule for their guides. |
| Backgrounds | [DeckPane](../../../src/components/deck/DeckPane.tsx#L444) offers one **Card design** selector and one **Card background** selector. [AppProvider](../../../src/state/AppProvider.tsx#L282) holds both choices in session state. Switching design changes only the design. [DetailsPane](../../../src/components/details/DetailsPane.tsx#L346) passes both choices to preview and [PrintDialog](../../../src/components/print/PrintDialog.tsx#L126) captures both for print. [Classic](../../../src/cards/Card.tsx#L63) and [Compact](../../../src/cards/CompactCard.tsx#L191) use the same background styling. Reloading starts with Classic and None. |
| Image preparation | The [maintainer script](../../../scripts/prepare-card-backgrounds.ts) uses Sharp to correct orientation, flatten transparency onto the card's paper color, center-crop, and encode JPEG. It targets 900 × 1260 with no enlargement and attempts to stay within 1 MiB. It can skip already suitable JPEGs and warns when the encoded output exceeds its target. The browser feature needs an observable processing and validation contract. |
| Complete backup | The [current contract](../MAIN-spec.md#complete-backup-and-restore) and [collection snapshot](../../../src/db/collection-state.ts#L74) cover the working deck, saved decks, custom spells, and SRD overrides. [Restore](../../../src/io/complete-backup.ts#L335) clears and replaces those stores in one transaction after checking the reviewed change token. The [review warning](../../../src/locales/en.ts#L84) says local collection records absent from the backup are removed. Browser preferences such as the receiving language are outside the collection. Version 1 has no background image or selection fields. |
| Existing coverage | [Print E2E](../../../e2e/print.spec.ts), [continuation E2E](../../../e2e/continuation-cards.spec.ts), and [backup E2E](../../../e2e/complete-backup.spec.ts) cover the corresponding current workflows. Layout checks for non-trailing holes and grouping, continuation-only selections, and background round trips would add coverage for the requested behavior. |

## Round 1 · Approved decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| D1 | Put whole-spell selection and expandable physical-card selection in the existing Print dialog. Default to the whole active deck. | Keeps selection close to the measured cards and preserves the whole-deck workflow. |
| D2 | Apply starting-slot and skipped-slot settings to the first sheet only. | Supports the partially used sheet with one set of controls and leaves all positions available on subsequent sheets. |
| D3 | Suppress cutting guides in first-sheet positions before the start and in explicitly skipped positions. Preserve existing guide behavior elsewhere. | Keeps unavailable positions free of marks. |
| D4 | With keep-together off, place selected cards sequentially. With it on, keep each spell's selected group of up to nine cards on one sheet and move the group forward if needed. A group larger than nine fills available positions and continues across sheets. | Bases placement on cards going into the job and avoids wasting available slots when a split is unavoidable. |
| D5 | Implement mandatory printing first, then personal backgrounds. Personal images and their shared selection across designs must persist and round-trip through complete backup and restore, as specified in D8 and D9. | Establishes implementation order and keeps the full background workflow in scope. |

## Round 2 · Approved decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| D6 | Apply the existing omission confirmation and blocking fit and overflow rules to selected entries only. Whole-deck jobs retain the current checks. | Errors and omissions apply to entries included in the job. |
| D7 | Omit a configured partial first sheet if it receives zero cards. Before printing, tell the user to remove the partial sheet and load fresh paper. | Avoids relying on the browser and printer to feed a blank page. |
| D10 | Accept JPEG, PNG, and WebP. Normalize locally with orientation correction, center crop, paper-color flattening, and bounded JPEG encoding without enlargement. Keep successful imports from a mixed batch and report failed files individually. Preserve adequate print quality at the existing physical size. | Matches the useful parts of the maintainer workflow and keeps normalized images suitable for card-size printing. |

## Round 3 · Approved decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| D8 | Add personal images to the existing shared Card background selector. Persist the selected personal image as one optional reference used by both designs. Choosing None or a bundled background clears that reference. Deleting the selected personal image clears it and selects None. Bundled selections stay session-only and Classic remains the startup design. | Preserves selection while switching designs and remembers the user's personal choice across sessions. |
| D9 | Store processed JPEG blobs in IndexedDB. Extend the single-file JSON backup to embed each processed JPEG as Base64 with its ID and display name, plus the shared selection ID. Treat version 1 as an empty personal library with no saved personal choice. Warn before confirmation when version 1 restore will remove destination personal backgrounds. Validate the complete backup, including JPEG data and references, before confirmation. Replace the collection and background state in one transaction and roll everything back if the write fails. | Keeps the backup portable and self-contained for personal images, preserves the replacement contract, and protects decks, images, and associations from partial restore. |

## Details governed by approved choices

- With the whole deck selected by default, an empty selection has nothing to print. Physical-card picks refer to the measured expansion shown for the current spell, design, language, and fit mode.
- Available slots follow the existing row order. Holes can lie between cards of the same group on a sheet. A first sheet with insufficient room for a group of up to nine sends that group to a fresh sheet under D4, and D7 omits the partial sheet if it receives zero cards.
- The application's bundled assets and browser preferences remain outside collection backup. Committed changes to the personal-image library or saved selection invalidate an earlier restore review.
