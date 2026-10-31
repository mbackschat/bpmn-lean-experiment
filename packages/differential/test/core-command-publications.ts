import { isDeepStrictEqual } from "node:util";
import { CommandOutcome, applyStimulusWithTrace, initialState, isWellFormedRuntimeState, observeStableState,
  projectOpenFlowNodeOccurrences, replayCommittedTransitions } from "@bpmn-lean/semantic-core";
import type { Scenario, SemanticProcessProgram } from "@bpmn-lean/semantic-core";

/**
 * The core's per-command publication records in the shape of Lean's `--publications` output, so a test compares them with
 * `isDeepStrictEqual` against the emitter's `commandPublications`. The scenario's first stimulus must name its instance.
 */
export function coreCommandPublications(program: SemanticProcessProgram, scenario: Scenario) {
  const start = scenario.stimuli[0];
  if (start === undefined || !("instanceId" in start)) throw new TypeError(`${scenario.id} does not start an instance`);
  let state = initialState;
  const records = [];
  for (const stimulus of scenario.stimuli) {
    const before = state;
    const traced = applyStimulusWithTrace(program, before, stimulus);
    state = traced.result.state;
    records.push({ commandId: stimulus.commandId, outcome: traced.result.outcome, stateUnchanged: isDeepStrictEqual(state, before),
      stateWellFormed: isWellFormedRuntimeState(program, start.instanceId, state),
      traceReplays: isDeepStrictEqual(replayCommittedTransitions(program, before, traced.committedTransitions), state),
      publication: traced.committedTransitions.length === 0 ? null : { transitions: traced.committedTransitions, current: traced.currentPositions },
      lifecycles: traced.flowNodeOccurrenceLifecycles, openOccurrences: projectOpenFlowNodeOccurrences(program, state) });
    // Lean's `commandPublicationsJson` publishes no command after one the scenario cannot continue from.
    const continues = (traced.result.outcome === CommandOutcome.Committed || traced.result.outcome === CommandOutcome.Rejected) &&
      !traced.result.internalStepBoundExceeded && !traced.result.ambiguousInternalChoice && observeStableState(program, state) !== null;
    if (!continues) break;
  }
  return records;
}
