import assert from "node:assert/strict";
import test from "node:test";

import {
  ProcessStatus,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  bpmnWorkflowChainProtocolV1,
  buildWorkflowChainRecoveryRequest,
  decodeWorkflowTerminalResult,
  processTerminalReceiptFormatV1,
  requireTerminalProcessReceipt,
  requireWorkflowTerminalResultV1,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
  workflowTerminalResultFormatV1,
} from "../dist/index.js";
import type {
  BpmnProcessWorkflow,
} from "../dist/index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;

const rawWorkflowResultIsOpaque: Equal<
  Awaited<ReturnType<BpmnProcessWorkflow>>,
  unknown
> = true;
void rawWorkflowResultIsOpaque;

const processInstanceId = "Instance_1";
const commandId = "Command_1";

test("keeps the public v1 terminal receipt recursively free of host recovery facts", () => {
  const receipt = terminalReceipt(ProcessStatus.Completed);
  assert.deepEqual(requireTerminalProcessReceipt(receipt), receipt);
  assert.equal(receipt.format, processTerminalReceiptFormatV1);
  assert.deepEqual(findForbiddenKeys(receipt), []);

  const decoded = decodeWorkflowTerminalResult(workflowResult(receipt));
  assert.deepEqual(decoded.receipt, receipt);
  assert.deepEqual(decoded.recoveryEntries, [recoveryEntry()]);
  assert.deepEqual(decoded.legacyMessageDeliveryRecords, []);
  assert.deepEqual(findForbiddenKeys(decoded.receipt), []);
});

test("accepts only terminal-empty sequential Multi-Instance progress", () => {
  const receipt = terminalReceipt(ProcessStatus.Completed);
  const withClosedMultiInstance = {
    ...receipt,
    finalState: { ...receipt.finalState, openMultiInstances: [] },
  };

  assert.deepEqual(
    requireTerminalProcessReceipt(withClosedMultiInstance),
    withClosedMultiInstance,
  );
  assert.throws(
    () => requireTerminalProcessReceipt({
      ...receipt,
      finalState: { ...receipt.finalState, openMultiInstances: [{}] },
    }),
    /malformed terminal Process receipt/u,
  );
});

test("rejects substituted receipt identity and duplicate recovery command IDs", () => {
  const receipt = terminalReceipt(ProcessStatus.Completed);
  const result = workflowResult(receipt);
  assert.throws(
    () => requireWorkflowTerminalResultV1({
      ...result,
      receipt: { ...receipt, processInstanceId: "Instance_2" },
    }),
    /receipt|identity|instance/u,
  );
  assert.throws(
    () => requireWorkflowTerminalResultV1({
      ...result,
      entries: [
        recoveryEntry(),
        { ...recoveryEntry(), stimulusSha256: "b".repeat(64) },
      ],
    }),
    /duplicate.*command/iu,
  );
});

test("rejects nested accessors without invoking them", () => {
  for (const target of ["receipt", "entry"] as const) {
    let getterCalls = 0;
    const receipt = terminalReceipt(ProcessStatus.Completed);
    const result = workflowResult(receipt);
    const nested = target === "receipt"
      ? receipt.definition
      : result.entries[0];
    Object.defineProperty(nested, "surplus", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "must not run";
      },
    });
    assert.throws(
      () => requireWorkflowTerminalResultV1(result),
      /accessor|canonical|malformed|hidden/u,
    );
    assert.equal(getterCalls, 0);
  }

  const result = workflowResult(terminalReceipt(ProcessStatus.Completed));
  assert.throws(
    () => requireWorkflowTerminalResultV1({ ...result, future: true }),
    /Malformed/u,
  );
  assert.throws(
    () => requireWorkflowTerminalResultV1(
      Object.assign(Object.create({ inherited: true }), result),
    ),
    /plain objects/u,
  );
  const cyclic = { ...result, self: undefined as unknown };
  cyclic.self = cyclic;
  assert.throws(
    () => requireWorkflowTerminalResultV1(cyclic),
    /cyclic/u,
  );
});

test("normalizes exact legacy completed and cancelled receipts without exposing their Message ledger", () => {
  for (const status of [ProcessStatus.Completed, ProcessStatus.Cancelled]) {
    const expected = terminalReceipt(status);
    const legacy = legacyReceipt(status);
    const decoded = decodeWorkflowTerminalResult(legacy);
    assert.equal(
      JSON.stringify(decoded.receipt),
      JSON.stringify(expected),
    );
    assert.deepEqual(decoded.recoveryEntries, []);
    assert.deepEqual(
      decoded.legacyMessageDeliveryRecords,
      legacy.messageDeliveryRecords,
    );
    assert.deepEqual(findForbiddenKeys(decoded.receipt), []);
  }

  assert.throws(
    () => decodeWorkflowTerminalResult({
      ...legacyReceipt(ProcessStatus.Completed),
      runId: "private-run",
    }),
    /malformed|legacy/u,
  );
});

test("enforces the exact terminal-envelope canonical UTF-8 byte bound", () => {
  const bound = workflowChainProductionLimit(
    WorkflowChainBudgetKind.TerminalResultEnvelopeBytes,
  );
  const exact = workflowResult(terminalReceipt(ProcessStatus.Completed));
  const currentBytes = workflowChainCanonicalUtf8ByteLength(exact);
  exact.receipt.processId += "x".repeat(bound - currentBytes);
  assert.equal(workflowChainCanonicalUtf8ByteLength(exact), bound);
  assert.deepEqual(requireWorkflowTerminalResultV1(exact), exact);

  exact.receipt.processId += "é";
  assert.equal(workflowChainCanonicalUtf8ByteLength(exact), bound + 2);
  assert.throws(
    () => requireWorkflowTerminalResultV1(exact),
    /terminalResultEnvelopeBytes.*196608.*196610/u,
  );
});

test("enforces both recovery-entry bounds before returning an envelope", () => {
  const receipt = terminalReceipt(ProcessStatus.Completed);
  assert.throws(
    () => requireWorkflowTerminalResultV1({
      format: workflowTerminalResultFormatV1,
      receipt,
      entries: Array.from({ length: 513 }, (_, index) => ({
        ...recoveryEntry(),
        commandId: `Command_${index}`,
      })),
    }),
    /entry count/u,
  );
  assert.throws(
    () => requireWorkflowTerminalResultV1({
      format: workflowTerminalResultFormatV1,
      receipt,
      entries: [{ ...recoveryEntry(), commandId: "é".repeat(50_000) }],
    }),
    /commandRecoveryLedgerBytes/u,
  );
});

test("builds recovery identity only for externally retryable stimuli", () => {
  const completeUserTask = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId: {
      processInstanceId,
      elementId: "UserTask_1",
      activation: 1,
    },
    submittedValues: [],
  } as const;
  assert.deepEqual(
    buildWorkflowChainRecoveryRequest(processInstanceId, completeUserTask),
    {
      protocol: bpmnWorkflowChainProtocolV1,
      processInstanceId,
      commandId,
      stimulusSha256:
        "9a3d58ca4d23fc3cef842f783fae6d79235b593266383cf4e6b0e3ad127e2acc",
    },
  );
  const occurrence = {
    processInstanceId,
    elementId: "Element_1",
    activation: 1,
  } as const;
  for (const stimulus of [
    {
      kind: StimulusKind.DeliverMessage,
      commandId: "Message_1",
      subscriptionId: occurrence,
      channel: { kind: "directMessage", messageId: "Message" },
    },
    {
      kind: StimulusKind.DeliverCorrelatedPayloadMessage,
      commandId: "CorrelatedMessage_1",
      address: {
        definition: {
          compiler: "bpmn-source-semantic-process",
          semanticProfile: "message-key-correlation-checkpoint",
          sourceId: "settlement-confirmation",
          sourceSha256: "a".repeat(64),
          sourceOverlay: null,
        },
        processId: "Process_SettlementConfirmation",
        channel: {
          kind: "operationMessage",
          interfaceId: "Interface_Settlement",
          interfaceOperationId: "Operation_ConfirmSettlement",
          messageId: "Message_SettlementConfirmed",
        },
        correlationKeyId: "CorrelationKey_Settlement",
      },
      ingressOrdinal: 1,
      subscriptionId: occurrence,
      correlationPropertyId: "CorrelationProperty_SettlementReference",
      processPropertyId: "Property_SettlementReference",
      payload: { kind: "string", value: "settlement-42" },
    },
    {
      kind: StimulusKind.RetryIncident,
      commandId: "Retry_1",
      incidentId: { effectId: occurrence, generation: 1 },
    },
    {
      kind: StimulusKind.CancelIncidentProcess,
      commandId: "Cancel_1",
      processInstanceId,
      incidentId: { effectId: occurrence, generation: 1 },
    },
  ] as const) {
    const request = buildWorkflowChainRecoveryRequest(processInstanceId, stimulus);
    assert.equal(request.protocol, bpmnWorkflowChainProtocolV1);
    assert.equal(request.processInstanceId, processInstanceId);
    assert.equal(request.commandId, stimulus.commandId);
    assert.match(request.stimulusSha256, /^[a-f0-9]{64}$/u);
  }

  for (const stimulus of derivedStimuli()) {
    assert.throws(
      () => (
        buildWorkflowChainRecoveryRequest as unknown as (
          instanceId: string,
          candidate: typeof stimulus,
        ) => unknown
      )(processInstanceId, stimulus),
      /externally retryable/u,
    );
  }
});

test("keeps the hosting Process identity separate from a called-Process User Task", () => {
  const stimulus = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "Complete_called_task",
    taskId: {
      processInstanceId: "called-process-17",
      elementId: "UserTask_Called",
      activation: 1,
    },
    submittedValues: [],
  } as const;
  const request = buildWorkflowChainRecoveryRequest("semantic-host-42", stimulus);
  const changedOccurrence = buildWorkflowChainRecoveryRequest(
    "semantic-host-42",
    {
      ...stimulus,
      taskId: { ...stimulus.taskId, activation: 2 },
    },
  );
  const changedHost = buildWorkflowChainRecoveryRequest(
    "semantic-host-43",
    stimulus,
  );
  assert.equal(request.processInstanceId, "semantic-host-42");
  assert.notEqual(request.stimulusSha256, changedOccurrence.stimulusSha256);
  assert.equal(request.stimulusSha256, changedHost.stimulusSha256);
  assert.equal(changedHost.processInstanceId, "semantic-host-43");
});

function workflowResult(receipt: ReturnType<typeof terminalReceipt>) {
  return {
    format: workflowTerminalResultFormatV1,
    receipt,
    entries: [recoveryEntry()],
  };
}

function recoveryEntry() {
  return {
    commandId,
    stimulusSha256: "a".repeat(64),
    outcome: "committed",
  } as const;
}

function terminalReceipt(status: ProcessStatus) {
  return {
    format: processTerminalReceiptFormatV1,
    definition: {
      compiler: "bpmn-source-semantic-process",
      semanticProfile: "profile",
      sourceId: "source",
      sourceSha256: "b".repeat(64),
      sourceOverlay: null,
    },
    processId: "Process_1",
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

function legacyReceipt(status: ProcessStatus) {
  const { format: _format, ...receipt } = terminalReceipt(status);
  return {
    ...receipt,
    messageDeliveryRecords: [{
      kind: "semantic",
      stimulus: {
        kind: StimulusKind.DeliverMessage,
        commandId: "Message_1",
        subscriptionId: {
          processInstanceId,
          elementId: "Catch_1",
          activation: 1,
        },
        channel: { kind: "directMessage", messageId: "Message" },
      },
      outcome: "committed",
    }],
  } as const;
}

function derivedStimuli() {
  const occurrence = {
    processInstanceId,
    elementId: "Element_1",
    activation: 1,
  } as const;
  return [
    {
      kind: StimulusKind.StartProcess,
      commandId,
      processId: "Process_1",
      instanceId: processInstanceId,
      initialVariables: [],
    },
    {
      kind: StimulusKind.FireTimer,
      commandId,
      timerId: occurrence,
      logicalTimeMs: 1,
    },
    {
      kind: StimulusKind.CompleteEffect,
      commandId,
      effectId: occurrence,
      result: { kind: "success", localPatch: [] },
    },
    {
      kind: StimulusKind.ReportEffectFailure,
      commandId,
      effectId: occurrence,
      generation: 1,
    },
  ] as const;
}

function findForbiddenKeys(value: unknown): string[] {
  const forbidden = new Set([
    "messageDeliveryRecords",
    "entries",
    "runId",
    "firstExecutionRunId",
    "workflowId",
    "handle",
    "client",
    "receipt",
  ]);
  const found: string[] = [];
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object") {
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    for (const [key, nested] of Object.entries(candidate)) {
      if (forbidden.has(key)) {
        found.push(key);
      }
      visit(nested);
    }
  };
  visit(value);
  return found;
}
