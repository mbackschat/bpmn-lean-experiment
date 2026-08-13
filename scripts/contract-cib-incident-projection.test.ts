import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  EffectJobSnapshot,
  IncidentJobSnapshot,
} from "./contract-cib-evidence.ts";
import {
  projectCibIncidentState,
  serviceTaskIncidentProfileId,
} from "./contract-cib-incident-projection.ts";

const effectJobs = {
  afterCommandId: "report-effect-failure",
  jobs: [{
    elementId: "ServiceTask_Record",
    activation: 1,
    protocol: "urn:bpmn-lean:effect:probe-v1",
    handler: "bpmnLeanEffectHandler",
    retries: 0,
    executable: false,
    dueDatePresent: false,
  }],
} as const satisfies EffectJobSnapshot;

function incidentJobs(
  configurationJobId: string,
  duplicate = false,
): IncidentJobSnapshot {
  const selected = {
    publicJobId: "job-1",
    retries: 0,
    executable: false,
    dueDatePresent: false,
    processInstanceId: "host-instance-1",
    elementId: "ServiceTask_Record",
    incident: {
      publicIncidentId: "incident-1",
      type: "failedJob",
      configurationJobId,
      processInstanceId: "host-instance-1",
      elementId: "ServiceTask_Record",
      causeIncidentId: "incident-1",
      rootCauseIncidentId: "incident-1",
    },
  } as const;
  return {
    afterCommandId: "report-effect-failure",
    createIncidentOnFailedJobEnabled: true,
    jobs: duplicate
      ? [selected, {
          ...selected,
          publicJobId: "job-2",
          incident: {
            ...selected.incident,
            publicIncidentId: "incident-2",
            configurationJobId: "job-2",
            causeIncidentId: "incident-2",
            rootCauseIncidentId: "incident-2",
          },
        }]
      : [selected],
  };
}

test("refuses an incident configured by a different public job", () => {
  assert.throws(
    () => projectCibIncidentState(
      serviceTaskIncidentProfileId,
      "semantic-instance-1",
      effectJobs,
      incidentJobs("different-job"),
    ),
    /configuration job identity/,
  );
});

test("refuses duplicate incident partners instead of selecting one", () => {
  assert.throws(
    () => projectCibIncidentState(
      serviceTaskIncidentProfileId,
      "semantic-instance-1",
      effectJobs,
      incidentJobs("job-1", true),
    ),
    /exactly one raw incident job/,
  );
});

test("partitions the retries-zero job into one canonical incident", () => {
  assert.deepEqual(
    projectCibIncidentState(
      serviceTaskIncidentProfileId,
      "semantic-instance-1",
      effectJobs,
      incidentJobs("job-1"),
    ),
    {
      activeWaits: [{
        elementId: "ServiceTask_Record",
        kind: "incident",
        multiplicity: 1,
      }],
      openEffects: [],
      openIncidents: [{
        kind: "effectExecutionFailed",
        id: {
          effectId: {
            processInstanceId: "semantic-instance-1",
            elementId: "ServiceTask_Record",
            activation: 1,
          },
          generation: 1,
        },
        effect: {
          id: {
            processInstanceId: "semantic-instance-1",
            elementId: "ServiceTask_Record",
            activation: 1,
          },
          descriptor: {
            protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
            operation: "urn:bpmn-lean:effect-operation:probe-v1",
          },
          arguments: [],
        },
      }],
      enabledInteractions: [{
        kind: "retryIncident",
        incidentId: {
          effectId: {
            processInstanceId: "semantic-instance-1",
            elementId: "ServiceTask_Record",
            activation: 1,
          },
          generation: 1,
        },
      }],
    },
  );
});
