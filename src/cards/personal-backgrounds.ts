import { newUuid } from "@/domain/ids";
import {
  BACKGROUND_JPEG_MAX_BYTES,
  BACKGROUND_MIN_WIDTH,
  BACKGROUND_PAPER_COLOR,
  BACKGROUND_SOURCE_MAX_BYTES,
  BACKGROUND_SOURCE_MAX_PIXELS,
  backgroundGeometry,
  backgroundSourceFormat,
  isBackgroundSize,
} from "./background-contract";
export { BACKGROUND_JPEG_MAX_BYTES } from "./background-contract";

export interface PersonalBackground {
  id: string;
  name: string;
  image: Blob;
}

export const PERSONAL_BACKGROUND_ID = /^personal-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const BACKGROUND_NAME_MAX = 200;

export class BackgroundImageError extends Error {
  constructor(readonly reason: "unsupported" | "corrupt" | "unsuitable" | "outputTooLarge") {
    super(reason);
  }
}

export async function preparePersonalBackground(file: File): Promise<PersonalBackground> {
  if (file.size > BACKGROUND_SOURCE_MAX_BYTES) throw new BackgroundImageError("unsuitable");
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const format = backgroundSourceFormat(header);
  if (!format) {
    throw new BackgroundImageError(
      /\.(jpe?g|jfif|png|webp)$/i.test(file.name) || /^image\/(jpeg|png|webp)$/.test(file.type)
        ? "corrupt"
        : "unsupported",
    );
  }
  let source: ImageBitmap;
  try {
    source = await createImageBitmap(file.slice(0, file.size, `image/${format}`), {
      imageOrientation: "from-image",
      colorSpaceConversion: "default",
    });
  } catch {
    throw new BackgroundImageError("corrupt");
  }

  try {
    const { crop, width, height } = backgroundGeometry(source.width, source.height);
    if (
      width < BACKGROUND_MIN_WIDTH ||
      source.width * source.height > BACKGROUND_SOURCE_MAX_PIXELS
    ) {
      throw new BackgroundImageError("unsuitable");
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false, colorSpace: "srgb" });
    if (!ctx) throw new BackgroundImageError("unsuitable");
    ctx.fillStyle = BACKGROUND_PAPER_COLOR;
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, crop.left, crop.top, crop.width, crop.height, 0, 0, width, height);
    let exceedsOutputLimit = false;
    for (const quality of [0.92, 0.85, 0.75, 0.65]) {
      const image = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (image?.type !== "image/jpeg") continue;
      if (image.size > BACKGROUND_JPEG_MAX_BYTES) {
        exceedsOutputLimit = true;
        continue;
      }
      return {
        id: `personal-${newUuid()}`,
        name: file.name.trim().slice(0, BACKGROUND_NAME_MAX).trim() || "Image",
        image,
      };
    }
    throw new BackgroundImageError(exceedsOutputLimit ? "outputTooLarge" : "corrupt");
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
  if (!isBackgroundSize(width, height)) {
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
