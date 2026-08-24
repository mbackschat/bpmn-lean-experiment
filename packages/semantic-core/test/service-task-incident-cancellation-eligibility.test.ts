import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  EffectOperation,
  EffectProtocol,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  StimulusKind,
  advanceScenario,
  applyStimulus,
  deriveCalledProcessInstanceId,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  CancelIncidentProcessStimulus,
  ReportEffectFailureStimulus,
  RuntimeState,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";

const processId = "Process_ServiceTaskEffect";
const processInstanceId = "IncidentCancellationEligibility_1";
const effectId = Object.freeze({
  processInstanceId,
  elementId: "ServiceTask_Record",
  activation: 1,
});
const incidentId = Object.freeze({ effectId, generation: 1 } as const);
const program = incidentProgram();
const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-incident-cancellation-eligibility",
  processId,
  instanceId: processInstanceId,
  initialVariables: [],
} as const) satisfies StartProcessStimulus;
const report = Object.freeze({
  kind: StimulusKind.ReportEffectFailure,
  commandId: "report-effect-failure-for-cancellation-eligibility",
  effectId,
  generation: 1,
} as const) satisfies ReportEffectFailureStimulus;
const cancel = Object.freeze({
  kind: StimulusKind.CancelIncidentProcess,
  commandId: "cancel-incident-process-when-eligible",
  processInstanceId,
  incidentId,
} as const) satisfies CancelIncidentProcessStimulus;

test("does not publish cancellation for an orphan live scope outside the root", () => {
  const incident = incidentState();
  const orphanOwner = {
    processInstanceId,
    definitionScopeId: "scope:orphan-with-missing-parent",
    activation: 1,
  } as const;
  const missingParent = {
    processInstanceId,
    definitionScopeId: "scope:missing-parent",
    activation: 1,
  } as const;
  const orphan: RuntimeState = {
    ...incident,
    scopeOccurrences: [
      ...incident.scopeOccurrences,
      { id: orphanOwner, parent: missingParent },
    ],
    userTaskWaits: [{
      id: {
        processInstanceId,
        elementId: "Orphan_UserTask",
        activation: 1,
      },
      owner: orphanOwner,
      name: "Orphan task",
      output: "place:orphan-output",
    }],
  };

  assertIneligibleCancellationState(orphan);
});

test("does not publish cancellation with a residual Activity-local owner", () => {
  const incident = incidentState();
  const residual: RuntimeState = {
    ...incident,
    variables: {
      ...incident.variables,
      activities: [
        ...incident.variables.activities,
        {
          owner: {
            processInstanceId,
            elementId: "Residual_Activity",
            activation: 1,
          },
          bindings: [],
        },
      ],
    },
  };

  assertIneligibleCancellationState(residual);
});

test("keeps malformed called associations and ambiguous roots non-publishable", () => {
  const incident = incidentState();
  const root = incident.scopeOccurrences[0]!;
  const calledRootId = {
    processInstanceId: deriveCalledProcessInstanceId(
      processInstanceId,
      "Call_One",
      1,
    ),
    definitionScopeId: "scope:called-one",
    activation: 1,
  } as const;
  const calledRecord = {
    id: {
      processInstanceId,
      elementId: "Call_One",
      activation: 1,
    },
    caller: root.id,
    calledProcessId: "Process_CalledOne",
    calledRoot: calledRootId,
    returnOperationId: "operation:return-called-one",
  } as const;
  const invalidStates: ReadonlyArray<RuntimeState> = [
    {
      ...incident,
      scopeOccurrences: [
        ...incident.scopeOccurrences,
        { id: calledRootId, parent: null },
      ],
      calledProcessOccurrences: [calledRecord, calledRecord],
    },
    {
      ...incident,
      calledProcessOccurrences: [calledRecord],
    },
    {
      ...incident,
      scopeOccurrences: [
        ...incident.scopeOccurrences,
        {
          id: { ...root.id, definitionScopeId: "scope:ambiguous-root" },
          parent: null,
        },
      ],
    },
  ];

  for (const invalid of invalidStates) {
    const refused = applyStimulus(program, invalid, cancel);
    assert.equal(refused.outcome, CommandOutcome.Rejected);
    assert.strictEqual(refused.state, invalid);
    assertCancellationNotPublished(enabledInteractionsAfterRefusal(invalid));
  }
});

test("publishes Retry then Cancel for an eligible transitive called tree", () => {
  const incident = incidentState();
  const root = incident.scopeOccurrences[0]!;
  const firstRootId = calledRootId(processInstanceId, "Call_First");
  const secondRootId = calledRootId(
    firstRootId.processInstanceId,
    "Call_Second",
  );
  const eligible: RuntimeState = {
    ...incident,
    scopeOccurrences: [
      ...incident.scopeOccurrences,
      { id: firstRootId, parent: null },
      { id: secondRootId, parent: null },
    ],
    timerWaits: [{
      id: {
        processInstanceId: secondRootId.processInstanceId,
        elementId: "Called_Timer",
        activation: 1,
      },
      owner: secondRootId,
      deadlineMs: 42,
      output: "place:called-timer-output",
    }],
    timerActivations: [{ elementId: "Called_Timer", count: 1 }],
    calledProcessOccurrences: [{
      id: {
        processInstanceId,
        elementId: "Call_First",
        activation: 1,
      },
      caller: root.id,
      calledProcessId: "Process_First",
      calledRoot: firstRootId,
      returnOperationId: "operation:return-first",
    }, {
      id: {
        processInstanceId: firstRootId.processInstanceId,
        elementId: "Call_Second",
        activation: 1,
      },
      caller: firstRootId,
      calledProcessId: "Process_Second",
      calledRoot: secondRootId,
      returnOperationId: "operation:return-second",
    }],
  };

  assert.deepEqual(enabledInteractionsAfterRefusal(eligible), [
    { kind: StimulusKind.RetryIncident, incidentId },
    {
      kind: StimulusKind.CancelIncidentProcess,
      processInstanceId,
      incidentId,
    },
  ]);
  const committed = applyStimulus(program, eligible, cancel);
  assert.equal(committed.outcome, CommandOutcome.Committed);
  assert.deepEqual(committed.state.scopeOccurrences, []);
  assert.deepEqual(committed.state.timerWaits, []);
  assert.deepEqual(committed.state.calledProcessOccurrences, []);
});

function enabledInteractionsAfterRefusal(
  state: RuntimeState,
): StateObservation["enabledInteractions"] {
  const step = advanceScenario(program, state, {
    ...cancel,
    commandId: "wrong-root-for-eligibility-projection",
    processInstanceId: "wrong-root",
  });
  const observation = step.observations[1];
  assert.ok(
    typeof observation === "object" &&
      observation !== null &&
      "kind" in observation &&
      observation.kind === CanonicalObservationKind.State,
  );
  return observation.enabledInteractions;
}

function assertCancellationNotPublished(
  interactions: StateObservation["enabledInteractions"],
): void {
  assert.ok(interactions.some(({ kind }) => kind === StimulusKind.RetryIncident));
  assert.equal(
    interactions.some(({ kind }) => kind === StimulusKind.CancelIncidentProcess),
    false,
  );
}

function assertIneligibleCancellationState(state: RuntimeState): void {
  const refused = applyStimulus(program, state, cancel);
  assert.equal(refused.outcome, CommandOutcome.Rejected);
  assert.strictEqual(refused.state, state);
  assertCancellationNotPublished(enabledInteractionsAfterRefusal(state));
}

function incidentState(): RuntimeState {
  const started = applyStimulus(program, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  const reported = applyStimulus(program, started.state, report);
  assert.equal(reported.outcome, CommandOutcome.Committed);
  return reported.state;
}

function calledRootId(callerInstanceId: string, elementId: string) {
  return {
    processInstanceId: deriveCalledProcessInstanceId(
      callerInstanceId,
      elementId,
      1,
    ),
    definitionScopeId: `scope:${elementId}`,
    activation: 1,
  } as const;
}

function incidentProgram(): SemanticProcessProgram {
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: SemanticProfileId.ServiceTaskIncidentCancellation,
      sourceId: "service-task-effect-process",
      sourceOverlay: null,
      sourceSha256: "0".repeat(64),
    },
    processId,
    controlPlaces: [
      controlPlace("Flow_ServiceToEnd"),
      controlPlace("Flow_StartToService"),
    ],
    operations: [{
      ...operationBase("EndEvent_1"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_ServiceToEnd",
    }, {
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
    }, {
      ...operationBase("StartEvent_1"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToService",
    }],
  });
}
