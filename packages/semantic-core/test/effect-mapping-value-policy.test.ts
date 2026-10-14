/**
 * Locks the effect-mapping value policy (PBV-EFF-01..04): it is derived from the exact Program profile, its scalar arm
 * is exactly the legacy effect predicate including the per-call Null distinction, and its SingletonBusinessItem arm
 * threads one predicate through input capture, snapshot validation and result patching.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EffectMappingValuePolicy,
  MappingExpressionKind,
  SemanticOperationKind,
  SemanticProfileId,
  VariableValueKind,
  addActivityVariableScope,
  completeActivityVariableScope,
  completeActivityVariableScopeUnder,
  createEffectLocalDataOwner,
  effectMappingAcceptsValue,
  effectMappingValuePolicyForProfile,
  evaluateInputMappings,
  evaluateInputMappingsUnder,
  inputMappingSnapshotMatches,
  inputMappingSnapshotMatchesUnder,
  serialBusinessMappingsAdmitted,
  serialChainRulesForProfile,
} from "@bpmn-lean/semantic-core";
import type { VariableBinding, VariableMapping, VariableValue } from "@bpmn-lean/semantic-core";
import { deriveInternalTransitionFootprint, effectFrontier, effectProgram, InternalTransitionStateAtomKind } from "./internal-commutation-fixture.ts";

const text = (value: string): VariableValue => ({ kind: VariableValueKind.String, value });
const nothing = (): VariableValue => ({ kind: VariableValueKind.Null });
const map = (...entries: Array<readonly [string, VariableValue]>): VariableValue =>
  ({ kind: VariableValueKind.Map, value: entries.map(([name, value]) => ({ name, value })) as never });
const rootList = (): VariableValue => ({ kind: VariableValueKind.List, value: [] });
const binding = (name: string, value: VariableValue): VariableBinding => ({ name, value });
const read = (name: string, target = "payload"): VariableMapping =>
  ({ target, expression: { kind: MappingExpressionKind.EnclosingVariable, name } });
const write = (name: string, target = name): VariableMapping =>
  ({ target, expression: { kind: MappingExpressionKind.LocalVariable, name } });
const owner = { processInstanceId: "credit", elementId: "Assess", activation: 1 };

const structured = () => map(["entries", { kind: VariableValueKind.List, value: [map(["a", { kind: VariableValueKind.Integer, value: 1 }])] } as VariableValue]);

test("only the structured effect-data profile selects SingletonBusinessItem; unknown profiles stay scalar", () => {
  for (const profile of [...Object.values(SemanticProfileId), "unknown-profile", ""]) {
    assert.equal(effectMappingValuePolicyForProfile(profile),
      profile === SemanticProfileId.PortableBusinessEffectData
        ? EffectMappingValuePolicy.SingletonBusinessItem : EffectMappingValuePolicy.Scalar, profile);
  }
});

test("the scalar arm is the legacy predicate with its per-call Null distinction", () => {
  const scalar = EffectMappingValuePolicy.Scalar;
  assert.equal(effectMappingAcceptsValue(scalar, text("a"), false), true);
  assert.equal(effectMappingAcceptsValue(scalar, nothing(), true), true);
  assert.equal(effectMappingAcceptsValue(scalar, nothing(), false), false);
  for (const value of [structured(), rootList(), { kind: VariableValueKind.Boolean, value: true } as VariableValue,
    { kind: VariableValueKind.Integer, value: 1 } as VariableValue, { kind: VariableValueKind.StringList, value: ["a"] } as VariableValue]) {
    assert.equal(effectMappingAcceptsValue(scalar, value, true), false, value.kind);
  }
});

test("the SingletonBusinessItem arm takes the item domain and treats Null as a value", () => {
  const item = EffectMappingValuePolicy.SingletonBusinessItem;
  for (const allowNull of [true, false]) {
    assert.equal(effectMappingAcceptsValue(item, structured(), allowNull), true);
    assert.equal(effectMappingAcceptsValue(item, nothing(), allowNull), true);
    assert.equal(effectMappingAcceptsValue(item, map(), allowNull), true);
    assert.equal(effectMappingAcceptsValue(item, text("a".repeat(1024)), allowNull), true);
    assert.equal(effectMappingAcceptsValue(item, text("a".repeat(1025)), allowNull), false);
    assert.equal(effectMappingAcceptsValue(item, rootList(), allowNull), false);
    assert.equal(effectMappingAcceptsValue(item, { kind: VariableValueKind.StringList, value: ["a"] }, allowNull), false);
  }
});

test("input capture deep-copies a structured value under the item policy and refuses it under the scalar one", () => {
  const source = structured();
  const context = [binding("assessment", source)];
  const item = EffectMappingValuePolicy.SingletonBusinessItem;
  assert.equal(evaluateInputMappings([read("assessment")], context), null);
  assert.equal(evaluateInputMappingsUnder(EffectMappingValuePolicy.Scalar, [read("assessment")], context), null);
  const captured = evaluateInputMappingsUnder(item, [read("assessment")], context);
  assert.deepEqual(captured, [binding("payload", structured())]);
  assert.notEqual(captured?.[0]?.value, source);
  ((source as unknown as { value: Array<{ value: { value: unknown[] } }> }).value[0]!.value.value).push(nothing());
  assert.deepEqual(captured, [binding("payload", structured())]);
  assert.equal(evaluateInputMappingsUnder(item, [read("assessment")], [binding("assessment", rootList())]), null);
  assert.equal(evaluateInputMappingsUnder(item, [read("assessment")], []), null);
});

test("snapshot validation applies the policy to an enclosing read and still pins a literal", () => {
  const item = EffectMappingValuePolicy.SingletonBusinessItem;
  const mappings: VariableMapping[] = [read("assessment", "a"), { target: "b", expression: { kind: MappingExpressionKind.StringLiteral, value: "fixed" } }];
  const good = [binding("a", structured()), binding("b", text("fixed"))];
  assert.equal(inputMappingSnapshotMatchesUnder(item, mappings, good), true);
  assert.equal(inputMappingSnapshotMatches(mappings, good), false);
  assert.equal(inputMappingSnapshotMatchesUnder(item, mappings, [binding("a", rootList()), good[1]!]), false);
  assert.equal(inputMappingSnapshotMatchesUnder(item, mappings, [good[0]!, binding("b", structured())]), false);
});

test("the result patch is exactly the referenced names and its values follow the policy", () => {
  const item = EffectMappingValuePolicy.SingletonBusinessItem;
  const scope = (bindings: VariableBinding[]) => ({
    scopes: [], processInterfaces: [], process: { bindings: [binding("keep", text("k"))] },
    activities: [{ owner: createEffectLocalDataOwner(owner), bindings }],
  });
  const outputs = [write("assessment")];
  const done = completeActivityVariableScopeUnder(item, scope([]), owner, outputs, [binding("assessment", structured())], true);
  assert.deepEqual(done?.process.bindings, [binding("assessment", structured()), binding("keep", text("k"))]);
  assert.deepEqual(done?.activities, []);
  assert.equal(completeActivityVariableScope(scope([]), owner, outputs, [binding("assessment", structured())], true), null);
  for (const patch of [[], [binding("assessment", rootList())], [binding("other", nothing())],
    [binding("assessment", nothing()), binding("extra", nothing())]]) {
    assert.equal(completeActivityVariableScopeUnder(item, scope([]), owner, outputs, patch, true), null);
  }
  assert.deepEqual(completeActivityVariableScopeUnder(item, scope([]), owner, outputs, [binding("assessment", nothing())], false)
    ?.process.bindings.map(({ name }) => name), ["assessment", "keep"]);
});

test("an Activity-local scope owns its bindings instead of aliasing the argument snapshot", () => {
  const snapshot = [binding("payload", structured())];
  const variables = addActivityVariableScope({ scopes: [], processInterfaces: [], process: { bindings: [] }, activities: [] }, owner, snapshot);
  const local = variables.activities[0]!.bindings[0]!;
  assert.deepEqual(local, snapshot[0]);
  assert.notEqual(local, snapshot[0]);
  assert.notEqual(local.value, snapshot[0]!.value);
});

test("a String literal input is bounded at 1,024 UTF-8 bytes only by the structured effect-data rules", () => {
  const literal = (value: string): VariableMapping[] => [{ target: "payload", expression: { kind: MappingExpressionKind.StringLiteral, value } }];
  const serial = serialChainRulesForProfile(SemanticProfileId.SerialBusinessTaskComposition);
  const effectData = serialChainRulesForProfile(SemanticProfileId.PortableBusinessEffectData);
  for (const [value, expected] of [["a".repeat(1024), true], ["a".repeat(1025), false], ["é".repeat(512), true], [`${"é".repeat(512)}a`, false]] as const) {
    assert.equal(serialBusinessMappingsAdmitted(literal(value), true, new Set(), effectData), expected, value.length.toString());
    assert.equal(serialBusinessMappingsAdmitted(literal(value), true, new Set(), serial), true);
  }
});

test("the internal-transition footprint reads a structured enclosing value only under the item policy", () => {
  const original = effectProgram.operations[0]!;
  assert.equal(original.kind, SemanticOperationKind.AwaitEffect);
  if (original.kind !== SemanticOperationKind.AwaitEffect) throw new Error("Expected effect fixture");
  const operation = { ...original, effect: { ...original.effect, inputMappings: [read("request", "payload")] } };
  const state = { ...effectFrontier, variables: { ...effectFrontier.variables, process: { bindings: [binding("request", structured())] } } };
  const candidate = { operation, owner: state.scopeOccurrences[0]!.id };
  const under = (semanticProfile: string) => ({ ...effectProgram, operations: [operation], identity: { ...effectProgram.identity, semanticProfile } });
  assert.equal(deriveInternalTransitionFootprint(under(SemanticProfileId.ServiceTaskEffect), state, candidate), null);
  const footprint = deriveInternalTransitionFootprint(under(SemanticProfileId.PortableBusinessEffectData), state, candidate);
  assert.ok(footprint);
  assert.deepEqual(footprint.reads.filter(({ kind }) => kind === InternalTransitionStateAtomKind.ProcessVariable),
    [{ kind: InternalTransitionStateAtomKind.ProcessVariable, name: "request" }]);
});
