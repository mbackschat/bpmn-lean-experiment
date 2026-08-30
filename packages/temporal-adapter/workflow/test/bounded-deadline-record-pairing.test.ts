import assert from "node:assert/strict";
import test from "node:test";

import {
  ActivityBodyKind,
  ActivityHandlerKind,
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  RuntimeState,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  boundedActivityDeadlineFamily,
  createBoundedDeadlineScheduler,
} from "../dist/index.js";

/**
 * The host pairs a boundary deadline with its Activity through the ownership record, not through
 * whole-state wait cardinality.
 *
 * The retired form required `timerWaits.length === 1` to find the deadline and `userTaskWaits.length
 * === 1` to call its body live. Both are statements about the entire runtime state, and they agreed
 * with the Activity only because every profile admitting a boundary deadline admits nothing
 * concurrent with it. The discriminating states here are exactly the ones that assumption forbids: a
 * second live wait of each kind, concurrent with the bounded Activity and belonging to no boundary.
 *
 * Constructed rather than executed. No registered profile admits a boundary deadline beside a
 * concurrent wait, so the separating state is unreachable by schedule and is handed to the host
 * directly; the core-side refusals for the same class live with the semantic core.
 */

const boundaryTimerElementId = "Timer_ReviewDeadline";
const taskElementId = "Task_ReviewClaim";
const instanceId = "instance-1";

const boundedProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-bounded-activity-deadline-draft",
    sourceId: "bounded-deadline-record-pairing-test",
    sourceOverlay: null,
    sourceSha256: "d".repeat(64),
  },
  processId: "Process_Claim",
  definitionScopes: [
    { id: "scope:Process_Claim", parentScopeId: null, originElementId: "Process_Claim" },
  ],
  operationScopes: [{ operationId: "operation:Task_ReviewClaim", scopeId: "scope:Process_Claim" }],
  controlPlaceScopes: ([
    ["place:Reviewed", "scope:Process_Claim"],
    ["place:ToReview", "scope:Process_Claim"],
    ["place:Escalated", "scope:Process_Claim"],
  ] as const).map(([controlPlaceId, scopeId]) => ({ controlPlaceId, scopeId })),
  controlPlaces: ["Escalated", "Reviewed", "ToReview"].map((elementId) => ({
    id: `place:${elementId}`,
    origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId },
  })),
  operations: [
    {
      id: "operation:Task_ReviewClaim",
      kind: SemanticOperationKind.AwaitBoundedUserTask,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: taskElementId },
      input: "place:ToReview",
      task: { elementId: taskElementId, name: "Review claim", output: "place:Reviewed" },
      boundaryTimer: {
        elementId: boundaryTimerElementId,
        durationMs: 1_000,
        output: "place:Escalated",
        origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Escalated" },
      },
    },
  ],
} as const satisfies SemanticProcessProgram;

const owner = {
  processInstanceId: instanceId,
  definitionScopeId: "scope:Process_Claim",
  activation: 1,
} as const;

const taskId = { processInstanceId: instanceId, elementId: taskElementId, activation: 1 } as const;
const deadlineId = {
  processInstanceId: instanceId,
  elementId: boundaryTimerElementId,
  activation: 1,
} as const;

/**
 * One armed bounded Activity, optionally beside waits that belong to no boundary.
 *
 * `deadlineMs` is 1000 against a zero clock because `requireManagedDeadline` also checks the exact
 * remaining duration, so a state meant to separate the pairing rule must not fail that check instead.
 */
function armedState(
  concurrent: Readonly<{ tasks?: true; timers?: true }> = {},
): RuntimeState {
  return {
    ...initialState,
    scopeOccurrences: [{ id: owner, parent: null }],
    activityOccurrences: [{
      id: { processInstanceId: instanceId, activityElementId: taskElementId, activation: 1 },
      owner,
      operationId: "operation:Task_ReviewClaim",
      body: { kind: ActivityBodyKind.UserTask, task: taskId },
      attachedHandlers: [{ kind: ActivityHandlerKind.Timer, occurrence: deadlineId }],
    }],
    userTaskWaits: [
      { id: taskId, owner, name: "Review claim", output: "place:Reviewed" },
      ...(concurrent.tasks === true
        ? [{
          id: { processInstanceId: instanceId, elementId: "Task_Unrelated", activation: 1 },
          owner,
          name: "Unrelated task",
          output: "place:Reviewed",
        }]
        : []),
    ],
    timerWaits: [
      { id: deadlineId, owner, deadlineMs: 1_000, output: "place:Escalated" },
      ...(concurrent.timers === true
        ? [{
          id: { processInstanceId: instanceId, elementId: "Timer_Unrelated", activation: 1 },
          owner,
          deadlineMs: 5_000,
          output: "place:Reviewed",
        }]
        : []),
    ],
  };
}

function scheduler() {
  return createBoundedDeadlineScheduler(
    boundedProgram,
    async () => {},
    boundedActivityDeadlineFamily,
  );
}

const completion: CompleteUserTaskInstanceStimulus = {
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-review",
  taskId,
  submittedValues: [],
};

test("owns its committed deadline beside a concurrent wait of each kind", () => {
  for (const concurrent of [{}, { tasks: true }, { timers: true }, { tasks: true, timers: true }]) {
    const state = armedState(concurrent);
    // The witness must keep the cardinality the retired rule read, or it stops separating the two
    // rules and this test passes for a state both of them accept.
    assert.equal(state.userTaskWaits.length, concurrent.tasks === true ? 2 : 1);
    assert.equal(state.timerWaits.length, concurrent.timers === true ? 2 : 1);
    assert.equal(scheduler().ownsCommittedDeadline(state), true, JSON.stringify(concurrent));
    // Reconciliation runs `requireManagedDeadline`, so a live body under the retired
    // `userTaskWaits.length === 1` rule would raise the host invariant failure here instead.
    // `recordCompletionCallback` is not asserted on this side: past the pairing decision it tags the
    // callback by Workflow activation, which needs a Workflow Execution. Its refusal branch returns
    // before that and is covered below.
    assert.doesNotThrow(() => scheduler().reconcileCommittedState(state));
  }
});

test("refuses a deadline whose own body is gone, and owns none without a record", () => {
  const withoutBody: RuntimeState = { ...armedState(), userTaskWaits: [] };
  assert.equal(scheduler().ownsCommittedDeadline(withoutBody), true);
  assert.throws(
    () => scheduler().reconcileCommittedState(withoutBody),
    /Managed bounded Activity is not one task with an exact PT1S boundary deadline/,
  );

  const withoutRecord: RuntimeState = { ...armedState(), activityOccurrences: [] };
  assert.equal(scheduler().ownsCommittedDeadline(withoutRecord), false);
  assert.equal(scheduler().recordCompletionCallback(withoutRecord, completion), false);
});

test("refuses two records claiming a deadline of the same family as ambiguous", () => {
  const armed = armedState();
  const [record] = armed.activityOccurrences;
  assert.notEqual(record, undefined);
  const ambiguous: RuntimeState = {
    ...armed,
    activityOccurrences: [
      ...armed.activityOccurrences,
      {
        ...record!,
        id: { processInstanceId: instanceId, activityElementId: taskElementId, activation: 2 },
      },
    ],
  };
  assert.equal(scheduler().ownsCommittedDeadline(ambiguous), false);
});
