import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_FILTERS, type LibraryFilters } from "@/services/data/search.ts";
import { buildActiveFilterChips, type FilterChipLabels } from "./filter-summary.ts";

const labels: FilterChipLabels = {
  levels: (range) => `Level: ${range.min} – ${range.max}`,
  classes: { group: "Class", value: (value) => value },
  subclasses: { group: "Subclass", value: (value) => value },
  schools: { group: "School", value: (value) => value },
  castingTimes: { group: "Casting Time", value: (value) => value },
  ranges: { group: "Range", value: (value) => value },
  durations: { group: "Duration", value: (value) => value },
  components: { group: "Components", value: (value) => value },
  concentration: { group: "Concentration", yes: "Yes", no: "No" },
  ritual: { group: "Ritual", yes: "Yes", no: "No" },
  sources: { group: "Source", value: (value) => value },
  multiValue: (label, count) => `${label} +${count}`,
};

function filters(patch: Partial<LibraryFilters>): LibraryFilters {
  return { ...DEFAULT_FILTERS, ...patch };
}

describe("buildActiveFilterChips", () => {
  it("returns no chips for the default filters", () => {
    expect(buildActiveFilterChips(DEFAULT_FILTERS, labels)).toEqual([]);
  });

  it("keeps chips in the documented group order with stable keys", () => {
    const chips = buildActiveFilterChips(
      filters({
        levels: { min: 2, max: 5 },
        classes: ["Wizard"],
        subclasses: ["Wizard: Evoker"],
        schools: ["Evocation"],
        castingTimes: ["1 Action"],
        ranges: ["Self"],
        durations: ["Instantaneous"],
        components: ["verbal"],
        concentration: true,
        ritual: false,
        sources: ["Custom"],
      }),
      labels,
    );

    expect(chips.map((chip) => chip.key)).toEqual([
      "levels",
      "classes",
      "subclasses",
      "schools",
      "castingTimes",
      "ranges",
      "durations",
      "components",
      "concentration",
      "ritual",
      "sources",
    ]);
    expect(chips.map((chip) => chip.label)).toEqual([
      "Level: 2 – 5",
      "Class: Wizard",
      "Subclass: Wizard: Evoker",
      "School: Evocation",
      "Casting Time: 1 Action",
      "Range: Self",
      "Duration: Instantaneous",
      "Components: verbal",
      "Concentration: Yes",
      "Ritual: No",
      "Source: Custom",
    ]);
  });

  it("summarizes multi-value groups with the first label plus the remaining count", () => {
    const chips = buildActiveFilterChips(
      filters({ classes: ["Wizard", "Cleric", "Bard"] }),
      labels,
    );

    expect(chips).toHaveLength(1);
    expect(chips[0].label).toBe("Class: Wizard +2");
  });

  it("does not emit a chip for the default level range", () => {
    expect(buildActiveFilterChips(filters({ levels: { min: 0, max: 9 } }), labels)).toHaveLength(0);
    expect(buildActiveFilterChips(filters({ levels: { min: 3, max: 3 } }), labels)[0].label).toBe(
      "Level: 3 – 3",
    );
  });

  it("clears only the filter group belonging to the chip", () => {
    const chips = buildActiveFilterChips(
      filters({ classes: ["Wizard"], concentration: true }),
      labels,
    );

    expect(chips[0].clear).toEqual({ classes: [] });
    expect(chips[1].clear).toEqual({ concentration: null });
  });
});
