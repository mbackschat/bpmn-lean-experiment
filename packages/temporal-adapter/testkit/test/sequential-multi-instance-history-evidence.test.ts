/** Pure production-history closure for the registered sequential Multi-Instance witness. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  SequentialMultiInstanceHistoryRunRole,
  SequentialMultiInstanceHistoryTopology,
  requireSequentialMultiInstanceHistoryCapacity,
} from "@bpmn-lean/temporal-workflow";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

import {
  requireSequentialMultiInstanceProductionHistory,
} from "./sequential-multi-instance-history-evidence.ts";
import type {
  SequentialMultiInstanceProductionHistoryEvidence,
} from "./sequential-multi-instance-history-evidence.ts";

const familyAttributes = Object.freeze({
  started: "workflowExecutionStartedEventAttributes",
  workflowTaskScheduled: "workflowTaskScheduledEventAttributes",
  workflowTaskStarted: "workflowTaskStartedEventAttributes",
  workflowTaskCompleted: "workflowTaskCompletedEventAttributes",
  patchMarker: "markerRecordedEventAttributes",
  searchAttributeUpsert: "upsertWorkflowSearchAttributesEventAttributes",
  updateAccepted: "workflowExecutionUpdateAcceptedEventAttributes",
  updateCompleted: "workflowExecutionUpdateCompletedEventAttributes",
  timerStarted: "timerStartedEventAttributes",
  timerCanceled: "timerCanceledEventAttributes",
  timerFired: "timerFiredEventAttributes",
  continuedAsNew: "workflowExecutionContinuedAsNewEventAttributes",
  completed: "workflowExecutionCompletedEventAttributes",
});

test("closes the production-only event vocabulary and role topology", () => {
  const natural = naturalEvidence();
  const result = requireSequentialMultiInstanceProductionHistory(natural);

  assert.equal(result.runs.length, 2);
  assert.equal(result.runs[0]?.classifiedEventCount, natural.runs[0]?.history.events.length);
  assert.equal(result.runs[1]?.classifiedEventCount, natural.runs[1]?.history.events.length);
  assert.equal(result.maximumHistorySize, 4_096);

  const interrupted = interruptedEvidence();
  assert.equal(
    requireSequentialMultiInstanceProductionHistory(interrupted).runs.length,
    4,
  );
});

test("rejects an unclassified or forbidden event family", () => {
  const unclassified = naturalEvidence();
  unclassified.runs[1]!.history.events[0] = event("workflowExecutionOptionsUpdatedEventAttributes");
  assert.throws(
    () => requireSequentialMultiInstanceProductionHistory(unclassified),
    /unclassified Event family workflowExecutionOptionsUpdatedEventAttributes/u,
  );

  const signaled = naturalEvidence();
  signaled.runs[1]!.history.events.push(
    event("workflowExecutionSignaledEventAttributes"),
  );
  assert.throws(
    () => requireSequentialMultiInstanceProductionHistory(signaled),
    /forbidden Event family signal/u,
  );
});

test("rejects a missing role family and one Event or byte beyond the owner", () => {
  const missingCancellation = naturalEvidence();
  removeFirst(
    missingCancellation.runs[1]!.history,
    familyAttributes.timerCanceled,
  );
  assert.throws(
    () => requireSequentialMultiInstanceProductionHistory(missingCancellation),
    /armed natural Run requires one timer cancellation/u,
  );

  const bounds = requireSequentialMultiInstanceHistoryCapacity();
  const overEvents = naturalEvidence();
  while (
    overEvents.runs[1]!.history.events.length <= bounds.maximumMeasuredRunEvents
  ) {
    overEvents.runs[1]!.history.events.push(
      event(familyAttributes.workflowTaskCompleted),
    );
  }
  assert.throws(
    () => requireSequentialMultiInstanceProductionHistory(overEvents),
    new RegExp(
      `exceeds the approved ${String(bounds.maximumMeasuredRunEvents)}-Event topology bound`,
      "u",
    ),
  );

  const overBytes = naturalEvidence();
  overBytes.runs[1]!.historySize = bounds.maximumMeasuredRunBytes + 1;
  assert.throws(
    () => requireSequentialMultiInstanceProductionHistory(overBytes),
    new RegExp(
      `exceeds the approved ${String(bounds.maximumMeasuredRunBytes)}-byte topology bound`,
      "u",
    ),
  );
});

function naturalEvidence(): MutableProductionEvidence {
  return {
    topology: SequentialMultiInstanceHistoryTopology.Natural,
    runs: [
      run(1, SequentialMultiInstanceHistoryRunRole.PreArming, [
        familyAttributes.continuedAsNew,
      ]),
      run(2, SequentialMultiInstanceHistoryRunRole.Armed, [
        familyAttributes.timerStarted,
        ...repeatedPair(
          familyAttributes.updateAccepted,
          familyAttributes.updateCompleted,
          3,
        ),
        familyAttributes.timerCanceled,
        familyAttributes.completed,
      ]),
    ],
  };
}

function interruptedEvidence(): MutableProductionEvidence {
  return {
    topology: SequentialMultiInstanceHistoryTopology.Interrupted,
    runs: [
      run(1, SequentialMultiInstanceHistoryRunRole.PreArming, [
        familyAttributes.continuedAsNew,
      ]),
      run(2, SequentialMultiInstanceHistoryRunRole.Armed, [
        familyAttributes.timerStarted,
        familyAttributes.updateAccepted,
        familyAttributes.updateCompleted,
        familyAttributes.timerFired,
        familyAttributes.continuedAsNew,
      ]),
      run(3, SequentialMultiInstanceHistoryRunRole.StaleRefusal, [
        familyAttributes.updateAccepted,
        familyAttributes.updateCompleted,
        familyAttributes.continuedAsNew,
      ]),
      run(4, SequentialMultiInstanceHistoryRunRole.Escalation, [
        familyAttributes.updateAccepted,
        familyAttributes.updateCompleted,
        familyAttributes.completed,
      ]),
    ],
  };
}

function run(
  runOrdinal: number,
  role: SequentialMultiInstanceHistoryRunRole,
  roleAttributes: readonly string[],
): MutableProductionRun {
  return {
    runOrdinal,
    role,
    history: {
      events: [
        event(familyAttributes.started),
        event(familyAttributes.patchMarker),
        event(familyAttributes.searchAttributeUpsert),
        event(familyAttributes.workflowTaskScheduled),
        event(familyAttributes.workflowTaskStarted),
        event(familyAttributes.workflowTaskCompleted),
        ...roleAttributes.map(event),
      ],
    },
    historySize: 4_096,
  };
}

function repeatedPair(
  first: string,
  second: string,
  count: number,
): string[] {
  return Array.from({ length: count }, () => [first, second]).flat();
}

function event(attributesName: string): Record<string, unknown> {
  return { [attributesName]: { present: true } };
}

function removeFirst(history: { events: unknown[] }, attributesName: string): void {
  const index = history.events.findIndex((candidate) =>
    candidate !== null &&
    typeof candidate === "object" &&
    Object.hasOwn(candidate, attributesName)
  );
  assert.notEqual(index, -1);
  history.events.splice(index, 1);
}

type MutableProductionRun = {
  runOrdinal: number;
  role: SequentialMultiInstanceHistoryRunRole;
  history: { events: unknown[] };
  historySize: number;
};

type MutableProductionEvidence = {
  topology: SequentialMultiInstanceHistoryTopology;
  runs: MutableProductionRun[];
};

type _EvidenceContract = SequentialMultiInstanceProductionHistoryEvidence;
type _HistoryContract = TemporalHistory;
