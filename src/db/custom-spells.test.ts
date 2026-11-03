import { describe, expect, it } from "vite-plus/test";
import { createCustomSpellCopy } from "@/db/custom-spells.ts";
import { spellSchema } from "@/domain/spells";
import { makeSpell } from "@/test/fixtures/spells.ts";

function makeRichSpell() {
  return makeSpell({
    id: "srd-rich",
    name: "Rich Spell",
    subclasses: ["Wizard: Evocation"],
    savingThrow: "DEX",
    damageTypes: ["Fire"],
    higherLevels: ["At higher levels it burns more."],
    sourceLabel: "SRD 5.2.1",
    overridden: true,
    components: {
      verbal: true,
      verbalDescription: "Speak the word",
      somatic: true,
      somaticDescription: "Trace a sigil",
      material: true,
      materialDescription: "A ruby",
      materialCost: "100 gp",
      materialConsumed: true,
      componentsDisplayOverride: "V, S, M (a ruby)",
    },
  });
}

describe("createCustomSpellCopy", () => {
  it("replaces identity and provenance while preserving schema fields", () => {
    const source = makeRichSpell();
    const before = Date.now();
    const copy = createCustomSpellCopy(source);

    expect(copy.id).not.toBe(source.id);
    expect(copy.source).toBe("Custom");
    expect(copy.updatedAt).toBeTypeOf("number");
    expect(copy.updatedAt).toBeGreaterThanOrEqual(before);

    expect(copy.name).toBe(source.name);
    expect(copy.level).toBe(source.level);
    expect(copy.school).toBe(source.school);
    expect(copy.castingTime).toBe(source.castingTime);
    expect(copy.range).toBe(source.range);
    expect(copy.duration).toBe(source.duration);
    expect(copy.concentration).toBe(source.concentration);
    expect(copy.ritual).toBe(source.ritual);
    expect(copy.classes).toEqual(source.classes);
    expect(copy.subclasses).toEqual(source.subclasses);
    expect(copy.savingThrow).toBe(source.savingThrow);
    expect(copy.damageTypes).toEqual(source.damageTypes);
    expect(copy.description).toEqual(source.description);
    expect(copy.higherLevels).toEqual(source.higherLevels);
    expect(copy.components).toEqual(source.components);
    expect(copy.components.componentsDisplayOverride).toBe("V, S, M (a ruby)");
  });

  it("drops transient provenance markers", () => {
    const copy = createCustomSpellCopy(makeRichSpell());
    expect("sourceLabel" in copy).toBe(false);
    expect("overridden" in copy).toBe(false);
  });

  it("returns a validated spell and does not mutate the source", () => {
    const source = makeRichSpell();
    const snapshot = structuredClone(source);
    const copy = createCustomSpellCopy(source);
    expect(spellSchema.parse(copy)).toEqual(copy);
    expect(source).toEqual(snapshot);
  });
});
