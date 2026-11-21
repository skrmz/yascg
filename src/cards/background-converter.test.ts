// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { prepareCardBackgrounds } from "../../scripts/prepare-card-backgrounds";
import {
  BACKGROUND_JPEG_MAX_BYTES,
  BACKGROUND_SOURCE_MAX_BYTES,
  backgroundGeometry,
} from "./background-contract";

function solid(width: number, height: number, background = "#dca887") {
  return sharp({ create: { width, height, channels: 4, background } });
}

describe("card background geometry", () => {
  it.each([
    [800, 2800, 800, 1120, 0, 840],
    [1055, 1491, 900, 1260, 0, 7],
    [1400, 700, 500, 700, 450, 0],
    [400, 400, 285, 399, 57, 0],
    [789, 1134, 785, 1099, 2, 17],
    [150, 210, 150, 210, 0, 0],
  ])("centers %i × %i and outputs %i × %i", (w, h, width, height, left, top) => {
    const geometry = backgroundGeometry(w, h);
    expect(geometry).toMatchObject({ width, height, crop: { left, top } });
    expect(geometry.crop.width * 7).toBe(geometry.crop.height * 5);
    expect(Math.abs(w - geometry.crop.width - 2 * left)).toBeLessThanOrEqual(1);
    expect(Math.abs(h - geometry.crop.height - 2 * top)).toBeLessThanOrEqual(1);
    expect(geometry.crop.width).toBeGreaterThanOrEqual(width);
    expect(geometry.crop.height).toBeGreaterThanOrEqual(height);
  });
});

describe("bundled background preparation", () => {
  let inputDir: string;
  const log = vi.fn<(message: string) => void>();
  const file = (name: string) => path.join(inputDir, name);
  const run = (dryRun = false) => prepareCardBackgrounds({ inputDir, dryRun, log });

  beforeEach(async () => {
    inputDir = await mkdtemp(path.join(tmpdir(), "card-backgrounds-"));
    log.mockClear();
  });
  afterEach(async () => {
    await rm(inputDir, { recursive: true, force: true });
  });

  it.each([
    [800, 2800, 800, 1120],
    [1400, 700, 500, 700],
    [400, 400, 285, 399],
    [1200, 1600, 900, 1260],
  ])("encodes %i × %i at exactly %i × %i", async (w, h, width, height) => {
    await solid(w, h).png().toFile(file("source.png"));
    expect(await run()).toMatchObject({ converted: 1, failed: 0 });
    expect(await sharp(file("source.jpg")).metadata()).toMatchObject({ width, height });
    expect(await run()).toMatchObject({ converted: 0, skipped: 2, failed: 0 });
  });

  it("applies EXIF before extracting the center and atomically replaces a JPEG in place", async () => {
    const source = await solid(600, 250)
      .composite([{ input: await solid(300, 250, "red").png().toBuffer(), left: 0, top: 0 }])
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    await writeFile(file("rotated.jpeg"), source);
    expect(await run(true)).toMatchObject({ converted: 1, failed: 0 });
    expect(await readFile(file("rotated.jpeg"))).toEqual(source);
    expect(await run()).toMatchObject({ converted: 1, failed: 0 });
    expect(await readdir(inputDir)).toEqual(["rotated.jpeg"]);
    const result = sharp(file("rotated.jpeg"));
    expect(await result.metadata()).toMatchObject({ width: 250, height: 350, hasProfile: false });
    expect((await result.metadata()).exif).toBeUndefined();
    const pixels = await result.raw().toBuffer();
    expect(pixels[1]).toBeLessThan(10);
    expect(pixels.at(-2)).toBeGreaterThan(150);
    expect(await run()).toMatchObject({ converted: 0, skipped: 1 });
  });

  it("honors embedded profiles, strips ancillary metadata, and flattens PNG alpha onto paper", async () => {
    const reference = "#ce6438";
    const tagged = await solid(300, 420, reference)
      .withIccProfile("p3")
      .withXmp("<x:xmpmeta xmlns:x='adobe:ns:meta/'/>")
      .png()
      .toBuffer();
    expect((await sharp(tagged).metadata()).hasProfile).toBe(true);
    await writeFile(file("profile.png"), tagged);
    await solid(300, 420, "#0000").png().toFile(file("alpha.png"));
    expect(await run()).toMatchObject({ converted: 2, failed: 0 });
    for (const [name, colors] of [
      ["profile.jpg", [206, 100, 56]],
      ["alpha.jpg", [255, 253, 248]],
    ] as const) {
      const image = sharp(file(name));
      expect(await image.metadata()).toMatchObject({
        space: "srgb",
        hasAlpha: false,
        hasProfile: false,
      });
      expect((await image.metadata()).xmp).toBeUndefined();
      const pixels = await image.raw().toBuffer();
      for (const [channel, value] of colors.entries()) {
        expect(Math.abs(pixels[channel] - value)).toBeLessThanOrEqual(3);
      }
    }
  });

  it("scans content signatures, preserves a conforming JPEG byte for byte, and accepts JFIF and AVIF", async () => {
    const normal = await solid(300, 420).jpeg({ quality: 61 }).toBuffer();
    await writeFile(file("normal.jpg"), normal);
    await writeFile(file("source.jfif"), normal);
    await solid(300, 420).avif().toFile(file("supported.avif"));
    await solid(300, 420).png().toFile(file("mislabel.jpg"));
    await writeFile(file("fake.png"), Buffer.from("<svg/>"));
    await writeFile(file("truncated.jpg"), normal.subarray(0, normal.length - 40));
    expect(await run()).toMatchObject({ converted: 2, skipped: 1, failed: 3 });
    expect(await readFile(file("normal.jpg"))).toEqual(normal);
    expect(await readFile(file("source.jpg"))).toEqual(normal);
    expect(await readdir(inputDir)).not.toContain("fake.jpg");
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/mislabel.jpg: file signature/));
  });

  it("removes comments and unknown JPEG application markers even at valid dimensions", async () => {
    const normal = await solid(300, 420).jpeg().toBuffer();
    const tags = Buffer.from([0xff, 0xed, 0, 6, 1, 2, 3, 4, 0xff, 0xfe, 0, 3, 42]);
    await writeFile(
      file("tagged.jpg"),
      Buffer.concat([normal.subarray(0, 2), tags, normal.subarray(2)]),
    );
    expect(await run()).toMatchObject({ converted: 1, failed: 0 });
    expect((await readFile(file("tagged.jpg"))).includes(tags)).toBe(false);
    expect(await run()).toMatchObject({ converted: 0, skipped: 1 });
  });

  it("enforces source sizes, output bytes, and the print-resolution floor", async () => {
    await writeFile(file("oversize.jpg"), "");
    await truncate(file("oversize.jpg"), BACKGROUND_SOURCE_MAX_BYTES + 1);
    await solid(8000, 5001).png().toFile(file("pixels.png"));
    await solid(149, 210).png().toFile(file("tiny.png"));
    const large = await sharp(randomBytes(900 * 1260 * 3), {
      raw: { width: 900, height: 1260, channels: 3 },
    })
      .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
      .toBuffer();
    expect(large.length).toBeGreaterThan(BACKGROUND_JPEG_MAX_BYTES);
    await writeFile(file("large.jpg"), large);
    expect(await run()).toMatchObject({ converted: 1, failed: 3 });
    expect((await readFile(file("large.jpg"))).length).toBeLessThanOrEqual(
      BACKGROUND_JPEG_MAX_BYTES,
    );
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/oversize.jpg: source exceeds 25 MiB/));
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/pixels.png:.*(?:pixel limit|40 megapixels)/i),
    );
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/tiny.png: card crop must be at least/));
  });

  it("blocks ambiguous targets and leaves existing JPEGs and sources intact", async () => {
    await solid(300, 420).jpeg().toFile(file("paired.jpg"));
    const original = await readFile(file("paired.jpg"));
    await solid(300, 420, "red").png().toFile(file("paired.png"));
    await solid(300, 420).png().toFile(file("multi.png"));
    await solid(300, 420).webp().toFile(file("multi.webp"));
    expect(await run()).toMatchObject({ converted: 0, skipped: 1, failed: 3 });
    expect(await readFile(file("paired.jpg"))).toEqual(original);
    expect(await readdir(inputDir)).toEqual([
      "multi.png",
      "multi.webp",
      "paired.jpg",
      "paired.png",
    ]);
  });

  it("preserves the in-place source when every encoded output exceeds 1 MiB", async () => {
    const original = await solid(400, 400).jpeg().toBuffer();
    await writeFile(file("source.jpg"), original);
    const encoder: { toBuffer(): Promise<Buffer> } = sharp.prototype;
    const toBuffer = vi
      .spyOn(encoder, "toBuffer")
      .mockResolvedValue(Buffer.alloc(BACKGROUND_JPEG_MAX_BYTES + 1));
    expect(await run()).toMatchObject({ converted: 0, failed: 1 });
    expect(toBuffer).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/could not encode a JPEG within 1 MiB/));
    expect(await readFile(file("source.jpg"))).toEqual(original);
    expect(await readdir(inputDir)).toEqual(["source.jpg"]);
  });
});
