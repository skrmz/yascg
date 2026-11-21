import { randomUUID } from "node:crypto";
import { link, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  BACKGROUND_JPEG_MAX_BYTES,
  BACKGROUND_MIN_WIDTH,
  BACKGROUND_PAPER_COLOR,
  BACKGROUND_SOURCE_MAX_BYTES,
  BACKGROUND_SOURCE_MAX_PIXELS,
  backgroundGeometry,
  backgroundSourceFormat,
  isBackgroundSize,
} from "../src/cards/background-contract";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_INPUT_DIR = path.join("src", "assets", "images", "card-backgrounds");
const INPUT_FORMATS: Readonly<Record<string, string>> = {
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".jfif": "jpeg",
  ".png": "png",
  ".webp": "webp",
  ".avif": "avif",
};
const JPEG_QUALITIES = [82, 76, 70] as const;

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

function jpegFileName(name: string): boolean {
  return /^\.jpe?g$/i.test(path.extname(name));
}

// Check application markers throughout the stream, including between progressive
// scans. Only the basic JFIF and Adobe decoding markers are needed for our JPEGs.
function hasOnlyJpegDecodingMarkers(bytes: Buffer): boolean {
  let offset = 2;
  let inScan = false;
  while (offset < bytes.length) {
    if (inScan) offset = bytes.indexOf(0xff, offset);
    if (offset < 0 || bytes[offset++] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (inScan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    if (marker === 0xd9) return offset === bytes.length;
    if (offset + 2 > bytes.length) return false;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return false;
    if (marker >= 0xe0 && marker <= 0xef) {
      const id = bytes.toString("ascii", offset + 2, offset + 7);
      if (
        !(marker === 0xe0 && length === 16 && id === "JFIF\0") &&
        !(marker === 0xee && length === 14 && id === "Adobe")
      )
        return false;
    }
    if (marker === 0xfe) return false;
    offset += length;
    inScan = marker === 0xda;
  }
  return false;
}

async function writeJpeg(output: string, bytes: Buffer, inPlace: boolean) {
  const temporary = path.join(path.dirname(output), `.background-${randomUUID()}.tmp`);
  const file = await open(temporary, "wx");
  try {
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    if (inPlace) await rename(temporary, output);
    // Publishing via a link fails if another file has claimed the target.
    else await link(temporary, output);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  if (!inPlace) await unlink(temporary);
}

async function encodeJpeg(
  input: ReturnType<typeof sharp>,
  { crop, width, height }: ReturnType<typeof backgroundGeometry>,
): Promise<Buffer> {
  const pixels = input
    .autoOrient()
    .extract(crop)
    .flatten({ background: BACKGROUND_PAPER_COLOR })
    .resize({ width, height, fit: "fill" })
    .toColourspace("srgb");
  for (const quality of JPEG_QUALITIES) {
    const buffer = await pixels
      .clone()
      .jpeg({ quality, mozjpeg: true, progressive: true })
      .toBuffer();
    if (buffer.length <= BACKGROUND_JPEG_MAX_BYTES) return buffer;
  }
  throw new Error("could not encode a JPEG within 1 MiB");
}

export async function prepareCardBackgrounds(options: PrepareOptions): Promise<PrepareResult> {
  const log = options.log ?? (() => undefined);
  const entries = await readdir(options.inputDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && INPUT_FORMATS[path.extname(entry.name).toLowerCase()])
    .map((entry) => {
      const { name, ext } = path.parse(entry.name);
      const inPlace = jpegFileName(entry.name);
      return {
        name: entry.name,
        expectedFormat: INPUT_FORMATS[ext.toLowerCase()],
        outputName: inPlace ? entry.name : `${name}.jpg`,
        inPlace,
      };
    })
    .sort(
      (left, right) =>
        Number(right.inPlace) - Number(left.inPlace) ||
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );

  const destinations = new Map<string, string[]>();
  for (const { outputName, name } of files) {
    if (name === outputName) continue;
    const key = outputName.toLowerCase();
    const sources = destinations.get(key) ?? [];
    sources.push(name);
    destinations.set(key, sources);
  }
  const occupied = new Map(entries.map((entry) => [entry.name.toLowerCase(), entry]));

  const result: PrepareResult = { scanned: files.length, converted: 0, skipped: 0, failed: 0 };
  for (const { name, expectedFormat, outputName, inPlace } of files) {
    const source = path.join(options.inputDir, name);
    const output = path.join(options.inputDir, outputName);
    const key = outputName.toLowerCase();
    try {
      const size = (await stat(source)).size;
      if (size > BACKGROUND_SOURCE_MAX_BYTES) throw new Error("source exceeds 25 MiB");
      const bytes = await readFile(source);
      if (bytes.length > BACKGROUND_SOURCE_MAX_BYTES) throw new Error("source exceeds 25 MiB");

      const format = backgroundSourceFormat(bytes);
      const avifContainer = bytes.toString("ascii", 4, 8) === "ftyp";
      if (format !== expectedFormat && !(expectedFormat === "avif" && avifContainer)) {
        throw new Error(`file signature does not match ${path.extname(name)}`);
      }

      const input = sharp(bytes, {
        limitInputPixels: BACKGROUND_SOURCE_MAX_PIXELS,
        failOn: "warning",
      });
      const metadata = await input.metadata();
      if (
        !(
          metadata.format === format ||
          (expectedFormat === "avif" &&
            metadata.format === "heif" &&
            metadata.compression === "av1")
        )
      ) {
        throw new Error("decoded image does not match the expected format");
      }
      const { width, height } = metadata.autoOrient;
      if (width * height > BACKGROUND_SOURCE_MAX_PIXELS)
        throw new Error("source exceeds 40 megapixels");
      const geometry = backgroundGeometry(width, height);
      if (geometry.width < BACKGROUND_MIN_WIDTH) {
        throw new Error("card crop must be at least 150 × 210 pixels (60 dpi at print size)");
      }

      const reasons: string[] = [];
      if (format !== "jpeg") reasons.push("convert to JPEG");
      if (!isBackgroundSize(width, height))
        reasons.push(`resize ${width}×${height} to ${geometry.width}×${geometry.height}`);
      if (metadata.orientation !== undefined && metadata.orientation !== 1)
        reasons.push("apply EXIF orientation");
      if (metadata.space !== "srgb") reasons.push("convert to sRGB");
      if (format === "jpeg" && !hasOnlyJpegDecodingMarkers(bytes))
        reasons.push("normalize JPEG metadata");
      if (bytes.length > BACKGROUND_JPEG_MAX_BYTES) reasons.push("enforce 1 MiB output limit");

      if (reasons.length === 0 && inPlace) {
        // Metadata parsing alone can accept damaged JPEG pixel data.
        await input.stats();
        result.skipped++;
        log(`skip    ${name} (already normalized)`);
        continue;
      }

      if (inPlace && destinations.has(key)) {
        throw new Error(
          `needs normalization (${reasons.join(", ")}); output is also claimed by ${destinations.get(key)!.join(", ")}`,
        );
      }

      const buffer = reasons.length === 0 ? bytes : await encodeJpeg(input, geometry);
      if (reasons.length === 0) await input.stats();
      if (!inPlace) {
        const claims = destinations.get(key)!;
        if (claims.length > 1)
          throw new Error(`output collision for ${outputName}: ${claims.join(", ")}`);
        const existing = occupied.get(key);
        if (existing) {
          if (
            existing.isFile() &&
            existing.name === outputName &&
            (await stat(output)).size === buffer.length &&
            buffer.equals(await readFile(output))
          ) {
            result.skipped++;
            log(`skip    ${name} (identical ${outputName} already exists)`);
            continue;
          }
          throw new Error(`output collision: ${existing.name} already exists`);
        }
      }
      if (!options.dryRun) await writeJpeg(output, buffer, inPlace);
      result.converted++;
      log(
        `${options.dryRun ? "plan   " : "write  "} ${name} -> ${outputName} (${reasons.join(", ") || "copy JPEG without recompression"}; ${(buffer.length / 1024).toFixed(0)} KiB)`,
      );
    } catch (error) {
      result.failed++;
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
