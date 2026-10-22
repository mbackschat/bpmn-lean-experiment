import assert from "node:assert/strict";
import test from "node:test";
import {
  ActivityBodyKind,
  ControlStateKind,
  LocalDataOwnerKind,
  VariableValueKind,
  initialState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState } from "@bpmn-lean/semantic-core";
import { projectUserTaskDetail } from "@bpmn-lean/temporal-protocol";

function taskState(instanceId: string, scopeId: string): RuntimeState {
  const task = { processInstanceId: instanceId, elementId: "Review", activation: 1 };
  const activity = { processInstanceId: instanceId, activityElementId: "Review", activation: 1 };
  const owner = { processInstanceId: instanceId, definitionScopeId: scopeId, activation: 1 };
  return {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: "Caller" },
    userTaskWaits: [{ id: task, owner, name: null, output: "Next" }],
    activityOccurrences: [{ id: activity, owner, operationId: "AwaitReview", body: { kind: ActivityBodyKind.UserTask, task }, attachedHandlers: [] }],
    variables: {
      process: { bindings: [{ name: "SharedName", value: { kind: VariableValueKind.String, value: "Caller secret" } }] },
      scopes: [], processInterfaces: [],
      activities: [{
        owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id: activity },
        bindings: [{ name: "SharedName", value: { kind: VariableValueKind.String, value: "Task input" } }],
      }],
    },
  };
}

test("called task detail exposes its copied inputs without selecting caller Properties", () => {
  const state = taskState("Called", "CalledRoot");
  const detail = projectUserTaskDetail(state, { taskId: state.userTaskWaits[0]!.id, inputVariableNames: ["SharedName"] });
  assert.ok(detail);
  assert.deepEqual(detail.inputVariables, []);
  assert.deepEqual(detail.task.inputs, state.variables.activities[0]!.bindings);
});

test("CVM-OBSERVE-01: a mapped called task reads selected names from its called-root frame only", () => {
  const state = taskState("Called", "CalledRoot");
  const frame = { owner: state.userTaskWaits[0]!.owner,
    bindings: [{ name: "SharedName", value: { kind: VariableValueKind.String, value: "Called copy" } }] };
  const detail = projectUserTaskDetail({ ...state, variables: { ...state.variables, scopes: [frame] } },
    { taskId: state.userTaskWaits[0]!.id, inputVariableNames: ["SharedName", "riskScore"] });
  assert.deepEqual(detail?.inputVariables, frame.bindings);
});

test("hosting caller tasks retain selected Properties, including tasks in embedded scopes", () => {
  for (const scope of ["CallerRoot", "EmbeddedScope"]) {
    const state = taskState("Caller", scope);
    const detail = projectUserTaskDetail(state, { taskId: state.userTaskWaits[0]!.id, inputVariableNames: ["SharedName"] });
    assert.ok(detail);
    assert.deepEqual(detail.inputVariables, state.variables.process.bindings);
    assert.deepEqual(detail.task.inputs, state.variables.activities[0]!.bindings);
  }
});

test("task detail does not use a caller-shaped task ID to bypass its called scope owner", () => {
  const state = taskState("Caller", "CalledRoot");
  const wait = state.userTaskWaits[0]!;
  const detail = projectUserTaskDetail({
    ...state,
    userTaskWaits: [{ ...wait, owner: { ...wait.owner, processInstanceId: "Called" } }],
  }, { taskId: wait.id, inputVariableNames: ["SharedName"] });
  assert.ok(detail);
  assert.deepEqual(detail.inputVariables, []);
});
