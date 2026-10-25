import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import type { Spell } from "@/domain/spells";
import { makeSpell } from "@/test/fixtures/spells.ts";
import { SpellDetailsDialog } from "./SpellDetailsDialog.tsx";

const fitMock = vi.hoisted(() => ({
  useCardFit: vi.fn(),
}));

vi.mock("@/cards/fit.tsx", () => ({
  useCardFit: fitMock.useCardFit,
  AUTO_SHRINK_MIN_PT: 6,
}));

function Harness({ spell }: { spell: Spell }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <SpellDetailsDialog spell={spell} open={open} onOpenChange={setOpen} />
    </>
  );
}

beforeEach(async () => {
  fitMock.useCardFit.mockReset();
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("SpellDetailsDialog metadata", () => {
  it("renders the complete resolved metadata and badges", () => {
    render(
      <Harness
        spell={makeSpell({
          level: 3,
          school: "Evocation",
          castingTime: "1 Action",
          range: "60 feet",
          duration: "Instantaneous",
          concentration: true,
          ritual: true,
          classes: ["Wizard", "Bard"],
          subclasses: ["Cleric: War Domain", "Cleric: Arcana"],
          damageTypes: ["fire"],
          components: {
            verbal: true,
            somatic: true,
            material: true,
            materialDescription: "A ruby",
            materialCost: "100 gp",
            materialConsumed: true,
          },
        })}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Test Spell" });
    expect(within(dialog).getByText("Level 3 \u00b7 Evocation")).not.toBeNull();
    expect(within(dialog).getByText("Casting Time")).not.toBeNull();
    expect(within(dialog).getByText("1 Action")).not.toBeNull();
    expect(within(dialog).getByText("60 feet")).not.toBeNull();
    expect(within(dialog).getByText("Instantaneous")).not.toBeNull();
    expect(within(dialog).getByText("V, S, M")).not.toBeNull();
    expect(within(dialog).getByText("A ruby (100 gp, consumed)")).not.toBeNull();
    expect(within(dialog).getByText("Wizard, Bard")).not.toBeNull();
    expect(within(dialog).getByText("War Domain, Arcana")).not.toBeNull();
    expect(within(dialog).getByText("SRD 5.2.1")).not.toBeNull();
    expect(within(dialog).getByText("Concentration")).not.toBeNull();
    expect(within(dialog).getByText("Ritual")).not.toBeNull();
    expect(within(dialog).getByText("Fire")).not.toBeNull();
  });
});

describe("SpellDetailsDialog description", () => {
  it("renders the full description, higher levels, component text, lists and tables", () => {
    render(
      <Harness
        spell={makeSpell({
          description: [
            "A test spell with **bold** text.",
            "- First item\n- Second item",
            "| Save | Effect |\n| --- | --- |\n| DEX | Half damage |",
          ],
          higherLevels: ["At higher levels it grows stronger."],
          components: {
            verbal: true,
            verbalDescription: "Speak the word",
            somatic: true,
            somaticDescription: "Trace a sigil",
            material: false,
          },
        })}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Test Spell" });
    expect(within(dialog).getByText("bold")).not.toBeNull();
    expect(dialog.textContent).toContain("A test spell with bold text.");
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
    expect(within(dialog).getByRole("table")).not.toBeNull();
    expect(within(dialog).getByText("Higher Levels")).not.toBeNull();
    expect(within(dialog).getByText("At higher levels it grows stronger.")).not.toBeNull();
    expect(within(dialog).getByText("ⓥ Speak the word")).not.toBeNull();
    expect(within(dialog).getByText("ⓢ Trace a sigil")).not.toBeNull();
  });

  it("keeps an exceptionally long description complete without card fitting", () => {
    const longText = `Long text start ${"word ".repeat(1200)}long text end`;
    render(<Harness spell={makeSpell({ description: [longText] })} />);

    const dialog = screen.getByRole("dialog", { name: "Test Spell" });
    expect(dialog.textContent).toContain(longText.trim());
    expect(fitMock.useCardFit).not.toHaveBeenCalled();
  });
});

describe("SpellDetailsDialog localization", () => {
  it("localizes metadata and dialog headings in German", async () => {
    await i18n.changeLanguage("de");
    render(
      <Harness
        spell={makeSpell({
          name: "Feuerball",
          level: 3,
          school: "Evocation",
          classes: ["Wizard"],
          description: ["Ein Testzauber."],
        })}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Feuerball" });
    expect(within(dialog).getByText("Grad 3 \u00b7 Hervorrufung")).not.toBeNull();
    expect(within(dialog).getByText("Zeitaufwand")).not.toBeNull();
    expect(within(dialog).getByText("Magier")).not.toBeNull();
    expect(within(dialog).getByText("Ein Testzauber.")).not.toBeNull();
  });
});

describe("SpellDetailsDialog dismissal", () => {
  it("closes via the close button and restores the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness spell={makeSpell()} />);

    const dialog = screen.getByRole("dialog", { name: "Test Spell" });
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(screen.getByRole("dialog", { name: "Test Spell" })).not.toBeNull();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness spell={makeSpell()} />);

    expect(screen.getByRole("dialog", { name: "Test Spell" })).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
