import BpmnSemantics.SemanticProcess.InternalRegionalReturnQuiescence
import BpmnSemantics.SemanticProcess.InternalRegionalChildWaitValidity

/-! Return removes local scopes by Process identity. Effect validity survives that filter
because every matching local scope carries the retained wait's complete Effect identity;
Activity-tagged local scopes remain outside the Effect bijection. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem effect_program_validity_filter_locals (program : Program) (state : RuntimeState)
    (keep : ActivityVariableScope → Bool)
    (prior : flowNodeOccurrenceEffectProgramValidity program state = true)
    (retained : ∀ wait ∈ state.effectWaits ++ state.effectIncidents.map (·.wait),
      ∀ dataScope ∈ state.variables.activities,
        activityScopeMatches (effectWaitOccurrenceId wait) dataScope = true → keep dataScope = true) :
    flowNodeOccurrenceEffectProgramValidity program
      { state with variables := { state.variables with activities := state.variables.activities.filter keep } } = true := by
  simp only [flowNodeOccurrenceEffectProgramValidity, Bool.and_eq_true] at prior ⊢
  refine ⟨prior.1, ?_⟩
  have locals := prior.2
  change ((state.effectWaits ++ state.effectIncidents.map (·.wait)).all _ &&
    state.variables.activities.all _) = true at locals
  change ((state.effectWaits ++ state.effectIncidents.map (·.wait)).all _ &&
    (state.variables.activities.filter keep).all _) = true
  rw [Bool.and_eq_true] at locals ⊢
  refine ⟨List.all_eq_true.mpr ?_, List.all_eq_true.mpr ?_⟩
  · intro wait member
    have census : (state.variables.activities.filter keep).filter
        (activityScopeMatches (effectWaitOccurrenceId wait)) =
      state.variables.activities.filter (activityScopeMatches (effectWaitOccurrenceId wait)) := by
      rw [List.filter_filter]
      apply List.filter_congr
      intro dataScope localMember
      cases matched : activityScopeMatches (effectWaitOccurrenceId wait) dataScope with
      | false => simp
      | true => simp [retained wait member dataScope localMember matched]
    change (_ && match (state.variables.activities.filter keep).filter
        (activityScopeMatches (effectWaitOccurrenceId wait)) with
      | [dataScope] => dataScope.bindings = wait.arguments
      | _ => false) = true
    rw [census]
    exact List.all_eq_true.mp locals.1 wait member
  · intro dataScope member
    exact List.all_eq_true.mp locals.2 dataScope (List.mem_filter.mp member).1

theorem removeCalledProcessTree_retains_effect_local (program : Program) (state : RuntimeState)
    (record : CalledProcessOccurrence)
    (valid : flowNodeOccurrenceEffectProgramValidity program state = true)
    (effects : (removeCalledProcessTree state record).effectWaits = state.effectWaits)
    (incidents : (removeCalledProcessTree state record).effectIncidents = state.effectIncidents)
    (wait : EffectWait) (member : wait ∈ state.effectWaits ++ state.effectIncidents.map (·.wait))
    (dataScope : ActivityVariableScope)
    (matched : activityScopeMatches (effectWaitOccurrenceId wait) dataScope = true) :
    (!(processInstanceClosureWithin state.calledProcessOccurrences [record.calledRoot.processInstanceId]
      (state.calledProcessOccurrences.length + 1)).contains dataScope.owner.processInstanceId) = true := by
  have identities := flowNodeOccurrenceEffectProgramValidity_wait_owner_ids program state valid
  have owner : dataScope.owner.processInstanceId = wait.processInstanceId := by
    have same : LocalDataOwner.effectOccurrence (effectWaitOccurrenceId wait) = dataScope.owner :=
      of_decide_eq_true matched
    rw [← same]
    rfl
  rw [owner]
  rcases List.mem_append.mp member with member | member
  · have survived : wait ∈ (removeCalledProcessTree state record).effectWaits := by rw [effects]; exact member
    rw [identities.1 wait member]
    exact (List.mem_filter.mp survived).2
  · obtain ⟨incident, incidentMember, rfl⟩ := List.mem_map.mp member
    have survived : incident ∈ (removeCalledProcessTree state record).effectIncidents := by
      rw [incidents]; exact incidentMember
    rw [identities.2 incident incidentMember]
    exact (List.mem_filter.mp survived).2

/-- Successful preparation supplies quiescence and the actual cleanup mask. The proof
preserves exact Effect-local multiplicity without assuming that all local data survives. -/
theorem preparedReturn_effect_program_validity (program : Program) (before : RuntimeState)
    (expected : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (process : ProcessId) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program expected before = true)
    (prior : flowNodeOccurrenceEffectProgramValidity program before = true)
    (found : prepareInternalRegional? program before (.returnProcess id origin process definition output) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceEffectProgramValidity program after = true := by
  obtain ⟨after, record, root, applied, _, _, _, _, quiet, actual, scopes, _, _, _, effects, incidents, _⟩ :=
    preparedReturn_quiescent_fields program before expected id origin process definition output prepared valid found
  let restored := { after with variables := before.variables }
  have restoredValid : flowNodeOccurrenceEffectProgramValidity program restored = true :=
    regional_child_effect_program_validity program before restored root.id prior quiet scopes effects incidents rfl
  let keep := fun dataScope : ActivityVariableScope =>
    !(processInstanceClosureWithin before.calledProcessOccurrences [record.calledRoot.processInstanceId]
      (before.calledProcessOccurrences.length + 1)).contains dataScope.owner.processInstanceId
  have cleanedEffects : (removeCalledProcessTree before record).effectWaits = before.effectWaits := by
    simpa only [actual] using effects
  have cleanedIncidents : (removeCalledProcessTree before record).effectIncidents = before.effectIncidents := by
    simpa only [actual] using incidents
  have filtered := effect_program_validity_filter_locals program restored keep restoredValid (by
    intro wait member dataScope _ matched
    have beforeMember : wait ∈ before.effectWaits ++ before.effectIncidents.map (·.wait) := by
      simpa only [restored, effects, incidents] using member
    exact removeCalledProcessTree_retains_effect_local program before record prior cleanedEffects cleanedIncidents
      wait beforeMember dataScope matched)
  have restoredAfter :
      { restored with variables := { restored.variables with activities := restored.variables.activities.filter keep } } = after := by
    dsimp only [restored]
    rw [actual]
    rfl
  rw [restoredAfter] at filtered
  exact ⟨after, applied, filtered⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
