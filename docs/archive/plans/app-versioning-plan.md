# App Versioning Plan 

## Goal

Bake the `package.json` SemVer version and build commit into the client build, display both in the About dialog, and document the release/tagging workflow. Pushing ordinary commits must not change the application version.

## Decisions

- `package.json` remains the **only version source** (currently `1.1.0`).
- The project uses **pnpm 12.11.2**. Use `pnpm version` with `--no-git-tag-version`; no pnpm compatibility fallback is needed.
- Use Vite `define` globals: `__APP_VERSION__` and `__APP_COMMIT__`.
- Commit resolution order:
  1. `WORKERS_CI_COMMIT_SHA` (Cloudflare Workers Builds)
  2. `CF_PAGES_COMMIT_SHA` (Cloudflare Pages)
  3. `GITHUB_SHA` (GitHub Actions)
  4. `CI_COMMIT_SHA` (other CI)
  5. `git rev-parse HEAD` (local/normal checkout)
  6. `"unknown"` (missing metadata never fails the build)
- Display the first **seven** characters of any resolved commit SHA, including the Git fallback.
- `Version` and `Commit` labels remain unlocalized, per the product decision; do not add locale keys.
- No release automation: normal `git push` does not edit `package.json` or create tags.
- **Deployment and release are separate:** pushing to the configured Cloudflare Workers Builds production branch triggers deployment; pushing a Git tag does **not** by itself trigger a production deployment. A Git tag/GitHub Release identifies a deliberate application release.
- Release tags are **annotated** (`git tag -a`).

## Tasks

### 1. `vite.config.ts`

Add imports and module-scope helpers:

```ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface PackageJson {
  version: string;
}

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as PackageJson;

function commitFromEnvironment(): string | undefined {
  for (const name of [
    "WORKERS_CI_COMMIT_SHA",
    "CF_PAGES_COMMIT_SHA",
    "GITHUB_SHA",
    "CI_COMMIT_SHA",
  ]) {
    const value = process.env[name]?.trim();
    if (value) return value.slice(0, 7);
  }
  return undefined;
}

function commitFromRepository(): string | undefined {
  try {
    const value = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return value ? value.slice(0, 7) : undefined;
  } catch {
    return undefined;
  }
}
```

Add to the config object returned by `defineConfig`, before `staged`:

```ts
define: {
  __APP_VERSION__: JSON.stringify(packageJson.version),
  __APP_COMMIT__: JSON.stringify(
    commitFromEnvironment() ?? commitFromRepository() ?? "unknown",
  ),
},
```

Keep the existing function-form config, plugins, `test`, `resolve`, and `build` sections unchanged. Vite's top-level `define` applies to the test transforms too; **do not add a separate `test.define` fallback**.

### 2. `src/vite-env.d.ts`

Append after the existing references:

```ts
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
```

### 3. `src/components/AboutDialog.tsx`

Add a definition list after the description paragraph:

```tsx
<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
  <dt className="font-medium text-foreground">Version</dt>
  <dd>{__APP_VERSION__}</dd>
  <dt className="font-medium text-foreground">Commit</dt>
  <dd>
    <code>{__APP_COMMIT__}</code>
  </dd>
</dl>
```

Keep the attribution and local-data paragraphs. Do not add locale keys.

### 4. New test: `src/components/AboutDialog.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import "@/i18n.ts";
import { AboutDialog } from "./AboutDialog.tsx";

describe("AboutDialog build metadata", () => {
  it("shows the build version and commit", () => {
    render(<AboutDialog open onOpenChange={() => {}} />);
    expect(screen.getByText("Version")).not.toBeNull();
    expect(screen.getByText(__APP_VERSION__)).not.toBeNull();
    expect(screen.getByText("Commit")).not.toBeNull();
    expect(screen.getByText(__APP_COMMIT__)).not.toBeNull();
  });
});
```

If the test unexpectedly fails due to an undefined build constant, investigate configuration loading/transformation rather than duplicating values in `test.define` or stubbing globals.

### 5. `docs/DEVELOPMENT.md`

Add a `### Version and build metadata` subsection after the Toolchain command table. Document:

- `package.json` is the sole application version source. Follow SemVer and use matching `vX.Y.Z` annotated Git tags and GitHub Releases for explicit releases.
- `vite.config.ts` injects `__APP_VERSION__` and `__APP_COMMIT__` at build time; `AboutDialog` displays them. Values are not runtime-editable or localized.
- The commit resolution priority: Workers Builds (`WORKERS_CI_COMMIT_SHA`), Pages (`CF_PAGES_COMMIT_SHA`), GitHub Actions (`GITHUB_SHA`), other CI (`CI_COMMIT_SHA`), local Git (`git rev-parse HEAD`), then `unknown`. The display uses seven characters; missing metadata never fails a build.
- A normal commit/push does not bump the application version. Multiple deployments can legitimately show the same SemVer version with different commits.
- The deployment trigger is a push to the configured Cloudflare **production branch** (assumed `main` in the commands below; substitute the actual branch if different). A pushed tag does not automatically deploy that tagged commit.
- `pnpm version ... --no-git-tag-version` changes the version without automatically creating a Git commit or tag. pnpm 12.11.2 is the project's version; no alternative workflow is required. Do not set a permanent `gitTagVersion: false` unless explicitly desired.

**Release workflow (example: bump from `1.1.0` to `1.2.0`):**

1. From a clean, up-to-date release branch, run the appropriate SemVer bump:

   ```bash
   pnpm version minor --no-git-tag-version
   ```

   Use `patch` or `major` instead when appropriate. Replace `1.2.0` in subsequent commands with the actual version.

2. Validate the resulting release candidate:

   ```bash
   pnpm run check
   pnpm run test
   pnpm run build
   ```

3. Commit the version change, including the lockfile **if modified**:

   ```bash
   git add package.json
   git add pnpm-lock.yaml # only if it was modified
   git commit -m "chore(release): v1.2.0"
   ```

4. Create an **annotated** tag on the release commit and push both the production branch and the tag:

   ```bash
   git tag -a v1.2.0 -m "Release v1.2.0"
   git push origin main
   git push origin v1.2.0
   ```

   These explicit push commands work for the tag created above. `git push --follow-tags` is an optional alternative for pushing annotated tags reachable from the pushed commits, but it does not push lightweight tags; do not substitute a lightweight `git tag v1.2.0` with `--follow-tags`.

5. Verify that Cloudflare Workers Builds successfully deployed the **release commit** from the production-branch push. Then create/publish the GitHub Release for `v1.2.0` with release notes. The tag serves as a release reference; it is not a separate Cloudflare deployment trigger.

**Note:** If the repository uses a protected production branch and pull requests, apply the release bump through the normal merge process, then create the annotated tag on the actual merged commit that Cloudflare deployed. Do not tag a pre-merge commit if the merge changes its SHA.

### 6. Validation

- `pnpm run check` — passes.
- `pnpm run test` — **all tests pass**, including the new About dialog test. Do not preserve the obsolete note about six pre-existing failures.
- `pnpm run build` — passes.
- Confirm that the built client bundle contains the intended package version and resolved commit.
- Optionally inspect the About dialog with `pnpm run preview` to verify the visual layout.
- On a deployed release, verify that the About dialog's commit matches the commit Cloudflare built; allow for the PWA update/reload lifecycle.

## Commit message

```text
feat(app): show build version and commit in About

Bake the package.json version and the build commit into Vite as
__APP_VERSION__ and __APP_COMMIT__. Resolve CI commit hashes from Workers
Builds, Pages, GitHub Actions, or other CI before falling back to Git, and
show both values in the About dialog. Document the release and tagging
workflow.
```

## Risks and notes

- Workers Builds normally supplies `WORKERS_CI_COMMIT_SHA`. If the variable is unavailable, the other environment variables, local Git, and finally `unknown` keep the build working. `unknown` is preferable to failing deployment for missing display-only metadata.
- A seven-character commit prefix is suitable for user-facing build identification but is not a guaranteed globally unique identifier.
- PWA caching may keep displaying the previous build's About values until the updated service worker/app shell is activated and the application reloads.
- The application version describes a deliberate SemVer release state, **not every individual deployment**; routine deployments change the commit while retaining the version.
