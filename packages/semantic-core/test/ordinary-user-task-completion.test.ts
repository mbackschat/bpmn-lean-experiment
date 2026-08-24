import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  StimulusKind,
  applyStimulus,
  completeOrdinaryUserTask,
  evaluateStimulusWithSelectedSteps,
  initialState,
} from "@bpmn-lean/semantic-core";

import {
  loadCase,
  semanticProcessFor,
} from "./user-task-fixture.ts";

test("ordinary User Task completion and command admission share one successor", async () => {
  const { scenario } = await loadCase("scenario.json", "cibseven-evidence.json");
  const program = semanticProcessFor(scenario);
  const start = scenario.stimuli[0];
  const completion = scenario.stimuli[1];
  assert.equal(start?.kind, StimulusKind.StartProcess);
  assert.equal(completion?.kind, StimulusKind.CompleteUserTaskInstance);
  if (
    start?.kind !== StimulusKind.StartProcess ||
    completion?.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError("sequential User Task fixture lost its command order");
  }
  const started = applyStimulus(program, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);

  const successor = completeOrdinaryUserTask(
    program,
    started.state,
    completion,
  );
  const evaluated = evaluateStimulusWithSelectedSteps(
    program,
    started.state,
    completion,
  );

  assert.ok(successor !== null);
  assert.deepEqual(evaluated.admittedState, successor);
});
