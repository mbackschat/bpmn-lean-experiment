import { serializeCanonicalJsonValue } from "./canonical-json.js";
import {
  readOwn,
  requireExactKeys,
  requireObject,
} from "./decoder-primitives.js";
import { VariableValueKind } from "./execution-publications.js";

const maximumStringListLength = 32;
const maximumStringListMemberBytes = 1024;
const maximumStringListValueBytes = 16_384;

/** Decodes the complete representation-neutral semantic publication value union. */
export function requirePublicationVariableValue(
  value: unknown,
  label: string,
): void {
  requireObject(value, label);
  switch (readOwn(value, "kind")) {
    case VariableValueKind.Boolean:
      exact(value, label, ["kind", "value"]);
      if (typeof readOwn(value, "value") !== "boolean") {
        throw new TypeError(`${label}.value must be Boolean`);
      }
      return;
    case VariableValueKind.Integer:
      exact(value, label, ["kind", "value"]);
      requireInteger(readOwn(value, "value"), `${label}.value`);
      return;
    case VariableValueKind.String:
      exact(value, label, ["kind", "value"]);
      requireWireString(readOwn(value, "value"), `${label}.value`);
      return;
    case VariableValueKind.StringList:
      exact(value, label, ["kind", "value"]);
      requireStringList(value, readOwn(value, "value"), label);
      return;
    case VariableValueKind.Null:
      exact(value, label, ["kind"]);
      return;
    default:
      throw new TypeError(`${label}.kind is unknown`);
  }
}

function requireInteger(value: unknown, label: string): void {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    Object.is(value, -0)
  ) {
    throw new TypeError(`${label} must be a nonnegative safe integer other than negative zero`);
  }
}

function requireStringList(
  taggedValue: object,
  value: unknown,
  label: string,
): void {
  if (!isDenseArray(value) || value.length > maximumStringListLength) {
    throw new TypeError(`${label}.value must be a dense list of at most 32 strings`);
  }
  value.forEach((member, index) => {
    const decoded = requireWireString(member, `${label}.value[${index}]`);
    if (utf8ByteLength(decoded) > maximumStringListMemberBytes) {
      throw new TypeError(`${label}.value[${index}] exceeds 1024 UTF-8 bytes`);
    }
  });
  if (serializeCanonicalJsonValue(taggedValue).byteLength > maximumStringListValueBytes) {
    throw new TypeError(`${label} exceeds 16384 canonical UTF-8 bytes`);
  }
}

function requireWireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.isWellFormed()) {
    throw new TypeError(`${label} must contain well-formed Unicode`);
  }
  return value;
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value) &&
    Reflect.ownKeys(value).length === value.length + 1 &&
    Reflect.ownKeys(value).every((key) =>
      key === "length" ||
      (typeof key === "string" && /^(?:0|[1-9][0-9]*)$/u.test(key) && Number(key) < value.length)
    );
}

function utf8ByteLength(value: string): number {
  return [...value].reduce((total, scalar) => {
    const codePoint = scalar.codePointAt(0);
    if (codePoint === undefined) {
      throw new TypeError("UTF-8 sizing requires Unicode scalar values");
    }
    if (codePoint <= 0x7f) return total + 1;
    if (codePoint <= 0x7ff) return total + 2;
    return total + (codePoint <= 0xffff ? 3 : 4);
  }, 0);
}

function exact(value: object, label: string, keys: readonly string[]): void {
  requireExactKeys(value, label, keys);
}
