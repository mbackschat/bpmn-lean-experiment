import {
  ObservationRequestKind,
  ScenarioDocumentKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";

import {
  completeEffectCommandId,
  effectTransportKey,
} from "../dist/index.js";

export function serviceTaskEffectInput(instanceId = "Instance_1") {
  const descriptor = {
    protocol: "urn:bpmn-lean:effect:probe-v1",
    handler: "bpmnLeanEffectHandler",
  };
  const semanticProcess = {
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: "cibseven-2.2.0-service-task-effect-draft",
      sourceId: "service-task-effect-process",
      sourceSha256:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
    processId: "Process_ServiceTaskEffect",
    controlPlaces: [
      serviceTaskControlPlace("Flow_ServiceToEnd"),
      serviceTaskControlPlace("Flow_StartToService"),
    ],
    operations: [
      {
        ...serviceTaskOperationBase("EndEvent_1"),
        kind: SemanticOperationKind.Terminate,
        input: "place:Flow_ServiceToEnd",
      },
      {
        ...serviceTaskOperationBase("ServiceTask_Record"),
        kind: SemanticOperationKind.AwaitEffect,
        input: "place:Flow_StartToService",
        output: "place:Flow_ServiceToEnd",
        effect: {
          elementId: "ServiceTask_Record",
          descriptor,
          inputMappings: [],
          outputMappings: [],
        },
      },
      {
        ...serviceTaskOperationBase("StartEvent_1"),
        kind: SemanticOperationKind.Initiate,
        output: "place:Flow_StartToService",
      },
    ],
  };
  const effectId = {
    processInstanceId: instanceId,
    elementId: "ServiceTask_Record",
    activation: 1,
  };
  return {
    semanticProcess,
    scenario: {
      kind: ScenarioDocumentKind.Scenario,
      id: "service-task-effect-success",
      profile: semanticProcess.identity.semanticProfile,
      bpmn: {
        id: semanticProcess.identity.sourceId,
        relativePath: "scenarios/service-task-effect/process.bpmn",
        sha256: semanticProcess.identity.sourceSha256,
      },
      stimuli: [
        {
          kind: StimulusKind.StartProcess,
          commandId: "start-process",
          processId: semanticProcess.processId,
          instanceId,
        },
        {
          kind: StimulusKind.CompleteEffect,
          commandId: completeEffectCommandId(effectId, {
            kind: "success",
            localPatch: [],
          }),
          effectId,
          result: {
            kind: "success",
            localPatch: [],
          },
        },
      ],
      observations: [
        ObservationRequestKind.Deployment,
        ObservationRequestKind.CommandResults,
        ObservationRequestKind.ProcessStatus,
        ObservationRequestKind.ActiveWaits,
        ObservationRequestKind.OpenUserTasks,
        ObservationRequestKind.OpenTimers,
        ObservationRequestKind.OpenEffects,
        ObservationRequestKind.Variables,
        ObservationRequestKind.EnabledInteractions,
        ObservationRequestKind.LogicalTime,
      ],
      provenance: {
        normativeRefs: ["BPMN 2.0.2 §13.3.3"],
        cibRevision: "834a9874760de8a0107f7c1b32806e37f17fb017",
        cibRefs: ["ServiceTaskActivityBehavior.java"],
      },
    },
  };
}

export function serviceTaskEffectRequest({ scenario, semanticProcess }) {
  const effectId = scenario.stimuli[1].effectId;
  const descriptor = semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitEffect,
  ).effect.descriptor;
  return {
    ...descriptor,
    idempotencyKey: effectTransportKey({
      definition: {
        semanticProfile: semanticProcess.identity.semanticProfile,
        sourceId: semanticProcess.identity.sourceId,
        sourceSha256: semanticProcess.identity.sourceSha256,
        processId: semanticProcess.processId,
      },
      occurrence: effectId,
      descriptor,
      arguments: [],
    }),
    arguments: [],
  };
}

export function serviceTaskEffectKey(input) {
  return serviceTaskEffectRequest(input).idempotencyKey;
}

function serviceTaskControlPlace(elementId) {
  return {
    id: `place:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId,
    },
  };
}

function serviceTaskOperationBase(elementId) {
  return {
    id: `operation:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId,
    },
  };
}
