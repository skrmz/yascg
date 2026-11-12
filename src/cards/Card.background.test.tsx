import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { CardView } from "@/cards/Card.tsx";
import { CARD_BACKGROUNDS } from "@/cards/backgrounds.ts";
import { buildCompactPresentation } from "@/cards/compact.ts";
import { parseSpellBody } from "@/markdown/parse.ts";
import { makeSpell } from "@/test/fixtures/spells.ts";
import { TooltipProvider } from "@/ui/Tooltip.tsx";

const spell = makeSpell();
const blocks = parseSpellBody(spell, i18n.t("spell.higherLevels"), {
  verbal: "V",
  somatic: "S",
});
const presentation = buildCompactPresentation(spell, blocks, i18n.t);

const background = CARD_BACKGROUNDS[0].id;

function renderCard(backgroundId?: string) {
  return render(
    <TooltipProvider>
      <CardView
        spell={spell}
        blocks={presentation.blocks}
        cardIndex={1}
        cardCount={1}
        fontPt={8}
        design="compact"
        presentation={presentation}
        background={backgroundId}
      />
    </TooltipProvider>,
  );
}

describe("CardView background", () => {
  it("marks the card and sets the image variable for a selected texture", () => {
    const { container } = renderCard(background);
    const article = container.querySelector("article");
    expect(article).not.toBeNull();
    expect(article?.getAttribute("data-card-background")).toBe(background);
    expect(article?.style.getPropertyValue("--card-background-image")).toContain(".jpg");
  });

  it("leaves the card unmarked with the default background", () => {
    const { container } = renderCard();
    const article = container.querySelector("article");
    expect(article).not.toBeNull();
    expect(article?.hasAttribute("data-card-background")).toBe(false);
    expect(article?.style.getPropertyValue("--card-background-image")).toBe("");
  });
});
