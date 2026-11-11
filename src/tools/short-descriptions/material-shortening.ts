/**
 * Deterministic runtime-eligibility rule shared by generation, validation, and
 * the authoring-to-runtime transform.
 *
 * The editor joins an array field with `\n\n`, so comparisons use the same
 * joined text. A field is materially shorter when the candidate is at least 10%
 * below the source length (implementation threshold from the specification).
 */

export interface SourceTextFields {
  description: readonly string[];
  higherLevels?: readonly string[];
}

export interface CandidateTextFields {
  description: string;
  higherLevels?: string;
}

export const MATERIAL_SHORTENING_THRESHOLD = 0.9;

export function joinField(items: readonly string[] | undefined): string {
  return (items ?? []).join("\n\n");
}

export function isMateriallyShorter(
  candidate: string,
  source: string,
  threshold = MATERIAL_SHORTENING_THRESHOLD,
): boolean {
  return candidate.length <= source.length * threshold;
}

export function isRuntimeEligible(
  entry: CandidateTextFields,
  source: SourceTextFields,
  threshold = MATERIAL_SHORTENING_THRESHOLD,
): boolean {
  if (isMateriallyShorter(entry.description, joinField(source.description), threshold)) {
    return true;
  }
  if (
    entry.higherLevels !== undefined &&
    isMateriallyShorter(entry.higherLevels, joinField(source.higherLevels), threshold)
  ) {
    return true;
  }
  return false;
}
