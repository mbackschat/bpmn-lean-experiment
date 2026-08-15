/**
 * Flow-node occurrence lifecycle contract for the pure semantic-core boundary.
 *
 * The oracle is FNOM-OCCURRENCE-01 in the closure-reviewed Flow-node occurrence metrics specification.
 * These tests distinguish BPMN flow-node occurrences from Program operation executions and from
 * private waits created while a Boundary Event is only armed.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EffectExecutionResultKind,
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  SemanticOperationKind,
  SemanticTransitionKind,
  StimulusKind,
  applyStimulusWithTrace,
  evaluateStimulusWithSelectedSteps,
  foldFlowNodeOccurrenceLifecycleDelta,
  initialState,
  projectFlowNodeOccurrenceLifecycleDelta,
  projectOpenFlowNodeOccurrences,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  callActivityCompletion,
  callActivityProgram,
  callActivityStart,
  expectedCalledInstanceId,
} from "./call-activity-fixture.ts";
import {
  eventRaceProgram,
  eventRaceStart,
  messageDelivery,
} from "./event-based-gateway-fixture.ts";
import {
  boundaryErrorProgram,
  boundedTaskProgram,
  boundedTaskStart,
  configuredTaskProgram,
  incidentProgram,
  openWait,
  propagatedErrorProgram,
  receiveTaskProgram,
  startFor,
} from "./flow-node-occurrence-lifecycle-fixture.ts";
import {
  terminateCompletion,
  terminateProgram,
  terminateStartStimulus,
} from "./terminate-end-event-fixture.ts";

test("Call Activity invoke and return publish one paired occurrence, not two operation-origin occurrences", () => {
  const started = applyStimulusWithTrace(
    callActivityProgram,
    initialState,
    callActivityStart(),
  );
  const returned = applyStimulusWithTrace(
    callActivityProgram,
    started.result.state,
    callActivityCompletion(
      expectedCalledInstanceId,
      "Task_Called",
      "complete-called-task",
    ),
  );
  const callOperationExecutions = [...started.committedTransitions, ...returned.committedTransitions]
    .filter(({ transition }) =>
      transition.kind === SemanticTransitionKind.InternalOperation &&
      transition.origin.elementId === "Call:é"
    );
  assert.equal(callOperationExecutions.length, 2);

  const callStarts = started.flowNodeOccurrenceLifecycles
    .flatMap(({ started }) => started)
    .filter(({ elementId }) => elementId === "Call:é");
  const callEnds = returned.flowNodeOccurrenceLifecycles
    .flatMap(({ ended }) => ended)
    .filter(({ anchor }) =>
      anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.CallActivity &&
      anchor.id.elementId === "Call:é"
    );
  assert.equal(callStarts.length, 1);
  assert.equal(callStarts[0]?.anchor.kind, SemanticFlowNodeOccurrenceAnchorKind.CallActivity);
  assert.deepEqual(callEnds, [{
    anchor: callStarts[0]?.anchor,
    terminal: FlowNodeOccurrenceTerminalKind.Completed,
  }]);
});

test("candidate starts fail closed when a valid existing owner is substituted before the exact open-set oracle", () => {
  const evaluation = evaluateStimulusWithSelectedSteps(
    terminateProgram,
    initialState,
    terminateStartStimulus(),
  );
  assert.ok(evaluation.admittedState !== null);
  let before = evaluation.admittedState;
  let step: typeof evaluation.selectedInternalSteps[number] | undefined;
  for (const candidate of evaluation.selectedInternalSteps) {
    if (candidate.operation.kind === SemanticOperationKind.AwaitUserTask && candidate.owner !== null) {
      const occurrence = before.scopeOccurrences.find(({ id }) =>
        JSON.stringify(id) === JSON.stringify(candidate.owner)
      );
      if (occurrence?.parent !== null && occurrence?.parent !== undefined) {
        step = candidate;
        break;
      }
    }
    before = candidate.successor;
  }
  assert.ok(step !== undefined);
  assert.ok(step.owner !== null);
  const actualOwner = before.scopeOccurrences.find(({ id }) =>
    JSON.stringify(id) === JSON.stringify(step.owner)
  );
  assert.ok(actualOwner?.parent !== null && actualOwner?.parent !== undefined);
  assert.ok(before.scopeOccurrences.some(({ id }) =>
    JSON.stringify(id) === JSON.stringify(actualOwner.parent)
  ));
  assert.ok(projectOpenFlowNodeOccurrences(terminateProgram, step.successor) !== null);

  assert.equal(projectFlowNodeOccurrenceLifecycleDelta(
    terminateProgram,
    before,
    step.successor,
    {
      kind: "internal",
      operation: step.operation,
      owner: actualOwner.parent,
    },
    terminateStartStimulus().commandId,
    3,
  ), null);
});

test("Boundary Timer arming publishes only its host while Event-Based Gateway arming publishes both candidates", () => {
  const bounded = applyStimulusWithTrace(
    boundedTaskProgram,
    initialState,
    boundedTaskStart,
  );
  const boundedElements = bounded.flowNodeOccurrenceLifecycles
    .flatMap(({ started }) => started.map(({ elementId }) => elementId));
  assert.ok(boundedElements.includes("BoundedTask"));
  assert.ok(!boundedElements.includes("Deadline"));

  const raced = applyStimulusWithTrace(
    eventRaceProgram,
    initialState,
    eventRaceStart,
  );
  const racedElements = raced.flowNodeOccurrenceLifecycles
    .flatMap(({ started }) => started.map(({ elementId }) => elementId));
  assert.ok(racedElements.includes("Race"));
  assert.ok(racedElements.includes("MessageCatch"));
  assert.ok(racedElements.includes("TimerCatch"));
});

test("Boundary Timer firing starts the catch and cancels its host, while a race resolves winner and loser", () => {
  const armedBoundary = applyStimulusWithTrace(
    boundedTaskProgram,
    initialState,
    boundedTaskStart,
  );
  const fired = applyStimulusWithTrace(
    boundedTaskProgram,
    armedBoundary.result.state,
    {
      kind: StimulusKind.FireTimer,
      commandId: "fire-boundary",
      timerId: {
        processInstanceId: boundedTaskStart.instanceId,
        elementId: "Deadline",
        activation: 1,
      },
      logicalTimeMs: 1000,
    },
  );
  const boundaryDelta = lifecycleForExternal(fired);
  assert.deepEqual(boundaryDelta.started.map(({ elementId }) => elementId), [
    "Deadline",
  ]);
  assert.deepEqual(boundaryDelta.ended.filter(({ anchor }) =>
    anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait
  ), [{
      anchor: waitAnchor(boundedTaskStart.instanceId, "BoundedTask"),
      terminal: FlowNodeOccurrenceTerminalKind.Cancelled,
    }]);

  const armedRace = applyStimulusWithTrace(
    eventRaceProgram,
    initialState,
    eventRaceStart,
  );
  const won = applyStimulusWithTrace(
    eventRaceProgram,
    armedRace.result.state,
    messageDelivery(),
  );
  assert.deepEqual(lifecycleForExternal(won).ended, [
    {
      anchor: waitAnchor(eventRaceStart.instanceId, "MessageCatch"),
      terminal: FlowNodeOccurrenceTerminalKind.Completed,
    },
    {
      anchor: waitAnchor(eventRaceStart.instanceId, "TimerCatch"),
      terminal: FlowNodeOccurrenceTerminalKind.Cancelled,
    },
  ]);
});

test("Receive Task and Configured Task retain their BPMN identities through reused wait operations", () => {
  const receive = applyStimulusWithTrace(
    receiveTaskProgram,
    initialState,
    startFor(receiveTaskProgram, "receive-instance"),
  );
  const configured = applyStimulusWithTrace(
    configuredTaskProgram,
    initialState,
    startFor(configuredTaskProgram, "configured-instance"),
  );

  assert.ok(startedElementIds(receive).includes("ReceiveTask_Wait"));
  assert.ok(startedElementIds(configured).includes("ConfiguredTask_Probe"));
});

test("matching bpmnError cancels the Service Task and atomically executes its Boundary Error", () => {
  const started = applyStimulusWithTrace(
    boundaryErrorProgram,
    initialState,
    startFor(boundaryErrorProgram, "error-instance"),
  );
  const caught = applyStimulusWithTrace(
    boundaryErrorProgram,
    started.result.state,
    {
      kind: StimulusKind.CompleteEffect,
      commandId: "complete-with-error",
      effectId: {
        processInstanceId: "error-instance",
        elementId: "ServiceTask_Error",
        activation: 1,
      },
      result: {
        kind: EffectExecutionResultKind.BpmnError,
        code: "BusinessError",
        message: null,
        localPatch: [],
      },
    },
  );
  const external = lifecycleForExternal(caught);
  assert.deepEqual(external.ended.filter(({ anchor }) =>
    anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait
  ), [{
    anchor: waitAnchor("error-instance", "ServiceTask_Error"),
    terminal: FlowNodeOccurrenceTerminalKind.Cancelled,
  }]);
  assert.deepEqual(external.started.map(({ elementId }) => elementId), [
    "BoundaryEvent_Error",
  ]);
});

test("propagated Error executes Error End and Boundary Error while cancelling the exact child subtree", () => {
  const started = applyStimulusWithTrace(
    propagatedErrorProgram,
    initialState,
    terminateStartStimulus(),
  );
  const caught = applyStimulusWithTrace(
    propagatedErrorProgram,
    started.result.state,
    terminateCompletion("UserTask_Trigger"),
  );
  const errorDelta = lifecycleForOperation(
    caught,
    SemanticOperationKind.ThrowError,
  );
  assert.deepEqual(errorDelta.started.map(({ elementId }) => elementId), [
    "BoundaryEvent_Error",
    "EndEvent_Terminate",
  ]);
  assert.deepEqual(
    cancelledElementIds(errorDelta, started.result.state, propagatedErrorProgram),
    ["SubProcess_Work", "UserTask_Sibling"],
  );
});

test("Terminate End completes itself, cancels other live children, and lets the Sub-Process complete once", () => {
  const started = applyStimulusWithTrace(
    terminateProgram,
    initialState,
    terminateStartStimulus(),
  );
  assert.ok(startedElementIds(started).includes("SubProcess_Work"));
  assert.ok(startedElementIds(started).includes("UserTask_Sibling"));
  const terminated = applyStimulusWithTrace(
    terminateProgram,
    started.result.state,
    terminateCompletion("UserTask_Trigger"),
  );
  const terminateDelta = lifecycleForOperation(
    terminated,
    SemanticOperationKind.TerminateScope,
  );
  assert.deepEqual(terminateDelta.started.map(({ elementId }) => elementId), [
    "EndEvent_Terminate",
  ]);
  assert.deepEqual(
    cancelledElementIds(terminateDelta, started.result.state, terminateProgram),
    ["UserTask_Sibling"],
  );
  const completedScope = lifecycleForOperation(
    terminated,
    SemanticOperationKind.CompleteScope,
  );
  assert.equal(completedScope.ended[0]?.anchor.kind, SemanticFlowNodeOccurrenceAnchorKind.Scope);
});

test("incident report and retry preserve the Service Task occurrence while root cancellation ends it", () => {
  const start = startFor(incidentProgram, "incident-instance");
  const started = applyStimulusWithTrace(incidentProgram, initialState, start);
  const effectId = {
    processInstanceId: start.instanceId,
    elementId: "ServiceTask_Incident",
    activation: 1,
  } as const;
  const reported = applyStimulusWithTrace(
    incidentProgram,
    started.result.state,
    {
      kind: StimulusKind.ReportEffectFailure,
      commandId: "report-incident",
      effectId,
      generation: 1,
    },
  );
  assert.deepEqual(lifecycleForExternal(reported), { started: [], ended: [] });
  const retried = applyStimulusWithTrace(
    incidentProgram,
    reported.result.state,
    {
      kind: StimulusKind.RetryIncident,
      commandId: "retry-incident",
      incidentId: { effectId, generation: 1 },
    },
  );
  assert.deepEqual(lifecycleForExternal(retried), { started: [], ended: [] });

  const cancelled = applyStimulusWithTrace(
    incidentProgram,
    reported.result.state,
    {
      kind: StimulusKind.CancelIncidentProcess,
      commandId: "cancel-incident-root",
      processInstanceId: start.instanceId,
      incidentId: { effectId, generation: 1 },
    },
  );
  assert.deepEqual(lifecycleForExternal(cancelled).ended, [{
    anchor: waitAnchor(start.instanceId, "ServiceTask_Incident"),
    terminal: FlowNodeOccurrenceTerminalKind.Cancelled,
  }]);
});

test("fold rejects duplicate and retained transition anchors and orders numeric anchor scalars numerically", () => {
  const owner = {
    processInstanceId: "instance",
    definitionScopeId: "scope:process",
    activation: 1,
  } as const;
  const activation2 = openWait(owner, 2);
  const activation10 = openWait(owner, 10);
  const ordered = foldFlowNodeOccurrenceLifecycleDelta([], {
    started: [activation2, activation10],
    ended: [],
  });
  assert.deepEqual(
    ordered?.map(({ anchor }) => anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait ? anchor.id.activation : -1),
    [2, 10],
  );
  assert.equal(foldFlowNodeOccurrenceLifecycleDelta([], {
    started: [activation2, activation2],
    ended: [],
  }), null);
  assert.equal(foldFlowNodeOccurrenceLifecycleDelta([], {
    started: [{
      ...activation2,
      anchor: {
        kind: SemanticFlowNodeOccurrenceAnchorKind.Transition,
        commandId: "command",
        transitionIndex: 0,
        localIndex: 0,
      },
    }],
    ended: [],
  }), null);
});

test("independent open-set projection rejects malformed private IDs and incomplete associations", () => {
  const bounded = applyStimulusWithTrace(
    boundedTaskProgram,
    initialState,
    boundedTaskStart,
  ).result.state;
  const boundaryTimer = bounded.timerWaits[0];
  const task = bounded.userTaskWaits[0];
  assert.ok(boundaryTimer !== undefined);
  assert.ok(task !== undefined);
  assert.equal(projectOpenFlowNodeOccurrences(boundedTaskProgram, {
    ...bounded,
    timerWaits: [{
      ...boundaryTimer,
      id: { ...boundaryTimer.id, activation: 0 },
    }],
  }), null);
  assert.equal(projectOpenFlowNodeOccurrences(boundedTaskProgram, {
    ...bounded,
    userTaskWaits: [task, task],
  }), null);

  const effect = applyStimulusWithTrace(
    configuredTaskProgram,
    initialState,
    startFor(configuredTaskProgram, "effect-association-instance"),
  ).result.state;
  assert.equal(projectOpenFlowNodeOccurrences(configuredTaskProgram, {
    ...effect,
    variables: { ...effect.variables, activities: [] },
  }), null);
});

function lifecycleForExternal(
  traced: ReturnType<typeof applyStimulusWithTrace>,
) {
  const transition = traced.committedTransitions[0]?.transition;
  assert.equal(transition?.kind, SemanticTransitionKind.ExternalStimulus);
  const lifecycle = traced.flowNodeOccurrenceLifecycles[0];
  assert.ok(lifecycle !== undefined);
  return lifecycle;
}

function lifecycleForOperation(
  traced: ReturnType<typeof applyStimulusWithTrace>,
  operationKind: SemanticOperationKind,
) {
  const index = traced.committedTransitions.findIndex(({ transition }) =>
    transition.kind === SemanticTransitionKind.InternalOperation &&
    transition.operationKind === operationKind
  );
  assert.notEqual(index, -1);
  const lifecycle = traced.flowNodeOccurrenceLifecycles[index];
  assert.ok(lifecycle !== undefined);
  return lifecycle;
}

function startedElementIds(
  traced: ReturnType<typeof applyStimulusWithTrace>,
): string[] {
  return traced.flowNodeOccurrenceLifecycles.flatMap(({ started }) =>
    started.map(({ elementId }) => elementId)
  );
}

function cancelledElementIds(
  delta: ReturnType<typeof lifecycleForOperation>,
  state: ReturnType<typeof applyStimulusWithTrace>["result"]["state"],
  program: SemanticProcessProgram,
): string[] {
  const open = projectOpenFlowNodeOccurrences(program, state);
  assert.ok(open !== null);
  return delta.ended
    .filter(({ terminal }) => terminal === FlowNodeOccurrenceTerminalKind.Cancelled)
    .map(({ anchor }) =>
      open.find((candidate) =>
        JSON.stringify(candidate.anchor) === JSON.stringify(anchor)
      )?.elementId
    )
    .filter((elementId): elementId is string => elementId !== undefined)
    .sort();
}

function waitAnchor(processInstanceId: string, elementId: string) {
  return {
    kind: SemanticFlowNodeOccurrenceAnchorKind.Wait,
    id: { processInstanceId, elementId, activation: 1 },
  } as const;
}
