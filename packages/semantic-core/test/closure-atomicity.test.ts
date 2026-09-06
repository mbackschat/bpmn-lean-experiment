import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  CommandOutcome,
  ScenarioOutcomeKind,
  ScenarioStepKind,
  advanceScenario,
  applyStimulus,
  applyStimulusWithTrace,
  evaluateStimulusWithSelectedSteps,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  Scenario,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";

import {
  completionStimulus,
  parallelProgram,
  startStimulus,
} from "./parallel-fork-join-fixture.ts";
import { requiredAt } from "./canonical-observations.ts";
import { semanticProcessFor } from "./user-task-fixture.ts";

test("a start whose closure exhausts fuel rolls back admission and every internal prefix", () => {
  assertBoundRollback(parallelProgram, initialState, startStimulus(), 2);
});

test("completion fuel failure restores the original wait, counters, and ownership", () => {
  const started = applyStimulus(parallelProgram, initialState, startStimulus());
  assert.equal(started.outcome, CommandOutcome.Committed);
  const afterA = applyStimulus(
    parallelProgram,
    started.state,
    completionStimulus("UserTask_A"),
  );
  assert.equal(afterA.outcome, CommandOutcome.Committed);
  assert.deepEqual(afterA.state.userTaskWaits.map((wait) => wait.id.elementId), ["UserTask_B"]);
  const completion = completionStimulus("UserTask_B");
  assertBoundRollback(parallelProgram, afterA.state, completion, 0);
  const completed = applyStimulus(parallelProgram, afterA.state, completion);
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.equal(completed.internalStepBoundExceeded, false);
  assert.equal(completed.ambiguousInternalChoice, false);
});

test("completion rollback erases admitted Process-data changes", async () => {
  const scenario = JSON.parse(await readFile(new URL(
    "../../../scenarios/user-task-discovery-completion/scenario.json",
    import.meta.url,
  ), "utf8")) as Scenario;
  const program = semanticProcessFor(scenario);
  const start = requiredAt(scenario.stimuli, 0, "start stimulus");
  const completion = requiredAt(scenario.stimuli, 1, "completion stimulus");
  const started = applyStimulus(program, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.ok(started.state.variables.process.bindings.length > 0);
  assertBoundRollback(program, started.state, completion, 0);
  const completed = applyStimulus(program, started.state, completion);
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.notDeepEqual(completed.state.variables, started.state.variables);
});

test("successful and admission-rejected commands expose both false closure flags", () => {
  const started = applyStimulus(parallelProgram, initialState, startStimulus());
  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.equal(started.internalStepBoundExceeded, false);
  assert.equal(started.ambiguousInternalChoice, false);
  const rejected = applyStimulus(parallelProgram, started.state, startStimulus());
  assert.equal(rejected.outcome, CommandOutcome.Rejected);
  assert.equal(rejected.state, started.state);
  assert.equal(rejected.internalStepBoundExceeded, false);
  assert.equal(rejected.ambiguousInternalChoice, false);
});

function assertBoundRollback(
  program: SemanticProcessProgram,
  before: RuntimeState,
  stimulus: Stimulus,
  fuel: number,
): void {
  const original = structuredClone(before);
  const evaluated = evaluateStimulusWithSelectedSteps(program, before, stimulus, fuel);
  const traced = applyStimulusWithTrace(program, before, stimulus, fuel);
  const resultOnly = applyStimulus(program, before, stimulus, fuel);
  for (const result of [evaluated.result, traced.result, resultOnly]) {
    assert.equal(result.outcome, CommandOutcome.RolledBack);
    assert.equal(result.state, before);
    assert.deepEqual(result.state, original);
    assert.equal(result.internalStepBoundExceeded, true);
    assert.equal(result.ambiguousInternalChoice, false);
  }
  assert.deepEqual(before, original);
  assert.deepEqual(traced.result, resultOnly);
  assert.deepEqual(evaluated.result, resultOnly);
  assert.equal(evaluated.ambiguousInternalChoice, false);
  assert.equal(evaluated.admittedState, null);
  assert.deepEqual(evaluated.selectedInternalSteps, []);
  assert.deepEqual(evaluated.selectedInternalBatches, []);
  assert.deepEqual(traced.committedTransitions, []);
  assert.deepEqual(traced.flowNodeOccurrenceLifecycles, []);
  assert.equal(traced.currentPositions, null);
  assert.deepEqual(advanceScenario(program, before, stimulus, fuel), {
    kind: ScenarioStepKind.HarnessFailure,
    outcome: { kind: ScenarioOutcomeKind.HarnessFailure },
    observations: [],
  });
}
