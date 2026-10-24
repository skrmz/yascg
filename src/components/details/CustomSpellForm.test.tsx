import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { CORE_CLASSES, type Spell } from "@/domain/spells";
import { makeCustomSpell, makeSpell } from "@/test/fixtures/spells.ts";
import { CustomSpellForm } from "./CustomSpellForm.tsx";

const mocks = vi.hoisted(() => ({
  saveCustomSpell: vi.fn(),
  selectSpell: vi.fn(),
  saveSrdOverride: vi.fn(),
  resetSrdOverride: vi.fn(),
  language: { value: "en" },
}));

vi.mock("@/state/AppProvider.tsx", () => ({
  useApp: () => ({
    saveCustomSpell: mocks.saveCustomSpell,
    selectSpell: mocks.selectSpell,
    saveSrdOverride: mocks.saveSrdOverride,
    resetSrdOverride: mocks.resetSrdOverride,
    get language() {
      return mocks.language.value;
    },
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
  mocks.saveSrdOverride.mockReset();
  mocks.resetSrdOverride.mockReset();
  mocks.language.value = "en";
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

describe("CustomSpellForm component authoring", () => {
  it("applies localized placeholders to free-text inputs", () => {
    renderForm();
    expect(screen.getByLabelText("Casting Time").getAttribute("placeholder")).toBe(
      "action | bonus action | reaction | x minutes | x hours",
    );
    expect(screen.getByLabelText("Range").getAttribute("placeholder")).toContain("Unlimited");
    expect(screen.getByLabelText("Duration").getAttribute("placeholder")).toContain(
      "Until dispelled",
    );
  });

  it("seeds localized defaults for the active language", () => {
    mocks.language.value = "de";
    renderForm();
    expect((screen.getByLabelText("Casting Time") as HTMLInputElement).value).toBe("1 Aktion");
    expect((screen.getByLabelText("Range") as HTMLInputElement).value).toBe("Selbst");
  });

  it("shows the V/S description inputs only when the component is checked and retains text", async () => {
    const user = userEvent.setup();
    mocks.saveCustomSpell.mockResolvedValue(makeCustomSpell());
    renderForm();
    expect(screen.queryByLabelText("Verbal description")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Verbal" }));
    await user.type(screen.getByLabelText("Verbal description"), "Speak the word");
    await user.click(screen.getByRole("checkbox", { name: "Verbal" }));
    // Keep-but-hide: unchecking hides the input without clearing the value.
    expect(screen.queryByLabelText("Verbal description")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Verbal" }));
    expect((screen.getByLabelText("Verbal description") as HTMLInputElement).value).toBe(
      "Speak the word",
    );
  });

  it("exposes material cost and consumed behind the Advanced collapsible", async () => {
    const user = userEvent.setup();
    mocks.saveCustomSpell.mockResolvedValue(makeCustomSpell());
    renderForm();
    expect(screen.queryByLabelText("Material cost")).toBeNull();
    await user.type(screen.getByLabelText("Name"), "Homebrew");
    await user.click(screen.getByRole("checkbox", { name: "Material" }));
    await user.type(screen.getByLabelText("Material description"), "A ruby");
    await user.click(screen.getByRole("button", { name: "Advanced / Optional" }));
    await user.type(screen.getByLabelText("Material cost"), "100 gp");
    await user.click(screen.getByRole("checkbox", { name: "Consumed on casting" }));
    await user.click(screen.getByRole("button", { name: "Save spell" }));
    const saved = mocks.saveCustomSpell.mock.calls[0][0] as Spell;
    expect(saved.components.materialCost).toBe("100 gp");
    expect(saved.components.materialConsumed).toBe(true);
  });
});

describe("CustomSpellForm SRD override mode", () => {
  it("renders standard fields read-only and classes as static text", () => {
    renderForm(makeSpell({ classes: ["Wizard", "Bard"] }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Casting Time") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Wizard, Bard")).not.toBeNull();
    // No custom-spell class picker in SRD mode.
    expect(screen.queryByRole("button", { name: "Classes" })).toBeNull();
  });

  it("saves an override targeting the captured spell id and locale without touching custom spells", async () => {
    const user = userEvent.setup();
    mocks.language.value = "de";
    mocks.saveSrdOverride.mockResolvedValue(null);
    renderForm(makeSpell({ id: "srd-fireball" }));
    await user.type(screen.getByLabelText("Somatic description"), "Trace a sigil");
    await user.click(screen.getByRole("button", { name: "Save spell" }));
    expect(mocks.saveCustomSpell).not.toHaveBeenCalled();
    expect(mocks.saveSrdOverride).toHaveBeenCalledWith({
      spellId: "srd-fireball",
      locale: "de",
      somaticDescription: "Trace a sigil",
    });
  });

  it("offers reset only for overridden spells and targets the captured identity", async () => {
    const user = userEvent.setup();
    mocks.resetSrdOverride.mockResolvedValue(true);
    renderForm(makeSpell({ id: "srd-fireball", overridden: true }));
    await user.click(screen.getByRole("button", { name: "Reset to original" }));
    expect(mocks.resetSrdOverride).toHaveBeenCalledWith("srd-fireball", "en");
  });

  it("hides reset for a vanilla SRD spell", () => {
    renderForm(makeSpell({ id: "srd-fireball" }));
    expect(screen.queryByRole("button", { name: "Reset to original" })).toBeNull();
  });
});
