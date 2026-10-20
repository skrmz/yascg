import { describe, expect, it } from "vite-plus/test";
import { LIMITS, spellSchema } from "@/domain/spells";
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
});
