export const SRD_ID_PREFIX = "srd-";

export function srdIdForIndex(index: string): string {
  return `${SRD_ID_PREFIX}${index}`;
}

export function isReservedSrdId(id: string): boolean {
  return id.startsWith(SRD_ID_PREFIX);
}

export function newUuid(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  throw new Error("crypto.randomUUID is unavailable in this environment");
}

export function newEntryId(): string {
  return newUuid();
}
