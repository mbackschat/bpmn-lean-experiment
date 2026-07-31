/**
 * Bounded Service Task effect fixture for the Temporal integration suite.
 *
 * The scenario carries the committed effect result, so the completion command ID
 * is derived from the same content-bound projection the adapter uses.
 */
import {
  EffectExecutionResultKind,
  ObservationRequestKind,
  ScenarioDocumentKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  BpmnElementOrigin,
  ControlPlace,
  EffectDescriptor,
  EffectOccurrenceId,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  completeEffectCommandId,
  effectTransportKey,
} from "@bpmn-lean/temporal-adapter";

import type { TemporalExecutionInput } from "./temporal-test-support.ts";

/** One effect request as the probe Activity receives it. */
export type ServiceTaskEffectRequest = EffectDescriptor &
  Readonly<{
    idempotencyKey: string;
    arguments: ReadonlyArray<never>;
  }>;

const descriptor: EffectDescriptor = {
  protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
  operation: "urn:bpmn-lean:effect-operation:probe-v1",
};

export function serviceTaskEffectInput(
  instanceId = "Instance_1",
): TemporalExecutionInput {
  const processId = "Process_ServiceTaskEffect";
  const scopeId = `scope:${processId}`;
  const controlPlaces = [
    serviceTaskControlPlace("Flow_ServiceToEnd"),
    serviceTaskControlPlace("Flow_StartToService"),
  ];
  const operations = [
    {
      ...serviceTaskOperationBase("EndEvent_1"),
      kind: SemanticOperationKind.ReachNoneEnd,
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
      bpmnErrorRoute: null,
    },
    {
      ...serviceTaskOperationBase("StartEvent_1"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToService",
    },
    {
      id: `operation:complete-scope:${scopeId}`,
      kind: SemanticOperationKind.CompleteScope,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: processId,
      },
      scopeId,
      parentOutput: null,
    },
  ] as const;
  const semanticProcess: SemanticProcessProgram = {
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: "cibseven-2.2.0-service-task-effect-draft",
      sourceId: "service-task-effect-process",
      sourceSha256:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
    processId,
    definitionScopes: [{
      id: scopeId,
      parentScopeId: null,
      originElementId: processId,
    }],
    operationScopes: operations.map(({ id: operationId }) => ({
      operationId,
      scopeId,
    })),
    controlPlaceScopes: controlPlaces.map(({ id: controlPlaceId }) => ({
      controlPlaceId,
      scopeId,
    })),
    controlPlaces,
    operations,
  };
  const effectId: EffectOccurrenceId = {
    processInstanceId: instanceId,
    elementId: "ServiceTask_Record",
    activation: 1,
  };
  const result = {
    kind: EffectExecutionResultKind.Success,
    localPatch: [],
  } as const;
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
          initialVariables: [],
        },
        {
          kind: StimulusKind.CompleteEffect,
          commandId: completeEffectCommandId(effectId, result),
          effectId,
          result,
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

export function serviceTaskEffectRequest(
  { scenario, semanticProcess }: TemporalExecutionInput,
): ServiceTaskEffectRequest {
  const completion = scenario.stimuli[1];
  if (completion?.kind !== StimulusKind.CompleteEffect) {
    throw new TypeError("the fixture scenario completes an effect second");
  }
  const effect = semanticProcess.operations.find(
    (operation) => operation.kind === SemanticOperationKind.AwaitEffect,
  );
  if (effect?.kind !== SemanticOperationKind.AwaitEffect) {
    throw new TypeError("the fixture program has no effect occurrence");
  }
  const effectDescriptor = effect.effect.descriptor;
  return {
    ...effectDescriptor,
    idempotencyKey: effectTransportKey({
      definition: {
        semanticProfile: semanticProcess.identity.semanticProfile,
        sourceId: semanticProcess.identity.sourceId,
        sourceSha256: semanticProcess.identity.sourceSha256,
        processId: semanticProcess.processId,
      },
      occurrence: completion.effectId,
      descriptor: effectDescriptor,
      arguments: [],
    }),
    arguments: [],
  };
}

export function serviceTaskEffectKey(input: TemporalExecutionInput): string {
  return serviceTaskEffectRequest(input).idempotencyKey;
}

function serviceTaskControlPlace(elementId: string): ControlPlace {
  return {
    id: `place:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId,
    },
  };
}

function serviceTaskOperationBase(
  elementId: string,
): Readonly<{ id: string; origin: BpmnElementOrigin }> {
  return {
    id: `operation:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId,
    },
  };
}
