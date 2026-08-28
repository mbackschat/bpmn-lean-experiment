/**
 * Focused semantic-core behavior for the non-interrupting boundary Timer family.
 *
 * The oracle is the [approved capsule](../../../docs/capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md).
 * Three of its obligations can only be checked here: the reverse completion order, which the capsule
 * deliberately keeps out of the registered schedules because quiescent completion over two branches
 * is already closed evidence elsewhere; the pre-due firing, which no schedule can present because
 * the Temporal lane derives its firing instant from the committed deadline; and the checked non-law
 * that the first End Event does not complete the Process, which needs the two-branch state exhibited
 * rather than asserted.
 *
 * `NBTIMER-SPAWN-01`'s host preservation is checked as exact identity on the task wait, not as a
 * count: an implementation that removed and re-added the wait would keep the count and break the
 * occurrence identity its caller holds.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  RuntimeStateDefect,
  RuntimeStateRegression,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticTransitionKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  applyStimulusWithTrace,
  initialState,
  projectOpenUserTasks,
  replayCommittedTransitions,
  runtimeStateDefects,
  runtimeStateRegressions,
} from "@bpmn-lean/semantic-core";

import {
  completeMonitoredTask,
  fireReminder,
  instanceId,
  monitoredProgram,
  owner,
  reminderId,
  start,
  taskId,
} from "./monitored-task-fixture.ts";

function armed() {
  const started = applyStimulus(monitoredProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

function armingPair() {
  const traced = applyStimulusWithTrace(monitoredProgram, initialState, start);
  const index = traced.committedTransitions.findIndex(({ transition }) =>
    transition.kind === SemanticTransitionKind.InternalOperation &&
    transition.operationKind === SemanticOperationKind.AwaitMonitoredUserTask
  );
  assert.ok(index > 0, "the start trace must contain monitored-task arming");
  const before = replayCommittedTransitions(
    monitoredProgram,
    initialState,
    traced.committedTransitions.slice(0, index),
  );
  const after = replayCommittedTransitions(
    monitoredProgram,
    initialState,
    traced.committedTransitions.slice(0, index + 1),
  );
  assert.ok(before !== null);
  assert.ok(after !== null);
  return { before, after };
}

function completeTask(state: ReturnType<typeof armed>, elementId: string) {
  const wait = state.userTaskWaits.find(
    (candidate) => candidate.id.elementId === elementId,
  );
  assert.ok(wait, `no open task named ${elementId}`);
  return applyStimulus(monitoredProgram, state, {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: wait.id,
    submittedValues: [],
  });
}

test("start arms the monitored task and its deadline together at logical time zero", () => {
  const state = armed();

  assert.deepEqual(state.control, {
    kind: ControlStateKind.Running,
    instanceId,
  });
  assert.equal(state.logicalTimeMs, 0);
  assert.deepEqual(state.userTaskWaits.map(({ id }) => id), [taskId]);
  assert.deepEqual(state.timerWaits, [
    {
      id: reminderId,
      owner,
      deadlineMs: 1000,
      output: "place:Flow_Boundary",
    },
  ]);
  assert.deepEqual(state.controlTokens, []);
  const pair = armingPair();
  assert.equal(
    runtimeStateDefects(monitoredProgram, instanceId, pair.after).includes(
      RuntimeStateDefect.DuplicateActivityBodyClaim,
    ),
    false,
    "monitored User Task arming inserts a disjoint Activity body claim",
  );
  assert.equal(
    runtimeStateRegressions(pair.before, pair.after).includes(
      RuntimeStateRegression.ActivityOccurrenceIssue,
    ),
    false,
    "the monitored-task evaluator issues above the predecessor Activity mark",
  );
});

test("firing spawns the handler branch and preserves its host exactly", () => {
  const state = armed();
  const spawned = applyStimulus(monitoredProgram, state, fireReminder);

  assert.equal(spawned.outcome, CommandOutcome.Committed);
  assert.equal(spawned.state.logicalTimeMs, 1000);
  assert.deepEqual(spawned.state.timerWaits, []);
  // The host's own wait must be the same value, not an equal replacement: the caller holds this
  // occurrence identity, and `NBTIMER-SPAWN-01` forbids removing and re-adding it.
  const monitored = spawned.state.userTaskWaits.find(
    (candidate) => candidate.id.elementId === "MonitoredTask",
  );
  assert.equal(monitored, state.userTaskWaits[0]);
  assert.deepEqual(
    runtimeStateRegressions(state, spawned.state),
    [],
    "withdrawing the handler preserves the exact host Activity identity",
  );
  assert.equal(
    runtimeStateDefects(monitoredProgram, instanceId, spawned.state).includes(
      RuntimeStateDefect.DuplicateActivityBodyClaim,
    ),
    false,
    "claim-projection-preserving spawn keeps every Activity body claim",
  );
  assert.deepEqual(
    spawned.state.userTaskWaits.map(({ id }) => id.elementId).sort(),
    ["HandlerTask", "MonitoredTask"],
  );
  // The monitored element's own counter must not move. The handler task's counter does move, because
  // internal closure arms it from the token the spawn produced, which is the branch starting rather
  // than the host being re-activated.
  assert.deepEqual(
    spawned.state.taskActivations.find(
      ({ elementId }) => elementId === "MonitoredTask",
    ),
    { elementId: "MonitoredTask", count: 1 },
  );
  assert.deepEqual(spawned.state.timerActivations, state.timerActivations);
  assert.deepEqual(spawned.state.variables, state.variables);
});

test("firing produces the boundary token and no normal token", () => {
  // The sibling family's firing routes to its boundary place too, so the discriminator is not which
  // place receives a token but that the host is still open to produce the normal one later.
  const spawned = applyStimulus(monitoredProgram, armed(), fireReminder);

  assert.equal(spawned.outcome, CommandOutcome.Committed);
  assert.equal(
    spawned.state.controlTokens.some(
      ({ placeId }) => placeId === "place:Flow_Normal",
    ),
    false,
  );
  assert.deepEqual(
    projectOpenUserTasks(spawned.state).map(({ id }) => id.elementId).sort(),
    ["HandlerTask", "MonitoredTask"],
  );
});

test("completing before the deadline withdraws it and opens only the normal route", () => {
  const completed = applyStimulus(
    monitoredProgram,
    armed(),
    completeMonitoredTask,
  );

  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(completed.state.timerWaits, []);
  assert.equal(completed.state.logicalTimeMs, 0);
  assert.deepEqual(
    completed.state.userTaskWaits.map(({ id }) => id.elementId),
    ["NormalTask"],
  );
});

test("completing after the deadline fired is accepted, not refused", () => {
  // The one-sided join. A monitored task with no live deadline is the normal post-firing state, so a
  // family requiring both waits would reject this and strand the host.
  const spawned = applyStimulus(monitoredProgram, armed(), fireReminder);
  assert.equal(spawned.outcome, CommandOutcome.Committed);

  const completed = applyStimulus(
    monitoredProgram,
    spawned.state,
    completeMonitoredTask,
  );

  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(
    completed.state.userTaskWaits.map(({ id }) => id.elementId).sort(),
    ["HandlerTask", "NormalTask"],
  );
});

test("a withdrawn deadline can never fire afterwards", () => {
  const completed = applyStimulus(
    monitoredProgram,
    armed(),
    completeMonitoredTask,
  );
  assert.equal(completed.outcome, CommandOutcome.Committed);

  const stale = applyStimulus(monitoredProgram, completed.state, fireReminder);

  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, completed.state);
});

test("the consumed deadline cannot fire a second time", () => {
  const spawned = applyStimulus(monitoredProgram, armed(), fireReminder);
  assert.equal(spawned.outcome, CommandOutcome.Committed);

  const again = applyStimulus(monitoredProgram, spawned.state, fireReminder);

  assert.equal(again.outcome, CommandOutcome.Rejected);
  assert.deepEqual(again.state, spawned.state);
});

test("every off-deadline firing rejects with the armed pair preserved", () => {
  const state = armed();
  // 999 is the capsule's pre-due witness; 1001 is its mirror, because a core comparing with `>=`
  // instead of `=` would accept one and refuse the other.
  for (const logicalTimeMs of [1, 999, 1001, 2000]) {
    const rejected = applyStimulus(monitoredProgram, state, {
      ...fireReminder,
      commandId: `fire-reminder-at-${logicalTimeMs}`,
      logicalTimeMs,
    });

    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, state);
  }
});

test("a refused pre-due firing leaves the exact deadline still able to spawn", () => {
  const state = armed();
  const refused = applyStimulus(monitoredProgram, state, {
    ...fireReminder,
    commandId: "fire-reminder-early",
    logicalTimeMs: 999,
  });
  assert.equal(refused.outcome, CommandOutcome.Rejected);

  const spawned = applyStimulus(monitoredProgram, refused.state, fireReminder);

  assert.equal(spawned.outcome, CommandOutcome.Committed);
  assert.equal(spawned.state.logicalTimeMs, 1000);
});

test("a wrong occurrence identity rejects with state preserved", () => {
  const state = armed();
  const wrongIdentities = [
    { ...reminderId, activation: 2 },
    { ...reminderId, elementId: "MonitoredTask" },
    { ...reminderId, processInstanceId: "MonitoredInstance_2" },
  ];
  for (const timerId of wrongIdentities) {
    const rejected = applyStimulus(monitoredProgram, state, {
      ...fireReminder,
      commandId: `fire-wrong-${timerId.elementId}-${timerId.activation}`,
      timerId,
    });

    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, state);
  }
});

test("a non-empty submission to the monitored task is refused rather than ignored", () => {
  const state = armed();
  const patched = applyStimulus(monitoredProgram, state, {
    ...completeMonitoredTask,
    submittedValues: [
      {
        name: "note",
        value: { kind: VariableValueKind.String, value: "late" },
      },
    ],
  });

  assert.equal(patched.outcome, CommandOutcome.Rejected);
  assert.deepEqual(patched.state, state);
});

/**
 * `NBTIMER-QUIESCE-01`'s checked non-law, in both completion orders.
 *
 * The registered schedule completes the handler first, which is the order in which an implementation
 * completing at the first End Event is publicly wrong. The reverse order lives here rather than as a
 * third scenario, because quiescent completion over two concurrent branches is already closed
 * evidence in the ordinary Sub-Process capsule.
 */
for (const [first, second] of [
  ["HandlerTask", "NormalTask"],
  ["NormalTask", "HandlerTask"],
] as const) {
  test(`the Process completes only after both branches, ${first} first`, () => {
    const spawned = applyStimulus(monitoredProgram, armed(), fireReminder);
    assert.equal(spawned.outcome, CommandOutcome.Committed);
    // Completing the host opens the normal follow-on, so both branches are live before either ends.
    const hostDone = applyStimulus(
      monitoredProgram,
      spawned.state,
      completeMonitoredTask,
    );
    assert.equal(hostDone.outcome, CommandOutcome.Committed);

    const afterFirst = completeTask(hostDone.state, first);
    assert.equal(afterFirst.outcome, CommandOutcome.Committed);
    assert.equal(afterFirst.state.control.kind, ControlStateKind.Running);
    assert.deepEqual(
      afterFirst.state.userTaskWaits.map(({ id }) => id.elementId),
      [second],
    );

    const afterSecond = completeTask(afterFirst.state, second);
    assert.equal(afterSecond.outcome, CommandOutcome.Committed);
    assert.deepEqual(afterSecond.state.control, {
      kind: ControlStateKind.Completed,
      instanceId,
    });
    assert.deepEqual(afterSecond.state.userTaskWaits, []);
    assert.deepEqual(afterSecond.state.controlTokens, []);
  });
}
