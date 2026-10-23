import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { CORE_CLASSES, type Spell } from "@/domain/spells";
import { makeCustomSpell } from "@/test/fixtures/spells.ts";
import { CustomSpellForm } from "./CustomSpellForm.tsx";

const mocks = vi.hoisted(() => ({
  saveCustomSpell: vi.fn(),
  selectSpell: vi.fn(),
}));

vi.mock("@/state/AppProvider.tsx", () => ({
  useApp: () => ({
    saveCustomSpell: mocks.saveCustomSpell,
    selectSpell: mocks.selectSpell,
  }),
}));

function renderForm(spell?: Spell) {
  return render(<CustomSpellForm open onOpenChange={() => {}} spell={spell} />);
}

async function openClasses(user: ReturnType<typeof userEvent.setup>, name = "Classes") {
  await user.click(screen.getByRole("button", { name }));
}

beforeEach(async () => {
  mocks.saveCustomSpell.mockReset();
  mocks.selectSpell.mockReset();
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("CustomSpellForm class selection", () => {
  it("offers exactly the 12 core classes", async () => {
    const user = userEvent.setup();
    renderForm();
    await openClasses(user);
    expect(screen.getAllByRole("listitem")).toHaveLength(CORE_CLASSES.length);
    for (const cls of CORE_CLASSES) {
      expect(screen.getByRole("checkbox", { name: cls })).not.toBeNull();
    }
  });

  it("localizes class labels to German", async () => {
    await i18n.changeLanguage("de");
    const user = userEvent.setup();
    renderForm();
    await openClasses(user, "Klassen");
    expect(screen.getAllByRole("listitem")).toHaveLength(CORE_CLASSES.length);
    expect(screen.getByRole("checkbox", { name: "Magier" })).not.toBeNull();
    expect(screen.getByRole("checkbox", { name: "Kämpfer" })).not.toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Wizard" })).toBeNull();
  });

  it("saves multiple selected classes as canonical identifiers", async () => {
    const user = userEvent.setup();
    mocks.saveCustomSpell.mockResolvedValue(makeCustomSpell({ classes: ["Bard", "Wizard"] }));
    renderForm();
    await user.type(screen.getByLabelText("Name"), "Homebrew");
    await openClasses(user);
    await user.click(screen.getByRole("checkbox", { name: "Bard" }));
    await user.click(screen.getByRole("checkbox", { name: "Wizard" }));
    await user.click(screen.getByRole("button", { name: "Save spell" }));
    expect(mocks.saveCustomSpell).toHaveBeenCalledTimes(1);
    const saved = mocks.saveCustomSpell.mock.calls[0][0] as Spell;
    expect(saved.classes).toEqual(["Bard", "Wizard"]);
  });

  it("preserves valid class assignments when editing an existing custom spell", async () => {
    const user = userEvent.setup();
    const existing = makeCustomSpell({ classes: ["Wizard", "Bard"] });
    mocks.saveCustomSpell.mockResolvedValue(existing);
    renderForm(existing);
    await openClasses(user);
    expect((screen.getByRole("checkbox", { name: "Wizard" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByRole("checkbox", { name: "Bard" }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save spell" }));
    const saved = mocks.saveCustomSpell.mock.calls[0][0] as Spell;
    expect(saved.classes).toEqual(["Wizard", "Bard"]);
  });

  it("drops unsupported identifiers from legacy custom spell data", async () => {
    const user = userEvent.setup();
    const legacy = makeCustomSpell({ classes: ["Wizard", "Artificer"] });
    mocks.saveCustomSpell.mockResolvedValue(legacy);
    renderForm(legacy);
    await openClasses(user);
    expect(screen.getAllByRole("listitem")).toHaveLength(CORE_CLASSES.length);
    expect(screen.queryByRole("checkbox", { name: "Artificer" })).toBeNull();
    expect((screen.getByRole("checkbox", { name: "Wizard" }) as HTMLInputElement).checked).toBe(
      true,
    );
    await user.click(screen.getByRole("button", { name: "Save spell" }));
    const saved = mocks.saveCustomSpell.mock.calls[0][0] as Spell;
    expect(saved.classes).toEqual(["Wizard"]);
  });
});
