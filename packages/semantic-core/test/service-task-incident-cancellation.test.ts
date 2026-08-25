import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ControlStateKind,
  EffectOperation,
  EffectProtocol,
  MessageChannelKind,
  ProcessStatus,
  ScenarioOutcomeKind,
  ScenarioStepKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  applyStimulus,
  effectIncidentAssociationsAreValid,
  enabledInternalOperationCount,
  initialState,
  isStableStateResumable,
  isWellFormedSemanticProcessProgram,
  isWellFormedStimulus,
  profileAllowsProgramShape,
  programAllowsEffectIncidents,
  sameStimulus,
} from "@bpmn-lean/semantic-core";
import type {
  CancelIncidentProcessStimulus,
  EffectIncidentId,
  ReportEffectFailureStimulus,
  RetryIncidentStimulus,
  RuntimeState,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import {
  rootScopeOccurrence,
  rootScopedProgram,
} from "./root-scope-fixture.ts";

const processId = "Process_ServiceTaskEffect";
const processInstanceId = "IncidentCancellationInstance_1";
const effectId = Object.freeze({
  processInstanceId,
  elementId: "ServiceTask_Record",
  activation: 1,
});
const incidentId = Object.freeze({
  effectId,
  generation: 1,
} as const) satisfies EffectIncidentId;

const program = incidentProgram(
  SemanticProfileId.ServiceTaskIncidentCancellation,
);
const oldProgram = incidentProgram(SemanticProfileId.ServiceTaskIncident);

const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-incident-cancellation-process",
  processId,
  instanceId: processInstanceId,
  initialVariables: [{
    name: "preserved",
    value: {
      kind: VariableValueKind.String,
      value: "before-cancel",
    },
  }],
} as const) satisfies StartProcessStimulus;

const report = Object.freeze({
  kind: StimulusKind.ReportEffectFailure,
  commandId: "report-effect-failure-before-cancel",
  effectId,
  generation: 1,
} as const) satisfies ReportEffectFailureStimulus;

const retry = Object.freeze({
  kind: StimulusKind.RetryIncident,
  commandId: "retry-effect-incident-before-cancel",
  incidentId,
} as const) satisfies RetryIncidentStimulus;

const cancel = Object.freeze({
  kind: StimulusKind.CancelIncidentProcess,
  commandId: "cancel-incident-process",
  processInstanceId,
  incidentId,
} as const) satisfies CancelIncidentProcessStimulus;

test("admits only the strict successor cancellation command and program", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(
    profileAllowsProgramShape(
      SemanticProfileId.ServiceTaskIncidentCancellation,
      program.operations,
      program.definitionScopes.length,
    ),
    true,
  );
  assert.equal(programAllowsEffectIncidents(program), true);
  assert.equal(isWellFormedStimulus(cancel), true);
  assert.equal(sameStimulus(cancel, { ...cancel }), true);
  assert.equal(
    isWellFormedStimulus({ ...cancel, processInstanceId: "mismatched-root" }),
    true,
  );
  assert.equal(
    sameStimulus(cancel, { ...cancel, processInstanceId: "other-root" }),
    false,
  );
  assert.equal(
    sameStimulus(cancel, {
      ...cancel,
      incidentId: {
        ...incidentId,
        effectId: { ...effectId, activation: 2 },
      },
    }),
    false,
  );

  for (const extra of [
    { scopeId: "scope:caller-selected" },
    { owner: "caller-selected" },
    { reason: "caller-selected" },
    { force: true },
  ]) {
    assert.equal(isWellFormedStimulus({ ...cancel, ...extra }), false);
  }
});

test("cancels the unique incident-bearing root and every transitive live owner", () => {
  const incident = incidentState(program);
  const rich = richIncidentState(incident);
  assert.equal(effectIncidentAssociationsAreValid(rich), true);

  const cancelled = applyStimulus(program, rich, cancel, 0);
  assert.equal(cancelled.outcome, CommandOutcome.Committed);
  assert.equal(cancelled.internalStepBoundExceeded, false);
  assert.deepEqual(cancelled.state.control, {
    kind: ControlStateKind.Cancelled,
    instanceId: processInstanceId,
  });
  assert.equal(cancelled.state.initiationPending, false);
  assert.deepEqual(cancelled.state.scopeOccurrences, []);
  assert.deepEqual(cancelled.state.controlTokens, []);
  assert.deepEqual(cancelled.state.userTaskWaits, []);
  assert.deepEqual(cancelled.state.messageWaits, []);
  assert.deepEqual(cancelled.state.timerWaits, []);
  assert.deepEqual(cancelled.state.effectWaits, []);
  assert.deepEqual(cancelled.state.effectIncidents, []);
  assert.deepEqual(cancelled.state.selectedBranchSets, []);
  assert.deepEqual(cancelled.state.eventRaces, []);
  assert.deepEqual(cancelled.state.calledProcessOccurrences, []);
  assert.deepEqual(cancelled.state.variables.process, rich.variables.process);
  assert.deepEqual(cancelled.state.variables.activities, []);
  assert.deepEqual(cancelled.state.taskActivations, rich.taskActivations);
  assert.deepEqual(cancelled.state.messageActivations, rich.messageActivations);
  assert.deepEqual(cancelled.state.timerActivations, rich.timerActivations);
  assert.deepEqual(
    cancelled.state.eventRaceActivations,
    rich.eventRaceActivations,
  );
  assert.deepEqual(cancelled.state.callActivations, rich.callActivations);
  assert.deepEqual(cancelled.state.effectActivations, rich.effectActivations);
  assert.deepEqual(cancelled.state.scopeActivations, rich.scopeActivations);
  assert.equal(cancelled.state.endOccurrences, rich.endOccurrences);
  assert.equal(cancelled.state.logicalTimeMs, rich.logicalTimeMs);
  assert.equal(enabledInternalOperationCount(program, cancelled.state), 0);
  assert.equal(isStableStateResumable(cancelled.state), true);
});

test("publishes Retry before exact-root Cancel and projects typed cancellation", () => {
  const incident = incidentState(program);
  const refused = advanceScenario(program, incident, {
    ...cancel,
    commandId: "wrong-root-for-projection",
    processInstanceId: "wrong-root",
  });
  assert.equal(refused.kind, ScenarioStepKind.Terminal);
  assert.equal(refused.outcome.kind, ScenarioOutcomeKind.Semantic);
  assert.equal(refused.outcome.outcome, CommandOutcome.Rejected);
  const waiting = stateObservation(refused.observations[1]);
  assert.deepEqual(waiting.enabledInteractions, [
    { kind: StimulusKind.RetryIncident, incidentId },
    {
      kind: StimulusKind.CancelIncidentProcess,
      processInstanceId,
      incidentId,
    },
  ]);

  const committed = advanceScenario(program, incident, cancel);
  assert.equal(committed.kind, ScenarioStepKind.Committed);
  const observation = stateObservation(committed.observations[1]);
  assert.equal(observation.status, ProcessStatus.Cancelled);
  assert.deepEqual(observation.activeWaits, []);
  assert.deepEqual(observation.openIncidents, []);
  assert.deepEqual(observation.enabledInteractions, []);
  assert.deepEqual(observation.variables, start.initialVariables);
});

test("refuses ambiguous roots, mismatched callers, outside incidents, and pending initiation", () => {
  const incident = incidentState(program);
  const root = incident.scopeOccurrences[0]!;
  const calledRoot = calledRootOccurrence("Call_Orphan", 1);
  const malformedStates: ReadonlyArray<RuntimeState> = [
    {
      ...incident,
      scopeOccurrences: [
        ...incident.scopeOccurrences,
        {
          id: { ...root.id, definitionScopeId: "scope:second-root" },
          parent: null,
        },
      ],
    },
    {
      ...incident,
      scopeOccurrences: [...incident.scopeOccurrences, calledRoot],
      calledProcessOccurrences: [{
        id: {
          processInstanceId,
          elementId: "Call_Orphan",
          activation: 1,
        },
        caller: {
          ...root.id,
          definitionScopeId: "scope:not-the-hosting-root",
        },
        calledProcessId: "Process_Orphan",
        calledRoot: calledRoot.id,
        returnOperationId: "operation:return-orphan",
      }],
    },
    {
      ...incident,
      scopeOccurrences: [
        ...incident.scopeOccurrences,
        {
          id: {
            processInstanceId,
            definitionScopeId: "scope:outside-root",
            activation: 1,
          },
          parent: {
            processInstanceId,
            definitionScopeId: "scope:missing-parent",
            activation: 1,
          },
        },
      ],
      effectIncidents: [{
        ...incident.effectIncidents[0]!,
        wait: {
          ...incident.effectIncidents[0]!.wait,
          owner: {
            processInstanceId,
            definitionScopeId: "scope:outside-root",
            activation: 1,
          },
        },
      }],
    },
    {
      ...incident,
      effectIncidents: [
        incident.effectIncidents[0]!,
        incident.effectIncidents[0]!,
      ],
    },
    {
      ...incident,
      scopeOccurrences: [
        ...incident.scopeOccurrences,
        {
          id: {
            processInstanceId: "orphan-process",
            definitionScopeId: "scope:orphan-root",
            activation: 1,
          },
          parent: null,
        },
      ],
      userTaskWaits: [{
        id: {
          processInstanceId: "orphan-process",
          elementId: "OrphanTask",
          activation: 1,
        },
        owner: {
          processInstanceId: "orphan-process",
          definitionScopeId: "scope:orphan-root",
          activation: 1,
        },
        name: "Orphan task",
        output: "place:orphan-output",
      }],
    },
    { ...incident, initiationPending: true },
  ];

  for (const malformed of malformedStates) {
    const refused = applyStimulus(program, malformed, cancel);
    assert.equal(refused.outcome, CommandOutcome.Rejected);
    assert.strictEqual(refused.state, malformed);
  }
});

test("refuses wrong, stale, terminal, duplicate, and old-profile commands by state identity", () => {
  const incident = incidentState(program);
  const cases: ReadonlyArray<CancelIncidentProcessStimulus> = [
    { ...cancel, commandId: "wrong-root", processInstanceId: "wrong-root" },
    {
      ...cancel,
      commandId: "wrong-effect-root",
      incidentId: {
        ...incidentId,
        effectId: { ...effectId, processInstanceId: "wrong-root" },
      },
    },
    {
      ...cancel,
      commandId: "stale-incident",
      incidentId: {
        ...incidentId,
        effectId: { ...effectId, activation: 2 },
      },
    },
  ];
  for (const candidate of cases) {
    const refused = applyStimulus(program, incident, candidate);
    assert.equal(refused.outcome, CommandOutcome.Rejected);
    assert.strictEqual(refused.state, incident);
  }

  const oldIncident = incidentState(oldProgram, {
    ...start,
    initialVariables: [],
  });
  const refusedOld = applyStimulus(oldProgram, oldIncident, cancel);
  assert.equal(refusedOld.outcome, CommandOutcome.Rejected);
  assert.strictEqual(refusedOld.state, oldIncident);

  const completedState: RuntimeState = {
    ...incident,
    control: { kind: ControlStateKind.Completed, instanceId: processInstanceId },
  };
  const refusedCompleted = applyStimulus(program, completedState, cancel);
  assert.equal(refusedCompleted.outcome, CommandOutcome.Rejected);
  assert.strictEqual(refusedCompleted.state, completedState);

  const cancelled = applyStimulus(program, incident, cancel).state;
  const duplicate = applyStimulus(program, cancelled, {
    ...cancel,
    commandId: "duplicate-cancel",
  });
  assert.equal(duplicate.outcome, CommandOutcome.Rejected);
  assert.strictEqual(duplicate.state, cancelled);
});

test("uses explicit queue order without claiming retry and cancellation confluence", () => {
  const incident = incidentState(program);

  const cancelFirst = applyStimulus(program, incident, cancel);
  assert.equal(cancelFirst.outcome, CommandOutcome.Committed);
  const retryAfterCancel = applyStimulus(program, cancelFirst.state, retry);
  assert.equal(retryAfterCancel.outcome, CommandOutcome.Rejected);
  assert.strictEqual(retryAfterCancel.state, cancelFirst.state);

  const retryFirst = applyStimulus(program, incident, retry);
  assert.equal(retryFirst.outcome, CommandOutcome.Committed);
  assert.deepEqual(retryFirst.state.effectIncidents, []);
  assert.equal(retryFirst.state.effectWaits[0]?.incidentAlreadyRetried, true);
  const cancelAfterRetry = applyStimulus(program, retryFirst.state, cancel);
  assert.equal(cancelAfterRetry.outcome, CommandOutcome.Rejected);
  assert.strictEqual(cancelAfterRetry.state, retryFirst.state);
  assert.deepEqual(cancelAfterRetry.state.effectWaits, retryFirst.state.effectWaits);
});

function incidentProgram(semanticProfile: string): SemanticProcessProgram {
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile,
      sourceId: "service-task-effect-process",
      sourceOverlay: null,
      sourceSha256: "0".repeat(64),
    },
    processId,
    controlPlaces: [
      controlPlace("Flow_ServiceToEnd"),
      controlPlace("Flow_StartToService"),
    ],
    operations: [
      {
        ...operationBase("EndEvent_1"),
        kind: SemanticOperationKind.ReachNoneEnd,
        input: "place:Flow_ServiceToEnd",
      },
      {
        ...operationBase("ServiceTask_Record"),
        kind: SemanticOperationKind.AwaitEffect,
        input: "place:Flow_StartToService",
        output: "place:Flow_ServiceToEnd",
        effect: {
          elementId: "ServiceTask_Record",
          descriptor: {
            protocol: EffectProtocol.Activity,
            operation: EffectOperation.Probe,
          },
          inputMappings: [],
          outputMappings: [],
        },
        bpmnErrorRoute: null,
      },
      {
        ...operationBase("StartEvent_1"),
        kind: SemanticOperationKind.Initiate,
        output: "place:Flow_StartToService",
      },
    ],
  });
}

function incidentState(
  candidate: SemanticProcessProgram,
  candidateStart: StartProcessStimulus = start,
): RuntimeState {
  const started = applyStimulus(candidate, initialState, candidateStart);
  assert.equal(started.outcome, CommandOutcome.Committed);
  const reported = applyStimulus(candidate, started.state, report);
  assert.equal(reported.outcome, CommandOutcome.Committed);
  return reported.state;
}

function richIncidentState(incident: RuntimeState): RuntimeState {
  const root = incident.scopeOccurrences[0]!;
  const firstCalledRoot = calledRootOccurrence("Call_First", 1);
  const secondCalledRoot = calledRootOccurrence(
    "Call_Second",
    1,
    firstCalledRoot.id.processInstanceId,
  );
  const rootEffectId = {
    processInstanceId,
    elementId: "Root_OpenEffect",
    activation: 1,
  };
  const calledEffectId = {
    processInstanceId: secondCalledRoot.id.processInstanceId,
    elementId: "Called_OpenEffect",
    activation: 1,
  };
  return {
    ...incident,
    scopeOccurrences: [
      ...incident.scopeOccurrences,
      firstCalledRoot,
      secondCalledRoot,
    ],
    controlTokens: [{
      placeId: "place:root-live",
      owner: root.id,
      multiplicity: 1,
    }],
    userTaskWaits: [{
      id: {
        processInstanceId,
        elementId: "Root_UserTask",
        activation: 1,
      },
      owner: root.id,
      name: "Root task",
      output: "place:root-task-output",
    }],
    messageWaits: [{
      id: {
        processInstanceId,
        elementId: "Root_Message",
        activation: 1,
      },
      owner: root.id,
      channel: {
        kind: MessageChannelKind.OperationMessage,
        interfaceId: "Interface_Root",
        interfaceOperationId: "Operation_Root",
        messageId: "Message_Root",
      },
      output: "place:root-message-output",
    }],
    timerWaits: [{
      id: {
        processInstanceId: firstCalledRoot.id.processInstanceId,
        elementId: "Called_Timer",
        activation: 1,
      },
      owner: firstCalledRoot.id,
      deadlineMs: 42,
      output: "place:called-timer-output",
    }],
    effectWaits: [{
      id: rootEffectId,
      owner: root.id,
      descriptor: { protocol: "synthetic", operation: "root" },
      arguments: [],
      outputMappings: [],
      bpmnErrorRoute: null,
      output: "place:root-effect-output",
      incidentAlreadyRetried: false,
    }, {
      id: calledEffectId,
      owner: secondCalledRoot.id,
      descriptor: { protocol: "synthetic", operation: "called" },
      arguments: [],
      outputMappings: [],
      bpmnErrorRoute: null,
      output: "place:called-effect-output",
      incidentAlreadyRetried: false,
    }],
    selectedBranchSets: [{
      owner: root.id,
      selectionKey: "root-selection",
      expectedInputs: ["place:root-selected"],
    }],
    eventRaces: [{
      id: {
        processInstanceId,
        elementId: "Root_Race",
        activation: 1,
      },
      owner: root.id,
      messageSubscriptionId: {
        processInstanceId,
        elementId: "Root_Message",
        activation: 1,
      },
      timerOccurrenceId: {
        processInstanceId,
        elementId: "Root_Timer",
        activation: 1,
      },
    }],
    calledProcessOccurrences: [{
      id: {
        processInstanceId,
        elementId: "Call_First",
        activation: 1,
      },
      caller: root.id,
      calledProcessId: "Process_First",
      calledRoot: firstCalledRoot.id,
      returnOperationId: "operation:return-first",
    }, {
      id: {
        processInstanceId: firstCalledRoot.id.processInstanceId,
        elementId: "Call_Second",
        activation: 1,
      },
      caller: firstCalledRoot.id,
      calledProcessId: "Process_Second",
      calledRoot: secondCalledRoot.id,
      returnOperationId: "operation:return-second",
    }],
    variables: {
      process: incident.variables.process,
      activities: [
        { owner: rootEffectId, bindings: [] },
        ...incident.variables.activities,
        { owner: calledEffectId, bindings: [] },
      ],
    },
    taskActivations: [{ elementId: "Root_UserTask", count: 9 }],
    messageActivations: [{ elementId: "message", count: 8 }],
    timerActivations: [{ elementId: "Called_Timer", count: 7 }],
    eventRaceActivations: [{ elementId: "race", count: 6 }],
    callActivations: [{ elementId: "call", count: 5 }],
    effectActivations: [{ elementId: "effect", count: 4 }],
    scopeActivations: [{ elementId: "scope", count: 3 }],
    endOccurrences: 2,
    logicalTimeMs: 42,
  };
}

function calledRootOccurrence(
  callElementId: string,
  activation: number,
  callerInstanceId: string = processInstanceId,
) {
  const instanceId = `call:${new TextEncoder().encode(callerInstanceId).length}:${callerInstanceId}:${new TextEncoder().encode(callElementId).length}:${callElementId}:${activation}`;
  return {
    id: {
      processInstanceId: instanceId,
      definitionScopeId: `scope:${callElementId}`,
      activation: 1,
    },
    parent: null,
  } as const;
}

function stateObservation(value: unknown): StateObservation {
  assert.ok(
    typeof value === "object" &&
      value !== null &&
      "kind" in value &&
      value.kind === CanonicalObservationKind.State,
  );
  return value as StateObservation;
}
