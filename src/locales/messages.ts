import type { TFunction } from "i18next";
import { en } from "./en.ts";

type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type MessageKey = Paths<typeof en>;

type ValueAt<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? ValueAt<T[Head], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

type InterpolationParameters<S extends string> = S extends `${string}{{${infer Name}}}${infer Rest}`
  ? Name | InterpolationParameters<Rest>
  : never;

export type MessageValue = string | number | boolean;

type ValuesFor<K extends MessageKey> =
  InterpolationParameters<Extract<ValueAt<typeof en, K>, string>> extends never
    ? undefined
    : Record<InterpolationParameters<Extract<ValueAt<typeof en, K>, string>>, MessageValue>;

type DescriptorFor<K extends MessageKey> = [ValuesFor<K>] extends [undefined]
  ? { key: K; values?: undefined }
  : { key: K; values: ValuesFor<K> };

export type MessageDescriptor = {
  [K in MessageKey]: DescriptorFor<K>;
}[MessageKey];

const keyCache = new Map<string, boolean>();

function hasMessageKey(key: string): boolean {
  const cached = keyCache.get(key);
  if (cached !== undefined) return cached;
  let current: unknown = en;
  for (const segment of key.split(".")) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, segment)) {
      keyCache.set(key, false);
      return false;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  const result = typeof current === "string";
  keyCache.set(key, result);
  return result;
}

function catalogString(key: string): string {
  let current: unknown = en;
  for (const segment of key.split(".")) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, segment)) {
      throw new Error(`Unknown translation key "${key}".`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current !== "string") throw new Error(`Translation key "${key}" is not a string.`);
  return current;
}

function requiredParameters(key: string): string[] {
  const matches = catalogString(key).matchAll(/\{\{([^{}]+)\}\}/g);
  return [...new Set(Array.from(matches, (match) => match[1]))];
}

function assertDescriptor(key: string, values: unknown): asserts key is MessageKey {
  if (!hasMessageKey(key)) throw new Error(`Unknown translation key "${key}".`);
  const required = requiredParameters(key);
  if (required.length === 0) return;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error(`Translation key "${key}" requires values: ${required.join(", ")}.`);
  }
  const record = values as Record<string, unknown>;
  for (const name of required) {
    const value = record[name];
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(`Translation key "${key}" is missing a valid "${name}" value.`);
    }
  }
}

export function message<K extends MessageKey>(
  key: K,
  ...args: [ValuesFor<K>] extends [undefined] ? [] : [values: ValuesFor<K>]
): MessageDescriptor {
  const values = args[0] as Record<string, MessageValue> | undefined;
  assertDescriptor(key, values);
  return { key, ...(values ? { values } : {}) } as MessageDescriptor;
}

export function translateMessage(t: TFunction, descriptor: MessageDescriptor): string {
  assertDescriptor(descriptor.key, descriptor.values);
  const translate = t as unknown as (key: string, options?: Record<string, MessageValue>) => string;
  return translate(descriptor.key, descriptor.values);
}

export class AppError extends Error {
  readonly descriptor: MessageDescriptor;

  constructor(descriptor: MessageDescriptor, diagnostic: string = descriptor.key) {
    super(diagnostic);
    this.name = "AppError";
    this.descriptor = descriptor;
  }
}

export function toMessageDescriptor(error: unknown): MessageDescriptor {
  if (error instanceof AppError) return error.descriptor;
  console.error("Unexpected application error:", error);
  return message("error.generic");
}
