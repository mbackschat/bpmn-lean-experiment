import assert from "node:assert/strict";
import test from "node:test";

import {
  BpmnWorkflowHostInputKind,
  WorkflowChainBudgetKind,
  bpmnWorkflowContinuationV1,
  requireBpmnWorkflowHostInputV1,
  workflowChainProductionLimit,
} from "../dist/index.js";

const production = {
  protocol: bpmnWorkflowContinuationV1,
  kind: BpmnWorkflowHostInputKind.Initial,
  eventHistoryEventLimit: workflowChainProductionLimit(
    WorkflowChainBudgetKind.EventHistoryEvents,
  ),
  eventHistoryByteLimit: workflowChainProductionLimit(
    WorkflowChainBudgetKind.EventHistoryBytes,
  ),
} as const;

test("requires exact lower-only Event History count and byte limits", () => {
  assert.deepEqual(requireBpmnWorkflowHostInputV1(production), production);
  const lowered = {
    ...production,
    eventHistoryEventLimit: 17,
    eventHistoryByteLimit: 32 * 1_024,
  };
  assert.deepEqual(requireBpmnWorkflowHostInputV1(lowered), lowered);

  assert.throws(
    () => requireBpmnWorkflowHostInputV1({
      protocol: production.protocol,
      kind: production.kind,
      eventHistoryEventLimit: production.eventHistoryEventLimit,
    }),
    /byte limit/u,
  );
  for (const eventHistoryByteLimit of [
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER,
    production.eventHistoryByteLimit + 1,
  ]) {
    assert.throws(
      () => requireBpmnWorkflowHostInputV1({
        ...production,
        eventHistoryByteLimit,
      }),
      /byte limit/u,
    );
  }
  assert.throws(
    () => requireBpmnWorkflowHostInputV1({ ...production, future: true }),
    /keys|field|metadata|only/u,
  );
});
