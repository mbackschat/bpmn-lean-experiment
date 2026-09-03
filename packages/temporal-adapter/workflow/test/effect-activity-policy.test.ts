import assert from "node:assert/strict";
import test from "node:test";

import {
  ActivityCancellationType,
} from "@temporalio/workflow";
import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  ControlStateKind,
  SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";
import { EffectActivityResultKind } from "@bpmn-lean/temporal-protocol";
import {
  EffectActivityPolicyKind,
  effectActivityPolicyForProfile,
} from "../dist/effect-activity-policy.js";
import { effectActivityResultCommand } from "../dist/effect-execution-host.js";

test("both incident profiles share one-attempt reporting while unrelated profiles stay legacy", () => {
  const stageOnePolicy = effectActivityPolicyForProfile(
    SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
  );
  const cancellationPolicy = effectActivityPolicyForProfile(
    SemanticProfileId.ServiceTaskIncidentCancellation,
  );
  assert.strictEqual(cancellationPolicy, stageOnePolicy);
  assert.deepEqual(stageOnePolicy, {
    kind: EffectActivityPolicyKind.ServiceTaskIncident,
    maximumAttempts: 1,
  });

  const nonIncidentProfiles = Object.values(SemanticProfileId).filter(
    (profile) =>
      profile !== SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID &&
      profile !== SemanticProfileId.ServiceTaskIncidentCancellation,
  );
  for (const profile of [...nonIncidentProfiles, "unregistered-profile"]) {
    assert.deepEqual(effectActivityPolicyForProfile(profile), {
      kind: EffectActivityPolicyKind.Legacy,
      maximumAttempts: 2,
    });
  }

  const effect = {
    id: {
      processInstanceId: "Instance_1",
      elementId: "ServiceTask_Record",
      activation: 1,
    },
    descriptor: {
      protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
      operation: "urn:bpmn-lean:effect-operation:probe-v1",
    },
    arguments: [],
  } as const;
  const state = {
    control: { kind: ControlStateKind.Running, instanceId: "Instance_1" },
    effectWaits: [{ id: effect.id, incidentAlreadyRetried: false }],
  };
  assert.deepEqual(
    effectActivityResultCommand(
      cancellationPolicy,
      state as never,
      effect,
      { kind: EffectActivityResultKind.TechnicalFailure },
    ),
    effectActivityResultCommand(
      stageOnePolicy,
      state as never,
      effect,
      { kind: EffectActivityResultKind.TechnicalFailure },
    ),
  );
});

test("compensation uses two attempts without inheriting the legacy result policy", () => {
  assert.deepEqual(
    effectActivityPolicyForProfile(COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID),
    {
      kind: EffectActivityPolicyKind.Compensation,
      maximumAttempts: 2,
      cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
    },
  );
});
