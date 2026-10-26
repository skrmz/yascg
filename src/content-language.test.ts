import { describe, expect, it } from "vite-plus/test";
import { resolveContentLanguage } from "@/content-language.ts";
import { makeCustomSpell, makeSpell } from "@/test/fixtures/spells.ts";

describe("content language provenance", () => {
  it("uses the actual dataset language for bundled SRD text", () => {
    expect(resolveContentLanguage(makeSpell(), "de")).toBe("de");
    expect(resolveContentLanguage(makeSpell(), "fr")).toBe("fr");
  });

  it("omits the attribute for custom spells", () => {
    expect(resolveContentLanguage(makeCustomSpell(), "de")).toBeUndefined();
  });

  it("omits the attribute for mixed SRD override text", () => {
    expect(resolveContentLanguage(makeSpell({ overridden: true }), "de")).toBeUndefined();
  });
});
