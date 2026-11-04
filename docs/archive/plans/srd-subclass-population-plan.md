# Phase 2 — SRD Subclass Population, 12-Class Expansion, and Subclass Localization

Status: **plan — awaiting approval**. Do not implement until approved.

Baseline: the committed Phase-1 implementation (canonical raw source shape + optional
lossless `subclasses` support). This plan builds on it; it does not redo the legacy
migration or restore removed tooling.

## 1. Resolved design decisions (approved by user)

1. **Canonical identifier form** = full catalog names from `docs/subclasses.md`:
   `"<Class>: <SubclassName>"`, e.g. `"Cleric: War Domain"`,
   `"Barbarian: Path of the Wild Heart"`, `"Druid: Circle of the Land"`,
   `"Paladin: Oath of Devotion"`. English identifiers are stored in every language.
2. **Out-of-catalog reference subclasses** (parent class among the 12) are **preserved**
   in `Spell.subclasses`, using a stable reconciled English name. A shared 48-entry
   catalog marks which are official 2024 subclasses; only those receive German labels.
   No new `Spell` field.
3. **Artificer** (parent class not among the 12 core classes) is **excluded and reported**.
4. **German raw source is populated explicitly** (mirrors English); the existing
   English-inheritance rule remains as a safety net.
5. **UI scope** = presentation only: a localized "Subclasses" row in `DetailsPane`.
   Card footer keeps the existing compact class summary (no subclass list). No filtering.
6. **Wizard German labels** = first-listed forms: Bannzauberer, Wahrsager, Hervorrufer,
   Illusionist. Cleric/Rogue/Sorcerer use the pre-parenthetical primary.
7. `"Arance Hand"` (reference) → `"Arcane Hand"` (explicit typo alias).

## 2. Repository audit findings

- `CORE_CLASSES` (8) is defined at `src/domain/spells.ts:14`. Consumers:
  `scripts/srd/common.ts` (`CLASS_BY_NAME`), `src/locales/labels.ts`
  (`CORE_CLASS_KEYS`/`classKey`, `satisfies Record<CoreClass, string>`),
  `src/components/library/LibraryPane.tsx:86` (`[...CORE_CLASSES, ...deriveClassOptions]`),
  `src/cards/Card.tsx:30` (`classSummary`), `src/components/details/DetailsPane.tsx:167`,
  `spellSchema` (`src/domain/spells.ts:144`), fixtures, and tests.
- `subclasses?: string[]` already exists in `Spell`/`spellSchema` and round-trips through
  persistence/import (`src/domain/payloads.ts`, `src/db/custom-spells.ts`,
  `src/domain/spells.test.ts`). The raw adapter already parses/validates it
  (`scripts/srd/common.ts` `canonicalSubclasses`; parent class must be a `CORE_CLASSES`
  name; independent of `classes`). Cross-language validation already exists
  (`scripts/srd/validate.ts`: set equality; English inheritance when translation omits).
- Neither `data/srd/srd-spells-2024.json` nor `_de.json` currently has `subclasses`.
  Both have exactly **339** spells with unique names. Existing `classes` arrays contain
  only the 8 caster classes, so widening `CORE_CLASSES` does not alter existing data.
- The reference file (`data/reference/srd-spells-2024_extended-props.json`) has **339**
  entries with unique names, **208** with `subclasses`, no `index`, and `classes` that
  include `Artificer`. Only `name` + `subclasses` may be read from it.
- No subclass UI or filtering exists. `src/cards/fingerprint.ts` includes `classes` but
  the card does not render subclasses, so it needs no change.
- The drift gate `src/test/srd-dataset.test.ts` reads the committed dataset from
  `git show HEAD:...` with a **working-tree fallback** — that fallback is the only path
  that could compare generated output against itself.

## 3. Verified spell matching (name-based)

- Name uniqueness: 339 unique names in both the reference and English source (and 339 in
  German). Matching by exact `name` (trimmed) is valid.
- **One mismatch found:** reference `"Arance Hand"` vs SRD `"Arcane Hand"`. Handled by one
  explicit alias; the tool must still report it and must **not** use fuzzy matching.
- The migration must still verify uniqueness/coverage programmatically and report every
  unmatched name (English or reference) rather than assuming a clean match.

## 4. Reconciliation inventory (from reference `subclasses`)

Derived by inspecting the reference file; **must be re-verified programmatically** by the
tool and reproduced in the committed report.

Totals: **110** distinct reference subclass identifiers = **45** alias-mapped to catalog
(**31** distinct catalog identifiers covered) + **59** reference-only (parent among the 12)
+ **6** excluded (Artificer). The 48-item catalog has **17** subclasses with no reference
coverage (e.g. Path of the Berserker, College of Lore, Battle Master, Assassin,
Wild Magic Sorcery, Evoker).

### 4.1 Alias map (reference → canonical identifier)

- Barbarian: `Wild Heart` → `Barbarian: Path of the Wild Heart`
- Bard: `Glamour` → `Bard: College of Glamour`
- Cleric: `Life`→`Cleric: Life Domain`; `Light`→`Cleric: Light Domain`;
  `Trickery`→`Cleric: Trickery Domain`; `War`→`Cleric: War Domain`
- Druid: `Moon`→`Druid: Circle of the Moon`; `Sea`→`Druid: Circle of the Sea`;
  `Stars`→`Druid: Circle of the Stars`; all `Land (…)` variants (Arctic, Arid Land, Coast,
  Desert, Forest, Grassland, Mountain, Polar Land, Swamp, Temperate Land, Tropical Land,
  Underdark) → `Druid: Circle of the Land`
- Fighter: `Psi Warrior` → `Fighter: Psi Warrior` (identity)
- Monk: `Elements`→`Monk: Warrior of the Elements`; `Open Hand`→`Monk: Warrior of the Open Hand`;
  `Shadow`→`Monk: Warrior of Shadow`
- Paladin: `Ancients`→`Paladin: Oath of the Ancients`; `Devotion`→`Paladin: Oath of Devotion`;
  `Glory`→`Paladin: Oath of Glory`; `Vengeance`→`Paladin: Oath of Vengeance`
- Ranger: `Fey Wanderer`→`Ranger: Fey Wanderer`; `Gloom Stalker`→`Ranger: Gloom Stalker`
- Rogue: `Arcane Trickster` → `Rogue: Arcane Trickster` (identity)
- Sorcerer: `Aberrant`/`Aberrant Mind`→`Sorcerer: Aberrant Sorcery`;
  `Clockwork`/`Clockwork Soul`→`Sorcerer: Clockwork Sorcery`;
  `Draconic`→`Sorcerer: Draconic Sorcery`
- Warlock: `Archfey`→`Warlock: Archfey Patron`; `Celestial`→`Warlock: Celestial Patron`;
  `Fiend`→`Warlock: Fiend Patron`; `Great Old One`→`Warlock: Great Old One Patron`
- Wizard: `Abjurer`→`Wizard: Abjurer`; `Diviner`→`Wizard: Diviner`;
  `Illusion`/`Illusionist`→`Wizard: Illusionist`

Dedup: several reference names collapse onto one canonical identifier
(`Aberrant`+`Aberrant Mind`, `Clockwork`+`Clockwork Soul`, `Illusion`+`Illusionist`, and
multiple `Land (…)` variants). After reconciliation each spell's list is deduped and
collisions are reported.

### 4.2 Reference-only (parent among the 12; stored verbatim with reconciled English name)

Barbarian: Giant, Totem Warrior, Ancestral Guardian · Bard: Spirits, Moon ·
Cleric: Grave, Nature, Ambition (PSA), Solidarity (PSA), Knowledge, Knowledge (PSA),
Order, Arcana, Strength (PSA), Twilight, Death, Tempest, Forge, Peace, Zeal (PSA) ·
Druid: Spores, Wildfire · Fighter: Arcane Archer · Monk: Sun Soul ·
Paladin: Noble Genies, Watchers, Conquest, Crown, Oathbreaker, Redemption ·
Ranger: Swarmkeeper, Drakewarden, Winter Walker, Horizon Walker, Monster Slayer,
Hollow Warden · Rogue: Phantom · Sorcerer: Shadow, Divine Soul (Chaos/Law/Good/Evil/
Neutrality), Lunar (Full Moon), Spellfire · Warlock: Undying, Undead, Vestige (Life/Light/
Trickery/War Domain), Genie (Dao/Djinni/Efreeti/Marid), Fathomless, Hexblade ·
Wizard: Necromancer, Transmuter

### 4.3 Excluded (parent class not among the 12)

Artificer: Reanimator, Cartographer, Alchemist, Battle Smith, Armorer, Artillerist —
reported as `unsupported-parent-class`. No Artificer additions to `CORE_CLASSES`.

## 5. Proposed architecture and affected files

### 5.1 Domain

- `src/domain/spells.ts` — expand `CORE_CLASSES` to 12, alphabetical:
  `Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer,
  Warlock, Wizard`. Keep `CharacterClass = CoreClass | (string & {})`.
- `src/domain/subclasses.ts` (new) — canonical catalog of the **48** identifiers
  (`SUBCLASSES` as a readonly tuple), plus helpers:
  `isCatalogSubclass(id)`, `subclassParentClass(id)`, `subclassDisplayNameFallback(id)`
  (subclass portion after the single `": "`), and the derived `SubclassId` type.
  This is the single shared registry (used by the build tool and localization); it is not
  a validation enum — the raw adapter stays tolerant of non-catalog identifiers.

### 5.2 Build layer

- `scripts/srd/common.ts` — `CLASS_BY_NAME` automatically picks up 12 classes. No
  behavioral change to subclass parsing (parent must still be a `CORE_CLASSES` name).
- `scripts/srd/subclass-reconciliation.ts` (new) — pure, testable reconciliation:
  reference-name → canonical identifier alias table (§4.1), explicit typo alias
  `Arance Hand`→`Arcane Hand` for spell matching, reference-only passthrough, and
  exclusion of non-`CORE_CLASSES` parents. Returns a structured result + report data.
- `scripts/migrate-srd-subclasses.ts` (new) — one-time, deterministic migration tool
  (see §6).
- `scripts/normalize-srd.ts` — unchanged (subclass copy + inheritance already implemented).

### 5.3 Localization

- `src/locales/labels.ts` — add 4 entries to `CORE_CLASS_KEYS`; add `SUBCLASS_KEYS`
  (canonical identifier → i18n key, e.g. `"Cleric: War Domain"` → `"subclass.cleric.warDomain"`)
  and `subclassKey(id): key | null`, `subclassLabel(id, t)` returning the localized label
  or the English fallback from the identifier.
- `src/locales/en.ts` / `src/locales/de.ts` — add class labels
  (Barbarian/Barbar, Fighter/Kämpfer, Monk/Mönch, Rogue/Schurke) and a `subclass`
  namespace with the 48 English / 48 German names. `de` stays `satisfies Translations`
  (key parity enforced). German names per `docs/subclasses.md`:
  - Wizard = Bannzauberer, Wahrsager, Hervorrufer, Illusionist (decision §1.6).
  - Cleric = Domäne des Lebens / des Lichts / der List / des Krieges.
  - Rogue Soulknife = Seelenmesser; Sorcerer = Abnorme Zaubermacht / Uhrwerk-Zaubermacht.
  - All other classes use the single name from the document.

### 5.4 UI

- `src/components/details/DetailsPane.tsx` — add a localized **"Subclasses"** metadata row
  (label from a new `spell.metadata.subclasses` key), rendering each assignment via
  `subclassLabel()`; show `—` when `spell.subclasses` is absent/empty. Card footer and
  `classSummary` unchanged. No filtering.

### 5.5 Data

- `data/srd/srd-spells-2024.json`, `data/srd/srd-spells-2024_de.json` — populated with
  `subclasses` (inserted immediately after `classes`; omitted when empty).
- `src/data/spells.srd.json`, `src/data/spells.srd.de.json` — regenerated via
  `pnpm run normalize:srd` (now include `subclasses`).
- `data/reference/subclass-reconciliation.json` (new, committed) — the reconciliation
  report (§6.4). The reference source file itself is never modified.

## 6. Migration strategy

### 6.1 Tool

`scripts/migrate-srd-subclasses.ts`, invoked with `pnpm exec tsx`.

```
--input-dir <dir>    default data/srd
--reference <path>   default data/reference/srd-spells-2024_extended-props.json
--files <a,b>        default srd-spells-2024.json,srd-spells-2024_de.json
--apply              write changes (default: dry-run, writes nothing)
--report <path>      write the JSON reconciliation report
```

Reuse the proven Phase-1 patterns: pure exported functions, dry-run default, deterministic
2-space/LF/trailing-newline serialization (reuse `serializeMigrated`), staged writes with
backup/rollback, filename+index diagnostics.

### 6.2 Algorithm

1. Parse reference + both raw sources. Verify name uniqueness; match spells by trimmed
   `name` with the single `Arance Hand`→`Arcane Hand` alias; collect unmatched names.
2. For each reference entry, reconcile its `subclasses` via §4.1 into canonical
   identifiers; passthrough reference-only; exclude non-`CORE_CLASSES` parents; dedupe.
3. Insert the sorted `subclasses` array after `classes` in the matching entry of both raw
   sources; never touch any other field, order, or value.
4. Idempotency: if an entry already has `subclasses` equal to the reconciled set → no-op;
   if it differs → abort with a diagnostic.

### 6.3 Self-validation before writing

Normalize both migrated sources in memory (German via `normalizeSharedTranslation` +
`validateTranslation`) and assert:
- every field **except** `subclasses` equals the committed `src/data/spells.srd*.json`
  (strip `subclasses` from both sides and deep-compare);
- `subclasses` equals the reconciled expectation and is identical (as a set) across EN/DE;
- every identifier's parent class is a `CORE_CLASSES` name.

### 6.4 Committed report (`data/reference/subclass-reconciliation.json`)

Per file and overall: total spells, spells populated, total assignments, catalog-mapped
(with reference→canonical pairs and counts), reference-only (id + count), excluded
(id + `unsupported-parent-class`), unmatched spell names, unmatched/ambiguous subclass
names, dedup collisions, and the catalog identifiers with no reference coverage.

## 7. Twelve-class integration

- Expand `CORE_CLASSES` (§5.1) — additions only; existing 8 preserved.
- `CLASS_BY_NAME` (`scripts/srd/common.ts`) derives automatically; raw validation now
  accepts the 4 new classes in `classes` and as subclass parents.
- `CORE_CLASS_KEYS` (`satisfies Record<CoreClass, string>`) forces the 4 new locale keys,
  so the compiler guarantees complete localization.
- `LibraryPane` class options derive from `CORE_CLASSES` — the new classes appear
  automatically (no data uses them yet).
- No gameplay/mechanics changes; custom-spell `classes` remain free-form strings.

## 8. Localization and UI integration

- Canonical identifiers stay English everywhere in stored data.
- Presentation resolves labels via `subclassLabel()`; unknown/reference-only identifiers
  fall back to the English subclass name (never a translated identifier).
- German labels are presentation-only (no dataset edits); adding German labels for
  reference-only subclasses later requires only new catalog/locale entries.
- DetailsPane handles absent/empty `subclasses` gracefully.

## 9. Tests, acceptance criteria, verification

New/updated tests:
- `scripts/srd/subclass-reconciliation.test.ts` or `src/test/srd-subclass-migration.test.ts`:
  alias rules, typo alias, dedup collisions, reference-only passthrough, Artificer
  exclusion, unmatched-name reporting, determinism, idempotency, dry-run writes nothing,
  `--apply` atomic/rollback, non-subclass fields unchanged.
- `src/domain/subclasses.test.ts` (or extend `spells.test.ts`): 48 unique identifiers,
  each parent ∈ `CORE_CLASSES`, format `"<Class>: <Sub>"`, `CORE_CLASSES` has 12 entries.
- `src/test/normalize.test.ts`: accepts the 4 new classes; rejects a subclass whose parent
  is not a `CORE_CLASSES` name; still tolerant of non-catalog identifiers.
- `src/test/srd-dataset.test.ts`: 339 spells; subclass counts; every parent ∈ `CORE_CLASSES`;
  EN/DE assignment equality; **mechanics-unchanged** check (strip `subclasses` from both
  fresh output and golden and deep-compare); **harden the baseline** so the working-tree
  fallback cannot silently compare generated output against itself (fail if the Git
  baseline is unavailable instead of falling back).
- `src/locales/locales.test.ts`: DE labels for a sample of the 48, EN fallback for a
  reference-only identifier, key parity.
- `src/components/details/DetailsPane.test.tsx` (new): renders the localized Subclasses
  row; `—` when absent.
- Update any test/fixture assuming exactly 8 classes.

Acceptance criteria:
- Populated spell/assignment counts match the reconciled reference exactly (catalog +
  reference-only; Artificer excluded); no silently dropped valid assignment.
- Only `subclasses` differs from the Phase-1 datasets (mechanics unchanged).
- Identical canonical identifiers in EN/DE raw and normalized datasets.
- `docs/subclasses.md` reconciliation is fully explicit and tested.

Verification (run and report results):
- `pnpm exec tsx scripts/migrate-srd-subclasses.ts` (dry-run) → review report.
- `pnpm exec tsx scripts/migrate-srd-subclasses.ts --apply --report data/reference/subclass-reconciliation.json`.
- `pnpm run normalize:srd`
- `pnpm exec vp check`
- `pnpm run test` (`vp test`)
- `pnpm run build`
- `pnpm run test:e2e` (library-filters, app, i18n-cards, print).

## 10. Documentation updates

- `README.md` — 12-class scope; subclass population; reference reconciliation; report.
- `docs/srd-data-pipeline.md` — catalog identifiers, reconciliation, EN/DE population.
- `docs/subclasses.md` — remove the "later phase" note; mark as the authoritative catalog;
  document reference-only vs official and the reconciliation rules.
- `docs/specs/MAIN-spec.md` — `CORE_CLASSES` 12; subclass phase complete.
- `AGENTS.md` — note the reconciliation report location under `data/reference/`.
- Add a status note to `docs/specs/srd-source-data-refactoring.md` pointing to this phase
  (preserve it as historical).

## 11. Execution order

1. Domain: `CORE_CLASSES` 12 + `src/domain/subclasses.ts`; update domain tests.
2. Localization: class keys + `SUBCLASS_KEYS` + EN/DE `subclass` namespace; locale tests.
3. Build: `subclass-reconciliation.ts` + `migrate-srd-subclasses.ts` + tests.
4. UI: DetailsPane Subclasses row + test.
5. Dry-run migration → review report → `--apply` → `pnpm run normalize:srd`.
6. Update `srd-dataset.test.ts` (counts, EN/DE equality, mechanics-unchanged, hardened baseline).
7. Update docs (§10).
8. Run all quality gates; commit raw sources, generated datasets, and the report together
   (only when explicitly authorized).

## 12. Risks

| Risk                                            | Mitigation                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Reference name typos beyond `Arance Hand`       | Tool reports all unmatched names; no fuzzy matching; abort on any unmatched spell name.                          |
| Reference-only subclasses mistaken for official | 48-entry catalog marks official; report lists reference-only separately; DE labels only for official.            |
| Duplicate identifiers after alias collapse      | Dedup + collision reporting; sorted output.                                                                      |
| Datasets drift beyond `subclasses`              | Self-validation strips `subclasses` and compares all other fields; regression test repeats it.                   |
| Drift gate self-comparison                      | Remove the silent working-tree fallback; require the Git baseline.                                               |
| Legacy migration tool/tests break               | It is a no-op on canonical sources and passes `subclasses` through; verify `srd-migration.test.ts` still passes. |
