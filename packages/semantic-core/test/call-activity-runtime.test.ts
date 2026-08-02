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
  VariableValueKind,
  applyInternalOperation,
  applyStimulus,
  callOperationsArePaired,
  deriveCalledProcessInstanceId,
  enabledInternalOperationCount,
  initialState,
  isStableStateResumable,
  projectOpenUserTasks,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  RuntimeState,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

const callerProcessId = "Process_Caller";
const calledProcessId = "Process_Called";
const callerScopeId = "scope:Process_Caller";
const calledScopeId = "scope:Process_Called";
const instanceId = "Caller:😀";
const callElementId = "Call:é";

const program = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-called-process-call-activity-draft",
    sourceId: "call-activity-runtime-test",
    sourceSha256: "c".repeat(64),
  },
  processId: callerProcessId,
  definitionScopes: [
    { id: callerScopeId, parentScopeId: null, originElementId: callerProcessId },
    { id: calledScopeId, parentScopeId: null, originElementId: calledProcessId },
  ],
  operationScopes: ([
    ["operation:Call:é", callerScopeId],
    ["operation:End_Called", calledScopeId],
    ["operation:End_Caller", callerScopeId],
    ["operation:Start_Caller", callerScopeId],
    ["operation:Task_Called", calledScopeId],
    ["operation:Task_Caller", callerScopeId],
    ["operation:complete-scope:scope:Process_Caller", callerScopeId],
    ["operation:return-process:Call:é", calledScopeId],
  ] as const).map(([operationId, scopeId]) => ({ operationId, scopeId })),
  controlPlaceScopes: ([
    ["place:Called_End", calledScopeId],
    ["place:Called_Start", calledScopeId],
    ["place:Call_To_Caller_Task", callerScopeId],
    ["place:Caller_End", callerScopeId],
    ["place:Caller_Start", callerScopeId],
  ] as const).map(([controlPlaceId, scopeId]) => ({ controlPlaceId, scopeId })),
  controlPlaces: [
    "Called_End",
    "Called_Start",
    "Call_To_Caller_Task",
    "Caller_End",
    "Caller_Start",
  ].map((elementId) => ({
    id: `place:${elementId}`,
    origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId },
  })),
  operations: [
    {
      id: `operation:${callElementId}`,
      kind: SemanticOperationKind.InvokeProcess,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: callElementId },
      input: "place:Caller_Start",
      calledProcessId,
      calledRootScopeId: calledScopeId,
      calledEntry: "place:Called_Start",
      returnOperationId: `operation:return-process:${callElementId}`,
    },
    {
      id: "operation:End_Called",
      kind: SemanticOperationKind.ReachNoneEnd,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "End_Called" },
      input: "place:Called_End",
    },
    {
      id: "operation:End_Caller",
      kind: SemanticOperationKind.ReachNoneEnd,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "End_Caller" },
      input: "place:Caller_End",
    },
    {
      id: "operation:Start_Caller",
      kind: SemanticOperationKind.Initiate,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Start_Caller" },
      output: "place:Caller_Start",
    },
    {
      id: "operation:Task_Called",
      kind: SemanticOperationKind.AwaitUserTask,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Task_Called" },
      input: "place:Called_Start",
      output: "place:Called_End",
      task: { elementId: "Task_Called", name: "Called task" },
    },
    {
      id: "operation:Task_Caller",
      kind: SemanticOperationKind.AwaitUserTask,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Task_Caller" },
      input: "place:Call_To_Caller_Task",
      output: "place:Caller_End",
      task: { elementId: "Task_Caller", name: "Caller task" },
    },
    {
      id: "operation:complete-scope:scope:Process_Caller",
      kind: SemanticOperationKind.CompleteScope,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: callerProcessId },
      scopeId: callerScopeId,
      parentOutput: null,
    },
    {
      id: `operation:return-process:${callElementId}`,
      kind: SemanticOperationKind.ReturnProcess,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: callElementId },
      calledProcessId,
      calledRootScopeId: calledScopeId,
      callerOutput: "place:Call_To_Caller_Task",
    },
  ],
} as const satisfies SemanticProcessProgram;

const expectedCalledInstanceId = "call:11:Caller:😀:7:Call:é:1";

test("counts all called-definition identities before validating the selected root", () => {
  const operationScopes = new Map(
    program.operationScopes.map(({ operationId, scopeId }) => [operationId, scopeId]),
  );
  const placeScopes = new Map(
    program.controlPlaceScopes.map(({ controlPlaceId, scopeId }) => [
      controlPlaceId,
      scopeId,
    ]),
  );
  assert.equal(
    callOperationsArePaired(
      program.processId,
      [
        ...program.definitionScopes,
        {
          id: "scope:CalledProcess_Duplicate",
          parentScopeId: null,
          originElementId: calledProcessId,
        },
      ],
      program.operations,
      operationScopes,
      placeScopes,
    ),
    false,
  );
});

test("invokes one distinct called Process and returns only after its task completes", () => {
  const started = applyStimulus(program, initialState, start(), 3);
  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.equal(started.internalStepBoundExceeded, false);
  assert.deepEqual(openTaskIds(started.state), [expectedCalledInstanceId]);
  assert.equal(started.state.control.kind, ControlStateKind.Running);
  assert.equal(started.state.control.instanceId, instanceId);
  assert.equal(started.state.calledProcessOccurrences.length, 1);
  assert.equal(started.state.scopeOccurrences.filter(({ parent }) => parent === null).length, 2);
  assert.equal(applyStimulus(program, initialState, start(), 2).internalStepBoundExceeded, true);
  assertSingleEnabledClosure(applyStimulus(program, initialState, start(), 0).state);

  const calledCompleted = applyStimulus(
    program,
    started.state,
    completion(expectedCalledInstanceId, "Task_Called", "complete-called"),
    3,
  );
  assert.equal(calledCompleted.outcome, CommandOutcome.Committed);
  assert.equal(calledCompleted.internalStepBoundExceeded, false);
  assert.deepEqual(openTaskIds(calledCompleted.state), [instanceId]);
  assert.equal(calledCompleted.state.calledProcessOccurrences.length, 0);
  assert.deepEqual(
    calledCompleted.state.scopeOccurrences.map(({ id }) => id.processInstanceId),
    [instanceId],
  );
  assert.equal(
    applyStimulus(
      program,
      started.state,
      completion(expectedCalledInstanceId, "Task_Called", "short-called"),
      2,
    ).internalStepBoundExceeded,
    true,
  );
  assertSingleEnabledClosure(
    applyStimulus(
      program,
      started.state,
      completion(expectedCalledInstanceId, "Task_Called", "zero-called"),
      0,
    ).state,
  );

  const completed = applyStimulus(
    program,
    calledCompleted.state,
    completion(instanceId, "Task_Caller", "complete-caller"),
    2,
  );
  assert.equal(completed.internalStepBoundExceeded, false);
  assert.deepEqual(completed.state.control, {
    kind: ControlStateKind.Completed,
    instanceId,
  });
  assert.equal(
    applyStimulus(
      program,
      calledCompleted.state,
      completion(instanceId, "Task_Caller", "short-caller"),
      1,
    ).internalStepBoundExceeded,
    true,
  );
  assertSingleEnabledClosure(
    applyStimulus(
      program,
      calledCompleted.state,
      completion(instanceId, "Task_Caller", "zero-caller"),
      0,
    ).state,
  );
});

test("derives injective UTF-8-length identities and keeps root wait identities unchanged", () => {
  assert.equal(
    deriveCalledProcessInstanceId(instanceId, callElementId, 1),
    expectedCalledInstanceId,
  );
  assert.notEqual(expectedCalledInstanceId, "call:9:Caller:😀:6:Call:é:1");

  const started = applyStimulus(program, initialState, start());
  const calledCompleted = applyStimulus(
    program,
    started.state,
    completion(expectedCalledInstanceId, "Task_Called", "called"),
  );
  assert.deepEqual(
    calledCompleted.state.userTaskWaits[0]?.id,
    { processInstanceId: instanceId, elementId: "Task_Caller", activation: 1 },
  );

  const syntheticOwner = {
    processInstanceId: "Synthetic_Called_Instance",
    definitionScopeId: calledScopeId,
    activation: 1,
  };
  const syntheticTimer = applyInternalOperation(
    {
      id: "operation:Synthetic_Timer",
      kind: SemanticOperationKind.AwaitTimer,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Synthetic_Timer" },
      input: "place:Synthetic_Timer_Input",
      timer: { elementId: "Synthetic_Timer", durationMs: 1000 },
      output: "place:Synthetic_Timer_Output",
    },
    {
      ...initialState,
      control: { kind: ControlStateKind.Running, instanceId },
      scopeOccurrences: [{ id: syntheticOwner, parent: null }],
      controlTokens: [{
        placeId: "place:Synthetic_Timer_Input",
        owner: syntheticOwner,
        multiplicity: 1,
      }],
    },
  );
  assert.equal(
    syntheticTimer?.timerWaits[0]?.id.processInstanceId,
    syntheticOwner.processInstanceId,
  );
});

test("rejects wrong semantic task identity and nonempty selected-profile data without mutation", () => {
  const nonemptyStart = start([{
    name: "forbidden",
    value: { kind: VariableValueKind.String, value: "x" },
  }]);
  const rejectedStart = applyStimulus(program, initialState, nonemptyStart);
  assert.equal(rejectedStart.outcome, CommandOutcome.Rejected);
  assert.deepEqual(rejectedStart.state, initialState);

  const started = applyStimulus(program, initialState, start());
  for (const stimulus of [
    completion(instanceId, "Task_Called", "wrong-instance"),
    {
      ...completion(expectedCalledInstanceId, "Task_Called", "nonempty-task"),
      submittedValues: [{
        name: "forbidden",
        value: { kind: VariableValueKind.String, value: "x" },
      }],
    },
  ] as const) {
    const rejected = applyStimulus(program, started.state, stimulus);
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, started.state);
  }

  const afterCalled = applyStimulus(
    program,
    started.state,
    completion(expectedCalledInstanceId, "Task_Called", "valid-called"),
  );
  const stale = applyStimulus(
    program,
    afterCalled.state,
    completion(expectedCalledInstanceId, "Task_Called", "stale-called"),
  );
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, afterCalled.state);
});

test("requires unique call records and roots and commits before a malformed return strands closure", () => {
  const started = applyStimulus(program, initialState, start());
  const invokeOperation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.InvokeProcess,
  );
  const returnOperation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.ReturnProcess,
  );
  assert.ok(invokeOperation?.kind === SemanticOperationKind.InvokeProcess);
  assert.ok(returnOperation?.kind === SemanticOperationKind.ReturnProcess);
  assert.equal(applyInternalOperation(returnOperation, started.state), null);
  const beforeInvoke = applyStimulus(program, initialState, start(), 1).state;
  assert.equal(
    applyInternalOperation(invokeOperation, {
      ...beforeInvoke,
      controlTokens: beforeInvoke.controlTokens.map((token) => ({
        ...token,
        multiplicity: 2,
      })),
    }),
    null,
  );

  const beforeReturn = applyStimulus(
    program,
    started.state,
    completion(expectedCalledInstanceId, "Task_Called", "one-step"),
    1,
  ).state;
  const record = beforeReturn.calledProcessOccurrences[0];
  const calledRoot = beforeReturn.scopeOccurrences.find(
    ({ id }) => id.processInstanceId === expectedCalledInstanceId,
  );
  assert.ok(record !== undefined && calledRoot !== undefined);
  assert.equal(
    applyInternalOperation(returnOperation, {
      ...beforeReturn,
      calledProcessOccurrences: [],
    }),
    null,
  );
  assert.equal(
    applyInternalOperation(returnOperation, {
      ...beforeReturn,
      calledProcessOccurrences: [record, record],
    }),
    null,
  );
  assert.equal(
    applyInternalOperation(returnOperation, {
      ...beforeReturn,
      calledProcessOccurrences: [
        record,
        { ...record, calledProcessId: "Other_Process" },
      ],
    }),
    null,
  );
  assert.equal(
    applyInternalOperation(returnOperation, {
      ...beforeReturn,
      calledProcessOccurrences: [{
        ...record,
        calledRoot: {
          ...record.calledRoot,
          processInstanceId: "call:wrong-derived-identity",
        },
      }],
      scopeOccurrences: beforeReturn.scopeOccurrences.map((occurrence) =>
        occurrence.id.processInstanceId === record.calledRoot.processInstanceId
          ? {
              ...occurrence,
              id: {
                ...occurrence.id,
                processInstanceId: "call:wrong-derived-identity",
              },
            }
          : occurrence
      ),
    }),
    null,
  );
  assert.equal(
    applyInternalOperation(returnOperation, {
      ...beforeReturn,
      calledProcessOccurrences: [{
        ...record,
        id: { ...record.id, activation: 0 },
      }],
    }),
    null,
  );
  assert.equal(
    applyInternalOperation(returnOperation, {
      ...beforeReturn,
      scopeOccurrences: [...beforeReturn.scopeOccurrences, calledRoot],
    }),
    null,
  );

  const malformed = {
    ...started.state,
    calledProcessOccurrences: [
      ...started.state.calledProcessOccurrences,
      record,
    ],
  };
  const committed = applyStimulus(
    program,
    malformed,
    completion(expectedCalledInstanceId, "Task_Called", "commit-before-strand"),
  );
  assert.equal(committed.outcome, CommandOutcome.Committed);
  assert.equal(committed.state.userTaskWaits.length, 0);
  assert.equal(isStableStateResumable(committed.state), false);
  assert.equal(
    isStableStateResumable({
      ...started.state,
      calledProcessOccurrences: [],
    }),
    false,
  );

  const hostingRoot = started.state.scopeOccurrences.find(
    ({ id }) => id.processInstanceId === instanceId,
  );
  const activeRecord = started.state.calledProcessOccurrences[0];
  assert.ok(hostingRoot !== undefined && activeRecord !== undefined);
  const aliasedCalledRoot = {
    ...activeRecord.calledRoot,
    processInstanceId: instanceId,
  };
  assert.equal(
    isStableStateResumable({
      ...started.state,
      scopeOccurrences: [
        hostingRoot,
        { id: aliasedCalledRoot, parent: null },
      ],
      userTaskWaits: started.state.userTaskWaits.map((wait) => ({
        ...wait,
        owner: aliasedCalledRoot,
      })),
      calledProcessOccurrences: [{
        ...activeRecord,
        calledRoot: aliasedCalledRoot,
      }],
    }),
    false,
  );
});

test("keeps a live call hidden but blocks caller completion and exposes early-continuation bypasses", () => {
  const started = applyStimulus(program, initialState, start());
  const callerRoot = started.state.scopeOccurrences.find(
    ({ id }) => id.processInstanceId === instanceId,
  );
  const completionOperation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.CompleteScope,
  );
  const callerTask = program.operations.find(
    ({ id }) => id === "operation:Task_Caller",
  );
  assert.ok(callerRoot !== undefined);
  assert.ok(completionOperation?.kind === SemanticOperationKind.CompleteScope);
  assert.ok(callerTask?.kind === SemanticOperationKind.AwaitUserTask);

  const hiddenOnly: RuntimeState = {
    ...started.state,
    scopeOccurrences: [callerRoot],
    userTaskWaits: [],
    controlTokens: [],
  };
  assert.equal(applyInternalOperation(completionOperation, hiddenOnly), null);

  const bypassed = applyInternalOperation(callerTask, {
    ...started.state,
    controlTokens: [{
      placeId: "place:Call_To_Caller_Task",
      owner: callerRoot.id,
      multiplicity: 1,
    }],
  });
  assert.ok(bypassed !== null);
  assert.deepEqual(
    projectOpenUserTasks(bypassed).map(({ id }) => id.processInstanceId),
    [instanceId, expectedCalledInstanceId],
  );
});

test("interrupting a caller removes its separately parentless called Process subtree", () => {
  const started = applyStimulus(program, initialState, start());
  const caller = started.state.scopeOccurrences.find(
    ({ id }) => id.processInstanceId === instanceId,
  );
  assert.ok(caller !== undefined);
  const host = {
    processInstanceId: instanceId,
    definitionScopeId: "scope:Host",
    activation: 1,
  };
  const errorOperation = {
    id: "operation:ErrorEnd",
    kind: SemanticOperationKind.ThrowError,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "ErrorEnd" },
    input: "place:ErrorInput",
    error: { errorDefinitionId: "ErrorDefinition", errorElementId: "Error", code: "E" },
    handler: {
      attachedScopeId: callerScopeId,
      code: "E",
      output: "place:Handled",
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        boundaryEventId: "BoundaryError",
        errorDefinitionId: "ErrorDefinition",
        errorElementId: "Error",
        sequenceFlowId: "Handled",
      },
    },
  } as const;
  const synthetic: RuntimeState = {
    ...started.state,
    scopeOccurrences: [
      { id: host, parent: null },
      ...started.state.scopeOccurrences.map((occurrence) =>
        occurrence === caller ? { ...occurrence, parent: host } : occurrence
      ),
    ],
    controlTokens: [{
      placeId: "place:ErrorInput",
      owner: caller.id,
      multiplicity: 1,
    }],
  };

  const interrupted = applyInternalOperation(errorOperation, synthetic);
  assert.ok(interrupted !== null);
  assert.deepEqual(interrupted.calledProcessOccurrences, []);
  assert.deepEqual(interrupted.userTaskWaits, []);
  assert.deepEqual(interrupted.scopeOccurrences, [{ id: host, parent: null }]);
  assert.deepEqual(interrupted.controlTokens, [{
    placeId: "place:Handled",
    owner: host,
    multiplicity: 1,
  }]);
});

function start(initialVariables: StartProcessStimulus["initialVariables"] = []): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId: "start-call",
    processId: callerProcessId,
    instanceId,
    initialVariables,
  };
}

function completion(
  processInstanceId: string,
  elementId: string,
  commandId: string,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId: { processInstanceId, elementId, activation: 1 },
    submittedValues: [],
  };
}

function openTaskIds(state: RuntimeState): ReadonlyArray<string> {
  return projectOpenUserTasks(state).map(({ id }) => id.processInstanceId);
}

function assertSingleEnabledClosure(initial: RuntimeState): void {
  let state = initial;
  for (let step = 0; step < 8; step += 1) {
    const count = enabledInternalOperationCount(program, state);
    if (count === 0) {
      return;
    }
    assert.equal(count, 1);
    const operation = program.operations.find(
      (candidate) => applyInternalOperation(candidate, state) !== null,
    );
    assert.ok(operation !== undefined);
    const successor = applyInternalOperation(operation, state);
    assert.ok(successor !== null);
    state = successor;
  }
  assert.fail("Call Activity closure did not stabilize within the semantic limit");
}
