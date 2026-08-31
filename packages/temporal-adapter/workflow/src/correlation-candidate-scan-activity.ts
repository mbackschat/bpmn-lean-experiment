import { proxyActivities } from "@temporalio/workflow";

import {
  bpmnResolveCorrelationCandidateScanActivityName,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateScanActivities,
} from "@bpmn-lean/temporal-protocol";

const correlationCandidateScanActivities =
  proxyActivities<CorrelationCandidateScanActivities>({
    startToCloseTimeout: "5s",
    scheduleToCloseTimeout: "20s",
    retry: {
      initialInterval: "100ms",
      backoffCoefficient: 1,
      maximumAttempts: 3,
    },
  });

export const resolveBpmnCorrelationCandidateScan =
  correlationCandidateScanActivities[
    bpmnResolveCorrelationCandidateScanActivityName
  ];
