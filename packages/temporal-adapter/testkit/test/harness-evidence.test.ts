/**
 * Verifies the harness-only evidence extraction boundary.
 *
 * Query transports replay-reconstructed semantic state; durable Update results and the completed receipt independently bind its command outcomes and terminal state.
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  SemanticProcessCompilerId,
  StimulusKind,
  WaitKind,
} from "@bpmn-lean/semantic-core";

import type {
  CanonicalObservation,
} from "@bpmn-lean/semantic-core";

import {
  isCompletedProcessReceipt,
  reconcileHarnessTraceEvidence,
} from "@bpmn-lean/temporal-testkit";
import type {
  CompletedProcessReceipt,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

const completion = {
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-task",
  taskId: {
    processInstanceId: "Instance_1",
    elementId: "Task_1",
    activation: 1,
  },
  submittedValues: [],
};
const completedState: CompletedProcessReceipt["finalState"] = {
  kind: CanonicalObservationKind.State,
  instanceId: "Instance_1",
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
};
const trace: ReadonlyArray<CanonicalObservation> = [
  {
    kind: CanonicalObservationKind.Deployment,
    outcome: CommandOutcome.Committed,
  },
  {
    kind: CanonicalObservationKind.Command,
    commandId: "start-process",
    outcome: CommandOutcome.Committed,
  },
  {
    kind: CanonicalObservationKind.State,
    instanceId: "Instance_1",
    status: ProcessStatus.Running,
    activeWaits: [
      {
        elementId: "Task_1",
        kind: WaitKind.UserTask,
        multiplicity: 1,
      },
    ],
    openUserTasks: [],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    openIncidents: [],
    variables: [],
    enabledInteractions: [],
    logicalTimeMs: 0,
  },
  {
    kind: CanonicalObservationKind.Command,
    commandId: completion.commandId,
    outcome: CommandOutcome.Committed,
  },
  completedState,
];
const receipt: CompletedProcessReceipt = {
  definition: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "profile",
    sourceId: "source",
    sourceSha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sourceOverlay: null,
  },
  processId: "Process_1",
  processInstanceId: "Instance_1",
  finalState: completedState,
  messageDeliveryRecords: [],
};

test("requires canonical Process variables in a completed receipt", () => {
  assert.equal(isCompletedProcessReceipt(receipt), true);
  // A receipt without canonical Process variables cannot be expressed by the
  // contract, so this perturbation deliberately leaves it: the runtime guard
  // must reject it rather than the compiler rejecting the test.
  const { variables: _dropped, ...finalStateWithoutVariables } =
    receipt.finalState;
  const withoutVariables = {
    ...receipt,
    finalState: finalStateWithoutVariables,
  };
  assert.equal(isCompletedProcessReceipt(withoutVariables), false);
});

test("requires the exact optional source-overlay identity in a completed receipt", () => {
  const withOverlay = {
    ...receipt,
    definition: {
      ...receipt.definition,
      sourceOverlay: {
        id: "overlay",
        sha256:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    },
  };
  assert.equal(isCompletedProcessReceipt(withOverlay), true);
  assert.equal(isCompletedProcessReceipt({
    ...withOverlay,
    definition: {
      ...withOverlay.definition,
      sourceOverlay: {
        ...withOverlay.definition.sourceOverlay,
        module: "./reader.js",
      },
    },
  }), false);
});

test("reconciles Query command outcomes and terminal state with durable history", () => {
  assert.doesNotThrow(() =>
    reconcileHarnessTraceEvidence(
      trace,
      receipt,
      historyWithOutcome(CommandOutcome.Committed),
    )
  );
});

test("rejects a Query command outcome that differs from Update history", () => {
  assert.throws(
    () =>
      reconcileHarnessTraceEvidence(
        trace,
        receipt,
        historyWithOutcome(CommandOutcome.Rejected),
      ),
    /Query command complete-task does not match its durable Update result/,
  );
});

test("rejects a Query terminal state that differs from the receipt", () => {
  assert.throws(
    () =>
      reconcileHarnessTraceEvidence(
        trace,
        {
          ...receipt,
          finalState: {
            ...completedState,
            logicalTimeMs: 1,
          },
        },
        historyWithOutcome(CommandOutcome.Committed),
      ),
    /Query terminal state does not match the completed Process receipt/,
  );
});

test("classifies a failed durable Update as harness infrastructure failure", () => {
  assert.throws(
    () =>
      reconcileHarnessTraceEvidence(
        trace,
        receipt,
        historyWithFailureOutcome(),
      ),
    {
      name: "HarnessEvidenceInfrastructureError",
      message:
        "Completed Workflow Update has a failure outcome and no semantic command result",
    },
  );
});

function historyWithOutcome(outcome: CommandOutcome): TemporalHistory {
  return {
    events: [
      {
        eventId: 10,
        workflowExecutionUpdateAcceptedEventAttributes: {
          acceptedRequest: {
            input: {
              args: {
                payloads: [jsonPayload(completion)],
              },
            },
          },
        },
      },
      {
        eventId: 11,
        workflowExecutionUpdateCompletedEventAttributes: {
          acceptedEventId: 10,
          outcome: {
            success: {
              payloads: [jsonPayload(outcome)],
            },
          },
        },
      },
    ],
  };
}

function historyWithFailureOutcome() {
  return {
    events: [
      {
        eventId: 10,
        workflowExecutionUpdateAcceptedEventAttributes: {
          acceptedRequest: {
            input: {
              args: {
                payloads: [jsonPayload(completion)],
              },
            },
          },
        },
      },
      {
        eventId: 11,
        workflowExecutionUpdateCompletedEventAttributes: {
          acceptedEventId: 10,
          outcome: {
            failure: {
              message: "BpmnCommandIdentityConflict",
            },
          },
        },
      },
    ],
  };
}

function jsonPayload(value: unknown): Readonly<{
  metadata: Readonly<{ encoding: Buffer }>;
  data: Buffer;
}> {
  return {
    metadata: {
      encoding: Buffer.from("json/plain"),
    },
    data: Buffer.from(JSON.stringify(value)),
  };
}
