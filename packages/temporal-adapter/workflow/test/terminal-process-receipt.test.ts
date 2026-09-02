import assert from "node:assert/strict";
import test from "node:test";

import {
  ControlStateKind,
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import {
  isCancelledProcessReceipt,
  isCompletedProcessReceipt,
  isFailedProcessReceipt,
  processTerminalReceiptFormatV1,
} from "@bpmn-lean/temporal-protocol";
import {
  isTerminalProcessState,
  terminalProcessReceipt,
} from "../dist/terminal-process-receipt.js";

test("constructs distinct exact receipts for both ordinary terminal states", () => {
  for (const [controlKind, status] of [
    [ControlStateKind.Completed, ProcessStatus.Completed],
    [ControlStateKind.Cancelled, ProcessStatus.Cancelled],
  ] as const) {
    const state = { control: { kind: controlKind, instanceId: "Instance_1" } };
    assert.equal(isTerminalProcessState(state as never), true);
    const result = terminalProcessReceipt(
      {
        identity: {
          compiler: "bpmn-source-semantic-process",
          semanticProfile: "profile",
          sourceId: "source",
          sourceSha256: "a".repeat(64),
          sourceOverlay: null,
        },
        processId: "Process_1",
      } as never,
      "Instance_1",
      state as never,
      [terminalState(status)],
    );
    assert.equal(result.format, processTerminalReceiptFormatV1);
    assert.equal(result.finalState.status, status);
    assert.equal("messageDeliveryRecords" in result, false);
    assert.equal(
      isCompletedProcessReceipt(result),
      status === ProcessStatus.Completed,
    );
    assert.equal(
      isCancelledProcessReceipt(result),
      status === ProcessStatus.Cancelled,
    );
  }
});

test("constructs failed only from byte-identical failed control and observation", () => {
  const failure = compensationFailure();
  const state = {
    control: {
      kind: ControlStateKind.Failed,
      instanceId: "Instance_1",
      failure,
    },
  };
  const observation = {
    ...terminalState(ProcessStatus.Completed),
    status: ProcessStatus.Failed,
    failure,
  } as const;
  const receipt = terminalProcessReceipt(
    {
      identity: {
        compiler: "bpmn-source-semantic-process",
        semanticProfile: "profile",
        sourceId: "source",
        sourceSha256: "a".repeat(64),
        sourceOverlay: null,
      },
      processId: "Process_1",
    } as never,
    "Instance_1",
    state as never,
    [observation],
  );
  assert.equal(isTerminalProcessState(state as never), true);
  assert.equal(isFailedProcessReceipt(receipt), true);
  assert.deepEqual(receipt.finalState, observation);

  assert.throws(
    () => terminalProcessReceipt(
      { identity: receipt.definition, processId: receipt.processId } as never,
      "Instance_1",
      state as never,
      [{
        ...observation,
        failure: { ...failure, code: "different-code" },
      }],
    ),
    /matching final observation/u,
  );
});

function terminalState(status: ProcessStatus.Completed | ProcessStatus.Cancelled) {
  return {
    kind: "state" as const,
    instanceId: "Instance_1",
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
  };
}

function compensationFailure() {
  const handlerId = {
    processInstanceId: "Instance_1",
    elementId: "Undo_Activity",
    activation: 1,
  } as const;
  return {
    kind: "compensationHandlerFailure",
    triggerId: {
      processInstanceId: "Instance_1",
      elementId: "operation:ThrowCompensation",
      activation: 1,
    },
    handlerId,
    effectId: { ...handlerId, elementId: "Effect_Undo_Activity" },
    code: "compensation-rejected",
    message: null,
  } as const;
}
