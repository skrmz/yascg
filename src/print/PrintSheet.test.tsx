import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { PrintSheets, type PrintCardData } from "@/print/PrintSheet.tsx";
import { parseSpellBody } from "@/markdown/parse.ts";
import { makeSpell } from "@/test/fixtures/spells.ts";

const markers = { verbal: "ⓥ", somatic: "ⓢ" };

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
    expect(screen.getByText("ⓥ Speak the word")).not.toBeNull();
    expect(screen.getByText("ⓢ Trace a sigil")).not.toBeNull();
    expect(screen.getByText("A ruby (100 gp, consumed)")).not.toBeNull();
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
