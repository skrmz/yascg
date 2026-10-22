import type { Spell } from "../../src/domain/spells.ts";
import { normalizeEnglish } from "./english.ts";

/**
 * Generic translation adapter for translation sources that follow the canonical
 * raw source structure (canonical `index`, string `school` holding a canonical
 * English school name, `classes` as canonical English class-name strings, V/S/M
 * component letters, a canonical damage-type slug and optional `subclasses`).
 *
 * Language-independent mechanics are normalized to canonical English values and
 * identifiers while translated free-text fields are preserved.
 */
export function normalizeSharedTranslation(raw: unknown, fileName: string): Spell[] {
  return normalizeEnglish(raw, fileName);
}
