import { VariableValueKind } from "./contract.js";
import type { VariableValue } from "./contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { isSingletonBusinessItem } from "./singleton-business-item.js";

/**
 * The value domain one profile applies to Service Task effect mapping: the enclosing values copied into an argument
 * snapshot, the argument snapshot itself, and the result patch bound in the Activity-local scope.
 *
 * It is derived from the exact Program profile and is never carried on the wire, so a command cannot select a wider
 * domain for itself. It is the effect-side analogue of `PropertyPathValuePolicy`; the two are independent because a
 * profile may widen one path only.
 */
export const EffectMappingValuePolicy = {
  /** Existing contract: a String, and a Null only where the call permits one. */
  Scalar: "scalar",
  /** The structured effect-data profile's untyped port: see `isSingletonBusinessItem`. */
  SingletonBusinessItem: "singletonBusinessItem",
} as const;

export type EffectMappingValuePolicy =
  typeof EffectMappingValuePolicy[keyof typeof EffectMappingValuePolicy];

/**
 * Only the structured effect-data and nested scope-data profiles widen effect mapping. Every other profile, including
 * one the catalog does not know, keeps the scalar contract: widening must be an explicit classification, never an
 * inherited default.
 */
export function effectMappingValuePolicyForProfile(semanticProfile: string): EffectMappingValuePolicy {
  return semanticProfile === SemanticProfileId.PortableBusinessEffectData ||
      semanticProfile === SemanticProfileId.NestedEmbeddedScopeData
    ? EffectMappingValuePolicy.SingletonBusinessItem
    : EffectMappingValuePolicy.Scalar;
}

/**
 * Whether one value may cross effect mapping under the policy.
 *
 * `allowNull` is the scalar contract's per-call distinction between profiles that treat a Null result as an absent
 * output and those that treat it as a value. A `SingletonBusinessItem` Null is always a present value, so that arm
 * ignores it.
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
  }
}
