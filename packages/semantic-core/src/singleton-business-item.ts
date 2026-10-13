import { VariableValueKind } from "./contract.js";
import { isVariableValue } from "./variable-value.js";
import { utf8ByteLength } from "./wire.js";

/**
 * Root String bound of the SingletonBusinessItem port domain. The legacy root String keeps its larger content-bound
 * tuple limit everywhere else, so this bound belongs to the port, never to the generic value contract.
 */
export const maximumSingletonBusinessItemStringBytes = 1024;

/**
 * Whether one value may occupy a single untyped Data Input/Output port of the serial portable handoff.
 *
 * A port value is String, Null, Boolean, Integer, Decimal or Map of the portable value contract. A root List stays
 * excluded because it would denote a collection on a port that declares none, while a List nested in a Map is one field
 * of one structured record. The legacy `StringList` is excluded at every depth by the value contract itself. The root
 * String bound cannot be expressed in the kind table, so this predicate is the single owner every Property-path point
 * consults.
 */
export function isSingletonBusinessItem(value: unknown): boolean {
  if (!isVariableValue(value)) {
    return false;
  }
  switch (value.kind) {
    case VariableValueKind.String:
      return utf8ByteLength(value.value) <= maximumSingletonBusinessItemStringBytes;
    case VariableValueKind.Null:
    case VariableValueKind.Boolean:
    case VariableValueKind.Integer:
    case VariableValueKind.Decimal:
    case VariableValueKind.Map:
      return true;
    case VariableValueKind.List:
    case VariableValueKind.StringList:
      return false;
    default:
      return assertNever(value);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported variable value: ${JSON.stringify(value)}`);
}
