import { exportDateStamp } from "@/io/export.ts";

const INVALID_FILENAME_CHARS = new Set('<>:"/\\|?*');

function sanitizeFilename(value: string): string {
  let sanitized = "";
  for (const char of value) {
    const invalid = char.charCodeAt(0) < 0x20 || INVALID_FILENAME_CHARS.has(char);
    sanitized += invalid ? " " : char;
  }
  return sanitized;
}

export function printDocumentTitle(deckName: string | undefined, date: Date = new Date()): string {
  const cleaned = sanitizeFilename(deckName ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "");

  return cleaned || `spell-cards-deck-${exportDateStamp(date)}`;
}
