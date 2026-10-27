# Mini-guide: React + Vite + pnpm → Cloudflare Workers

Cloudflare now recommends **Workers** (Pages is the legacy workflow, still selectable via "Continue to Pages"). Workers has two shapes: a static SPA, or an SPA plus an API Worker.

> **This repository** implements variant **A** (static React SPA, no API Worker) with
> `@cloudflare/vite-plugin` and Wrangler. The plugin is registered as `cloudflare()` (no
> separate Worker entry) and is skipped in Vitest `test` mode. The committed
> `wrangler.jsonc`, build/deploy scripts, and verification steps are documented in
> [DEVELOPMENT.md](DEVELOPMENT.md#cloudflare-workers-deployment). Sections B–D describe
> optional variants and are **not** configured here; section C (SSR) does not apply to this
> project.

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

For a purely static/asset-only Worker with no `main` entry (as in this repository), use
`cloudflare()` without the `viteEnvironment` option. If tests share this config, omit the
plugin in Vitest's `test` mode: Vitest cannot attach servers to the extra Vite environments
the plugin creates.

3. `wrangler.jsonc` (root):

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-app",
  "compatibility_date": "2026-10-27",
  "assets": { "not_found_handling": "single-page-application" }
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
| Project name                   | `yascg` (must match `wrangler.jsonc` → `name`)          |
| Build command                  | `pnpm run build`                                        |
| Deploy command                 | `npx wrangler deploy`                                   |
| Preview command                | `npx wrangler preview`                                  |
| Production branch              | `main` (or your actual production branch)               |
| Root directory                 | `/` (if the app is at the repository root)              |
| Enable preview builds          | Enabled                                                 |
| Protect with Cloudflare Access | Disabled for a public app                               |
| API token                      | Leave the automatically generated/default configuration |

8. Click **Save and Deploy**.
9. Check the build logs for successful installation, compilation and deployment.
10. Open the generated `*.workers.dev` URL and verify that the application works, including client-side routes.

### Subsequent deployments

Push changes to the configured production branch on GitHub. Cloudflare automatically builds and deploys the updated application.

Push changes to another branch to create a preview deployment, provided preview builds are enabled.

### Notes

- Cloudflare's default build, deploy and preview commands are suitable for a React + Vite application using the Cloudflare Vite plugin.
- The project name must match `wrangler.jsonc`.
- Commit `pnpm-lock.yaml` and pin the pnpm version in `package.json`.
- A manually created API token is normally unnecessary for Cloudflare-managed Git deployments. Build tokens authorize deployments and can be configured when custom access is needed.
- Cloudflare Access is optional and should be enabled when the application must be restricted to authorized users.
- Never put secrets into public `VITE_*` environment variables.

### Official documentation

- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Build branches and previews](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Build image and pnpm versions](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
