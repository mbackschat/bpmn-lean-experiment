import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EffectMappingValuePolicy, MappingExpressionKind, SemanticOperationKind, SemanticProfileId, VariableValueKind,
  effectMappingAcceptsValue, effectMappingValuePolicyForProgram,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, VariableValue } from "@bpmn-lean/semantic-core";
const { nestedScopeDataProgram } =
  await import(new URL("../dist/nested-scope-data.js", import.meta.url).href) as typeof import("../src/nested-scope-data.ts");
const { VariableWriteSurface, profileAllowsVariableBindings } = await import(
  new URL("../dist/semantic-profile-value-domain.js", import.meta.url).href) as typeof import("../src/semantic-profile-value-domain.ts");

/**
 * The data-bearing gate of the concurrent scope data proposal: an embedded completion Program carries data exactly when
 * it has a scope declaration or a mapped Service Task, and only then do its surfaces take the bounded String domain
 * (CSD-VALUE-01). A data-free Program of that profile keeps its empty domains and the scalar effect policy.
 */
type GateProgram = Pick<SemanticProcessProgram, "identity" | "scopeLocalData" | "operations">;
const scope = SemanticProfileId.EmbeddedSubProcessCompletion;
const program = (semanticProfile: string, extra: Partial<GateProgram> = {}): GateProgram =>
  ({ identity: { semanticProfile } as SemanticProcessProgram["identity"], operations: [], ...extra });
const declarations: NonNullable<GateProgram["scopeLocalData"]> = [{ scopeId: "scope:Price", localInputs: [
  { target: "estimate", expression: { kind: MappingExpressionKind.StringLiteral, value: "pending" } }], localOutputs: [] }];
const declaring = program(scope, { scopeLocalData: declarations });
const effect = (inputMappings: readonly unknown[]) =>
  ({ kind: SemanticOperationKind.AwaitEffect, effect: { inputMappings, outputMappings: [] } }) as unknown as GateProgram["operations"][number];
const mapped = program(scope, { operations: [effect([{ target: "claim", expression: { kind: MappingExpressionKind.EnclosingVariable, name: "claim" } }])] });
const dataFree = program(scope, { operations: [effect([])] });
const text = (value: string): VariableValue => ({ kind: VariableValueKind.String, value });

test("an embedded completion Program carries data exactly when it declares a local or maps a Service Task", () => {
  assert.equal(nestedScopeDataProgram(declaring), true);
  assert.equal(nestedScopeDataProgram(mapped), true);
  assert.equal(nestedScopeDataProgram(dataFree), false);
  assert.equal(nestedScopeDataProgram(program(SemanticProfileId.NestedEmbeddedScopeData)), true);
  assert.equal(nestedScopeDataProgram(program(SemanticProfileId.ParallelForkJoin, { scopeLocalData: declarations })), false);
});

test("only a data-bearing embedded completion Program selects the bounded String policy", () => {
  assert.equal(effectMappingValuePolicyForProgram(declaring), EffectMappingValuePolicy.BoundedString);
  assert.equal(effectMappingValuePolicyForProgram(mapped), EffectMappingValuePolicy.BoundedString);
  assert.equal(effectMappingValuePolicyForProgram(dataFree), EffectMappingValuePolicy.Scalar);
  assert.equal(effectMappingValuePolicyForProgram(program(SemanticProfileId.NestedEmbeddedScopeData)),
    EffectMappingValuePolicy.SingletonBusinessItem);
});

test("the bounded String arm counts UTF-8 bytes and treats Null as a present value", () => {
  const bounded = EffectMappingValuePolicy.BoundedString;
  for (const allowNull of [true, false]) {
    assert.equal(effectMappingAcceptsValue(bounded, text("a".repeat(1024)), allowNull), true);
    assert.equal(effectMappingAcceptsValue(bounded, text("a".repeat(1025)), allowNull), false);
    assert.equal(effectMappingAcceptsValue(bounded, text("é".repeat(512)), allowNull), true);
    assert.equal(effectMappingAcceptsValue(bounded, text("é".repeat(513)), allowNull), false);
    assert.equal(effectMappingAcceptsValue(bounded, { kind: VariableValueKind.Null }, allowNull), true);
    assert.equal(effectMappingAcceptsValue(bounded, { kind: VariableValueKind.Map, value: [] } as VariableValue, allowNull), false);
    assert.equal(effectMappingAcceptsValue(bounded, { kind: VariableValueKind.Boolean, value: true }, allowNull), false);
  }
});

test("every surface of a data-bearing Program takes bounded Strings and present nulls; a data-free one stays empty", () => {
  for (const surface of Object.values(VariableWriteSurface)) {
    assert.equal(profileAllowsVariableBindings(declaring, surface, [{ name: "a", value: text("x".repeat(1024)) }]), true, surface);
    assert.equal(profileAllowsVariableBindings(declaring, surface, [{ name: "a", value: { kind: VariableValueKind.Null } }]), true, surface);
    assert.equal(profileAllowsVariableBindings(declaring, surface, [{ name: "a", value: text("x".repeat(1025)) }]), false, surface);
    assert.equal(profileAllowsVariableBindings(dataFree, surface, [{ name: "a", value: text("x") }]), false, surface);
    assert.equal(profileAllowsVariableBindings(dataFree, surface, []), true, surface);
  }
});
