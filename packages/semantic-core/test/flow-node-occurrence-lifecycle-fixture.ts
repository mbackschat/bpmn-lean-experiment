/** Test-only Semantic Process Programs separating flow-node lifecycle families. */
import {
  EffectOperation,
  EffectProtocol,
  MessageChannelKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticProcessProgram,
  UnnumberedFlowNodeOccurrenceStart,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";
import { terminateProgram } from "./terminate-end-event-fixture.ts";

export const boundedTaskProgram: SemanticProcessProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-activity-boundary-timer-draft",
    sourceId: "flow-node-occurrence-boundary-timer",
    sourceOverlay: null,
    sourceSha256: "b".repeat(64),
  },
  processId: "Process_Bounded",
  controlPlaces: ["Flow_Boundary", "Flow_Normal", "Flow_Start"].map(controlPlace),
  operations: [
    {
      ...operationBase("BoundaryFollow"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Boundary",
      output: "place:Flow_BoundaryDone",
      task: { elementId: "BoundaryFollow", name: "Boundary follow-up" },
    },
    {
      ...operationBase("BoundedTask"),
      kind: SemanticOperationKind.AwaitBoundedUserTask,
      input: "place:Flow_Start",
      task: {
        elementId: "BoundedTask",
        name: "Bounded task",
        output: "place:Flow_Normal",
      },
      boundaryTimer: {
        elementId: "Deadline",
        durationMs: 1000,
        output: "place:Flow_Boundary",
        origin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: "Flow_Boundary",
        },
      },
    },
    startOperation(),
  ],
});

export const boundedTaskStart = {
  kind: StimulusKind.StartProcess,
  commandId: "start-bounded",
  processId: boundedTaskProgram.processId,
  instanceId: "bounded-instance",
  initialVariables: [],
} as const;

const receiveChannel = {
  kind: MessageChannelKind.DirectMessage,
  messageId: "Message_Receive",
} as const;

export const receiveTaskProgram = waitProgram(
  "Process_Receive",
  SemanticProfileId.MessageAddressedReceiveTask,
  {
    ...operationBase("ReceiveTask_Wait"),
    kind: SemanticOperationKind.AwaitMessage,
    input: "place:Flow_Start",
    output: "place:Flow_After",
    message: { elementId: "ReceiveTask_Wait", channel: receiveChannel },
  },
);

export const configuredTaskProgram = waitProgram(
  "Process_Configured",
  SemanticProfileId.ConfiguredTask,
  effectOperation("ConfiguredTask_Probe", "place:Flow_After", null),
);

export const boundaryErrorProgram: SemanticProcessProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: identity(
    "Process_BoundaryError",
    "boundary-error",
    SemanticProfileId.MappedBoundaryErrorServiceTask,
  ),
  processId: "Process_BoundaryError",
  controlPlaces: ["Flow_Boundary", "Flow_Start"].map(controlPlace),
  operations: [
    {
      ...operationBase("BoundaryReview"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Boundary",
      output: "place:Flow_Done",
      task: { elementId: "BoundaryReview", name: "Review" },
    },
    effectOperation("ServiceTask_Error", "place:Flow_Normal", {
      code: "BusinessError",
      output: "place:Flow_Boundary",
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        boundaryEventId: "BoundaryEvent_Error",
        errorDefinitionId: "ErrorDefinition_Caught",
        errorElementId: "Error_Business",
        sequenceFlowId: "Flow_Boundary",
      },
    }),
    startOperation(),
  ],
});

export const propagatedErrorProgram = {
  ...terminateProgram,
  identity: {
    ...terminateProgram.identity,
    semanticProfile: SemanticProfileId.SubProcessErrorPropagation,
  },
  operations: terminateProgram.operations.map((operation) =>
    operation.kind === SemanticOperationKind.TerminateScope
      ? {
          ...operationBase("EndEvent_Terminate"),
          kind: SemanticOperationKind.ThrowError,
          input: operation.input,
          error: {
            errorDefinitionId: "ErrorDefinition_Thrown",
            errorElementId: "Error_Business",
            code: "BusinessError",
          },
          handler: {
            attachedScopeId: operation.scopeId,
            code: "BusinessError",
            output: "place:Flow_ScopeToOuter",
            origin: {
              kind: SemanticOriginKind.BpmnElement,
              boundaryEventId: "BoundaryEvent_Error",
              errorDefinitionId: "ErrorDefinition_Caught",
              errorElementId: "Error_Business",
              sequenceFlowId: "Flow_ScopeToOuter",
            },
          },
        }
      : operation
  ),
} as const satisfies SemanticProcessProgram;

export const incidentProgram: SemanticProcessProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: identity(
    "Process_Incident",
    "incident-cancellation",
    SemanticProfileId.ServiceTaskIncidentCancellation,
  ),
  processId: "Process_Incident",
  controlPlaces: ["Flow_Start", "Flow_ToEnd"].map(controlPlace),
  operations: [
    {
      ...operationBase("EndEvent_Incident"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_ToEnd",
    },
    effectOperation("ServiceTask_Incident", "place:Flow_ToEnd", null),
    startOperation(),
  ],
});

export function startFor(program: SemanticProcessProgram, instanceId: string) {
  return {
    kind: StimulusKind.StartProcess,
    commandId: `start-${instanceId}`,
    processId: program.processId,
    instanceId,
    initialVariables: [],
  } as const;
}

export function openWait(
  owner: UnnumberedFlowNodeOccurrenceStart["owner"],
  activation: number,
): UnnumberedFlowNodeOccurrenceStart {
  return {
    anchor: {
      kind: SemanticFlowNodeOccurrenceAnchorKind.Wait,
      id: { processInstanceId: owner.processInstanceId, elementId: "Wait", activation },
    },
    processId: "process",
    elementId: "Wait",
    owner,
  };
}

function waitProgram(
  processId: string,
  semanticProfile: string,
  wait: SemanticProcessProgram["operations"][number],
): SemanticProcessProgram {
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: identity(processId, `wait-${processId}`, semanticProfile),
    processId,
    controlPlaces: ["Flow_Start"].map(controlPlace),
    operations: [wait, startOperation()],
  });
}

function effectOperation(
  elementId: string,
  output: string,
  bpmnErrorRoute: Extract<
    SemanticProcessProgram["operations"][number],
    { kind: SemanticOperationKind.AwaitEffect }
  >["bpmnErrorRoute"],
) {
  return {
    ...operationBase(elementId),
    kind: SemanticOperationKind.AwaitEffect,
    input: "place:Flow_Start",
    output,
    effect: {
      elementId,
      descriptor: {
        protocol: EffectProtocol.Activity,
        operation: EffectOperation.Probe,
      },
      inputMappings: [],
      outputMappings: [],
    },
    bpmnErrorRoute,
  } as const;
}

function startOperation() {
  return {
    ...operationBase("StartEvent_1"),
    kind: SemanticOperationKind.Initiate,
    output: "place:Flow_Start",
  } as const;
}

function identity(
  processId: string,
  sourceId: string,
  semanticProfile: string,
) {
  return {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile,
    sourceId,
    sourceOverlay: null,
    sourceSha256: "f".repeat(64),
  } as const;
}
