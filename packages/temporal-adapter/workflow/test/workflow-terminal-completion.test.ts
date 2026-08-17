import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  MessageChannelKind,
  ProcessStatus,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import {
  decodeWorkflowTerminalResult,
  MessageDeliveryResolutionKind,
  processTerminalReceiptFormatV1,
  workflowTerminalResultFormatV1,
} from "@bpmn-lean/temporal-protocol";

import {
  WorkflowCommandRecoveryLedger,
  WorkflowCommandRecoveryPreflightKind,
} from "../dist/workflow-command-recovery.js";
import {
  requireWorkflowTerminalResultForExecution,
  terminalWorkflowResult,
} from "../dist/workflow-terminal-completion.js";

const processInstanceId = "Instance_1";
const semanticProcess = {
  identity: {
    compiler: "bpmn-source-semantic-process",
    semanticProfile: "profile",
    sourceId: "source",
    sourceSha256: "a".repeat(64),
    sourceOverlay: null,
  },
  processId: "Process_1",
} as const;
const terminalState = {
  control: { kind: ControlStateKind.Completed, instanceId: processInstanceId },
};
const finalObservation = {
  kind: "state",
  instanceId: processInstanceId,
  status: ProcessStatus.Completed,
  activeWaits: [],
  openUserTasks: [],
  openMessageSubscriptions: [],
  openTimers: [],
  openEffects: [],
  openIncidents: [],
  variables: [],
  enabledInteractions: [],
  logicalTimeMs: 0,
} as const;

test("builds an exact new terminal envelope from the recovery ledger", () => {
  const recovery = resolvedRecoveryLedger();
  const result = terminalWorkflowResult(
    semanticProcess as never,
    processInstanceId,
    terminalState as never,
    [finalObservation] as never,
    [],
    recovery,
  );

  assert.equal(result.format, workflowTerminalResultFormatV1);
  assert.equal(result.receipt.format, processTerminalReceiptFormatV1);
  assert.deepEqual(result.entries, recovery.snapshot());
  assert.deepEqual(findKeys(result, "messageDeliveryRecords"), []);
});

test("rejects terminal envelopes that drift from execution identity or recovery", () => {
  const recovery = resolvedRecoveryLedger();
  const result = terminalWorkflowResult(
    semanticProcess as never,
    processInstanceId,
    terminalState as never,
    [finalObservation] as never,
    [],
    recovery,
  );

  assert.throws(
    () => requireWorkflowTerminalResultForExecution(
      {
        ...result,
        receipt: {
          ...result.receipt,
          definition: { ...result.receipt.definition, sourceId: "other-source" },
        },
      },
      semanticProcess as never,
      processInstanceId,
      recovery,
    ),
    /identity/u,
  );
  assert.throws(
    () => requireWorkflowTerminalResultForExecution(
      { ...result, entries: [] },
      semanticProcess as never,
      processInstanceId,
      recovery,
    ),
    /recovery.*snapshot/u,
  );
  assert.throws(
    () => requireWorkflowTerminalResultForExecution(
      {
        ...result,
        receipt: { ...result.receipt, messageDeliveryRecords: [] },
      },
      semanticProcess as never,
      processInstanceId,
      recovery,
    ),
    /receipt|malformed/iu,
  );
});

test("keeps retained two-argument results exact while public facts normalize identically", () => {
  const legacy = terminalWorkflowResult(
    semanticProcess as never,
    processInstanceId,
    terminalState as never,
    [finalObservation] as never,
    [],
    null,
  );
  const current = terminalWorkflowResult(
    semanticProcess as never,
    processInstanceId,
    terminalState as never,
    [finalObservation] as never,
    [],
    new WorkflowCommandRecoveryLedger(),
  );

  assert.equal(
    JSON.stringify(legacy),
    JSON.stringify({
      definition: semanticProcess.identity,
      processId: semanticProcess.processId,
      processInstanceId,
      finalState: finalObservation,
      messageDeliveryRecords: [],
    }),
  );
  assert.deepEqual(
    decodeWorkflowTerminalResult(legacy).receipt,
    current.receipt,
  );
});

test("keeps Message history out of new results while recording its recovery outcome once", () => {
  const stimulus = {
    kind: StimulusKind.DeliverMessage,
    commandId: "MessageCommand_1",
    subscriptionId: {
      processInstanceId,
      elementId: "CatchEvent_1",
      activation: 1,
    },
    channel: {
      kind: MessageChannelKind.DirectMessage,
      messageId: "Message_1",
    },
  } as const;
  const recovery = new WorkflowCommandRecoveryLedger();
  const preflight = recovery.preflight(stimulus);
  if (preflight.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
    assert.fail("test Message command was not admitted");
  }
  recovery.record(preflight.admission, CommandOutcome.Committed);
  const messageRecords = [{
    kind: MessageDeliveryResolutionKind.Semantic,
    stimulus,
    outcome: CommandOutcome.Committed,
  }] as const;

  const current = terminalWorkflowResult(
    semanticProcess as never,
    processInstanceId,
    terminalState as never,
    [finalObservation] as never,
    messageRecords,
    recovery,
  );
  const legacy = terminalWorkflowResult(
    semanticProcess as never,
    processInstanceId,
    terminalState as never,
    [finalObservation] as never,
    messageRecords,
    null,
  );

  assert.equal(current.entries.length, 1);
  assert.deepEqual(current.entries, recovery.snapshot());
  assert.deepEqual(findKeys(current, "messageDeliveryRecords"), []);
  assert.deepEqual(legacy.messageDeliveryRecords, messageRecords);
});

function resolvedRecoveryLedger(): WorkflowCommandRecoveryLedger {
  const recovery = new WorkflowCommandRecoveryLedger();
  const stimulus = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "Command_1",
    taskId: {
      processInstanceId,
      elementId: "UserTask_1",
      activation: 1,
    },
    submittedValues: [],
  } as const;
  const preflight = recovery.preflight(stimulus);
  if (preflight.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
    assert.fail("test command was not admitted");
  }
  recovery.record(preflight.admission, CommandOutcome.Committed);
  return recovery;
}

function findKeys(value: unknown, target: string): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }
  const record = value as Record<string, unknown>;
  return Object.keys(record).flatMap((key) => [
    ...(key === target ? [key] : []),
    ...findKeys(record[key], target),
  ]);
}
