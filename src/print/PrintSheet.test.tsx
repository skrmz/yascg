import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { PrintSheets, type PrintCardData } from "@/print/PrintSheet.tsx";
import { CARD_BACKGROUNDS } from "@/cards/backgrounds.ts";
import { parseSpellBody } from "@/markdown/parse.ts";
import { buildCompactPresentation } from "@/cards/compact.ts";
import { makeSpell } from "@/test/fixtures/spells.ts";
import i18n from "@/i18n.ts";
import { TooltipProvider } from "@/ui/Tooltip.tsx";

const markers = { verbal: "V", somatic: "S" };

describe("PrintSheets component rendering", () => {
  it("includes component markers and material details in printed output", () => {
    const spell = makeSpell({
      components: {
        verbal: true,
        verbalDescription: "Speak the word",
        somatic: true,
        somaticDescription: "Trace a sigil",
        material: true,
        materialDescription: "A ruby",
        materialCost: "100 gp",
        materialConsumed: true,
      },
    });
    const cards: PrintCardData[] = [
      {
        key: "e1-0",
        spell,
        pageBlocks: parseSpellBody(spell, "Higher Levels", markers),
        fontPt: 8,
        cardIndex: 1,
        cardCount: 1,
        truncated: false,
      },
    ];
    render(<PrintSheets cards={cards} paperSize="letter" cuttingBorders={false} />);
    expect(screen.getByText("Speak the word")).not.toBeNull();
    expect(screen.getByText("Trace a sigil")).not.toBeNull();
    expect(screen.getByLabelText("Verbal").textContent).toBe("V");
    expect(screen.getByLabelText("Somatic").textContent).toBe("S");
    expect(screen.getByText("A ruby (100 gp, consumed)")).not.toBeNull();
  });

  it("applies the selected background to printed cards", () => {
    const spell = makeSpell();
    const cards: PrintCardData[] = [
      {
        key: "e1-0",
        spell,
        pageBlocks: parseSpellBody(spell, "Higher Levels", markers),
        fontPt: 8,
        cardIndex: 1,
        cardCount: 1,
        truncated: false,
      },
    ];
    const background = CARD_BACKGROUNDS[0].id;
    const { container } = render(
      <PrintSheets
        cards={cards}
        paperSize="letter"
        cuttingBorders={false}
        background={background}
      />,
    );
    expect(
      container.querySelector(`.print-card[data-card-background="${background}"]`),
    ).not.toBeNull();
  });

  it("omits repeated metadata and material on printed continuation cards", () => {
    const spell = makeSpell({
      components: {
        verbal: true,
        somatic: false,
        material: true,
        materialDescription: "A ruby",
      },
    });
    const cards: PrintCardData[] = [
      {
        key: "e1-0",
        spell,
        pageBlocks: parseSpellBody(spell, "Higher Levels", markers),
        fontPt: 8,
        cardIndex: 1,
        cardCount: 2,
        truncated: false,
      },
      {
        key: "e1-1",
        spell,
        pageBlocks: [],
        fontPt: 8,
        cardIndex: 2,
        cardCount: 2,
        truncated: false,
      },
    ];
    render(<PrintSheets cards={cards} paperSize="letter" cuttingBorders={false} />);
    expect(screen.getAllByText("Casting Time")).toHaveLength(1);
    expect(screen.getAllByText("A ruby")).toHaveLength(1);
    expect(screen.getByText("contd.")).not.toBeNull();
    expect(screen.getByText("2/2")).not.toBeNull();
  });
});

describe("PrintSheets compact design", () => {
  it("prints compact cards with rule notes and without tooltip/dialog chrome", () => {
    const spell = makeSpell({
      name: "Glyph of Warding",
      castingTime: "1 hour",
      duration: "Until dispelled ^",
      description: ["You inscribe a glyph.", "^ or glyph triggered"],
      components: { verbal: true, somatic: true, material: false },
    });
    const blocks = parseSpellBody(spell, i18n.t("spell.higherLevels"), markers, {
      markSections: true,
    });
    const presentation = buildCompactPresentation(spell, blocks, i18n.t);
    const cards: PrintCardData[] = [
      {
        key: "e1-0",
        spell,
        pageBlocks: presentation.blocks,
        fontPt: 8,
        cardIndex: 1,
        cardCount: 1,
        truncated: false,
        presentation,
      },
    ];
    const { container } = render(
      <TooltipProvider>
        <PrintSheets cards={cards} paperSize="letter" cuttingBorders={false} design="compact" />
      </TooltipProvider>,
    );

    expect(container.querySelector(".spell-card-compact")).not.toBeNull();
    expect(screen.getByText("or glyph triggered")).not.toBeNull();
    expect(container.querySelector(".compact-notes")).not.toBeNull();
    expect(container.querySelector("[data-radix-popper-content-wrapper]")).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("omits compact metadata and notes on continuation cards", () => {
    const spell = makeSpell({
      name: "Glyph of Warding",
      duration: "Until dispelled ^",
      description: ["You inscribe a glyph.", "^ or glyph triggered"],
    });
    const blocks = parseSpellBody(spell, i18n.t("spell.higherLevels"), markers, {
      markSections: true,
    });
    const presentation = buildCompactPresentation(spell, blocks, i18n.t);
    const cards: PrintCardData[] = [
      {
        key: "e1-0",
        spell,
        pageBlocks: presentation.blocks,
        fontPt: 8,
        cardIndex: 1,
        cardCount: 2,
        truncated: false,
        presentation,
      },
      {
        key: "e1-1",
        spell,
        pageBlocks: presentation.blocks,
        fontPt: 8,
        cardIndex: 2,
        cardCount: 2,
        truncated: false,
        presentation,
      },
    ];
    const { container } = render(
      <TooltipProvider>
        <PrintSheets cards={cards} paperSize="letter" cuttingBorders={false} design="compact" />
      </TooltipProvider>,
    );
    expect(container.querySelectorAll(".compact-metadata")).toHaveLength(1);
    expect(container.querySelectorAll(".compact-notes")).toHaveLength(1);
    expect(container.querySelectorAll(".spell-card-compact")).toHaveLength(2);
    expect(screen.getByText("contd.")).not.toBeNull();
  });
});
