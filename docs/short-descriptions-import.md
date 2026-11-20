# Import reviewed short descriptions

The application owns the normalized SRD datasets and the released JSON sidecars. The standalone
authoring toolkit uses a pinned SRD and abbreviation snapshot to produce reviewed exports. This
maintainer workflow is separate from [custom spell and deck import](custom-spell-import-guide.md).
The [migration record](plans/short-descriptions-migration-record.md) identifies the initial inputs and approved export.

## File contract

- Copy `out/spell-short-descriptions.{en,de}.json` from the toolkit into `src/data/` with the
  same names. The Workers preview serves those files at the site root. The service worker
  precaches them for offline use.
- Each file is a JSON object keyed by canonical SRD IDs matching
  `^srd-[a-z0-9]+(?:-[a-z0-9]+)*$`. Each ID must exist in the same-locale dataset named by
  `src/data/spell-languages.json`. Match by ID even if local names or dataset order change.
- Each value has a required `description` and optional `higherLevels`. Each present field is a
  nonblank Markdown string of at most 20,000 characters under the runtime Zod string limit.
  Extra fields, duplicate keys at any level, and non-object entries fail validation.
- Serialization uses UTF-8 without a BOM, LF, two spaces, keys sorted by code unit, and one final
  newline. Entry fields appear in the order `description`, `higherLevels`. Preserve the exact
  decoded Markdown. The toolkit supplies the canonical bytes.
- German must cover every ID in the German dataset. English must include `srd-fireball` and can
  be partial. Document the reason for any key removed relative to the parent commit. Extend the
  release test policy explicitly when adding a sidecar locale.

The [runtime schema](../src/domain/short-descriptions.ts) defines interchange compatibility.
Coordinate schema, canonical ID, limit, and filename changes with the toolkit before importing.
The [product specification](specs/MAIN-spec.md#6-custom-spell-management) describes editor behavior.

## Prepare and refresh the input snapshot

1. Review raw SRD corrections in the app and follow the [SRD data pipeline](srd-data-pipeline.md).
   Run `pnpm run normalize:srd` and identify the app commit containing the normalized inputs and
   abbreviation catalogs. Use an immutable candidate commit for source changes awaiting release.
2. Copy the manifest and the two datasets it names from that commit into the toolkit's
   `inputs/srd/`. From the same app checkout, export the ordered abbreviation snapshots:

   ```powershell
   @'
   import { writeFileSync } from "node:fs";
   import { resolve } from "node:path";
   import { abbreviationCatalog } from "./src/locales/abbreviations.ts";

   const destination = process.argv[2];
   const catalogs = ["en", "de"].map(locale => [locale, abbreviationCatalog(locale)]);
   const snapshots = {
     "abbreviations.json": ({ full, short }) => ({ full, short }),
     "abbreviation-forms.json": ({ id, short, forms, timeUnit }) => ({
       id, short, forms, ...(timeUnit ? { timeUnit } : {}),
     }),
   };
   for (const [filename, project] of Object.entries(snapshots)) {
     const data = Object.fromEntries(catalogs.map(([locale, entries]) => [
       locale, entries.map(project),
     ]));
     writeFileSync(resolve(destination, filename), JSON.stringify(data, null, 2) + "\n");
   }
   '@ | node --input-type=module - '<toolkit-directory>/inputs/srd'
   ```

3. Record the app commit and SHA-256 hashes of all five snapshot files in toolkit provenance.
   Compare normalized description and scaling text by locale and ID. The toolkit hashes
   `description` and `higherLevels ?? []` for staleness. Review changes to contextual fields
   and abbreviation inputs as well, since they can affect a candidate without changing that hash.
   Review old candidates affected by those changes before export.

## Review, validate, and import

1. Use the toolkit's authoring guide to select missing or stale IDs and review or resolve withheld
   entries. Build and validate the export, then record the toolkit revision and both output hashes.
2. Verify the target app's inputs still match the toolkit snapshot. Copy the two reviewed sidecars
   into `src/data/`. Review IDs added, changed and removed against the parent commit and inspect
   the exact Markdown and optional scaling for changed entries. If either checkout changes during
   the handoff, refresh the snapshot or rerun validation as applicable before importing.
3. Run `pnpm exec vp test src/test/runtime-short-description-sidecars.test.ts`,
   `pnpm exec vp check`, `pnpm exec vp test`, and the affected browser checks against a fresh
   Workers preview. The release test validates the on-disk files with the runtime schema and
   rejects duplicate keys through byte comparison against the canonical serialization. The
   [development guide](DEVELOPMENT.md#local-verification) lists build and preview verification.
4. Commit the imported sidecars with the toolkit export revision. Keep the snapshot, fingerprints
   and review history in the toolkit. The deployed asset carries only the Markdown payload, so
   review and snapshot verification are required to establish freshness.
