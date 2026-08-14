/** Incident operations use one exact hosting address and reject uncertain Query projections. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ProcessStatus,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import { WorkflowNotFoundError } from "@temporalio/client";

import {
  TemporalProcessOperationsObservationStatus,
  observeTemporalProcessIncidents,
  submitTemporalIncidentOperation,
} from "../dist/process-operations-client.js";

const hostingProcessInstanceId = "semantic-host-42";
const configuredScheduleBase = "configured-schedule-base";
const executionWorkflowId = "service-returned-execution-42";
const incident = {
  kind: "effectExecutionFailed",
  id: {
    effectId: {
      processInstanceId: hostingProcessInstanceId,
      elementId: "ServiceTask_Charge",
      activation: 3,
    },
    generation: 1,
  },
  effect: {
    id: {
      processInstanceId: hostingProcessInstanceId,
      elementId: "ServiceTask_Charge",
      activation: 3,
    },
    descriptor: {
      protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
      operation: "urn:bpmn-lean:effect-operation:probe-v1",
    },
    arguments: [],
  },
} as const;
const retry = {
  kind: StimulusKind.RetryIncident,
  incidentId: incident.id,
} as const;
const cancel = {
  kind: StimulusKind.CancelIncidentProcess,
  processInstanceId: hostingProcessInstanceId,
  incidentId: incident.id,
} as const;
const runningSnapshot = {
  instanceId: hostingProcessInstanceId,
  status: ProcessStatus.Running,
  incidents: [{ incident, interactions: [retry, cancel] }],
} as const;

test("queries only the service-returned Schedule execution address", async () => {
  const queries: Array<Readonly<{ workflowId: string; queryName: string }>> = [];
  const client = fakeClient({
    [executionWorkflowId]: {
      query: async (queryName) => {
        queries.push({ workflowId: executionWorkflowId, queryName });
        return runningSnapshot;
      },
    },
  });

  assert.deepEqual(
    await observeTemporalProcessIncidents(
      client,
      configuredScheduleBase,
      hostingProcessInstanceId,
    ),
    { status: TemporalProcessOperationsObservationStatus.Unknown },
  );
  assert.deepEqual(
    await observeTemporalProcessIncidents(
      client,
      executionWorkflowId,
      hostingProcessInstanceId,
    ),
    {
      status: TemporalProcessOperationsObservationStatus.Observed,
      incidents: runningSnapshot.incidents,
    },
  );
  assert.equal(queries.length, 1);
  assert.equal(queries[0]?.workflowId, executionWorkflowId);
  assert.match(queries[0]?.queryName ?? "", /incident/u);
});

test("accepts a running zero-incident snapshot and rejects malformed interactions", async () => {
  const client = fakeClient({
    empty: {
      query: async () => ({
        instanceId: hostingProcessInstanceId,
        status: ProcessStatus.Running,
        incidents: [],
      }),
    },
    reordered: {
      query: async () => ({
        ...runningSnapshot,
        incidents: [{ incident, interactions: [cancel, retry] }],
      }),
    },
    crossIncident: {
      query: async () => ({
        ...runningSnapshot,
        incidents: [{
          incident,
          interactions: [{
            ...retry,
            incidentId: {
              ...retry.incidentId,
              effectId: {
                ...retry.incidentId.effectId,
                activation: 4,
              },
            },
          }],
        }],
      }),
    },
    transient: { query: async () => null },
    transport: { query: async () => { throw new Error("transport unavailable"); } },
  });

  assert.deepEqual(
    await observeTemporalProcessIncidents(client, "empty", hostingProcessInstanceId),
    {
      status: TemporalProcessOperationsObservationStatus.Observed,
      incidents: [],
    },
  );
  for (const workflowId of [
    "reordered",
    "crossIncident",
    "transient",
    "transport",
  ]) {
    assert.deepEqual(
      await observeTemporalProcessIncidents(client, workflowId, hostingProcessInstanceId),
      { status: TemporalProcessOperationsObservationStatus.Unavailable },
    );
  }
});

test("corroborates terminal Query status with the exact retained receipt", async () => {
  const client = fakeClient({
    completed: terminalHandle(
      ProcessStatus.Completed,
      terminalReceipt(hostingProcessInstanceId, ProcessStatus.Completed),
    ),
    identityMismatch: terminalHandle(
      ProcessStatus.Completed,
      terminalReceipt("different-host", ProcessStatus.Completed),
    ),
    statusMismatch: terminalHandle(
      ProcessStatus.Completed,
      terminalReceipt(hostingProcessInstanceId, ProcessStatus.Cancelled),
    ),
    retainedOnly: {
      query: async () => { throw notFound("retainedOnly"); },
      result: async () => terminalReceipt(
        hostingProcessInstanceId,
        ProcessStatus.Cancelled,
      ),
    },
  });

  assert.deepEqual(
    await observeTemporalProcessIncidents(client, "completed", hostingProcessInstanceId),
    { status: TemporalProcessOperationsObservationStatus.Closed },
  );
  assert.deepEqual(
    await observeTemporalProcessIncidents(client, "retainedOnly", hostingProcessInstanceId),
    { status: TemporalProcessOperationsObservationStatus.Closed },
  );
  for (const workflowId of ["identityMismatch", "statusMismatch"]) {
    assert.deepEqual(
      await observeTemporalProcessIncidents(client, workflowId, hostingProcessInstanceId),
      { status: TemporalProcessOperationsObservationStatus.Unavailable },
    );
  }
});

test("preserves exact Retry and Cancel submissions at the supplied Workflow address", async () => {
  const calls: unknown[] = [];
  const client = fakeClient({
    [executionWorkflowId]: {
      executeUpdate: async (name, options) => {
        calls.push({ name, options });
        return "committed";
      },
      getUpdateHandle: () => ({ result: async () => "committed" }),
      result: async () => terminalReceipt(
        hostingProcessInstanceId,
        ProcessStatus.Cancelled,
      ),
    },
  });
  const retryStimulus = {
    ...retry,
    commandId: "retry-action-42",
  } as const;
  const cancelStimulus = {
    ...cancel,
    commandId: "cancel-action-42",
  } as const;

  assert.deepEqual(
    await submitTemporalIncidentOperation(
      client,
      executionWorkflowId,
      hostingProcessInstanceId,
      retryStimulus,
    ),
    { kind: "semantic", commandId: retryStimulus.commandId, outcome: "committed" },
  );
  assert.deepEqual(
    await submitTemporalIncidentOperation(
      client,
      executionWorkflowId,
      hostingProcessInstanceId,
      cancelStimulus,
    ),
    { kind: "semantic", commandId: cancelStimulus.commandId, outcome: "committed" },
  );
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(calls).includes(configuredScheduleBase), false);
  assert.equal(JSON.stringify(calls).includes(retryStimulus.commandId), true);
  assert.equal(JSON.stringify(calls).includes(cancelStimulus.commandId), true);
});

test("preserves semantic, closed, and unknown command classifications", async () => {
  const client = fakeClient({
    rejected: {
      executeUpdate: async () => "rolledBack",
    },
    closed: absentActionHandle(async () => terminalReceipt(
      hostingProcessInstanceId,
      ProcessStatus.Cancelled,
    )),
    unknown: absentActionHandle(async () => { throw notFound("unknown"); }),
  });
  const retryStimulus = { ...retry, commandId: "retry-result" } as const;
  const cancelStimulus = { ...cancel, commandId: "cancel-result" } as const;

  assert.deepEqual(
    await submitTemporalIncidentOperation(
      client,
      "rejected",
      hostingProcessInstanceId,
      retryStimulus,
    ),
    { kind: "semantic", commandId: "retry-result", outcome: "rolledBack" },
  );
  assert.deepEqual(
    await submitTemporalIncidentOperation(
      client,
      "closed",
      hostingProcessInstanceId,
      cancelStimulus,
    ),
    {
      kind: "processClosed",
      commandId: "cancel-result",
      receipt: terminalReceipt(hostingProcessInstanceId, ProcessStatus.Cancelled),
    },
  );
  assert.deepEqual(
    await submitTemporalIncidentOperation(
      client,
      "unknown",
      hostingProcessInstanceId,
      retryStimulus,
    ),
    {
      kind: "processUnknown",
      commandId: "retry-result",
      processInstanceId: hostingProcessInstanceId,
    },
  );
});

type FakeHandle = Readonly<{
  query?: (name: string) => Promise<unknown>;
  executeUpdate?: (name: string, options: unknown) => Promise<unknown>;
  getUpdateHandle?: (updateId: string) => Readonly<{ result: () => Promise<unknown> }>;
  result?: () => Promise<unknown>;
}>;

function fakeClient(handles: Readonly<Record<string, FakeHandle>>): never {
  return {
    getHandle: (workflowId: string) => handles[workflowId] ?? {
      query: async () => { throw notFound(workflowId); },
      result: async () => { throw notFound(workflowId); },
    },
  } as never;
}

function terminalHandle(
  status: ProcessStatus.Completed | ProcessStatus.Cancelled,
  receipt: unknown,
): FakeHandle {
  return {
    query: async () => ({
      instanceId: hostingProcessInstanceId,
      status,
      incidents: [],
    }),
    result: async () => receipt,
  };
}

function notFound(workflowId: string): WorkflowNotFoundError {
  return new WorkflowNotFoundError("not found", workflowId, undefined);
}

function terminalReceipt(
  processInstanceId: string,
  status: ProcessStatus.Completed | ProcessStatus.Cancelled,
): unknown {
  return {
    definition: {
      compiler: "bpmn-source-semantic-process",
      semanticProfile: "profile",
      sourceId: "source",
      sourceSha256: "a".repeat(64),
      sourceOverlay: null,
    },
    processId: "Process_Charge",
    processInstanceId,
    finalState: {
      kind: "state",
      instanceId: processInstanceId,
      status,
      activeWaits: [],
      openUserTasks: [],
      openMessageSubscriptions: [],
      openTimers: [],
      openEffects: [],
      openIncidents: [],
      variables: [],
      enabledInteractions: [],
      logicalTimeMs: 0,
    },
    messageDeliveryRecords: [],
  };
}

function absentActionHandle(result: () => Promise<unknown>): FakeHandle {
  return {
    executeUpdate: async () => { throw notFound("absent-action"); },
    getUpdateHandle: () => ({
      result: async () => { throw notFound("absent-action"); },
    }),
    result,
  };
}
