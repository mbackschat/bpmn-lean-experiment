import assert from "node:assert/strict";
import test from "node:test";

import type {
  ProcessStartStimulus,
  RuntimeState,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  BpmnWorkflowHostInputKind,
  WorkflowChainBudgetKind,
  bpmnWorkflowContinuationV1,
  productionBpmnWorkflowInitialHostInput,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
  workflowContinuationBudgetViolation,
} from "../dist/index.js";
import type {
  BpmnWorkflowContinuationHostInputV1,
  BpmnWorkflowContinuationPublicationV1,
  BpmnWorkflowContinuationRecoveryV1,
} from "../dist/index.js";

const kib = 1_024;
const aggregateBound = workflowChainProductionLimit(
  WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes,
);

test("accepts the exact sum of separately encoded continuation arguments", () => {
  const args = continuationArguments(64 * kib, 64 * kib - 14);
  assert.equal(workflowContinuationBudgetViolation(...args), null);
});

test("reports one aggregate byte over without synthetic array punctuation", () => {
  const args = continuationArguments(64 * kib, 64 * kib - 13);
  assert.deepEqual(workflowContinuationBudgetViolation(...args), {
    budget: WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes,
    observedValue: aggregateBound + 1,
    configuredBound: aggregateBound,
  });
});

test("retains every stricter individual argument bound", () => {
  const args = continuationArguments(64 * kib + 1, 64 * kib - 15);
  assert.deepEqual(workflowContinuationBudgetViolation(...args), {
    budget: WorkflowChainBudgetKind.InitialStartStimulusBytes,
    observedValue: 64 * kib + 1,
    configuredBound: 64 * kib,
  });
});

function continuationArguments(
  startBytes: number,
  publicationBytes: number,
): readonly [
  ProcessStartStimulus,
  SemanticProcessProgram,
  BpmnWorkflowContinuationHostInputV1,
  RuntimeState,
  BpmnWorkflowContinuationRecoveryV1,
  BpmnWorkflowContinuationPublicationV1,
] {
  return [
    encodedString(startBytes, "s") as unknown as ProcessStartStimulus,
    encodedString(192 * kib, "p") as unknown as SemanticProcessProgram,
    encodedString(64 * kib, "h") as unknown as BpmnWorkflowContinuationHostInputV1,
    encodedString(64 * kib, "r") as unknown as RuntimeState,
    { entries: [] },
    encodedString(publicationBytes, "b") as unknown as
      BpmnWorkflowContinuationPublicationV1,
  ];
}

function encodedString(bytes: number, character: string): string {
  assert.ok(bytes >= 2);
  return character.repeat(bytes - 2);
}


const subscriptionTimer = {
  protocol: "bpmn-lean.subscription-timer.v1",
  timer: {
    id: { processInstanceId: "instance", elementId: "timer", activation: 1 },
    logicalDeadlineMs: 1_000,
    dueTimeMs: 2_000,
  },
} as const;

function subscriptionHostBytes(bytes: number): BpmnWorkflowContinuationHostInputV1 {
  const host = {
    ...productionBpmnWorkflowInitialHostInput(),
    protocol: bpmnWorkflowContinuationV1,
    kind: BpmnWorkflowHostInputKind.Continuation,
    runOrdinal: 2,
    firstExecutionRunId: "",
    definition: {
      compiler: "bpmn-source-semantic-process",
      semanticProfile: "bpmn-2.0.2-repeatable-event-subscriptions-draft",
      sourceId: "source", sourceSha256: "a".repeat(64), sourceOverlay: null,
    },
    processId: "process", processInstanceId: "instance", startCommandId: "start",
    publicationSegmentDirectorySha256: "b".repeat(64),
    completedMessageDeliveryRecords: [],
    subscriptionTimer,
  };
  const baseBytes = workflowChainCanonicalUtf8ByteLength(host);
  assert.ok(bytes >= baseBytes);
  return { ...host, firstExecutionRunId: "h".repeat(bytes - baseBytes) } as
    BpmnWorkflowContinuationHostInputV1;
}

test("subscription Timer bytes count against the complete individual host bound", () => {
  const host = subscriptionHostBytes(64 * kib);
  const args = continuationArguments(2, 2);
  const withHost = [args[0], args[1], host, args[3], args[4], args[5]] as const;
  assert.equal(workflowContinuationBudgetViolation(...withHost), null);
  const oversized = { ...host, firstExecutionRunId: `${host.firstExecutionRunId}h` };
  assert.deepEqual(workflowContinuationBudgetViolation(
    withHost[0], withHost[1], oversized, withHost[3], withHost[4], withHost[5],
  ), {
    budget: WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes,
    observedValue: 64 * kib + 1,
    configuredBound: 64 * kib,
  });
  const { subscriptionTimer: omitted, ...withoutBinding } = oversized;
  assert.deepEqual(omitted, subscriptionTimer);
  assert.equal(workflowContinuationBudgetViolation(
    withHost[0], withHost[1], withoutBinding, withHost[3], withHost[4], withHost[5],
  ), null);
});

test("subscription Timer bytes count in the exact aggregate and one-byte overflow", () => {
  const host = subscriptionHostBytes(64 * kib);
  const exact = continuationArguments(64 * kib, 64 * kib - 14);
  assert.equal(workflowContinuationBudgetViolation(
    exact[0], exact[1], host, exact[3], exact[4], exact[5],
  ), null);
  const over = continuationArguments(64 * kib, 64 * kib - 13);
  assert.deepEqual(workflowContinuationBudgetViolation(
    over[0], over[1], host, over[3], over[4], over[5],
  ), {
    budget: WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes,
    observedValue: aggregateBound + 1,
    configuredBound: aggregateBound,
  });
  const { subscriptionTimer: omitted, ...withoutBinding } = host;
  assert.deepEqual(omitted, subscriptionTimer);
  assert.equal(workflowContinuationBudgetViolation(
    over[0], over[1], withoutBinding, over[3], over[4], over[5],
  ), null);
});
