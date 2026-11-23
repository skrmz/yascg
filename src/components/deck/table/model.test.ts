import { afterEach, describe, expect, it } from "vite-plus/test";
import i18n from "@/i18n.ts";
import type { Spell } from "@/domain/spells.ts";
import type { ResolvedDeckEntry } from "@/state/AppProvider.tsx";
import { makeSpell } from "@/test/fixtures/spells.ts";
import {
  DEFAULT_TABLE_PREFERENCES,
  UNKNOWN,
  castingOptions,
  cellText,
  filterTableRows,
  makeTableRows,
  printableCells,
  readTablePreferences,
  reconcileSelection,
  resetTableFilters,
  setMatchingSelection,
  sortTableRows,
  writeTablePreferences,
} from "./model.ts";

function resolved(entryId: string, spell: Spell): ResolvedDeckEntry {
  return {
    entry: {
      entryId,
      spellId: spell.id,
      fitMode: "auto",
      reference: { name: spell.name, source: spell.source },
    },
    resolution: { status: "resolved", spell },
  };
}

const missing: ResolvedDeckEntry = {
  entry: {
    entryId: "missing-entry",
    spellId: "srd-removed",
    fitMode: "auto",
    reference: { name: "Old spell", source: "SRD-5.2.1" },
  },
  resolution: { status: "missing", referenceName: "Old spell" },
};
const t = i18n.getFixedT("en");
const all = DEFAULT_TABLE_PREFERENCES.filters;

afterEach(() => localStorage.clear());

describe("active deck table data", () => {
  it("resolves localized values and labels the English fallback and missing references", () => {
    const english = makeSpell({ id: "srd-level-zero", name: "Tracing Light", level: 0 });
    const german = makeSpell({ name: "Helles Licht", level: 2 });
    const unavailable: ResolvedDeckEntry = {
      ...resolved("fallback-entry", english),
      resolution: { status: "translation-unavailable", referenceName: "Stale name" },
    };
    const germanT = i18n.getFixedT("de");
    const [local, fallback, unresolved] = makeTableRows(
      [resolved("local-entry", german), unavailable, missing],
      new Map([[english.id, english]]),
      "de",
      germanT,
    );

    expect(local.name).toBe("Helles Licht");
    expect(local.values.school).toBe("Hervorrufung");
    expect(local.values.classes).toBe("Magier");
    expect(fallback.name).toBe("Tracing Light");
    expect(fallback.contentLanguage).toBe("en");
    expect(cellText(fallback, "level", germanT)).toBe("0");
    expect(printableCells(fallback, ["name"], germanT)).toEqual({
      name: "Tracing Light\nEnglische Fassung",
    });
    expect(unresolved.status).toBe("missing");
    expect(unresolved.name).toBe("Old spell");
    expect(unresolved.values.concentration).toBeNull();
    expect(unresolved.values.ritual).toBeNull();
    expect(cellText(fallback, "concentration", germanT)).toBe("Nein");
    expect(cellText(unresolved, "concentration", germanT)).toBe("—");
  });

  it("searches normalized names and combines filters with AND across groups and OR within groups", () => {
    const rows = makeTableRows(
      [
        resolved(
          "one",
          makeSpell({
            name: "Zebra\tLight",
            school: "Evocation",
            classes: ["Bard"],
            concentration: true,
            ritual: true,
            castingTime: "1 Bonus Action",
          }),
        ),
        resolved(
          "two",
          makeSpell({
            name: "Bright Light",
            school: "Illusion",
            classes: ["Wizard"],
            concentration: true,
            ritual: true,
            castingTime: "1 bonus  action",
          }),
        ),
        resolved(
          "three",
          makeSpell({
            name: "Dim Light",
            school: "Illusion",
            classes: ["Druid"],
            concentration: true,
            ritual: true,
            castingTime: "1 Bonus Action",
          }),
        ),
        resolved(
          "four",
          makeSpell({
            name: "Recall",
            school: "Divination",
            classes: ["Bard"],
            castingTime: "1 Action",
          }),
        ),
        missing,
      ],
      new Map(),
      "en",
      t,
    );
    const casting = castingOptions(rows, "en", t);
    const keep = (patch: Partial<typeof all>) =>
      filterTableRows(rows, { ...all, ...patch }, casting, "en").map(({ id }) => id);

    expect(casting.map(({ label }) => label)).toEqual([
      "1 Action",
      "1 Bonus Action",
      "Unknown / unavailable",
    ]);
    expect(keep({ name: "   ZEBRA  light  " })).toEqual(["one"]);
    expect(
      keep({
        schools: ["Evocation", "Illusion"],
        classes: ["Bard", "Wizard"],
        ritual: "yes",
        concentration: "yes",
        castingTime: casting[1].id,
      }),
    ).toEqual(["one", "two"]);
    expect(keep({ concentration: "no", ritual: "no" })).toEqual(["four"]);
    expect(
      keep({
        schools: [UNKNOWN],
        classes: [UNKNOWN],
        concentration: UNKNOWN,
        ritual: UNKNOWN,
        castingTime: UNKNOWN,
      }),
    ).toEqual(["missing-entry"]);
    expect(keep({ name: "no match" })).toEqual([]);
  });

  it("retains a casting-time filter across a dataset language change", () => {
    const english = makeSpell({ id: "srd-ritual", castingTime: "1 Action" });
    const german = { ...english, castingTime: "1 Aktion" };
    const canonical = new Map([[english.id, english]]);
    const germanT = i18n.getFixedT("de");
    const englishOptions = castingOptions(
      makeTableRows([resolved("entry", english)], canonical, "en", t),
      "en",
      t,
    );
    const rows = makeTableRows([resolved("entry", german)], canonical, "de", germanT);
    const germanOptions = castingOptions(rows, "de", germanT);
    expect(germanOptions[0].label).toBe("1 Aktion");
    expect(
      filterTableRows(rows, { ...all, castingTime: englishOptions[0].id }, germanOptions, "de"),
    ).toEqual(rows);
  });

  it("sorts stably, keeps unknown values last in both directions, and preserves input order", () => {
    const rows = makeTableRows(
      [
        missing,
        resolved("two", makeSpell({ level: 2 })),
        resolved("zero", makeSpell({ level: 0 })),
        resolved("also-two", makeSpell({ level: 2 })),
      ],
      new Map(),
      "en",
      t,
    );
    expect(
      sortTableRows(rows, { column: "level", direction: "ascending" }, "en").map(({ id }) => id),
    ).toEqual(["zero", "two", "also-two", "missing-entry"]);
    expect(
      sortTableRows(rows, { column: "level", direction: "descending" }, "en").map(({ id }) => id),
    ).toEqual(["two", "also-two", "zero", "missing-entry"]);
    expect(sortTableRows(rows, null, "en").map(({ id }) => id)).toEqual([
      "missing-entry",
      "two",
      "zero",
      "also-two",
    ]);
  });

  it("keeps full descriptions and material details as safe printable text", () => {
    const long = `Beginning ${"paragraph ".repeat(800)}last word.`;
    const spell = makeSpell({
      description: [
        "**Bold** spell effect.",
        long,
        "| Save | Result |\n| --- | --- |\n| Wis | None |",
      ],
      higherLevels: ["More damage."],
      components: { verbal: true, somatic: false, material: true, materialDescription: "A ruby" },
    });
    const [row] = makeTableRows([resolved("entry", spell)], new Map(), "en", t);
    const cells = printableCells(row, ["name", "components", "description"], t);
    expect(cells.components).toBe("V, M\nA ruby");
    expect(cells.description).toContain("Bold spell effect.\n\n" + long);
    expect(cells.description).toContain("Save | Result\nWis | None");
    expect(cells.description).toContain("Higher Levels\n\nMore damage.");
  });
});

describe("active deck table UI state", () => {
  it("toggles all matching entries and preserves hidden selections until they are invalidated", () => {
    const initial = new Set(["outside-filter", "removed-entry"]);
    const matching = Array.from({ length: 17 }, (_, index) => `entry-${index}`);
    const allSelected = setMatchingSelection(initial, matching, true);
    expect(allSelected.size).toBe(19);
    const retained = setMatchingSelection(allSelected, matching, false);
    expect(retained).toEqual(initial);
    expect(reconcileSelection(retained, new Set(["outside-filter"]))).toEqual(
      new Set(["outside-filter"]),
    );
  });

  it("restores preferences and ignores obsolete saved columns and filter settings", () => {
    localStorage.setItem(
      "spellCards.deckTable",
      JSON.stringify({
        columns: ["actions", "description", "source", "obsolete"],
        filters: {
          schools: ["Evocation", "obsolete"],
          classes: ["Wizard", "obsolete"],
          castingTime: "invalid",
          ritual: "yes",
        },
        sort: { column: "obsolete", direction: "ascending" },
        pageSize: 25,
        fullTable: true,
        selection: ["ignored"],
      }),
    );
    const preferences = readTablePreferences();
    expect(preferences).toEqual({
      columns: ["name", "description", "source"],
      filters: { ...all, schools: ["Evocation"], classes: ["Wizard"], ritual: "yes" },
      sort: null,
      pageSize: 25,
      fullTable: true,
    });
    writeTablePreferences(
      resetTableFilters({ ...preferences, sort: { column: "name", direction: "ascending" } }),
    );
    expect(readTablePreferences()).toEqual({ ...preferences, filters: all });
  });
});
