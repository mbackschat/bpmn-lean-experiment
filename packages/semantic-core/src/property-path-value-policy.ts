import { VariableValueKind } from "./contract.js";
import type { VariableValue } from "./contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { isSingletonBusinessItem } from "./singleton-business-item.js";

/**
 * The value domain one profile applies along the Property path: Process Property to Activity-local input copy,
 * the local scope while the Activity is open, and the DataOutput write back to a Process Property.
 *
 * It is derived from the exact Program profile and is never carried on the wire, so a command cannot select a wider
 * domain for itself. Process-interface and Call mappings keep their own scalar contract and never consult it.
 */
export const PropertyPathValuePolicy = {
  /** Existing contract: a String or an explicit Null, with the legacy String bound left to the tuple limit. */
  Scalar: "scalar",
  /** The serial portable handoff's untyped port: see `isSingletonBusinessItem`. */
  SingletonBusinessItem: "singletonBusinessItem",
} as const;

export type PropertyPathValuePolicy =
  typeof PropertyPathValuePolicy[keyof typeof PropertyPathValuePolicy];

/**
 * Only the serial portable handoff widens the path. Every other profile, including one the catalog does not know,
 * keeps the scalar contract: widening must be an explicit classification, never an inherited default.
 */
export function propertyPathValuePolicyForProfile(semanticProfile: string): PropertyPathValuePolicy {
  return semanticProfile === SemanticProfileId.PortableBusinessValuesHandoff
    ? PropertyPathValuePolicy.SingletonBusinessItem
    : PropertyPathValuePolicy.Scalar;
}

export function propertyPathAcceptsValue(policy: PropertyPathValuePolicy, value: VariableValue): boolean {
  switch (policy) {
    case PropertyPathValuePolicy.Scalar:
      return scalarValue(value);
    case PropertyPathValuePolicy.SingletonBusinessItem:
      return isSingletonBusinessItem(value);
  }
}

function scalarValue(value: VariableValue): boolean {
  switch (value.kind) {
    case VariableValueKind.String:
    case VariableValueKind.Null:
      return true;
    case VariableValueKind.Boolean:
    case VariableValueKind.Integer:
    case VariableValueKind.StringList:
    case VariableValueKind.Decimal:
    case VariableValueKind.List:
    case VariableValueKind.Map:
      return false;
  }
}
