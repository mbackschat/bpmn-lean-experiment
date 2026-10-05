import assert from "node:assert/strict";
import test from "node:test";
import { ActivityBodyKind, initialState } from "@bpmn-lean/semantic-core";
const { parallelScopeControllersConsistent } =
  await import(new URL("../dist/activity-occurrence.js", import.meta.url).href) as typeof import("../src/activity-occurrence.ts");
const { removeScopeOccurrenceContents, removeScopeOccurrenceSubtree } =
  await import(new URL("../dist/semantic-process-scope-cancellation.js", import.meta.url).href) as typeof import("../src/semantic-process-scope-cancellation.ts");
const { removeCalledProcessSubtreesForCallers } =
  await import(new URL("../dist/semantic-process-call-runtime.js", import.meta.url).href) as typeof import("../src/semantic-process-call-runtime.ts");

const owner = { processInstanceId: "process", definitionScopeId: "root", activation: 1 };
const root = { id: owner, parent: null };
const body = { id: { ...owner, definitionScopeId: "body" }, parent: owner };
const otherBody = { id: { ...owner, definitionScopeId: "other-body" }, parent: owner };
const id = { processInstanceId: "process", activityElementId: "review", activation: 1 };
const otherId = { ...id, activityElementId: "other-review" };
const controller = { id, total: 1, completed: 0 };
const otherController = { ...controller, id: otherId };
const state = {
  ...initialState,
  scopeOccurrences: [root, body, otherBody],
  activityOccurrences: [
    { id, owner, operationId: "enter-review", attachedHandlers: [], body: {
      kind: ActivityBodyKind.ParallelChildScopes,
      iterations: [{ scope: body.id, loopCounter: 0, item: "applicant" }],
    } },
    { id: otherId, owner, operationId: "enter-other-review", attachedHandlers: [], body: {
      kind: ActivityBodyKind.ParallelChildScopes,
      iterations: [{ scope: otherBody.id, loopCounter: 0, item: "applicant" }],
    } },
  ],
  parallelScopeControllers: [controller, otherController],
} as const;

test("controller counts bind both ways to the exact Activity-owned membership", () => {
  assert.equal(parallelScopeControllersConsistent(state), true);
  for (const invalid of [
    { ...state, parallelScopeControllers: [controller] },
    { ...state, parallelScopeControllers: [controller, controller, otherController] },
    { ...state, activityOccurrences: state.activityOccurrences.slice(1) },
    { ...state, parallelScopeControllers: [{ ...controller, total: 2 }, otherController] },
    { ...state, parallelScopeControllers: [{ ...controller, completed: 1 }, otherController] },
    { ...state, parallelScopeControllers: [{ ...controller, id: { ...id, activation: 2 } }, otherController] },
  ]) assert.equal(parallelScopeControllersConsistent(invalid), false);
  assert.equal(parallelScopeControllersConsistent(initialState), true);
});

test("regional withdrawal removes only the controller of the withdrawn Activity", () => {
  const removed = removeScopeOccurrenceSubtree(state, body);
  assert.deepEqual(removed.activityOccurrences.map(activity => activity.id), [otherId]);
  assert.deepEqual(removed.parallelScopeControllers, [otherController]);
  assert.deepEqual(state.parallelScopeControllers, [controller, otherController]);
});

test("retaining a body root retains its controller, but clearing the owner removes both", () => {
  assert.deepEqual(removeScopeOccurrenceContents(state, body).parallelScopeControllers,
    [controller, otherController]);
  for (const remove of [removeScopeOccurrenceSubtree, removeScopeOccurrenceContents]) {
    assert.deepEqual(remove(state, root).parallelScopeControllers, []);
  }
});

test("unrelated cancellation preserves absence of the optional controller collection", () => {
  const { parallelScopeControllers: _controllers, ...legacy } = state;
  assert.equal(Object.hasOwn(removeScopeOccurrenceSubtree(legacy, body), "parallelScopeControllers"), false);
});

test("called-tree removal distinguishes equal Activity coordinates in three Process instances", () => {
  const calledRoot = { ...owner, processInstanceId: "called" };
  const nestedRoot = { ...owner, processInstanceId: "nested" };
  const called = {
    id: { processInstanceId: owner.processInstanceId, elementId: "call", activation: 1 },
    caller: owner, calledProcessId: "called-definition", calledRoot, returnOperationId: "return",
  };
  const input = {
    ...state,
    calledProcessOccurrences: [called, {
      ...called, id: { ...called.id, processInstanceId: "called" },
      caller: calledRoot, calledRoot: nestedRoot,
    }],
    parallelScopeControllers: [controller, otherController,
      { ...controller, id: { ...id, processInstanceId: "called" } },
      { ...controller, id: { ...id, processInstanceId: "nested" } }],
  };
  assert.deepEqual(removeCalledProcessSubtreesForCallers(input, [owner]).parallelScopeControllers,
    [controller, otherController]);
});
