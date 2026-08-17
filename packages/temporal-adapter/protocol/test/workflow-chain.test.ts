import assert from "node:assert/strict";
import test from "node:test";

import { ProcessStatus } from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  WorkflowChainCommandRecoveryResponseKind,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  bpmnWorkflowChainCommandRecoveryQueryName,
  bpmnWorkflowChainProtocolV1,
  canonicalWorkflowChainRecoveryIdentity,
  canonicalWorkflowChainJson,
  isWithinWorkflowChainBudget,
  requireWorkflowChainCanonicalByteBudget,
  requireWorkflowChainCommandRecoveryRequest,
  requireWorkflowChainCommandRecoveryResponse,
  requireWorkflowChainRecoveryEntry,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "../dist/index.js";

const identity = {
  protocol: "bpmn-lean.workflow-chain.v1",
  processInstanceId: "Instance_1",
  commandId: "Command_1",
  stimulusSha256: "a".repeat(64),
} as const;

test("publishes the exact v1 names and every production budget", () => {
  assert.equal(bpmnWorkflowChainProtocolV1, identity.protocol);
  assert.equal(
    bpmnWorkflowChainCommandRecoveryQueryName,
    "bpmn-workflow-chain-command-recovery",
  );
  assert.equal(
    bpmnWorkflowChainCapacityExhaustedFailureType,
    "BPMN_WORKFLOW_CHAIN_CAPACITY_EXHAUSTED",
  );
  assert.deepEqual(
    Object.values(WorkflowChainBudgetKind).map((kind) => [
      kind,
      workflowChainProductionLimit(kind),
    ]),
    [
      ["eventHistoryEvents", 8_000],
      ["eventHistoryBytes", 8 * 1_024 * 1_024],
      ["retainedRunTraceAndPublicationBytes", 2 * 1_024 * 1_024],
      ["acceptedUpdatesPerRun", 1_500],
      ["concurrentInFlightUpdates", 8],
      ["semanticInputQueueEntries", 64],
      ["semanticInputQueueBytes", 256 * 1_024],
      ["pendingActivities", 1],
      ["pendingTimers", 64],
      ["pendingChildWorkflows", 0],
      ["pendingExternalSignals", 0],
      ["pendingExternalCancellationRequests", 0],
      ["semanticProcessProgramBytes", 192 * 1_024],
      ["initialStartStimulusBytes", 64 * 1_024],
      ["semanticStimulusBytes", 64 * 1_024],
      ["committedRuntimeStateBytes", 64 * 1_024],
      ["publicationBatchBytes", 64 * 1_024],
      ["commandRecoveryLedgerEntries", 512],
      ["commandRecoveryLedgerBytes", 96 * 1_024],
      ["publicationContinuationAndSegmentDirectoryEntries", 128],
      ["publicationContinuationAndSegmentDirectoryBytes", 64 * 1_024],
      ["queryResponseBytes", 192 * 1_024],
      ["terminalResultEnvelopeBytes", 192 * 1_024],
      ["effectActivityRequestBytes", 64 * 1_024],
      ["effectActivityResultBytes", 64 * 1_024],
      ["effectActivityFailureProjectionBytes", 16 * 1_024],
      ["continueAsNewCarriedArgumentsBytes", 448 * 1_024],
      ["workflowChainRuns", 128],
    ],
  );
  assert.equal(
    isWithinWorkflowChainBudget(WorkflowChainBudgetKind.PendingActivities, 1),
    true,
  );
  assert.equal(
    isWithinWorkflowChainBudget(WorkflowChainBudgetKind.PendingActivities, 2),
    false,
  );
});

test("measures canonical JSON as UTF-8 bytes and rejects unsupported values", () => {
  assert.equal(
    canonicalWorkflowChainJson({ z: 1, a: [true, "é"] }),
    '{"a":[true,"é"],"z":1}',
  );
  assert.equal(workflowChainCanonicalUtf8ByteLength("é"), 4);

  const multibyte = "😀".repeat(5_000);
  assert.ok(canonicalWorkflowChainJson(multibyte).length < 16 * 1_024);
  assert.ok(workflowChainCanonicalUtf8ByteLength(multibyte) > 16 * 1_024);
  assert.throws(
    () => requireWorkflowChainCanonicalByteBudget(
      WorkflowChainBudgetKind.EffectActivityFailureProjectionBytes,
      multibyte,
    ),
    /effectActivityFailureProjectionBytes.*16384.*20002/u,
  );

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  for (const unsupported of [undefined, 1.5, Number.NaN, Infinity, cyclic]) {
    assert.throws(() => canonicalWorkflowChainJson(unsupported));
  }
});

test("rejects array accessors without invoking them", () => {
  let getterCalls = 0;
  const accessor: unknown[] = [];
  Object.defineProperty(accessor, "0", {
    configurable: true,
    enumerable: true,
    get: () => {
      getterCalls += 1;
      return "hidden computation";
    },
  });
  assert.throws(
    () => canonicalWorkflowChainJson(accessor),
    /dense arrays of enumerable data properties/u,
  );
  assert.equal(getterCalls, 0);
});

test("validates a strict recovery request and compact recovery entry", () => {
  assert.deepEqual(requireWorkflowChainCommandRecoveryRequest(identity), identity);
  assert.equal(
    canonicalWorkflowChainRecoveryIdentity(identity),
    '["bpmn-lean.workflow-chain.v1","Instance_1","Command_1","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]',
  );
  assert.deepEqual(
    requireWorkflowChainRecoveryEntry({
      commandId: identity.commandId,
      stimulusSha256: identity.stimulusSha256,
      outcome: "committed",
    }),
    {
      commandId: identity.commandId,
      stimulusSha256: identity.stimulusSha256,
      outcome: "committed",
    },
  );
  assert.throws(() => requireWorkflowChainCommandRecoveryRequest({
    ...identity,
    protocol: "bpmn-lean.workflow-chain.v2",
  }));
  assert.throws(() => requireWorkflowChainRecoveryEntry({
    commandId: identity.commandId,
    stimulusSha256: "not-a-sha256",
    outcome: "committed",
  }));
});

test("accepts every closed command-recovery response variant", () => {
  for (const response of [
    {
      ...identity,
      kind: WorkflowChainCommandRecoveryResponseKind.Resolved,
      outcome: "committed",
    },
    {
      ...identity,
      kind: WorkflowChainCommandRecoveryResponseKind.IdentityConflict,
    },
    {
      ...identity,
      kind: WorkflowChainCommandRecoveryResponseKind.UnknownWhileActive,
    },
    {
      ...identity,
      kind: WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry,
      receipt: terminalReceipt(),
    },
    {
      ...identity,
      kind: WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry,
      failure: capacityFailure(),
    },
  ] as const) {
    assert.deepEqual(
      requireWorkflowChainCommandRecoveryResponse(response, identity),
      response,
    );
  }
});

test("rejects recovery identity substitution before returning an outcome", () => {
  const resolved = {
    ...identity,
    kind: WorkflowChainCommandRecoveryResponseKind.Resolved,
    outcome: "committed",
  } as const;
  for (const substituted of [
    { ...resolved, processInstanceId: "Instance_2" },
    { ...resolved, commandId: "Command_2" },
    { ...resolved, stimulusSha256: "b".repeat(64) },
    { ...resolved, protocol: "bpmn-lean.workflow-chain.v2" },
  ]) {
    assert.throws(
      () => requireWorkflowChainCommandRecoveryResponse(substituted, identity),
      /identity|protocol/u,
    );
  }
});

test("rejects malformed, invalid-receipt, and over-budget responses", () => {
  assert.throws(() => requireWorkflowChainCommandRecoveryResponse({
    ...identity,
    kind: "resolved",
    outcome: "not-an-outcome",
  }, identity));
  assert.throws(() => requireWorkflowChainCommandRecoveryResponse({
    ...identity,
    kind: "futureVariant",
  }, identity));
  assert.throws(() => requireWorkflowChainCommandRecoveryResponse({
    ...identity,
    kind: WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry,
    receipt: { ...terminalReceipt(), processInstanceId: "Instance_2" },
  }, identity));
  assert.throws(
    () => requireWorkflowChainCommandRecoveryResponse({
      ...identity,
      kind: WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry,
      receipt: {
        ...terminalReceipt(),
        processId: "x".repeat(193 * 1_024),
      },
    }, identity),
    /queryResponseBytes/u,
  );
});

test("capacity details and recovery contracts expose no Run ID", () => {
  const contract = {
    request: identity,
    response: {
      ...identity,
      kind: WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry,
      failure: capacityFailure(),
    },
  };
  assert.equal(/runId|firstExecutionRunId/u.test(JSON.stringify(contract)), false);
});

function capacityFailure() {
  return {
    budget: WorkflowChainBudgetKind.CommandRecoveryLedgerEntries,
    configuredBound: 512,
    observedValue: 512,
    processInstanceId: identity.processInstanceId,
    publicRevision: 7,
    runOrdinal: 2,
  } as const;
}

function terminalReceipt() {
  return {
    format: "bpmn-lean.process-terminal-receipt.v1",
    definition: {
      compiler: "bpmn-source-semantic-process",
      semanticProfile: "profile",
      sourceId: "source",
      sourceSha256: "b".repeat(64),
      sourceOverlay: null,
    },
    processId: "Process_1",
    processInstanceId: identity.processInstanceId,
    finalState: {
      kind: "state",
      instanceId: identity.processInstanceId,
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
