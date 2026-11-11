import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

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

export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_COMMIT__: JSON.stringify(commitFromEnvironment() ?? commitFromRepository() ?? "unknown"),
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      "data/**",
      "docs/**",
      ".kilo/**",
      "src/data/**",
      "pnpm-lock.yaml",
      "dist/**",
      "**/*.md",
    ],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  plugins: [
    react(),
    tailwindcss(),
    // The Cloudflare plugin creates extra Vite environments, which Vitest
    // cannot attach while collecting the unit test suite.
    ...(mode === "test" ? [] : [cloudflare()]),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "favicon.ico",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "YASCG - Yet Another Spell Card Generator",
        short_name: "Spell Cards",
        description: "Offline-first Dungeons & Dragons 5.5e (2024) SRD spell card generator.",
        theme_color: "#1c1917",
        background_color: "#faf9f7",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/android-chrome-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,json}"],
        globIgnores: ["**/icons.svg"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  publicDir: "src/data",
  build: {
    target: "es2023",
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
}));
