import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyStimulusWithTrace,
  initialState,
  isWellFormedRuntimeState,
  replayCommittedTransitions,
  runtimeStateDefects,
  runtimeStateRegressions,
  type RuntimeState,
  type SemanticProcessProgram,
  type Stimulus,
} from "@bpmn-lean/semantic-core";

import {
  completionStimulus,
  parallelProgram,
  startStimulus,
} from "./parallel-fork-join-fixture.ts";
import {
  eventRaceProgram,
  eventRaceStart,
  messageDelivery,
  taskCompletion,
  timerFiring,
} from "./event-based-gateway-fixture.ts";
import {
  inclusiveCompletion,
  inclusiveProgram,
  inclusiveStart,
  present,
} from "./inclusive-gateway-fixture.ts";
import {
  callActivityCompletion,
  callActivityProgram,
  callActivityStart,
  expectedCalledInstanceId,
  instanceId as callerInstanceId,
} from "./call-activity-fixture.ts";

/**
 * Executable preservation for the runtime-state invariant: every state a committed transition
 * produces is one the account admits, and no successor rewinds its predecessor.
 *
 * This is the lane the approved owner decision requires before the fail-closed command gate, and it
 * is deliberately a lane rather than incidental coverage. The other gates run these scenarios and
 * would fail if the gate refused one, but nothing there states preservation as the property under
 * test, so a conjunct that held only by luck of the corpus would look the same. Here the property is
 * the assertion.
 *
 * It is executable evidence over a finite set of schedules, not a proof. The quantified obligation
 * over every registered transition arm is a separate open lane in Lean, and passage here cannot
 * substitute for it: a schedule these scenarios never reach can still break a conjunct.
 */

type Schedule = Readonly<{
  name: string;
  program: SemanticProcessProgram;
  instanceId: string;
  stimuli: ReadonlyArray<Stimulus>;
}>;

const schedules: ReadonlyArray<Schedule> = [
  {
    name: "parallel fork, both branches, join",
    program: parallelProgram,
    instanceId: "Instance_1",
    stimuli: [
      startStimulus(),
      completionStimulus("UserTask_A"),
      completionStimulus("UserTask_B"),
    ],
  },
  {
    name: "event race won by its message",
    program: eventRaceProgram,
    instanceId: "event-race-instance",
    stimuli: [eventRaceStart, messageDelivery(), taskCompletion("MessageTask")],
  },
  {
    name: "event race won by its timer",
    program: eventRaceProgram,
    instanceId: "event-race-instance",
    stimuli: [eventRaceStart, timerFiring(), taskCompletion("TimerTask")],
  },
  {
    name: "inclusive split selecting both branches, then joining",
    program: inclusiveProgram,
    instanceId: "inclusive-instance",
    stimuli: [
      inclusiveStart([present("a"), present("b")]),
      inclusiveCompletion("Task_A"),
      inclusiveCompletion("Task_B"),
    ],
  },
  {
    name: "call activity invoking and returning from a distinct instance",
    program: callActivityProgram,
    instanceId: callerInstanceId,
    // Carried through the called Process's own completion, so the schedule reaches a state holding
    // a live called instance and a wait owned by it. It does *not* exercise the instance scoping on
    // declaration: this fixture carries both scopes' operations in one program, so the called
    // instance's `Task_Called` wait is declared, and seeding the scoping away leaves this lane
    // green. What witnesses that scoping is a hand-built state in the incident-cancellation tests,
    // not any executed schedule here.
    stimuli: [
      callActivityStart(),
      callActivityCompletion(
        expectedCalledInstanceId,
        "Task_Called",
        "complete-called-task",
      ),
    ],
  },
];

/**
 * Every intermediate state, not only the stable ones the stimulus boundary exposes.
 *
 * Replaying the committed transitions is what reaches the microsteps: a stimulus can close over
 * several internal operations, and asserting only its result would leave every intermediate state
 * unchecked while looking like full coverage of the schedule.
 */
function committedStatesFor(
  program: SemanticProcessProgram,
  from: RuntimeState,
  stimulus: Stimulus,
): ReadonlyArray<RuntimeState> {
  const traced = applyStimulusWithTrace(program, from, stimulus);
  const records = traced.committedTransitions;
  if (records.length === 0) {
    return [];
  }
  // Replaying each prefix yields the state after each committed transition. `replayCommittedTransitions`
  // returns only the final state, so a single call would check the stimulus boundary and skip every
  // microstep inside it, which is where a closure of several internal operations lives.
  const states = records.map((_, index) => {
    const replayed = replayCommittedTransitions(
      program,
      from,
      records.slice(0, index + 1),
    );
    assert.notEqual(replayed, null, "every committed prefix must replay");
    return replayed as RuntimeState;
  });
  assert.deepEqual(
    states[states.length - 1],
    traced.result.state,
    "replaying every record must reproduce the traced result",
  );
  return states;
}

for (const { name, program, instanceId, stimuli } of schedules) {
  test(`preserves well-formedness across every committed transition: ${name}`, () => {
    let current = initialState;
    assert.deepEqual(runtimeStateDefects(program, instanceId, current), []);

    for (const stimulus of stimuli) {
      for (const successor of committedStatesFor(program, current, stimulus)) {
        assert.deepEqual(
          runtimeStateDefects(program, instanceId, successor),
          [],
          `${name} reached a state the account refuses`,
        );
        assert.deepEqual(
          runtimeStateRegressions(current, successor),
          [],
          `${name} produced a successor that rewinds its predecessor`,
        );
        current = successor;
      }
    }
  });
}

test("a refused command returns the received state, so preservation is trivial there", () => {
  const started = applyStimulusWithTrace(
    parallelProgram,
    initialState,
    startStimulus(),
  ).result.state;

  // Starting twice is refused. The refusal branch is worth asserting because it is the one path
  // that reaches no transformer at all, so a conjunct broken there would never be exercised by the
  // committed-transition loop above.
  const refused = applyStimulusWithTrace(parallelProgram, started, startStimulus());

  assert.deepEqual(refused.result.state, started);
  assert.equal(isWellFormedRuntimeState(parallelProgram, "Instance_1", refused.result.state), true);
});
