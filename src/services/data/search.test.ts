import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_FILTERS,
  LEVEL_MAX,
  LEVEL_MIN,
  countActiveAdvancedFilters,
  createSearchIndex,
  deriveCastingTimeOptions,
  deriveRangeOptions,
  filterSpells,
  hasActiveAdvancedFilters,
  normalizeText,
  searchSpells,
  sortSpells,
} from "@/services/data/search.ts";
import { makeSpell } from "@/test/fixtures/spells.ts";

const fireball = makeSpell({ id: "srd-fireball", name: "Fireball", level: 3, school: "Evocation" });
const cure = makeSpell({
  id: "srd-cure-wounds",
  name: "Cure Wounds",
  level: 1,
  school: "Abjuration",
});
const café = makeSpell({ id: "srd-cafe", name: "Café Shield", level: 0, school: "Abjuration" });

describe("search normalization", () => {
  it("is case and accent insensitive", () => {
    expect(normalizeText("Café")).toBe("cafe");
    const index = createSearchIndex([fireball, cure, café]);
    const results = searchSpells(index, [fireball, cure, café], "cafe");
    expect(results.map((spell) => spell.id)).toContain("srd-cafe");
  });

  it("returns all spells for an empty query", () => {
    const index = createSearchIndex([fireball, cure]);
    expect(searchSpells(index, [fireball, cure], "  ")).toHaveLength(2);
  });

  it("returns only name matches when the query also appears in descriptions", () => {
    const sparks = makeSpell({
      id: "srd-sparks",
      name: "Sparks",
      description: ["A burst of fire."],
    });
    const index = createSearchIndex([fireball, sparks]);
    const results = searchSpells(index, [fireball, sparks], "fire");
    expect(results.map((spell) => spell.id)).toEqual(["srd-fireball"]);
  });

  it("falls back to class matches when no spell name matches", () => {
    const shield = makeSpell({ id: "srd-shield", name: "Shield", classes: ["Wizard"] });
    const index = createSearchIndex([fireball, shield]);
    const results = searchSpells(index, [fireball, shield], "wizard");
    expect(results.map((spell) => spell.id)).toEqual(["srd-fireball", "srd-shield"]);
  });

  it("falls back to description matches when no name or class matches", () => {
    const sparks = makeSpell({
      id: "srd-sparks",
      name: "Sparks",
      classes: ["Sorcerer"],
      description: ["A flash of restoring light."],
    });
    const index = createSearchIndex([fireball, sparks]);
    const results = searchSpells(index, [fireball, sparks], "restoring");
    expect(results.map((spell) => spell.id)).toEqual(["srd-sparks"]);
  });

  it("fuzzy-matches names only when no exact text match exists", () => {
    const index = createSearchIndex([fireball, cure]);
    const results = searchSpells(index, [fireball, cure], "fierball");
    expect(results.map((spell) => spell.id)).toEqual(["srd-fireball"]);
  });
});

describe("filters", () => {
  const spells = [fireball, cure, café];

  it("matches an inclusive, contiguous level range and ANDs across groups", () => {
    const byLevel = filterSpells(spells, {
      ...DEFAULT_FILTERS,
      levels: { min: 1, max: 3 },
    });
    expect(byLevel.map((s) => s.id).sort()).toEqual(["srd-cure-wounds", "srd-fireball"]);

    const levelAndSchool = filterSpells(spells, {
      ...DEFAULT_FILTERS,
      levels: { min: 1, max: 3 },
      schools: ["Evocation"],
    });
    expect(levelAndSchool.map((s) => s.id)).toEqual(["srd-fireball"]);
  });

  it("treats range bounds as inclusive and the full range as unfiltered", () => {
    expect(
      filterSpells(spells, { ...DEFAULT_FILTERS, levels: { min: 2, max: 2 } }).map((s) => s.id),
    ).toEqual([]);
    expect(
      filterSpells(spells, { ...DEFAULT_FILTERS, levels: { min: 0, max: 0 } }).map((s) => s.id),
    ).toEqual(["srd-cafe"]);
    expect(
      filterSpells(spells, {
        ...DEFAULT_FILTERS,
        levels: { min: LEVEL_MIN, max: LEVEL_MAX },
      }),
    ).toHaveLength(3);
    expect(
      filterSpells(spells, { ...DEFAULT_FILTERS, levels: { min: 3, max: 9 } }).map((s) => s.id),
    ).toEqual(["srd-fireball"]);
  });

  it("exposes defaults and advanced-filter indicators", () => {
    expect(DEFAULT_FILTERS.levels).toEqual({ min: 0, max: 9 });
    expect(DEFAULT_FILTERS.sources).toEqual([]);
    expect(DEFAULT_FILTERS.concentration).toBeNull();
    expect(DEFAULT_FILTERS.ritual).toBeNull();
    expect(countActiveAdvancedFilters(DEFAULT_FILTERS)).toBe(0);
    expect(hasActiveAdvancedFilters(DEFAULT_FILTERS)).toBe(false);

    const advanced = {
      ...DEFAULT_FILTERS,
      castingTimes: ["1 Action"],
      ranges: ["60 feet"],
      components: ["verbal"] as const,
      concentration: true,
      ritual: false,
    };
    expect(countActiveAdvancedFilters(advanced)).toBe(5);
    expect(hasActiveAdvancedFilters(advanced)).toBe(true);
  });

  it("compares casting time by trimmed case-folded exact match", () => {
    const withTime = makeSpell({
      id: "srd-time",
      name: "Timed",
      castingTime: "1 Action",
    });
    expect(
      filterSpells([withTime], { ...DEFAULT_FILTERS, castingTimes: ["  1 action "] }),
    ).toHaveLength(1);
    expect(
      filterSpells([withTime], { ...DEFAULT_FILTERS, castingTimes: ["1 Bonus Action"] }),
    ).toHaveLength(0);
  });

  it("compares range by trimmed case-folded exact match", () => {
    const withRange = makeSpell({ id: "srd-range", name: "Ranged", range: "60 feet" });
    expect(filterSpells([withRange], { ...DEFAULT_FILTERS, ranges: ["  60 FEET "] })).toHaveLength(
      1,
    );
    expect(filterSpells([withRange], { ...DEFAULT_FILTERS, ranges: ["Self"] })).toHaveLength(0);
  });

  it("requires every selected component", () => {
    const verbalOnly = makeSpell({
      id: "srd-verbal",
      name: "Verbal",
      components: { verbal: true, somatic: false, material: false },
    });
    const verbalSomatic = makeSpell({
      id: "srd-vs",
      name: "Verbal Somatic",
      components: { verbal: true, somatic: true, material: false },
    });
    expect(
      filterSpells([verbalOnly, verbalSomatic], {
        ...DEFAULT_FILTERS,
        components: ["verbal"],
      }).map((spell) => spell.id),
    ).toEqual(["srd-verbal", "srd-vs"]);
    expect(
      filterSpells([verbalOnly, verbalSomatic], {
        ...DEFAULT_FILTERS,
        components: ["verbal", "somatic"],
      }).map((spell) => spell.id),
    ).toEqual(["srd-vs"]);
  });

  it("derives casting-time and range options from the supplied dataset", () => {
    const spells = [
      makeSpell({ id: "srd-a", castingTime: "Action", range: "Self" }),
      makeSpell({ id: "srd-b", castingTime: " action ", range: "Touch" }),
      makeSpell({ id: "srd-c", castingTime: "Reaction", range: "Self" }),
    ];
    expect(deriveCastingTimeOptions(spells)).toEqual(["Action", "Reaction"]);
    expect(deriveRangeOptions(spells)).toEqual(["Self", "Touch"]);
  });

  it("filters by source and class", () => {
    const custom = makeSpell({ id: "custom-1", name: "Homebrew", source: "Custom" });
    expect(
      filterSpells([fireball, custom], { ...DEFAULT_FILTERS, sources: ["Custom"] }).map(
        (s) => s.id,
      ),
    ).toEqual(["custom-1"]);
    expect(filterSpells([fireball], { ...DEFAULT_FILTERS, classes: ["Bard"] })).toHaveLength(0);
    expect(filterSpells([fireball], { ...DEFAULT_FILTERS, classes: ["Wizard"] })).toHaveLength(1);
  });
});

describe("sorting", () => {
  it("sorts by localized name with a stable id tie-breaker", () => {
    const a = makeSpell({ id: "srd-z", name: "Ähre" });
    const b = makeSpell({ id: "srd-a", name: "ähre" });
    const sorted = sortSpells([a, b], "en");
    expect(sorted.map((s) => s.id)).toEqual(["srd-a", "srd-z"]);
  });
});
