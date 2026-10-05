import { initialState } from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

/** Call-data and interrupting Message-handler capsules require the exact initial state, including passive history. */
export function isPristineRuntimeState(state: RuntimeState): boolean {
  const pristine = {
    control: state.control.kind === initialState.control.kind,
    initiationPending: state.initiationPending === initialState.initiationPending,
    scopeOccurrences: state.scopeOccurrences.length === initialState.scopeOccurrences.length,
    controlTokens: state.controlTokens.length === initialState.controlTokens.length,
    userTaskWaits: state.userTaskWaits.length === initialState.userTaskWaits.length,
    messageWaits: state.messageWaits.length === initialState.messageWaits.length,
    eventSubProcessMessageSubscriptions: state.eventSubProcessMessageSubscriptions === initialState.eventSubProcessMessageSubscriptions,
    timerWaits: state.timerWaits.length === initialState.timerWaits.length,
    effectWaits: state.effectWaits.length === initialState.effectWaits.length,
    effectIncidents: state.effectIncidents.length === initialState.effectIncidents.length,
    selectedBranchSets: state.selectedBranchSets.length === initialState.selectedBranchSets.length,
    eventRaces: state.eventRaces.length === initialState.eventRaces.length,
    calledProcessOccurrences: state.calledProcessOccurrences.length === initialState.calledProcessOccurrences.length,
    activityOccurrences: state.activityOccurrences.length === initialState.activityOccurrences.length,
    sequentialScopeControllers: state.sequentialScopeControllers === initialState.sequentialScopeControllers,
    sequentialMultiInstanceControllers: state.sequentialMultiInstanceControllers === initialState.sequentialMultiInstanceControllers,
    parallelMultiInstanceControllers: state.parallelMultiInstanceControllers === initialState.parallelMultiInstanceControllers,
    compensationActivityRetentions: state.compensationActivityRetentions === initialState.compensationActivityRetentions,
    compensationParentContextRetentions: state.compensationParentContextRetentions === initialState.compensationParentContextRetentions,
    compensationTriggers: state.compensationTriggers === initialState.compensationTriggers,
    compensationHandlerEffectWaits: state.compensationHandlerEffectWaits === initialState.compensationHandlerEffectWaits,
    variables: state.variables.scopes.length === initialState.variables.scopes.length &&
      state.variables.process.bindings.length === initialState.variables.process.bindings.length &&
      state.variables.activities.length === initialState.variables.activities.length &&
      state.variables.processInterfaces.length === initialState.variables.processInterfaces.length,
    taskActivations: state.taskActivations.length === initialState.taskActivations.length,
    messageActivations: state.messageActivations.length === initialState.messageActivations.length,
    timerActivations: state.timerActivations.length === initialState.timerActivations.length,
    eventRaceActivations: state.eventRaceActivations.length === initialState.eventRaceActivations.length,
    callActivations: state.callActivations.length === initialState.callActivations.length,
    effectActivations: state.effectActivations.length === initialState.effectActivations.length,
    scopeActivations: state.scopeActivations.length === initialState.scopeActivations.length,
    activityActivations: state.activityActivations.length === initialState.activityActivations.length,
    endOccurrences: state.endOccurrences === initialState.endOccurrences,
    logicalTimeMs: state.logicalTimeMs === initialState.logicalTimeMs,
  } satisfies Record<keyof RuntimeState, boolean>;
  return Object.values(pristine).every(Boolean);
}
