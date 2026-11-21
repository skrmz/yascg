# Print optimization and personal card backgrounds

**Ready for final review.** See the [decision log](print-optimization-decisions.md) for repository findings and approved decisions.

## Objective and priorities

Make it easier to print individual cards, reuse partially used sheets, and keep multi-card spells together. Prefer simple controls that fit the existing interface and preserve established workflows.

Implement PRT-1 through PRT-3 first. Then implement BG-1, including persistence and [complete backup and restore](../MAIN-spec.md#complete-backup-and-restore). Both stages are part of this request.

## Mandatory print requirements

### PRT-1 · Print selected cards

- Open the existing Print dialog with the whole active deck selected by default.
- In that dialog, let users select and deselect whole spells. Let them expand a multi-card spell to select individual physical cards, including continuation cards.
- Apply the existing missing-reference and translation omission counts and confirmation, and the existing blocking fit and overflow checks, to the selected entries. Disable printing when no printable cards remain. Whole-deck jobs retain the current checks.
- Acceptance examples
  - With default print settings, the whole deck prints in order using the existing nine-up pagination.
  - With multiple spells in the active deck, selecting a subset prints the chosen spells and leaves the deck intact.
  - Selecting only card 2 of a three-card spell prints that continuation with the same text, design, and 2-of-3 numbering it has in the full spell.
  - A missing, untranslated, or overflowing entry outside the selection does not affect the job. When selected, missing and untranslated entries are counted separately and require confirmation before omission. A selected entry with blocking fit or overflow prevents printing.

### PRT-2 · Use open positions on A4 and US Letter sheets

- Support partially used 3 × 3 sheets on both paper sizes.
- Let users choose the starting position and skip specific slots on the first sheet. Subsequent sheets offer all nine positions.
- On the first sheet, leave positions before the starting slot and explicitly skipped positions entirely unmarked, including when cutting borders are enabled. Preserve the existing cutting-border behavior in other positions.
- If placement leaves the configured partial sheet with zero cards, omit that sheet entirely. Before printing, tell the user to remove the partial sheet and load fresh paper.
- Preserve the 2.5 × 3.5 in (63.5 × 88.9 mm) card dimensions and the centered 7.5 × 10.5 in grid on both paper sizes. By default, place cards starting at slot 1 with no skips and preserve the existing paper-size and cutting-border defaults.
- Acceptance examples
  - With keep-together off, start at slot 4 and skip slot 5. The first two cards appear in slots 4 and 6, counted from the top left in row order. Slots 1–3 and 5 are unmarked with cutting borders enabled.
  - If the job continues past the first sheet, the first card placed on sheet 2 starts in slot 1. Sheet 2 is unaffected by the first-sheet skips.
  - If the partial sheet has two usable positions and keep-together moves the first three-card group to a fresh sheet, the dialog gives the fresh-paper instruction and the first emitted page contains the three cards.
  - The existing centered grid and physical card dimensions hold for A4 and US Letter, including jobs with skipped positions.

### PRT-3 · Keep a spell's cards on one sheet when possible

- With keep-together off, the default, place selected physical cards sequentially in available slots.
- With keep-together on, group each spell's selected physical cards. A group of up to nine cards stays on one sheet. If the current sheet has too few available slots, leave those slots unused and place the group on the next sheet.
- A group of more than nine selected cards fills the remaining available slots and continues sequentially onto subsequent sheets.
- Preserve active-deck order and each spell's physical card order. Explain in the dialog that keeping cards together can use more paper and that groups larger than nine will span sheets.
- Acceptance examples
  - With two slots left and three cards selected for the next spell, keep-together on starts all three on the next sheet. With keep-together off, two print on the current sheet and one prints on the next.
  - With keep-together on, one slot left, and two cards selected from a ten-card spell, both move to the next sheet. Their numbering still comes from the ten-card expansion.
  - With keep-together on, two slots left, and ten cards selected for the next spell, two occupy the current sheet and eight occupy the following sheet in order.

## Personal backgrounds and complete backup

### BG-1 · Add and manage personal backgrounds

- Put a **Use own** button next to **Card background**. Open a dialog for selecting one or more image files.
- Accept JPEG, PNG, and WebP. Process images locally, correcting orientation, center-cropping to the card's aspect ratio, flattening transparency onto the card's paper color, and producing bounded JPEG files without enlarging the input. Preserve adequate image detail and readable card text at 100% print scale on 2.5 × 3.5 in cards. Use the maintainer workflow's 900 × 1260 pixel target as the reference for source images large enough to reach it.
- List successful imports alongside bundled backgrounds with a visible distinction in the existing selector. Use the same shared choice in Classic and Compact preview and print, including when switching designs. Allow users to remove personal backgrounds while preserving the bundled assets.
- Report unsupported, corrupt, or unsuitable files individually and retain successful imports from the same batch.
- Persist processed JPEGs as binary blobs in the existing IndexedDB database, with a stable ID and display name for each image. Keep a single optional saved reference to the selected personal image across sessions. Choosing None or a bundled background clears the saved reference. Removing the selected personal background clears the reference and selects None.
- Keep Classic as the startup design. The design choice and bundled background choice remain session-only. On reload, select the saved personal image if one exists, or start with None.
- BG-1 is complete when import, preview, print, removal, persistence, and BG-2 backup and restore work together.
- Acceptance examples
  - Select an imported image in Classic, switch to Compact, and switch back. The same image remains selected and renders in preview and print for both designs. Reloading starts in Classic with that image selected.
  - Selecting None or a bundled image after selecting a personal image returns the startup choice to None. Deleting the active personal image selects None, clears its saved reference, and leaves bundled choices available.
  - Import a valid image along with a corrupt or unsupported file. The valid image remains available after reload and the failed file has actionable feedback. A print or PDF test at 100% scale with a suitably sized source verifies image detail, readable text, and the existing card dimensions.

### BG-2 · Export and atomically restore personal backgrounds

- Extend the existing single-file JSON backup with a new format version. Take one consistent snapshot of the existing collection, the personal-image library, and the optional shared selection reference. Include each processed JPEG once as Base64, with its stable image ID and display name. Record the optional shared selection separately by image ID. The file contains all personal image data needed for offline restore on another browser or device.
- Before offering confirmation, validate the entire backup, including decoding the Base64 payloads, checking that the image bytes represent supported normalized JPEGs, validating image metadata and unique IDs, and resolving any saved selection reference to an image in the file. Show an error when validation fails.
- After confirmation, replace the working deck, saved decks, custom spells, SRD overrides, personal backgrounds, and the saved personal selection in one atomic transaction. Apply the restored selection after commit. Cancellation, a stale review, or a failed commit leaves the entire destination collection and its associations intact. Preserve the current stale-review protections, including invalidating a review when committed personal images or the persistent personal selection change.
- Interpret a version 1 backup as having an empty personal-image library and no saved personal selection. When the destination has personal backgrounds, clearly warn in the review that confirming the restore will remove them. Preserve browser preferences outside the collection, including the receiving language.
- Acceptance examples
  - Export a complete backup with multiple personal images and one selected. Restore it offline in another browser profile using the JSON file. The image library, shared choice, working deck, saved decks, custom spells, and SRD overrides all round-trip. The selected image renders in preview and print in both designs.
  - Review a version 1 backup in a browser with personal images. The review warns that those images will be removed. Cancel leaves everything intact. Confirming a fresh review replaces the collection and clears the images and saved personal selection together.
  - Try to restore a backup with corrupt JPEG data or a selection reference to an absent image. Validation rejects the file before confirmation and leaves all destination records and the current selection intact.
  - Simulate a write failure after replacement starts. The transaction rolls back the working deck, saved decks, custom spells, SRD overrides, image library, and saved personal selection. A collection change after review, including a personal-background change, also prevents replacement until the backup is reviewed again.

## Existing contracts and scope

- [Card layout and fitting](../MAIN-spec.md#9-card-layout-and-text-fitting) governs physical card content, continuation numbering, and fit behavior.
- [Printing](../MAIN-spec.md#10-printing) governs the centered grid, paper defaults, physical dimensions, application and browser print settings, print-only output, and omission and fit-error behavior.
- [Offline behavior](../MAIN-spec.md#11-offline-persistence-security-and-quality) applies to the print flow. Personal images must also remain local.
- Digital gameplay tracking, a dedicated play mode, accounts, cloud sync, and a full visual print-sheet designer are outside scope. The original request allows reconsidering the designer only if simpler controls prove inadequate.

## Verification and implementation discretion

- Cover selection and sheet placement in the print dialog and emitted output, including sparse first-sheet slots, continuation-only jobs, group boundaries, and the default workflow. Verify the existing geometry on both paper sizes and retain the [cross-browser print targets](../MAIN-spec.md#10-printing).
- Exercise import, shared background rendering, session persistence, offline backup round-trip, version 1 review, validation failure, and commit rollback through the relevant integration and end-to-end coverage.
- Follow the existing localized, keyboard-operable control patterns. Leave the precise control layout and normalization implementation to the implementing agent within the approved behavior and print-quality requirements.
