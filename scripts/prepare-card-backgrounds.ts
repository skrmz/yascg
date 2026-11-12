import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Normalizes card-background source images for the build-time glob in
 * `src/cards/backgrounds.ts`. Non-JPEG sources are converted to a sibling
 * `<stem>.jpg` and left in place; the app glob only matches `jpg`/`jpeg`, so
 * the original is ignored. Default mode applies changes; `--dry-run` reports
 * without writing.
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_INPUT_DIR = path.join("src", "assets", "images", "card-backgrounds");
const INPUT_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const TARGET_WIDTH = 900;
const TARGET_HEIGHT = 1260;
const TARGET_ASPECT = TARGET_WIDTH / TARGET_HEIGHT;
const ASPECT_TOLERANCE = 0.02;
const MAX_LONGEST_EDGE = 1600;
const MAX_BYTES = 1024 * 1024;
const JPEG_QUALITIES = [82, 76, 70] as const;
const FLATTEN_COLOR = "#fffdf8";

export interface PrepareOptions {
  inputDir: string;
  dryRun: boolean;
  log?: (message: string) => void;
}

export interface PrepareResult {
  scanned: number;
  converted: number;
  skipped: number;
  failed: number;
}

interface Dimensions {
  width: number;
  height: number;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function isJpeg(fileName: string): boolean {
  const extension = path.extname(fileName).toLowerCase();
  return extension === ".jpg" || extension === ".jpeg";
}

function orientedDimensions(
  width: number | undefined,
  height: number | undefined,
  orientation: number | undefined,
): Dimensions | null {
  if (!width || !height) return null;
  const swap = orientation !== undefined && [5, 6, 7, 8].includes(orientation);
  return swap ? { width: height, height: width } : { width, height };
}

async function encodeJpeg(source: string): Promise<Buffer> {
  let buffer = Buffer.alloc(0);
  for (const quality of JPEG_QUALITIES) {
    buffer = await sharp(source)
      .rotate()
      .flatten({ background: FLATTEN_COLOR })
      .resize({
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        fit: "cover",
        position: "centre",
        withoutEnlargement: true,
      })
      .toColourspace("srgb")
      .jpeg({ quality, mozjpeg: true, progressive: true })
      .toBuffer();
    if (buffer.length <= MAX_BYTES) break;
  }
  return buffer;
}

export async function prepareCardBackgrounds(options: PrepareOptions): Promise<PrepareResult> {
  const log = options.log ?? (() => undefined);
  const entries = await readdir(options.inputDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => INPUT_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));

  const result: PrepareResult = {
    scanned: files.length,
    converted: 0,
    skipped: 0,
    failed: 0,
  };

  for (const name of files) {
    const source = path.join(options.inputDir, name);
    const output = path.join(options.inputDir, `${path.basename(name, path.extname(name))}.jpg`);
    try {
      const size = (await stat(source)).size;
      const metadata = await sharp(source).metadata();
      const dimensions = orientedDimensions(metadata.width, metadata.height, metadata.orientation);
      if (!dimensions) throw new Error("could not determine image dimensions");

      const aspect = dimensions.width / dimensions.height;
      const aspectMatches = Math.abs(aspect - TARGET_ASPECT) / TARGET_ASPECT <= ASPECT_TOLERANCE;
      const longestEdge = Math.max(dimensions.width, dimensions.height);

      if (isJpeg(name) && aspectMatches && longestEdge <= MAX_LONGEST_EDGE && size <= MAX_BYTES) {
        result.skipped += 1;
        log(`skip    ${name} (already normalized)`);
        continue;
      }

      const reasons: string[] = [];
      if (!isJpeg(name)) reasons.push(`convert ${path.extname(name).toLowerCase()} to jpeg`);
      if (!aspectMatches) reasons.push(`crop ${aspect.toFixed(3)} to ${TARGET_ASPECT.toFixed(3)}`);
      if (longestEdge > MAX_LONGEST_EDGE) {
        reasons.push(`longest edge ${longestEdge}px > ${MAX_LONGEST_EDGE}px`);
      }
      if (size > MAX_BYTES) reasons.push(`${formatBytes(size)} > 1 MiB`);

      const buffer = await encodeJpeg(source);
      log(
        `${options.dryRun ? "plan" : "write"} ${name} -> ${path.basename(output)} (${reasons.join(", ")}; ${formatBytes(buffer.length)})`,
      );
      if (buffer.length > MAX_BYTES) {
        log(`warn    ${name}: encoded size ${formatBytes(buffer.length)} exceeds 1 MiB`);
      }
      if (!options.dryRun) await writeFile(output, buffer);
      result.converted += 1;
    } catch (error) {
      result.failed += 1;
      log(`error   ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

function parseArgs(argv: string[]): { inputDir: string; dryRun: boolean } {
  let inputDir = DEFAULT_INPUT_DIR;
  let dryRun = false;
  for (let position = 0; position < argv.length; position += 1) {
    const arg = argv[position];
    if (arg === "--") {
      continue;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--input-dir") {
      const value = argv[position + 1];
      if (!value) throw new Error('missing value for "--input-dir"');
      inputDir = value;
      position += 1;
    } else {
      throw new Error(`unknown option "${arg}"`);
    }
  }
  return { inputDir, dryRun };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await prepareCardBackgrounds({
    inputDir: path.resolve(rootDir, options.inputDir),
    dryRun: options.dryRun,
    log: (message) => console.log(message),
  });
  const mode = options.dryRun ? "dry-run" : "applied";
  console.log(
    `card backgrounds ${mode}: ${result.converted} converted, ${result.skipped} skipped, ${result.failed} failed (${result.scanned} scanned).`,
  );
  if (result.failed > 0) process.exitCode = 1;
}

const isDirectRun =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error("backgrounds:prepare failed:", error);
    process.exitCode = 1;
  });
}
