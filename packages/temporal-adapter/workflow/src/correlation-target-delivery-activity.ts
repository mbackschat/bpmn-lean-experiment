import { proxyActivities } from "@temporalio/workflow";

import {
  bpmnResolveCorrelationTargetDeliveryActivityName,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationTargetDeliveryActivities,
} from "@bpmn-lean/temporal-protocol";

const correlationTargetDeliveryActivities =
  proxyActivities<CorrelationTargetDeliveryActivities>({
    startToCloseTimeout: "5s",
    scheduleToCloseTimeout: "20s",
    retry: {
      initialInterval: "100ms",
      backoffCoefficient: 1,
      maximumAttempts: 3,
    },
  });

export const resolveBpmnCorrelationTargetDelivery =
  correlationTargetDeliveryActivities[
    bpmnResolveCorrelationTargetDeliveryActivityName
  ];
