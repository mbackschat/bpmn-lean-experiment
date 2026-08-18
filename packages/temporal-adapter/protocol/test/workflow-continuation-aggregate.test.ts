import assert from "node:assert/strict";
import test from "node:test";

import type {
  ProcessStartStimulus,
  RuntimeState,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  WorkflowChainBudgetKind,
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
