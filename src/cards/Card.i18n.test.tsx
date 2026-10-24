import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { CardView } from "@/cards/Card.tsx";
import { parseSpellBody } from "@/markdown/parse.ts";
import type { Spell } from "@/domain/spells";

const markers = { verbal: "ⓥ", somatic: "ⓢ" };

const fireball: Spell = {
  id: "srd-fireball",
  name: "Feuerball",
  level: 3,
  school: "Evocation",
  castingTime: "Aktion",
  range: "45 Meter",
  components: { verbal: true, somatic: true, material: true },
  duration: "Sofort",
  concentration: true,
  ritual: false,
  classes: ["Wizard", "Sorcerer"],
  description: ["Base text"],
  source: "SRD-5.2.1",
};

const cantrip: Spell = {
  ...fireball,
  id: "srd-fire-bolt",
  name: "Feuerstrahl",
  level: 0,
  concentration: false,
};

async function setLocale(code: string) {
  await act(async () => {
    await i18n.changeLanguage(code);
  });
}

afterEach(async () => {
  await setLocale("en");
});

function renderCard(spell: Spell) {
  return render(<CardView spell={spell} blocks={[]} cardIndex={1} cardCount={1} fontPt={8} />);
}

describe("CardView localization", () => {
  it("renders English terminology by default", async () => {
    await setLocale("en");
    const { container } = renderCard(fireball);
    expect(screen.getByText(/Level 3/)).not.toBeNull();
    expect(screen.getByText(/Evocation/)).not.toBeNull();
    expect(screen.getByText("Casting Time")).not.toBeNull();
    expect(screen.getByText("V, S, M")).not.toBeNull();
    expect(screen.getByText("Concentration")).not.toBeNull();
    expect(screen.getByText("Wizard, Sorcerer")).not.toBeNull();
    expect(container.querySelector("article")?.getAttribute("lang")).toBe("en");
  });

  it("renders German terminology and localized component letters", async () => {
    await setLocale("de");
    const { container } = renderCard(fireball);
    expect(screen.getByText(/Grad 3/)).not.toBeNull();
    expect(screen.getByText(/Hervorrufung/)).not.toBeNull();
    expect(screen.getByText("Zeitaufwand")).not.toBeNull();
    expect(screen.getByText("V, G, M")).not.toBeNull();
    expect(screen.getByText("Konzentration")).not.toBeNull();
    expect(screen.getByText("Magier, Zauberer")).not.toBeNull();
    expect(container.querySelector("article")?.getAttribute("lang")).toBe("de");
  });

  it("localizes the Cantrip level label", async () => {
    await setLocale("de");
    renderCard(cantrip);
    expect(screen.getByText(/Zaubertrick/)).not.toBeNull();
  });

  it("localizes and reverts labels across an EN to DE to EN round trip", async () => {
    await setLocale("en");
    const { container } = renderCard(fireball);
    const article = () => container.querySelector("article");
    expect(screen.getByText("Casting Time")).not.toBeNull();

    await setLocale("de");
    expect(screen.getByText("Zeitaufwand")).not.toBeNull();
    expect(screen.queryByText("Casting Time")).toBeNull();
    expect(article()?.getAttribute("lang")).toBe("de");

    await setLocale("en");
    expect(screen.getByText("Casting Time")).not.toBeNull();
    expect(screen.queryByText("Zeitaufwand")).toBeNull();
    expect(article()?.getAttribute("lang")).toBe("en");
  });
});

describe("CardView component and material rendering", () => {
  it("renders component-description blocks with localized markers", () => {
    const spell: Spell = {
      ...fireball,
      components: {
        verbal: true,
        verbalDescription: "Speak the word",
        somatic: true,
        somaticDescription: "Trace a sigil",
        material: false,
      },
    };
    render(
      <CardView
        spell={spell}
        blocks={parseSpellBody(spell, "Higher Levels", markers)}
        cardIndex={1}
        cardCount={1}
        fontPt={8}
      />,
    );
    expect(screen.getByText("ⓥ Speak the word")).not.toBeNull();
    expect(screen.getByText("ⓢ Trace a sigil")).not.toBeNull();
  });

  it("renders the material line only when the material component is enabled", () => {
    const enabled: Spell = {
      ...fireball,
      components: {
        verbal: true,
        somatic: true,
        material: true,
        materialDescription: "A ruby",
        materialCost: "100 gp",
        materialConsumed: true,
      },
    };
    const { unmount } = render(
      <CardView spell={enabled} blocks={[]} cardIndex={1} cardCount={1} fontPt={8} />,
    );
    expect(screen.getByText("A ruby (100 gp, consumed)")).not.toBeNull();
    unmount();

    const disabled: Spell = { ...enabled, components: { ...enabled.components, material: false } };
    render(<CardView spell={disabled} blocks={[]} cardIndex={1} cardCount={1} fontPt={8} />);
    expect(screen.queryByText(/A ruby/)).toBeNull();
  });

  it("shows an asterisk on the footer source label for an overridden SRD spell", () => {
    render(
      <CardView
        spell={{ ...fireball, overridden: true }}
        blocks={[]}
        cardIndex={1}
        cardCount={1}
        fontPt={8}
      />,
    );
    expect(screen.getByText("SRD 5.2.1 *")).not.toBeNull();
  });

  it("includes the material line inside the measured region", () => {
    const enabled: Spell = {
      ...fireball,
      components: {
        verbal: true,
        somatic: true,
        material: true,
        materialDescription: "A ruby",
        materialCost: "100 gp",
        materialConsumed: true,
      },
    };
    const bodyRef = { current: null as HTMLDivElement | null };
    render(
      <CardView
        spell={enabled}
        blocks={[]}
        cardIndex={1}
        cardCount={1}
        fontPt={8}
        bodyRef={bodyRef}
      />,
    );
    expect(bodyRef.current).not.toBeNull();
    expect(bodyRef.current!.querySelector(".card-material")?.textContent).toBe(
      "A ruby (100 gp, consumed)",
    );
    expect(bodyRef.current!.querySelector(".card-body")).not.toBeNull();
  });
});
