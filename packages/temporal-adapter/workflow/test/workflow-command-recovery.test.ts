import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  EffectExecutionResultKind,
  MessageChannelKind,
  ProcessStatus,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  WorkflowChainCommandRecoveryResponseKind,
  bpmnWorkflowChainProtocolV1,
  canonicalStimulusEncoding,
  deterministicSha256Hex,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import {
  WorkflowCommandRecoveryLedger,
  WorkflowCommandRecoveryLookupKind,
  WorkflowCommandRecoveryPreflightKind,
  workflowCommandStimulusSha256,
} from "../dist/index.js";

const stimulus = completion("Command_1", "approved");

test("derives command recovery identity from the existing complete canonical stimulus encoding", () => {
  assert.equal(
    workflowCommandStimulusSha256(stimulus),
    deterministicSha256Hex(canonicalStimulusEncoding(stimulus)),
  );
});

test("rejects start and adapter-derived stimuli from external lifetime recovery", () => {
  const internalStimuli = [
    {
      kind: StimulusKind.StartProcess,
      commandId: "Start_1",
      processId: "Process_1",
      instanceId: "Instance_1",
      initialVariables: [],
    },
    {
      kind: StimulusKind.TriggerMessageStart,
      commandId: "MessageStart_1",
      processId: "Process_1",
      instanceId: "Instance_1",
      startEventId: "StartEvent_Message",
      channel: {
        kind: MessageChannelKind.OperationMessage,
        interfaceId: "Interface_1",
        interfaceOperationId: "Operation_1",
        messageId: "Message_1",
      },
    },
    {
      kind: StimulusKind.FireTimer,
      commandId: "Timer_1",
      timerId: {
        processInstanceId: "Instance_1",
        elementId: "Timer_1",
        activation: 1,
      },
      logicalTimeMs: 100,
    },
    {
      kind: StimulusKind.CompleteEffect,
      commandId: "Effect_1",
      effectId: {
        processInstanceId: "Instance_1",
        elementId: "ServiceTask_1",
        activation: 1,
      },
      result: {
        kind: EffectExecutionResultKind.Success,
        localPatch: [],
      },
    },
    {
      kind: StimulusKind.ReportEffectFailure,
      commandId: "EffectFailure_1",
      effectId: {
        processInstanceId: "Instance_1",
        elementId: "ServiceTask_1",
        activation: 1,
      },
      generation: 1,
    },
  ] as const satisfies ReadonlyArray<Stimulus>;

  for (const internalStimulus of internalStimuli) {
    const ledger = new WorkflowCommandRecoveryLedger();
    assert.throws(() => ledger.lookup(internalStimulus), /externally retryable/u);
    assert.throws(() => ledger.preflight(internalStimulus), /externally retryable/u);
  }
});

test("retains exact recovery and conflicting content across a digest-only rollover", () => {
  const firstRun = new WorkflowCommandRecoveryLedger();
  const preflight = firstRun.preflight(stimulus);
  assert.equal(preflight.kind, WorkflowCommandRecoveryPreflightKind.Admitted);
  if (preflight.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
    assert.fail("expected first command admission");
  }
  firstRun.record(preflight.admission, CommandOutcome.Committed);
  const secondStimulus = completion("Command_2", "reviewed");
  const secondPreflight = firstRun.preflight(secondStimulus);
  if (secondPreflight.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
    assert.fail("expected second command admission");
  }
  firstRun.record(secondPreflight.admission, CommandOutcome.Rejected);
  assert.deepEqual(
    firstRun.snapshot().map(({ commandId }) => commandId),
    [stimulus.commandId, secondStimulus.commandId],
  );

  const successorRun = new WorkflowCommandRecoveryLedger({
    entries: firstRun.snapshot(),
  });
  assert.deepEqual(successorRun.lookup(stimulus), {
    kind: WorkflowCommandRecoveryLookupKind.Resolved,
    outcome: CommandOutcome.Committed,
  });

  const conflicting = completion(stimulus.commandId, "denied");
  assert.notEqual(
    workflowCommandStimulusSha256(conflicting),
    workflowCommandStimulusSha256(stimulus),
  );
  assert.deepEqual(successorRun.lookup(conflicting), {
    kind: WorkflowCommandRecoveryLookupKind.IdentityConflict,
  });
  assert.equal(successorRun.snapshot().length, 2);
});

test("refuses multibyte recovery identity before semantic admission when bytes exhaust first", () => {
  const longStimulus = completion("命令".repeat(24), "approved");
  const digest = workflowCommandStimulusSha256(longStimulus);
  const worstCaseEntry = {
    commandId: longStimulus.commandId,
    stimulusSha256: digest,
    outcome: CommandOutcome.SemanticFailure,
  } as const;
  const candidateBytes = workflowChainCanonicalUtf8ByteLength([worstCaseEntry]);
  const ledger = new WorkflowCommandRecoveryLedger({
    limits: {
      entryCount: 2,
      canonicalUtf8Bytes: candidateBytes - 1,
    },
  });

  const preflight = ledger.preflight(longStimulus);
  assert.deepEqual(preflight, {
    kind: WorkflowCommandRecoveryPreflightKind.CapacityExceeded,
    commandId: longStimulus.commandId,
    stimulusSha256: digest,
    observedEntryCount: 1,
    observedCanonicalUtf8Bytes: candidateBytes,
    exhausted: [WorkflowChainBudgetKind.CommandRecoveryLedgerBytes],
  });
  assert.equal(ledger.snapshot().length, 0);
});

test("resolves retries and conflicts after capacity fills while refusing unseen work", () => {
  const ledger = new WorkflowCommandRecoveryLedger({
    limits: {
      entryCount: 1,
      canonicalUtf8Bytes: workflowChainProductionLimit(
        WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
      ),
    },
  });
  const preflight = ledger.preflight(stimulus);
  assert.equal(preflight.kind, WorkflowCommandRecoveryPreflightKind.Admitted);
  if (preflight.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
    assert.fail("expected first command admission");
  }
  const recorded = ledger.record(preflight.admission, CommandOutcome.Rejected);
  assert.equal(recorded.filledEntryBound, true);
  assert.equal(recorded.filledByteBound, false);

  assert.equal(
    ledger.preflight(stimulus).kind,
    WorkflowCommandRecoveryPreflightKind.Resolved,
  );
  assert.equal(
    ledger.preflight(completion(stimulus.commandId, "changed")).kind,
    WorkflowCommandRecoveryPreflightKind.IdentityConflict,
  );
  assert.deepEqual(ledger.preflight(completion("Command_2", "approved")), {
    kind: WorkflowCommandRecoveryPreflightKind.CapacityExceeded,
    commandId: "Command_2",
    stimulusSha256: workflowCommandStimulusSha256(
      completion("Command_2", "approved"),
    ),
    observedEntryCount: 2,
    observedCanonicalUtf8Bytes: workflowChainCanonicalUtf8ByteLength([
      ...ledger.snapshot(),
      {
        commandId: "Command_2",
        stimulusSha256: workflowCommandStimulusSha256(
          completion("Command_2", "approved"),
        ),
        outcome: CommandOutcome.SemanticFailure,
      },
    ]),
    exhausted: [WorkflowChainBudgetKind.CommandRecoveryLedgerEntries],
  });
});

test("records only the issued preflight candidate, preserves order, and reports filled bounds", () => {
  const digest = workflowCommandStimulusSha256(stimulus);
  const byteBound = workflowChainCanonicalUtf8ByteLength([{
    commandId: stimulus.commandId,
    stimulusSha256: digest,
    outcome: CommandOutcome.SemanticFailure,
  }]);
  const ledger = new WorkflowCommandRecoveryLedger({
    limits: { entryCount: 2, canonicalUtf8Bytes: byteBound },
  });
  const preflight = ledger.preflight(stimulus);
  assert.equal(preflight.kind, WorkflowCommandRecoveryPreflightKind.Admitted);
  if (preflight.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
    assert.fail("expected first command admission");
  }

  assert.throws(
    () => ledger.record(undefined as never, CommandOutcome.Committed),
    /preflight/u,
  );
  assert.throws(
    () => ledger.record(
      { ...preflight.admission, commandId: "Substituted" },
      CommandOutcome.Committed,
    ),
    /preflight|candidate/u,
  );
  const recorded = ledger.record(
    preflight.admission,
    CommandOutcome.SemanticFailure,
  );
  assert.deepEqual(recorded, {
    entry: {
      commandId: stimulus.commandId,
      stimulusSha256: digest,
      outcome: CommandOutcome.SemanticFailure,
    },
    filledEntryBound: false,
    filledByteBound: true,
  });
  assert.deepEqual(ledger.snapshot(), [recorded.entry]);
  assert.throws(
    () => ledger.record(preflight.admission, CommandOutcome.Rejected),
    /preflight/u,
  );
});

test("validates configured limits as lower positive production bounds", () => {
  const productionEntries = workflowChainProductionLimit(
    WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
  );
  const productionBytes = workflowChainProductionLimit(
    WorkflowChainBudgetKind.CommandRecoveryLedgerBytes,
  );
  for (const limits of [
    { entryCount: 0, canonicalUtf8Bytes: productionBytes },
    { entryCount: 1.5, canonicalUtf8Bytes: productionBytes },
    { entryCount: productionEntries, canonicalUtf8Bytes: 0 },
    { entryCount: productionEntries + 1, canonicalUtf8Bytes: productionBytes },
    { entryCount: productionEntries, canonicalUtf8Bytes: productionBytes + 1 },
  ]) {
    assert.throws(() => new WorkflowCommandRecoveryLedger({ limits }));
  }
  assert.throws(
    () => new WorkflowCommandRecoveryLedger({
      limits: { entryCount: 1, canonicalUtf8Bytes: 1 },
    }),
    /empty canonical ledger/u,
  );
});

test("projects identity-bound recovery with resolved and conflict precedence", () => {
  const ledger = resolvedLedger();
  const request = recoveryRequest(stimulus);
  const terminalFallback = {
    kind: WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry,
    receipt: terminalReceipt(),
  } as const;
  assert.deepEqual(
    ledger.projectResponse("Instance_1", request, terminalFallback),
    {
      ...request,
      kind: WorkflowChainCommandRecoveryResponseKind.Resolved,
      outcome: CommandOutcome.Committed,
    },
  );

  const conflictingRequest = recoveryRequest(
    completion(stimulus.commandId, "changed"),
  );
  assert.deepEqual(
    ledger.projectResponse("Instance_1", conflictingRequest, {
      kind: WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry,
      failure: {
        budget: WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
        configuredBound: 1,
        observedValue: 1,
        processInstanceId: "Instance_1",
        publicRevision: 3,
        runOrdinal: 2,
      },
    }),
    {
      ...conflictingRequest,
      kind: WorkflowChainCommandRecoveryResponseKind.IdentityConflict,
    },
  );

  const unseenRequest = recoveryRequest(completion("Command_2", "approved"));
  assert.deepEqual(
    ledger.projectResponse("Instance_1", unseenRequest, {
      kind: WorkflowChainCommandRecoveryResponseKind.UnknownWhileActive,
    }),
    {
      ...unseenRequest,
      kind: WorkflowChainCommandRecoveryResponseKind.UnknownWhileActive,
    },
  );
  assert.deepEqual(
    ledger.projectResponse("Instance_1", unseenRequest, terminalFallback),
    {
      ...unseenRequest,
      ...terminalFallback,
    },
  );
  const capacityFallback = {
    kind: WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry,
    failure: {
      budget: WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
      configuredBound: 1,
      observedValue: 1,
      processInstanceId: "Instance_1",
      publicRevision: 3,
      runOrdinal: 2,
    },
  } as const;
  assert.deepEqual(
    ledger.projectResponse("Instance_1", unseenRequest, capacityFallback),
    { ...unseenRequest, ...capacityFallback },
  );
  assert.throws(
    () => ledger.projectResponse("OtherInstance", request, terminalFallback),
    /Process-instance/u,
  );
});

function resolvedLedger(): WorkflowCommandRecoveryLedger {
  const ledger = new WorkflowCommandRecoveryLedger();
  const preflight = ledger.preflight(stimulus);
  if (preflight.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
    throw new TypeError("Test command was not admitted");
  }
  ledger.record(preflight.admission, CommandOutcome.Committed);
  return ledger;
}

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
    messageDeliveryRecords: [],
  } as const;
}
