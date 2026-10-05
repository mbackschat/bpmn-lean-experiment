import assert from "node:assert/strict";
import { test } from "node:test";
import { ControlStateKind, MappingExpressionKind, MultiInstanceBodyKind, SemanticOperationKind as Op,
  SemanticOriginKind, VariableValueKind as Value, initialState, projectOpenMultiInstances } from "@bpmn-lean/semantic-core";
import type { RuntimeState, ScopeOccurrenceId } from "@bpmn-lean/semantic-core";
import type { EnterSequentialMultiInstanceScopeOperation } from "../src/semantic-process-contract.ts";
import { program as base } from "./embedded-subprocess-fixture.ts";
const { enterSequentialScope, completeSequentialScope } = await import(new URL("../dist/sequential-scope-runtime.js", import.meta.url).href) as typeof import("../src/sequential-scope-runtime.ts");
const parent: ScopeOccurrenceId = { processInstanceId: "invoice-batch", definitionScopeId: "root", activation: 1 };
const entry: EnterSequentialMultiInstanceScopeOperation = {
  kind: Op.EnterSequentialMultiInstanceScope, id: "enter-batch",
  origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Batch" },
  input: "incoming", childEntry: "body-in", childScopeId: "body", normalOutput: "outgoing",
  collectionName: "invoices", itemName: "invoice", completionBooleanName: null,
  bodyInputs: [{ target: "status", expression: { kind: MappingExpressionKind.EnclosingVariable, name: "status" } }],
};
const completion = { kind: Op.CompleteSequentialMultiInstanceScope, id: "finish-batch", origin: entry.origin, entryOperationId: entry.id } as const;
const program = { ...base, operations: [entry, completion] };
function entered(items: readonly string[] = ["INV-01", "INV-02"]): RuntimeState {
  const state = enterSequentialScope(entry, { ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: parent.processInstanceId },
    scopeOccurrences: [{ id: parent, parent: null }], controlTokens: [{ placeId: entry.input, owner: parent, multiplicity: 1 }],
    variables: { ...initialState.variables, process: { bindings: [
      { name: "invoices", value: { kind: Value.StringList, value: items } },
      { name: "status", value: { kind: Value.Null } },
    ] } } }, parent);
  assert.ok(state);
  return state;
}
function body(state: RuntimeState): ScopeOccurrenceId {
  const owner = state.variables.scopes[0]?.owner;
  assert.ok(owner);
  return owner;
}
const id = (elementId: string, activation = 1) => ({ processInstanceId: parent.processInstanceId, elementId, activation });
function waiting(): RuntimeState {
  const state = entered();
  const owner = body(state);
  return { ...state, controlTokens: [], userTaskWaits: [
    { id: id("Zulu"), owner, name: null, output: "end" },
    { id: id("Alpha"), owner, name: null, output: "end" },
    { id: id("Other"), owner: parent, name: null, output: "parent-end" },
  ], effectWaits: [{ id: id("Validate"), owner, descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "validateInvoice" },
    arguments: [], outputMappings: [], output: "end", bpmnErrorRoute: null, incidentAlreadyRetried: false }] };
}

test("private Sub-Process progress publishes only exact current-body interactions and committed locals", () => {
  const state = waiting();
  const before = structuredClone(state);
  assert.deepEqual(projectOpenMultiInstances(program, state), [{
    id: state.activityOccurrences[0]!.id, mode: "sequential", bodyKind: MultiInstanceBodyKind.SubProcess,
    plannedInstanceCount: 2, pendingItemCount: 1, numberOfInstances: 1, numberOfActiveInstances: 1,
    numberOfCompletedInstances: 0, numberOfTerminatedInstances: 0,
    activeIterations: [{ loopCounter: 0, body: body(state), item: { name: "invoice", value: { kind: Value.String, value: "INV-01" } },
      bindings: [{ name: "status", value: { kind: Value.Null } }],
      userTaskIds: [id("Alpha"), id("Zulu")], effectIds: [id("Validate")] }],
  }]);
  assert.deepEqual(state, before);
});

test("declared Sub-Process progress is empty before entry and after empty or terminal completion", () => {
  assert.equal(projectOpenMultiInstances(base, initialState), undefined);
  assert.deepEqual(projectOpenMultiInstances(program, initialState), []);
  assert.deepEqual(projectOpenMultiInstances(program, entered([])), []);
  const first = entered();
  const next = completeSequentialScope(program, completion, { ...first, controlTokens: [] });
  assert.ok(next);
  const progress = projectOpenMultiInstances(program, next)?.[0];
  assert.equal(progress?.bodyKind, MultiInstanceBodyKind.SubProcess);
  if (progress?.bodyKind !== MultiInstanceBodyKind.SubProcess) throw new Error("missing repeated body");
  assert.equal(progress.numberOfCompletedInstances, 1);
  assert.equal(progress.numberOfInstances, 2);
  assert.equal(progress.pendingItemCount, 0);
  assert.deepEqual(progress.activeIterations[0]?.body, { ...body(first), activation: 2 });
  assert.deepEqual(progress.activeIterations[0]?.item.value, { kind: Value.String, value: "INV-02" });
  const last = completeSequentialScope(program, completion, { ...next, controlTokens: [] });
  assert.ok(last);
  assert.deepEqual(projectOpenMultiInstances(program, last), []);
});

test("Sub-Process progress refuses broken ownership instead of omitting or inventing a current body", () => {
  const state = waiting();
  const controllers = state.sequentialScopeControllers!;
  const mutations: RuntimeState[] = [
    { ...state, sequentialScopeControllers: [] },
    { ...state, activityOccurrences: [] },
    { ...state, sequentialScopeControllers: [...controllers, ...controllers] },
    { ...state, sequentialScopeControllers: [{ ...controllers[0]!, id: { ...controllers[0]!.id, activation: 2 } }] },
    { ...state, variables: { ...state.variables, scopes: [] } },
    { ...state, userTaskWaits: [state.userTaskWaits[0]!, state.userTaskWaits[0]!] },
    { ...state, effectWaits: [{ ...state.effectWaits[0]!, id: { ...id("Validate"), processInstanceId: "foreign" } }] },
  ];
  for (const mutated of mutations) assert.equal(projectOpenMultiInstances(program, mutated), null);
});
