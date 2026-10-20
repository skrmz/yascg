import { describe, expect, it } from "vite-plus/test";
import {
  computeLanguageSwitchImpact,
  countOmissions,
  resolveEntry,
} from "@/services/data/resolution.ts";
import { makeCustomSpell, makeSpell } from "@/test/fixtures/spells.ts";
import type { DeckEntry } from "@/domain/deck";

const english = new Map([
  [
    makeSpell({ id: "srd-fireball", name: "Fireball" }).id,
    makeSpell({ id: "srd-fireball", name: "Fireball" }),
  ],
]);
const german = new Map([
  [
    makeSpell({ id: "srd-fireball", name: "Feuerball" }).id,
    makeSpell({ id: "srd-fireball", name: "Feuerball" }),
  ],
]);
const emptyTranslation = new Map<string, ReturnType<typeof makeSpell>>();
const custom = new Map([
  [makeCustomSpell({ id: "custom-1" }).id, makeCustomSpell({ id: "custom-1" })],
]);

function entry(overrides: Partial<DeckEntry> = {}): DeckEntry {
  return {
    entryId: "e1",
    spellId: "srd-fireball",
    fitMode: "auto-shrink",
    reference: { source: "SRD-5.2.1", name: "Fireball" },
    ...overrides,
  };
}

describe("deck reference resolution", () => {
  it("resolves a spell present in the selected language", () => {
    const resolution = resolveEntry(entry(), {
      languageSpellsById: german,
      englishSpellsById: english,
      customSpellsById: custom,
    });
    expect(resolution.status).toBe("resolved");
  });

  it("labels a spell that is only missing from the translation, not missing", () => {
    const resolution = resolveEntry(entry(), {
      languageSpellsById: emptyTranslation,
      englishSpellsById: english,
      customSpellsById: custom,
    });
    expect(resolution.status).toBe("translation-unavailable");
    if (resolution.status === "translation-unavailable") {
      expect(resolution.referenceName).toBe("Fireball");
    }
  });

  it("labels a genuinely absent SRD reference as missing", () => {
    const resolution = resolveEntry(entry({ spellId: "srd-unknown" }), {
      languageSpellsById: german,
      englishSpellsById: english,
      customSpellsById: custom,
    });
    expect(resolution.status).toBe("missing");
  });

  it("resolves custom spells only against custom records", () => {
    const resolution = resolveEntry(
      entry({ spellId: "custom-1", reference: { source: "Custom", name: "Custom" } }),
      {
        languageSpellsById: german,
        englishSpellsById: english,
        customSpellsById: custom,
      },
    );
    expect(resolution.status).toBe("resolved");
    const missing = resolveEntry(
      entry({ spellId: "custom-1", reference: { source: "Custom", name: "Custom" } }),
      {
        languageSpellsById: german,
        englishSpellsById: english,
        customSpellsById: new Map(),
      },
    );
    expect(missing.status).toBe("missing");
  });

  it("counts unavailable and missing entries separately", () => {
    const context = {
      languageSpellsById: emptyTranslation,
      englishSpellsById: english,
      customSpellsById: custom,
    };
    const counts = countOmissions(
      [
        entry({ entryId: "e1" }),
        entry({ entryId: "e2" }),
        entry({ entryId: "e3", spellId: "srd-unknown" }),
      ],
      context,
    );
    expect(counts.translationUnavailable).toBe(2);
    expect(counts.missing).toBe(1);
  });

  it("computes language-switch impact by entry and distinct spell ID", () => {
    const impact = computeLanguageSwitchImpact(
      [
        entry({ entryId: "e1", spellId: "srd-fireball" }),
        entry({ entryId: "e2", spellId: "srd-fireball" }),
        entry({ entryId: "e3", spellId: "srd-other" }),
        entry({
          entryId: "e4",
          spellId: "custom-1",
          reference: { source: "Custom", name: "Custom" },
        }),
      ],
      emptyTranslation,
    );
    expect(impact.affectedEntries).toBe(3);
    expect(impact.affectedDistinctSpellIds).toBe(2);
  });
});
