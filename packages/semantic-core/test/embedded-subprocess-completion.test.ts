import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  applyInternalOperation,
  applyStimulus,
  initialState,
  isWellFormedSemanticProcessProgram,
  isStableStateResumable,
  projectOpenUserTasks,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
  UserTaskInstanceId,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";

const processId = "Process_EmbeddedSubProcess";
const rootScopeId = "scope:Process_EmbeddedSubProcess";
const childScopeId = "scope:SubProcess_Work";
const instanceId = "EmbeddedSubProcessInstance_1";

const program = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile:
      "cibseven-2.2.0-embedded-subprocess-completion-draft",
    sourceId: "embedded-subprocess-completion-process",
    sourceSha256:
      "6ca0aa3bccb005de1ac4b6ef6283f2a29c4f4ef7c3e8aff6bf29d79247f09a36",
  },
  processId,
  definitionScopes: [
    {
      id: rootScopeId,
      parentScopeId: null,
      originElementId: processId,
    },
    {
      id: childScopeId,
      parentScopeId: rootScopeId,
      originElementId: "SubProcess_Work",
    },
  ],
  operationScopes: ([
    ["operation:EndEvent_ChildA", childScopeId],
    ["operation:EndEvent_ChildB", childScopeId],
    ["operation:EndEvent_Outer", rootScopeId],
    ["operation:Gateway_ChildFork", childScopeId],
    ["operation:StartEvent_Outer", rootScopeId],
    ["operation:SubProcess_Work", rootScopeId],
    ["operation:UserTask_AfterScope", rootScopeId],
    ["operation:UserTask_ChildA", childScopeId],
    ["operation:UserTask_ChildB", childScopeId],
    ["operation:complete-scope:scope:Process_EmbeddedSubProcess", rootScopeId],
    ["operation:complete-scope:scope:SubProcess_Work", childScopeId],
  ] as const).map(([operationId, scopeId]) => ({ operationId, scopeId })),
  controlPlaceScopes: ([
    ["place:Flow_AfterToOuterEnd", rootScopeId],
    ["place:Flow_ChildAToEnd", childScopeId],
    ["place:Flow_ChildBToEnd", childScopeId],
    ["place:Flow_ChildForkToA", childScopeId],
    ["place:Flow_ChildForkToB", childScopeId],
    ["place:Flow_ChildStartToFork", childScopeId],
    ["place:Flow_OuterStartToScope", rootScopeId],
    ["place:Flow_ScopeToAfter", rootScopeId],
  ] as const).map(([controlPlaceId, scopeId]) => ({ controlPlaceId, scopeId })),
  controlPlaces: [
    "Flow_AfterToOuterEnd",
    "Flow_ChildAToEnd",
    "Flow_ChildBToEnd",
    "Flow_ChildForkToA",
    "Flow_ChildForkToB",
    "Flow_ChildStartToFork",
    "Flow_OuterStartToScope",
    "Flow_ScopeToAfter",
  ].map(controlPlace),
  operations: [
    {
      ...operationBase("EndEvent_ChildA"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_ChildAToEnd",
    },
    {
      ...operationBase("EndEvent_ChildB"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_ChildBToEnd",
    },
    {
      ...operationBase("EndEvent_Outer"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_AfterToOuterEnd",
    },
    {
      ...operationBase("Gateway_ChildFork"),
      kind: SemanticOperationKind.Duplicate,
      input: "place:Flow_ChildStartToFork",
      outputs: ["place:Flow_ChildForkToA", "place:Flow_ChildForkToB"],
    },
    {
      ...operationBase("StartEvent_Outer"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_OuterStartToScope",
    },
    {
      ...operationBase("SubProcess_Work"),
      kind: SemanticOperationKind.EnterScope,
      input: "place:Flow_OuterStartToScope",
      childEntry: "place:Flow_ChildStartToFork",
      childScopeId,
    },
    userTask("UserTask_AfterScope", "After Scope",
      "Flow_ScopeToAfter", "Flow_AfterToOuterEnd"),
    userTask("UserTask_ChildA", "Child A",
      "Flow_ChildForkToA", "Flow_ChildAToEnd"),
    userTask("UserTask_ChildB", "Child B",
      "Flow_ChildForkToB", "Flow_ChildBToEnd"),
    {
      id: "operation:complete-scope:scope:Process_EmbeddedSubProcess",
      kind: SemanticOperationKind.CompleteScope,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: processId },
      scopeId: rootScopeId,
      parentOutput: null,
    },
    {
      id: "operation:complete-scope:scope:SubProcess_Work",
      kind: SemanticOperationKind.CompleteScope,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: "SubProcess_Work",
      },
      scopeId: childScopeId,
      parentOutput: "place:Flow_ScopeToAfter",
    },
  ],
} as const satisfies SemanticProcessProgram;

test("admits scope ownership through generic graph facts", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
});

test("one child End Event cannot complete the scope", () => {
  const waiting = applyStimulus(program, initialState, startStimulus());
  assert.equal(waiting.outcome, CommandOutcome.Committed);
  assert.deepEqual(openTaskIds(waiting.state), ["UserTask_ChildA", "UserTask_ChildB"]);
  assert.equal(waiting.state.scopeOccurrences.length, 2);

  const afterA = applyStimulus(program, waiting.state, completion("UserTask_ChildA"));
  assert.deepEqual(openTaskIds(afterA.state), ["UserTask_ChildB"]);
  assert.equal(afterA.state.scopeOccurrences.length, 2);
  assert.equal(afterA.state.endOccurrences, 1);
  assert.equal(isStableStateResumable(afterA.state), true);

  const stale = applyStimulus(program, afterA.state, {
    ...completion("UserTask_ChildA"),
    commandId: "stale-child-a",
  });
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, afterA.state);
});

test("both child completion orders resume the same parent wait", () => {
  const waiting = applyStimulus(program, initialState, startStimulus());
  const afterA = applyStimulus(program, waiting.state, completion("UserTask_ChildA"));
  const aThenB = applyStimulus(program, afterA.state, completion("UserTask_ChildB"));
  const afterB = applyStimulus(program, waiting.state, completion("UserTask_ChildB"));
  const bThenA = applyStimulus(program, afterB.state, completion("UserTask_ChildA"));

  assert.deepEqual(aThenB.state, bThenA.state);
  assert.deepEqual(openTaskIds(aThenB.state), ["UserTask_AfterScope"]);
  assert.deepEqual(
    aThenB.state.scopeOccurrences.map(({ id }) => id.definitionScopeId),
    [rootScopeId],
  );
  assert.equal(aThenB.state.endOccurrences, 2);

  const completed = applyStimulus(
    program,
    aThenB.state,
    completion("UserTask_AfterScope"),
  );
  assert.deepEqual(completed.state.control, {
    kind: ControlStateKind.Completed,
    instanceId,
  });
  assert.deepEqual(completed.state.scopeOccurrences, []);
  assert.equal(completed.state.endOccurrences, 3);
});

test("every selected completion prefix is terminal or exposes an interaction", () => {
  for (const order of [
    ["UserTask_ChildA", "UserTask_ChildB"],
    ["UserTask_ChildB", "UserTask_ChildA"],
  ] as const) {
    let state = applyStimulus(
      program,
      initialState,
      startStimulus(),
    ).state;
    for (const elementId of [...order, "UserTask_AfterScope"]) {
      if (state.control.kind === ControlStateKind.Running) {
        assert.equal(isStableStateResumable(state), true);
        assert.notEqual(projectOpenUserTasks(state).length, 0);
      }
      const result = applyStimulus(
        program,
        state,
        completion(elementId),
      );
      assert.equal(result.outcome, CommandOutcome.Committed);
      state = result.state;
    }
    assert.equal(state.control.kind, ControlStateKind.Completed);
  }
});

test("a stranded child token is quiescent to the host but not completable", () => {
  const waiting = applyStimulus(program, initialState, startStimulus());
  const child = waiting.state.scopeOccurrences.find(
    ({ id }) => id.definitionScopeId === childScopeId,
  );
  assert.ok(child !== undefined);
  const stranded = {
    ...waiting.state,
    userTaskWaits: [],
    controlTokens: [{
      placeId: "place:stranded-child",
      owner: child.id,
      multiplicity: 1,
    }],
  };
  const completionOperation = program.operations.find(
    (operation) =>
      operation.kind === SemanticOperationKind.CompleteScope &&
      operation.scopeId === childScopeId,
  );
  assert.ok(completionOperation !== undefined);
  assert.equal(applyInternalOperation(completionOperation, stranded), null);
  assert.equal(isStableStateResumable(stranded), false);
});

function userTask(
  elementId: string,
  name: string,
  inputFlow: string,
  outputFlow: string,
) {
  return {
    ...operationBase(elementId),
    kind: SemanticOperationKind.AwaitUserTask,
    input: `place:${inputFlow}`,
    output: `place:${outputFlow}`,
    task: { elementId, name },
  } as const;
}

function startStimulus(): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId: "start-embedded-subprocess",
    processId,
    instanceId,
    initialVariables: [],
  };
}

function completion(elementId: string): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: taskId(elementId),
    submittedValues: [],
  };
}

function taskId(elementId: string): UserTaskInstanceId {
  return { processInstanceId: instanceId, elementId, activation: 1 };
}

function openTaskIds(state: Parameters<typeof projectOpenUserTasks>[0]): string[] {
  return projectOpenUserTasks(state).map(({ id }) => id.elementId);
}
