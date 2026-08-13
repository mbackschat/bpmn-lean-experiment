/** Profile-owned Activity retry and result policy. */
import {
  SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";
import type { DeepReadonly } from "@bpmn-lean/semantic-core";

export enum EffectActivityPolicyKind {
  Legacy = "legacy",
  ServiceTaskIncident = "serviceTaskIncident",
}

export type EffectActivityPolicy = DeepReadonly<{
  kind: EffectActivityPolicyKind;
  maximumAttempts: 1 | 2;
}>;

export const legacyEffectActivityPolicy: EffectActivityPolicy = {
  kind: EffectActivityPolicyKind.Legacy,
  maximumAttempts: 2,
};

export const serviceTaskIncidentEffectActivityPolicy: EffectActivityPolicy = {
  kind: EffectActivityPolicyKind.ServiceTaskIncident,
  maximumAttempts: 1,
};

export function effectActivityPolicyForProfile(
  semanticProfile: string,
): EffectActivityPolicy {
  switch (semanticProfile) {
    case SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID:
    case SemanticProfileId.ServiceTaskIncidentCancellation:
      return serviceTaskIncidentEffectActivityPolicy;
    default:
      return legacyEffectActivityPolicy;
  }
}
