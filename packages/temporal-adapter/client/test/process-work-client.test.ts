/** Process Work addressing uses the exact hosting Workflow and never infers closure from absence. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  StimulusKind,
  UserTaskLifecycleState,
} from "@bpmn-lean/semantic-core";
import { processTerminalReceiptFormatV1 } from "@bpmn-lean/temporal-protocol";
import { WorkflowNotFoundError } from "@temporalio/client";

import {
  TemporalProcessWorkDetailStatus,
  TemporalProcessWorkObservationStatus,
  completeTemporalProcessWork,
  observeTemporalProcessWork,
  readTemporalProcessWorkDetail,
} from "../dist/process-work-client.js";

const hostingProcessInstanceId = "semantic-host-42";
const configuredScheduleBase = "configured-schedule-base";
const executionWorkflowId = "service-returned-execution-42";
const task = {
  id: {
    processInstanceId: "called-process-17",
    elementId: "UserTask_Review",
    activation: 3,
  },
  name: "Review",
  state: UserTaskLifecycleState.Active,
} as const;

test("uses the service-returned Schedule execution address rather than its configured base", async () => {
  const queries: string[] = [];
  const client = fakeClient({
    [executionWorkflowId]: {
      query: async () => {
        queries.push(executionWorkflowId);
        return [task];
      },
    },
  });

  assert.deepEqual(
    await observeTemporalProcessWork(
      client,
      configuredScheduleBase,
      hostingProcessInstanceId,
    ),
    { status: TemporalProcessWorkObservationStatus.Unknown },
  );
  assert.deepEqual(
    await observeTemporalProcessWork(
      client,
      executionWorkflowId,
      hostingProcessInstanceId,
    ),
    {
      status: TemporalProcessWorkObservationStatus.Open,
      openUserTasks: [task],
    },
  );
  assert.deepEqual(queries, [executionWorkflowId]);
});

test("reads exact task detail and submits every command-result arm against the same address", async () => {
  const detail = {
    task,
    inputVariables: [{ name: "approved", value: { kind: "boolean", value: false } }],
  } as const;
  const calls: unknown[] = [];
  const client = fakeClient({
    [executionWorkflowId]: {
      query: async (_name, request) => {
        calls.push({ kind: "query", request });
        return detail;
      },
      executeUpdate: async (_name, options) => {
        calls.push({ kind: "update", options });
        return "committed";
      },
      getUpdateHandle: () => ({ result: async () => "committed" }),
      result: async () => completedResult(hostingProcessInstanceId),
    },
    closedExecution: absentCompletionHandle(async () => completedResult(hostingProcessInstanceId)),
    unknownExecution: absentCompletionHandle(async () => {
      throw notFound("unknownExecution");
    }),
  });
  const request = { taskId: task.id, inputVariableNames: ["approved"] };

  assert.deepEqual(
    await readTemporalProcessWorkDetail(
      client,
      executionWorkflowId,
      hostingProcessInstanceId,
      request,
    ),
    { status: TemporalProcessWorkDetailStatus.Found, detail },
  );

  const completion = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "completion-42",
    taskId: task.id,
    submittedValues: [{ name: "approved", value: { kind: "boolean", value: true } }],
  } as const;
  assert.deepEqual(
    await completeTemporalProcessWork(
      client,
      executionWorkflowId,
      hostingProcessInstanceId,
      completion,
    ),
    { kind: "semantic", commandId: "completion-42", outcome: "committed" },
  );
  assert.deepEqual(
    await completeTemporalProcessWork(
      client,
      "closedExecution",
      hostingProcessInstanceId,
      completion,
    ),
    {
      kind: "processClosed",
      commandId: "completion-42",
      receipt: completedReceipt(hostingProcessInstanceId),
    },
  );
  assert.deepEqual(
    await completeTemporalProcessWork(
      client,
      "unknownExecution",
      hostingProcessInstanceId,
      completion,
    ),
    {
      kind: "processUnknown",
      commandId: "completion-42",
      processInstanceId: hostingProcessInstanceId,
    },
  );
  assert.equal(JSON.stringify(calls).includes("private-handle"), false);
});

test("classifies matching retained closure, unresolved absence, and infrastructure loss", async () => {
  const closed = fakeClient({
    closed: {
      query: async () => {
        throw notFound("closed");
      },
      result: async () => completedResult(hostingProcessInstanceId),
    },
    mismatch: {
      query: async () => {
        throw notFound("mismatch");
      },
      result: async () => completedResult("different-host"),
    },
    cancelled: {
      query: async () => {
        throw notFound("cancelled");
      },
      result: async () => terminalResult(hostingProcessInstanceId, "cancelled"),
    },
    unavailable: {
      query: async () => {
        throw new Error("transport down");
      },
    },
  });

  assert.deepEqual(
    await observeTemporalProcessWork(closed, "closed", hostingProcessInstanceId),
    { status: TemporalProcessWorkObservationStatus.Closed },
  );
  assert.deepEqual(
    await observeTemporalProcessWork(closed, "cancelled", hostingProcessInstanceId),
    { status: TemporalProcessWorkObservationStatus.Closed },
  );
  assert.deepEqual(
    await observeTemporalProcessWork(closed, "missing", hostingProcessInstanceId),
    { status: TemporalProcessWorkObservationStatus.Unknown },
  );
  assert.deepEqual(
    await observeTemporalProcessWork(closed, "mismatch", hostingProcessInstanceId),
    { status: TemporalProcessWorkObservationStatus.Unavailable },
  );
  assert.deepEqual(
    await observeTemporalProcessWork(closed, "unavailable", hostingProcessInstanceId),
    { status: TemporalProcessWorkObservationStatus.Unavailable },
  );
});

type FakeHandle = Readonly<{
  query?: (name: string, request?: unknown) => Promise<unknown>;
  executeUpdate?: (name: string, options: unknown) => Promise<unknown>;
  getUpdateHandle?: (updateId: string) => Readonly<{ result: () => Promise<unknown> }>;
  result?: () => Promise<unknown>;
}>;

function fakeClient(handles: Readonly<Record<string, FakeHandle>>): never {
  return {
    getHandle: (workflowId: string) => handles[workflowId] ?? {
      privateHandle: "private-handle",
      query: async () => {
        throw notFound(workflowId);
      },
      result: async () => {
        throw notFound(workflowId);
      },
    },
  } as never;
}

function notFound(workflowId: string): WorkflowNotFoundError {
  return new WorkflowNotFoundError("not found", workflowId, undefined);
}

function completedReceipt(processInstanceId: string): unknown {
  return terminalReceipt(processInstanceId, "completed");
}

function terminalReceipt(processInstanceId: string, status: string): unknown {
  return {
    format: processTerminalReceiptFormatV1,
    definition: {
      compiler: "bpmn-source-semantic-process",
      semanticProfile: "profile",
      sourceId: "source",
      sourceSha256: "a".repeat(64),
      sourceOverlay: null,
    },
    processId: "Process_Review",
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
  };
}

function completedResult(processInstanceId: string): unknown {
  return terminalResult(processInstanceId, "completed");
}

function terminalResult(processInstanceId: string, status: string): unknown {
  const { format: _format, ...receipt } = terminalReceipt(
    processInstanceId,
    status,
  ) as Record<string, unknown>;
  return { ...receipt, messageDeliveryRecords: [] };
}

function absentCompletionHandle(result: () => Promise<unknown>): FakeHandle {
  return {
    executeUpdate: async () => {
      throw notFound("absent-completion");
    },
    query: async () => {
      throw notFound("absent-completion");
    },
    getUpdateHandle: () => ({
      result: async () => {
        throw notFound("absent-completion");
      },
    }),
    result,
  };
}
