import { program as scopeProgram } from "./embedded-subprocess-fixture.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ActivityBodyKind, ControlStateKind, initialState, SemanticOperationKind,
  SemanticOriginKind, VariableValueKind, MappingExpressionKind, applyInternalOperationStep } from "@bpmn-lean/semantic-core";
import type { ActivityOccurrence, RuntimeState, ScopeOccurrenceId, VariableBinding } from "@bpmn-lean/semantic-core";
import type { CompleteSequentialMultiInstanceScopeOperation, EnterSequentialMultiInstanceScopeOperation } from "../src/semantic-process-contract.ts";
const { enterSequentialScope, completeSequentialScope } = await import(new URL("../dist/sequential-scope-runtime.js", import.meta.url).href) as typeof import("../src/sequential-scope-runtime.ts");
const { sequentialScopeStateValid } = await import(new URL("../dist/sequential-scope-state-validation.js", import.meta.url).href) as typeof import("../src/sequential-scope-state-validation.ts");
const { sequentialScopeBindingForEntry } = await import(new URL("../dist/sequential-scope-binding.js", import.meta.url).href) as typeof import("../src/sequential-scope-binding.ts");
const { removeScopeOccurrenceSubtree, removeScopeOccurrenceContents } = await import(new URL("../dist/semantic-process-scope-cancellation.js", import.meta.url).href) as typeof import("../src/semantic-process-scope-cancellation.ts");
const parent: ScopeOccurrenceId = { processInstanceId: "invoice-batch", definitionScopeId: "root", activation: 1 };
const operation: EnterSequentialMultiInstanceScopeOperation = {
  kind: SemanticOperationKind.EnterSequentialMultiInstanceScope, id: "enter",
  origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Batch" },
  input: "incoming", childEntry: "body-entry", childScopeId: "body", normalOutput: "outgoing",
  collectionName: "invoices", itemName: "invoice", completionBooleanName: null,
  bodyInputs: [{ target: "status", expression: { kind: MappingExpressionKind.EnclosingVariable, name: "status" } }],
};
function ready(items: readonly string[]): RuntimeState {
  return { ...initialState, control: { kind: ControlStateKind.Running, instanceId: parent.processInstanceId },
    scopeOccurrences: [{ id: parent, parent: null }], controlTokens: [{ placeId: "incoming", owner: parent, multiplicity: 1 }],
    variables: { ...initialState.variables, process: { bindings: [
      { name: "invoices", value: { kind: VariableValueKind.StringList, value: [...items] } },
      { name: "status", value: { kind: VariableValueKind.Null } },
    ] } } };
}
test("empty repeated scope continues without issuing an Activity, child or local frame", () => {
  const before = ready([]);
  assert.deepEqual(enterSequentialScope(operation, before, parent), { ...before,
    controlTokens: [{ placeId: "outgoing", owner: parent, multiplicity: 1 }] });
});
test("positive repeated scope issues one fresh body and initializes locals from the unchanged parent", () => {
  const before = { ...ready(["INV-01", "INV-02"]), scopeActivations: [{ elementId: "body", count: 4 }],
    activityActivations: [{ elementId: "Batch", count: 2 }] };
  const saved = structuredClone(before);
  const after = enterSequentialScope(operation, before, parent);
  assert.ok(after);
  const body = { ...parent, definitionScopeId: "body", activation: 5 };
  const id = { processInstanceId: parent.processInstanceId, activityElementId: "Batch", activation: 3 };
  assert.deepEqual(after.controlTokens, [{ placeId: "body-entry", owner: body, multiplicity: 1 }]);
  assert.deepEqual(after.scopeOccurrences, [{ id: body, parent }, { id: parent, parent: null }]);
  assert.deepEqual(after.activityOccurrences, [{ id, owner: parent, operationId: "enter",
    body: { kind: ActivityBodyKind.ChildScope, scope: body }, attachedHandlers: [] }]);
  assert.deepEqual(after.sequentialScopeControllers, [{ id, total: 2, completed: 0, currentItem: "INV-01" }]);
  assert.deepEqual(after.variables.scopes, [{ owner: body, bindings: [{ name: "status", value: { kind: VariableValueKind.Null } }] }]);
  assert.deepEqual(after.variables.process, before.variables.process);
  assert.deepEqual(after.scopeActivations, [{ elementId: "body", count: 5 }]);
  assert.deepEqual(after.activityActivations, [{ elementId: "Batch", count: 3 }]);
  assert.deepEqual(before, saved);
  assert.equal(enterSequentialScope(operation, after, parent), null);
});
test("missing initialization input or parent token refuses entry without consuming identity", () => {
  const before = ready(["INV-01"]);
  const missingInput = { ...before, variables: { ...before.variables,
    process: { bindings: before.variables.process.bindings.filter(({ name }) => name !== "status") } } };
  for (const candidate of [missingInput, { ...before, controlTokens: [] },
    { ...before, scopeOccurrences: [] }]) {
    const saved = structuredClone(candidate);
    assert.equal(enterSequentialScope(operation, candidate, parent), null);
    assert.deepEqual(candidate, saved);
  }
});

test("repeated scope entry preserves a sibling and inserts a disjoint body claim", () => {
  const sibling = { ...parent, definitionScopeId: "other-body", activation: 7 };
  const siblingActivity: ActivityOccurrence = { id: { processInstanceId: parent.processInstanceId, activityElementId: "Other", activation: 2 },
    owner: parent, operationId: "other-entry", body: { kind: ActivityBodyKind.ChildScope, scope: sibling }, attachedHandlers: [] };
  const base = ready(["INV-01"]);
  const before: RuntimeState = { ...base, activityOccurrences: [siblingActivity],
    scopeOccurrences: [...base.scopeOccurrences, { id: sibling, parent }],
    controlTokens: [...base.controlTokens, { placeId: "other-work", owner: sibling, multiplicity: 1 }],
    variables: { ...base.variables, scopes: [{ owner: sibling, bindings: [{ name: "status",
      value: { kind: VariableValueKind.String, value: "untouched" } }] }] } };
  const after = enterSequentialScope(operation, before, parent);
  assert.ok(after);
  assert.deepEqual(after.activityOccurrences.filter(({ operationId }) => operationId === "other-entry"), [siblingActivity]);
  assert.deepEqual(after.variables.scopes.filter(({ owner }) => owner.definitionScopeId === sibling.definitionScopeId), before.variables.scopes);
  assert.deepEqual(after.controlTokens.filter(({ placeId }) => placeId === "other-work"), before.controlTokens.slice(1));
  const bodies = after.activityOccurrences.flatMap(({ body }) => body.kind === ActivityBodyKind.ChildScope ? [body.scope] : []);
  assert.equal(new Set(bodies.map(body => JSON.stringify(body))).size, bodies.length);
  assert.equal(bodies.length, 2);
});

test("repeated scope entry rejects missing, duplicate and oversized collections", () => {
  const before = ready(["INV-01"]);
  const bindings = before.variables.process.bindings;
  for (const candidate of [ready(Array.from({ length: 17 }, () => "invoice")), ready(["x".repeat(513)]),
    { ...before, variables: { ...before.variables, process: { bindings: bindings.slice(1) } } },
    { ...before, variables: { ...before.variables, process: { bindings: [...bindings, ...bindings] } } }]) {
    assert.equal(enterSequentialScope(operation, candidate, parent), null);
  }
});

const completion: CompleteSequentialMultiInstanceScopeOperation = {
  kind: SemanticOperationKind.CompleteSequentialMultiInstanceScope, id: "complete",
  origin: operation.origin, entryOperationId: operation.id,
};
function active(items: readonly string[]): RuntimeState {
  const state = enterSequentialScope(operation, ready(items), parent);
  assert.ok(state);
  return state;
}
function finish(entry: EnterSequentialMultiInstanceScopeOperation, state: RuntimeState): RuntimeState | null {
  return completeSequentialScope({ operations: [entry, completion] }, completion, state);
}
test("quiescent body turnover keeps the outer identity and total, reinitializes locals, and issues one fresh child", () => {
  const entered = active(["INV-01", "INV-02"]);
  const first = entered.variables.scopes[0];
  assert.ok(first);
  const before: RuntimeState = { ...entered, controlTokens: [], variables: { ...entered.variables,
    scopes: [{ ...first, bindings: [{ name: "status", value: { kind: VariableValueKind.String, value: "finished" } }] }] } };
  const saved = structuredClone(before);
  const after = finish(operation, before);
  assert.ok(after);
  const next = { ...first.owner, activation: first.owner.activation + 1 };
  assert.deepEqual(after.activityOccurrences.map(({ id }) => id), before.activityOccurrences.map(({ id }) => id));
  assert.deepEqual(after.activityActivations, before.activityActivations);
  assert.deepEqual(after.sequentialScopeControllers, before.sequentialScopeControllers?.map(controller =>
    ({ ...controller, completed: 1, currentItem: "INV-02" })));
  assert.deepEqual(after.variables.scopes, [{ owner: next, bindings: [{ name: "status", value: { kind: VariableValueKind.Null } }] }]);
  assert.deepEqual(after.controlTokens, [{ owner: next, placeId: "body-entry", multiplicity: 1 }]);
  assert.deepEqual(after.scopeOccurrences, [{ id: next, parent }, { id: parent, parent: null }]);
  assert.deepEqual(after.activityOccurrences[0]?.body, { kind: ActivityBodyKind.ChildScope, scope: next });
  assert.deepEqual(before, saved);
});
test("natural exhaustion retires the final body and emits exactly one parent continuation", () => {
  const entered = active(["INV-01"]);
  const before = { ...entered, controlTokens: [] };
  const after = finish(operation, before);
  assert.ok(after);
  assert.deepEqual(after.controlTokens, [{ owner: parent, placeId: "outgoing", multiplicity: 1 }]);
  assert.deepEqual(after.scopeOccurrences, [{ id: parent, parent: null }]);
  assert.deepEqual(after.activityOccurrences, []);
  assert.deepEqual(after.sequentialScopeControllers, []);
  assert.deepEqual(after.variables, { ...before.variables, scopes: [] });
  assert.deepEqual(after.scopeActivations, before.scopeActivations);
  assert.deepEqual(after.activityActivations, before.activityActivations);
  assert.equal(finish(operation, after), null);
});
test("completion condition cannot advance a body with an unfinished branch", () => {
  const entered = active(["INV-01", "INV-02"]);
  const withCondition: RuntimeState = { ...entered, variables: { ...entered.variables,
    process: { bindings: [...entered.variables.process.bindings,
      { name: "stop", value: { kind: VariableValueKind.Boolean, value: true } }] } } };
  const conditional = { ...operation, completionBooleanName: "stop" };
  assert.equal(finish(conditional, withCondition), null);
  const after = finish(conditional, { ...withCondition, controlTokens: [] });
  assert.ok(after);
  assert.deepEqual(after.controlTokens, [{ owner: parent, placeId: "outgoing", multiplicity: 1 }]);
  assert.deepEqual(after.scopeActivations, entered.scopeActivations);
  assert.deepEqual(after.sequentialScopeControllers, []);
});
test("turnover refusal preserves the old body when next-item lookup or initialization fails", () => {
  const entered = active(["INV-01", "INV-02"]);
  for (const bindings of [entered.variables.process.bindings.filter(({ name }) => name !== "status"),
    entered.variables.process.bindings.map((binding): VariableBinding => binding.name === "invoices"
      ? { name: "invoices", value: { kind: VariableValueKind.StringList, value: ["INV-01"] } } : binding)]) {
    const before: RuntimeState = { ...entered, controlTokens: [],
      variables: { ...entered.variables, process: { bindings } } };
    const saved = structuredClone(before);
    assert.equal(finish(operation, before), null);
    assert.deepEqual(before, saved);
  }
});

test("a finished branch cannot retire a body with an owned human or effect wait", () => {
  const entered = active(["INV-01", "INV-02"]);
  const child = entered.variables.scopes[0]?.owner;
  assert.ok(child);
  const id = { processInstanceId: parent.processInstanceId, elementId: "Remaining", activation: 1 };
  const human: RuntimeState = { ...entered, controlTokens: [], userTaskWaits: [{ id, owner: child, name: null, output: "end" }] };
  const effect: RuntimeState = { ...entered, controlTokens: [], effectWaits: [{ id, owner: child,
    descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "urn:bpmn-lean:effect-operation:mapped-success-v1" },
    arguments: [], outputMappings: [], bpmnErrorRoute: null, output: "end", incidentAlreadyRetried: false }] };
  for (const before of [human, effect]) {
    const saved = structuredClone(before);
    assert.equal(finish(operation, before), null);
    assert.deepEqual(before, saved);
  }
});
test("turnover and terminal completion preserve unrelated scope data, tokens and Activity claims", () => {
  for (const items of [["INV-01"], ["INV-01", "INV-02"]]) {
    const entered = active(items);
    const sibling = { ...parent, definitionScopeId: "other-body", activation: 7 };
    const other: ActivityOccurrence = { id: { processInstanceId: parent.processInstanceId, activityElementId: "Other", activation: 2 },
      owner: parent, operationId: "other-entry", body: { kind: ActivityBodyKind.ChildScope, scope: sibling }, attachedHandlers: [] };
    const frame: RuntimeState["variables"]["scopes"][number] = { owner: sibling, bindings: [{ name: "note", value: { kind: VariableValueKind.String, value: "keep" } }] };
    const before: RuntimeState = { ...entered,
      activityOccurrences: [...entered.activityOccurrences, other],
      controlTokens: [{ owner: sibling, placeId: "other-work", multiplicity: 1 }],
      scopeOccurrences: [...entered.scopeOccurrences, { id: sibling, parent }],
      variables: { ...entered.variables, scopes: [...entered.variables.scopes, frame] } };
    const after = finish(operation, before);
    assert.ok(after);
    assert.deepEqual(after.activityOccurrences.filter(({ operationId }) => operationId === "other-entry"), [other]);
    assert.deepEqual(after.variables.scopes.filter(({ owner }) => owner.definitionScopeId === sibling.definitionScopeId), [frame]);
    assert.deepEqual(after.controlTokens.filter(({ placeId }) => placeId === "other-work"), before.controlTokens);
    assert.deepEqual(after.variables.process, before.variables.process);
  }
});
test("completion refuses a missing or ambiguous entry binding and ill-typed condition", () => {
  const before = { ...active(["INV-01", "INV-02"]), controlTokens: [] };
  for (const operations of [[], [operation, operation]]) {
    assert.equal(completeSequentialScope({ operations }, completion, before), null);
  }
  assert.equal(finish({ ...operation, completionBooleanName: "status" }, before), null);
  assert.equal(finish({ ...operation, completionBooleanName: "absent" }, before), null);
});

test("operation execution preserves the selected parent on entry and completed child on each turnover", () => {
  const program = { ...scopeProgram, operations: [operation, completion],
    operationScopes: [{ operationId: operation.id, scopeId: "root" }, { operationId: completion.id, scopeId: "body" }] };
  const entered = applyInternalOperationStep(program, operation, ready(["INV-01", "INV-02"]));
  assert.ok(entered);
  assert.deepEqual(entered.owner, parent);
  const firstBody = entered.successor.variables.scopes[0]?.owner;
  assert.ok(firstBody);
  const turned = applyInternalOperationStep(program, completion, { ...entered.successor, controlTokens: [] });
  assert.ok(turned);
  assert.deepEqual(turned.owner, firstBody);
  const secondBody = turned.successor.variables.scopes[0]?.owner;
  assert.ok(secondBody);
  assert.equal(secondBody.activation, firstBody.activation + 1);
  const terminal = applyInternalOperationStep(program, completion, { ...turned.successor, controlTokens: [] });
  assert.ok(terminal);
  assert.deepEqual(terminal.owner, secondBody);
  assert.deepEqual(terminal.successor.controlTokens, [{ owner: parent, placeId: "outgoing", multiplicity: 1 }]);
  assert.equal(applyInternalOperationStep(program, completion, terminal.successor), null);
});

test("regional cleanup preserves repeated-scope validity for retained and removed bodies", () => {
  const program = { ...scopeProgram, operations: [operation] };
  const before = enterSequentialScope(operation, ready(["INV-01", "INV-02"]), parent);
  assert.ok(before);
  assert.equal(sequentialScopeStateValid(program, before), true);
  const body = before.scopeOccurrences.find(({ id }) => id.definitionScopeId === operation.childScopeId);
  const root = before.scopeOccurrences.find(({ id }) => id.definitionScopeId === parent.definitionScopeId);
  assert.ok(body);
  assert.ok(root);
  const retained = removeScopeOccurrenceContents(before, body);
  assert.equal(sequentialScopeStateValid(program, retained), true);
  assert.deepEqual(retained.sequentialScopeControllers, before.sequentialScopeControllers);
  const binding = sequentialScopeBindingForEntry(operation, before);
  assert.ok(binding);
  assert.deepEqual(sequentialScopeBindingForEntry(operation, retained), binding);
  for (const incomplete of [
    { ...retained, activityOccurrences: [] },
    { ...retained, sequentialScopeControllers: [] },
    { ...retained, scopeOccurrences: [root] },
    { ...retained, scopeOccurrences: [body] },
    { ...retained, variables: { ...retained.variables, scopes: [] } },
  ]) assert.equal(sequentialScopeBindingForEntry(operation, incomplete), undefined);
  for (const region of [body, root]) {
    const removed = removeScopeOccurrenceSubtree(before, region);
    assert.equal(sequentialScopeStateValid(program, removed), true);
    assert.deepEqual(removed.sequentialScopeControllers, []);
  }
  assert.equal(sequentialScopeStateValid(program, before), true);
});
