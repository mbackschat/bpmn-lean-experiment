import {
  resolveWorkflowChainUpdate,
} from "@bpmn-lean/temporal-client";
import type {
  TemporalWorkflowClient,
} from "@bpmn-lean/temporal-client";
import {
  bpmnDeliverCorrelatedMessageUpdateName,
  bpmnResolveCorrelationTargetDeliveryActivityName,
  correlationTargetDeliveryStimulus,
  requireCorrelationTargetDeliveryActivityRequest,
  requireCorrelationTargetDeliveryCompletion,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationTargetDeliveryActivities,
} from "@bpmn-lean/temporal-protocol";

const targetDeliveryRecoveryDeadlineMs = 4_000;

/** Delivers and recovers one content-bound Update against only the retained target Process. */
export function createCorrelationTargetDeliveryActivities(
  workflowClient: TemporalWorkflowClient,
): CorrelationTargetDeliveryActivities {
  return {
    [bpmnResolveCorrelationTargetDeliveryActivityName]: async (requestValue) => {
      const request = requireCorrelationTargetDeliveryActivityRequest(requestValue);
      const stimulus = correlationTargetDeliveryStimulus(request);
      const result = await resolveWorkflowChainUpdate({
        client: workflowClient,
        workflowId: request.registration.processLocator.workflowId,
        processInstanceId: request.target.processInstanceId,
        stimulus,
        updateName: bpmnDeliverCorrelatedMessageUpdateName,
        operation: "correlated Message target delivery",
        deadlineMs: targetDeliveryRecoveryDeadlineMs,
      });
      return requireCorrelationTargetDeliveryCompletion(
        { stimulus, result },
        request,
      );
    },
  };
}
