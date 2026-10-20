import { readdir } from "node:fs/promises";
import path from "node:path";

export const CANONICAL_ENGLISH_BASENAME = "5e-SRD-Spells.json";
const TRANSLATION_PATTERN = /^5e-SRD-Spells_(.+)\.json$/;

export interface DiscoveredLanguageFile {
  /** Canonical BCP 47 tag, e.g. "de" or "pt-BR". */
  tag: string;
  /** Original tag text as it appeared in the filename. */
  rawTag: string;
  /** Absolute path to the source file. */
  filePath: string;
  /** File name only, for diagnostics. */
  fileName: string;
}

export interface DiscoveredInputs {
  english: { filePath: string; fileName: string };
  languages: DiscoveredLanguageFile[];
}

export class DiscoveryError extends Error {
  constructor(
    message: string,
    readonly fileName?: string,
  ) {
    super(message);
    this.name = "DiscoveryError";
  }
}

function canonicalizeTag(rawTag: string, fileName: string): string {
  let canonical: string[];
  try {
    canonical = Intl.getCanonicalLocales(rawTag);
  } catch {
    throw new DiscoveryError(
      `Invalid BCP 47 language tag "${rawTag}" in filename "${fileName}".`,
      fileName,
    );
  }
  const tag = canonical[0];
  if (!tag || !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(tag)) {
    throw new DiscoveryError(
      `Invalid BCP 47 language tag "${rawTag}" in filename "${fileName}".`,
      fileName,
    );
  }
  return tag;
}

export async function discoverSrdInputs(dir: string): Promise<DiscoveredInputs> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new DiscoveryError(`SRD input directory not found: ${dir}`);
  }

  const jsonFiles = entries.filter((name) => name.toLowerCase().endsWith(".json"));
  const hasEnglish = jsonFiles.includes(CANONICAL_ENGLISH_BASENAME);
  if (!hasEnglish) {
    throw new DiscoveryError(
      `Missing canonical English input "${CANONICAL_ENGLISH_BASENAME}" in ${dir}.`,
    );
  }

  const languages: DiscoveredLanguageFile[] = [];
  const seenTags = new Map<string, string>();

  for (const fileName of jsonFiles.sort()) {
    if (fileName === CANONICAL_ENGLISH_BASENAME) continue;
    const match = TRANSLATION_PATTERN.exec(fileName);
    if (!match) {
      if (fileName.startsWith("5e-SRD-Spells")) {
        throw new DiscoveryError(
          `Unrecognized SRD translation filename "${fileName}". Expected "5e-SRD-Spells_<LANG>.json".`,
          fileName,
        );
      }
      continue;
    }
    const rawTag = match[1];
    const tag = canonicalizeTag(rawTag, fileName);
    if (tag === "en") {
      throw new DiscoveryError(
        `Filename "${fileName}" uses the reserved canonical English tag "en". Use "${CANONICAL_ENGLISH_BASENAME}".`,
        fileName,
      );
    }
    const existing = seenTags.get(tag.toLowerCase());
    if (existing) {
      throw new DiscoveryError(
        `Duplicate language tag "${tag}" (case-insensitive) in "${fileName}" and "${existing}".`,
        fileName,
      );
    }
    seenTags.set(tag.toLowerCase(), fileName);
    languages.push({
      tag,
      rawTag,
      filePath: path.join(dir, fileName),
      fileName,
    });
  }

  languages.sort((a, b) => a.tag.localeCompare(b.tag));

  return {
    english: {
      filePath: path.join(dir, CANONICAL_ENGLISH_BASENAME),
      fileName: CANONICAL_ENGLISH_BASENAME,
    },
    languages,
  };
}

export function displayNameForTag(tag: string): string {
  try {
    const displayNames = new Intl.DisplayNames([tag], { type: "language" });
    const name = displayNames.of(tag);
    if (name && name !== tag) return name;
  } catch {
    // fall through to code fallback
  }
  return tag;
}
