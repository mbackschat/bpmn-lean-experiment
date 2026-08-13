/** Profile-owned Activity retry and result policy. */
import {
  SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
} from "@bpmn-lean/semantic-core";
import type { DeepReadonly } from "@bpmn-lean/semantic-core";

export enum EffectActivityPolicyKind {
  Legacy = "legacy",
  ServiceTaskIncident = "serviceTaskIncident",
}

export type EffectActivityPolicy = DeepReadonly<{
  kind: EffectActivityPolicyKind;
  maximumAttempts: 1 | 2;
  acceptsTechnicalFailure: boolean;
}>;

const legacyPolicy: EffectActivityPolicy = {
  kind: EffectActivityPolicyKind.Legacy,
  maximumAttempts: 2,
  acceptsTechnicalFailure: false,
};

const incidentPolicy: EffectActivityPolicy = {
  kind: EffectActivityPolicyKind.ServiceTaskIncident,
  maximumAttempts: 1,
  acceptsTechnicalFailure: true,
};

export function effectActivityPolicyForProfile(
  semanticProfile: string,
): EffectActivityPolicy {
  return semanticProfile === SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID
    ? incidentPolicy
    : legacyPolicy;
}
