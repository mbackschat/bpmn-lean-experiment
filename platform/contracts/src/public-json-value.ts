import { requireObject } from "./decoder-primitives.js";

/**
 * A JSON value Product 2 carries without interpreting it: engine-owned detail whose meaning the engine publishes and
 * whose exact form Product 2 only preserves.
 */
export type PublicJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly PublicJsonValue[]
  | { readonly [key: string]: PublicJsonValue };

export type PublicJsonObject = { readonly [key: string]: PublicJsonValue };

/** Accepts plain JSON only: finite numbers, well-formed strings, dense arrays and plain objects. */
export function requirePublicJsonValue(value: unknown, label: string): PublicJsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
    return value;
  }
  if (typeof value === "string") {
    if (!value.isWellFormed()) throw new TypeError(`${label} must contain well-formed Unicode`);
    return value;
  }
  if (Array.isArray(value)) {
    if (!isDenseArray(value)) throw new TypeError(`${label} must be a dense array`);
    value.forEach((item, index) => requirePublicJsonValue(item, `${label}[${index}]`));
    return value as PublicJsonValue;
  }
  return requirePublicJsonObject(value, label);
}

export function requirePublicJsonObject(value: unknown, label: string): PublicJsonObject {
  requireObject(value, label);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !key.isWellFormed()) throw new TypeError(`${label} has an invalid key`);
    requirePublicJsonValue((value as Record<string, unknown>)[key], `${label}.${key}`);
  }
  return value as PublicJsonObject;
}

export function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && Reflect.ownKeys(value).length === value.length + 1 &&
    Reflect.ownKeys(value).every((key) => key === "length" ||
      (typeof key === "string" && /^(?:0|[1-9][0-9]*)$/u.test(key) && Number(key) < value.length));
}
