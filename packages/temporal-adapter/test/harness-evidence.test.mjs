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
} from "@bpmn-lean/semantic-core";

import {
  reconcileHarnessTraceEvidence,
} from "../dist/index.js";

const completion = {
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-task",
  taskId: {
    processInstanceId: "Instance_1",
    elementId: "Task_1",
    activation: 1,
  },
};
const completedState = {
  kind: CanonicalObservationKind.State,
  instanceId: "Instance_1",
  status: ProcessStatus.Completed,
  activeWaits: [],
  openUserTasks: [],
  openTimers: [],
  openEffects: [],
  enabledInteractions: [],
  logicalTimeMs: 0,
};
const trace = [
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
        kind: "userTask",
        multiplicity: 1,
      },
    ],
    openUserTasks: [],
    openTimers: [],
    openEffects: [],
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
const receipt = {
  definition: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "profile",
    sourceId: "source",
    sourceSha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  processId: "Process_1",
  processInstanceId: "Instance_1",
  finalState: completedState,
};

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

function historyWithOutcome(outcome) {
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

function jsonPayload(value) {
  return {
    metadata: {
      encoding: Buffer.from("json/plain"),
    },
    data: Buffer.from(JSON.stringify(value)),
  };
}
