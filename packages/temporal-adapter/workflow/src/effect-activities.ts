/** Workflow Activity proxies with profile-selected immutable retry policies. */
import { proxyActivities } from "@temporalio/workflow";

import type { EffectActivities } from "@bpmn-lean/temporal-protocol";
import {
  EffectActivityPolicyKind,
  compensationEffectActivityPolicy,
  effectActivityPolicyForProfile,
  legacyEffectActivityPolicy,
  serviceTaskIncidentEffectActivityPolicy,
} from "./effect-activity-policy.js";

const commonOptions = {
  startToCloseTimeout: "2s",
  scheduleToCloseTimeout: "10s",
  retry: {
    initialInterval: "100ms",
    backoffCoefficient: 1,
  },
} as const;

const legacyActivities = proxyActivities<EffectActivities>({
  ...commonOptions,
  retry: {
    ...commonOptions.retry,
    maximumAttempts: legacyEffectActivityPolicy.maximumAttempts,
  },
});

const incidentActivities = proxyActivities<EffectActivities>({
  ...commonOptions,
  retry: {
    ...commonOptions.retry,
    maximumAttempts: serviceTaskIncidentEffectActivityPolicy.maximumAttempts,
  },
});

const compensationActivities = proxyActivities<EffectActivities>({
  ...commonOptions,
  heartbeatTimeout: compensationEffectActivityPolicy.heartbeatTimeout,
  cancellationType: compensationEffectActivityPolicy.cancellationType,
  retry: {
    ...commonOptions.retry,
    maximumAttempts: compensationEffectActivityPolicy.maximumAttempts,
  },
});

export function executeEffectForProfile(
  semanticProfile: string,
): EffectActivities["executeBpmnEffect"] {
  const policy = effectActivityPolicyForProfile(semanticProfile);
  switch (policy.kind) {
    case EffectActivityPolicyKind.Legacy:
      return legacyActivities.executeBpmnEffect;
    case EffectActivityPolicyKind.ServiceTaskIncident:
      return incidentActivities.executeBpmnEffect;
    case EffectActivityPolicyKind.Compensation:
      return compensationActivities.executeBpmnEffect;
    default:
      return assertNever(policy);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported effect Activity policy: ${String(value)}`);
}
