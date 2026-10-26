import type { Spell } from "@/domain/spells";

/**
 * Resolves the language of spell-authored text that is safe to expose as a
 * content `lang` attribute. Bundled, unmodified SRD text belongs to the loaded
 * dataset language. Custom records and SRD overrides can mix author languages,
 * so their provenance is not reliable enough to label them.
 */
export function resolveContentLanguage(
  spell: Pick<Spell, "source" | "overridden">,
  datasetLanguage: string,
): string | undefined {
  if (spell.source !== "SRD-5.2.1") return undefined;
  if (spell.overridden) return undefined;
  return datasetLanguage;
}
