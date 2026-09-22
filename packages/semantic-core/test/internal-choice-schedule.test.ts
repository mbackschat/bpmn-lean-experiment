import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CommandOutcome, ControlStateKind, InternalSchedulingMode, SemanticOperationKind,
  initialState, isWellFormedSemanticProcessProgram, runtimeStateDefects,
  SemanticTransitionKind,
} from "@bpmn-lean/semantic-core";
import { program, sideProgram, instanceId, start, a, b, end, first, second } from "./internal-choice-schedule-fixture.ts";

const runtime = await import(new URL("../dist/semantic-process-runtime.js", import.meta.url).href) as
  typeof import("../src/semantic-process-runtime.ts");
const trace = await import(new URL("../dist/semantic-transition-trace.js", import.meta.url).href) as
  typeof import("../src/semantic-transition-trace.ts");

test("scheduled Merge chooses exact buckets in either order and reaches the same valid state", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  const ab = runtime.applyStimulusWithSchedule(program, initialState, start, [first, second], 8);
  const ba = runtime.applyStimulusWithSchedule({ ...program, operations: [...program.operations].reverse() },
    initialState, start, [{ ...first, selected: b }, { ordinal: 1, alternatives: [end, a], selected: end }], 8);
  assert.equal(ab.outcome, CommandOutcome.Committed);
  assert.equal(ab.scheduleFailure, null);
  assert.equal(ab.internalStepBoundExceeded, false);
  assert.equal(ab.ambiguousInternalChoice, false);
  assert.equal(ab.state.control.kind, ControlStateKind.Completed);
  assert.deepEqual(ab.state.controlTokens, []);
  assert.equal(ab.state.endOccurrences, 2);
  assert.deepEqual(runtimeStateDefects(program, instanceId, ab.state), []);
  assert.deepEqual(ba, ab);
});

test("schedule validation has exact missing, ordinal, alternatives, selected-member precedence", () => {
  const cases = [
    { schedule: [], failure: "missingDirective" },
    { schedule: [{ ordinal: 4, alternatives: [b, a], selected: end }], failure: "ordinalMismatch" },
    { schedule: [{ ordinal: 0, alternatives: [b, a], selected: end }], failure: "alternativesMismatch" },
    { schedule: [{ ordinal: 0, alternatives: [a, b], selected: end }], failure: "selectedAlternativeMissing" },
  ];
  for (const { schedule, failure } of cases) {
    const result = runtime.applyStimulusWithSchedule(program, initialState, start, schedule, 8);
    assert.deepEqual(result, { outcome: CommandOutcome.RolledBack, state: initialState,
      internalStepBoundExceeded: false, ambiguousInternalChoice: false, scheduleFailure: failure });
    assert.equal(result.state, initialState);
  }
});

test("selecting Merge before the competing End preserves observable output multiplicity", () => {
  const result = trace.applyStimulusWithScheduleAndTrace(program, initialState, start,
    [first, { ...second, selected: b }], 8);
  assert.equal(result.result.outcome, CommandOutcome.Committed);
  assert.equal(result.result.scheduleFailure, null);
  assert.equal(result.result.state.control.kind, ControlStateKind.Running);
  assert.equal(result.result.state.endOccurrences, 0);
  assert.equal(result.result.state.controlTokens.length, 1);
  assert.equal(result.result.state.controlTokens[0]?.placeId, "place:Output");
  assert.equal(result.result.state.controlTokens[0]?.multiplicity, 2);
  assert.deepEqual(runtimeStateDefects(program, instanceId, result.result.state), []);
  assert.deepEqual(trace.replayCommittedTransitions(program, initialState, result.committedTransitions), result.result.state);
});

test("late stale directive rolls back admission and the already selected Merge", () => {
  const result = runtime.evaluateScheduledStimulusWithSelectedSteps(program, initialState, start,
    [first, { ...second, alternatives: [a, b] }], 8);
  assert.equal(result.result.scheduleFailure, "alternativesMismatch");
  assert.equal(result.result.state, initialState);
  assert.equal(result.admittedState, null);
  assert.deepEqual(result.selectedInternalSteps, []);
  assert.deepEqual(result.selectedInternalBatches, []);
  assert.deepEqual(result.selectedInternalPreparations, []);
});

test("admission rejection precedes forbidden schedule and forbidden mode precedes closure", () => {
  const rejectProgram = { ...program, internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice };
  const rejected = runtime.applyStimulusWithSchedule(rejectProgram, initialState,
    { ...start, processId: "wrong-process" }, [first], 0);
  assert.equal(rejected.outcome, CommandOutcome.Rejected);
  assert.equal(rejected.scheduleFailure, null);
  const forbidden = runtime.applyStimulusWithSchedule(rejectProgram, initialState, start, [first], 0);
  assert.deepEqual(forbidden, { outcome: CommandOutcome.RolledBack, state: initialState,
    internalStepBoundExceeded: false, ambiguousInternalChoice: false, scheduleFailure: "scheduleForbiddenForMode" });
  const empty = runtime.applyStimulusWithSchedule(rejectProgram, initialState, start, [], 8);
  assert.equal(empty.ambiguousInternalChoice, true);
  assert.equal(empty.scheduleFailure, null);
  const { scheduleFailure: _failure, ...ordinary } = empty;
  assert.deepEqual(runtime.applyStimulus(rejectProgram, initialState, start, 8), ordinary);
});

test("fuel exhaustion precedes missing and stale directives and never reports unused input", () => {
  for (const [limit, schedule] of [[1, []], [3, [first, second, first]]] as const) {
    const result = runtime.applyStimulusWithSchedule(program, initialState, start, schedule, limit);
    assert.deepEqual(result, { outcome: CommandOutcome.RolledBack, state: initialState,
      internalStepBoundExceeded: true, ambiguousInternalChoice: false, scheduleFailure: null });
  }
});

test("only successful stable closure classifies trailing directives as unused", () => {
  const result = runtime.applyStimulusWithSchedule(program, initialState, start, [first, second, first], 8);
  assert.deepEqual(result, { outcome: CommandOutcome.RolledBack, state: initialState,
    internalStepBoundExceeded: false, ambiguousInternalChoice: false, scheduleFailure: "unusedDirective" });
});

test("exact command fuel commits and one fewer step rolls back every scheduled publication", () => {
  const exact = trace.applyStimulusWithScheduleAndTrace(program, initialState, start, [first, second], 7);
  assert.equal(exact.result.outcome, CommandOutcome.Committed);
  assert.equal(exact.result.state.control.kind, ControlStateKind.Completed);
  assert.equal(exact.committedTransitions.length, 8);
  const insufficient = trace.applyStimulusWithScheduleAndTrace(program, initialState, start, [first, second], 6);
  assert.deepEqual(insufficient.result, { outcome: CommandOutcome.RolledBack, state: initialState,
    internalStepBoundExceeded: true, ambiguousInternalChoice: false, scheduleFailure: null });
  assert.deepEqual(insufficient.committedTransitions, []);
  assert.deepEqual(insufficient.flowNodeOccurrenceLifecycles, []);
  assert.equal(insufficient.currentPositions, null);
});

test("scheduled trace publishes both selected Merge units and erases all late-failure publication", () => {
  const accepted = trace.applyStimulusWithScheduleAndTrace(program, initialState, start, [first, second], 8);
  assert.equal(accepted.result.outcome, CommandOutcome.Committed);
  assert.equal(accepted.committedTransitions.length, 8);
  assert.equal(accepted.flowNodeOccurrenceLifecycles.length, 8);
  assert.notEqual(accepted.currentPositions, null);
  assert.deepEqual(trace.replayCommittedTransitions(program, initialState, accepted.committedTransitions), accepted.result.state);
  const changedInput = accepted.committedTransitions.map((record) =>
    record.transition.kind === SemanticTransitionKind.InternalOperation &&
      record.transition.operationKind === SemanticOperationKind.MergeExclusive
      ? { ...record, positionDelta: { ...record.positionDelta,
          consumedTokens: record.positionDelta.consumedTokens.map((token) => ({ ...token, sequenceFlowId: "Fork" })) } }
      : record);
  assert.equal(trace.replayCommittedTransitions(program, initialState, changedInput), null);
  for (const schedule of [[first], [first, { ...second, ordinal: 3 }], [first, second, first]]) {
    const refused = trace.applyStimulusWithScheduleAndTrace(program, initialState, start, schedule, 8);
    assert.equal(refused.result.outcome, CommandOutcome.RolledBack);
    assert.equal(refused.result.state, initialState);
    assert.deepEqual(refused.committedTransitions, []);
    assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
    assert.equal(refused.currentPositions, null);
  }
});

test("universal normalization runs an independent operation before presenting the complete Merge choice", () => {
  assert.equal(isWellFormedSemanticProcessProgram(sideProgram), true);
  const result = trace.applyStimulusWithScheduleAndTrace(sideProgram, initialState, start, [first, second], 8);
  assert.equal(result.result.outcome, CommandOutcome.Committed);
  const selected = result.committedTransitions.flatMap(({ transition }) =>
    transition.kind === SemanticTransitionKind.InternalOperation ? [transition.operationId] : []);
  assert.deepEqual(selected, ["operation:Start", "operation:Fork", "operation:Side", "operation:Merge",
    "operation:End", "operation:Merge", "operation:End"]);
  assert.deepEqual(runtimeStateDefects(sideProgram, instanceId, result.result.state), []);
  assert.deepEqual(trace.applyStimulusWithScheduleAndTrace({ ...sideProgram, operations: [...sideProgram.operations].reverse() },
    initialState, start, [first, second], 8), result);
  const failed = runtime.evaluateScheduledStimulusWithSelectedSteps(sideProgram, initialState, start, [], 8);
  assert.equal(failed.result.scheduleFailure, "missingDirective");
  assert.equal(failed.result.state, initialState);
  assert.deepEqual(failed.selectedInternalSteps, []);
});
