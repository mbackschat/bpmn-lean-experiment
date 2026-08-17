import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  MessageChannelKind,
  ScenarioStepKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  MessageDeliveryRecord,
} from "@bpmn-lean/temporal-protocol";
import {
  MessageDeliveryResolutionKind,
  WorkflowChainBudgetKind,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import { ApplicationFailure } from "@temporalio/workflow";

import {
  WorkflowCommandRecoveryLedger,
  WorkflowCommandRecoveryPreflightKind,
  WorkflowChainFenceState,
  buildWorkflowChainSuccessor,
  createCommandPublicationState,
  integrateCommandPublication,
  recoveredWorkflowCommandOutcome,
  recordCommandPublicationOutcome,
  terminalProcessReceipt,
  validateIncomingWorkflowContinuation,
  validateWorkflowChainUpdate,
} from "../dist/index.js";
import type {
  CommandPublicationState,
  WorkflowChainRuntime,
  WorkflowChainSuccessorArguments,
} from "../dist/index.js";
import {
  publicationCompletion,
  publicationProgram,
  publicationStart,
} from "./execution-publication-fixture.ts";

const firstExecutionRunId = "first-execution-run";

test("rejects a terminal RuntimeState as an incoming continuation", () => {
  const args = successorArguments();
  const terminal = {
    ...args[3],
    control: {
      kind: ControlStateKind.Completed,
      instanceId: publicationStart.instanceId,
    },
  };

  assertInvalidIncoming(args, { state: terminal });
});

test("refuses an unseen User Task Update after terminal fencing", () => {
  const { runtime } = successorFixture();

  assert.throws(
    () => validateWorkflowChainUpdate(
      runtime,
      WorkflowChainFenceState.Terminal,
      publicationCompletion("UserTask_B", 2),
    ),
    isTerminalReceiptPending,
  );
});

test("refuses an unseen Retry Incident Update after terminal fencing", () => {
  const { runtime } = successorFixture();

  assert.throws(
    () => validateWorkflowChainUpdate(
      runtime,
      WorkflowChainFenceState.Terminal,
      {
        kind: StimulusKind.RetryIncident,
        commandId: "retry-after-terminal",
        incidentId: {
          effectId: {
            processInstanceId: publicationStart.instanceId,
            elementId: "ServiceTask_1",
            activation: 1,
          },
          generation: 1,
        },
      },
    ),
    isTerminalReceiptPending,
  );
});

test("keeps rollover retryable and active command identity closed", () => {
  const { runtime } = successorFixture();
  const stimulus = publicationCompletion("UserTask_B", 2);
  assert.throws(
    () => validateWorkflowChainUpdate(
      runtime,
      WorkflowChainFenceState.Rollover,
      stimulus,
    ),
    (error: unknown) =>
      error instanceof ApplicationFailure &&
      error.type === "BpmnWorkflowRolloverInProgress" &&
      error.nonRetryable === false,
  );
  assert.doesNotThrow(() => validateWorkflowChainUpdate(
    runtime,
    WorkflowChainFenceState.Active,
    stimulus,
  ));

  const preflight = runtime.recovery.preflight(stimulus);
  assert.equal(preflight.kind, WorkflowCommandRecoveryPreflightKind.Admitted);
  if (preflight.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
    assert.fail("test command was not admitted to recovery");
  }
  runtime.recovery.record(preflight.admission, CommandOutcome.Committed);
  assert.doesNotThrow(() => validateWorkflowChainUpdate(
    runtime,
    WorkflowChainFenceState.Terminal,
    stimulus,
  ));
  assert.equal(
    recoveredWorkflowCommandOutcome(runtime, stimulus),
    CommandOutcome.Committed,
  );
  const conflict = {
    ...stimulus,
    taskId: { ...stimulus.taskId, activation: 3 },
  };
  assert.throws(
    () => validateWorkflowChainUpdate(
      runtime,
      WorkflowChainFenceState.Active,
      conflict,
    ),
    (error: unknown) =>
      error instanceof ApplicationFailure &&
      error.type === "BpmnCommandIdentityConflict",
  );
  assert.throws(
    () => validateWorkflowChainUpdate(
      runtime,
      WorkflowChainFenceState.Terminal,
      conflict,
    ),
    (error: unknown) =>
      error instanceof ApplicationFailure &&
      error.type === "BpmnCommandIdentityConflict",
  );
});

test("rejects an extra nested RuntimeState field at continuation admission", () => {
  const args = successorArguments();
  const state = {
    ...args[3],
    variables: {
      ...args[3].variables,
      process: { ...args[3].variables.process, unexpected: true },
    },
  };

  assertInvalidIncoming(args, { state });
});

test("rejects a nested RuntimeState getter without executing it", () => {
  const args = successorArguments();
  let executed = false;
  const variables = { ...args[3].variables } as Record<string, unknown>;
  Object.defineProperty(variables, "process", {
    enumerable: true,
    get: () => {
      executed = true;
      return args[3].variables.process;
    },
  });

  assertInvalidIncoming(args, { state: { ...args[3], variables } });
  assert.equal(executed, false);
});

test("rejects a malformed nested occurrence record at continuation admission", () => {
  const args = successorArguments();
  const first = args[5].flowNodeOccurrences.currentOpen[0];
  assert.ok(first !== undefined);
  const malformed = { ...first, unexpected: true };
  const publication = {
    ...args[5],
    flowNodeOccurrences: {
      ...args[5].flowNodeOccurrences,
      currentOpen: [malformed, ...args[5].flowNodeOccurrences.currentOpen.slice(1)],
      retainedOpen: args[5].flowNodeOccurrences.retainedOpen.map((entry, index) =>
        index === 0 ? { ...entry, occurrence: malformed } : entry),
    },
  };

  assertInvalidIncoming(args, { publication });
});

test("rejects a nested publication getter without executing it", () => {
  const args = successorArguments();
  const carried = args[5].execution.current;
  assert.ok(carried !== null);
  let executed = false;
  const current = { ...carried } as Record<string, unknown>;
  Object.defineProperty(current, "state", {
    enumerable: true,
    get: () => {
      executed = true;
      return carried.state;
    },
  });

  assertInvalidIncoming(args, {
    publication: {
      ...args[5],
      execution: { ...args[5].execution, current },
    },
  });
  assert.equal(executed, false);
});

test("rejects publication current logical-time drift from RuntimeState", () => {
  const args = successorArguments();
  const current = args[5].execution.current;
  assert.ok(current !== null);
  const publication = {
    ...args[5],
    execution: {
      ...args[5].execution,
      current: {
        ...current,
        state: { ...current.state, logicalTimeMs: current.state.logicalTimeMs + 1 },
      },
    },
  };

  assertInvalidIncoming(args, { publication });
});

test("rejects swapped retained occurrence anchors at continuation admission", () => {
  const args = successorArguments();
  const [first, second, ...rest] = args[5].flowNodeOccurrences.retainedOpen;
  assert.ok(first !== undefined && second !== undefined);
  const publication = {
    ...args[5],
    flowNodeOccurrences: {
      ...args[5].flowNodeOccurrences,
      retainedOpen: [
        { ...first, anchor: second.anchor },
        { ...second, anchor: first.anchor },
        ...rest,
      ],
    },
  };

  assertInvalidIncoming(args, { publication });
});

test("terminal validation prevents enqueue and preserves the terminal receipt", () => {
  const { runtime } = successorFixture();
  const terminal = terminalFixture();
  const before = terminalProcessReceipt(
    publicationProgram,
    publicationStart.instanceId,
    terminal.state,
    terminal.trace,
  );
  let handlerStarted = false;
  const pending: unknown[] = [];

  assert.throws(() => {
    validateWorkflowChainUpdate(
      runtime,
      WorkflowChainFenceState.Terminal,
      publicationCompletion("UserTask_A", 2),
    );
    handlerStarted = true;
    pending.push("unexpected");
  }, isTerminalReceiptPending);
  assert.equal(handlerStarted, false);
  assert.deepEqual(pending, []);
  assert.deepEqual(
    terminalProcessReceipt(
      publicationProgram,
      publicationStart.instanceId,
      terminal.state,
      terminal.trace,
    ),
    before,
  );
});

test("rejects negative publication heads, times, and unknown fields", () => {
  const args = successorArguments();
  assert.ok(args[5].execution.current !== null);
  const publication = {
    ...args[5],
    unknown: "field",
    execution: {
      ...args[5].execution,
      headRevision: -1,
      current: { ...args[5].execution.current, revision: -1 },
    },
    flowNodeOccurrences: {
      ...args[5].flowNodeOccurrences,
      headRevision: -1,
      lastCommittedAtEpochMs: -1,
    },
  };

  assertInvalidIncoming(args, { publication });
});

test("rejects a carried Message resolution for another Process instance", () => {
  const otherRecord = messageRecord("Other_Instance", "message");
  const fixture = successorFixture();
  assert.throws(
    () => buildWorkflowChainSuccessor(
      fixture.runtime,
      publicationStart,
      publicationProgram,
      fixture.state,
      fixture.publication,
      [otherRecord],
    ),
    isInvalidContinuation,
  );

  const args = successorArguments();
  const malformedArgs: WorkflowChainSuccessorArguments = [
    args[0],
    args[1],
    { ...args[2], completedMessageDeliveryRecords: [otherRecord] },
    args[3],
    args[4],
    args[5],
  ];

  assertInvalidIncoming(malformedArgs);
});

test("classifies an oversized successor RuntimeState as exact capacity exhaustion", () => {
  const base = successorFixture();
  const state = {
    ...base.state,
    variables: {
      ...base.state.variables,
      process: {
        bindings: [{
          name: "large",
          value: {
            kind: VariableValueKind.String,
            value: "x".repeat(70 * 1_024),
          },
        }],
      },
    },
  };
  const observedValue = workflowChainCanonicalUtf8ByteLength(state);

  assertCapacityFailure(
    () => buildWorkflowChainSuccessor(
      base.runtime,
      publicationStart,
      publicationProgram,
      state,
      base.publication,
      [],
    ),
    WorkflowChainBudgetKind.CommittedRuntimeStateBytes,
    observedValue,
    base.publication.execution.headRevision,
  );
});

test("measures successor host metadata under the publication-continuation bound", () => {
  const base = successorFixture();
  const records = [messageRecord(
    publicationStart.instanceId,
    "m".repeat(70 * 1_024),
  )];

  assertCapacityFailure(
    () => buildWorkflowChainSuccessor(
      base.runtime,
      publicationStart,
      publicationProgram,
      base.state,
      base.publication,
      records,
    ),
    WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes,
    undefined,
    base.publication.execution.headRevision,
  );
});

function successorArguments(
  messageDeliveryRecords: ReadonlyArray<MessageDeliveryRecord> = [],
): WorkflowChainSuccessorArguments {
  const fixture = successorFixture();
  return buildWorkflowChainSuccessor(
    fixture.runtime,
    publicationStart,
    publicationProgram,
    fixture.state,
    fixture.publication,
    messageDeliveryRecords,
  );
}

function successorFixture() {
  const step = advanceScenario(publicationProgram, initialState, publicationStart);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) {
    assert.fail("publication Start did not reach a committed stable state");
  }
  const publicationCandidate = integrateCommandPublication(
    publicationProgram,
    createCommandPublicationState(
      publicationProgram,
      publicationStart.instanceId,
    ),
    publicationStart,
    step,
    () => 1_000,
  );
  const publication = recordCommandPublicationOutcome(
    publicationCandidate,
    publicationStart,
    step.observations,
  );
  const runtime: WorkflowChainRuntime = {
    eventHistoryEventLimit: 4,
    runOrdinal: 1,
    firstExecutionRunId,
    recovery: new WorkflowCommandRecoveryLedger(),
  };
  return { state: step.state, publication, runtime };
}

function terminalFixture() {
  const start = advanceScenario(publicationProgram, initialState, publicationStart);
  const first = advanceScenario(
    publicationProgram,
    start.state,
    publicationCompletion("UserTask_A"),
  );
  const terminal = advanceScenario(
    publicationProgram,
    first.state,
    publicationCompletion("UserTask_B"),
  );
  assert.equal(terminal.state.control.kind, ControlStateKind.Completed);
  return {
    state: terminal.state,
    trace: [...start.observations, ...first.observations, ...terminal.observations],
  };
}

function assertInvalidIncoming(
  args: WorkflowChainSuccessorArguments,
  substitution: Readonly<{
    state?: unknown;
    publication?: unknown;
  }> = {},
): void {
  assert.throws(
    () => validateIncomingWorkflowContinuation(
      args[0],
      args[1],
      args[2],
      substitution.state ?? args[3],
      args[4],
      substitution.publication ?? args[5],
      firstExecutionRunId,
    ),
    isInvalidContinuation,
  );
}

function isInvalidContinuation(error: unknown): boolean {
  return error instanceof ApplicationFailure &&
    error.type === "BpmnWorkflowContinuationInvalid";
}

function isTerminalReceiptPending(error: unknown): boolean {
  return error instanceof ApplicationFailure &&
    error.type === "BpmnWorkflowTerminalReceiptPending" &&
    error.nonRetryable === false;
}

function assertCapacityFailure(
  operation: () => unknown,
  budget: WorkflowChainBudgetKind,
  observedValue: number | undefined,
  publicRevision: number,
): void {
  assert.throws(operation, (error: unknown) => {
    if (
      !(error instanceof ApplicationFailure) ||
      error.type !== "BPMN_WORKFLOW_CHAIN_CAPACITY_EXHAUSTED"
    ) {
      return false;
    }
    assert.equal(error.details?.length, 1);
    const details = error.details?.[0] as Record<string, unknown>;
    assert.equal(details["budget"], budget);
    assert.equal(
      details["configuredBound"],
      workflowChainProductionLimit(budget),
    );
    if (observedValue !== undefined) {
      assert.equal(details["observedValue"], observedValue);
    } else {
      assert.equal(
        typeof details["observedValue"] === "number" &&
          details["observedValue"] > workflowChainProductionLimit(budget),
        true,
      );
    }
    assert.equal(details["processInstanceId"], publicationStart.instanceId);
    assert.equal(details["publicRevision"], publicRevision);
    assert.equal(details["runOrdinal"], 1);
    return true;
  });
}

function messageRecord(
  processInstanceId: string,
  commandId: string,
): MessageDeliveryRecord {
  return {
    kind: MessageDeliveryResolutionKind.Semantic,
    stimulus: {
      kind: StimulusKind.DeliverMessage,
      commandId,
      subscriptionId: {
        processInstanceId,
        elementId: "MessageCatch_1",
        activation: 1,
      },
      channel: {
        kind: MessageChannelKind.DirectMessage,
        messageId: "Message_1",
      },
    },
    outcome: CommandOutcome.Committed,
  };
}
