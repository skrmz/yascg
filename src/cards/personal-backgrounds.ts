import { newUuid } from "@/domain/ids";

export interface PersonalBackground {
  id: string;
  name: string;
  image: Blob;
}

export const PERSONAL_BACKGROUND_ID = /^personal-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const BACKGROUND_NAME_MAX = 200;
export const BACKGROUND_JPEG_MAX_BYTES = 1024 * 1024;
const MIN_WIDTH = 150;
const MAX_WIDTH = 900;
const MAX_HEIGHT = 1260;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 40_000_000;

export class BackgroundImageError extends Error {
  constructor(readonly reason: "unsupported" | "corrupt" | "unsuitable") {
    super(reason);
  }
}

export async function preparePersonalBackground(file: File): Promise<PersonalBackground> {
  if (file.size > MAX_SOURCE_BYTES) throw new BackgroundImageError("unsuitable");
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const format = String.fromCharCode(...header);
  if (
    !(header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) &&
    !format.startsWith("\u0089PNG\r\n\u001a\n") &&
    !(format.startsWith("RIFF") && format.slice(8) === "WEBP")
  ) {
    throw new BackgroundImageError(
      /\.(jpe?g|png|webp)$/i.test(file.name) || /^image\/(jpeg|png|webp)$/.test(file.type)
        ? "corrupt"
        : "unsupported",
    );
  }
  let source: ImageBitmap;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new BackgroundImageError("corrupt");
  }

  try {
    // Whole 5:7 units preserve the exact aspect ratio without enlarging the crop.
    const units = Math.floor(Math.min(source.width / 5, source.height / 7, MAX_WIDTH / 5));
    const width = units * 5;
    const height = units * 7;
    if (width < MIN_WIDTH || source.width * source.height > MAX_SOURCE_PIXELS) {
      throw new BackgroundImageError("unsuitable");
    }
    const cropWidth = Math.min(source.width, (source.height * 5) / 7);
    const cropHeight = (cropWidth * 7) / 5;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new BackgroundImageError("unsuitable");
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      source,
      (source.width - cropWidth) / 2,
      (source.height - cropHeight) / 2,
      cropWidth,
      cropHeight,
      0,
      0,
      width,
      height,
    );
    for (const quality of [0.92, 0.85, 0.75, 0.65]) {
      const image = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (image?.type === "image/jpeg" && image.size <= BACKGROUND_JPEG_MAX_BYTES) {
        return {
          id: `personal-${newUuid()}`,
          name: file.name.trim().slice(0, BACKGROUND_NAME_MAX).trim() || "Image",
          image,
        };
      }
    }
    throw new BackgroundImageError("unsuitable");
  } finally {
    source.close();
  }
}

export async function decodeBackgroundJpeg(base64: string): Promise<Blob> {
  const binary = atob(base64);
  if (btoa(binary) !== base64) throw new BackgroundImageError("corrupt");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (
    bytes.length > BACKGROUND_JPEG_MAX_BYTES ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  ) {
    throw new BackgroundImageError("corrupt");
  }
  const { width, height } = jpegDimensions(bytes);
  if (width < MIN_WIDTH || width > MAX_WIDTH || height > MAX_HEIGHT || width * 7 !== height * 5) {
    throw new BackgroundImageError("unsuitable");
  }
  const image = new Blob([bytes], { type: "image/jpeg" });
  const bitmap = await createImageBitmap(image, { imageOrientation: "from-image" });
  try {
    if (bitmap.width !== width || bitmap.height !== height)
      throw new BackgroundImageError("corrupt");
  } finally {
    bitmap.close();
  }
  return image;
}

// Check frame dimensions before handing the JPEG to the browser decoder.
function jpegDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[++offset];
    if (marker === 0xff) continue;
    offset += 1;
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ((marker === 0xc0 || marker === 0xc1 || marker === 0xc2) && length >= 8) {
      return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
    }
    offset += length;
  }
  throw new BackgroundImageError("corrupt");
}

export function backgroundDataUrl(image: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Image data URL was unavailable"));
    };
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(new DOMException("Image read aborted", "AbortError"));
    reader.readAsDataURL(image);
  });
}
