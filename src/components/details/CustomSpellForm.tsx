import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ZodIssue } from "zod";
import { useApp } from "@/state/AppProvider.tsx";
import { createCustomSpellDraft } from "@/db/custom-spells.ts";
import {
  CORE_CLASSES,
  isCoreClass,
  LIMITS,
  SPELL_SCHOOLS,
  spellSchema,
  type CoreClass,
  type Spell,
  type SpellSchool,
} from "@/domain/spells";
import { classKey, schoolKey } from "@/locales/labels.ts";
import { message, translateMessage, type MessageDescriptor } from "@/locales/messages.ts";
import { classSummary } from "@/cards/Card.tsx";
import { Button } from "@/ui/Button.tsx";
import { Checkbox } from "@/ui/Checkbox.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/Collapsible.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { FieldError, Input, Label, NativeSelect, Textarea } from "@/ui/Field.tsx";
import { MultiSelect } from "@/ui/MultiSelect.tsx";

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
  verbalDescription: string;
  somatic: boolean;
  somaticDescription: string;
  material: boolean;
  materialDescription: string;
  materialCost: string;
  materialConsumed: boolean;
  concentration: boolean;
  ritual: boolean;
  classes: CoreClass[];
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
    verbalDescription: spell.components.verbalDescription ?? "",
    somatic: spell.components.somatic,
    somaticDescription: spell.components.somaticDescription ?? "",
    material: spell.components.material,
    materialDescription: spell.components.materialDescription ?? "",
    materialCost: spell.components.materialCost ?? "",
    materialConsumed: spell.components.materialConsumed ?? false,
    concentration: spell.concentration,
    ritual: spell.ritual,
    classes: spell.classes.filter(isCoreClass),
    description: spell.description.join("\n\n"),
    higherLevels: (spell.higherLevels ?? []).join("\n\n"),
  };
}

function validationDescriptor(issue: ZodIssue): MessageDescriptor {
  const path = issue.path.map(String).join(".");
  const root = String(issue.path[0] ?? "");
  if (root === "name") {
    return issue.code === "too_big"
      ? message("form.error.name", { max: LIMITS.NAME_MAX })
      : message("form.error.nameRequired");
  }
  if (root === "level") return message("form.error.level");
  if (root === "classes") return message("form.error.classes");
  if (root === "description") return message("form.error.description");
  if (root === "higherLevels") return message("form.error.higherLevels");
  if (root === "castingTime") {
    return message("form.error.castingTime", { max: LIMITS.FREETEXT_AUTHORED_MAX });
  }
  if (root === "range") {
    return message("form.error.range", { max: LIMITS.FREETEXT_AUTHORED_MAX });
  }
  if (root === "duration") {
    return message("form.error.duration", { max: LIMITS.FREETEXT_AUTHORED_MAX });
  }
  if (root === "components" || path.startsWith("components.")) {
    return message("form.error.metaTooLong", { max: LIMITS.META_MAX });
  }
  return message("form.error.generic");
}

export function CustomSpellForm({ open, onOpenChange, spell }: CustomSpellFormProps) {
  const { saveCustomSpell, selectSpell, saveSrdOverride, resetSrdOverride, language } = useApp();
  const { t } = useTranslation();
  const isSrd = spell?.source === "SRD-5.2.1";

  // The live `language` must never reset an open draft: read it through a ref
  // and capture it into session state only when the dialog opens.
  const languageRef = useRef(language);
  languageRef.current = language;

  const [session, setSession] = useState<{ language: string; spellId?: string }>(() => ({
    language,
    spellId: spell?.id,
  }));
  const base = useMemo(
    () => spell ?? createCustomSpellDraft(session.language),
    [spell, session.language],
  );
  const [draft, setDraft] = useState<DraftState>(() => toDraft(base));
  const [errors, setErrors] = useState<Record<string, MessageDescriptor>>({});
  const errorText = (field: string): string | undefined =>
    errors[field] ? translateMessage(t, errors[field]) : undefined;

  useEffect(() => {
    if (!open) return;
    const nextLanguage = languageRef.current;
    setSession({ language: nextLanguage, spellId: spell?.id });
    setDraft(toDraft(spell ?? createCustomSpellDraft(nextLanguage)));
    setErrors({});
  }, [open, spell]);

  const update = <K extends keyof DraftState>(key: K, value: DraftState[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const onSubmitSrd = async () => {
    if (!spell) return;
    const spellId = session.spellId ?? spell.id;
    const locale = session.language;
    const verbal = draft.verbal ? draft.verbalDescription.trim() : "";
    const somatic = draft.somatic ? draft.somaticDescription.trim() : "";
    await saveSrdOverride({
      spellId,
      locale,
      ...(verbal !== "" ? { verbalDescription: verbal } : {}),
      ...(somatic !== "" ? { somaticDescription: somatic } : {}),
    });
    onOpenChange(false);
  };

  const onReset = async () => {
    if (!spell) return;
    await resetSrdOverride(session.spellId ?? spell.id, session.language);
    onOpenChange(false);
  };

  const onSubmit = async () => {
    if (isSrd) {
      await onSubmitSrd();
      return;
    }
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
        ...(draft.verbalDescription.trim() !== ""
          ? { verbalDescription: draft.verbalDescription.trim() }
          : {}),
        ...(draft.somaticDescription.trim() !== ""
          ? { somaticDescription: draft.somaticDescription.trim() }
          : {}),
        ...(draft.material && draft.materialDescription.trim() !== ""
          ? { materialDescription: draft.materialDescription.trim() }
          : {}),
        ...(draft.material && draft.materialCost.trim() !== ""
          ? { materialCost: draft.materialCost.trim() }
          : {}),
        ...(draft.material && draft.materialConsumed ? { materialConsumed: true } : {}),
      },
      concentration: draft.concentration,
      ritual: draft.ritual,
      classes: draft.classes,
      description: [draft.description],
      ...(draft.higherLevels.trim() !== ""
        ? { higherLevels: [draft.higherLevels] }
        : { higherLevels: undefined }),
      source: "Custom",
    };

    const nextErrors: Record<string, MessageDescriptor> = {};
    const maxLength = LIMITS.FREETEXT_AUTHORED_MAX;
    if (draft.castingTime.trim().length > maxLength) {
      nextErrors.castingTime = message("form.error.castingTime", { max: maxLength });
    }
    if (draft.range.trim().length > maxLength) {
      nextErrors.range = message("form.error.range", { max: maxLength });
    }
    if (draft.duration.trim().length > maxLength) {
      nextErrors.duration = message("form.error.duration", { max: maxLength });
    }
    const parsed = spellSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!nextErrors[key]) nextErrors[key] = validationDescriptor(issue);
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
        title={t(spell ? "form.title.edit" : "form.title.new")}
        description={t(isSrd ? "form.descriptionSrd" : "form.description")}
        className="w-[min(92vw,42rem)]"
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            {isSrd && spell?.overridden ? (
              <Button variant="outline" onClick={() => void onReset()}>
                {t("form.resetToOriginal")}
              </Button>
            ) : null}
            <Button onClick={() => void onSubmit()}>{t("form.save")}</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor="cs-name">{t("form.name")}</Label>
            <Input
              id="cs-name"
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
              aria-invalid={Boolean(errors.name)}
              disabled={isSrd}
            />
            <FieldError>{errorText("name")}</FieldError>
          </div>
          <div>
            <Label htmlFor="cs-level">{t("form.level")}</Label>
            <Input
              id="cs-level"
              type="number"
              min={0}
              max={9}
              value={draft.level}
              onChange={(event) => update("level", Number(event.target.value))}
              aria-invalid={Boolean(errors.level)}
              disabled={isSrd}
            />
            <FieldError>{errorText("level")}</FieldError>
          </div>
          <div>
            <Label htmlFor="cs-school">{t("form.school")}</Label>
            <NativeSelect
              id="cs-school"
              value={draft.school}
              onChange={(event) => update("school", event.target.value as SpellSchool)}
              disabled={isSrd}
            >
              {SPELL_SCHOOLS.map((school) => (
                <option key={school} value={school}>
                  {t(schoolKey(school))}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="cs-casting">{t("spell.metadata.castingTime")}</Label>
            <Input
              id="cs-casting"
              value={draft.castingTime}
              placeholder={t("form.placeholder.castingTime")}
              onChange={(event) => update("castingTime", event.target.value)}
              aria-invalid={Boolean(errors.castingTime)}
              disabled={isSrd}
            />
            <FieldError>{errorText("castingTime")}</FieldError>
          </div>
          <div>
            <Label htmlFor="cs-range">{t("spell.metadata.range")}</Label>
            <Input
              id="cs-range"
              value={draft.range}
              placeholder={t("form.placeholder.range")}
              onChange={(event) => update("range", event.target.value)}
              aria-invalid={Boolean(errors.range)}
              disabled={isSrd}
            />
            <FieldError>{errorText("range")}</FieldError>
          </div>
          <div>
            <Label htmlFor="cs-duration">{t("spell.metadata.duration")}</Label>
            <Input
              id="cs-duration"
              value={draft.duration}
              placeholder={t("form.placeholder.duration")}
              onChange={(event) => update("duration", event.target.value)}
              aria-invalid={Boolean(errors.duration)}
              disabled={isSrd}
            />
            <FieldError>{errorText("duration")}</FieldError>
          </div>
          <div className="flex items-end gap-3">
            <Checkbox
              label={t("spell.flag.concentration")}
              checked={draft.concentration}
              disabled={isSrd}
              onChange={(event) => update("concentration", event.target.checked)}
            />
            <Checkbox
              label={t("spell.flag.ritual")}
              checked={draft.ritual}
              disabled={isSrd}
              onChange={(event) => update("ritual", event.target.checked)}
            />
          </div>
          <div className="col-span-2 flex flex-wrap items-center gap-3">
            <Checkbox
              label={t("form.verbal")}
              checked={draft.verbal}
              disabled={isSrd}
              onChange={(event) => update("verbal", event.target.checked)}
            />
            <Checkbox
              label={t("form.somatic")}
              checked={draft.somatic}
              disabled={isSrd}
              onChange={(event) => update("somatic", event.target.checked)}
            />
            <Checkbox
              label={t("form.material")}
              checked={draft.material}
              disabled={isSrd}
              onChange={(event) => update("material", event.target.checked)}
            />
          </div>
          {draft.verbal ? (
            <div className="col-span-2">
              <Label htmlFor="cs-verbal-desc">{t("form.verbalDescription")}</Label>
              <Input
                id="cs-verbal-desc"
                value={draft.verbalDescription}
                maxLength={LIMITS.META_MAX}
                onChange={(event) => update("verbalDescription", event.target.value)}
              />
            </div>
          ) : null}
          {draft.somatic ? (
            <div className="col-span-2">
              <Label htmlFor="cs-somatic-desc">{t("form.somaticDescription")}</Label>
              <Input
                id="cs-somatic-desc"
                value={draft.somaticDescription}
                maxLength={LIMITS.META_MAX}
                onChange={(event) => update("somaticDescription", event.target.value)}
              />
            </div>
          ) : null}
          {draft.material ? (
            <div className="col-span-2 space-y-2">
              <div>
                <Label htmlFor="cs-material">{t("form.materialDescription")}</Label>
                <Input
                  id="cs-material"
                  value={draft.materialDescription}
                  maxLength={LIMITS.META_MAX}
                  disabled={isSrd}
                  onChange={(event) => update("materialDescription", event.target.value)}
                />
              </div>
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm">
                    {t("form.advanced")}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-3 pt-2">
                    <div>
                      <Label htmlFor="cs-material-cost">{t("form.materialCost")}</Label>
                      <Input
                        id="cs-material-cost"
                        value={draft.materialCost}
                        maxLength={LIMITS.META_MAX}
                        disabled={isSrd}
                        onChange={(event) => update("materialCost", event.target.value)}
                      />
                    </div>
                    <Checkbox
                      label={t("form.materialConsumed")}
                      checked={draft.materialConsumed}
                      disabled={isSrd}
                      onChange={(event) => update("materialConsumed", event.target.checked)}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : null}
          <div className="col-span-2">
            <Label>{t("form.classes")}</Label>
            {isSrd && spell ? (
              <p className="text-sm text-foreground">
                {spell.classes.length > 0 ? classSummary(spell.classes, t) : t("form.classesNone")}
              </p>
            ) : (
              <>
                <MultiSelect<CoreClass>
                  aria-label={t("form.classes")}
                  allLabel={t("form.classesNone")}
                  options={CORE_CLASSES}
                  selected={draft.classes}
                  onChange={(classes) => update("classes", classes)}
                  getLabel={(cls) => {
                    const key = classKey(cls);
                    return key ? t(key) : cls;
                  }}
                />
                <FieldError>{errorText("classes")}</FieldError>
              </>
            )}
          </div>
          <div className="col-span-2">
            <Label htmlFor="cs-description">{t("form.descriptionField")}</Label>
            <Textarea
              id="cs-description"
              rows={6}
              value={draft.description}
              disabled={isSrd}
              onChange={(event) => update("description", event.target.value)}
            />
            <FieldError>{errorText("description")}</FieldError>
          </div>
          <div className="col-span-2">
            <Label htmlFor="cs-higher">{t("form.higherLevels")}</Label>
            <Textarea
              id="cs-higher"
              rows={3}
              value={draft.higherLevels}
              disabled={isSrd}
              onChange={(event) => update("higherLevels", event.target.value)}
            />
            <FieldError>{errorText("higherLevels")}</FieldError>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
