<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Project-specific guidance

- Follow existing project conventions and architecture.
- Preserve stable SRD spell IDs, canonical mechanics, and translation consistency.
- Never manually edit generated SRD datasets or bypass normalization validation.
- Raw sources in `data/srd/` use the canonical source shape (string `school`, `classes`
  name strings, `V`/`S`/`M` components, string `damage.damage_type`, optional
  `subclasses`). Do not hand-edit them into another shape: migrate legacy 5e-bits files
  with `pnpm exec tsx scripts/migrate-srd-source-format.ts --apply`. Populate `subclasses`
  only through `scripts/migrate-srd-subclasses.ts`; the committed reconciliation report
  lives at `data/reference/subclass-reconciliation.json`. Non-dataset reference material
  belongs in `data/reference/`, never in `data/srd/`.
- Preserve licensing notices and attribution requirements.
- Maintain offline-first behavior, safe Markdown rendering, and accessible UI interactions.
- Keep localization presentation-only: add UI terminology to `src/locales/en.ts` and
  `src/locales/de.ts` (via `satisfies Translations`), never edit generated datasets or
  canonical enums for translation. The UI locale follows the spell data language.
- Run `vp check` and `vp test` after relevant changes.
- Run normalization and affected E2E tests when changing data processing or application behavior.
- Keep the app deployable as a static Cloudflare Worker: `wrangler.jsonc` is the input
  configuration, production is assets-only with the SPA fallback, and no server API,
  backend runtime, or secrets may be introduced. Do not set `assets.directory`; the
  Cloudflare Vite plugin fills it from the build output. `pnpm run build` emits the
  generated `dist/wrangler.json` consumed by `wrangler deploy`; never edit `dist/` or
  `.wrangler/`.
- Preserve the Cloudflare Vite plugin's exclusion in Vitest `test` mode, the `workerd`
  build allowlist, and the exact `packageManager` pin. `compatibility_date` must not exceed
  the installed `workerd` support date; move it forward deliberately and re-run
  `pnpm run preview`/E2E instead of bumping it on every deploy.
- Verify deployment changes with `pnpm run build`,
  `pnpm exec wrangler deploy --dry-run`, and `pnpm run preview` (E2E runs against this
  Workers-runtime preview).

## Documentation ownership

Keep one authoritative location for each change-prone fact; link elsewhere instead of copying
whole sections.

| Change | Authoritative location | Keep elsewhere to a link/summary |
| --- | --- | --- |
| User-visible behavior, invariants, edge cases, acceptance | `docs/specs/MAIN-spec.md` | README user help, DEVELOPMENT implementation notes |
| Product overview, features, quick start, usage, printing settings, backup guidance, attribution | `README.md` | MAIN-spec may state the requirement |
| Commands, module map, implementation details, debugging, tests | `docs/DEVELOPMENT.md` | README quick start only |
| Raw SRD shape, normalization, translations, generated artifacts, migrations, subclass reconciliation, drift protection | `docs/srd-data-pipeline.md` | DEVELOPMENT integration note only |
| Cloudflare config, Workers Builds, deploy operations, `compatibility_date` | `docs/cloudflare-deployment-guide.md` | MAIN-spec stable hosting constraints; DEVELOPMENT integration gotchas |
| Custom-spell JSON format, examples, collisions, SRD override import/export | `docs/custom-spell-import-guide.md` | MAIN-spec §8 semantics |
| Official 2024 subclass catalog | `docs/subclasses.md` | Link from pipeline/spec |
| Agent workflow, review checklist, documentation policy | `AGENTS.md` | — |

Do not duplicate command tables, package scripts, payload schemas, or full deployment
procedures across documents. Update relative links and anchors when headings move. If a
documentation change requires a config or code change, separate it and run `pnpm run check`,
`pnpm run test`, and the relevant build/E2E checks.

## Task-specific documentation

Consult these files only when relevant to the task:

- `README.md` — product overview, quick start, user usage, printing settings, backup, and licensing.
- `docs/DEVELOPMENT.md` — toolchain, architecture, deck persistence implementation, localization internals, printing/offline implementation, and testing.
- `docs/cloudflare-deployment-guide.md` — Workers Static Assets setup, Workers Builds dashboard settings, and framework-specific notes.
- `docs/srd-data-pipeline.md` — raw SRD source shape, normalization, translations, and the legacy-format migration workflow.
- `docs/specs/MAIN-spec.md` — current product behavior contract and verification matrix.
- `docs/custom-spell-import-guide.md` — custom-spell JSON format and import behavior.
- `docs/subclasses.md` — official subclass catalog.
- `scripts/normalize-srd.ts` — SRD normalization implementation.