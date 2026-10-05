import assert from "node:assert/strict";
import test from "node:test";
import { ActivityBodyKind, ControlStateKind, initialState, MappingExpressionKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { RuntimeState, ScopeOccurrenceId } from "@bpmn-lean/semantic-core";
import type { ParallelScopeEntry } from "../src/parallel-scope-runtime.ts";
const { enterParallelScope, completeParallelScope } =
  await import(new URL("../dist/parallel-scope-runtime.js", import.meta.url).href) as typeof import("../src/parallel-scope-runtime.ts");
const { createEffectLocalDataOwner } =
  await import(new URL("../dist/local-data-owner.js", import.meta.url).href) as typeof import("../src/local-data-owner.ts");

const parent: ScopeOccurrenceId = { processInstanceId: "applicants", definitionScopeId: "root", activation: 1 };
const entry: ParallelScopeEntry = {
  id: "enter", elementId: "Checks", input: "in", childEntry: "check", childScopeId: "body", normalOutput: "out",
  collectionName: "applicants", itemName: "applicant", completionBooleanName: "approved",
  bodyInputs: [{ target: "status", expression: { kind: MappingExpressionKind.EnclosingVariable, name: "status" } }],
};
function ready(count: number): RuntimeState {
  return { ...initialState, control: { kind: ControlStateKind.Running, instanceId: parent.processInstanceId },
    scopeOccurrences: [{ id: parent, parent: null }],
    controlTokens: [{ placeId: "in", owner: parent, multiplicity: 1 }],
    scopeActivations: [{ elementId: "body", count: 4 }],
    variables: { ...initialState.variables, process: { bindings: [
      { name: "applicants", value: { kind: VariableValueKind.StringList, value: Array<string>(count).fill("same") } },
      { name: "approved", value: { kind: VariableValueKind.Boolean, value: false } },
      { name: "status", value: { kind: VariableValueKind.Null } },
    ] } } };
}
function active(count: number): RuntimeState {
  const state = enterParallelScope(entry, ready(count), parent);
  assert.ok(state);
  return state;
}
function body(activation: number): ScopeOccurrenceId { return { ...parent, definitionScopeId: "body", activation }; }
function settled(state: RuntimeState, target: ScopeOccurrenceId): RuntimeState {
  return { ...state, controlTokens: state.controlTokens.filter(token => token.owner.activation !== target.activation) };
}

test("empty entry consumes the parent once without issuing identities or local data", () => {
  const before = ready(0);
  assert.deepEqual(enterParallelScope(entry, before, parent), { ...before,
    controlTokens: [{ placeId: "out", owner: parent, multiplicity: 1 }] });
});

test("parallel entry snapshots every body atomically and preserves equal items with distinct identities", () => {
  for (const count of [1, 2, 16]) {
    const before = ready(count);
    const saved = structuredClone(before);
    const after = enterParallelScope(entry, before, parent);
    assert.ok(after);
    const activity = after.activityOccurrences[0];
    assert.equal(activity?.body.kind, ActivityBodyKind.ParallelChildScopes);
    if (activity?.body.kind !== ActivityBodyKind.ParallelChildScopes) assert.fail();
    assert.deepEqual(activity.body.iterations.map(iteration => [iteration.scope.activation, iteration.loopCounter, iteration.item]),
      Array.from({ length: count }, (_, i) => [i + 5, i, "same"]));
    assert.equal(after.controlTokens.length, count);
    assert.equal(after.variables.scopes.length, count);
    assert.ok(after.variables.scopes.every(frame => frame.bindings[0]?.value.kind === VariableValueKind.Null));
    assert.deepEqual(after.parallelScopeControllers, [{ id: activity.id, total: count, completed: 0 }]);
    assert.deepEqual(before, saved);
  }
});

test("late initialization failure rolls back every issued body and counter", () => {
  const before = { ...ready(2), variables: { ...ready(2).variables,
    scopes: [{ owner: body(6), bindings: [] }] } };
  const saved = structuredClone(before);
  assert.equal(enterParallelScope(entry, before, parent), null);
  assert.deepEqual(before, saved);
  assert.equal(enterParallelScope(entry, ready(17), parent), null);
  assert.equal(enterParallelScope(entry, active(2), parent), null);
});

test("retirement requires whole-body quiescence and selects the full occurrence identity", () => {
  const state = active(2);
  assert.equal(completeParallelScope(entry, state, body(5)), null);
  const before = settled(state, body(5));
  for (const target of [{ ...body(5), activation: 7 }, { ...body(5), processInstanceId: "foreign" },
    { ...body(5), definitionScopeId: "foreign" }]) assert.equal(completeParallelScope(entry, before, target), null);
  const after = completeParallelScope(entry, before, body(5));
  assert.ok(after);
  assert.deepEqual(after.variables.scopes.map(frame => frame.owner), [body(6)]);
  assert.deepEqual(after.controlTokens, before.controlTokens);
  assert.equal(after.parallelScopeControllers?.[0]?.completed, 1);
  const activity = after.activityOccurrences[0];
  assert.equal(activity?.body.kind, ActivityBodyKind.ParallelChildScopes);
  if (activity?.body.kind === ActivityBodyKind.ParallelChildScopes)
    assert.deepEqual(activity.body.iterations.map(iteration => iteration.loopCounter), [1]);
});

test("both completion orders issue exactly one continuation and keep historical counters", () => {
  for (const count of [1, 2, 16]) for (const reverse of [false, true]) {
    const order = Array.from({ length: count }, (_, index) => index + 5);
    if (reverse) order.reverse();
    let state = active(count);
    const counters = state.scopeActivations;
    for (const activation of order) {
      const next = completeParallelScope(entry, settled(state, body(activation)), body(activation));
      assert.ok(next);
      state = next;
    }
    assert.deepEqual(state.controlTokens, [{ placeId: "out", owner: parent, multiplicity: 1 }]);
    assert.deepEqual(state.variables.scopes, []);
    assert.deepEqual(state.activityOccurrences, []);
    assert.deepEqual(state.parallelScopeControllers, []);
    assert.deepEqual(state.scopeActivations, counters);
    assert.equal(completeParallelScope(entry, state, body(5)), null);
  }
});

test("early completion cancels siblings and their local data without rolling back Process writes", () => {
  const running = active(2);
  const before = { ...settled(running, body(5)), variables: { ...running.variables,
    process: { bindings: running.variables.process.bindings.map(binding => binding.name === "approved"
      ? { name: "approved", value: { kind: VariableValueKind.Boolean, value: true } } as const : binding) } } };
  const after = completeParallelScope(entry, before, body(5));
  assert.ok(after);
  assert.deepEqual(after.variables.process, before.variables.process);
  assert.deepEqual(after.variables.scopes, []);
  assert.deepEqual(after.scopeOccurrences, [{ id: parent, parent: null }]);
  assert.deepEqual(after.controlTokens, [{ placeId: "out", owner: parent, multiplicity: 1 }]);
  assert.deepEqual(after.parallelScopeControllers, []);
});

test("ambiguous ownership, malformed counts and missing sibling data refuse atomically", () => {
  const state = settled(active(2), body(5));
  for (const invalid of [
    { ...state, activityOccurrences: [...state.activityOccurrences, ...state.activityOccurrences] },
    { ...state, parallelScopeControllers: state.parallelScopeControllers?.map(controller => ({ ...controller, total: 3 })) ?? [] },
    { ...state, variables: { ...state.variables, scopes: state.variables.scopes.slice(0, 1) } },
    { ...state, scopeOccurrences: [...state.scopeOccurrences, { id: body(6), parent }] },
  ]) {
    const saved = structuredClone(invalid);
    assert.equal(completeParallelScope(entry, invalid, body(5)), null);
    assert.deepEqual(invalid, saved);
  }
});

test("entry and partial retirement preserve an unrelated Activity and disjoint body ownership", () => {
  const otherBody = { ...parent, definitionScopeId: "other" };
  const unrelated = { id: { processInstanceId: parent.processInstanceId, activityElementId: "Other", activation: 1 },
    owner: parent, operationId: "other-entry", attachedHandlers: [],
    body: { kind: ActivityBodyKind.ChildScope, scope: otherBody } } as const;
  const before = { ...ready(2), scopeOccurrences: [...ready(2).scopeOccurrences, { id: otherBody, parent }],
    activityOccurrences: [unrelated] };
  const entered = enterParallelScope(entry, before, parent);
  assert.ok(entered);
  const retired = completeParallelScope(entry, settled(entered, body(5)), body(5));
  assert.ok(retired);
  for (const state of [entered, retired]) {
    assert.deepEqual(state.activityOccurrences.filter(activity => activity.id.activityElementId === "Other"), [unrelated]);
    const scopes = state.activityOccurrences.flatMap(activity => activity.body.kind === ActivityBodyKind.ChildScope
      ? [activity.body.scope] : activity.body.kind === ActivityBodyKind.ParallelChildScopes
        ? activity.body.iterations.map(iteration => iteration.scope) : []);
    assert.equal(new Set(scopes.map(scope => JSON.stringify(scope))).size, scopes.length);
  }
});

test("pending human and effect work blocks retirement; early cancellation removes sibling effects and captured data", () => {
  const state = active(2);
  const id = { processInstanceId: parent.processInstanceId, elementId: "Validate", activation: 1 };
  const effect = { id, owner: body(6), descriptor: {
    protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "urn:bpmn-lean:effect-operation:mapped-success-v1" },
    arguments: [], outputMappings: [], bpmnErrorRoute: null, output: "end", incidentAlreadyRetried: false };
  for (const busy of [
    { ...state, controlTokens: [], userTaskWaits: [{ id, owner: body(5), name: null, output: "end" }] },
    { ...state, controlTokens: [], effectWaits: [{ ...effect, owner: body(5) }] },
  ]) assert.equal(completeParallelScope(entry, busy, body(5)), null);
  const before = { ...state, controlTokens: [], effectWaits: [effect], variables: { ...state.variables,
    activities: [{ owner: createEffectLocalDataOwner(id), bindings: [] }],
    process: { bindings: state.variables.process.bindings.map(binding => binding.name === "approved"
      ? { name: "approved", value: { kind: VariableValueKind.Boolean, value: true } } as const : binding) } } };
  const after = completeParallelScope(entry, before, body(5));
  assert.ok(after);
  assert.deepEqual(after.effectWaits, []);
  assert.deepEqual(after.variables.activities, []);
  assert.deepEqual(after.variables.process, before.variables.process);
});
