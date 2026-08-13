import assert from "node:assert/strict";
import test from "node:test";

import {
  SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import {
  EffectActivityResultKind,
  bpmnRetryEffectIncidentUpdateName,
  contentBoundUpdateId,
  reportEffectFailureStimulus,
} from "@bpmn-lean/temporal-protocol";
import {
  EffectActivityPolicyKind,
  effectActivityPolicyForProfile,
} from "@bpmn-lean/temporal-workflow";
import {
  effectActivityResultCommand,
  EffectHostFailureKind,
} from "@bpmn-lean/temporal-workflow";
import {
  ControlStateKind,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";

const effectId = {
  processInstanceId: "Instance_1",
  elementId: "ServiceTask_Record",
  activation: 1,
} as const;

test("the successor alone admits one-attempt typed technical failure hosting", () => {
  assert.deepEqual(
    effectActivityPolicyForProfile(
      SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
    ),
    {
      kind: EffectActivityPolicyKind.ServiceTaskIncident,
      maximumAttempts: 1,
    },
  );
  assert.deepEqual(
    effectActivityPolicyForProfile(
      "cibseven-2.2.0-service-task-effect-draft",
    ),
    {
      kind: EffectActivityPolicyKind.Legacy,
      maximumAttempts: 2,
    },
  );
  assert.deepEqual(
    { kind: EffectActivityResultKind.TechnicalFailure },
    { kind: "technicalFailure" },
  );
});

test("report identity is derived only from the committed effect occurrence", () => {
  assert.deepEqual(reportEffectFailureStimulus(effectId), {
    kind: StimulusKind.ReportEffectFailure,
    commandId:
      "report-effect-failure-sha256:b6b5077e469b9421ed4a598e4c08fae7c3ce3e31c941fae9733b4c7206a2b345",
    effectId,
    generation: 1,
  });
});

test("incident retry uses its dedicated content-bound Update", () => {
  const retry = {
    kind: StimulusKind.RetryIncident,
    commandId: "retry-effect-incident",
    incidentId: { effectId, generation: 1 },
  } as const;
  const replacement = {
    ...retry,
    incidentId: {
      ...retry.incidentId,
      effectId: { ...effectId, activation: 2 },
    },
  } as const;

  assert.equal(
    bpmnRetryEffectIncidentUpdateName,
    "bpmn-retry-effect-incident",
  );
  assert.notEqual(
    contentBoundUpdateId(retry),
    contentBoundUpdateId(replacement),
  );
});

test("technical failure never becomes a semantic completion result", () => {
  const openEffect = {
    id: effectId,
    descriptor: {
      protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
      operation: "urn:bpmn-lean:effect-operation:probe-v1",
    },
    arguments: [],
  } as const;
  const baseState = {
    control: { kind: ControlStateKind.Running, instanceId: "Instance_1" },
    effectWaits: [{ id: effectId, incidentAlreadyRetried: false }],
  };
  const incidentPolicy = effectActivityPolicyForProfile(
    SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
  );
  const legacyPolicy = effectActivityPolicyForProfile(
    SemanticProfileId.ServiceTaskEffect,
  );
  const retriedState = {
    ...baseState,
    effectWaits: [{ id: effectId, incidentAlreadyRetried: true }],
  };

  assert.equal(
    effectActivityResultCommand(
      incidentPolicy,
      baseState as never,
      openEffect,
      { kind: EffectActivityResultKind.TechnicalFailure },
    ).kind,
    "command",
  );
  assert.deepEqual(
    effectActivityResultCommand(
      legacyPolicy,
      baseState as never,
      openEffect,
      { kind: EffectActivityResultKind.TechnicalFailure },
    ),
    {
      kind: "failure",
      failure: EffectHostFailureKind.TechnicalFailureUnsupported,
    },
  );
  assert.deepEqual(
    effectActivityResultCommand(
      incidentPolicy,
      retriedState as never,
      openEffect,
      { kind: EffectActivityResultKind.TechnicalFailure },
    ),
    {
      kind: "failure",
      failure: EffectHostFailureKind.TechnicalFailureAfterRetry,
    },
  );
});
