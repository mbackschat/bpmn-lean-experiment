import BpmnSemantics.SemanticProcess.InternalRegionalCallRemoval
import BpmnSemantics.SemanticProcess.InternalRegionalReturnProjectionFrames
import BpmnSemantics.SemanticProcess.InternalRegionalReturnPositionPublication

/-! A prepared quiescent Return region contains only its called root. Actual Call-tree
cleanup therefore preserves every wait, token, branch, and race population; Activity
records retain their independent owner-removal mask rather than an assumed empty census. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem quiescent_region_owned_filter {α : Type} (values : List α) (owner : α → ScopeOccurrenceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (singleton : region.members = [root])
    (quiet : (!(values.any fun value => owner value == root)) = true) :
    values.filter (fun value => !region.contains (owner value)) = values := by
  apply List.filter_eq_self.mpr
  intro value member
  have different : owner value ≠ root := by
    intro same
    have present : (values.any fun candidate => owner candidate == root) = true :=
      List.any_eq_true.mpr ⟨value, member, by simp [same]⟩
    simp [present] at quiet
  simp [InternalOccurrenceRegion.contains, singleton, different]

theorem removeCalledProcessTree_quiescent_fields (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId)
    (valid : runtimeStateWellFormed program expected state = true)
    (running : state.control = .running hosting)
    (record : CalledProcessOccurrence) (root : RuntimeScopeOccurrence)
    (rootId : root.id = record.calledRoot) (rootLive : root ∈ state.scopeOccurrences)
    (parentless : root.parent = none) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root.id = some region)
    (quiet : scopeQuiescent state root.id = true) :
    (removeCalledProcessTree state record).scopeOccurrences =
        state.scopeOccurrences.filter (fun scope => decide (scope.id ≠ root.id)) ∧
      (removeCalledProcessTree state record).tokens = state.tokens ∧
      (removeCalledProcessTree state record).waits = state.waits ∧
      (removeCalledProcessTree state record).messageWaits = state.messageWaits ∧
      (removeCalledProcessTree state record).timerWaits = state.timerWaits ∧
      (removeCalledProcessTree state record).effectWaits = state.effectWaits ∧
      (removeCalledProcessTree state record).effectIncidents = state.effectIncidents ∧
      (removeCalledProcessTree state record).activityOccurrences =
        state.activityOccurrences.filter (fun activity => decide (activity.owner ≠ root.id)) ∧
      (removeCalledProcessTree state record).selectedBranchSets = state.selectedBranchSets ∧
      (removeCalledProcessTree state record).eventRaces = state.eventRaces := by
  have singleton := quiescent_prepared_region_singleton state root.id region prepared quiet
  obtain ⟨scopes, tokens, tasks, messages, timers, effects, incidents, activities, branches, races⟩ :=
    removeCalledProcessTree_owned_fields_eq_region program state expected hosting valid running record root
      rootId rootLive parentless region prepared
  simp only [scopeQuiescent, Bool.and_eq_true, and_assoc] at quiet
  have mask (owner : ScopeOccurrenceId) : (!region.contains owner) = decide (owner ≠ root.id) := by
    apply Bool.eq_iff_iff.mpr
    simp [InternalOccurrenceRegion.contains, singleton]
  refine ⟨?_, tokens.trans ?_, tasks.trans ?_, messages.trans ?_, timers.trans ?_, effects.trans ?_, incidents.trans ?_,
    ?_, branches.trans ?_, races.trans ?_⟩
  · simpa only [mask] using scopes
  · exact quiescent_region_owned_filter state.tokens (·.owner) root.id region singleton quiet.1
  · exact quiescent_region_owned_filter state.waits (·.owner) root.id region singleton quiet.2.1
  · exact quiescent_region_owned_filter state.messageWaits (·.owner) root.id region singleton quiet.2.2.1
  · exact quiescent_region_owned_filter state.timerWaits (·.owner) root.id region singleton quiet.2.2.2.1
  · exact quiescent_region_owned_filter state.effectWaits (·.owner) root.id region singleton quiet.2.2.2.2.1
  · exact quiescent_region_owned_filter state.effectIncidents (·.wait.owner) root.id region singleton quiet.2.2.2.2.2.1
  · simpa only [mask] using activities
  · exact quiescent_region_owned_filter state.selectedBranchSets (·.owner) root.id region singleton quiet.2.2.2.2.2.2.1
  · exact quiescent_region_owned_filter state.eventRaces (·.owner) root.id region singleton quiet.2.2.2.2.2.2.2.1

/-- Complete Return preparation determines the actual cleanup and continuation fields.
The removed Activity census remains explicit; no Activity emptiness premise is introduced. -/
theorem preparedReturn_quiescent_fields (program : Program) (before : RuntimeState)
    (expected : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (process : ProcessId) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program expected before = true)
    (found : prepareInternalRegional? program before (.returnProcess id origin process definition output) = some prepared) :
    ∃ after record root, applyPreparedInternalRegional? program before prepared = some after ∧
      prepared.selection.kind = .returning record ∧ root.id = prepared.selection.root.id ∧
      root ∈ before.scopeOccurrences ∧ root.parent = none ∧ scopeQuiescent before root.id = true ∧
      after = { removeCalledProcessTree before record with tokens := addToken before.tokens output record.caller } ∧
      after.scopeOccurrences = before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ root.id)) ∧
      after.waits = before.waits ∧ after.messageWaits = before.messageWaits ∧ after.timerWaits = before.timerWaits ∧
      after.effectWaits = before.effectWaits ∧ after.effectIncidents = before.effectIncidents ∧
      after.activityOccurrences = before.activityOccurrences.filter (fun activity => decide (activity.owner ≠ root.id)) ∧
      after.selectedBranchSets = before.selectedBranchSets ∧ after.eventRaces = before.eventRaces ∧
      before.scopeOccurrences.filter (fun scope => decide (scope.id = root.id)) = [root] := by
  obtain ⟨snapshots, _, _, closedSelection, derived, _, _⟩ := prepareInternalRegional_facts program before _ prepared found
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
  obtain ⟨hosting, running⟩ := regionalSelection_running program before _ prepared.selection selection
  obtain ⟨chosen, kind, chosenRoot, chosenCensus⟩ :=
    regionalSelection_return_record program before id origin process definition output prepared.selection selection
  obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have result : returnProcessState? before id origin process definition output = some after := by
    simp only [fire?, snapshots] at fired
    change returnProcessState? before id origin process definition output = some after at fired
    exact fired
  have step := returnProcessState_sound before after id origin process definition output result
  cases step with
  | permitted record root associations uniqueReturn processMatches scopeMatches uniqueRoot
      parentless uniqueCaller uniqueProcessRoot quiet =>
      have same : record = chosen := by simpa using uniqueReturn.symm.trans chosenCensus
      subst record
      have rootId := scope_identity_of_census before chosen.calledRoot root uniqueRoot
      have rootMember : root ∈ before.scopeOccurrences := by
        have present : root ∈ before.scopeOccurrences.filter (fun scope => decide (scope.id = chosen.calledRoot)) := by
          rw [uniqueRoot]; simp
        exact (List.mem_filter.mp present).1
      have rootEq : root.id = prepared.selection.root.id := rootId.trans chosenRoot.symm
      have region : deriveInternalOccurrenceRegion? before root.id = some prepared.region := by
        simpa only [rootEq] using derived
      obtain ⟨scopes, tokens, tasks, messages, timers, effects, incidents, activities, branches, races⟩ :=
        removeCalledProcessTree_quiescent_fields program before expected hosting valid running chosen root rootId rootMember
          parentless prepared.region region quiet
      exact ⟨_, chosen, root, applied, kind, rootEq, rootMember, parentless, quiet,
        by rw [tokens], scopes, tasks, messages, timers, effects, incidents, activities, branches, races,
        by simpa only [rootId] using uniqueRoot⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
