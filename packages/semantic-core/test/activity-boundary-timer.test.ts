/**
 * Focused semantic-core behavior for the interrupting Activity boundary Timer family.
 *
 * The oracle is the [approved capsule](../../../docs/capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md).
 * Every peer family has a test at this level and this one did not: its transition family reached the
 * differential pipeline only through the two victory schedules, and neither of those submits an
 * off-deadline firing. So the pre-due refusal — the capsule's own arming-instant discriminator, and
 * the exposure it calls its largest — was checked in Lean alone.
 *
 * That matters because the two targets are independent implementations. A quantified Lean law says
 * nothing about this core, and the registered scenario that would have covered it cannot exist: the
 * Temporal lane derives the firing from its own committed deadline and admits exactly one, so no
 * schedule can present an early firing to any target. This is where the core's refusal is checked.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  applyStimulus,
  initialState,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

const sourceSha256 =
  "564a36ffc3815bbadc78d739892ae1e74c7137ff44beaa76eb20fad47401f30e";
const instanceId = "BoundedInstance_1";

/** Hand-built to the shape `@bpmn-lean/bpmn-source` lowers, so this lane depends on no compiler. */
const boundedProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-activity-boundary-timer-draft",
    sourceId: "activity-boundary-timer",
    sourceOverlay: null,
    sourceSha256,
  },
  processId: "Process_ActivityBoundaryTimer",
  controlPlaces: [
    controlPlace("Flow_Boundary"),
    controlPlace("Flow_Boundary_End"),
    controlPlace("Flow_Normal"),
    controlPlace("Flow_Normal_End"),
    controlPlace("Flow_Start"),
  ],
  operations: [
    {
      ...operationBase("BoundaryEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Boundary_End",
    },
    {
      ...operationBase("BoundaryTask"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Boundary",
      output: "place:Flow_Boundary_End",
      task: { elementId: "BoundaryTask", name: "Deadline reached" },
    },
    {
      ...operationBase("BoundedTask"),
      kind: SemanticOperationKind.AwaitBoundedUserTask,
      input: "place:Flow_Start",
      task: {
        elementId: "BoundedTask",
        name: "Bounded work",
        output: "place:Flow_Normal",
      },
      boundaryTimer: {
        elementId: "Deadline",
        durationMs: 1000,
        output: "place:Flow_Boundary",
        origin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: "Flow_Boundary",
        },
      },
    },
    {
      ...operationBase("NormalEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Normal_End",
    },
    {
      ...operationBase("NormalTask"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Normal",
      output: "place:Flow_Normal_End",
      task: { elementId: "NormalTask", name: "Normal follow-on" },
    },
    {
      ...operationBase("Start"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_Start",
    },
  ],
});

const owner = rootScopeOccurrence(boundedProgram.processId, instanceId);

const taskId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "BoundedTask",
  activation: 1,
});

const deadlineId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "Deadline",
  activation: 1,
});

const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-bounded",
  processId: boundedProgram.processId,
  instanceId,
  initialVariables: [],
});

const completeBoundedTask = Object.freeze({
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-bounded-task",
  taskId,
  submittedValues: [],
});

const fireDeadline = Object.freeze({
  kind: StimulusKind.FireTimer,
  commandId: "fire-deadline",
  timerId: deadlineId,
  logicalTimeMs: 1000,
});

function armed() {
  const started = applyStimulus(boundedProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

test("start arms the bounded task and its deadline together at logical time zero", () => {
  const state = armed();

  assert.deepEqual(state.control, {
    kind: ControlStateKind.Running,
    instanceId,
  });
  assert.equal(state.logicalTimeMs, 0);
  assert.deepEqual(state.userTaskWaits.map(({ id }) => id), [taskId]);
  assert.deepEqual(state.timerWaits, [
    {
      id: deadlineId,
      owner,
      deadlineMs: 1000,
      output: "place:Flow_Boundary",
    },
  ]);
  assert.deepEqual(state.controlTokens, []);
});

test("the Activity victory withdraws its own deadline and opens the normal route", () => {
  const won = applyStimulus(boundedProgram, armed(), completeBoundedTask);

  assert.equal(won.outcome, CommandOutcome.Committed);
  assert.deepEqual(won.state.timerWaits, []);
  assert.equal(won.state.logicalTimeMs, 0);
  assert.deepEqual(
    won.state.userTaskWaits.map(({ id }) => id.elementId),
    ["NormalTask"],
  );
});

test("the deadline victory withdraws the bounded task and opens the boundary route", () => {
  const won = applyStimulus(boundedProgram, armed(), fireDeadline);

  assert.equal(won.outcome, CommandOutcome.Committed);
  assert.deepEqual(won.state.timerWaits, []);
  assert.equal(won.state.logicalTimeMs, 1000);
  assert.deepEqual(
    won.state.userTaskWaits.map(({ id }) => id.elementId),
    ["BoundaryTask"],
  );
});

test("every off-deadline firing rejects with the armed pair and its deadline preserved", () => {
  const state = armed();
  // 999 is the capsule's own pre-due witness; 1001 is its mirror, because a core that compared with
  // `>=` instead of `=` would accept one and refuse the other.
  for (const logicalTimeMs of [1, 999, 1001, 2000]) {
    const rejected = applyStimulus(boundedProgram, state, {
      ...fireDeadline,
      commandId: `fire-deadline-at-${logicalTimeMs}`,
      logicalTimeMs,
    });

    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    // Exact state equality is the assertion the capsule requires: no deadline drift, no withdrawn
    // arm, and no advance of logical time toward the refused instant.
    assert.deepEqual(rejected.state, state);
  }
});

test("a refused pre-due firing leaves the exact deadline still able to win", () => {
  const state = armed();
  const refused = applyStimulus(boundedProgram, state, {
    ...fireDeadline,
    commandId: "fire-deadline-at-999",
    logicalTimeMs: 999,
  });
  assert.equal(refused.outcome, CommandOutcome.Rejected);

  const won = applyStimulus(boundedProgram, refused.state, fireDeadline);

  assert.equal(won.outcome, CommandOutcome.Committed);
  assert.equal(won.state.logicalTimeMs, 1000);
  assert.deepEqual(
    won.state.userTaskWaits.map(({ id }) => id.elementId),
    ["BoundaryTask"],
  );
});

test("every wrong deadline identity rejects with exact state preservation", () => {
  const state = armed();
  const mutations = [
    { processInstanceId: "Other_Instance" },
    { elementId: "BoundedTask" },
    { elementId: "Other_Timer" },
    { activation: 2 },
  ];

  for (const mutation of mutations) {
    const rejected = applyStimulus(boundedProgram, state, {
      ...fireDeadline,
      commandId: `fire-wrong-${JSON.stringify(mutation)}`,
      timerId: { ...deadlineId, ...mutation },
    });

    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, state);
  }
});

test("each victory makes the sibling arm ineligible without changing state", () => {
  const afterActivity = applyStimulus(
    boundedProgram,
    armed(),
    completeBoundedTask,
  ).state;
  const staleDeadline = applyStimulus(
    boundedProgram,
    afterActivity,
    fireDeadline,
  );
  assert.equal(staleDeadline.outcome, CommandOutcome.Rejected);
  assert.deepEqual(staleDeadline.state, afterActivity);

  const afterDeadline = applyStimulus(boundedProgram, armed(), fireDeadline)
    .state;
  const staleCompletion = applyStimulus(
    boundedProgram,
    afterDeadline,
    completeBoundedTask,
  );
  assert.equal(staleCompletion.outcome, CommandOutcome.Rejected);
  assert.deepEqual(staleCompletion.state, afterDeadline);
});
