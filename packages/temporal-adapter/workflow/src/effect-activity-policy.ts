/** Profile-owned Activity retry and result policy. */
import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";
import type { DeepReadonly } from "@bpmn-lean/semantic-core";
import { ActivityCancellationType } from "@temporalio/workflow";

export enum EffectActivityPolicyKind {
  Legacy = "legacy",
  ServiceTaskIncident = "serviceTaskIncident",
  Compensation = "compensation",
}

export type EffectActivityPolicy =
  | DeepReadonly<{
      kind: EffectActivityPolicyKind.Legacy;
      maximumAttempts: 2;
    }>
  | DeepReadonly<{
      kind: EffectActivityPolicyKind.ServiceTaskIncident;
      maximumAttempts: 1;
    }>
  | DeepReadonly<{
      kind: EffectActivityPolicyKind.Compensation;
      maximumAttempts: 2;
      cancellationType:
        typeof ActivityCancellationType.WAIT_CANCELLATION_COMPLETED;
    }>;

export const legacyEffectActivityPolicy = {
  kind: EffectActivityPolicyKind.Legacy,
  maximumAttempts: 2,
} as const satisfies EffectActivityPolicy;

export const serviceTaskIncidentEffectActivityPolicy = {
  kind: EffectActivityPolicyKind.ServiceTaskIncident,
  maximumAttempts: 1,
} as const satisfies EffectActivityPolicy;

export const compensationEffectActivityPolicy = {
  kind: EffectActivityPolicyKind.Compensation,
  maximumAttempts: 2,
  cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
} as const satisfies EffectActivityPolicy;

export function effectActivityPolicyForProfile(
  semanticProfile: string,
): EffectActivityPolicy {
  switch (semanticProfile) {
    case COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID:
      return compensationEffectActivityPolicy;
    case SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID:
    case SemanticProfileId.ServiceTaskIncidentCancellation:
      return serviceTaskIncidentEffectActivityPolicy;
    default:
      return legacyEffectActivityPolicy;
  }
}
