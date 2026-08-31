/** Workflow-chain recovery keeps semantic commands content-bound across Run boundaries. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MessageChannelKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
  QueryNotRegisteredError,
  ServiceError,
  WorkflowNotFoundError,
  WorkflowUpdateFailedError,
} from "@temporalio/client";

import {
  WorkflowChainBudgetKind,
  WorkflowChainCommandRecoveryResponseKind,
  buildWorkflowChainRecoveryRequest,
  processTerminalReceiptFormatV1,
} from "@bpmn-lean/temporal-protocol";
import {
  BpmnCommandIdentityConflict,
  BpmnWorkflowChainCapacityExhausted,
  submitMessageDeliveryAtWorkflowId,
} from "../dist/process-client.js";
import { resolveSemanticUpdate } from "../dist/semantic-update-client.js";

const processInstanceId = "Instance_1";
const workflowId = "workflow-address";
const retry = {
  kind: StimulusKind.RetryIncident,
  commandId: "retry-1",
  incidentId: {
    effectId: {
      processInstanceId,
      elementId: "ServiceTask_1",
      activation: 1,
    },
    generation: 1,
  },
} as const;
const request = buildWorkflowChainRecoveryRequest(processInstanceId, retry);

test("retries the identical Update after rollover recovery reports active", async () => {
  const calls: unknown[] = [];
  let executions = 0;
  const result = await resolveSemanticUpdate({
    client: fakeClient({
      query: async (name, candidate) => {
        calls.push({ kind: "query", name, candidate });
        return recovery(WorkflowChainCommandRecoveryResponseKind.UnknownWhileActive);
      },
      executeUpdate: async (name, options) => {
        calls.push({ kind: "update", name, options });
        executions += 1;
        if (executions === 1) {
          throw updateFailure("BpmnWorkflowRolloverInProgress");
        }
        return "committed";
      },
    }),
    workflowId,
    processInstanceId,
    stimulus: retry,
    updateName: "retry-update",
    operation: "incident retry",
  });

  assert.deepEqual(result, {
    kind: "semantic",
    commandId: retry.commandId,
    outcome: "committed",
  });
  assert.equal(executions, 2);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1], {
    kind: "query",
    name: "bpmn-workflow-chain-command-recovery",
    candidate: request,
  });
  const updateIds = calls.flatMap((call) =>
    isUpdateCall(call) ? [call.options.updateId] : []
  );
  assert.equal(updateIds.length, 2);
  assert.equal(updateIds[0], updateIds[1]);
});

test("recovers an old-Run response from the latest Workflow-ID Query", async () => {
  const calls: string[] = [];
  const addresses: unknown[][] = [];
  const result = await resolveSemanticUpdate({
    client: fakeClient({
      executeUpdate: async () => {
        calls.push("execute");
        throw notFound();
      },
      query: async () => {
        calls.push("recovery");
        return recovery(WorkflowChainCommandRecoveryResponseKind.Resolved, {
          outcome: "rolledBack",
        });
      },
      result: async () => {
        calls.push("terminal");
        throw new Error("terminal result must not be consulted");
      },
    }, addresses),
    workflowId,
    processInstanceId,
    stimulus: retry,
    updateName: "retry-update",
    operation: "incident retry",
  });

  assert.deepEqual(result, {
    kind: "semantic",
    commandId: retry.commandId,
    outcome: "rolledBack",
  });
  assert.deepEqual(calls, ["execute", "recovery"]);
  assert.deepEqual(addresses, [[workflowId]]);
});

test("rejects a substituted recovery identity", async () => {
  for (const substitution of [
    { processInstanceId: "substituted" },
    { commandId: "substituted" },
    { stimulusSha256: "b".repeat(64) },
  ]) {
    await assert.rejects(
      resolveSemanticUpdate({
        client: fakeClient({
          executeUpdate: async () => { throw notFound(); },
          query: async () => ({
            ...recovery(WorkflowChainCommandRecoveryResponseKind.Resolved, {
              outcome: "committed",
            }),
            ...substitution,
          }),
        }),
        workflowId,
        processInstanceId,
        stimulus: retry,
        updateName: "retry-update",
        operation: "incident retry",
      }),
      /identity mismatch/u,
    );
  }
});

test("returns only the public v1 receipt for terminal recovery", async () => {
  const receipt = terminalReceipt();
  const result = await resolveSemanticUpdate({
    client: fakeClient({
      executeUpdate: async () => { throw notFound(); },
      query: async () => recovery(
        WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry,
        { receipt },
      ),
    }),
    workflowId,
    processInstanceId,
    stimulus: retry,
    updateName: "retry-update",
    operation: "incident retry",
  });

  assert.deepEqual(result, {
    kind: "processClosed",
    commandId: retry.commandId,
    receipt,
  });
  assertNoPrivateChainData(result);
});

test("throws the typed validated capacity failure and lets a resolved entry win", async () => {
  const failure = {
    budget: WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
    configuredBound: 512,
    observedValue: 512,
    processInstanceId,
    publicRevision: 3,
    runOrdinal: 2,
  } as const;
  await assert.rejects(
    resolveSemanticUpdate({
      client: fakeClient({
        executeUpdate: async () => { throw notFound(); },
        query: async () => recovery(
          WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry,
          { failure },
        ),
      }),
      workflowId,
      processInstanceId,
      stimulus: retry,
      updateName: "retry-update",
      operation: "incident retry",
    }),
    (error: unknown) => {
      assert.equal(error instanceof BpmnWorkflowChainCapacityExhausted, true);
      assert.deepEqual(
        (error as BpmnWorkflowChainCapacityExhausted).details,
        failure,
      );
      assert.equal(
        (error as BpmnWorkflowChainCapacityExhausted).code,
        "BPMN_WORKFLOW_CHAIN_CAPACITY_EXHAUSTED",
      );
      return true;
    },
  );

  const resolved = await resolveSemanticUpdate({
    client: fakeClient({
      executeUpdate: async () => { throw notFound(); },
      query: async () => recovery(
        WorkflowChainCommandRecoveryResponseKind.Resolved,
        { outcome: "committed" },
      ),
      result: async () => ({
        failure,
      }),
    }),
    workflowId,
    processInstanceId,
    stimulus: retry,
    updateName: "retry-update",
    operation: "incident retry",
  });
  assert.equal(resolved.kind, "semantic");
});

test("uses retained pre-v1 Update results only when the recovery Query is absent", async () => {
  const calls: string[] = [];
  const result = await resolveSemanticUpdate({
    client: fakeClient({
      executeUpdate: async () => { throw notFound(); },
      query: async () => {
        calls.push("query");
        throw queryNotRegistered();
      },
      getUpdateResult: async () => {
        calls.push("retained");
        return "committed";
      },
      result: async () => {
        calls.push("terminal");
        throw new Error("terminal result must not be consulted");
      },
    }),
    workflowId,
    processInstanceId,
    stimulus: retry,
    updateName: "retry-update",
    operation: "incident retry",
  });
  assert.deepEqual(result, {
    kind: "semantic",
    commandId: retry.commandId,
    outcome: "committed",
  });
  assert.deepEqual(calls, ["query", "retained"]);

  const closed = await resolveSemanticUpdate({
    client: fakeClient({
      executeUpdate: async () => { throw notFound(); },
      query: async () => { throw queryNotRegistered(); },
      getUpdateResult: async () => { throw notFound(); },
      result: async () => ({
        ...legacyTerminalReceipt(),
        messageDeliveryRecords: [],
      }),
    }),
    workflowId,
    processInstanceId,
    stimulus: retry,
    updateName: "retry-update",
    operation: "incident retry",
  });
  assert.deepEqual(closed, {
    kind: "processClosed",
    commandId: retry.commandId,
    receipt: terminalReceipt(),
  });
  assertNoPrivateChainData(closed);
});

test("normalizes exact legacy Message recovery without exposing its private ledger", async () => {
  const delivery = messageDelivery();
  const result = await submitMessageDeliveryAtWorkflowId(
    fakeClient({
      signal: async () => { throw notFound(); },
      query: async (name) => {
        throw name === "bpmn-workflow-chain-command-recovery"
          ? queryNotRegistered()
          : notFound();
      },
      result: async () => ({
        ...legacyTerminalReceipt(),
        messageDeliveryRecords: [{
          kind: "semantic",
          stimulus: delivery,
          outcome: "committed",
        }],
      }),
    }),
    workflowId,
    processInstanceId,
    delivery,
  );
  assert.deepEqual(result, {
    kind: "semantic",
    commandId: delivery.commandId,
    outcome: "committed",
  });
  assertNoPrivateChainData(result);

  await assert.rejects(() =>
    submitMessageDeliveryAtWorkflowId(
      fakeClient({
        signal: async () => { throw notFound(); },
        query: async (name) => {
          throw name === "bpmn-workflow-chain-command-recovery"
            ? queryNotRegistered()
            : notFound();
        },
        result: async () => ({
          ...legacyTerminalReceipt(),
          messageDeliveryRecords: [],
          surplus: "not-the-exact-legacy-shape",
        }),
      }),
      workflowId,
      processInstanceId,
      delivery,
    )
  );
});

test("rejects a correlation registration failure whose complete address is malformed", async () => {
  const delivery = payloadMessageDelivery();
  await assert.rejects(
    submitMessageDeliveryAtWorkflowId(
      fakeClient({
        signal: async () => undefined,
        query: async () => ({
          kind: "correlationRegistrationFailed",
          stimulus: delivery,
          failure: {
            kind: "candidateCapacity",
            address: "not-a-complete-address",
            transactionId: delivery.commandId,
          },
        }),
      }),
      workflowId,
      processInstanceId,
      delivery,
    ),
    BpmnCommandIdentityConflict,
  );
});

test("keeps a Message Signal service failure as infrastructure failure", async () => {
  const serviceFailure = new ServiceError("Signal service failed");
  let queryCount = 0;
  await assert.rejects(
    submitMessageDeliveryAtWorkflowId(
      fakeClient({
        signal: async () => { throw serviceFailure; },
        query: async () => {
          queryCount += 1;
          throw new Error("recovery Query must not follow a service failure");
        },
      }),
      workflowId,
      processInstanceId,
      messageDelivery(),
    ),
    (error: unknown) => error === serviceFailure,
  );
  assert.equal(queryCount, 0);
});

test("does not convert Query or retained-result service failures into lifecycle results", async () => {
  for (const handle of [
    {
      executeUpdate: async () => { throw notFound(); },
      query: async () => { throw new Error("Query service failed"); },
    },
    {
      executeUpdate: async () => { throw notFound(); },
      query: async () => { throw queryNotRegistered(); },
      getUpdateResult: async () => { throw notFound(); },
      result: async () => { throw new Error("result service failed"); },
    },
  ]) {
    await assert.rejects(
      resolveSemanticUpdate({
        client: fakeClient(handle),
        workflowId,
        processInstanceId,
        stimulus: retry,
        updateName: "retry-update",
        operation: "incident retry",
      }),
      /failed/u,
    );
  }
});

test("keeps a non-retryable command identity conflict semantic", async () => {
  await assert.rejects(
    resolveSemanticUpdate({
      client: fakeClient({
        executeUpdate: async () => {
          throw updateFailure("BpmnCommandIdentityConflict", true);
        },
      }),
      workflowId,
      processInstanceId,
      stimulus: retry,
      updateName: "retry-update",
      operation: "incident retry",
    }),
    BpmnCommandIdentityConflict,
  );
});

type FakeHandle = Readonly<{
  query?: (name: string, request?: unknown) => Promise<unknown>;
  executeUpdate?: (name: string, options: unknown) => Promise<unknown>;
  signal?: (name: string, stimulus: unknown) => Promise<void>;
  getUpdateResult?: () => Promise<unknown>;
  result?: () => Promise<unknown>;
}>;

function fakeClient(handle: FakeHandle, addresses?: unknown[][]): never {
  return {
    getHandle: (...args: unknown[]) => {
      addresses?.push(args);
      return {
        query: handle.query ?? (async () => { throw new Error("unexpected Query"); }),
        executeUpdate: handle.executeUpdate ?? (async () => {
          throw new Error("unexpected Update");
        }),
        signal: handle.signal ?? (async () => { throw new Error("unexpected Signal"); }),
        getUpdateHandle: () => ({
          result: handle.getUpdateResult ?? (async () => {
            throw new Error("unexpected retained Update lookup");
          }),
        }),
        result: handle.result ?? (async () => {
          throw new Error("unexpected terminal result lookup");
        }),
      };
    },
  } as never;
}

function recovery(
  kind: WorkflowChainCommandRecoveryResponseKind,
  fields: Readonly<Record<string, unknown>> = {},
): unknown {
  return { ...request, kind, ...fields };
}

function updateFailure(type: string, nonRetryable = false): WorkflowUpdateFailedError {
  return new WorkflowUpdateFailedError(
    type,
    new ApplicationFailure(type, type, nonRetryable),
  );
}

function notFound(): WorkflowNotFoundError {
  return new WorkflowNotFoundError("not found", workflowId, undefined);
}

function queryNotRegistered(): QueryNotRegisteredError {
  return new QueryNotRegisteredError("not registered", 0 as never);
}

function terminalReceipt() {
  return {
    format: processTerminalReceiptFormatV1,
    definition: {
      compiler: "bpmn-source-semantic-process",
      semanticProfile: "profile",
      sourceId: "source",
      sourceSha256: "a".repeat(64),
      sourceOverlay: null,
    },
    processId: "Process_1",
    processInstanceId,
    finalState: {
      kind: "state",
      instanceId: processInstanceId,
      status: "completed",
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
  } as const;
}

function legacyTerminalReceipt() {
  const { format: _format, ...legacy } = terminalReceipt();
  return legacy;
}

function messageDelivery() {
  return {
    kind: StimulusKind.DeliverMessage,
    commandId: "deliver-1",
    subscriptionId: {
      processInstanceId,
      elementId: "Catch_1",
      activation: 1,
    },
    channel: {
      kind: MessageChannelKind.OperationMessage,
      interfaceId: "Interface_1",
      interfaceOperationId: "Operation_1",
      messageId: "Message_1",
    },
  } as const;
}

function payloadMessageDelivery() {
  return {
    ...messageDelivery(),
    kind: StimulusKind.DeliverPayloadMessage,
    payload: { kind: VariableValueKind.String, value: "key-1" },
  } as const;
}

function assertNoPrivateChainData(value: unknown): void {
  const forbidden = new Set([
    "messageDeliveryRecords",
    "runId",
    "firstExecutionRunId",
    "workflowId",
    "followRuns",
    "handle",
    "client",
    "recovery",
    "recoveryEntries",
    "entries",
    "stimulusSha256",
  ]);
  visit(value);
  function visit(candidate: unknown): void {
    assert.notEqual(candidate, "bpmn-lean.workflow-terminal-result.v1");
    if (candidate === null || typeof candidate !== "object") return;
    for (const [key, nested] of Object.entries(candidate)) {
      assert.equal(forbidden.has(key), false, `private chain field ${key}`);
      visit(nested);
    }
  }
}

function isUpdateCall(value: unknown): value is {
  options: { updateId: string };
} {
  return typeof value === "object" && value !== null &&
    (value as { kind?: unknown }).kind === "update";
}
