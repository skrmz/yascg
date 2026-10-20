import type { Spell } from "@/domain/spells";

export function makeSpell(overrides: Partial<Spell> = {}): Spell {
  return {
    id: "srd-test-spell",
    name: "Test Spell",
    level: 1,
    school: "Evocation",
    castingTime: "1 Action",
    range: "60 feet",
    duration: "Instantaneous",
    concentration: false,
    ritual: false,
    classes: ["Wizard"],
    components: { verbal: true, somatic: true, material: false },
    description: ["A test spell."],
    source: "SRD-5.2.1",
    sourceLabel: "SRD 5.2.1",
    ...overrides,
  };
}

export function makeCustomSpell(overrides: Partial<Spell> = {}): Spell {
  return makeSpell({
    id: "custom-spell-1",
    name: "Custom Spell",
    source: "Custom",
    sourceLabel: undefined,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  });
}
