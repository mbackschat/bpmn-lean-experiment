import BpmnSemantics.SemanticProcess.InternalRegionalReturnWaitValidity

/-! The actual Return successor preserves the complete optional wait projection.
Owner survival follows from the actual cleanup filter, while private Timer visibility
uses the independently proved host census frame. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem regional_return_wait_mapM (program : Program) (before after : RuntimeState)
    (record : CalledProcessOccurrence) (output : ControlPlaceId)
    (values : List α) (owner : α → ScopeOccurrenceId) (element : α → NodeId) (activation : α → Nat)
    (actual : after = { removeCalledProcessTree before record with tokens := addToken before.tokens output record.caller })
    (associations : calledProcessAssociationsValid before = true)
    (selected : record ∈ before.calledProcessOccurrences)
    (outside : ∀ value ∈ values, (owner value).processInstanceId ∉
      processInstanceClosureWithin before.calledProcessOccurrences [record.calledRoot.processInstanceId]
        (before.calledProcessOccurrences.length + 1)) :
    values.mapM (fun value => waitStart? program after (owner value) (element value) (activation value)) =
      values.mapM (fun value => waitStart? program before (owner value) (element value) (activation value)) := by
  induction values with
  | nil => rfl
  | cons head tail ih =>
      have start : waitStart? program after (owner head) (element head) (activation head) =
          waitStart? program before (owner head) (element head) (activation head) := by
        rw [actual]
        exact removeCalledProcessTree_wait_start_frame program before record (owner head) (element head)
          (activation head) associations selected (outside head List.mem_cons_self)
      simp only [List.mapM_cons, start]
      rw [ih (fun value member => outside value (List.mem_cons_of_mem head member))]

theorem retained_process_filter_excludes_removed {α : Type} (values : List α)
    (owner : α → ScopeOccurrenceId) (removed : List SemanticId)
    (retained : values.filter (fun value => !removed.contains (owner value).processInstanceId) = values) :
    ∀ value ∈ values, (owner value).processInstanceId ∉ removed := by
  intro value member contained
  have survived : value ∈ values.filter (fun value => !removed.contains (owner value).processInstanceId) := by
    rw [retained]
    exact member
  have kept := (List.mem_filter.mp survived).2
  simp at kept
  exact kept contained

theorem preparedReturn_wait_projection (program : Program) (before : RuntimeState)
    (expected : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (process : ProcessId) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program expected before = true)
    (found : prepareInternalRegional? program before (.returnProcess id origin process definition output) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      projectWaits? program after = projectWaits? program before := by
  obtain ⟨after, record, root, applied, kind, _, _, parentless, quiet, actual, scopes, tasks, messages, timers,
      effects, incidents, activities, _, _, census⟩ :=
    preparedReturn_quiescent_fields program before expected id origin process definition output prepared valid found
  have closed := (prepareInternalRegional_facts program before _ prepared found).2.2.2.1
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closed).1
  obtain ⟨hosting, running⟩ := regionalSelection_running program before _ prepared.selection selection
  have position : runtimePositionValid program expected before = true := by
    have facts := valid
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at facts
    exact facts.1
  have associations := runtimePositionValid_called_associations program expected hosting before position running
  obtain ⟨chosen, chosenKind, _, chosenCensus⟩ :=
    regionalSelection_return_record program before id origin process definition output prepared.selection selection
  have sameRecord : chosen = record := by simpa using chosenKind.symm.trans kind
  have selected : record ∈ before.calledProcessOccurrences := by
    have selected : chosen ∈ before.calledProcessOccurrences.filter
        (fun candidate => decide (candidate.returnOperationId = id && candidate.id.elementId.value = origin.elementId.value)) := by
      rw [chosenCensus]
      simp
    exact sameRecord ▸ (List.mem_filter.mp selected).1
  let removed := processInstanceClosureWithin before.calledProcessOccurrences [record.calledRoot.processInstanceId]
    (before.calledProcessOccurrences.length + 1)
  have taskOwners := retained_process_filter_excludes_removed before.waits (·.owner) removed
    (by simpa only [actual, removed, removeCalledProcessTree] using tasks)
  have messageOwners := retained_process_filter_excludes_removed before.messageWaits (·.owner) removed
    (by simpa only [actual, removed, removeCalledProcessTree] using messages)
  have timerOwners := retained_process_filter_excludes_removed before.timerWaits (·.owner) removed
    (by simpa only [actual, removed, removeCalledProcessTree] using timers)
  have effectOwners := retained_process_filter_excludes_removed before.effectWaits (·.owner) removed
    (by simpa only [actual, removed, removeCalledProcessTree] using effects)
  have incidentOwners := retained_process_filter_excludes_removed before.effectIncidents (·.wait.owner) removed
    (by simpa only [actual, removed, removeCalledProcessTree] using incidents)
  have publicTimers : after.timerWaits.filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program after timer) =
      before.timerWaits.filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program before timer) := by
    rw [timers]
    apply List.filter_congr
    intro timer member
    rw [regional_return_boundary_timer_frame program before after root timer parentless
      ((regional_quiescent_wait_owners_differ before root.id quiet).2.2.1 timer member) census scopes tasks activities]
  have taskProjection := regional_return_wait_mapM program before after record output before.waits
    (·.owner) (fun wait => ⟨wait.task.id.value⟩) (·.activation) actual associations selected taskOwners
  have messageProjection := regional_return_wait_mapM program before after record output before.messageWaits
    (·.owner) (·.elementId) (·.activation) actual associations selected messageOwners
  have timerProjection := regional_return_wait_mapM program before after record output
    (before.timerWaits.filter fun timer => !flowNodeOccurrenceBoundaryTimerBound program before timer)
    (·.owner) (·.elementId) (·.activation) actual associations selected
    (fun timer member => timerOwners timer (List.mem_filter.mp member).1)
  have effectProjection := regional_return_wait_mapM program before after record output before.effectWaits
    (·.owner) (·.elementId) (·.activation) actual associations selected effectOwners
  have incidentProjection := regional_return_wait_mapM program before after record output before.effectIncidents
    (·.wait.owner) (·.wait.elementId) (·.wait.activation) actual associations selected incidentOwners
  refine ⟨after, applied, ?_⟩
  simp only [projectWaits?, tasks, messages, publicTimers, effects, incidents,
    taskProjection, messageProjection, timerProjection, effectProjection, incidentProjection]

end BpmnSemantics.SemanticProcess.InternalCommutation
