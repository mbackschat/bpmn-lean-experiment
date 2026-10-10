import {
  compareCalledProcessOccurrences, compareEffectWaits, compareEventRaces, compareMessageWaits,
  compareScopeOccurrenceIds, compareSelectedBranchSets, compareTimerWaits, compareTokenPlaces,
  compareUserTaskWaits,
  type RuntimeState, type ScopedVariables,
} from "./semantic-process-state.js";
import { compareActivityOccurrences } from "./activity-occurrence.js";
import { compareSequentialMultiInstanceControllers } from "./sequential-multi-instance-controller.js";
import { compareParallelMultiInstanceControllers } from "./parallel-multi-instance-controller.js";
import { compareLocalDataOwners } from "./local-data-owner.js";
import { compareCanonicalStrings } from "./wire.js";
import { RuntimeStateDefect } from "./runtime-state-defect.js";

export function compareActivityVariableScopes(
  left: ScopedVariables["activities"][number],
  right: ScopedVariables["activities"][number],
): number {
  return compareLocalDataOwners(left.owner, right.owner);
}

function strictlySorted<T>(values: ReadonlyArray<T>, compare: (left: T, right: T) => number): boolean {
  return values.every((value, index) => index === 0 || compare(values[index - 1]!, value) < 0);
}

/** AA-18 requires admission, restoration and frontier validation to agree on unique keys; one token bucket carries its multiplicity. */
export function committedStateCollectionDefects(state: RuntimeState): ReadonlyArray<RuntimeStateDefect> {
  const counters = [state.taskActivations, state.messageActivations, state.timerActivations,
    state.effectActivations, state.activityActivations, state.scopeActivations,
    state.callActivations, state.eventRaceActivations];
  const ordered =
    strictlySorted(state.scopeOccurrences, (left, right) => compareScopeOccurrenceIds(left.id, right.id)) &&
    strictlySorted(state.controlTokens, compareTokenPlaces) &&
    strictlySorted(state.activityOccurrences, compareActivityOccurrences) &&
    strictlySorted(state.userTaskWaits, compareUserTaskWaits) &&
    strictlySorted(state.messageWaits, compareMessageWaits) &&
    strictlySorted(state.timerWaits, compareTimerWaits) &&
    strictlySorted(state.effectWaits, compareEffectWaits) &&
    strictlySorted(state.variables.activities, compareActivityVariableScopes) &&
    strictlySorted(state.selectedBranchSets, compareSelectedBranchSets) &&
    strictlySorted(state.eventRaces, compareEventRaces) &&
    strictlySorted(state.calledProcessOccurrences, compareCalledProcessOccurrences) &&
    strictlySorted(state.sequentialMultiInstanceControllers ?? [], compareSequentialMultiInstanceControllers) &&
    strictlySorted(state.parallelMultiInstanceControllers ?? [], compareParallelMultiInstanceControllers) &&
    counters.every(values => strictlySorted(values,
      (left, right) => compareCanonicalStrings(left.elementId, right.elementId)));
  const defects: RuntimeStateDefect[] = [];
  if (!ordered) defects.push(RuntimeStateDefect.UnorderedCollection);
  if (state.controlTokens.some(token => !Number.isSafeInteger(token.multiplicity) || token.multiplicity <= 0)) {
    defects.push(RuntimeStateDefect.InvalidTokenMultiplicity);
  }
  return defects;
}
