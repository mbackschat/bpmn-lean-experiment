import { VariableValueKind } from "./contract.js";
import type { BusinessValue, VariableBinding, VariableValue } from "./contract.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
  utf8ByteLength,
} from "./wire.js";

const maximumStringListLength = 32;
const maximumStringListMemberBytes = 1024;
const maximumStringListValueBytes = 16_384;

// Project policy of the portable-value proposal's "Finite limits"; every one applies together to one root value.
const maximumContainerDepth = 4;
const maximumContainerMembers = 32;
const maximumValueNodes = 256;
const maximumPortableTextBytes = 1024;
const maximumCanonicalValueBytes = 16_384;
const maximumDecimalCoefficientLength = "-9223372036854775808".length;
const minimumDecimalCoefficient = -(2n ** 63n);
const maximumDecimalCoefficient = 2n ** 63n - 1n;
const maximumDecimalScale = 6;

/**
 * Checks the complete representation-neutral semantic variable value domain.
 *
 * A Decimal, List or Map root is validated as one whole tree against every portable limit before the result is
 * returned, so no caller observes a partially valid collection.
 */
export function isVariableValue(value: unknown): value is VariableValue {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case VariableValueKind.Boolean:
      return isBooleanValue(value);
    case VariableValueKind.Integer:
      return isIntegerValue(value);
    case VariableValueKind.String:
      return hasOnlyKeys(value, ["kind", "value"]) &&
        isWellFormedWireString(value.value);
    case VariableValueKind.StringList:
      return isStringListValue(value);
    case VariableValueKind.Null:
      return isNullValue(value);
    case VariableValueKind.Decimal:
    case VariableValueKind.List:
    case VariableValueKind.Map:
      return isPortableRootValue(value);
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

/**
 * Compares exact semantic values, including list order and multiplicity.
 *
 * Both arguments must already satisfy `isVariableValue`; a recursive comparison of unvalidated cyclic storage does not
 * terminate.
 */
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
    case VariableValueKind.Decimal:
      return right.kind === VariableValueKind.Decimal &&
        left.coefficient === right.coefficient &&
        left.scale === right.scale;
    case VariableValueKind.List:
      return right.kind === VariableValueKind.List &&
        isDenseArray(left.value) &&
        isDenseArray(right.value) &&
        left.value.length === right.value.length &&
        left.value.every((member, index) => {
          const candidate = right.value[index];
          return candidate !== undefined && sameVariableValue(member, candidate);
        });
    case VariableValueKind.Map:
      return right.kind === VariableValueKind.Map &&
        isDenseArray(left.value) &&
        isDenseArray(right.value) &&
        left.value.length === right.value.length &&
        left.value.every((entry, index) => {
          const candidate = right.value[index];
          return candidate !== undefined &&
            entry.name === candidate.name &&
            sameVariableValue(entry.value, candidate.value);
        });
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

/** Detaches all collection storage, at every depth, while preserving exact value identity. */
export function cloneVariableValue(value: VariableValue): VariableValue {
  switch (value.kind) {
    case VariableValueKind.StringList:
      return { kind: value.kind, value: [...value.value] };
    case VariableValueKind.Boolean:
    case VariableValueKind.Integer:
    case VariableValueKind.String:
    case VariableValueKind.Null:
    case VariableValueKind.Decimal:
    case VariableValueKind.List:
    case VariableValueKind.Map:
      return cloneBusinessValue(value);
    default:
      return assertNever(value);
  }
}

function cloneBusinessValue(value: BusinessValue): BusinessValue {
  switch (value.kind) {
    case VariableValueKind.Boolean:
      return { kind: value.kind, value: value.value };
    case VariableValueKind.Integer:
      return { kind: value.kind, value: value.value };
    case VariableValueKind.String:
      return { kind: value.kind, value: value.value };
    case VariableValueKind.Null:
      return { kind: value.kind };
    case VariableValueKind.Decimal:
      return { kind: value.kind, coefficient: value.coefficient, scale: value.scale };
    case VariableValueKind.List:
      return { kind: value.kind, value: value.value.map(cloneBusinessValue) };
    case VariableValueKind.Map:
      return {
        kind: value.kind,
        value: value.value.map((entry) => ({ name: entry.name, value: cloneBusinessValue(entry.value) })),
      };
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

/** Shared node count of one root value; Map keys and entry wrappers are not value nodes. */
type NodeBudget = { remaining: number };

function isBooleanValue(value: Record<string, unknown>): boolean {
  return hasOnlyKeys(value, ["kind", "value"]) &&
    typeof value.value === "boolean";
}

function isIntegerValue(value: Record<string, unknown>): boolean {
  return hasOnlyKeys(value, ["kind", "value"]) &&
    Number.isSafeInteger(value.value) &&
    Number(value.value) >= 0 &&
    !Object.is(value.value, -0);
}

function isNullValue(value: Record<string, unknown>): boolean {
  return hasOnlyKeys(value, ["kind"]);
}

/**
 * Exact signed 64-bit coefficient text with a scale of at most six. The spelling is canonical: no sign other than
 * minus, no leading zero, no negative zero, a zero coefficient only at scale zero, and no trailing zero when the scale
 * is positive. The coefficient is compared as text, never as a JavaScript number, which would round beyond 2^53.
 */
function isDecimalValue(value: Record<string, unknown>): boolean {
  const { coefficient, scale } = value;
  if (
    !hasOnlyKeys(value, ["kind", "coefficient", "scale"]) ||
    typeof coefficient !== "string" ||
    coefficient.length > maximumDecimalCoefficientLength ||
    !/^(?:0|-?[1-9][0-9]*)$/u.test(coefficient) ||
    typeof scale !== "number" ||
    !Number.isSafeInteger(scale) ||
    scale < 0 ||
    scale > maximumDecimalScale ||
    Object.is(scale, -0)
  ) {
    return false;
  }
  const exact = BigInt(coefficient);
  if (exact < minimumDecimalCoefficient || exact > maximumDecimalCoefficient) {
    return false;
  }
  return exact === 0n ? scale === 0 : scale === 0 || !coefficient.endsWith("0");
}

function isPortableText(value: unknown): value is string {
  return isWellFormedWireString(value) &&
    utf8ByteLength(value) <= maximumPortableTextBytes;
}

/** Validates a Decimal, List or Map root against all depth, member, node and canonical-byte limits at once. */
function isPortableRootValue(value: Record<string, unknown>): boolean {
  return isPortableNode(value, 0, { remaining: maximumValueNodes }) &&
    utf8ByteLength(JSON.stringify(canonicalValueShape(value as BusinessValue))) <=
      maximumCanonicalValueBytes;
}

/** `containerDepth` counts the List/Map nodes strictly above this node, which bounds recursion on cyclic storage. */
function isPortableNode(
  value: unknown,
  containerDepth: number,
  budget: NodeBudget,
): boolean {
  if (!isRecord(value) || budget.remaining === 0) {
    return false;
  }
  budget.remaining -= 1;
  switch (value.kind) {
    case VariableValueKind.Boolean:
      return isBooleanValue(value);
    case VariableValueKind.Integer:
      return isIntegerValue(value);
    case VariableValueKind.String:
      return hasOnlyKeys(value, ["kind", "value"]) && isPortableText(value.value);
    case VariableValueKind.Null:
      return isNullValue(value);
    case VariableValueKind.Decimal:
      return isDecimalValue(value);
    case VariableValueKind.List:
      return containerDepth < maximumContainerDepth &&
        hasOnlyKeys(value, ["kind", "value"]) &&
        isBoundedDenseArray(value.value) &&
        value.value.every((member) =>
          isPortableNode(member, containerDepth + 1, budget)
        );
    case VariableValueKind.Map:
      return containerDepth < maximumContainerDepth &&
        hasOnlyKeys(value, ["kind", "value"]) &&
        isBoundedDenseArray(value.value) &&
        value.value.every((entry, index, entries) =>
          isPortableEntry(entry, index === 0 ? undefined : entries[index - 1], containerDepth, budget)
        );
    default:
      // StringList and every unknown kind end here, so the legacy arm is invalid at every nested depth.
      return false;
  }
}

function isBoundedDenseArray(value: unknown): value is ReadonlyArray<unknown> {
  return isDenseArray(value) && value.length <= maximumContainerMembers;
}

/** An entry is valid only when its name sorts strictly after the previous entry's, so aliases never validate. */
function isPortableEntry(
  entry: unknown,
  previous: unknown,
  containerDepth: number,
  budget: NodeBudget,
): boolean {
  if (
    !isRecord(entry) ||
    !hasOnlyKeys(entry, ["name", "value"]) ||
    !isPortableText(entry.name)
  ) {
    return false;
  }
  const previousName = isRecord(previous) ? previous.name : undefined;
  return (previousName === undefined ||
      compareCanonicalStrings(String(previousName), entry.name) < 0) &&
    isPortableNode(entry.value, containerDepth + 1, budget);
}

/**
 * Rebuilds an already validated value in the contract's canonical field order. Only the UTF-8 length of its JSON text
 * is consumed, so the byte ceiling cannot depend on the field order of the caller's objects.
 */
function canonicalValueShape(value: BusinessValue): unknown {
  switch (value.kind) {
    case VariableValueKind.Boolean:
    case VariableValueKind.Integer:
    case VariableValueKind.String:
      return { kind: value.kind, value: value.value };
    case VariableValueKind.Null:
      return { kind: value.kind };
    case VariableValueKind.Decimal:
      return { kind: value.kind, coefficient: value.coefficient, scale: value.scale };
    case VariableValueKind.List:
      return { kind: value.kind, value: value.value.map(canonicalValueShape) };
    case VariableValueKind.Map:
      return {
        kind: value.kind,
        value: value.value.map((entry) => ({ name: entry.name, value: canonicalValueShape(entry.value) })),
      };
    default:
      return assertNever(value);
  }
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
