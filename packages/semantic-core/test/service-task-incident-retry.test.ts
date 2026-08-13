import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ControlStateKind,
  EffectExecutionResultKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
  SemanticProfileId,
  StimulusKind,
  WaitKind,
  advanceScenario,
  applyStimulus,
  effectIncidentAssociationsAreValid,
  initialState,
  isStableStateResumable,
  isWellFormedSemanticProcessProgram,
  isWellFormedStimulus,
  openEffectIncidentAssociationIsValid,
  profileAllowsProgramShape,
  projectOpenEffects,
  projectOpenIncidents,
  sameStimulus,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  EffectIncidentId,
  ReportEffectFailureStimulus,
  RetryIncidentStimulus,
  RuntimeState,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import { callActivityProgram } from "./call-activity-fixture.ts";
import { stateObservationAt } from "./canonical-observations.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";
import { terminateProgram } from "./terminate-end-event-fixture.ts";

const descriptor = Object.freeze({
  protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
  operation: "urn:bpmn-lean:effect-operation:probe-v1",
});

const program = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
    sourceId: "service-task-effect-process",
    sourceOverlay: null,
    sourceSha256: "0".repeat(64),
  },
  processId: "Process_ServiceTaskEffect",
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
        descriptor,
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

const effectId = Object.freeze({
  processInstanceId: "IncidentInstance_1",
  elementId: "ServiceTask_Record",
  activation: 1,
});

const incidentId = Object.freeze({
  effectId,
  generation: 1,
} as const) satisfies EffectIncidentId;

const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-incident-process",
  processId: program.processId,
  instanceId: effectId.processInstanceId,
  initialVariables: [],
} as const) satisfies StartProcessStimulus;

const report = Object.freeze({
  kind: StimulusKind.ReportEffectFailure,
  commandId: "report-effect-failure",
  effectId,
  generation: 1,
} as const) satisfies ReportEffectFailureStimulus;

const retry = Object.freeze({
  kind: StimulusKind.RetryIncident,
  commandId: "retry-effect-incident",
  incidentId,
} as const) satisfies RetryIncidentStimulus;

const success = Object.freeze({
  kind: StimulusKind.CompleteEffect,
  commandId: "complete-retried-effect",
  effectId,
  result: {
    kind: EffectExecutionResultKind.Success,
    localPatch: [],
  },
} as const);

function startedState(): RuntimeState {
  const started = applyStimulus(program, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

function incidentState(): RuntimeState {
  const reported = applyStimulus(program, startedState(), report);
  assert.equal(reported.outcome, CommandOutcome.Committed);
  return reported.state;
}

test("registers only literal generation 1 on the exact successor Service Task shape", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(supportsSemanticProcessExecution(start, program), true);
  assert.equal(profileAllowsProgramShape(
    SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
    program.operations,
    program.definitionScopes.length,
  ), true);
  assert.equal(isWellFormedStimulus(report), true);
  assert.equal(isWellFormedStimulus(retry), true);
  assert.equal(isWellFormedStimulus({ ...report, generation: 2 }), false);
  assert.equal(isWellFormedStimulus({
    ...retry,
    incidentId: { ...retry.incidentId, generation: 2 },
  }), false);
  assert.equal(sameStimulus(report, { ...report }), true);
  assert.equal(sameStimulus(retry, { ...retry }), true);
});

test("report atomically moves the complete wait into one stable public incident", () => {
  const waiting = startedState();
  const originalWait = waiting.effectWaits[0];
  assert.ok(originalWait !== undefined);
  assert.equal(originalWait.incidentAlreadyRetried, false);

  const reported = applyStimulus(program, waiting, report);
  assert.equal(reported.outcome, CommandOutcome.Committed);
  assert.equal(reported.internalStepBoundExceeded, false);
  assert.deepEqual(reported.state.control, {
    kind: ControlStateKind.Running,
    instanceId: effectId.processInstanceId,
  });
  assert.deepEqual(reported.state.effectWaits, []);
  assert.deepEqual(reported.state.effectIncidents, [{
    id: incidentId,
    wait: originalWait,
  }]);
  assert.equal(effectIncidentAssociationsAreValid(reported.state), true);
  assert.equal(isStableStateResumable(reported.state), true);
  assert.deepEqual(projectOpenEffects(reported.state), []);
  assert.deepEqual(projectOpenIncidents(reported.state), [{
    kind: "effectExecutionFailed",
    id: incidentId,
    effect: { id: effectId, descriptor, arguments: [] },
  }]);
  assert.equal(
    openEffectIncidentAssociationIsValid(projectOpenIncidents(reported.state)[0]!),
    true,
  );
  assert.equal(
    openEffectIncidentAssociationIsValid({
      ...projectOpenIncidents(reported.state)[0]!,
      id: {
        ...incidentId,
        effectId: { ...effectId, activation: 2 },
      },
    }),
    false,
  );

  const refused = advanceScenario(program, reported.state, {
    ...retry,
    commandId: "wrong-incident",
    incidentId: {
      ...incidentId,
      effectId: { ...effectId, activation: 2 },
    },
  });
  const observation = stateObservationAt(refused.observations, 1);
  assert.equal(observation.kind, CanonicalObservationKind.State);
  assert.deepEqual(observation.activeWaits, [{
    elementId: effectId.elementId,
    kind: WaitKind.Incident,
    multiplicity: 1,
  }]);
  assert.deepEqual(observation.openIncidents, projectOpenIncidents(reported.state));
  assert.deepEqual(observation.enabledInteractions, [{
    kind: StimulusKind.RetryIncident,
    incidentId,
  }]);
});

test("retry restores the exact effect occurrence once without changing other state", () => {
  const waiting = startedState();
  const reported = applyStimulus(program, waiting, report).state;
  const retried = applyStimulus(program, reported, retry);

  assert.equal(retried.outcome, CommandOutcome.Committed);
  assert.deepEqual(retried.state, {
    ...reported,
    effectWaits: [{
      ...waiting.effectWaits[0]!,
      incidentAlreadyRetried: true,
    }],
    effectIncidents: [],
  });
  assert.deepEqual(retried.state.controlTokens, waiting.controlTokens);
  assert.deepEqual(retried.state.variables, waiting.variables);
  assert.deepEqual(retried.state.effectActivations, waiting.effectActivations);
  assert.equal(retried.state.logicalTimeMs, waiting.logicalTimeMs);

  const secondReport = applyStimulus(program, retried.state, {
    ...report,
    commandId: "reject-second-report",
  });
  assert.equal(secondReport.outcome, CommandOutcome.Rejected);
  assert.strictEqual(secondReport.state, retried.state);

  const completed = applyStimulus(program, retried.state, success);
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.equal(completed.state.control.kind, ControlStateKind.Completed);
  assert.deepEqual(completed.state.effectIncidents, []);
});

test("wrong, duplicate, stale, and mismatched incident commands preserve exact state", () => {
  const waiting = startedState();
  const wrongReport = applyStimulus(program, waiting, {
    ...report,
    commandId: "wrong-report-occurrence",
    effectId: { ...effectId, elementId: "OtherEffect" },
  });
  assert.equal(wrongReport.outcome, CommandOutcome.Rejected);
  assert.strictEqual(wrongReport.state, waiting);

  const earlyRetry = applyStimulus(program, waiting, retry);
  assert.equal(earlyRetry.outcome, CommandOutcome.Rejected);
  assert.strictEqual(earlyRetry.state, waiting);

  const incident = incidentState();
  const duplicateReport = applyStimulus(program, incident, {
    ...report,
    commandId: "duplicate-report",
  });
  assert.equal(duplicateReport.outcome, CommandOutcome.Rejected);
  assert.strictEqual(duplicateReport.state, incident);

  const retried = applyStimulus(program, incident, retry).state;
  const staleRetry = applyStimulus(program, retried, {
    ...retry,
    commandId: "stale-retry",
  });
  assert.equal(staleRetry.outcome, CommandOutcome.Rejected);
  assert.strictEqual(staleRetry.state, retried);

  const storedIncident = incident.effectIncidents[0]!;
  const activity = incident.variables.activities[0]!;
  const scope = incident.scopeOccurrences[0]!;
  const malformedStates: ReadonlyArray<RuntimeState> = [
    {
      ...incident,
      effectIncidents: [{
        ...storedIncident,
        id: {
          ...incidentId,
          effectId: { ...effectId, activation: 2 },
        },
      }],
    },
    { ...incident, effectWaits: [storedIncident.wait] },
    { ...incident, scopeOccurrences: [] },
    { ...incident, scopeOccurrences: [scope, scope] },
    { ...incident, variables: { ...incident.variables, activities: [] } },
    {
      ...incident,
      variables: {
        ...incident.variables,
        activities: [activity, activity],
      },
    },
    {
      ...incident,
      effectIncidents: [{
        ...storedIncident,
        wait: { ...storedIncident.wait, incidentAlreadyRetried: true },
      }],
    },
  ];
  for (const malformed of malformedStates) {
    assert.equal(effectIncidentAssociationsAreValid(malformed), false);
    assert.equal(isStableStateResumable(malformed), false);
    const refusedMalformed = applyStimulus(program, malformed, success);
    assert.equal(refusedMalformed.outcome, CommandOutcome.Rejected);
    assert.strictEqual(refusedMalformed.state, malformed);
  }
});

test("pre-dispatch admission rejects old, Terminate, and Call programs before closure", () => {
  const incident = incidentState();
  const oldProgram = {
    ...program,
    identity: {
      ...program.identity,
      semanticProfile: SemanticProfileId.ServiceTaskEffect,
    },
  };
  for (const candidate of [oldProgram, terminateProgram, callActivityProgram]) {
    const refused = applyStimulus(candidate, incident, retry);
    assert.equal(refused.outcome, CommandOutcome.Rejected);
    assert.strictEqual(refused.state, incident);
    assert.equal(refused.internalStepBoundExceeded, false);
  }
});

test("ordinary semantic success stays separate and creates no incident", () => {
  const completed = applyStimulus(program, startedState(), success);
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.equal(completed.state.control.kind, ControlStateKind.Completed);
  assert.deepEqual(completed.state.effectIncidents, []);
});
