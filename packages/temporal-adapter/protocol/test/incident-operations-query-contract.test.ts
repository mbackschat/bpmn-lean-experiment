import assert from "node:assert/strict";
import test from "node:test";

import {
  ProcessStatus,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  TemporalIncidentOperationsSnapshot,
} from "../dist/index.js";
import {
  bpmnIncidentOperationsQueryName,
  isTemporalIncidentOperationsSnapshot,
  requireTemporalIncidentOperationsSnapshot,
} from "../dist/index.js";

test("publishes one closed current-incident Query contract", () => {
  assert.equal(
    bpmnIncidentOperationsQueryName,
    "bpmn-incident-operations",
  );

  const running = {
    instanceId: "Instance_1",
    status: ProcessStatus.Running,
    incidents: [{
      incident: {
        kind: "effectExecutionFailed",
        id: {
          effectId: {
            processInstanceId: "Instance_1",
            elementId: "ServiceTask_Record",
            activation: 1,
          },
          generation: 1,
        },
        effect: {
          id: {
            processInstanceId: "Instance_1",
            elementId: "ServiceTask_Record",
            activation: 1,
          },
          descriptor: { protocol: "activity", operation: "probe" },
          arguments: [],
        },
      },
      interactions: [{
        kind: StimulusKind.RetryIncident,
        incidentId: {
          effectId: {
            processInstanceId: "Instance_1",
            elementId: "ServiceTask_Record",
            activation: 1,
          },
          generation: 1,
        },
      }],
    }],
  } as const satisfies Exclude<TemporalIncidentOperationsSnapshot, null>;
  const completed = {
    instanceId: "Instance_1",
    status: ProcessStatus.Completed,
    incidents: [],
  } as const satisfies Exclude<TemporalIncidentOperationsSnapshot, null>;
  const failed = {
    instanceId: "Instance_1",
    status: ProcessStatus.Failed,
    incidents: [],
  } as const satisfies Exclude<TemporalIncidentOperationsSnapshot, null>;

  assert.equal(running.incidents[0].interactions[0].kind, "retryIncident");
  assert.deepEqual(completed.incidents, []);
  assert.deepEqual(requireTemporalIncidentOperationsSnapshot(running), running);
  assert.deepEqual(requireTemporalIncidentOperationsSnapshot(completed), completed);
  assert.deepEqual(requireTemporalIncidentOperationsSnapshot(failed), failed);
  assert.equal(isTemporalIncidentOperationsSnapshot(null), true);
  assert.equal(isTemporalIncidentOperationsSnapshot({
    instanceId: "Instance_1",
    status: ProcessStatus.Running,
    incidents: [],
  }), true);
});

test("strictly rejects malformed and cross-identity Query results", () => {
  const valid = runningSnapshot();
  const entry = valid.incidents[0];
  assert.ok(entry !== undefined);
  const retry = entry.interactions[0];
  const cancel = {
    kind: StimulusKind.CancelIncidentProcess,
    processInstanceId: valid.instanceId,
    incidentId: entry.incident.id,
  } as const;
  for (const malformed of [
    undefined,
    {},
    { ...valid, owner: "private" },
    { ...valid, status: "notStarted" },
    { ...valid, instanceId: "" },
    { ...valid, incidents: [{ ...entry, private: true }] },
    { ...valid, incidents: [{ ...entry, interactions: [] }] },
    { ...valid, incidents: [{ ...entry, interactions: [cancel, retry] }] },
    { ...valid, incidents: [{ ...entry, interactions: [retry, retry] }] },
    {
      ...valid,
      incidents: [{
        ...entry,
        interactions: [{
          ...retry,
          incidentId: {
            ...retry.incidentId,
            effectId: { ...retry.incidentId.effectId, activation: 2 },
          },
        }],
      }],
    },
    {
      ...valid,
      incidents: [{
        ...entry,
        interactions: [retry, { ...cancel, processInstanceId: "Instance_2" }],
      }],
    },
    {
      ...valid,
      incidents: [{
        ...entry,
        incident: {
          ...entry.incident,
          effect: {
            ...entry.incident.effect,
            id: { ...entry.incident.effect.id, elementId: "Other" },
          },
        },
      }],
    },
    {
      ...valid,
      incidents: [{
        ...entry,
        incident: {
          ...entry.incident,
          effect: {
            ...entry.incident.effect,
            arguments: [{
              name: "unapprovedArgument",
              value: { kind: "string", value: "present" },
            }],
          },
        },
      }],
    },
    { ...valid, incidents: [entry, entry] },
    { ...valid, status: ProcessStatus.Completed },
  ]) {
    assert.equal(isTemporalIncidentOperationsSnapshot(malformed), false);
    assert.throws(
      () => requireTemporalIncidentOperationsSnapshot(malformed),
      /malformed incident-operations snapshot/,
    );
  }
});

function runningSnapshot(): Exclude<TemporalIncidentOperationsSnapshot, null> {
  const effectId = {
    processInstanceId: "Instance_1",
    elementId: "ServiceTask_Record",
    activation: 1,
  } as const;
  const incidentId = { effectId, generation: 1 } as const;
  return {
    instanceId: "Instance_1",
    status: ProcessStatus.Running,
    incidents: [{
      incident: {
        kind: "effectExecutionFailed",
        id: incidentId,
        effect: {
          id: effectId,
          descriptor: { protocol: "activity", operation: "probe" },
          arguments: [],
        },
      },
      interactions: [{
        kind: StimulusKind.RetryIncident,
        incidentId,
      }],
    }],
  };
}
