/**
 * The retained handler list must agree with the state it claims to describe, after every command.
 *
 * The accumulator caches each open body's attached-handler list so the publication completeness
 * relation can pair a firing deadline to its host without an activation ordinal. The continuation
 * decoder does not trust that cache: it recomputes the list from the restored `RuntimeState` and
 * refuses a payload that disagrees. Those two models are only ever equal if the cache tracks the
 * state, and this is the schedule that separates them.
 *
 * A non-interrupting boundary Timer is the one shape where a record's handler list changes while its
 * body stays open: firing the reminder empties `attachedTimers` and the host User Task wait survives.
 * A cache written once when the body opened would still name the withdrawn reminder, so the decoder
 * would refuse a correct publication and Continue-As-New would fail on a legal state.
 *
 * That failure is not hypothetical and is why this file exists rather than a comment: the class had no
 * coverage in any lane, port-free or otherwise, and was found by hand.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ScenarioStepKind,
  advanceScenario,
  attachedTimersForBodyAnchor,
  initialState,
} from "@bpmn-lean/semantic-core";

import {
  accumulateExecutionPublication,
  createExecutionPublicationState,
} from "../dist/execution-publication-state.js";
import {
  accumulateFlowNodeOccurrencePublication,
  createFlowNodeOccurrencePublicationState,
} from "../dist/flow-node-occurrence-publication-state.js";
import {
  fireReminder,
  instanceId,
  monitoredProgram,
  start,
} from "../../../semantic-core/test/monitored-task-fixture.ts";

/** Drives one stimulus through both accumulators and returns the committed post-state with them. */
function commit(state, occurrences, execution, stimulus, committedAtEpochMs) {
  const step = advanceScenario(monitoredProgram, state, stimulus);
  assert.ok(step.kind === ScenarioStepKind.Committed, "the fixture schedule must commit");
  const nextExecution = accumulateExecutionPublication(
    monitoredProgram,
    execution,
    stimulus,
    step,
  );
  const nextOccurrences = accumulateFlowNodeOccurrencePublication(
    monitoredProgram,
    occurrences,
    execution,
    nextExecution,
    stimulus,
    step,
    committedAtEpochMs,
  );
  return { state: step.state, occurrences: nextOccurrences, execution: nextExecution };
}

/** What the continuation decoder recomputes, for every retained entry. */
function disagreements(occurrences, state) {
  return occurrences.retainedOpen.flatMap((entry) => {
    const expected = attachedTimersForBodyAnchor(state, entry.anchor);
    return JSON.stringify(entry.attachedTimers) === JSON.stringify(expected)
      ? []
      : [{ anchor: entry.anchor, retained: entry.attachedTimers, expected }];
  });
}

test("the retained handler list tracks the record through a non-interrupting firing", () => {
  let carried = commit(
    initialState,
    createFlowNodeOccurrencePublicationState(monitoredProgram, instanceId),
    createExecutionPublicationState(monitoredProgram, instanceId),
    start,
    1_000,
  );

  // Anti-vacuity: arming must have cached a handler, or the comparison below is between two empties
  // and would hold for an accumulator that caches nothing.
  assert.equal(
    carried.occurrences.retainedOpen.filter(({ attachedTimers }) =>
      attachedTimers.length === 1
    ).length,
    1,
    "arming must cache exactly one host carrying its reminder",
  );
  assert.deepEqual(disagreements(carried.occurrences, carried.state), []);

  carried = commit(
    carried.state,
    carried.occurrences,
    carried.execution,
    fireReminder,
    2_000,
  );

  // The separating state: the reminder is withdrawn and the host is still open.
  assert.equal(
    carried.state.timerWaits.length,
    0,
    "firing must withdraw the reminder, or nothing separates the two models",
  );
  assert.ok(
    carried.state.userTaskWaits.length > 0,
    "the host must survive the firing, or the retained entry would have been removed instead",
  );
  assert.deepEqual(
    disagreements(carried.occurrences, carried.state),
    [],
    "a cache that disagrees with the state makes the continuation decoder refuse a legal state",
  );
});
