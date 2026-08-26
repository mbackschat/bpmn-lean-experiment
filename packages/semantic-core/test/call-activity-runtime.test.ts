import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  VariableValueKind,
  applyInternalOperation,
  applyStimulus,
  enabledInternalOperationCount,
  initialState,
  projectOpenUserTasks,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState } from "@bpmn-lean/semantic-core";

import {
  callActivityCompletion as completion,
  callActivityProgram as program,
  callActivityStart as start,
  calledScopeId,
  callerScopeId,
  expectedCalledInstanceId,
  instanceId,
} from "./call-activity-fixture.ts";

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

test("keeps root and called wait identities owned by their semantic instances", () => {
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
    program,
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
  assert.equal(applyInternalOperation(program, completionOperation, hiddenOnly), null);

  const bypassed = applyInternalOperation(program, callerTask, {
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
  const withoutControllers: RuntimeState = {
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

  const interrupted = applyInternalOperation(
    program,
    errorOperation,
    withoutControllers,
  );
  assert.ok(interrupted !== null);
  assert.deepEqual(interrupted.calledProcessOccurrences, []);
  assert.deepEqual(interrupted.userTaskWaits, []);
  assert.deepEqual(interrupted.scopeOccurrences, [{ id: host, parent: null }]);
  assert.deepEqual(interrupted.controlTokens, [{
    placeId: "place:Handled",
    owner: host,
    multiplicity: 1,
  }]);
  assert.equal(
    Object.hasOwn(interrupted, "sequentialMultiInstanceControllers"),
    false,
    "the public interruption route preserves the optional field's historical absence",
  );
  assert.equal(
    Object.hasOwn(interrupted, "parallelMultiInstanceControllers"),
    false,
    "the public interruption route preserves the parallel field's historical absence",
  );

  const directCalledRoot = started.state.calledProcessOccurrences[0]?.calledRoot;
  assert.ok(directCalledRoot !== undefined);
  const nestedCalledRoot = {
    processInstanceId: "Nested_Called_Instance",
    definitionScopeId: "scope:Nested_Called_Process",
    activation: 1,
  };
  const withdrawnController = {
    id: {
      processInstanceId: nestedCalledRoot.processInstanceId,
      activityElementId: "Called_Sequential_Activity",
      activation: 1,
    },
    snapshot: ["withdrawn"],
    outputSlots: [],
  };
  const unrelatedController = {
    id: {
      processInstanceId: instanceId,
      activityElementId: "Caller_Sequential_Activity",
      activation: 1,
    },
    snapshot: ["retained"],
    outputSlots: [],
  };
  const withdrawnParallelController = {
    id: {
      processInstanceId: nestedCalledRoot.processInstanceId,
      activityElementId: "Called_Parallel_Activity",
      activation: 1,
    },
    snapshot: ["withdrawn"],
    slots: [],
  };
  const unrelatedParallelController = {
    id: {
      processInstanceId: instanceId,
      activityElementId: "Caller_Parallel_Activity",
      activation: 1,
    },
    snapshot: ["retained"],
    slots: [],
  };
  const withControllers: RuntimeState = {
    ...withoutControllers,
    scopeOccurrences: [
      ...withoutControllers.scopeOccurrences,
      { id: nestedCalledRoot, parent: null },
    ],
    calledProcessOccurrences: [
      ...withoutControllers.calledProcessOccurrences,
      {
        id: {
          processInstanceId: directCalledRoot.processInstanceId,
          elementId: "Nested_Call",
          activation: 1,
        },
        caller: directCalledRoot,
        calledProcessId: "Nested_Called_Process",
        calledRoot: nestedCalledRoot,
        returnOperationId: "operation:return-process:Nested_Call",
      },
    ],
    // The removed called Process deliberately has no live record or wait. The association and root
    // still identify its closure, so leaving its controller behind would create an ownerless entry.
    activityOccurrences: [],
    userTaskWaits: [],
    logicalTimeMs: 73,
    sequentialMultiInstanceControllers: [
      withdrawnController,
      unrelatedController,
    ],
    parallelMultiInstanceControllers: [
      withdrawnParallelController,
      unrelatedParallelController,
    ],
  };

  const after = applyInternalOperation(program, errorOperation, withControllers);
  assert.ok(after !== null, "the public ThrowError evaluator must interrupt the caller");
  assert.deepEqual(after.sequentialMultiInstanceControllers, [unrelatedController]);
  assert.deepEqual(after.parallelMultiInstanceControllers, [unrelatedParallelController]);
  assert.equal(
    after.scopeOccurrences.some(({ id }) =>
      id.processInstanceId === expectedCalledInstanceId ||
      id.processInstanceId === nestedCalledRoot.processInstanceId
    ),
    false,
    "the direct and nested called roots are both in the removed closure",
  );
  assert.deepEqual(after.variables.process, withControllers.variables.process);
  assert.equal(after.logicalTimeMs, withControllers.logicalTimeMs);
  for (const field of [
    "endOccurrences",
    "taskActivations",
    "messageActivations",
    "timerActivations",
    "eventRaceActivations",
    "callActivations",
    "effectActivations",
    "scopeActivations",
    "activityActivations",
  ] as const) {
    assert.deepEqual(after[field], withControllers[field], field);
  }
});

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
      (candidate) => applyInternalOperation(program, candidate, state) !== null,
    );
    assert.ok(operation !== undefined);
    const successor = applyInternalOperation(program, operation, state);
    assert.ok(successor !== null);
    state = successor;
  }
  assert.fail("Call Activity closure did not stabilize within the semantic limit");
}
