import type { Spell } from "../../src/domain/spells.ts";
import { normalizeEnglish } from "./english.ts";

/**
 * Generic translation adapter for translation sources that follow the canonical
 * upstream 5e-bits structure (canonical `index`, `school.index`, `classes[].index`,
 * V/S/M component letters and canonical damage identifiers).
 *
 * Language-independent mechanics are normalized to canonical English values and
 * identifiers while translated free-text fields are preserved. Languages whose
 * source structure differs require an explicit adapter.
 */
export function normalizeSharedTranslation(raw: unknown, fileName: string): Spell[] {
  return normalizeEnglish(raw, fileName);
}
