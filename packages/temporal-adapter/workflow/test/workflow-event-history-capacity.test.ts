import assert from "node:assert/strict";
import test from "node:test";

import {
  WorkflowChainEventHistoryCostKind,
  WorkflowChainEventHistoryTrigger,
  decideWorkflowChainEventHistoryRollover,
  requireWorkflowChainEventHistoryMargin,
  workflowChainEventHistoryActivationCostTable,
} from "../dist/index.js";

const limits = {
  eventHistoryEventLimit: 8_000,
  eventHistoryByteLimit: 8 * 1_024 * 1_024,
} as const;

test("selects the earliest SDK, count, or byte rollover trigger", () => {
  assert.equal(
    decideWorkflowChainEventHistoryRollover(limits, {
      continueAsNewSuggested: false,
      historyLength: limits.eventHistoryEventLimit - 1,
      historySize: limits.eventHistoryByteLimit - 1,
    }),
    WorkflowChainEventHistoryTrigger.None,
  );
  assert.equal(
    decideWorkflowChainEventHistoryRollover(limits, {
      continueAsNewSuggested: false,
      historyLength: limits.eventHistoryEventLimit,
      historySize: limits.eventHistoryByteLimit - 1,
    }),
    WorkflowChainEventHistoryTrigger.EventCount,
  );
  assert.equal(
    decideWorkflowChainEventHistoryRollover(limits, {
      continueAsNewSuggested: false,
      historyLength: limits.eventHistoryEventLimit - 1,
      historySize: limits.eventHistoryByteLimit,
    }),
    WorkflowChainEventHistoryTrigger.ByteCount,
  );
  assert.equal(
    decideWorkflowChainEventHistoryRollover(limits, {
      continueAsNewSuggested: true,
      historyLength: limits.eventHistoryEventLimit,
      historySize: limits.eventHistoryByteLimit,
    }),
    WorkflowChainEventHistoryTrigger.SdkSuggested,
  );
});

test("fails closed on malformed deterministic history information", () => {
  for (const historyLength of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => decideWorkflowChainEventHistoryRollover(limits, {
        continueAsNewSuggested: false,
        historyLength,
        historySize: 1,
      }),
      /historyLength/u,
    );
  }
  for (const historySize of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => decideWorkflowChainEventHistoryRollover(limits, {
        continueAsNewSuggested: false,
        historyLength: 1,
        historySize,
      }),
      /historySize/u,
    );
  }
});

test("fits the maximum admitted activation and continuation inside both warning margins", () => {
  assert.deepEqual(workflowChainEventHistoryActivationCostTable(), [
    {
      kind: WorkflowChainEventHistoryCostKind.SignalAndUpdateIngress,
      maximumEvents: 64,
      maximumPayloadBytes: 256 * 1_024,
    },
    {
      kind: WorkflowChainEventHistoryCostKind.UpdateResolution,
      maximumEvents: 8,
      maximumPayloadBytes: 256 * 1_024,
    },
    {
      kind: WorkflowChainEventHistoryCostKind.TimerLifecycle,
      maximumEvents: 128,
      maximumPayloadBytes: 0,
    },
    {
      kind: WorkflowChainEventHistoryCostKind.ActivityLifecycle,
      maximumEvents: 3,
      maximumPayloadBytes: 128 * 1_024,
    },
    {
      kind: WorkflowChainEventHistoryCostKind.WorkflowTaskAndContinueAsNew,
      maximumEvents: 5,
      maximumPayloadBytes: 448 * 1_024,
    },
  ]);
  assert.deepEqual(requireWorkflowChainEventHistoryMargin(), {
    eventWarningLimit: 10_240,
    eventTrigger: 8_000,
    reservedEvents: 2_240,
    maximumActivationEvents: 205,
    remainingEventHeadroom: 2_035,
    byteWarningLimit: 10 * 1_024 * 1_024,
    byteTrigger: 8 * 1_024 * 1_024,
    reservedBytes: 2 * 1_024 * 1_024,
    maximumActivationBytes: 1_953_792,
    remainingByteHeadroom: 143_360,
  });
});

test("rejects a warning margin one byte below the maximum activation", () => {
  assert.throws(
    () => requireWorkflowChainEventHistoryMargin({
      eventWarningLimit: 8_000 + 205,
      byteWarningLimit: 8 * 1_024 * 1_024 + 1_953_791,
    }),
    /Event History byte warning margin/u,
  );
});
