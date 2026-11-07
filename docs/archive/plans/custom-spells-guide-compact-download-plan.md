# Compact custom-spells guides and add example download

## Goal

- Shorten `docs/custom-spells-guide.md` and `docs/custom-spells-guide.de.md` while preserving all essential behavior, constraints, and import instructions.
- Keep the existing complete example exactly valid and importable.
- Add icon-only copy and download controls to the guide's JSON example.
- Do not add template functionality to the import/export dialog and do not change the JSON Schema.

## Decisions

- The current example is already a valid `custom-spells` envelope; `src/io/guide-examples.test.ts` validates it through `analyzeCustomImport`. Do not rewrite the JSON.
- The guide download must emit the exact code-block text shown in the guide, not a re-serialized object.
- Use native `title` attributes plus `aria-label` for icon-only tooltips/accessibility; avoid introducing a `TooltipProvider` dependency in the guide dialog tests.
- The download control is rendered only for code blocks whose parsed JSON has `type: "custom-spells"`; the prompt code block keeps only copy.
- Downloaded file name: `custom-spell-example-<locale>.json`.

## Implementation tasks

1. **Compact both guides with identical structure**
   - `docs/custom-spells-guide.md`
   - `docs/custom-spells-guide.de.md`
   - Add an explicit sentence in the JSON-format section: the `spells` array may contain one or more spell objects and every `id` must be unique within the file.
   - Remove or merge redundant sections:
     - Fold the standalone limitations list into the intro, export, import, and JSON-format text.
     - Compress abbreviation guidance to the essential scope, language limitation, `≤` behavior, undo behavior, and non-reversibility.
     - Compress import/export steps while keeping the 5 MiB limit, validation wait, collision choices, atomicity, and no-deck-change semantics.
     - Keep required/optional field tables, allowed values, component details, Markdown rules, troubleshooting essentials, JSON Schema link, and AI prompt.
     - Shorten the AI prompt without removing the requirement for a complete importable envelope.
   - Preserve test-sensitive content:
     - Exactly one fenced custom-spells JSON envelope per guide.
     - Spell names, levels, values, and localized description snippets used by `guide-examples.test.ts`.
     - Headings `Complete example` / `Vollständiges Beispiel`.
     - At least one Markdown table.
     - The `JSON Schema` link to `/custom-spell-card-json-schema.json`.
   - Keep both languages semantically consistent; do not leave German-only or English-only guidance.

2. **Add raw-text download support**
   - `src/io/export.ts`
     - Add `downloadText(filename, text, mimeType = "application/json")` containing the existing Blob/anchor logic.
     - Refactor `downloadJson` to call `downloadText(filename, JSON.stringify(data, null, 2))`.
     - Preserve existing behavior for deck and custom-spell exports.

3. **Update the guide dialog controls**
   - `src/components/CustomSpellsGuideDialog.tsx`
     - Import `Download` from `lucide-react`.
     - Pass the active `locale` into `GuideCodeBlock`.
     - Replace the visible copy text with an icon-only `Button` (`variant="outline"`, `size="icon"`, `className="h-7 w-7"`) using `Copy`/`Check`, `aria-label={t("guide.copyCode")}`, and `title={t("guide.copyCode")}`.
     - Add an icon-only download `Button` only when `JSON.parse(value).type === "custom-spells"`, using `Download`, `aria-label={t("guide.downloadExample")}`, and `title={t("guide.downloadExample")}`.
     - Call `downloadText(`custom-spell-example-${locale}.json`, value)`.
     - Keep the existing `aria-live` copy status text.

4. **Add translations**
   - `src/locales/en.ts`: `guide.downloadExample: "Download JSON example"`.
   - `src/locales/de.ts`: `guide.downloadExample: "JSON-Beispiel herunterladen"`.
   - Keep EN/DE key shapes identical.

5. **Update tests**
   - `src/components/HeaderMenu.test.tsx`
     - Keep the existing copy-button assertion; it still resolves through `aria-label`.
     - Assert the download control is present with its accessible name in English and German.
     - Do not click download unless `URL.createObjectURL`/`revokeObjectURL` are mocked.
   - `src/io/guide-examples.test.ts`: no content change expected; run it to confirm the compacted guide still has exactly one valid example.

6. **Update related documentation**
   - `docs/DEVELOPMENT.md`: extend the import/export implementation notes to mention the raw-text download helper and the guide's copy/download example.
   - `docs/custom-spell-import-guide.md`: add one short cross-reference stating that the in-app custom-spells guide contains the same complete example with copy and download controls.
   - Do not change `src/data/custom-spell-card-json-schema.json`, `README.md` behavior claims, or the import/export dialog.

## Validation

- `pnpm run check`
- `pnpm run test`
- Confirm both guides render and the example download remains importable.
- Confirm no visible "Copy code" or "Download" text remains in the guide controls.

## Commit message

```
docs(custom-spells): compact guides and add example download

- condense EN/DE custom-spell guides without losing constraints or import steps
- clarify that the spells array accepts multiple uniquely identified records
- add accessible icon-only copy/download controls to the complete example
- download the exact guide example as a valid importable JSON file
- add raw-text download helper and update guide tests/docs
```
