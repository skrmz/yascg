import type { DeckEntry } from "@/domain/deck";
import type { Spell } from "@/domain/spells";

export interface ResolutionContext {
  /** Selected-language SRD spells keyed by canonical ID. */
  languageSpellsById: ReadonlyMap<string, Spell>;
  /** Canonical English SRD spells keyed by ID (used to detect missing translations). */
  englishSpellsById: ReadonlyMap<string, Spell>;
  /** Custom spells keyed by ID. */
  customSpellsById: ReadonlyMap<string, Spell>;
}

export type EntryResolution =
  | { status: "resolved"; spell: Spell }
  | { status: "translation-unavailable"; referenceName: string }
  | { status: "missing"; referenceName: string };

export function resolveEntry(entry: DeckEntry, context: ResolutionContext): EntryResolution {
  const byId =
    entry.reference.source === "Custom" ? context.customSpellsById : context.languageSpellsById;
  const spell = byId.get(entry.spellId);
  if (spell) return { status: "resolved", spell };
  if (entry.reference.source === "SRD-5.2.1" && context.englishSpellsById.has(entry.spellId)) {
    return { status: "translation-unavailable", referenceName: entry.reference.name };
  }
  return { status: "missing", referenceName: entry.reference.name };
}

export interface OmissionCounts {
  translationUnavailable: number;
  missing: number;
}

export function countOmissions(
  entries: readonly DeckEntry[],
  context: ResolutionContext,
): OmissionCounts {
  let translationUnavailable = 0;
  let missing = 0;
  for (const entry of entries) {
    const resolution = resolveEntry(entry, context);
    if (resolution.status === "translation-unavailable") translationUnavailable += 1;
    else if (resolution.status === "missing") missing += 1;
  }
  return { translationUnavailable, missing };
}

export interface LanguageSwitchImpact {
  affectedEntries: number;
  affectedDistinctSpellIds: number;
}

/** Computes the entries that would become translation-unavailable in a target language. */
export function computeLanguageSwitchImpact(
  entries: readonly DeckEntry[],
  targetLanguageSpellsById: ReadonlyMap<string, Spell>,
): LanguageSwitchImpact {
  const distinct = new Set<string>();
  let affectedEntries = 0;
  for (const entry of entries) {
    if (entry.reference.source === "Custom") continue;
    if (targetLanguageSpellsById.has(entry.spellId)) continue;
    affectedEntries += 1;
    distinct.add(entry.spellId);
  }
  return { affectedEntries, affectedDistinctSpellIds: distinct.size };
}
