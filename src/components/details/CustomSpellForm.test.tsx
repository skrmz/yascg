import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { CORE_CLASSES, spellSchema, type Spell } from "@/domain/spells";
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

describe("CustomSpellForm editable copies", () => {
  it("renders the copy title and description", () => {
    render(<CustomSpellForm open onOpenChange={() => {}} spell={makeCustomSpell()} editableCopy />);
    expect(screen.getByRole("dialog", { name: "Create editable copy" })).not.toBeNull();
    expect(screen.getByText(/keeps the text and language captured/)).not.toBeNull();
  });

  it("calls onSaved without selecting when selectOnSave is false", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const saved = makeCustomSpell({ id: "copy-1", name: "Test Spell" });
    mocks.saveCustomSpell.mockResolvedValue(saved);
    render(
      <CustomSpellForm
        open
        onOpenChange={() => {}}
        spell={makeCustomSpell({ id: "copy-1", name: "Test Spell" })}
        editableCopy
        selectOnSave={false}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save spell" }));

    expect(mocks.saveCustomSpell).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(mocks.selectSpell).not.toHaveBeenCalled();
  });

  it("saves long metadata up to the runtime schema limit", async () => {
    const user = userEvent.setup();
    mocks.saveCustomSpell.mockResolvedValue(makeCustomSpell());
    const longText = "x".repeat(200);
    renderForm(makeCustomSpell());
    fireEvent.change(screen.getByLabelText("Casting Time"), { target: { value: longText } });
    await user.click(screen.getByRole("button", { name: "Save spell" }));

    const saved = mocks.saveCustomSpell.mock.calls[0][0] as Spell;
    expect(saved.castingTime).toBe(longText);
  });

  it("preserves unexposed fields on an ordinary edit of a copy", async () => {
    const user = userEvent.setup();
    const existing = makeCustomSpell({
      subclasses: ["Wizard: Evocation"],
      savingThrow: "DEX",
      damageTypes: ["Fire"],
      components: {
        verbal: true,
        somatic: true,
        material: false,
        componentsDisplayOverride: "V, S, M (a ruby)",
      },
    });
    mocks.saveCustomSpell.mockResolvedValue(existing);
    renderForm(existing);
    await user.click(screen.getByRole("button", { name: "Save spell" }));

    const saved = mocks.saveCustomSpell.mock.calls[0][0] as Spell;
    expect(saved.subclasses).toEqual(["Wizard: Evocation"]);
    expect(saved.savingThrow).toBe("DEX");
    expect(saved.damageTypes).toEqual(["Fire"]);
    expect(saved.components.componentsDisplayOverride).toBe("V, S, M (a ruby)");
  });

  it("keeps the form open and skips onSaved when saving fails", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    mocks.saveCustomSpell.mockResolvedValue(null);
    render(
      <CustomSpellForm
        open
        onOpenChange={() => {}}
        spell={makeCustomSpell({ id: "copy-1", name: "Test Spell" })}
        editableCopy
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save spell" }));

    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Create editable copy" })).not.toBeNull();
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

describe("CustomSpellForm abbreviation", () => {
  const abbreviateButton = () => screen.getByRole("button", { name: "Abbreviate" });
  const undoButton = () => screen.getByRole("button", { name: "Undo abbreviation" });
  const descriptionInput = () => screen.getByLabelText("Description (Markdown)");
  const castingTimeInput = () => screen.getByLabelText("Casting Time");
  const rangeInput = () => screen.getByLabelText("Range");
  const durationInput = () => screen.getByLabelText("Duration");

  it("offers abbreviation for new, custom-edit, and editable-copy drafts but not SRD overrides", () => {
    const fresh = renderForm();
    expect(abbreviateButton()).not.toBeNull();
    fresh.unmount();

    const custom = renderForm(makeCustomSpell());
    expect(abbreviateButton()).not.toBeNull();
    custom.unmount();

    const copy = render(
      <CustomSpellForm open onOpenChange={() => {}} spell={makeCustomSpell()} editableCopy />,
    );
    expect(abbreviateButton()).not.toBeNull();
    copy.unmount();

    renderForm(makeSpell());
    expect(screen.queryByRole("button", { name: "Abbreviate" })).toBeNull();
  });

  it("transforms only the scoped draft fields and preserves unexposed data", async () => {
    const user = userEvent.setup();
    const existing = makeCustomSpell({
      name: "Scoped Spell",
      castingTime: "bonus action",
      range: "willing creature",
      duration: "until dispelled",
      description: ["A **bonus action** and damage resistance."],
      higherLevels: ["At higher levels, a bonus action."],
      subclasses: ["Wizard: Evocation"],
      savingThrow: "DEX",
      damageTypes: ["Fire"],
      components: {
        verbal: false,
        verbalDescription: "whisper a bonus action",
        somatic: false,
        somaticDescription: "trace a bonus action",
        material: false,
        materialDescription: "a bonus action",
        materialCost: "bonus action",
        componentsDisplayOverride: "V, S, M (a bonus action)",
      },
    });
    mocks.saveCustomSpell.mockResolvedValue(existing);

    renderForm(existing);
    await user.click(abbreviateButton());

    expect((castingTimeInput() as HTMLInputElement).value).toBe("BA");
    expect((rangeInput() as HTMLInputElement).value).toBe("willing creature");
    expect((durationInput() as HTMLInputElement).value).toBe("disp.");
    expect((descriptionInput() as HTMLTextAreaElement).value).toBe("A **BA** and RES.");
    expect(
      (screen.getByLabelText("Higher levels (Markdown, optional)") as HTMLTextAreaElement).value,
    ).toBe("At higher levels, a BA.");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Scoped Spell");

    await user.click(screen.getByRole("button", { name: "Save spell" }));
    const saved = mocks.saveCustomSpell.mock.calls[0][0] as Spell;
    expect(saved.components.verbalDescription).toBe("whisper a BA");
    expect(saved.components.somaticDescription).toBe("trace a BA");
    expect(saved.components.componentsDisplayOverride).toBe("V, S, M (a bonus action)");
    expect(saved.subclasses).toEqual(["Wizard: Evocation"]);
    expect(saved.savingThrow).toBe("DEX");
    expect(saved.damageTypes).toEqual(["Fire"]);
    expect(saved.name).toBe("Scoped Spell");
  });

  it("does not transform automatically on open, save, or live language change", async () => {
    const user = userEvent.setup();
    const existing = makeCustomSpell({
      castingTime: "bonus action",
      description: ["bonus action"],
    });
    mocks.saveCustomSpell.mockResolvedValue(existing);

    renderForm(existing);
    expect((castingTimeInput() as HTMLInputElement).value).toBe("bonus action");
    expect((descriptionInput() as HTMLTextAreaElement).value).toBe("bonus action");

    await i18n.changeLanguage("de");
    expect((screen.getByLabelText("Zeitaufwand") as HTMLInputElement).value).toBe("bonus action");
    expect((screen.getByLabelText("Beschreibung (Markdown)") as HTMLTextAreaElement).value).toBe(
      "bonus action",
    );
    await i18n.changeLanguage("en");

    await user.click(screen.getByRole("button", { name: "Save spell" }));
    const saved = mocks.saveCustomSpell.mock.calls[0][0] as Spell;
    expect(saved.castingTime).toBe("bonus action");
    expect(saved.description).toEqual(["bonus action"]);
  });

  it("reports a no-match status without pushing an undo entry", async () => {
    const user = userEvent.setup();
    renderForm(
      makeCustomSpell({
        castingTime: "Special",
        range: "—",
        duration: "—",
        description: ["xyz"],
        higherLevels: [],
      }),
    );

    await user.click(abbreviateButton());

    expect(screen.getByRole("status").textContent).toBe("No abbreviations were applied.");
    expect((undoButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("reports unavailable localized abbreviations for unsupported languages without changing the draft", async () => {
    const user = userEvent.setup();
    mocks.language.value = "fr";

    renderForm();
    await user.click(abbreviateButton());

    expect(screen.getByRole("status").textContent).toBe(
      "No localized abbreviations are available for this language.",
    );
    expect((castingTimeInput() as HTMLInputElement).value).toBe("1 Action");
  });

  it("restores changed fields on undo and leaves unrelated later edits intact", async () => {
    const user = userEvent.setup();
    renderForm(
      makeCustomSpell({
        castingTime: "bonus action",
        range: "Self",
        duration: "Special",
        description: ["bonus action"],
      }),
    );

    await user.click(abbreviateButton());
    expect((descriptionInput() as HTMLTextAreaElement).value).toBe("BA");
    expect((castingTimeInput() as HTMLInputElement).value).toBe("BA");

    await user.clear(descriptionInput());
    await user.type(descriptionInput(), "manual edit");
    await user.clear(rangeInput());
    await user.type(rangeInput(), "10 feet");

    await user.click(undoButton());

    expect((descriptionInput() as HTMLTextAreaElement).value).toBe("bonus action");
    expect((castingTimeInput() as HTMLInputElement).value).toBe("bonus action");
    expect((rangeInput() as HTMLInputElement).value).toBe("10 feet");
    expect(screen.getByRole("status").textContent).toBe("Abbreviation undone.");
  });

  it("undoes repeated actions in last-in-first-out order", async () => {
    const user = userEvent.setup();
    renderForm(
      makeCustomSpell({
        castingTime: "Special",
        range: "—",
        duration: "—",
        description: ["bonus action"],
      }),
    );

    await user.click(abbreviateButton());
    expect((descriptionInput() as HTMLTextAreaElement).value).toBe("BA");

    await user.clear(descriptionInput());
    await user.type(descriptionInput(), "bonus action again");
    await user.click(abbreviateButton());
    expect((descriptionInput() as HTMLTextAreaElement).value).toBe("BA again");

    await user.click(undoButton());
    expect((descriptionInput() as HTMLTextAreaElement).value).toBe("bonus action again");
    await user.click(undoButton());
    expect((descriptionInput() as HTMLTextAreaElement).value).toBe("bonus action");
    expect((undoButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("clears the undo stack when the dialog closes and reopens", async () => {
    const user = userEvent.setup();
    const spell = makeCustomSpell({
      castingTime: "Special",
      range: "—",
      duration: "—",
      description: ["bonus action"],
    });
    const { rerender } = render(<CustomSpellForm open onOpenChange={() => {}} spell={spell} />);

    await user.click(abbreviateButton());
    expect((undoButton() as HTMLButtonElement).disabled).toBe(false);

    rerender(<CustomSpellForm open={false} onOpenChange={() => {}} spell={spell} />);
    rerender(<CustomSpellForm open onOpenChange={() => {}} spell={spell} />);

    expect((undoButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("clears the undo stack when a different spell opens", async () => {
    const user = userEvent.setup();
    const first = makeCustomSpell({
      id: "custom-1",
      castingTime: "Special",
      range: "—",
      duration: "—",
      description: ["bonus action"],
    });
    const second = makeCustomSpell({
      id: "custom-2",
      castingTime: "Special",
      range: "—",
      duration: "—",
      description: ["bonus action"],
    });
    const { rerender } = render(<CustomSpellForm open onOpenChange={() => {}} spell={first} />);

    await user.click(abbreviateButton());
    expect((undoButton() as HTMLButtonElement).disabled).toBe(false);

    rerender(<CustomSpellForm open onOpenChange={() => {}} spell={second} />);

    expect((undoButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves a transformed draft through validation and preserves identity", async () => {
    const user = userEvent.setup();
    const existing = makeCustomSpell({
      castingTime: "1 Action",
      description: ["bonus action"],
    });
    mocks.saveCustomSpell.mockResolvedValue(existing);

    renderForm(existing);
    await user.click(abbreviateButton());
    await user.click(screen.getByRole("button", { name: "Save spell" }));

    expect(mocks.saveCustomSpell).toHaveBeenCalledTimes(1);
    const saved = mocks.saveCustomSpell.mock.calls[0][0] as Spell;
    expect(saved.id).toBe(existing.id);
    expect(saved.source).toBe("Custom");
    expect(saved.castingTime).toBe("1 A");
    expect(saved.description).toEqual(["BA"]);
    expect(spellSchema.safeParse(saved).success).toBe(true);
  });

  it("persists nothing when the dialog is cancelled after abbreviating", async () => {
    const user = userEvent.setup();
    renderForm(makeCustomSpell({ description: ["bonus action"] }));

    await user.click(abbreviateButton());
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mocks.saveCustomSpell).not.toHaveBeenCalled();
  });

  it("keeps English UI labels unchanged after abbreviating", async () => {
    const user = userEvent.setup();
    renderForm(makeCustomSpell({ description: ["bonus action"] }));

    await user.click(abbreviateButton());

    expect(screen.getByLabelText("Casting Time")).not.toBeNull();
    expect(screen.getByLabelText("Range")).not.toBeNull();
    expect(screen.getByLabelText("Duration")).not.toBeNull();
  });

  it("keeps German UI labels unchanged and matches with the captured German language", async () => {
    const user = userEvent.setup();
    mocks.language.value = "de";
    await i18n.changeLanguage("de");
    renderForm(
      makeCustomSpell({
        castingTime: "1 Aktion",
        range: "Selbst",
        duration: "Unmittelbar",
        description: ["Eine Bonusaktion."],
      }),
    );

    await i18n.changeLanguage("en");
    await user.click(abbreviateButton());

    expect((castingTimeInput() as HTMLInputElement).value).toBe("1 A");
    expect((descriptionInput() as HTMLTextAreaElement).value).toBe("Eine BA.");
    expect((durationInput() as HTMLInputElement).value).toBe("unm.");
    expect(screen.getByLabelText("Casting Time")).not.toBeNull();
    expect(screen.getByLabelText("Range")).not.toBeNull();
    expect(screen.getByLabelText("Duration")).not.toBeNull();
  });
});
