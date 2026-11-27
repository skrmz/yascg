## Shared agent rules

Before repository work, read and follow these rules unless already loaded:

- `.kilo/rules/communication.md`
- `.kilo/rules/engineering-behavior.md`
- `.kilo/rules/windows-powershell.md`

If a required rule file is unavailable, report it before proceeding.
Project-specific rules take precedence over shared rules; more specific rules apply within their scope.

Do not read, search, index, or modify `docs/archive/` or its contents.
Exclude it from recursive operations and delegated tasks without exception.

## Execution and resource efficiency

Minimize context, reasoning, tool calls, and execution overhead without compromising correctness, security, explicit requirements, or mandatory verification.

### Context and implementation

- Read only task-relevant files and documentation. Prefer targeted searches and bounded reads.
- Reuse established findings, loaded instructions, project conventions, and existing implementations unless invalidated.
- Exclude dependencies, generated artifacts, caches, and unrelated files unless directly relevant. 
- Match investigation and planning depth to complexity and risk. Prefer straightforward, maintainable solutions.
- Stay within scope; avoid speculative improvements and unrelated changes.
- Use subagents or parallel execution only when their expected benefit outweighs coordination and context costs.

### Verification and debugging

- Run targeted checks during implementation and complete all applicable verification gates before completion.
- Reuse successful results unless invalidated by changes.
- Investigate failures by root cause; rerun affected checks first and expand coverage when justified.
- Do not repeat unsuccessful attempts without new evidence. Reassess stalled investigations and report unresolved blockers.
- Never weaken tests, acceptance criteria, or required verification to reduce resource consumption.

### Output and continuity

- Keep plans, progress updates, and summaries concise.
- Bound command output while preserving exit codes, result counts, and access to failure diagnostics.
- Inspect large logs, reports, and diffs selectively.
- Generate evidence only when needed.
- Avoid unnecessary polling or restarting active commands.
- Maintain concise checkpoints for long-running tasks. Reuse existing checkpoint documents.
- On resumption, verify relevant state and assumptions without repeating still-valid completed work.
- Honor explicit stop instructions immediately. When approaching resource limits, preserve work and record outstanding items before stopping.

## Project-specific toolchain guidance

All project-specific instructions in this file, including execution efficiency, dependency installation, and verification requirements, take precedence over the generic Vite+ guidance below:

- Use `pnpm run <script>` for package scripts, `pnpm exec vp run <task>` for Vite tasks, and `pnpm exec vp <command>` for built-in Vite+ commands.
- Use existing project scripts for TypeScript execution; do not assume `vp` or `vpx` is globally available or that `vpx` is installed locally.
- Install dependencies with `pnpm install` only when missing, changed, or inconsistent.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at [https://viteplus.dev/guide/](https://viteplus.dev/guide/).

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

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
- Run `pnpm run check` and `pnpm run test` after completing relevant code changes or at the designated validation gate.
- Run normalization when changes affect data processing or generated data.
- Run affected E2E tests when changes affect application behavior.
- Run broader regression suites when required by the verification matrix, acceptance criteria, or change impact.
- Report failed, skipped, or unavailable verification checks and their reasons.
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
- Maintain offline-first behavior, safe Markdown rendering, and accessible UI interactions.
- Preserve licensing notices and attribution requirements.
- When adding, significantly changing, or removing a major user-facing feature, review the
  About section in both `src/locales/de.ts` and `src/locales/en.ts` alongside the relevant
  project documentation. Update the About section whenever the change affects the application's
  key capabilities or value proposition. Do not add minor features merely for completeness, and
  remove or revise descriptions of capabilities that are no longer available.

## Documentation ownership

Keep one authoritative location for each change-prone fact; link elsewhere instead of copying
whole sections.

| Change                                                                                                                 | Authoritative location                                | Keep elsewhere to a link/summary                                      |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| User-visible behavior, invariants, edge cases, acceptance                                                              | `docs/specs/MAIN-spec.md`                             | README user help, DEVELOPMENT implementation notes                    |
| Product overview, features, quick start, usage, printing settings, backup guidance, attribution                        | `README.md`                                           | MAIN-spec may state the requirement                                   |
| Commands, module map, implementation details, debugging, tests                                                         | `docs/DEVELOPMENT.md`                                 | README quick start only                                               |
| Raw SRD shape, normalization, translations, generated artifacts, migrations, subclass reconciliation, drift protection | `docs/srd-data-pipeline.md`                           | DEVELOPMENT integration note only                                     |
| Short-description release artifact contract, snapshot refresh, validation and import                                   | `docs/short-descriptions-import.md`                   | MAIN-spec requirements; DEVELOPMENT integration note                  |
| Cloudflare config, Workers Builds, deploy operations, `compatibility_date`                                             | `docs/cloudflare-deployment-guide.md`                 | MAIN-spec stable hosting constraints; DEVELOPMENT integration gotchas |
| Custom-spell JSON format, examples, collisions, SRD override import/export                                             | `docs/custom-spell-import-guide.md`                   | MAIN-spec semantics                                                   |
| Official 2024 subclass catalog                                                                                         | `docs/subclasses.md`                                  | Link from pipeline/spec                                               |
| Privacy Policy text (German authoritative, English translation)                                                        | `docs/privacy-policy.de.md`, `docs/privacy-policy.md` | In-app dialog, README link                                            |
| Privacy/storage/network audit, font licensing, Impressum assessment, Cloudflare checklist                              | `docs/privacy-and-legal.md`                           | README link, DEVELOPMENT summary                                      |
| Project-specific agent workflow, review checklist, documentation policy                                                | `AGENTS.md`                                           | —                                                                     |

Do not duplicate command tables, package scripts, payload schemas, or full deployment
procedures across documents. Update relative links and anchors when headings move.

Keep directly affected documentation synchronized with code and configuration changes. Use the documentation ownership table to identify authoritative sources. Do not review or update unrelated documentation solely because repository changes were made.

Apply the corresponding verification requirements whenever documentation work also changes code or configuration.

## Task-specific documentation

Consult documentation from the ownership table only when relevant to the current task. 