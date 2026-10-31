import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { buildCompactPresentation } from "@/cards/compact.ts";
import { CompactCardView } from "@/cards/CompactCard.tsx";
import { parseSpellBody } from "@/markdown/parse.ts";
import type { Spell } from "@/domain/spells";
import { makeSpell } from "@/test/fixtures/spells.ts";
import { TooltipProvider } from "@/ui/Tooltip.tsx";

const markers = { verbal: "ⓥ", somatic: "ⓢ" };

async function setLocale(code: string) {
  await act(async () => {
    await i18n.changeLanguage(code);
  });
}

afterEach(async () => {
  await setLocale("en");
});

function presentationFor(spell: Spell) {
  const blocks = parseSpellBody(spell, i18n.t("spell.higherLevels"), markers, {
    markSections: true,
  });
  return buildCompactPresentation(spell, blocks, i18n.t);
}

const dragonsBreathEn: Spell = makeSpell({
  id: "srd-dragons-breath",
  name: "Dragon's Breath",
  level: 2,
  school: "Transmutation",
  castingTime: "Bonus Action",
  range: "Touch",
  components: {
    verbal: true,
    somatic: true,
    material: true,
    materialDescription: "a hot pepper",
  },
  duration: "up to 1 minute",
  concentration: true,
  classes: ["Sorcerer", "Wizard"],
  description: ["You touch one willing creature."],
});

const dragonsBreathDe: Spell = makeSpell({
  ...dragonsBreathEn,
  name: "Drachenodem",
  castingTime: "Bonusaktion",
  range: "Berührung",
  components: {
    verbal: true,
    somatic: true,
    material: true,
    materialDescription: "eine scharfe Pfefferschote",
  },
  duration: "bis zu 1 Minute",
  description: ["Du berührst eine bereitwillige Kreatur."],
  higherLevels: ["Für jeden Zauberplatzgrad über dem 2. wird der Schaden um 1W6 erhöht."],
});

function renderCompact(spell: Spell, overrides: Record<string, unknown> = {}) {
  const presentation = presentationFor(spell);
  return {
    presentation,
    ...render(
      <TooltipProvider>
        <CompactCardView
          spell={spell}
          blocks={presentation.blocks}
          cardIndex={1}
          cardCount={1}
          fontPt={8}
          presentation={presentation}
          contentLanguage={i18n.resolvedLanguage ?? "en"}
          {...overrides}
        />
      </TooltipProvider>,
    ),
  };
}

describe("CompactCardView Dragon's Breath", () => {
  it("renders the English compact hierarchy and abbreviations", () => {
    const { container } = renderCompact(dragonsBreathEn);
    expect(screen.getByLabelText("Level 2").textContent).toBe("2");
    expect(container.querySelector(".compact-casting")?.textContent).toContain("B");
    expect(screen.getByText("Touch")).not.toBeNull();
    expect(screen.getByText("up to 1 minute")).not.toBeNull();
    expect(
      Array.from(container.querySelectorAll(".compact-component-box")).map(
        (element) => element.textContent,
      ),
    ).toEqual(["V", "S", "M"]);
    expect(
      Array.from(container.querySelectorAll(".compact-component-box .compact-glyph")).map(
        (element) => element.textContent,
      ),
    ).toEqual(["V", "S", "M"]);
    expect(container.querySelector(".compact-concentration")?.textContent).toBe("C");
    expect(container.querySelector(".compact-concentration .compact-glyph")?.textContent).toBe("C");
    expect(container.querySelector(".compact-material")?.textContent).toBe("a hot pepper");
    expect(container.querySelector(".compact-footer-source")?.textContent).toBe("SRD 5.2.1");
    expect(container.querySelector(".compact-footer-school")?.textContent).toBe("TRN");
    expect(container.querySelector(".compact-footer-classes")?.textContent).toBe("SOR · WIZ");
    expect(container.querySelector(".compact-higher")).toBeNull();
  });

  it("renders German abbreviations and the higher-level section", async () => {
    await setLocale("de");
    const { container } = renderCompact(dragonsBreathDe);
    expect(screen.getByLabelText("Grad 2").textContent).toBe("2");
    expect(
      Array.from(container.querySelectorAll(".compact-component-box")).map(
        (element) => element.textContent,
      ),
    ).toEqual(["V", "G", "M"]);
    expect(container.querySelector(".compact-footer-source")?.textContent).toBe("SRD 5.2.1");
    expect(container.querySelector(".compact-footer-school")?.textContent).toBe("VWD");
    expect(container.querySelector(".compact-footer-classes")?.textContent).toBe("ZAU · MAG");
    expect(container.querySelector(".compact-higher-marker")?.textContent).toBe("(+)");
    expect(container.querySelector(".compact-higher")?.textContent).toContain("1W6");
  });
});

describe("CompactCardView notes", () => {
  const glyph: Spell = makeSpell({
    id: "srd-glyph-of-warding",
    name: "Glyph of Warding",
    level: 3,
    school: "Abjuration",
    castingTime: "1 hour",
    range: "Touch",
    duration: "Until dispelled ^",
    description: [
      "You inscribe a glyph that later unleashes a magical effect.",
      "^ or glyph triggered",
    ],
    classes: ["Bard", "Cleric", "Wizard"],
  });

  it("links the header superscript to the visible note item", () => {
    const { container } = renderCompact(glyph);
    const marker = container.querySelector(".compact-note-marker");
    expect(marker?.textContent).toBe("¹");
    const noteId = marker?.getAttribute("aria-describedby");
    expect(noteId).toBeTruthy();
    const note = document.getElementById(noteId as string);
    expect(note?.textContent).toContain("or glyph triggered");
    expect(container.querySelector(".compact-notes")).not.toBeNull();
    expect(screen.getByText("Until dispelled")).not.toBeNull();
  });

  it("keeps note ids unique across multiple card instances", () => {
    const presentation = presentationFor(glyph);
    const { unmount } = render(
      <TooltipProvider>
        <CompactCardView
          spell={glyph}
          blocks={presentation.blocks}
          cardIndex={1}
          cardCount={1}
          fontPt={8}
          presentation={presentation}
        />
        <CompactCardView
          spell={glyph}
          blocks={presentation.blocks}
          cardIndex={1}
          cardCount={1}
          fontPt={8}
          presentation={presentation}
        />
      </TooltipProvider>,
    );
    const markers = Array.from(document.querySelectorAll(".compact-note-marker"));
    expect(markers).toHaveLength(2);
    expect(markers[0]?.getAttribute("aria-describedby")).not.toBe(
      markers[1]?.getAttribute("aria-describedby"),
    );
    unmount();
  });

  it("omits metadata, material, and notes on continuation cards", () => {
    const { container } = renderCompact(glyph, { cardIndex: 2, cardCount: 3 });
    expect(container.querySelector(".compact-metadata")).toBeNull();
    expect(container.querySelector(".compact-material")).toBeNull();
    expect(container.querySelector(".compact-notes")).toBeNull();
    expect(container.querySelector(".compact-note-marker")).toBeNull();
    expect(screen.getByText("Glyph of Warding")).not.toBeNull();
    expect(screen.getByText("contd.")).not.toBeNull();
    expect(screen.getByText("2/3")).not.toBeNull();
    expect(container.querySelector(".compact-header > .compact-continuation")).not.toBeNull();
    expect(container.querySelector(".compact-title-row .compact-continuation")).toBeNull();
    expect(container.querySelector(".compact-continuation-school")).toBeNull();
    expect(container.querySelector(".compact-continuation")?.textContent).toBe("contd.");
    expect(container.querySelector(".compact-footer-school")?.textContent).toBe("ABJ");
  });

  it("keeps the pagination line immediately above the footer", () => {
    const { container } = renderCompact(glyph, { cardIndex: 1, cardCount: 2 });
    const pagination = container.querySelector(".compact-pagination");
    expect(pagination?.nextElementSibling?.classList.contains("compact-footer")).toBe(true);
  });
});

describe("CompactCardView components and footer fallbacks", () => {
  it("renders a component override, standalone C, and em dash classes", () => {
    const spell = makeSpell({
      components: {
        verbal: true,
        somatic: true,
        material: true,
        componentsDisplayOverride: "V, S, M (special)",
      },
      concentration: true,
      classes: [],
    });
    const { container } = renderCompact(spell);
    expect(container.querySelector(".compact-component-override")?.textContent).toBe(
      "V, S, M (special)",
    );
    expect(container.querySelectorAll(".compact-component-box")).toHaveLength(0);
    expect(container.querySelector(".compact-concentration")?.textContent).toBe("C");
    expect(container.querySelector(".compact-footer-classes")?.textContent).toBe("\u2014");
  });

  it("keeps homebrew class names unmapped and shows ritual R", () => {
    const spell = makeSpell({ ritual: true, classes: ["Artificer"] });
    const { container } = renderCompact(spell);
    expect(container.querySelector(".compact-ritual")?.textContent).toBe("R");
    expect(container.querySelector(".compact-footer-classes")?.textContent).toBe("Artificer");
  });

  it("uses the actual source label for overridden SRD spells", () => {
    const spell = makeSpell({ overridden: true });
    const { container } = renderCompact(spell);
    expect(container.querySelector(".compact-footer-source")?.textContent).toBe("SRD 5.2.1 *");
  });
});
