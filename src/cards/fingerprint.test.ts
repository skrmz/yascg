import { describe, expect, it } from "vite-plus/test";
import {
  CARD_STYLE_VERSION,
  blocksFingerprint,
  contentFingerprint,
  fitCacheKey,
} from "@/cards/fingerprint.ts";
import { parseSpellBody } from "@/markdown/parse.ts";
import { makeSpell } from "@/test/fixtures/spells.ts";

const markers = { verbal: "ⓥ", somatic: "ⓢ" };

describe("fit cache keys", () => {
  it("namespaces Classic and Compact layouts", () => {
    const spell = makeSpell();
    const blocks = blocksFingerprint(parseSpellBody(spell, "Higher Levels", markers));
    const common = {
      spellId: spell.id,
      language: "en",
      fitMode: "auto-shrink" as const,
      contentFingerprint: contentFingerprint(spell),
      blocksFingerprint: blocks,
    };
    const classic = fitCacheKey({ ...common, design: "classic" });
    const compact = fitCacheKey({ ...common, design: "compact" });

    expect(classic).not.toBe(compact);
    expect(classic).toContain(CARD_STYLE_VERSION);
  });

  it("keeps the shared card style version stable for this change", () => {
    expect(CARD_STYLE_VERSION).toBe("3");
  });

  it("invalidates content layout when an SRD override is present", () => {
    const base = contentFingerprint(makeSpell());
    const overridden = contentFingerprint(makeSpell({ overridden: true }));
    expect(base).not.toBe(overridden);
  });
});
