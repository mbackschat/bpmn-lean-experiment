import assert from "node:assert/strict";
import test from "node:test";

import {
  ControlStateKind,
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import {
  isCancelledProcessReceipt,
  isCompletedProcessReceipt,
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
      [],
    );
    assert.equal(result.finalState.status, status);
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
