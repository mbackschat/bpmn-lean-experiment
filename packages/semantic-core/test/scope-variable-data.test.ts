import assert from "node:assert/strict";
import test from "node:test";
import { initialState, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { RuntimeState, VariableBinding } from "@bpmn-lean/semantic-core";
import type { ScopeOccurrenceId, ScopedVariables } from "../src/semantic-process-state.ts";
import type { VariableMapping } from "../src/semantic-value-contract.ts";

type Module = typeof import("../src/scope-variable-data.ts");
const { selectScopeVariables, initializeScopeVariables, readScopeVariable, writeScopeVariables,
  removeScopeVariables } = await import(new URL("../dist/scope-variable-data.js", import.meta.url).href) as Module;
const { MappingExpressionKind: Expression } = await import(new URL("../dist/semantic-value-contract.js", import.meta.url).href) as typeof import("../src/semantic-value-contract.ts");

const owner: ScopeOccurrenceId = { processInstanceId: "first", definitionScopeId: "body", activation: 1 };
const sibling = { ...owner, activation: 2 };
const foreign = { ...owner, processInstanceId: "second" };
const binding = (name: string, value: string | null): VariableBinding => ({ name,
  value: value === null ? { kind: VariableValueKind.Null } : { kind: VariableValueKind.String, value } });
const ref = (target: string, name: string): VariableMapping => ({ target,
  expression: { kind: Expression.EnclosingVariable, name } });
const literal = (target: string, value: string): VariableMapping => ({ target,
  expression: { kind: Expression.StringLiteral, value } });
function variables(): ScopedVariables {
  return { ...initialState.variables, process: { bindings: [binding("a", "outer"), binding("status", "parent")] },
    scopes: [{ owner: sibling, bindings: [binding("status", "sibling")] },
      { owner: foreign, bindings: [binding("status", "foreign")] }] };
}

test("initializes from the unchanged enclosing context, independent of declaration order", () => {
  const before = variables();
  const mappings = [literal("a", "seed"), ref("b", "a"), ref("status", "status")];
  const after = initializeScopeVariables(before, owner, mappings);
  assert.ok(after !== null);
  assert.deepEqual(selectScopeVariables(after, owner)?.bindings,
    [binding("a", "seed"), binding("b", "outer"), binding("status", "parent")]);
  assert.deepEqual(initializeScopeVariables(before, owner, [...mappings].reverse()), after);
  assert.deepEqual(after.scopes.map(scope => scope.owner), [owner, sibling, foreign]);
  assert.deepEqual(after.process, before.process);
  assert.deepEqual(after.activities, before.activities);
  assert.deepEqual(after.processInterfaces, before.processInterfaces);
  assert.deepEqual(before, variables());
});

test("missing enclosing bindings reject despite same-named input declarations; present null succeeds", () => {
  const before = { ...variables(), process: { bindings: [] } };
  assert.equal(initializeScopeVariables(before, owner, [ref("status", "status")]), null);
  assert.equal(initializeScopeVariables(before, owner, [literal("a", "seed"), ref("b", "a")]), null);
  const nullable = { ...before, process: { bindings: [binding("status", null)] } };
  const after = initializeScopeVariables(nullable, owner, [ref("status", "status")]);
  assert.ok(after !== null);
  assert.deepEqual(readScopeVariable(after, owner, "status"), binding("status", null));
  assert.equal(initializeScopeVariables(before, owner, [{ target: "x", expression: { kind: Expression.LocalVariable, name: "a" } }]), null);
  assert.equal(initializeScopeVariables(before, owner, [literal("x", "one"), literal("x", "two")]), null);
});

test("null shadows its parent and writes select the nearest existing declaration", () => {
  const initialized = initializeScopeVariables(variables(), owner, [literal("status", "pending")]);
  assert.ok(initialized !== null);
  const after = writeScopeVariables(initialized, owner, [binding("status", null), binding("a", "updated"), binding("new", "created")]);
  assert.ok(after !== null);
  assert.deepEqual(readScopeVariable(after, owner, "status"), binding("status", null));
  assert.deepEqual(readScopeVariable(after, owner, "a"), binding("a", "updated"));
  assert.deepEqual(after.process.bindings, [binding("a", "updated"), binding("new", "created"), binding("status", "parent")]);
  assert.deepEqual(selectScopeVariables(after, sibling), selectScopeVariables(initialized, sibling));
  assert.deepEqual(selectScopeVariables(after, foreign), selectScopeVariables(initialized, foreign));
  assert.deepEqual(initialized.process, variables().process);
  assert.equal(writeScopeVariables(initialized, owner, [binding("status", "one"), binding("status", "two")]), null);
  assert.equal(writeScopeVariables(initialized, owner, [{ name: "status", value: { kind: VariableValueKind.Boolean, value: true } }]), null);
});

test("selects complete unique owners before lookup and refuses ambiguous or missing ownership", () => {
  const initialized = initializeScopeVariables(variables(), owner, [literal("status", "local")]);
  assert.ok(initialized !== null);
  const duplicate = { ...initialized, scopes: [...initialized.scopes, { owner, bindings: [] }] };
  for (const state of [variables(), duplicate]) {
    assert.equal(selectScopeVariables(state, owner), undefined);
    assert.equal(readScopeVariable(state, owner, "status"), undefined);
    assert.equal(writeScopeVariables(state, owner, [binding("status", "changed")]), null);
    assert.equal(removeScopeVariables(state, owner), null);
  }
  assert.equal(initializeScopeVariables(initialized, owner, []), null);
  assert.deepEqual(readScopeVariable(initialized, foreign, "status"), binding("status", "foreign"));
});

test("disposes only the selected body and reinitializes a fresh occurrence", () => {
  const initialized = initializeScopeVariables(variables(), owner, [literal("status", "pending")]);
  assert.ok(initialized !== null);
  const changed = writeScopeVariables(initialized, owner, [binding("status", "done")]);
  assert.ok(changed !== null);
  const disposed = removeScopeVariables(changed, owner);
  assert.deepEqual(disposed, variables());
  assert.ok(disposed !== null);
  const next = { ...owner, activation: 3 };
  const restarted = initializeScopeVariables(disposed, next, [literal("status", "pending")]);
  assert.ok(restarted !== null);
  assert.deepEqual(readScopeVariable(restarted, next, "status"), binding("status", "pending"));
  assert.equal(readScopeVariable(restarted, owner, "status"), undefined);
});

const { removeScopeOccurrenceSubtree, removeScopeOccurrenceContents } = await import(
  new URL("../dist/semantic-process-scope-cancellation.js", import.meta.url).href
) as typeof import("../src/semantic-process-scope-cancellation.ts");
const { completeScope } = await import(new URL("../dist/semantic-process-scope-runtime.js", import.meta.url).href) as typeof import("../src/semantic-process-scope-runtime.ts");
const { removeCalledProcessSubtreesForCallers } = await import(
  new URL("../dist/semantic-process-call-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-call-runtime.ts");
const { isPristineRuntimeState } = await import(new URL("../dist/pristine-runtime-state.js", import.meta.url).href) as typeof import("../src/pristine-runtime-state.ts");

test("scope removal disposes descendant frames while Terminate retains its selected root frame", () => {
  const root = { id: owner, parent: null };
  const child = { id: { ...owner, definitionScopeId: "nested" }, parent: owner };
  const peer = { id: foreign, parent: null };
  const scopes = [root, child, peer].map(({ id }) => ({ owner: id, bindings: [binding("status", "local")] }));
  const state = { ...initialState, scopeOccurrences: [root, child, peer], variables: { ...initialState.variables, scopes } };
  assert.deepEqual(removeScopeOccurrenceSubtree(state, root).variables.scopes, [scopes[2]]);
  assert.deepEqual(removeScopeOccurrenceContents(state, root).variables.scopes, [scopes[0], scopes[2]]);
  assert.deepEqual(state.variables.scopes, scopes);
  assert.equal(isPristineRuntimeState({ ...initialState, variables: state.variables }), false);
});

test("normal child completion and called-instance removal cannot orphan local frames", async () => {
  const { ControlStateKind, SemanticOperationKind, SemanticOriginKind } = await import("@bpmn-lean/semantic-core");
  const root = { id: { ...owner, definitionScopeId: "root" }, parent: null };
  const child = { id: owner, parent: root.id };
  const scopes = [root, child].map(({ id }) => ({ owner: id, bindings: [binding("status", "local")] }));
  const state: RuntimeState = { ...initialState, control: { kind: ControlStateKind.Running, instanceId: "first" },
    scopeOccurrences: [root, child], variables: { ...initialState.variables, scopes } };
  const completed = completeScope({ id: "complete", kind: SemanticOperationKind.CompleteScope,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "body" }, scopeId: "body", parentOutput: "after" }, state);
  assert.ok(completed !== null);
  assert.deepEqual(completed.variables.scopes, [scopes[0]]);
  const called = { ...state, calledProcessOccurrences: [{ id: { processInstanceId: "first", elementId: "call", activation: 1 },
    caller: root.id, calledProcessId: "Called", calledRoot: foreign, returnOperationId: "return" }],
    variables: { ...state.variables, scopes: [...scopes, { owner: foreign, bindings: [binding("status", "called")] }] } };
  assert.deepEqual(removeCalledProcessSubtreesForCallers(called, [root.id]).variables.scopes, scopes);
});
