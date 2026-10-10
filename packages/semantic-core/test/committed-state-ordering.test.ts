import assert from "node:assert/strict";
import test from "node:test";
import {
  CommandOutcome,
  RuntimeStateDefect,
  SemanticOperationKind,
  StimulusKind,
  applyStimulus,
  compareCanonicalStrings,
  initialState,
  isGateAdmissibleRuntimeState,
  runtimeStateDefects,
  type RuntimeState,
} from "@bpmn-lean/semantic-core";
import { boundedProgram, completeBoundedTask, instanceId, start } from "./bounded-task-fixture.ts";
import { frontier, program } from "./internal-commutation-fixture.ts";

import { parallelCommandInputs } from "../../bpmn-source/test/parallel-scope-command-fixture.ts";
const { parallelScopeCommandCapacity } = await import(
  new URL("../dist/parallel-scope-command-admission.js", import.meta.url).href,
) as typeof import("../src/parallel-scope-command-admission.ts");
const { parallelScopeCheckpointValid } = await import(
  new URL("../dist/parallel-scope-state-validation.js", import.meta.url).href,
) as typeof import("../src/parallel-scope-state-validation.ts");
const pmis = (await parallelCommandInputs()).find(({ count }) => count === 2)!;
const pmisStarted = applyStimulus(pmis.program, initialState, pmis.start);
assert.equal(pmisStarted.outcome, CommandOutcome.Committed);
assert.equal(parallelScopeCheckpointValid(pmis.program, pmisStarted.state), true);
const pmisCompletion = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "complete-retained-probe",
  taskId: pmisStarted.state.userTaskWaits[0]!.id, submittedValues: [] } as const;
assert.ok(parallelScopeCommandCapacity(pmis.program, pmisStarted.state, pmisCompletion));
assert.equal(applyStimulus(pmis.program, pmisStarted.state, pmisCompletion).outcome, CommandOutcome.Committed);

const issued = applyStimulus(boundedProgram, initialState, start);
assert.equal(issued.outcome, CommandOutcome.Committed);
assert.deepEqual(runtimeStateDefects(boundedProgram, instanceId, issued.state), []);

const counterCollections = [
  "taskActivations", "messageActivations", "timerActivations", "effectActivations",
  "activityActivations", "scopeActivations", "callActivations", "eventRaceActivations",
] as const;

function duplicateCounter(state: RuntimeState, field: typeof counterCollections[number],
  elementId = "Retained_Probe"): RuntimeState {
  return { ...state, [field]: [...state[field],
    { elementId, count: 5 }, { elementId, count: 9 },
  ].sort((left, right) => compareCanonicalStrings(left.elementId, right.elementId)) };
}

const taskProgram = { ...program, operations: program.operations.filter(
  ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
) };
const taskFrontier = { ...frontier, controlTokens: frontier.controlTokens.slice(0, 1) };
const frontierInstanceId = taskFrontier.scopeOccurrences[0]!.id.processInstanceId;

for (const field of counterCollections) {
  test(`the command gate rejects a duplicated ${field} key with unequal high-water marks`, () => {
    const candidate = duplicateCounter(issued.state, field);
    assert.deepEqual(runtimeStateDefects(boundedProgram, instanceId, candidate), [
      RuntimeStateDefect.UnorderedCollection,
    ]);
    assert.equal(isGateAdmissibleRuntimeState(boundedProgram, instanceId, candidate), false);
  });

  test(`PMIS command/frontier ingress and checkpoint reject the same duplicated ${field} key`, () => {
    const candidate = duplicateCounter(pmisStarted.state, field);
    assert.equal(parallelScopeCommandCapacity(pmis.program, candidate, pmisCompletion), undefined);
    assert.equal(parallelScopeCheckpointValid(pmis.program, candidate), false);
    const result = applyStimulus(pmis.program, candidate, pmisCompletion);
    assert.equal(result.outcome, CommandOutcome.Rejected);
    assert.deepEqual(result.state, candidate);
    const beforeStart = duplicateCounter(initialState, field);
    assert.equal(parallelScopeCommandCapacity(pmis.program, beforeStart, pmis.start), undefined);
    const started = applyStimulus(pmis.program, beforeStart, pmis.start);
    assert.equal(started.outcome, CommandOutcome.Rejected);
    assert.deepEqual(started.state, beforeStart);
  });
}

test("a command cannot replace duplicate retained counter marks 5 and 9 with issued mark 6", () => {
  const control = applyStimulus(boundedProgram, issued.state, completeBoundedTask);
  assert.equal(control.outcome, CommandOutcome.Committed);
  const candidate = duplicateCounter(issued.state, "taskActivations", "NormalTask");
  const result = applyStimulus(boundedProgram, candidate, completeBoundedTask);
  assert.deepEqual({ outcome: result.outcome, counters: result.state.taskActivations },
    { outcome: CommandOutcome.Rejected, counters: candidate.taskActivations });
  assert.deepEqual(result.state, candidate);
});

test("retained duplicate counter keys are also refused before an initial Start", () => {
  const candidate = duplicateCounter(initialState, "taskActivations", "BoundedTask");
  const result = applyStimulus(boundedProgram, candidate, start);
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.deepEqual(result.state, candidate);
});

test("one positive token bucket preserves multiplicity while duplicate buckets are refused", () => {
  const token = taskFrontier.controlTokens[0]!;
  const counted = { ...taskFrontier, controlTokens: [{ ...token, multiplicity: 2 }] };
  assert.deepEqual(runtimeStateDefects(taskProgram, frontierInstanceId, counted), []);
  assert.equal(isGateAdmissibleRuntimeState(taskProgram, frontierInstanceId, counted), true);
  const duplicated = { ...taskFrontier, controlTokens: [token, { ...token, multiplicity: 2 }] };
  assert.deepEqual(runtimeStateDefects(taskProgram, frontierInstanceId, duplicated), [
    RuntimeStateDefect.UnorderedCollection,
  ]);
  assert.equal(isGateAdmissibleRuntimeState(taskProgram, frontierInstanceId, duplicated), false);
});

test("a zero-multiplicity bucket cannot pass the command gate", () => {
  const token = taskFrontier.controlTokens[0]!;
  const empty = { ...taskFrontier, controlTokens: [{ ...token, multiplicity: 0 }] };
  assert.equal(isGateAdmissibleRuntimeState(taskProgram, frontierInstanceId, empty), false);
});
