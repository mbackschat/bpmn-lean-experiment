export function requireObject(value: unknown, label: string): asserts value is object {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

export function requireExactKeys(
  value: object,
  label: string,
  expectedKeys: ReadonlyArray<string>,
): void {
  const actual = Reflect.ownKeys(value);
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key) => typeof key !== "string") ||
    actual.toSorted().some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} must contain exactly its public fields`);
  }
}

export function readOwn<Key extends string>(value: object, key: Key): unknown {
  if (!hasOwn(value, key)) {
    throw new TypeError(`missing required field ${key}`);
  }
  return value[key];
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}

export function requireNonemptyString(value: unknown, label: string): string {
  const decoded = requireString(value, label);
  if (decoded.length === 0) {
    throw new TypeError(`${label} must not be empty`);
  }
  if (!decoded.isWellFormed()) {
    throw new TypeError(`${label} must contain well-formed Unicode`);
  }
  return decoded;
}

export function requireNullableNonemptyString(
  value: unknown,
  label: string,
): string | null {
  return value === null ? null : requireNonemptyString(value, label);
}

export function requirePositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

export function requireNonnegativeSafeInteger(
  value: unknown,
  label: string,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function hasOwn<Key extends string>(
  value: object,
  key: Key,
): value is object & { readonly [Property in Key]: unknown } {
  return Object.hasOwn(value, key);
}
