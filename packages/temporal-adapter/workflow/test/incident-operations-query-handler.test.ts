import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  EffectOperation,
  EffectProtocol,
  ProcessStatus,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  StimulusKind,
  applyStimulus,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  pairIncidentOperations,
  projectIncidentOperationsSnapshot,
} from "../dist/incident-operations-query-handler.js";

const effectId = {
  processInstanceId: "Instance_1",
  elementId: "ServiceTask_Record",
  activation: 1,
} as const;
const incidentId = { effectId, generation: 1 } as const;
const incident = {
  kind: "effectExecutionFailed",
  id: incidentId,
  effect: {
    id: effectId,
    descriptor: { protocol: "activity", operation: "probe" },
    arguments: [],
  },
} as const;
const retry = {
  kind: StimulusKind.RetryIncident,
  incidentId,
} as const;
const cancel = {
  kind: StimulusKind.CancelIncidentProcess,
  processInstanceId: "Instance_1",
  incidentId,
} as const;

test("rejects reordered and cross-incident operations instead of repairing them", () => {
  const otherRetry = {
    ...retry,
    incidentId: {
      ...incidentId,
      effectId: { ...effectId, elementId: "ServiceTask_Other" },
    },
  } as const;
  const unsupported = {
    kind: StimulusKind.CompleteUserTaskInstance,
    taskId: {
      processInstanceId: "Instance_1",
      elementId: "UserTask_1",
      activation: 1,
    },
  } as const;
  for (const malformed of [
    [],
    [cancel, retry],
    [otherRetry],
    [retry, retry],
    [retry, cancel, cancel],
    [unsupported, retry],
    [retry, unsupported],
    [{ ...cancel, processInstanceId: "Instance_2" }, retry],
  ]) {
    assert.throws(
      () => pairIncidentOperations([incident], malformed),
      /Cannot project incident operations/,
    );
  }
});

test("retains the exact Retry-before-Cancel sequence and accepts Retry alone", () => {
  assert.deepEqual(
    pairIncidentOperations([incident], [retry]),
    [{ incident, interactions: [retry] }],
  );
  assert.deepEqual(
    pairIncidentOperations([incident], [retry, cancel]),
    [{ incident, interactions: [retry, cancel] }],
  );
});

test("projects zero, Retry-only, Retry-and-Cancel, terminal, and not-started states without mutation", () => {
  const retryProgram = incidentProgram(SemanticProfileId.ServiceTaskIncident);
  const cancellationProgram = incidentProgram(
    SemanticProfileId.ServiceTaskIncidentCancellation,
  );
  const waiting = startedState(retryProgram);
  const retryIncident = incidentState(retryProgram);
  const cancellationIncident = incidentState(cancellationProgram);
  const before = structuredClone(cancellationIncident);
  const ordinaryTask = structuredClone(waiting);
  ordinaryTask.effectWaits = [];
  ordinaryTask.userTaskWaits = [{
    id: {
      processInstanceId: "Instance_1",
      elementId: "UserTask_Ordinary",
      activation: 1,
    },
    name: "Ordinary task",
    metadata: undefined,
  }];

  assert.deepEqual(projectIncidentOperationsSnapshot(retryProgram, initialState), null);
  assert.deepEqual(projectIncidentOperationsSnapshot(retryProgram, waiting), {
    instanceId: "Instance_1",
    status: ProcessStatus.Running,
    incidents: [],
  });
  assert.deepEqual(projectIncidentOperationsSnapshot(retryProgram, ordinaryTask), {
    instanceId: "Instance_1",
    status: ProcessStatus.Running,
    incidents: [],
  });
  assert.deepEqual(
    projectIncidentOperationsSnapshot(retryProgram, retryIncident)
      ?.incidents[0]?.interactions.map(({ kind }) => kind),
    [StimulusKind.RetryIncident],
  );
  assert.deepEqual(
    projectIncidentOperationsSnapshot(cancellationProgram, cancellationIncident)
      ?.incidents[0]?.interactions.map(({ kind }) => kind),
    [StimulusKind.RetryIncident, StimulusKind.CancelIncidentProcess],
  );
  for (const [kind, status] of [
    [ControlStateKind.Completed, ProcessStatus.Completed],
    [ControlStateKind.Cancelled, ProcessStatus.Cancelled],
  ] as const) {
    assert.deepEqual(
      projectIncidentOperationsSnapshot(retryProgram, {
        ...initialState,
        control: { kind, instanceId: "Instance_1" },
      }),
      { instanceId: "Instance_1", status, incidents: [] },
    );
  }
  assert.deepEqual(cancellationIncident, before);
});

test("rejects malformed private incident and terminal states", () => {
  const candidate = incidentProgram(SemanticProfileId.ServiceTaskIncident);
  const reported = incidentState(candidate);
  assert.throws(
    () => projectIncidentOperationsSnapshot(candidate, {
      ...reported,
      scopeOccurrences: [],
    }),
    /malformed committed running state/,
  );
  assert.throws(
    () => projectIncidentOperationsSnapshot(candidate, {
      ...reported,
      userTaskWaits: [{
        id: {
          processInstanceId: "Instance_1",
          elementId: "UserTask_Unexpected",
          activation: 1,
        },
        name: "Unexpected task",
        metadata: undefined,
      }],
    }),
    /unsupported current interaction/,
  );
  assert.throws(
    () => projectIncidentOperationsSnapshot(candidate, {
      ...initialState,
      control: { kind: ControlStateKind.Completed, instanceId: "Instance_1" },
      effectWaits: reported.effectIncidents.map(({ wait }) => wait),
    }),
    /retains live private material/,
  );
});

function startedState(program: SemanticProcessProgram): RuntimeState {
  const result = applyStimulus(program, initialState, {
    kind: StimulusKind.StartProcess,
    commandId: "start",
    processId: "Process_1",
    instanceId: "Instance_1",
    initialVariables: [],
  });
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

function incidentState(program: SemanticProcessProgram): RuntimeState {
  const waiting = startedState(program);
  const result = applyStimulus(program, waiting, {
    kind: StimulusKind.ReportEffectFailure,
    commandId: "report",
    effectId: {
      processInstanceId: "Instance_1",
      elementId: "ServiceTask_Record",
      activation: 1,
    },
    generation: 1,
  });
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

function incidentProgram(semanticProfile: string): SemanticProcessProgram {
  const processId = "Process_1";
  const scopeId = `scope:${processId}`;
  const controlPlaces = ["Flow_ServiceToEnd", "Flow_StartToService"].map(
    (elementId) => ({
      id: `place:${elementId}`,
      origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId },
    }),
  );
  const operations = [{
    id: "operation:EndEvent_1",
    kind: SemanticOperationKind.ReachNoneEnd,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "EndEvent_1" },
    input: "place:Flow_ServiceToEnd",
  }, {
    id: "operation:ServiceTask_Record",
    kind: SemanticOperationKind.AwaitEffect,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: "ServiceTask_Record",
    },
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
    id: "operation:StartEvent_1",
    kind: SemanticOperationKind.Initiate,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "StartEvent_1" },
    output: "place:Flow_StartToService",
  }, {
    id: `operation:complete-scope:${scopeId}`,
    kind: SemanticOperationKind.CompleteScope,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: processId },
    scopeId,
    parentOutput: null,
  }] as const;
  return {
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile,
      sourceId: "source",
      sourceOverlay: null,
      sourceSha256: "0".repeat(64),
    },
    processId,
    definitionScopes: [{ id: scopeId, parentScopeId: null, originElementId: processId }],
    operationScopes: operations.map(({ id: operationId }) => ({ operationId, scopeId })),
    controlPlaceScopes: controlPlaces.map(({ id: controlPlaceId }) => ({ controlPlaceId, scopeId })),
    controlPlaces,
    operations,
  };
}
