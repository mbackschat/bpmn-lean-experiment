import { VariableValueKind } from "./contract.js";
import type { VariableValue } from "./contract.js";
import { embeddedScopeDataBearing } from "./scope-data-bearing.js";
import type { DataGateProgram } from "./scope-data-bearing.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { isSingletonBusinessItem, maximumSingletonBusinessItemStringBytes } from "./singleton-business-item.js";
import { utf8ByteLength } from "./wire.js";

/**
 * The value domain one profile applies to Service Task effect mapping: the enclosing values copied into an argument
 * snapshot, the argument snapshot itself, and the result patch bound in the Activity-local scope.
 *
 * It is derived from the exact Program, its profile and, for the embedded completion profile, whether it carries data,
 * and is never carried on the wire, so a command cannot select a wider domain for itself. It is the effect-side
 * analogue of `PropertyPathValuePolicy`; the two are independent because a profile may widen one path only.
 */
export const EffectMappingValuePolicy = {
  /** Existing contract: a String, and a Null only where the call permits one. */
  Scalar: "scalar",
  /** The structured effect-data profile's untyped port: see `isSingletonBusinessItem`. */
  SingletonBusinessItem: "singletonBusinessItem",
  /**
   * CSD-VALUE-01: a String of at most the SingletonBusinessItem root bound, or a Null that is always a present value.
   * The embedded completion profile selects it for data-bearing Programs only.
   */
  BoundedString: "boundedString",
} as const;

export type EffectMappingValuePolicy =
  typeof EffectMappingValuePolicy[keyof typeof EffectMappingValuePolicy];

/**
 * Only the structured effect-data and nested scope-data profiles, and data-bearing embedded completion Programs, widen
 * effect mapping. Every other Program, including one of a profile the catalog does not know, keeps the scalar contract:
 * widening must be an explicit classification, never an inherited default.
 */
export function effectMappingValuePolicyForProgram(program: DataGateProgram): EffectMappingValuePolicy {
  const { semanticProfile } = program.identity;
  if (semanticProfile === SemanticProfileId.PortableBusinessEffectData ||
      semanticProfile === SemanticProfileId.NestedEmbeddedScopeData) return EffectMappingValuePolicy.SingletonBusinessItem;
  return embeddedScopeDataBearing(program) ? EffectMappingValuePolicy.BoundedString : EffectMappingValuePolicy.Scalar;
}

/**
 * Whether one value may cross effect mapping under the policy.
 *
 * `allowNull` is the scalar contract's per-call distinction between profiles that treat a Null result as an absent
 * output and those that treat it as a value. A `SingletonBusinessItem` Null is always a present value, so that arm
 * ignores it, as does the bounded String arm.
 */
export function effectMappingAcceptsValue(
  policy: EffectMappingValuePolicy,
  value: VariableValue,
  allowNull: boolean,
): boolean {
  switch (policy) {
    case EffectMappingValuePolicy.Scalar:
      return value.kind === VariableValueKind.String || (value.kind === VariableValueKind.Null && allowNull);
    case EffectMappingValuePolicy.SingletonBusinessItem:
      return isSingletonBusinessItem(value);
    case EffectMappingValuePolicy.BoundedString:
      return value.kind === VariableValueKind.Null ||
        (value.kind === VariableValueKind.String && utf8ByteLength(value.value) <= maximumSingletonBusinessItemStringBytes);
  }
}
