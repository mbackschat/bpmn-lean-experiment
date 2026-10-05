import assert from "node:assert/strict";
import { test } from "node:test";
import { ActivityBodyKind, initialState } from "@bpmn-lean/semantic-core";
import type { ActivityOccurrence, RuntimeState, ScopeOccurrenceId } from "@bpmn-lean/semantic-core";
import type { SequentialScopeController } from "../src/sequential-scope-controller.ts";

const { removeScopeOccurrenceSubtree } = await import(new URL("../dist/semantic-process-scope-cancellation.js", import.meta.url).href) as typeof import("../src/semantic-process-scope-cancellation.ts");
const { removeCalledProcessSubtreesForCallers } = await import(new URL("../dist/semantic-process-call-runtime.js", import.meta.url).href) as typeof import("../src/semantic-process-call-runtime.ts");
const { isPristineRuntimeState } = await import(new URL("../dist/pristine-runtime-state.js", import.meta.url).href) as typeof import("../src/pristine-runtime-state.ts");

const root: ScopeOccurrenceId = { processInstanceId: "P", definitionScopeId: "root", activation: 1 };
const first = { ...root, definitionScopeId: "body" };
const second = { ...first, activation: 2 };
const foreignRoot = { ...root, processInstanceId: "Other" };
const foreign = { ...first, processInstanceId: "Other" };
function activity(body: ScopeOccurrenceId, owner: ScopeOccurrenceId): ActivityOccurrence {
  return { id: { processInstanceId: body.processInstanceId, activityElementId: "Batch", activation: body.activation },
    owner, operationId: "entry", body: { kind: ActivityBodyKind.ChildScope, scope: body }, attachedHandlers: [] };
}
const activities = [activity(first, root), activity(second, root), activity(foreign, foreignRoot)];
const controllers: SequentialScopeController[] = activities.map(({ id }) => ({ id, total: 2, completed: 0, currentItem: "invoice" }));
const state: RuntimeState = { ...initialState,
  scopeOccurrences: [{ id: root, parent: null }, { id: first, parent: root }, { id: second, parent: root },
    { id: foreignRoot, parent: null }, { id: foreign, parent: foreignRoot }],
  activityOccurrences: activities, sequentialScopeControllers: controllers,
};

test("subtree cleanup removes only the controller of the withdrawn complete Activity identity", () => {
  const after = removeScopeOccurrenceSubtree(state, { id: first, parent: root });
  assert.deepEqual(after.sequentialScopeControllers, controllers.slice(1));
  assert.deepEqual(after.activityOccurrences, activities.slice(1));
  assert.deepEqual(state.sequentialScopeControllers, controllers);
});

test("called-instance cleanup preserves caller controllers with colliding element and activation", () => {
  const called: RuntimeState = { ...state, calledProcessOccurrences: [{
    id: { processInstanceId: "P", elementId: "Call", activation: 1 },
    caller: root, calledProcessId: "Called", calledRoot: foreignRoot, returnOperationId: "return",
  }] };
  const after = removeCalledProcessSubtreesForCallers(called, [root]);
  assert.deepEqual(after.sequentialScopeControllers, controllers.slice(0, 2));
  assert.deepEqual(after.activityOccurrences, activities.slice(0, 2));
});

test("pristine-state admission refuses an injected repeated-scope controller collection", () => {
  assert.equal(isPristineRuntimeState({ ...initialState, sequentialScopeControllers: controllers }), false);
  assert.equal(isPristineRuntimeState(initialState), true);
});
