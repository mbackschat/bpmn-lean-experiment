module

public import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Direct scope-owner filtering

Regional cancellation, called-instance removal and Compensation failure share these direct owner
keys. Attached handlers, controllers, parent contexts and Activity data need their own retention
rules. Event Sub-Process listeners deliberately remain outside this shared filter: cancellation
and Call removal dispose them, while the existing Compensation failure account retains them.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

/-- Filter only directly scope-owned work, retaining control, counters and all other collection
families for the calling transition to handle under its distinct lifetime contract. -/
@[simp, reducible] def filterScopeOwnedWork (state : RuntimeState) (keep : ScopeOccurrenceId → Bool) : RuntimeState :=
  { state with
    scopeOccurrences := state.scopeOccurrences.filter fun occurrence => keep occurrence.id
    tokens := state.tokens.filter fun token => keep token.owner
    waits := state.waits.filter fun wait => keep wait.owner
    messageWaits := state.messageWaits.filter fun wait => keep wait.owner
    timerWaits := state.timerWaits.filter fun wait => keep wait.owner
    effectWaits := state.effectWaits.filter fun wait => keep wait.owner
    effectIncidents := state.effectIncidents.filter fun incident => keep incident.wait.owner
    activityOccurrences := state.activityOccurrences.filter fun activity => keep activity.owner
    selectedBranchSets := state.selectedBranchSets.filter fun selected => keep selected.owner
    eventRaces := state.eventRaces.filter fun race => keep race.owner
    calledProcessOccurrences := state.calledProcessOccurrences.filter fun call =>
      keep call.caller && keep call.calledRoot
    compensationActivityRetentions := state.compensationActivityRetentions.filter fun retention =>
      keep retention.owner
    variables :=
      { state.variables with
        scopes := state.variables.scopes.filter fun scope => keep scope.owner
        processInterfaces := state.variables.processInterfaces.filter fun scope => keep scope.owner } }

/-- Existing fail-fast cleanup preserves Process data, historical counters, trigger tombstones
and inherited Event Sub-Process listeners; it is not a general all-owner cancellation law. -/
@[simp, reducible] def clearCompensationFailureWork (state : RuntimeState) : RuntimeState :=
  let filtered := filterScopeOwnedWork state (fun _ => false)
  { filtered with
    initiationPending := false
    sequentialScopeControllers := []
    parallelScopeControllers := []
    sequentialMultiInstanceControllers := []
    parallelMultiInstanceControllers := []
    compensationParentContextRetentions := []
    compensationHandlerEffectWaits := []
    variables :=
      { filtered.variables with activities := [] } }

end BpmnSemantics.SemanticProcess
