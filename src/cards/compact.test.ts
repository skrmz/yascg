import { afterEach, describe, expect, it } from "vite-plus/test";
import i18n from "@/i18n.ts";
import {
  buildCompactPresentation,
  castingBaseDisplay,
  parseCastingTime,
  parseDuration,
  superscriptNumber,
} from "@/cards/compact.ts";
import { parseSpellBody } from "@/markdown/parse.ts";
import { makeSpell } from "@/test/fixtures/spells.ts";

const markers = { verbal: "V", somatic: "S" };

function body(spell: ReturnType<typeof makeSpell>, markSections = true) {
  return parseSpellBody(spell, i18n.t("spell.higherLevels"), markers, { markSections });
}

function displayCasting(raw: string): string {
  const parsed = parseCastingTime(raw);
  return parsed.kind === "base" ? castingBaseDisplay(parsed.base, i18n.t) : parsed.raw;
}

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("compact casting-time parsing", () => {
  it("recognizes English and German action bases", () => {
    expect(displayCasting("Action")).toBe("A");
    expect(displayCasting("1 Action")).toBe("A");
    expect(displayCasting("Bonus Action")).toBe("B");
    expect(displayCasting("Reaction")).toBe("R");
    expect(displayCasting("Aktion")).toBe("A");
    expect(displayCasting("Bonusaktion")).toBe("B");
    expect(displayCasting("Reaktion")).toBe("R");
  });

  it("formats minute and hour quantities with localized catalog shorts", async () => {
    expect(displayCasting("1 minute")).toBe("1 MIN");
    expect(displayCasting("10 minutes")).toBe("10 MIN");
    expect(displayCasting("1 hour")).toBe("1 HR");
    await i18n.changeLanguage("de");
    expect(displayCasting("1 Minute")).toBe("1 min");
    expect(displayCasting("10 Minuten")).toBe("10 min");
    expect(displayCasting("1 Stunde")).toBe("1 Std.");
  });

  it("keeps unusual casting times lossless", () => {
    expect(parseCastingTime("Action or Reaction")).toMatchObject({
      kind: "fallback",
      raw: "Action or Reaction",
    });
    expect(parseCastingTime("Special")).toMatchObject({ kind: "fallback", raw: "Special" });
  });

  it("extracts comma and semicolon qualifiers only", () => {
    expect(parseCastingTime("Reaction, which you take when hit")).toMatchObject({
      kind: "base",
      qualifier: "which you take when hit",
    });
    expect(parseCastingTime("Reaction; which you take when hit")).toMatchObject({
      kind: "base",
      qualifier: "which you take when hit",
    });
  });

  it("falls back when a qualifier and a caret are both present", () => {
    expect(parseCastingTime("Reaction, which you take when hit ^")).toMatchObject({
      kind: "fallback",
      raw: "Reaction, which you take when hit ^",
    });
  });

  it("strips the trailing caret for parsing but reports it", () => {
    expect(parseCastingTime("Reaction ^")).toMatchObject({
      kind: "base",
      caret: true,
      raw: "Reaction ^",
    });
  });

  it("parses duration lexically and preserves its caret", () => {
    expect(parseDuration(" up to 1 minute ")).toEqual({ value: "up to 1 minute", caret: false });
    expect(parseDuration("Until dispelled ^")).toEqual({
      value: "Until dispelled ^",
      caret: true,
    });
  });
});

describe("compact note matching", () => {
  it("matches one caret field and one caret paragraph", () => {
    const spell = makeSpell({
      castingTime: "Reaction ^",
      description: ["Body text.", "^ which you take when hit"],
    });
    const presentation = buildCompactPresentation(spell, body(spell), i18n.t);

    expect(presentation.displayCastingTime).toBe("R");
    expect(presentation.castingNoteNumber).toBe(1);
    expect(presentation.notes).toHaveLength(1);
    expect(presentation.notes[0]?.children).toEqual([
      { type: "text", value: "which you take when hit" },
    ]);
    expect(presentation.blocks[0]).toMatchObject({ type: "list", role: "notes" });
    expect(JSON.stringify(presentation.blocks)).not.toContain("^ which");
  });

  it("numbers a duration-only note as 1 and strips its caret", () => {
    const spell = makeSpell({
      castingTime: "1 Action",
      duration: "Until dispelled ^",
      description: ["Body text.", "^ or glyph triggered"],
    });
    const presentation = buildCompactPresentation(spell, body(spell), i18n.t);

    expect(presentation.displayDuration).toBe("Until dispelled");
    expect(presentation.durationNoteNumber).toBe(1);
    expect(presentation.castingNoteNumber).toBeUndefined();
    expect(presentation.notes.map((note) => note.number)).toEqual([1]);
  });

  it("numbers a synthetic casting note before a duration caret note", () => {
    const spell = makeSpell({
      castingTime: "Reaction, which you take when hit",
      duration: "Until dispelled ^",
      description: ["Body text.", "^ or glyph triggered"],
    });
    const presentation = buildCompactPresentation(spell, body(spell), i18n.t);

    expect(presentation.displayCastingTime).toBe("R");
    expect(presentation.displayDuration).toBe("Until dispelled");
    expect(presentation.castingNoteNumber).toBe(1);
    expect(presentation.durationNoteNumber).toBe(2);
    expect(presentation.notes.map((note) => note.owner)).toEqual(["castingTime", "duration"]);
  });

  it("leaves ambiguous caret paragraphs untouched", () => {
    const spell = makeSpell({
      castingTime: "1 Action",
      duration: "Until dispelled ^",
      description: ["Body text.", "^ first trigger", "^ second trigger"],
    });
    const presentation = buildCompactPresentation(spell, body(spell), i18n.t);

    expect(presentation.notes).toHaveLength(0);
    expect(presentation.displayDuration).toBe("Until dispelled ^");
    expect(JSON.stringify(presentation.blocks)).toContain("^ first trigger");
    expect(JSON.stringify(presentation.blocks)).toContain("^ second trigger");
  });

  it("does not match a caret in higher-level blocks", () => {
    const spell = makeSpell({
      castingTime: "1 Action",
      duration: "Until dispelled ^",
      description: ["Body text."],
      higherLevels: ["^ higher-level caret"],
    });
    const presentation = buildCompactPresentation(spell, body(spell), i18n.t);

    expect(presentation.notes).toHaveLength(0);
    expect(presentation.displayDuration).toBe("Until dispelled ^");
  });

  it("deduplicates a qualifier already present in body text", () => {
    const spell = makeSpell({
      castingTime: "Reaction, which you take when hit",
      description: ["You can react. Which you take when hit."],
    });
    const presentation = buildCompactPresentation(spell, body(spell), i18n.t);

    expect(presentation.displayCastingTime).toBe("R");
    expect(presentation.notes).toHaveLength(0);
    expect(presentation.blocks).toHaveLength(1);
  });

  it("never mutates the spell or the parsed blocks", () => {
    const spell = makeSpell({
      castingTime: "Reaction ^",
      duration: "Until dispelled ^",
      description: ["Body text.", "^ one", "^ two"],
      higherLevels: ["Higher text."],
    });
    const spellBefore = JSON.stringify(spell);
    const blocks = body(spell);
    const blocksBefore = JSON.stringify(blocks);
    buildCompactPresentation(spell, blocks, i18n.t);

    expect(JSON.stringify(spell)).toBe(spellBefore);
    expect(JSON.stringify(blocks)).toBe(blocksBefore);
  });
});

describe("compact higher-level sections", () => {
  it("leaves English Dragon's Breath inline when higherLevels is absent", async () => {
    await i18n.changeLanguage("en");
    const spell = makeSpell({
      name: "Dragon's Breath",
      castingTime: "Bonus Action",
      duration: "up to 1 minute",
      description: [
        "You touch one willing creature. Using a Higher-Level Spell Slot. The damage increases.",
      ],
    });
    const presentation = buildCompactPresentation(spell, body(spell), i18n.t);
    expect(presentation.displayCastingTime).toBe("B");
    expect(presentation.blocks.some((block) => block.section === "higherLevels")).toBe(false);
    expect(JSON.stringify(presentation.blocks)).toContain("Using a Higher-Level Spell Slot.");
  });

  it("marks German Dragon's Breath higher levels as a section", async () => {
    await i18n.changeLanguage("de");
    const spell = makeSpell({
      name: "Drachenodem",
      castingTime: "Bonusaktion",
      duration: "bis zu 1 Minute",
      description: ["Du berührst eine bereitwillige Kreatur."],
      higherLevels: ["Für jeden Zauberplatzgrad über dem 2. wird der Schaden um 1W6 erhöht."],
    });
    const presentation = buildCompactPresentation(spell, body(spell), i18n.t);
    expect(presentation.displayCastingTime).toBe("B");
    expect(presentation.blocks.some((block) => block.section === "higherLevels")).toBe(true);
  });
});

describe("superscript note numbers", () => {
  it("renders Unicode superscript digits", () => {
    expect(superscriptNumber(1)).toBe("¹");
    expect(superscriptNumber(12)).toBe("¹²");
  });
});
