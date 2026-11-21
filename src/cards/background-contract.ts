export const BACKGROUND_WIDTH_UNIT = 5;
export const BACKGROUND_HEIGHT_UNIT = 7;
export const BACKGROUND_MIN_WIDTH = 150;
export const BACKGROUND_MAX_WIDTH = 900;
export const BACKGROUND_MAX_HEIGHT =
  (BACKGROUND_MAX_WIDTH / BACKGROUND_WIDTH_UNIT) * BACKGROUND_HEIGHT_UNIT;
export const BACKGROUND_JPEG_MAX_BYTES = 1024 * 1024;
export const BACKGROUND_SOURCE_MAX_BYTES = 25 * 1024 * 1024;
export const BACKGROUND_SOURCE_MAX_PIXELS = 40_000_000;
export const BACKGROUND_PAPER_COLOR = "#fffdf8";

export function backgroundGeometry(sourceWidth: number, sourceHeight: number) {
  const units = Math.floor(
    Math.min(sourceWidth / BACKGROUND_WIDTH_UNIT, sourceHeight / BACKGROUND_HEIGHT_UNIT),
  );
  const cropWidth = units * BACKGROUND_WIDTH_UNIT;
  const cropHeight = units * BACKGROUND_HEIGHT_UNIT;
  return {
    // Round toward the top/left when an odd margin cannot be split evenly.
    crop: {
      left: Math.floor((sourceWidth - cropWidth) / 2),
      top: Math.floor((sourceHeight - cropHeight) / 2),
      width: cropWidth,
      height: cropHeight,
    },
    width: Math.min(cropWidth, BACKGROUND_MAX_WIDTH),
    height: Math.min(cropHeight, BACKGROUND_MAX_HEIGHT),
  };
}

export function isBackgroundSize(width: number, height: number) {
  return (
    width >= BACKGROUND_MIN_WIDTH &&
    width <= BACKGROUND_MAX_WIDTH &&
    height <= BACKGROUND_MAX_HEIGHT &&
    width * BACKGROUND_HEIGHT_UNIT === height * BACKGROUND_WIDTH_UNIT
  );
}

export function backgroundSourceFormat(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  const header = String.fromCharCode(...bytes.subarray(0, 12));
  if (header.startsWith("\u0089PNG\r\n\u001a\n")) return "png";
  if (header.startsWith("RIFF") && header.slice(8) === "WEBP") return "webp";
  return null;
}
