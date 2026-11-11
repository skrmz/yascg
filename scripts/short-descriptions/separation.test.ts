import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

/**
 * Security boundary: the app bundle must never reference authoring credentials
 * or import the authoring modules. These checks read source files only; they
 * need no credentials and perform no network calls.
 */

const root = path.resolve(process.cwd());
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".css"]);
const FORBIDDEN = [
  "OPENROUTER_API_KEY",
  "VITE_OPENROUTER",
  "short-descriptions/openrouter",
  "short-descriptions/config",
  "short-descriptions/generate",
  "short-descriptions/smoke",
];

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry))) files.push(full);
  }
  return files;
}

describe("authoring/app separation", () => {
  const files = [
    ...walk(path.join(root, "src")),
    path.join(root, "index.html"),
    path.join(root, "vite.config.ts"),
  ];

  it("never references credentials or authoring modules in app sources", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const needle of FORBIDDEN) {
        if (text.includes(needle)) {
          offenders.push(`${path.relative(root, file)} contains "${needle}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not ship key-shaped strings", () => {
    const offenders = files.filter((file) =>
      /sk-or-[A-Za-z0-9_-]{8,}/.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((file) => path.relative(root, file))).toEqual([]);
  });
});
