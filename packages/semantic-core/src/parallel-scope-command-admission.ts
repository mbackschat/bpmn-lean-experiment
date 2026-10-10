import { committedStateCollectionDefects } from "./runtime-state-collection-ordering.js";
import { StimulusKind } from "./contract.js";
import type { Stimulus } from "./contract.js";
import { internalOccurrenceReservationStateIsValid } from "./internal-operation-occurrence.js";
import { parallelScopeProgramStartCapacity } from "./parallel-scope-program-capacity.js";
import type { ParallelScopeStartCapacity } from "./parallel-scope-program-capacity.js";
import { analyzeParallelScopeData, repeatedScopeStimulusDataAdmitted } from "./sequential-scope-data-admission.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { ControlStateKind } from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";
import { parallelScopeStateValid } from "./parallel-scope-state-validation.js";
import { isWellFormedStimulus } from "./stimulus.js";

/** PMIS-ADMIT-01 derives command capacity from exact Program and the write-protected captured collection. */
export function parallelScopeCommandCapacity(program: SemanticProcessProgram, state: RuntimeState,
  stimulus: Stimulus): ParallelScopeStartCapacity | undefined {
  if (!isWellFormedStimulus(stimulus) || committedStateCollectionDefects(state).length > 0) return undefined;
  const bindings = stimulus.kind === StimulusKind.StartProcess ? stimulus.initialVariables : state.variables.process.bindings;
  const capacity = parallelScopeProgramStartCapacity(program, bindings);
  const data = capacity === undefined ? undefined : analyzeParallelScopeData(program);
  if (capacity === undefined || data === undefined || !repeatedScopeStimulusDataAdmitted(data, stimulus)) return undefined;
  if (stimulus.kind === StimulusKind.StartProcess)
    return internalOccurrenceReservationStateIsValid(state) && state.control.kind === ControlStateKind.NotStarted &&
      stimulus.processId === program.processId ? capacity : undefined;
  return parallelScopeStateValid(program, state) ? capacity : undefined;
}
