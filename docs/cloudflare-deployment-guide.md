# Mini-guide: React + Vite + pnpm → Cloudflare Workers

Cloudflare now recommends **Workers** (Pages is the legacy workflow, still selectable via "Continue to Pages"). Workers has two shapes: a static SPA, or an SPA plus an API Worker.

> **This repository** implements variant **A** (static React SPA, no API Worker) with `@cloudflare/vite-plugin` and Wrangler. The plugin is registered as `cloudflare()` (no separate Worker entry) and is skipped in Vitest `test` mode. The committed `wrangler.jsonc`, build/deploy scripts, and verification steps are documented in [DEVELOPMENT.md](DEVELOPMENT.md#cloudflare-workers-deployment). Sections B and C describe optional application variants that are **not** configured here. Sections D and G document the Cloudflare Workers Builds configuration and GitHub integration used by this project. Section E describes the legacy Pages workflow.

## A. Static React SPA

1. Install the adapter:

```powershell
pnpm add -D @cloudflare/vite-plugin wrangler
```

2. `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), cloudflare({ viteEnvironment: { name: 'worker' } })],
});
```

For a purely static/asset-only Worker with no `main` entry (as in this repository), use `cloudflare()` without the `viteEnvironment` option. If tests share this config, omit the plugin in Vitest's `test` mode: Vitest cannot attach servers to the extra Vite environments the plugin creates.

3. `wrangler.jsonc` (root):

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-app",
  "compatibility_date": "2026-10-27",
  "assets": { "not_found_handling": "single-page-application" },
  "previews": {}
}
```

Do **not** set `assets.directory` — with the Vite plugin it is filled from the client build automatically. `not_found_handling` is what gives client-side routing its SPA fallback.

`compatibility_date` is a calendar date, not a version: set it to today's date when onboarding and move it forward deliberately after testing — never bump it automatically on every deploy. It must not be newer than the newest date supported by the installed `workerd` binary; otherwise local preview and E2E fail even though production may accept the date.

4. Scripts in `package.json` — keep the usual dev/build entries (use `tsc -b && vite build` if your TS setup builds through tsc):

```json
"dev": "vite",
"build": "vite build",
"preview": "vite preview",
"deploy": "vite build && wrangler deploy",
"cf-typegen": "wrangler types"
```

`deploy` builds and deploys in one step locally; Workers Builds runs its build command and deploy command as two separate steps instead.

**Local preview vs. Cloudflare Worker Preview**

- `pnpm preview` executes `vite preview`, serving the locally built application for inspection.
- `pnpm exec wrangler preview` creates or updates a deployed Cloudflare Worker Preview for the current branch.
- Cloudflare Workers Builds uses `npx wrangler preview` for non-production branches when preview builds are enabled.

The Vite preview command does not create a Cloudflare Preview URL.

5. pnpm build-script allowlist (`pnpm-workspace.yaml`) so CI installs don't fail with `ERR_PNPM_IGNORED_BUILDS` (pnpm 11+ enables `strictDepBuilds` by default, failing installs on unreviewed build scripts):

```yaml
allowBuilds:
  esbuild: true
  workerd: true
```

Other dependencies with lifecycle scripts may also need approval — run `pnpm approve-builds` to review them (approvals are written to `allowBuilds`), and commit `pnpm-workspace.yaml` together with `pnpm-lock.yaml`. The Workers Builds image ships pnpm 10.11.1 by default, which predates `allowBuilds`: pin the pnpm version you use (11+) with an exact `packageManager` entry in `package.json`, e.g. `"packageManager": "pnpm@12.15.0"` — no ranges.

6. `.gitignore` (a stock Vite template already ignores `dist` — keep that entry if it exists):

```gitignore
dist
.wrangler
.dev.vars*
```

7. Verify and deploy:

```powershell
pnpm build
pnpm exec wrangler deploy --dry-run
pnpm preview
pnpm exec wrangler deploy
```

## B. Adding an API Worker

First set up TypeScript for the Worker code so `ExportedHandler` resolves (otherwise `pnpm build` fails at `tsc`):

```powershell
pnpm add -D @cloudflare/workers-types
```

```jsonc
// tsconfig.worker.json — extends the Node tsconfig, referenced from the root tsconfig.json
{
  "extends": "./tsconfig.node.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.worker.tsbuildinfo",
    "types": ["@cloudflare/workers-types/2023-07-01", "vite/client"]
  },
  "include": ["worker"]
}
```

```jsonc
// tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.worker.json" }
  ]
}
```

Then add `main` and route API paths to it:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-app",
  "compatibility_date": "2026-10-27",
  "main": "./worker/index.ts",
  "upload_source_maps": true,
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  }
}
```

```ts
// worker/index.ts
export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return Response.json({ ok: true });
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler;
```

## C. SSR frameworks (not used by this project)

Configuration is framework-specific — don't mix entry points between frameworks.

- Use `cloudflare({ viteEnvironment: { name: 'ssr' } })`.
- TanStack Start: add `"main": "@tanstack/react-start/server-entry"` (the default), or `"src/server.ts"` as a custom entry that re-exports it (run `pnpm cf-typegen` first so Workers types exist), plus `"compatibility_flags": ["nodejs_compat"]` and `"observability": { "enabled": true }`.
- Other frameworks differ — e.g. React Router (framework mode) uses its own `workers/app.ts` entry and generates `main: build/server/index.js`, and SPA mode/prerendering are not supported there with the Cloudflare Vite plugin. Follow each framework's own guide (links in the appendix).
- The `wrangler.json` emitted with the build output is generated by `vite build` (a snapshot of your input config, pointing at the artifacts); `wrangler deploy` and preview use it — don't edit it by hand.

### D. Dashboard (Workers Builds)

| Field           | Value                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Worker name     | must match `wrangler.jsonc` `name`                                                                                                       |
| Build command   | `pnpm build`                                                                                                                             |
| Deploy command  | `pnpm exec wrangler deploy` (`npx wrangler deploy` is the documented default; any package manager works)                                 |
| Preview command | `pnpm exec wrangler preview` (enable preview builds in branch settings first)                                                            |
| Root directory  | `/`                                                                                                                                      |
| Node version    | default 24.22.1 (Node 22 also preinstalled) satisfies Vite 8 (Node ≥20.19/≥22.12) — only set `NODE_VERSION` if you need a specific minor |
| pnpm version    | image default is pnpm 10.11.1 — pin yours via `packageManager` in `package.json` (exact version)                                         |
| API token       | leave empty — auto-generated                                                                                                             |

## E. Legacy Pages variant

If you specifically need Pages: connect via "Continue to Pages", build `pnpm build`, output `dist`, leave deploy command empty, and add `public/_redirects` with `/* /index.html 200` for SPA routing.

## F. Official Cloudflare deployment documentation

- [Deploy React + Vite to Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/?utm_source=chatgpt.com)
- [Deploy an existing project with automatic configuration](https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/?utm_source=chatgpt.com)
- [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/?utm_source=chatgpt.com)
- [Build image (Workers Builds tool versions & overrides)](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)
- [React Router guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)

## G. Cloudflare Dashboard — Workers Builds

1. Create an account at [Cloudflare](https://dash.cloudflare.com/) or sign in.
2. Navigate to **Compute → Workers & Pages**.
3. Click **Create application**.
4. Select **GitHub**.
5. Authenticate with GitHub and authorize Cloudflare to access your repository.
6. Select the repository containing your application.
7. Configure the application:

| Setting                        | Value                                                   |
| ------------------------------ | ------------------------------------------------------- |
| Project name                   | `my-app` (must match `wrangler.jsonc` → `name`)         |
| Build command                  | `pnpm run build`                                        |
| Deploy command                 | `npx wrangler deploy`                                   |
| Preview command                | `npx wrangler preview`                                  |
| Production branch              | `main` (or your actual production branch)               |
| Root directory                 | `/` (if the app is at the repository root)              |
| Build watch paths (include)    | `*` (watch repository paths for changes)                |
| Enable preview builds          | Enabled                                                 |
| Protect with Cloudflare Access | Disabled for a public app                               |
| API token                      | Leave the automatically generated/default configuration |

8. Click **Save and Deploy**.
9. Check the build logs for successful installation, compilation and deployment.
10. Open the generated `*.workers.dev` URL and verify that the application works, including client-side routes.

### GitHub integration and CI/CD lifecycle

Cloudflare Workers Builds provides built-in CI/CD through the Cloudflare GitHub App. GitHub Actions is not required for automatic deployment.

The GitHub App is managed at https://github.com/settings/installations under **Cloudflare Workers and Pages**.

The integration:
- Detects commits pushed to connected repositories.
- Triggers Cloudflare builds for eligible branches and paths.
- Reports build and deployment statuses to GitHub as check runs.
- Supports production and preview deployments.
- Supports pull-request preview workflows.
  - Posts build-status comments on GitHub pull requests.
  - Includes Preview URLs in pull-request comments when preview builds use `wrangler preview`.
  - Updates the branch Preview URL on subsequent pushes and provides a unique Deployment URL for each deployment.

**Deployment lifecycle:**

1. A developer pushes a commit to GitHub.
2. Cloudflare detects the change through the GitHub integration.
3. Cloudflare installs dependencies and executes the configured build command (`pnpm run build`).
4. If the build succeeds, Cloudflare executes the appropriate deployment command:
   - Production branch (`main`): `npx wrangler deploy`.
   - Preview branches: `npx wrangler preview`, if preview builds are enabled.
5. Cloudflare publishes the deployment and reports the outcome to GitHub.

A failed build or deployment does not replace the existing successful production deployment.

The connected GitHub repository, branch settings, build logs, and deployment status can be inspected in the Cloudflare dashboard.

### Subsequent deployments

**Production deployment (`main`):**

Every eligible push to `main` triggers a production build and deployment. This includes commits introduced by merging a pull request.

**Preview deployment (feature branches):**

Pushing to a non-production branch triggers a preview build when preview builds are enabled and branch filters permit it. Preview deployments provide isolated URLs for testing without replacing the production Worker.

**Pull-request workflow:**

1. Create a feature branch (for example, `feature/login`).
2. Push changes to GitHub.
3. Cloudflare builds and deploys a preview, if enabled.
4. Open a pull request targeting `main`.
5. Review changes, build checks, and the preview deployment.
6. Merge the pull request after validation.
7. Cloudflare automatically deploys the resulting commit on `main` to production.

**Recommended GitHub protection:**

Configure GitHub branch protection or rulesets for `main`:
- Require pull requests before merging.
- Require successful CI checks before merging.
- Optionally require code review approval.

These protections must be configured in GitHub; connecting Cloudflare does not enable them automatically.

### CI validation versus deployment

Cloudflare Workers Builds automates builds and deployments, but it does not automatically execute unit tests, linting, or other validation steps unless explicitly configured.

For example, the build command:

```bash
pnpm run build
```

executes only the `build` script defined in `package.json`.

If the project defines `lint` and `test` scripts, the build command can be extended:

```bash
pnpm run lint && pnpm run test && pnpm run build
```

The deployment then proceeds only if all three commands succeed.

Alternatively, GitHub Actions can execute linting, unit tests, type checks, and other quality gates independently of Cloudflare Builds.

**Recommended separation:**
- GitHub Actions (optional): CI validation and quality checks.
- Cloudflare Workers Builds: build artifacts, preview deployments, and production deployment.
- GitHub branch protection: prevent merging changes that fail required checks.

Important: Successful builds do not necessarily indicate that automated tests have passed.

**Important distinction:**

GitHub Actions and Cloudflare Workers Builds operate independently unless explicitly coordinated.

A failed GitHub Actions workflow does not automatically stop a Cloudflare production deployment triggered by a direct push to `main`.

To prevent unvalidated code from reaching production:

1. Protect the `main` branch against direct pushes.
2. Require pull requests.
3. Require the relevant GitHub Actions checks to pass before merging. 
4. Let Cloudflare deploy the resulting commit after merging into `main`.

### Notes

- Cloudflare's default build, deploy and preview commands are suitable for a React + Vite application using the Cloudflare Vite plugin.
- The project name must match `wrangler.jsonc`.
- Commit `pnpm-lock.yaml` and pin the pnpm version in `package.json`.
- A manually created API token is normally unnecessary for Cloudflare-managed Git deployments. Build tokens authorize deployments and can be configured when custom access is needed.
- Cloudflare Access is optional and should be enabled when the application must be restricted to authorized users.
- Never put secrets into public `VITE_*` environment variables.

### Preview environment safety

Preview deployments must not be assumed to have fully isolated resources.

Worker Previews requires Wrangler 4.135.0 or later. Ensure the project's local Wrangler dependency meets this requirement.

Preview configuration uses separate variables, secrets, and bindings from production. Configure these under the Worker's Preview settings and the corresponding previews configuration in wrangler.jsonc where applicable.

Before enabling preview builds, verify:
- Environment variables and secrets required by previews.
- Database, KV, R2, and other resource bindings.
- External API credentials and endpoints.
- Whether preview deployments could modify production data.

Use separate preview resources and credentials where appropriate. Avoid exposing production secrets or connecting untrusted preview code to production databases.

Preview URLs should not be treated as private merely because they are not the production URL.

### Official documentation

- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Build branches and previews](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Build image and pnpm versions](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
