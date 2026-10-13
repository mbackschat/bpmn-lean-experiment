/**
 * Locks the Property-path value policy derived from the exact Program profile: every registered profile except the
 * serial portable handoff keeps the String/Null scalar contract, and the handoff selects SingletonBusinessItem.
 *
 * The policy is package-internal and never a wire flag, so the built module is loaded directly and the classification
 * is enumerated over the whole catalog: a new profile that is not classified here still defaults to scalar, which is
 * the deliberate fail-closed direction.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { SemanticProfileId } from "@bpmn-lean/semantic-core";
import type { VariableValue } from "@bpmn-lean/semantic-core";
import { decimal, emptyMap, integer, list, nothing, order, stringList, text, truth } from "./portable-handoff-fixture.ts";

type PolicyModule = Readonly<{
  PropertyPathValuePolicy: Readonly<{ Scalar: string; SingletonBusinessItem: string }>;
  propertyPathValuePolicyForProfile: (semanticProfile: string) => string;
  propertyPathAcceptsValue: (policy: string, value: VariableValue) => boolean;
}>;

async function policyModule(): Promise<PolicyModule> {
  return await import(new URL("../dist/property-path-value-policy.js", import.meta.url).href) as PolicyModule;
}

test("only the serial portable handoff selects the SingletonBusinessItem policy", async () => {
  const { PropertyPathValuePolicy, propertyPathValuePolicyForProfile } = await policyModule();
  assert.ok(Object.values(SemanticProfileId).length > 40, "the catalog enumeration must not be vacuous");
  for (const profile of Object.values(SemanticProfileId)) {
    assert.equal(propertyPathValuePolicyForProfile(profile),
      profile === SemanticProfileId.PortableBusinessValuesHandoff
        ? PropertyPathValuePolicy.SingletonBusinessItem : PropertyPathValuePolicy.Scalar, profile);
  }
  assert.equal(propertyPathValuePolicyForProfile("unknown-profile"), PropertyPathValuePolicy.Scalar);
});

test("the scalar policy keeps exactly String and Null, including a long legacy String", async () => {
  const { PropertyPathValuePolicy, propertyPathAcceptsValue } = await policyModule();
  const scalar = (value: VariableValue) => propertyPathAcceptsValue(PropertyPathValuePolicy.Scalar, value);
  assert.deepEqual([text("x"), text("a".repeat(5000)), nothing].map(scalar), [true, true, true]);
  assert.deepEqual([truth(true), integer(1), stringList("a"), decimal("1", 0), list(), emptyMap, order].map(scalar),
    [false, false, false, false, false, false, false]);
});

test("the SingletonBusinessItem policy accepts the amendment's port domain and nothing else", async () => {
  const { PropertyPathValuePolicy, propertyPathAcceptsValue } = await policyModule();
  const item = (value: VariableValue) => propertyPathAcceptsValue(PropertyPathValuePolicy.SingletonBusinessItem, value);
  assert.deepEqual([text("x"), nothing, truth(false), integer(0), decimal("-125", 2), emptyMap, order].map(item),
    [true, true, true, true, true, true, true]);
  assert.deepEqual([list(), stringList("a"), text("a".repeat(1025))].map(item), [false, false, false]);
});
