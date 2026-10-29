# Mini-guide: React + Vite + pnpm → Cloudflare Workers

Cloudflare now recommends **Workers** (Pages is the legacy workflow, still selectable via "Continue to Pages"). Workers has two shapes: a static SPA, or an SPA plus an API Worker.

> **This repository** implements variant **A** (static React SPA, no API Worker) with `@cloudflare/vite-plugin` and Wrangler. The plugin is registered as `cloudflare()` (no separate Worker entry) and is skipped in Vitest `test` mode. Sections B and C describe optional application variants that are **not** configured here. Sections D and G document the Cloudflare Workers Builds configuration and GitHub integration used by this project. Section E describes the legacy Pages workflow.
>
> The repository-specific integration notes (Vitest exclusion and local `workerd` preview) are in [DEVELOPMENT.md](DEVELOPMENT.md#cloudflare-vite-plugin-integration). The README keeps only a one-sentence hosting summary; this guide owns the operational details.

## A. Static React SPA (this repository)

This repository is the asset-only static-SPA variant. The production Worker has no `main` entry and serves the client build plus the SPA fallback. Use the values below rather than the generic example when reconfiguring or recreating the project.

### A.1 Repository values

| Setting | Value |
| -------------------- | ----------------------------------------------------------------------------------- |
| Worker name | `yascg` (`wrangler.jsonc` → `name`) |
| Compatibility date | `2026-10-26`; never newer than the installed `workerd` support date |
| Cloudflare config | `wrangler.jsonc` at the repository root; do not set `assets.directory` |
| Build | `pnpm run build` (`normalize:srd` then `vp build`) |
| Local preview | `pnpm run preview` (`vp preview`, local Workers runtime) |
| Deploy (local) | `pnpm run deploy` (build, then `wrangler deploy`) |
| Deploy (CI) | `pnpm exec wrangler deploy` after the separate build step |
| Package manager | `pnpm@12.11.2`, pinned exactly in `package.json` |
| Runtime | Node.js 24.11+ or 26 LTS |
| Vite plugin | `cloudflare()` after the React and Tailwind plugins |

### A.2 Configuration

1. The Worker is asset-only. `wrangler.jsonc` is:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "yascg",
  "compatibility_date": "2026-10-26",
  "assets": {
    "not_found_handling": "single-page-application",
  },
}
```

Do **not** set `assets.directory` — the Cloudflare Vite plugin fills it from the client build. `not_found_handling` gives client-side routing its SPA fallback. `compatibility_date` is a calendar date, not a version: move it forward deliberately after updating Wrangler and re-running preview/E2E, never automatically on every deploy. A date newer than the installed `workerd` support date makes local preview and E2E fail.

2. Register the plugin in `vite.config.ts` with no `viteEnvironment` option for the static variant:

```ts
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === "test" ? [] : [cloudflare()]),
  ],
}));
```

The plugin is omitted in Vitest `test` mode because Vitest cannot attach a server to the extra Vite environments it creates. `vp dev` and `vp preview` otherwise run in the local `workerd` runtime.

3. Build and deploy scripts in `package.json`:

```json
"dev": "vp dev",
"build": "pnpm run normalize:srd && vp build",
"preview": "vp preview",
"deploy": "pnpm run build && wrangler deploy"
```

`pnpm run deploy` builds and deploys in one step locally. Workers Builds runs the build command and deploy command as two separate steps, so the deploy command there must not rebuild.

4. Keep the pnpm build-script allowlist in `pnpm-workspace.yaml` so CI installs do not fail with `ERR_PNPM_IGNORED_BUILDS`:

```yaml
allowBuilds:
  esbuild: true
  workerd: true
```

Other dependencies with lifecycle scripts may also need approval — run `pnpm approve-builds` and commit the updated `pnpm-workspace.yaml` with `pnpm-lock.yaml`. The exact `packageManager` pin in `package.json` is required because the Workers Builds image ships an older pnpm.

5. `.gitignore` must keep the generated outputs out of Git:

```gitignore
dist
.wrangler
.dev.vars*
```

6. Verify and deploy:

```powershell
pnpm run build
pnpm exec wrangler deploy --dry-run
pnpm run preview
pnpm run test:e2e
pnpm run deploy
```

`pnpm run build` emits the client build, the generated `dist/wrangler.json`, and `.assetsignore` to `dist/`, plus `.wrangler/deploy/config.json` so `wrangler deploy` from the repository root uses the build output. Never edit `dist/` or `.wrangler/`; both are generated and Git-ignored.

**Local preview vs. Cloudflare Worker Preview**

- `pnpm run preview` (`vp preview`) runs the built app through the Cloudflare Vite plugin in local `workerd`, so routing, headers, and asset serving match production. It does not create a Cloudflare Preview URL.
- `pnpm exec wrangler preview` creates or updates a deployed Cloudflare Worker Preview for the current branch.
- Cloudflare Workers Builds uses `npx wrangler preview` for non-production branches when preview builds are enabled.

## B. Adding an API Worker

First set up TypeScript for the Worker code so `ExportedHandler` resolves (otherwise `pnpm run build` fails at `tsc`):

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

| Field           | Value                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Worker name     | `yascg` (must match `wrangler.jsonc` → `name`)                                                                               |
| Build command   | `pnpm run build`                                                                                                            |
| Deploy command  | `pnpm exec wrangler deploy` (`npx wrangler deploy` is the documented default; any package manager works)                    |
| Preview command | `pnpm exec wrangler preview` (enable preview builds in branch settings first)                                                |
| Root directory  | `/`                                                                                                                         |
| Node version    | set `NODE_VERSION` to `24` or `26` if the image default is older than 24.11; the repo supports Node.js 24.11+ or 26 LTS     |
| pnpm version    | image default may be older — the exact `packageManager` pin in `package.json` (`pnpm@12.11.2`) supplies the project version |
| Production branch | `main`                                                                                                                     |
| Build watch paths | `*`                                                                                                                       |
| Enable preview builds | Optional; required for per-branch preview deployments                                                                 |
| Cloudflare Access | Disabled for a public app                                                                                                 |
| API token       | leave empty — auto-generated                                                                                                |

## E. Legacy Pages variant

If you specifically need Pages: connect via "Continue to Pages", build `pnpm run build`, output `dist`, leave deploy command empty, and add `public/_redirects` with `/* /index.html 200` for SPA routing.

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
7. Configure the application using the authoritative settings in
   [D. Dashboard (Workers Builds)](#d-dashboard-workers-builds). In particular: project name
   `yascg`, build `pnpm run build`, deploy `pnpm exec wrangler deploy`, preview
   `pnpm exec wrangler preview`, production branch `main`, and root directory `/`.
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
