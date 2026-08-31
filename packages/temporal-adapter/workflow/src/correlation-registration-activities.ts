/** Workflow Activity proxy for Process-owned correlation registration resolution. */
import { proxyActivities } from "@temporalio/workflow";

import type {
  CorrelationRegistrationActivities,
} from "@bpmn-lean/temporal-protocol";
import {
  bpmnResolveCorrelationCandidateRegistrationActivityName,
} from "@bpmn-lean/temporal-protocol";

const correlationRegistrationActivities =
  proxyActivities<CorrelationRegistrationActivities>({
    startToCloseTimeout: "5s",
    scheduleToCloseTimeout: "20s",
    retry: {
      initialInterval: "100ms",
      backoffCoefficient: 1,
      maximumAttempts: 3,
    },
  });

export const resolveBpmnCorrelationCandidateRegistration =
  correlationRegistrationActivities[
    bpmnResolveCorrelationCandidateRegistrationActivityName
  ];
