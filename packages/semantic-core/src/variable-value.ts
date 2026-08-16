import { VariableValueKind } from "./contract.js";
import type { VariableBinding, VariableValue } from "./contract.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
  utf8ByteLength,
} from "./wire.js";

const maximumStringListLength = 32;
const maximumStringListMemberBytes = 1024;
const maximumStringListValueBytes = 16_384;

/** Checks the complete representation-neutral semantic variable value domain. */
export function isVariableValue(value: unknown): value is VariableValue {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case VariableValueKind.Boolean:
      return hasOnlyKeys(value, ["kind", "value"]) &&
        typeof value.value === "boolean";
    case VariableValueKind.Integer:
      return hasOnlyKeys(value, ["kind", "value"]) &&
        Number.isSafeInteger(value.value) &&
        Number(value.value) >= 0 &&
        !Object.is(value.value, -0);
    case VariableValueKind.String:
      return hasOnlyKeys(value, ["kind", "value"]) &&
        isWellFormedWireString(value.value);
    case VariableValueKind.StringList:
      return isStringListValue(value);
    case VariableValueKind.Null:
      return hasOnlyKeys(value, ["kind"]);
    default:
      return false;
  }
}

/** Checks one exact binding and its generic value without selecting a profile surface. */
export function isVariableBinding(value: unknown): value is VariableBinding {
  return isRecord(value) &&
    hasOnlyKeys(value, ["name", "value"]) &&
    isWellFormedWireString(value.name) &&
    value.name.length > 0 &&
    isVariableValue(value.value);
}

/** Rejects holes and every non-index own property before array iteration. */
export function isDenseArray(
  value: unknown,
): value is ReadonlyArray<unknown> {
  if (!Array.isArray(value)) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== value.length + 1 ||
    !ownKeys.includes("length")
  ) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      return false;
    }
  }
  return true;
}

/** Checks one exact generic variable patch, including dense canonical array storage. */
export function isVariablePatch(
  value: unknown,
): value is ReadonlyArray<VariableBinding> {
  return isDenseArray(value) &&
    value.every(isVariableBinding) &&
    isCanonicallyOrderedVariablePatch(value);
}

/** Checks unique binding names in canonical Unicode-scalar order. */
export function isCanonicallyOrderedVariablePatch(
  value: ReadonlyArray<unknown>,
): boolean {
  if (!isDenseArray(value)) {
    return false;
  }
  const patch = value as ReadonlyArray<VariableBinding>;
  return patch.every((binding, index) =>
    index === 0 ||
    compareCanonicalStrings(String(patch[index - 1]?.name), binding.name) < 0
  );
}

/** Compares exact semantic values, including list order and multiplicity. */
export function sameVariableValue(
  left: VariableValue,
  right: VariableValue,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case VariableValueKind.Boolean:
      return right.kind === VariableValueKind.Boolean &&
        left.value === right.value;
    case VariableValueKind.Integer:
      return right.kind === VariableValueKind.Integer &&
        left.value === right.value;
    case VariableValueKind.String:
      return right.kind === VariableValueKind.String &&
        left.value === right.value;
    case VariableValueKind.StringList:
      return right.kind === VariableValueKind.StringList &&
        isDenseArray(left.value) &&
        isDenseArray(right.value) &&
        left.value.length === right.value.length &&
        left.value.every((member, index) => member === right.value[index]);
    case VariableValueKind.Null:
      return true;
    default:
      return assertNever(left);
  }
}

export function sameVariablePatch(
  left: ReadonlyArray<VariableBinding>,
  right: ReadonlyArray<VariableBinding>,
): boolean {
  return isDenseArray(left) &&
    isDenseArray(right) &&
    left.length === right.length &&
    left.every((binding, index) => {
      const candidate = right[index];
      return candidate !== undefined &&
        binding.name === candidate.name &&
        sameVariableValue(binding.value, candidate.value);
    });
}

/** Detaches all collection storage while preserving exact value identity. */
export function cloneVariableValue(value: VariableValue): VariableValue {
  switch (value.kind) {
    case VariableValueKind.Boolean:
      return { kind: value.kind, value: value.value };
    case VariableValueKind.Integer:
      return { kind: value.kind, value: value.value };
    case VariableValueKind.String:
      return { kind: value.kind, value: value.value };
    case VariableValueKind.StringList:
      return { kind: value.kind, value: [...value.value] };
    case VariableValueKind.Null:
      return { kind: value.kind };
    default:
      return assertNever(value);
  }
}

export function cloneVariableBinding(binding: VariableBinding): VariableBinding {
  return { name: binding.name, value: cloneVariableValue(binding.value) };
}

function isStringListValue(value: Record<string, unknown>): boolean {
  if (
    !hasOnlyKeys(value, ["kind", "value"]) ||
    !isDenseArray(value.value) ||
    value.value.length > maximumStringListLength ||
    !value.value.every(
      (member) =>
        isWellFormedWireString(member) &&
        utf8ByteLength(member) <= maximumStringListMemberBytes,
    )
  ) {
    return false;
  }
  const taggedValue = JSON.stringify({
    kind: VariableValueKind.StringList,
    value: value.value,
  });
  return utf8ByteLength(taggedValue) <= maximumStringListValueBytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length &&
    actual.every((key) => keys.includes(key));
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported variable value: ${JSON.stringify(value)}`);
}
