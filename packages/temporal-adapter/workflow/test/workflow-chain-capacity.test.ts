import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  ProcessStatus,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  WorkflowChainCommandRecoveryResponseKind,
  bpmnWorkflowChainProtocolV1,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
  processTerminalReceiptFormatV1,
} from "@bpmn-lean/temporal-protocol";
import {
  WorkflowChainCapacityState,
  WorkflowChainRecoveryIngressKind,
  WorkflowChainStableCheckpointKind,
  WorkflowCommandRecoveryLedger,
  WorkflowCommandRecoveryPreflightKind,
  acceptWorkflowChainSignalCapacity,
  workflowCommandStimulusSha256,
} from "../dist/index.js";

test("preserves recovery and terminal precedence when a committed entry fills capacity", () => {
  const first = completion("Command_1", "approved");
  const ledger = new WorkflowCommandRecoveryLedger({
    limits: {
      entryCount: 1,
      canonicalUtf8Bytes: workflowChainProductionLimit(
        WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
      ),
    },
  });
  const capacity = capacityState(2);
  const preflight = ledger.preflight(first);
  if (preflight.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
    assert.fail("expected first command admission");
  }

  const record = ledger.record(preflight.admission, CommandOutcome.Committed);
  capacity.observeRecoveryRecord(record, 3);

  assert.deepEqual(capacity.classifyRecoveryIngress(ledger, first), {
    kind: WorkflowChainRecoveryIngressKind.Resolved,
    outcome: CommandOutcome.Committed,
  });
  assert.deepEqual(
    capacity.classifyRecoveryIngress(
      ledger,
      completion("Command_1", "changed"),
    ),
    { kind: WorkflowChainRecoveryIngressKind.IdentityConflict },
  );
  assert.equal(
    acceptWorkflowChainSignalCapacity(
      { recovery: ledger, capacity },
      completion("Command_1", "changed"),
    ),
    true,
  );
  assert.equal(
    acceptWorkflowChainSignalCapacity(
      { recovery: ledger, capacity },
      completion("Command_2", "approved"),
    ),
    false,
  );
  const expectedFailure = {
    budget: WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
    configuredBound: 1,
    observedValue: 1,
    processInstanceId: "Instance_1",
    publicRevision: 3,
    runOrdinal: 2,
  } as const;
  assert.deepEqual(
    capacity.classifyRecoveryIngress(
      ledger,
      completion("Command_2", "approved"),
    ),
    {
      kind: WorkflowChainRecoveryIngressKind.CapacityExceeded,
      failure: expectedFailure,
    },
  );
  assert.deepEqual(capacity.decideStableCheckpoint(false), {
    kind: WorkflowChainStableCheckpointKind.CapacityExceeded,
    failure: expectedFailure,
  });
  assert.deepEqual(capacity.decideStableCheckpoint(true), {
    kind: WorkflowChainStableCheckpointKind.Terminal,
  });

  const failure = capacity.applicationFailure();
  assert.equal(failure.type, bpmnWorkflowChainCapacityExhaustedFailureType);
  assert.equal(failure.nonRetryable, true);
  assert.deepEqual(failure.details, [expectedFailure]);

  assert.deepEqual(
    capacity.projectRecoveryResponse(
      ledger,
      "Instance_1",
      recoveryRequest(first),
      null,
    ),
    {
      ...recoveryRequest(first),
      kind: WorkflowChainCommandRecoveryResponseKind.Resolved,
      outcome: CommandOutcome.Committed,
    },
  );
  const conflicting = completion("Command_1", "changed");
  assert.deepEqual(
    capacity.projectRecoveryResponse(
      ledger,
      "Instance_1",
      recoveryRequest(conflicting),
      null,
    ),
    {
      ...recoveryRequest(conflicting),
      kind: WorkflowChainCommandRecoveryResponseKind.IdentityConflict,
    },
  );
  const unseen = completion("Command_2", "approved");
  assert.deepEqual(
    capacity.projectRecoveryResponse(
      ledger,
      "Instance_1",
      recoveryRequest(unseen),
      null,
    ),
    {
      ...recoveryRequest(unseen),
      kind:
        WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry,
      failure: expectedFailure,
    },
  );
  assert.deepEqual(
    capacity.projectRecoveryResponse(
      ledger,
      "Instance_1",
      recoveryRequest(unseen),
      terminalReceipt(),
    ),
    {
      ...recoveryRequest(unseen),
      kind: WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry,
      receipt: terminalReceipt(),
    },
  );
});

test("remains inactive until a recovery record exactly fills a bound", () => {
  const ledger = new WorkflowCommandRecoveryLedger({
    limits: {
      entryCount: 2,
      canonicalUtf8Bytes: workflowChainProductionLimit(
        WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
      ),
    },
  });
  const capacity = capacityState(1);
  const preflight = ledger.preflight(completion("Command_1", "approved"));
  if (preflight.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
    assert.fail("expected first command admission");
  }

  const record = ledger.record(preflight.admission, CommandOutcome.Rejected);
  assert.deepEqual(record.filledBounds, []);
  assert.equal(capacity.observeRecoveryRecord(record, 1), null);
  assert.equal(capacity.pendingFailure(), null);
  assert.deepEqual(capacity.decideStableCheckpoint(false), {
    kind: WorkflowChainStableCheckpointKind.Continue,
  });
  assert.throws(() => capacity.applicationFailure(), /no pending failure/u);
});

test("reports the exact byte bound when canonical recovery bytes fill first", () => {
  const stimulus = completion("Command_1", "approved");
  const byteBound = workflowChainCanonicalUtf8ByteLength([{
    commandId: stimulus.commandId,
    stimulusSha256: workflowCommandStimulusSha256(stimulus),
    outcome: CommandOutcome.SemanticFailure,
  }]);
  const ledger = new WorkflowCommandRecoveryLedger({
    limits: { entryCount: 2, canonicalUtf8Bytes: byteBound },
  });
  const preflight = ledger.preflight(stimulus);
  if (preflight.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
    assert.fail("expected byte-bound command admission");
  }
  const record = ledger.record(
    preflight.admission,
    CommandOutcome.SemanticFailure,
  );
  const capacity = capacityState(3);

  assert.deepEqual(capacity.observeRecoveryRecord(record, 4), {
    budget: WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
    configuredBound: byteBound,
    observedValue: byteBound,
    processInstanceId: "Instance_1",
    publicRevision: 4,
    runOrdinal: 3,
  });
});

test("retains the first observed candidate capacity as the stable failure", () => {
  const capacity = capacityState(4);
  const first = {
    budget: WorkflowChainBudgetKind.CommittedRuntimeStateBytes,
    configuredBound: 64,
    observedValue: 67,
  } as const;

  assert.deepEqual(capacity.retainObservedCapacity(first, 9), {
    ...first,
    processInstanceId: "Instance_1",
    publicRevision: 9,
    runOrdinal: 4,
  });
  assert.deepEqual(capacity.retainObservedCapacity({
    budget: WorkflowChainBudgetKind.PublicationBatchBytes,
    configuredBound: 32,
    observedValue: 33,
  }, 10), {
    ...first,
    processInstanceId: "Instance_1",
    publicRevision: 9,
    runOrdinal: 4,
  });
});

test("refuses an unseen Update before queuing when its recovery entry crosses the byte bound", () => {
  const stimulus = completion("Command_1", "approved");
  const candidateBytes = workflowChainCanonicalUtf8ByteLength([{
    commandId: stimulus.commandId,
    stimulusSha256: workflowCommandStimulusSha256(stimulus),
    outcome: CommandOutcome.SemanticFailure,
  }]);
  const byteBound = candidateBytes - 1;
  const ledger = new WorkflowCommandRecoveryLedger({
    limits: { entryCount: 2, canonicalUtf8Bytes: byteBound },
  });
  const capacity = capacityState(2);
  const context = {
    processInstanceId: "Instance_1",
    publicRevision: 7,
    runOrdinal: 2,
  } as const;

  assert.deepEqual(
    capacity.classifyUpdateIngress(ledger, stimulus, context.publicRevision),
    {
      kind: WorkflowChainRecoveryIngressKind.CapacityExceeded,
      failure: {
        budget: WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
        configuredBound: byteBound,
        observedValue: candidateBytes,
        ...context,
      },
    },
  );
  assert.deepEqual(ledger.snapshot(), []);
  assert.equal(capacity.pendingFailure(), null);
  assert.deepEqual(
    capacity.retainUnseenCapacity(
      ledger,
      stimulus,
      context.publicRevision,
    ),
    {
      budget: WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
      configuredBound: byteBound,
      observedValue: candidateBytes,
      ...context,
    },
  );
  assert.equal(
    acceptWorkflowChainSignalCapacity(
      { recovery: ledger, capacity },
      completion("Command_2", "approved"),
    ),
    false,
  );
});

function completion(
  commandId: string,
  value: string,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId: {
      processInstanceId: "Instance_1",
      elementId: "ReviewTask",
      activation: 1,
    },
    submittedValues: [{
      name: "decision",
      value: { kind: "string", value },
    }],
  };
}

function capacityState(runOrdinal: number): WorkflowChainCapacityState {
  return new WorkflowChainCapacityState({
    processInstanceId: "Instance_1",
    runOrdinal,
  });
}

function recoveryRequest(value: CompleteUserTaskInstanceStimulus) {
  return {
    protocol: bpmnWorkflowChainProtocolV1,
    processInstanceId: "Instance_1",
    commandId: value.commandId,
    stimulusSha256: workflowCommandStimulusSha256(value),
  } as const;
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
    processInstanceId: "Instance_1",
    finalState: {
      kind: "state",
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
    },
  } as const;
}
