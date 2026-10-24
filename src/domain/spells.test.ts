import { describe, expect, it } from "vite-plus/test";
import { LIMITS, spellSchema, srdSpellOverrideSchema } from "@/domain/spells";
import {
  CUSTOM_SPELLS_TYPE,
  EXPORT_VERSION,
  extractRecognizedSpell,
  customSpellExportPayloadSchemaV1,
} from "@/domain/payloads";
import { makeSpell } from "@/test/fixtures/spells.ts";

describe("spellSchema", () => {
  it("accepts a valid spell", () => {
    expect(spellSchema.safeParse(makeSpell()).success).toBe(true);
  });

  it("rejects a blank name", () => {
    expect(spellSchema.safeParse(makeSpell({ name: "   " })).success).toBe(false);
  });

  it("enforces the name length limit", () => {
    const long = "x".repeat(LIMITS.NAME_MAX + 1);
    expect(spellSchema.safeParse(makeSpell({ name: long })).success).toBe(false);
    expect(spellSchema.safeParse(makeSpell({ name: "x".repeat(LIMITS.NAME_MAX) })).success).toBe(
      true,
    );
  });

  it("enforces level 0-9 integer", () => {
    expect(spellSchema.safeParse(makeSpell({ level: 0 })).success).toBe(true);
    expect(spellSchema.safeParse(makeSpell({ level: 9 })).success).toBe(true);
    expect(spellSchema.safeParse(makeSpell({ level: -1 })).success).toBe(false);
    expect(spellSchema.safeParse(makeSpell({ level: 10 })).success).toBe(false);
    expect(spellSchema.safeParse(makeSpell({ level: 1.5 })).success).toBe(false);
  });

  it("rejects unknown schools", () => {
    const invalid = { ...makeSpell(), school: "Divine" };
    expect(spellSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects duplicate class names", () => {
    expect(spellSchema.safeParse(makeSpell({ classes: ["Bard", "Bard"] })).success).toBe(false);
  });

  it("restricts classes to the 12 canonical core classes", () => {
    expect(spellSchema.safeParse(makeSpell({ classes: ["Wizard", "Bard"] })).success).toBe(true);
    expect(spellSchema.safeParse(makeSpell({ classes: [] })).success).toBe(true);
    expect(spellSchema.safeParse(makeSpell({ classes: ["Artificer"] })).success).toBe(false);
    expect(spellSchema.safeParse(makeSpell({ classes: ["wizard"] })).success).toBe(false);
  });

  it("rejects invalid source", () => {
    const invalid = { ...makeSpell(), source: "PHB" };
    expect(spellSchema.safeParse(invalid).success).toBe(false);
  });

  it("requires at least one description string", () => {
    expect(spellSchema.safeParse(makeSpell({ description: [] })).success).toBe(false);
  });

  it("enforces the combined description cap", () => {
    const chunk = "a".repeat(LIMITS.DESCRIPTION_ITEM_MAX);
    const big = Array.from({ length: 3 }, () => chunk);
    expect(spellSchema.safeParse(makeSpell({ description: big })).success).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = spellSchema.safeParse({ ...makeSpell(), sneaky: "value" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("sneaky" in result.data).toBe(false);
    }
  });

  it("accepts and round-trips valid subclasses", () => {
    const result = spellSchema.safeParse(makeSpell({ subclasses: ["Cleric: War"] }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subclasses).toEqual(["Cleric: War"]);
    }
  });

  it("accepts a spell without subclasses", () => {
    const result = spellSchema.safeParse(makeSpell());
    expect(result.success).toBe(true);
    if (result.success) {
      expect("subclasses" in result.data).toBe(false);
    }
  });

  it("rejects duplicate subclass identifiers", () => {
    expect(
      spellSchema.safeParse(makeSpell({ subclasses: ["Cleric: War", "Cleric: War"] })).success,
    ).toBe(false);
  });

  it("rejects over-long subclass identifiers", () => {
    expect(
      spellSchema.safeParse(makeSpell({ subclasses: ["x".repeat(LIMITS.META_MAX + 1)] })).success,
    ).toBe(false);
  });

  it("rejects blank subclass identifiers", () => {
    expect(spellSchema.safeParse(makeSpell({ subclasses: ["   "] })).success).toBe(false);
  });

  it("round-trips subclasses through the export payload and extraction", () => {
    const spell = makeSpell({ subclasses: ["Cleric: War"] });
    const parsed = customSpellExportPayloadSchemaV1.safeParse({
      version: EXPORT_VERSION,
      type: CUSTOM_SPELLS_TYPE,
      spells: [spell],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.spells[0].subclasses).toEqual(["Cleric: War"]);
    }
    expect(extractRecognizedSpell(spell)?.subclasses).toEqual(["Cleric: War"]);
  });

  it("strips the transient overridden marker on parse", () => {
    const result = spellSchema.safeParse({ ...makeSpell(), overridden: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("overridden" in result.data).toBe(false);
    }
  });
});

describe("srdSpellOverrideSchema", () => {
  const base = { spellId: "srd-fireball", locale: "en", updatedAt: 1 };

  it("accepts a valid override", () => {
    const result = srdSpellOverrideSchema.safeParse({
      ...base,
      verbalDescription: "Speak the word",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an identity-only override", () => {
    expect(srdSpellOverrideSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a blank spell id and a short locale", () => {
    expect(srdSpellOverrideSchema.safeParse({ ...base, spellId: "  " }).success).toBe(false);
    expect(srdSpellOverrideSchema.safeParse({ ...base, locale: "e" }).success).toBe(false);
  });

  it("enforces the metadata length bound", () => {
    const long = "x".repeat(LIMITS.META_MAX + 1);
    expect(srdSpellOverrideSchema.safeParse({ ...base, verbalDescription: long }).success).toBe(
      false,
    );
    expect(
      srdSpellOverrideSchema.safeParse({
        ...base,
        verbalDescription: "x".repeat(LIMITS.META_MAX),
      }).success,
    ).toBe(true);
  });

  it("requires a non-negative integer updatedAt", () => {
    expect(srdSpellOverrideSchema.safeParse({ ...base, updatedAt: -1 }).success).toBe(false);
    expect(srdSpellOverrideSchema.safeParse({ ...base, updatedAt: 1.5 }).success).toBe(false);
  });
});
