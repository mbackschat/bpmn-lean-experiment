import {
  ACTIVITY_BOUNDARY_MESSAGE_CHECKPOINT_PROFILE_ID,
  MessageChannelKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram, rootScopeOccurrence } from "./root-scope-fixture.ts";

export const instanceId = "Application_1";

export const withdrawalChannel = Object.freeze({
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_ApplicationMessages",
  interfaceOperationId: "Operation_ReceiveApplicationWithdrawal",
  messageId: "Message_ApplicationWithdrawal",
});

export const program = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: ACTIVITY_BOUNDARY_MESSAGE_CHECKPOINT_PROFILE_ID,
    sourceId: "activity-boundary-message",
    sourceOverlay: null,
    sourceSha256:
      "27e018b3f16ae4d270065abcb92d37a1618e89a386958dd3763c245e94efb193",
  },
  processId: "Process_ActivityBoundaryMessage",
  controlPlaces: [
    controlPlace("Flow_Boundary"),
    controlPlace("Flow_Boundary_End"),
    controlPlace("Flow_Normal"),
    controlPlace("Flow_Normal_End"),
    controlPlace("Flow_Start"),
  ],
  operations: [
    {
      ...operationBase("BoundaryEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Boundary_End",
    },
    {
      ...operationBase("HandleWithdrawal"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Boundary",
      output: "place:Flow_Boundary_End",
      task: { elementId: "HandleWithdrawal", name: "Handle withdrawal" },
    },
    {
      ...operationBase("NormalEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Normal_End",
    },
    {
      ...operationBase("RecordReviewCompletion"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Normal",
      output: "place:Flow_Normal_End",
      task: {
        elementId: "RecordReviewCompletion",
        name: "Record review completion",
      },
    },
    {
      ...operationBase("ReviewApplication"),
      kind: SemanticOperationKind.AwaitMessageBoundedUserTask,
      input: "place:Flow_Start",
      task: {
        elementId: "ReviewApplication",
        name: "Review application",
        output: "place:Flow_Normal",
      },
      boundaryMessage: {
        elementId: "Withdrawal",
        channel: withdrawalChannel,
        output: "place:Flow_Boundary",
        origin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: "Flow_Boundary",
        },
      },
    },
    {
      ...operationBase("Start"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_Start",
    },
  ],
});

export const owner = rootScopeOccurrence(program.processId, instanceId);

export const taskId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "ReviewApplication",
  activation: 1,
});

export const subscriptionId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "Withdrawal",
  activation: 1,
});

export const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-application",
  processId: program.processId,
  instanceId,
  initialVariables: [],
});

export const completeReview = Object.freeze({
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-review",
  taskId,
  submittedValues: [],
});

export const deliverWithdrawal = Object.freeze({
  kind: StimulusKind.DeliverMessage,
  commandId: "deliver-withdrawal",
  subscriptionId,
  channel: withdrawalChannel,
});
