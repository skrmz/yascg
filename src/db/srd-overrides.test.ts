import { beforeEach, describe, expect, it } from "vite-plus/test";
import { db } from "@/db/database.ts";
import {
  applySrdOverrides,
  deleteSrdOverride,
  getSrdOverride,
  indexOverridesByLocale,
  listSrdOverrides,
  putSrdOverride,
} from "@/db/srd-overrides.ts";
import type { SrdOverrideValidationContext } from "@/domain/srd-overrides.ts";
import type { Spell, SrdSpellOverride } from "@/domain/spells";
import { makeSpell } from "@/test/fixtures/spells.ts";

const fireball: Spell = makeSpell({
  id: "srd-fireball",
  components: { verbal: true, somatic: false, material: false },
});

function context(): SrdOverrideValidationContext {
  return {
    srdSpellsById: new Map([[fireball.id, fireball]]),
    supportedLocales: ["en", "de"],
  };
}

function override(overrides: Partial<SrdSpellOverride> = {}): SrdSpellOverride {
  return {
    spellId: "srd-fireball",
    locale: "en",
    verbalDescription: "Speak the word",
    updatedAt: 1,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("SRD override CRUD", () => {
  it("stores, reads, lists, and deletes a record", async () => {
    await db.srdSpellOverrides.put(override());
    expect(await getSrdOverride("srd-fireball", "en")).toEqual(override());
    expect(await listSrdOverrides()).toHaveLength(1);
    await deleteSrdOverride("srd-fireball", "en");
    expect(await getSrdOverride("srd-fireball", "en")).toBeNull();
  });

  it("keeps one record per locale", async () => {
    await db.srdSpellOverrides.put(override({ locale: "en" }));
    await db.srdSpellOverrides.put(override({ locale: "de", verbalDescription: "Sprich" }));
    expect(await listSrdOverrides()).toHaveLength(2);
    expect((await getSrdOverride("srd-fireball", "de"))?.verbalDescription).toBe("Sprich");
  });

  it("writes a validated override and deletes on empty descriptions", async () => {
    const saved = await putSrdOverride(
      { spellId: "srd-fireball", locale: "en", verbalDescription: "  Speak  " },
      context(),
    );
    expect(saved?.verbalDescription).toBe("Speak");
    const cleared = await putSrdOverride(
      { spellId: "srd-fireball", locale: "en", verbalDescription: "   " },
      context(),
    );
    expect(cleared).toBeNull();
    expect(await getSrdOverride("srd-fireball", "en")).toBeNull();
  });

  it("rejects invalid writes and never stores them", async () => {
    await expect(
      putSrdOverride({ spellId: "not-srd", locale: "en", verbalDescription: "x" }, context()),
    ).rejects.toThrow();
    await expect(
      putSrdOverride({ spellId: "srd-unknown", locale: "en", verbalDescription: "x" }, context()),
    ).rejects.toThrow();
    await expect(
      putSrdOverride({ spellId: "srd-fireball", locale: "fr", verbalDescription: "x" }, context()),
    ).rejects.toThrow();
    await expect(
      putSrdOverride({ spellId: "srd-fireball", locale: "en", somaticDescription: "x" }, context()),
    ).rejects.toThrow();
    await expect(
      putSrdOverride(
        { spellId: "srd-fireball", locale: "en", verbalDescription: "x".repeat(501) },
        context(),
      ),
    ).rejects.toThrow();
    expect(await listSrdOverrides()).toHaveLength(0);
  });
});

describe("applySrdOverrides", () => {
  it("returns the same array when there is no match", () => {
    const spells = [fireball];
    const merged = applySrdOverrides(spells, new Map());
    expect(merged).toBe(spells);
  });

  it("applies the override in the matching locale and marks the spell", () => {
    const index = indexOverridesByLocale([override({ locale: "de", verbalDescription: "Sprich" })]);
    const [merged] = applySrdOverrides([fireball], index.get("de"));
    expect(merged).not.toBe(fireball);
    expect(merged.components.verbalDescription).toBe("Sprich");
    expect(merged.overridden).toBe(true);
    // Original is never mutated (protects the dataset cache).
    expect(fireball.components.verbalDescription).toBeUndefined();
    expect(fireball.overridden).toBeUndefined();
  });

  it("does not leak a locale override into another locale", () => {
    const index = indexOverridesByLocale([override({ locale: "de", verbalDescription: "Sprich" })]);
    const [english] = applySrdOverrides([fireball], index.get("en"));
    expect(english).toBe(fireball);
    expect(english.overridden).toBeUndefined();
  });

  it("ignores descriptions for disabled components", () => {
    const index = indexOverridesByLocale([
      override({ verbalDescription: undefined, somaticDescription: "Trace a sigil" }),
    ]);
    const [merged] = applySrdOverrides([fireball], index.get("en"));
    expect(merged).toBe(fireball);
    expect(merged.overridden).toBeUndefined();
  });
});
