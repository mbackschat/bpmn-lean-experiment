import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyStimulusWithTrace,
  CommandOutcome,
  initialState,
  isWellFormedRuntimeState,
  replayCommittedTransitions,
  runtimeStateDefects,
  runtimeStateRegressions,
  StimulusKind,
  type RuntimeState,
  type Scenario,
  type SemanticProcessProgram,
  type Stimulus,
} from "@bpmn-lean/semantic-core";

import { pipelineCases } from "./pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-targets.ts";

/**
 * Finite executable preservation evidence over every registered single-instance pipeline program.
 *
 * Every committed transition prefix is replayed so the invariant is checked at microsteps hidden by
 * stable scenario observations. Rejected commands must preserve the exact received state and emit no
 * committed transition. This finite registry lane cannot substitute for the general quantified Lean
 * obligation: an unregistered program or schedule can still reach a state this corpus never visits.
 */

function scenarioInstanceId(scenario: Scenario): string {
  const start = scenario.stimuli[0];
  assert.ok(start !== undefined, `${scenario.id} must declare a start stimulus`);
  switch (start.kind) {
    case StimulusKind.StartProcess:
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
      return start.instanceId;
    case StimulusKind.CompleteUserTaskInstance:
    case StimulusKind.DeliverMessage:
    case StimulusKind.DeliverPayloadMessage:
    case StimulusKind.DeliverCorrelatedPayloadMessage:
    case StimulusKind.FireTimer:
    case StimulusKind.CompleteEffect:
    case StimulusKind.ReportEffectFailure:
    case StimulusKind.RetryIncident:
    case StimulusKind.CancelIncidentProcess:
      throw new TypeError(`${scenario.id} does not start with Process initiation`);
    default:
      return assertNever(start);
  }
}

function assertAdmittedState(
  caseId: string,
  program: SemanticProcessProgram,
  instanceId: string,
  state: RuntimeState,
): void {
  assert.equal(
    isWellFormedRuntimeState(program, instanceId, state),
    true,
    `${caseId} reached a state the account refuses: ${runtimeStateDefects(
      program,
      instanceId,
      state,
    ).join(", ")}`,
  );
}

function committedStatesFor(
  caseId: string,
  program: SemanticProcessProgram,
  from: RuntimeState,
  stimulus: Stimulus,
): ReadonlyArray<RuntimeState> {
  const traced = applyStimulusWithTrace(program, from, stimulus);
  if (traced.result.outcome !== CommandOutcome.Committed) {
    assert.equal(
      traced.result.outcome,
      CommandOutcome.Rejected,
      `${caseId} produced an unsupported non-commit outcome`,
    );
    assert.deepEqual(
      traced.committedTransitions,
      [],
      `${caseId} emitted committed transitions for a refused command`,
    );
    assert.deepEqual(
      traced.result.state,
      from,
      `${caseId} changed state for a refused command`,
    );
    return [];
  }

  assert.ok(
    traced.committedTransitions.length > 0,
    `${caseId} committed without recording a transition`,
  );
  const states = traced.committedTransitions.map((_, index) => {
    const replayed = replayCommittedTransitions(
      program,
      from,
      traced.committedTransitions.slice(0, index + 1),
    );
    assert.ok(replayed !== null, `${caseId} committed prefix ${index + 1} did not replay`);
    return replayed;
  });
  assert.deepEqual(
    states[states.length - 1],
    traced.result.state,
    `${caseId} trace replay did not reproduce the command result`,
  );
  return states;
}

test("every registered pipeline program preserves runtime-state well-formedness", async (t) => {
  const contexts = await loadAndCompileCases(pipelineCases);

  for (const { pipelineCase, scenario, semanticProcess } of contexts) {
    await t.test(pipelineCase.id, () => {
      const instanceId = scenarioInstanceId(scenario);
      let current = initialState;

      for (const stimulus of scenario.stimuli) {
        for (const successor of committedStatesFor(
          pipelineCase.id,
          semanticProcess,
          current,
          stimulus,
        )) {
          assert.deepEqual(
            runtimeStateRegressions(current, successor),
            [],
            `${pipelineCase.id} rewound a monotone runtime measure`,
          );
          assertAdmittedState(
            pipelineCase.id,
            semanticProcess,
            instanceId,
            successor,
          );
          current = successor;
        }
      }
    });
  }
});

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic variant: ${JSON.stringify(value)}`);
}
