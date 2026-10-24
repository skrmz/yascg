import type { ActiveDeck, DeckEntry, SavedDeck } from "@/domain/deck";
import type { Spell, SrdSpellOverride } from "@/domain/spells";
import {
  DECK_TYPE,
  EXPORT_VERSION,
  CUSTOM_SPELLS_TYPE,
  CUSTOM_SPELL_EXPORT_VERSION,
  deckEntryToExport,
  type DeckExportPayload,
  type CustomSpellExportPayloadV2,
  type SrdSpellOverrideExport,
} from "@/domain/payloads";

export function exportDateStamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function customSpellsExportFilename(date: Date = new Date()): string {
  return `spell-card-generator-custom-spells-${exportDateStamp(date)}.json`;
}

export function deckExportFilename(date: Date = new Date()): string {
  return `spell-deck-${exportDateStamp(date)}.json`;
}

export function buildCustomSpellsPayload(
  spells: readonly Spell[],
  overrides: readonly SrdSpellOverride[] = [],
): CustomSpellExportPayloadV2 {
  const custom = spells
    .filter((spell) => spell.source === "Custom")
    .slice()
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      return byName !== 0 ? byName : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  const exportedOverrides: SrdSpellOverrideExport[] = overrides
    .slice()
    .sort((a, b) => {
      if (a.spellId !== b.spellId) return a.spellId < b.spellId ? -1 : 1;
      return a.locale < b.locale ? -1 : a.locale > b.locale ? 1 : 0;
    })
    .map((override) => ({
      spellId: override.spellId,
      locale: override.locale,
      ...(override.verbalDescription ? { verbalDescription: override.verbalDescription } : {}),
      ...(override.somaticDescription ? { somaticDescription: override.somaticDescription } : {}),
    }));
  return {
    version: CUSTOM_SPELL_EXPORT_VERSION,
    type: CUSTOM_SPELLS_TYPE,
    spells: custom,
    srdSpellOverrides: exportedOverrides,
  };
}

export function buildDeckPayload(deck: {
  name: string;
  entries: readonly DeckEntry[];
}): DeckExportPayload {
  return {
    version: EXPORT_VERSION,
    type: DECK_TYPE,
    name: deck.name,
    exportedAt: Date.now(),
    entries: deck.entries.map(deckEntryToExport),
  };
}

export function exportSavedDeckSnapshot(deck: SavedDeck): DeckExportPayload {
  return buildDeckPayload({ name: deck.name, entries: deck.entries });
}

export function activeDeckToSnapshot(deck: ActiveDeck): { name: string; entries: DeckEntry[] } {
  return { name: deck.name, entries: deck.entries };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
