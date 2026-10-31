import type { TFunction } from "i18next";
import type { CharacterClass, Spell } from "@/domain/spells";
import { classKey, componentKey } from "@/locales/labels.ts";

export function componentSummary(spell: Spell, t: TFunction): string {
  const override = spell.components.componentsDisplayOverride?.trim();
  if (override) return override;
  const letters: string[] = [];
  if (spell.components.verbal) letters.push(t(componentKey("verbal")));
  if (spell.components.somatic) letters.push(t(componentKey("somatic")));
  if (spell.components.material) letters.push(t(componentKey("material")));
  return letters.length > 0 ? letters.join(", ") : "\u2014";
}

export function classSummary(classes: readonly CharacterClass[], t: TFunction): string {
  return classes
    .map((name) => {
      const key = classKey(name);
      return key ? t(key) : name;
    })
    .join(", ");
}

/**
 * Composes the material-detail line from description, cost, and an optional
 * consumed qualifier. Returns `null` when the material component is disabled or
 * no detail text exists, so no empty parentheses or stray separators render.
 */
export function materialDetailText(spell: Spell, t: TFunction): string | null {
  const components = spell.components;
  if (!components.material) return null;
  const description = components.materialDescription?.trim() ?? "";
  const details: string[] = [];
  const cost = components.materialCost?.trim();
  if (cost) details.push(cost);
  if (components.materialConsumed) details.push(t("spell.metadata.materialConsumed"));
  if (description === "" && details.length === 0) return null;
  if (description === "") return details.join(", ");
  if (details.length === 0) return description;
  return `${description} (${details.join(", ")})`;
}

export function metadataRows(spell: Spell, t: TFunction): Array<{ label: string; value: string }> {
  return [
    { label: t("spell.metadata.castingTime"), value: spell.castingTime },
    { label: t("spell.metadata.range"), value: spell.range },
    { label: t("spell.metadata.components"), value: componentSummary(spell, t) },
    { label: t("spell.metadata.duration"), value: spell.duration },
  ];
}
