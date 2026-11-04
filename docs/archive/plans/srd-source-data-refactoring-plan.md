# Implementation Plan — SRD Raw Source Data Refactoring

Status: **ready for implementation (pending approvals in §3)**
Authoritative source: `docs/specs/srd-source-data-refactoring.md` (the spec).
Plan scope: everything MANDATORY in the spec. Optional cleanups are listed but excluded from the execution path (§2).
Do not modify the spec or source files during planning; this plan only.

> Note: the requested path `docs/plans/srd-source-data-refactoring-plan.md` was denied by workspace permissions, so this plan lives at `.kilo/plans/1792700496782-srd-source-data-refactoring-plan.md`.

---

## 1. Verified baseline (evidence)

Confirmed by inspecting the current working tree:

| Fact                                                                                                                                                                                                                                 | Evidence                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| English raw `data/srd/srd-spells-2024.json` is the legacy 5e-bits shape (object `school.index`, `classes[].index` objects, `components: ["V","S","M"]`, object `damage.damage_type.index`, top-level `url`).                         | read of file lines 1–45; `"url": "/api/2024/spells/..."` present        |
| German raw `data/srd/srd-spells-2024_de.json` uses the **same** canonical legacy shape (object `school.index`, `classes[].index` objects, `V/S/M`, object `damage.damage_type.index`, `url`).                                        | read of file lines 1–39                                                 |
| Therefore `isCanonicalSourceShape` (`scripts/srd/english.ts:150`) returns `true` for both files → both are normalized by the shared adapter; `scripts/srd/german.ts` is dead for checked-in data.                                    | spec §3.2 confirmed against raw files                                   |
| `data/srd/srd-spells-2024_extended-props.json` is a distinct reference shape (no `index`, string `school`/`classes`, combined `components` string, `at_higher_levels`, `subclasses`), and currently makes `discoverSrdInputs` throw. | read of file lines 1–23; `discovery.ts:74-81` + regex `discovery.ts:44` |
| `data/srd/DE_SRD_CC_v5.2.1_converted-pdf__page122-202_spells.md` is a `.md` (ignored by JSON discovery).                                                                                                                             | glob `data/**/*`                                                        |
| `data/srd/canonical-english.snapshot.json` is git-tracked; snapshot logic lives at `scripts/normalize-srd.ts:59-89,104`, options at `:30-33,102-103`.                                                                                | read of file                                                            |
| `src/data/spells.srd.json`, `spells.srd.de.json`, `spell-languages.json` are tracked and currently unmodified. 339 English spells.                                                                                                   | `git status`, `german-conversion.test.ts:217`                           |
| Vitest includes `src/**/*.{test,spec}.{ts,tsx}` and excludes `scripts/**`; script tests must import `../../scripts/...`.                                                                                                             | `vite.config.ts:85-86`                                                  |
| `vp` fmt ignores `data/**`, `docs/**`, `src/data/**`, `**/*.md`.                                                                                                                                                                     | `vite.config.ts:11-21`                                                  |

### 1.1 Material findings (report, do not silently redesign)

**C1 — Raw sources are untracked and the tree has unrelated WIP.**
`git status` shows `data/srd/srd-spells-2024.json` and `srd-spells-2024_de.json` as **untracked** (`??`), and shows unrelated uncommitted modifications (`README.md`, `docs/specs/MAIN-spec.md`, `docs/srd-data-pipeline.md`, `package.json`, `pnpm-lock.yaml`, `scripts/convert-german-srd.ts`, `scripts/srd/discovery.ts`, `src/test/german-conversion.test.ts`, `src/test/normalize.test.ts`) plus a staged-away deletion of `data/srd/5e-SRD-Spells.json`.
Impact: spec §9/§11.4 rely on the raw sources being committed so `git diff` drift review works, and on the committed datasets as the golden baseline. The committed `src/data/spells.srd*.json` are tracked and currently equal to a fresh normalization, so the **golden baseline is available today**; the raw sources are not.
Mitigation: Phase 0 captures hashes and requires an explicit checkpoint (commit or approved backup) before migration. Committing requires explicit user authorization (repo rule: never commit unprompted).

**C2 — `DAMAGE_TYPES` placement is internally contradictory in the spec.**
Spec §7 says "Make a definitive implementation choice", recommends adding `DAMAGE_TYPES` to `src/domain/spells.ts`; §18.3 lists the same placement as an open item requiring confirmation. Plan default = domain layer (spec §7 recommendation). Approval item A1.

**C3 — Regression-test baseline mechanism is under-specified.**
Spec §11.4 requires comparing freshly normalized data against the "committed Git baseline", not the working-tree generated files (because `pnpm run build` overwrites them). Recommended mechanism: read the golden dataset from the Git object store (`git show HEAD:src/data/spells.srd.json`, `HEAD:src/data/spells.srd.de.json`) with a graceful fallback to the working-tree file when git is unavailable. This is safe here because the normalized output stays byte-identical across the migration. Approval item A2.

**C4 — Optional cleanup is entangled with mandatory test updates.**
`src/test/german-conversion.test.ts` calls `normalizeEnglish` with **legacy-shape** fixtures. Once T2.1 changes `normalizeEnglish` to require the new shape, that test fails regardless of whether `convert-german-srd.ts` is deleted. Similarly `scripts/convert-german-srd.ts:510-513` calls `normalizeEnglish` on legacy-shaped entries. So the mandatory path must resolve this: recommended = remove `convert-german-srd.ts` + its test + the `convert:german-srd` script (spec §18.2, §10.5) as part of the change. If declined, the test must be rewritten to new-shape fixtures and the script marked legacy/no-op. Approval item A3.

**C5 — Spec §14 parenthetical.**
§14 is titled "Documentation update checklist (do not edit during this task)" yet §16 step 10 and §10.9 require updating those docs. Plan treats §14 as the required doc-update checklist and never edits the refactoring spec itself. Flagged for awareness only.

---

## 2. Scope guardrails (do not violate)

- Keep normalized `src/data/spells.srd*.json` **byte-identical**. The only permitted schema addition is optional `subclasses`, absent for all current spells.
- Do not populate, infer, merge, or copy subclass data from the reference file (later phase).
- Do not extend `CORE_CLASSES`, `SPELL_SCHOOLS`, or add locale catalog entries.
- Do not adopt the extended-props combined component string; leave `components`/`material` unchanged.
- Do not add subclass UI/filtering/deck behavior.
- Preserve `damage.damage_at_slot_level` and `attack_type` verbatim in raw sources.
- Never hand-edit migrated raw sources; use the migration tool.
- Keep discovery BCP 47 validation strict; do not weaken it.

### 2.1 Optional cleanups (EXCLUDED from execution path unless approved)

- **O1** Remove `scripts/srd/german.ts`, `GERMAN_CLASS_BY_NAME` (`scripts/srd/common.ts:35-44`), the `de` branch (`scripts/normalize-srd.ts:119-122`), and the German-adapter tests.
- **O2** Remove `scripts/convert-german-srd.ts`, `src/test/german-conversion.test.ts`, and the `convert:german-srd` npm script (see C4 — likely required, not merely optional).
- **O3** Relocate `data/srd/DE_SRD_CC_..._spells.md` alongside the reference file.

---

## 3. Approvals required before implementation

| ID  | Decision                                                                                                           | Recommended default                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| A0  | Checkpoint the current WIP so raw sources are recoverable/reviewable before migration (commit or approved backup). | Approve checkpoint commit of raw sources + current tree                                                            |
| A1  | `DAMAGE_TYPES` placement                                                                                           | Add `DAMAGE_TYPES` to `src/domain/spells.ts`; derive `DAMAGE_TYPE_KEYS` in `src/locales/labels.ts` via `satisfies` |
| A2  | Regression-test golden source                                                                                      | Read `git show HEAD:src/data/...` with working-tree fallback                                                       |
| A3  | `german.ts` / `convert-german-srd.ts` removal                                                                      | Remove both (O1 + O2)                                                                                              |

The remainder of this plan assumes the recommended defaults. If A1/A2/A3 are declined, apply the noted alternatives in the affected tasks.

---

## 4. Task checklist

Legend: **[P]** = safe for parallel execution with other [P] tasks in the same phase (no shared files); **[S]** = sequential.

### Phase 0 — Preflight, baseline, relocation (sequential)

- [ ] **T0.1 [S] Checkpoint + baseline capture**
  - Objective: freeze the pre-migration state and record the golden baseline.
  - Files: none edited. Produce `docs/plans/baseline/` notes or a temporary report (do not commit generated datasets).
  - Instructions:
    1. Record SHA-256 of `data/srd/srd-spells-2024.json`, `data/srd/srd-spells-2024_de.json`, `data/srd/canonical-english.snapshot.json`, `src/data/spells.srd.json`, `src/data/spells.srd.de.json`, `src/data/spell-languages.json`.
    2. Confirm 339 English spells and unique IDs.
    3. Per A0: commit the current tree (or copy the two raw sources + snapshot to an approved backup) so the pre-migration raw bytes are recoverable.
  - Acceptance: hashes recorded; raw sources recoverable; no source files modified by this task.
  - Parallel: no (must precede everything).

- [ ] **T0.2 [S] Relocate the reference file**
  - Objective: unblock `discoverSrdInputs` without weakening BCP 47 validation.
  - Files: move `data/srd/srd-spells-2024_extended-props.json` → `data/reference/srd-spells-2024_extended-props.json` (create `data/reference/`). Optionally O3: move the `.md` there too.
  - Instructions: use `git mv`/`mv`; do not edit the file contents. Document the convention (non-dataset/reference JSON must not live in `data/srd/`) in a README/doc update (T7.1/T7.2).
  - Acceptance: `data/srd/` contains only `srd-spells-2024.json`, `srd-spells-2024_de.json`, and the snapshot; the reference file is preserved intact under `data/reference/`.
  - Parallel: no.

- [ ] **T0.3 [S] Baseline reproduction gate (GATE G0)**
  - Objective: prove the unchanged pipeline reproduces the committed datasets before any code change.
  - Instructions: run `pnpm run normalize:srd`; then `git status --porcelain src/data` and `git diff --exit-code -- src/data`.
  - Acceptance: command succeeds (discovery no longer throws) and `src/data/spells.srd.json`, `spells.srd.de.json`, `spell-languages.json` are **byte-identical** (no git diff). If they differ, STOP and investigate the drift before proceeding (do not weaken the process).
  - Parallel: no.

### Phase 1 — Domain + build-layer schema

- [ ] **T1.1 [S] Runtime schema: optional `subclasses` (+ `DAMAGE_TYPES` per A1)**
  - Objective: add lossless optional `subclasses` to the runtime `Spell`.
  - Files: `src/domain/spells.ts`; `src/domain/spells.test.ts`.
  - Deps: none.
  - Instructions:
    - Add `subclasses?: string[];` to `Spell` (interface, ~line 63 area) and to `spellSchema` mirroring `damageTypes`: `subclasses: z.array(trimmedNonEmpty(LIMITS.META_MAX)).refine(unique?).optional()`. Mirror the `classes` uniqueness style if a refine is added; the schema must enforce non-empty + unique + length but NOT the `"<Class>: <Sub>"` prefix rule (that stays raw-adapter-only; custom/import stays tolerant).
    - Per A1: add `export const DAMAGE_TYPES = [...] as const` (13 canonical lowercase slugs) beside `SPELL_SCHOOLS`/`CORE_CLASSES`; export `type DamageType`. Do not change other limits/enums/`CharacterClass`.
    - Extend `src/domain/spells.test.ts`: valid `subclasses` validates and round-trips; duplicate `subclasses` fail; over-long entry fails; a `Spell` without `subclasses` still validates.
  - Acceptance: `src/domain/spells.test.ts` passes; no other schema behavior changes.
  - Parallel: no (T1.2/T1.3/T1.4 depend on it).

- [ ] **T1.2 [P] Build maps + validators (`scripts/srd/common.ts`)**
  - Objective: canonical name maps, damage vocabulary, subclass helpers.
  - Files: `scripts/srd/common.ts` (only).
  - Deps: T1.1.
  - Instructions:
    - Add `SCHOOL_BY_NAME` and `CLASS_BY_NAME` (canonical name → enum, keyed case-insensitively, same pattern as `SCHOOL_BY_INDEX`/`CLASS_BY_INDEX`).
    - Add the canonical damage-type vocabulary (reuse `DAMAGE_TYPES` from `src/domain/spells.ts` per A1; else a build-local `Set`).
    - Add subclass helpers: parse `"<Class>: <Sub>"` (exactly one `": "`, both parts trimmed non-empty), validate `<Class>` ∈ `CORE_CLASSES` (independent of `classes`), enforce uniqueness within a spell, no fixed subclass enumeration, no alias canonicalization.
    - Keep `SrdSourceError`, `requireString/Record/Array`, `requireComponents`, `requireRange`. Leave `GERMAN_CLASS_BY_NAME` in place unless O1 is approved.
  - Acceptance: new helpers exported and unit-testable; no behavior change to existing exports.
  - Parallel: yes (distinct file from T1.3/T1.4).

- [ ] **T1.3 [P] Cross-language subclass validation (`scripts/srd/validate.ts`)**
  - Objective: subclasses are canonical mechanics.
  - Files: `scripts/srd/validate.ts` (only).
  - Deps: T1.1.
  - Instructions: mirror the `damageTypes` check (`validate.ts:99-101`) — when a translated entry provides `subclasses`, its set must equal the English set; when absent, it passes. Per spec §6.3 ambiguity: if English has `subclasses` and a translation omits them, either inherit English's canonical assignments into the normalized translation OR explicitly document why omission is acceptable. **Recommended: inherit English `subclasses` when the translation omits them** (prevents silent loss). Choose once and state the rationale in a code comment.
  - Acceptance: unit coverage in Phase 6 (T6.3) passes; conflicting sets fail with filename + index.
  - Parallel: yes (distinct file).

- [ ] **T1.4 [P] Localization vocabulary derivation (`src/locales/labels.ts`)**
  - Objective: single source of truth for damage types (only if A1 = domain).
  - Files: `src/locales/labels.ts` (only).
  - Deps: T1.1.
  - Instructions: derive `DAMAGE_TYPE_KEYS` from `DAMAGE_TYPES` via `as const satisfies Record<DamageType, string>`; keep existing keys/values and `damageTypeKey` behavior (unknown → `null`). No translation content changes.
  - Acceptance: `vp check` type-checks; runtime behavior unchanged.
  - Parallel: yes (distinct file).

### Phase 2 — Adapters and shape detection

- [ ] **T2.1 [S] New-shape adapters (`scripts/srd/english.ts`, `scripts/srd/shared-translation.ts`)**
  - Objective: read the new raw schema; reject legacy with an actionable migration hint.
  - Files: `scripts/srd/english.ts`; `scripts/srd/shared-translation.ts` (doc comment only).
  - Deps: T1.1, T1.2.
  - Instructions:
    - `normalizeEnglishEntry`: read string `school` (via `SCHOOL_BY_NAME`, canonical capitalization), string-array `classes` (via `CLASS_BY_NAME`, dedup-checked), keep other fields; parse optional `subclasses` via the T1.2 helper and set `spell.subclasses` only when present (no default). `damage_at_slot_level`/`attack_type` are ignored (not read).
    - `canonicalDamageTypes`: accept a string, validate against the vocabulary, emit `[<lowercased slug>]`.
    - `isCanonicalSourceShape`: update to the NEW shape (string `school`, `classes[]` strings, `components` ∈ {V,S,M}). If a **legacy** shape is detected (object `school.index`), return/throw such that `normalizeEnglish`/`buildSrdArtifacts` fails with a message instructing to run `pnpm exec tsx scripts/migrate-srd-source-format.ts`. No permanent legacy parsing.
    - Preserve stable IDs (`srdIdForIndex`), dedup detection, filename+index diagnostics.
  - Acceptance: new-shape fixtures normalize correctly; legacy fixtures fail with the migration hint. Covered by T6.3.
  - Parallel: no (shared dependency for migration tool + tests).

### Phase 3 — Migration tool (independent file; can start after T2.1)

- [ ] **T3.1 [P] `scripts/migrate-srd-source-format.ts`**
  - Objective: deterministic one-time legacy→new conversion.
  - Files: `scripts/migrate-srd-source-format.ts` (new).
  - Deps: T1.2, T2.1.
  - Instructions (spec §12): CLI `--input-dir` (default `data/srd`), `--files` (default both), `--apply` (default dry-run), `--report <path>`. Export a pure `migrateSource(raw)` for tests. Steps: parse (filename context on malformed); validate legacy structure; convert `school` object→canonical name, `classes[]` objects→canonical names (dedup-checked), `damage.damage_type` object→lowercase slug; preserve `damage_at_slot_level`/`attack_type` verbatim; preserve valid `subclasses` else omit; remove top-level `url`; preserve entry/property order. Validate output by running the new adapters in-memory and asserting normalized output equals committed `src/data/spells.srd*.json` (and `validateTranslation` for German). For `--apply`: write sibling temp then atomically rename per file, but **stage and validate both outputs before any replacement**, with backup/rollback if a later replacement fails. Idempotent (already-migrated → no-op). Deterministic serialization: 2-space indent, LF, trailing newline.
  - Acceptance: dry-run writes nothing; failure aborts without modifying inputs; report includes per-file counts, conversions, preserved-metadata counts, subclass found/omitted, failures (spec §12.4).
  - Parallel: yes (new file, distinct from test files).

- [ ] **T3.2 [P] `src/test/srd-migration.test.ts`**
  - Objective: migration coverage (spec §11.5).
  - Files: `src/test/srd-migration.test.ts` (new).
  - Deps: T3.1.
  - Instructions: legacy EN→new; legacy DE→new (2-space/LF/trailing newline; order preserved); `url` removed; `damage_at_slot_level` + `attack_type` preserved (`acid-arrow` example); stable `index`/ID; no fabricated `subclasses` (absent → omitted); unknown class/school/damage or malformed legacy → actionable error; idempotent no-op; dry-run writes nothing, failure aborts without modification; post-migration normalization equals pre-migration normalized datasets.
  - Acceptance: all cases pass under `vp test`.
  - Parallel: yes (new file).

### Phase 4 — Execute migration and verify equivalence (sequential gate)

- [ ] **T4.1 [S] Dry run + review**
  - Instructions: run the tool without `--apply`; review the report against spec §12.4; confirm the validators inside the tool found no drift.
  - Acceptance: report reviewed; no unknown/ambiguous mappings; preserved-metadata counts match expectations (89 `damage_at_slot_level`, 21 `attack_type`).
  - Parallel: no.

- [ ] **T4.2 [S] Apply migration**
  - Instructions: `--apply`; then inspect `git diff` on the two raw sources (new shape, `url` gone, ordering preserved); re-run dry-run to confirm idempotent no-op.
  - Acceptance: inputs fully migrated atomically; no partial state; re-run reports no-op.
  - Parallel: no.

- [ ] **T4.3 [S] Normalized equivalence gate (GATE G2)**
  - Instructions: run `pnpm run normalize:srd`; assert `git diff --exit-code -- src/data` is empty.
  - Acceptance: `spells.srd.json` / `spells.srd.de.json` / `spell-languages.json` byte-identical to committed versions. Any difference is a blocker.
  - Parallel: no.

### Phase 5 — Remove the canonical English snapshot

- [ ] **T5.1 [S] Strip snapshot logic**
  - Files: `scripts/normalize-srd.ts`, delete `data/srd/canonical-english.snapshot.json`.
  - Deps: T4.3.
  - Instructions: remove `verifyOrCreateSnapshot` (`:59-89`) and its call (`:104`); remove `BuildOptions.snapshotPath` and `allowSnapshotCreation` (`:30-33`, `:102-103`). Keep discovery, adapter selection, cross-language validation, dataset writes, manifest, static-asset copying. Keep fail-fast discovery for stray `srd-spells-2024*` files.
  - Acceptance: no references to `snapshot` remain in `scripts/`; snapshot file deleted; normalize still regenerates identical datasets.
  - Parallel: no.

### Phase 6 — Tests (drift regression + adapter/runtime coverage)

- [ ] **T6.1 [P] `src/test/srd-dataset.test.ts` (drift gate; replaces snapshot)**
  - Files: `src/test/srd-dataset.test.ts` (new).
  - Deps: T2.1, T4.2, T5.1.
  - Instructions: normalize real `data/srd/srd-spells-2024.json`; assert deep-equality with the golden English dataset; normalize real German + `validateTranslation` vs English; assert deep-equality with golden German. Assert 339 spells, unique IDs, exact sorted ID set. Golden source per A2: `git show HEAD:src/data/...` (fallback to working-tree file + warning). Keep the ID-set fixture maintainable.
  - Acceptance: passes on unchanged data; fails on drift.
  - Parallel: yes (new file).

- [ ] **T6.2 [P] Extend `src/domain/spells.test.ts` round-trip/payload coverage**
  - Files: `src/domain/spells.test.ts` (if not already extended in T1.1, add here).
  - Deps: T1.1.
  - Instructions: `Spell` with valid `subclasses` round-trips; duplicate/over-long fail; without `subclasses` validates; round-trip through `spellSchema` via `src/domain/payloads.ts` accepts the optional field.
  - Acceptance: passes.
  - Note: same file as T1.1 — do not run concurrently with T1.1.
  - Parallel: yes relative to T6.1/T6.3.

- [ ] **T6.3 [S] Rewrite `src/test/normalize.test.ts` for the new shape**
  - Files: `src/test/normalize.test.ts` (own the file; only one task edits it).
  - Deps: T2.1, T5.1.
  - Instructions: replace `canonicalEnglish`/`frenchPartial`/`germanEntry` fixtures with new-shape fixtures (string `school`, string `classes`, string `damage_type`, optional `subclasses`). Cover spec §11.1: EN + DE-new conversion; mapping correctness; unknown class/school/damage rejection; duplicate class/subclass rejection; subclass syntax (valid accepted; missing separator / empty part / unknown parent-class rejected; subclass class need not appear in `classes`); stable IDs; malformed structures rejected with filename+index; `isCanonicalSourceShape` accepts new and fails legacy with the migration hint; `buildSrdArtifacts` works without snapshot options. German-adapter describe block: keep only if O1 is declined.
  - Acceptance: passes; no legacy-shape fixtures remain.
  - Parallel: no (sole owner of the file).

- [ ] **T6.4 [S] Resolve `src/test/german-conversion.test.ts` (C4/A3)**
  - Files: `src/test/german-conversion.test.ts` (and `scripts/convert-german-srd.ts`, `package.json` if A3 = remove).
  - Deps: T2.1.
  - Instructions: if A3 approved, delete the test, `scripts/convert-german-srd.ts`, and the `convert:german-srd` script; superseded by T6.1. If A3 declined, rewrite fixtures to the new shape and mark the script legacy/no-op.
  - Acceptance: `vp test` has no failing legacy-shape normalization tests.
  - Parallel: no.

### Phase 7 — Documentation (§14; never edit the refactoring spec)

- [ ] **T7.1 [P] `README.md`**
  - Sections: "Bundled data and normalization" (raw shape), "Source structure adapters" (string `school`/`classes`; shared adapter for `de`; drop the German `G`/name-mapping claim), remove "Canonical English snapshot", "Adding a translation" (new shape + `data/reference/` convention), artifact regeneration note.
  - Parallel: yes (distinct file).

- [ ] **T7.2 [P] `docs/srd-data-pipeline.md`**
  - §2.B field table (`school`, `classes[]` strings, string `damage_type`, add `subclasses`); §2.C adapter selection (new shape + legacy hint; German uses shared adapter); §2.D example; §2.E mechanics list (add subclasses); §3.A snapshot section removed; §3.B/§5 as needed; §5 comparison table.
  - Parallel: yes (distinct file).

- [ ] **T7.3 [P] `docs/specs/MAIN-spec.md`**
  - Line 27 (remove snapshot requirement); §4 data-model snippet (add optional `subclasses`); note on the reference file and the later subclass phase.
  - Parallel: yes (distinct file).

- [ ] **T7.4 [P] `docs/subclasses.md`**
  - Label as reference material for the later phase; note it spans classes beyond `CORE_CLASSES` and lists German alternatives needing reconciliation; not a restrictive enum.
  - Parallel: yes (distinct file).

- [ ] **T7.5 Document retained raw metadata** (fits within T7.2)
  - State in `docs/srd-data-pipeline.md` (and/or README) that `damage_at_slot_level`/`attack_type` are intentionally retained as raw-source metadata only, ignored by normalization.

### Phase 8 — Final verification (GATE G6)

- [ ] **T8.1 [S] Quality gates**
  - Run `vp check` (format/lint/typecheck), `vp test`, `pnpm run test:e2e` (affected specs: `offline`, `language`, `language-partial`, plus 339-spell/print specs), and `pnpm run build`.
  - Acceptance: all pass; `pnpm run build` regenerates identical datasets (`git diff --exit-code -- src/data` empty).

---

## 5. Dependency graph and parallelization

```
T0.1 -> T0.2 -> T0.3 --------------------------------------------.
                                                                  |
T1.1 -> { T1.2, T1.3, T1.4 }                                      |
        T1.2 --> T2.1 --+--> T3.1 --> T3.2                        |
                        |                                         |
T1.1 -> T6.2 (||)       |                                         |
T2.1,T5.1 -> T6.1 (||), T6.3, T6.4                                |
T3.1 -> T3.2 -> T4.1 -> T4.2 -> T4.3 -> T5.1 --------------------|
T7.1..T7.4 (||, docs) -------------------------------------------|
All -> T8.1
```

### 5.1 Safe parallel waves

- **Wave A** (after T1.1): T1.2, T1.3, T1.4 (three distinct files).
- **Wave B** (after T2.1 + T1.2): T3.1 can proceed while T6.2 runs; T3.2 depends on T3.1.
- **Wave C** (after T2.1 + T5.1): T6.1, T6.2, and T7.1–T7.4 in parallel (all distinct files); T6.3 and T6.4 must be serialized relative to any other editor of their files.
- Everything else (T4.x, T5.1, T6.3, T6.4, T8.1) is sequential.

### 5.2 File-conflict matrix (never assign the same file to two concurrent agents)

| File                                                                                      | Owner task(s)                | Conflict note                 |
| ----------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------- |
| `src/domain/spells.ts`                                                                    | T1.1                         | single writer                 |
| `src/domain/spells.test.ts`                                                               | T1.1, T6.2                   | serialize (one file)          |
| `scripts/srd/common.ts`                                                                   | T1.2                         | single writer                 |
| `scripts/srd/validate.ts`                                                                 | T1.3                         | single writer                 |
| `src/locales/labels.ts`                                                                   | T1.4                         | single writer                 |
| `scripts/srd/english.ts`, `shared-translation.ts`                                         | T2.1                         | single writer                 |
| `scripts/migrate-srd-source-format.ts`                                                    | T3.1                         | new, single writer            |
| `src/test/srd-migration.test.ts`                                                          | T3.2                         | new, single writer            |
| `scripts/normalize-srd.ts`                                                                | T5.1 (+O1 de-branch removal) | single writer                 |
| `src/test/normalize.test.ts`                                                              | T6.3 (+O1 German tests)      | single writer                 |
| `src/test/german-conversion.test.ts`, `scripts/convert-german-srd.ts`, `package.json`     | T6.4                         | single writer                 |
| `src/test/srd-dataset.test.ts`                                                            | T6.1                         | new, single writer            |
| `README.md`, `docs/srd-data-pipeline.md`, `docs/specs/MAIN-spec.md`, `docs/subclasses.md` | T7.1–T7.5                    | distinct files; parallel-safe |

**Shared integration points:** `src/domain/spells.ts` (`DAMAGE_TYPES`, `Spell.subclasses`) is the interface frozen before Wave A. `scripts/srd/common.ts` helper signatures are the interface frozen before T2.1/T3.1. Coordinate these signatures first; do not change them mid-wave.

---

## 6. Verification gates (summary)

| Gate                         | When        | Check                                                                                                       | Fail action                    |
| ---------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **G0 Baseline**              | T0.3        | unchanged pipeline normalizes to byte-identical committed datasets; discovery no longer throws              | stop; investigate drift        |
| **G1 Migration safety**      | T3–T4       | dry-run report reviewed; atomic apply; idempotent no-op; inputs never partially modified                    | abort; restore from checkpoint |
| **G2 Dataset equivalence**   | T4.3        | `git diff --exit-code -- src/data` empty after normalization                                                | blocker; do not proceed        |
| **G3 Cross-language**        | T4.3 / T6.1 | German validates vs English; subclass sets match when provided (absent passes)                              | blocker                        |
| **G4 Snapshot replacement**  | T5.1 / T6.1 | snapshot file + all references removed; `srd-dataset.test.ts` is the drift gate                             | fix before continuing          |
| **G5 Runtime/import compat** | T6.2        | optional `subclasses` round-trips; existing custom/import tests pass                                        | fix schema                     |
| **G6 Final**                 | T8.1        | `vp check`, `vp test`, `pnpm run test:e2e`, `pnpm run build` all pass; build regenerates identical datasets | blocker                        |

---

## 7. Recommended execution sequence

0. Get approvals A0–A3.
1. Phase 0: checkpoint -> relocate reference -> G0.
2. Phase 1: T1.1 -> Wave A (T1.2, T1.3, T1.4).
3. Phase 2: T2.1.
4. Phase 3: T3.1, T3.2.
5. Phase 4: dry-run -> apply -> G2.
6. Phase 5: T5.1 (remove snapshot).
7. Phase 6: T6.1, T6.2 (parallel), then T6.3, T6.4.
8. Phase 7: docs T7.1–T7.5.
9. Phase 8: G6.
10. Commit raw sources + regenerated datasets together (if authorized) so drift is reviewable.

---

## 8. Risks

| Risk                                                  | Mitigation                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Raw sources untracked → drift not reviewable (C1)     | A0 checkpoint; commit raw sources with the change                                                      |
| Snapshot removal weakens the build gate               | T6.1 regression test + committed datasets + `git diff` review; optional in-script comparison (spec §9) |
| Migration silently changes normalization              | in-tool validation vs committed datasets (T3.1) + G2 byte-equality                                     |
| Legacy adapters removed too early                     | migrate both files in one change; new adapters fail legacy with a migration hint                       |
| `extended-props` breaks the build                     | T0.2 relocation before normalization; keep discovery fail-fast                                         |
| Damage strictness rejects future types                | single documented vocabulary; intentional update when needed                                           |
| Optional cleanups entangled with mandatory tests (C4) | A3 decision resolved before Phase 2 tests                                                              |
| Subclass work drifts into UI                          | explicit scope guardrails (§2)                                                                         |
