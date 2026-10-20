import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/state/AppProvider.tsx";
import { createCustomSpellDraft } from "@/db/custom-spells.ts";
import { LIMITS, SPELL_SCHOOLS, spellSchema, type Spell, type SpellSchool } from "@/domain/spells";
import { Button } from "@/ui/Button.tsx";
import { Checkbox } from "@/ui/Checkbox.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { FieldError, Input, Label, NativeSelect, Textarea } from "@/ui/Field.tsx";

export interface CustomSpellFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spell?: Spell;
}

interface DraftState {
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  duration: string;
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  materialDescription: string;
  concentration: boolean;
  ritual: boolean;
  classes: string;
  description: string;
  higherLevels: string;
}

function toDraft(spell: Spell): DraftState {
  return {
    name: spell.name,
    level: spell.level,
    school: spell.school,
    castingTime: spell.castingTime,
    range: spell.range,
    duration: spell.duration,
    verbal: spell.components.verbal,
    somatic: spell.components.somatic,
    material: spell.components.material,
    materialDescription: spell.components.materialDescription ?? "",
    concentration: spell.concentration,
    ritual: spell.ritual,
    classes: spell.classes.join(", "),
    description: spell.description.join("\n\n"),
    higherLevels: (spell.higherLevels ?? []).join("\n\n"),
  };
}

export function CustomSpellForm({ open, onOpenChange, spell }: CustomSpellFormProps) {
  const { saveCustomSpell, selectSpell } = useApp();
  const base = useMemo(() => spell ?? createCustomSpellDraft(), [spell]);
  const [draft, setDraft] = useState<DraftState>(() => toDraft(base));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDraft(toDraft(base));
      setErrors({});
    }
  }, [open, base]);

  const update = <K extends keyof DraftState>(key: K, value: DraftState[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const onSubmit = async () => {
    const classes = draft.classes
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const candidate: Spell = {
      ...base,
      name: draft.name.trim(),
      level: draft.level,
      school: draft.school,
      castingTime: draft.castingTime.trim(),
      range: draft.range.trim(),
      duration: draft.duration.trim(),
      components: {
        verbal: draft.verbal,
        somatic: draft.somatic,
        material: draft.material,
        ...(draft.material && draft.materialDescription.trim() !== ""
          ? { materialDescription: draft.materialDescription.trim() }
          : {}),
      },
      concentration: draft.concentration,
      ritual: draft.ritual,
      classes,
      description: [draft.description],
      ...(draft.higherLevels.trim() !== ""
        ? { higherLevels: [draft.higherLevels] }
        : { higherLevels: undefined }),
      source: "Custom",
    };

    const nextErrors: Record<string, string> = {};
    if (draft.castingTime.trim().length > LIMITS.FREETEXT_AUTHORED_MAX) {
      nextErrors.castingTime = `Casting time must be at most ${LIMITS.FREETEXT_AUTHORED_MAX} characters.`;
    }
    if (draft.range.trim().length > LIMITS.FREETEXT_AUTHORED_MAX) {
      nextErrors.range = `Range must be at most ${LIMITS.FREETEXT_AUTHORED_MAX} characters.`;
    }
    if (draft.duration.trim().length > LIMITS.FREETEXT_AUTHORED_MAX) {
      nextErrors.duration = `Duration must be at most ${LIMITS.FREETEXT_AUTHORED_MAX} characters.`;
    }
    const parsed = spellSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const saved = await saveCustomSpell(parsed.success ? parsed.data : candidate);
    if (saved) {
      selectSpell(saved.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={spell ? "Edit custom spell" : "New custom spell"}
        description="Custom spells are stored locally and never modify bundled SRD data."
        className="w-[min(92vw,42rem)]"
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onSubmit()}>Save spell</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor="cs-name">Name</Label>
            <Input
              id="cs-name"
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
              aria-invalid={Boolean(errors.name)}
            />
            <FieldError>{errors.name}</FieldError>
          </div>
          <div>
            <Label htmlFor="cs-level">Level (0-9)</Label>
            <Input
              id="cs-level"
              type="number"
              min={0}
              max={9}
              value={draft.level}
              onChange={(event) => update("level", Number(event.target.value))}
              aria-invalid={Boolean(errors.level)}
            />
            <FieldError>{errors.level}</FieldError>
          </div>
          <div>
            <Label htmlFor="cs-school">School</Label>
            <NativeSelect
              id="cs-school"
              value={draft.school}
              onChange={(event) => update("school", event.target.value as SpellSchool)}
            >
              {SPELL_SCHOOLS.map((school) => (
                <option key={school} value={school}>
                  {school}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="cs-casting">Casting time</Label>
            <Input
              id="cs-casting"
              value={draft.castingTime}
              onChange={(event) => update("castingTime", event.target.value)}
              aria-invalid={Boolean(errors.castingTime)}
            />
            <FieldError>{errors.castingTime}</FieldError>
          </div>
          <div>
            <Label htmlFor="cs-range">Range</Label>
            <Input
              id="cs-range"
              value={draft.range}
              onChange={(event) => update("range", event.target.value)}
              aria-invalid={Boolean(errors.range)}
            />
            <FieldError>{errors.range}</FieldError>
          </div>
          <div>
            <Label htmlFor="cs-duration">Duration</Label>
            <Input
              id="cs-duration"
              value={draft.duration}
              onChange={(event) => update("duration", event.target.value)}
              aria-invalid={Boolean(errors.duration)}
            />
            <FieldError>{errors.duration}</FieldError>
          </div>
          <div className="flex items-end gap-3">
            <Checkbox
              label="Concentration"
              checked={draft.concentration}
              onChange={(event) => update("concentration", event.target.checked)}
            />
            <Checkbox
              label="Ritual"
              checked={draft.ritual}
              onChange={(event) => update("ritual", event.target.checked)}
            />
          </div>
          <div className="col-span-2 flex flex-wrap items-center gap-3">
            <Checkbox
              label="Verbal"
              checked={draft.verbal}
              onChange={(event) => update("verbal", event.target.checked)}
            />
            <Checkbox
              label="Somatic"
              checked={draft.somatic}
              onChange={(event) => update("somatic", event.target.checked)}
            />
            <Checkbox
              label="Material"
              checked={draft.material}
              onChange={(event) => update("material", event.target.checked)}
            />
          </div>
          {draft.material ? (
            <div className="col-span-2">
              <Label htmlFor="cs-material">Material description</Label>
              <Input
                id="cs-material"
                value={draft.materialDescription}
                onChange={(event) => update("materialDescription", event.target.value)}
              />
            </div>
          ) : null}
          <div className="col-span-2">
            <Label htmlFor="cs-classes">Classes (comma-separated)</Label>
            <Input
              id="cs-classes"
              value={draft.classes}
              onChange={(event) => update("classes", event.target.value)}
            />
            <FieldError>{errors.classes}</FieldError>
          </div>
          <div className="col-span-2">
            <Label htmlFor="cs-description">Description (Markdown)</Label>
            <Textarea
              id="cs-description"
              rows={6}
              value={draft.description}
              onChange={(event) => update("description", event.target.value)}
            />
            <FieldError>{errors.description}</FieldError>
          </div>
          <div className="col-span-2">
            <Label htmlFor="cs-higher">Higher levels (Markdown, optional)</Label>
            <Textarea
              id="cs-higher"
              rows={3}
              value={draft.higherLevels}
              onChange={(event) => update("higherLevels", event.target.value)}
            />
            <FieldError>{errors.higherLevels}</FieldError>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
