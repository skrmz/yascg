import { createHash } from "node:crypto";

/**
 * Source fingerprint: SHA-256 over the selected-language normalized text that a
 * short description replaces. Metadata, formatting, and file encoding are
 * deliberately excluded, so an editorial change to the name or a reformatted
 * JSON file does not invalidate authored content.
 */

export interface FingerprintSource {
  description: readonly string[];
  higherLevels?: readonly string[];
}

export function sourceFingerprint(spell: FingerprintSource): string {
  const payload = JSON.stringify({
    description: spell.description,
    higherLevels: spell.higherLevels ?? [],
  });
  return `sha256:${createHash("sha256").update(payload, "utf8").digest("hex")}`;
}
