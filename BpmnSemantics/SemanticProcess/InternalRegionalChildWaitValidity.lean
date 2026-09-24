import BpmnSemantics.SemanticProcess.InternalRegionalProjectionFrames
import BpmnSemantics.SemanticProcess.InternalRegionalCompletionOpenProjection

/-! Child completion retains every User Task and Effect wait and their exact declarations.
Quiescence protects their live-owner census while local data remains byte-for-byte unchanged. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics FlowNodeOccurrenceProgramValidity.Internal

theorem regional_child_occurrence_owner_frame (before after : RuntimeState)
    (removed owner : ScopeOccurrenceId) (process : SemanticId) (element : NodeId) (activation : Nat)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun scope => decide (scope.id ≠ removed))) (different : owner ≠ removed) :
    occurrenceOwnerValid after process owner element activation =
      occurrenceOwnerValid before process owner element activation := by
  simp only [occurrenceOwnerValid, regional_other_owner_census before after removed owner scopes different]

theorem regional_child_user_task_program_validity (program : Program) (before after : RuntimeState)
    (removed : ScopeOccurrenceId)
    (prior : flowNodeOccurrenceUserTaskProgramValidity program before = true)
    (quiet : scopeQuiescent before removed = true)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun scope => decide (scope.id ≠ removed)))
    (tasks : after.waits = before.waits) :
    flowNodeOccurrenceUserTaskProgramValidity program after = true := by
  simp only [flowNodeOccurrenceUserTaskProgramValidity, tasks, List.all_eq_true] at prior ⊢
  intro wait member
  have valid := prior wait member
  have different := (regional_quiescent_wait_owners_differ before removed quiet).1 wait member
  change (occurrenceOwnerValid after wait.processInstanceId wait.owner ⟨wait.task.id.value⟩ wait.activation && _) = true
  change (occurrenceOwnerValid before wait.processInstanceId wait.owner ⟨wait.task.id.value⟩ wait.activation && _) = true at valid
  simpa only [regional_child_occurrence_owner_frame before after removed wait.owner _ _ _ scopes different] using valid

theorem regional_child_effect_program_validity (program : Program) (before after : RuntimeState)
    (removed : ScopeOccurrenceId)
    (prior : flowNodeOccurrenceEffectProgramValidity program before = true)
    (quiet : scopeQuiescent before removed = true)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun scope => decide (scope.id ≠ removed)))
    (effects : after.effectWaits = before.effectWaits)
    (incidents : after.effectIncidents = before.effectIncidents)
    (locals : after.variables.activities = before.variables.activities) :
    flowNodeOccurrenceEffectProgramValidity program after = true := by
  simp only [flowNodeOccurrenceEffectProgramValidity, Bool.and_eq_true] at prior ⊢
  refine ⟨⟨?_, ?_⟩, ?_⟩
  · rw [effects]
    apply List.all_eq_true.mpr
    intro wait member
    have valid := List.all_eq_true.mp prior.1.1 wait member
    have different := (regional_quiescent_wait_owners_differ before removed quiet).2.2.2.1 wait member
    change (occurrenceOwnerValid after wait.processInstanceId wait.owner wait.elementId wait.activation && _) = true
    change (occurrenceOwnerValid before wait.processInstanceId wait.owner wait.elementId wait.activation && _) = true at valid
    simpa only [regional_child_occurrence_owner_frame before after removed wait.owner _ _ _ scopes different] using valid
  · rw [incidents]
    apply List.all_eq_true.mpr
    intro incident member
    have valid := List.all_eq_true.mp prior.1.2 incident member
    have different := (regional_quiescent_wait_owners_differ before removed quiet).2.2.2.2.1 incident member
    change (occurrenceOwnerValid after incident.wait.processInstanceId incident.wait.owner
      incident.wait.elementId incident.wait.activation && _) = true
    change (occurrenceOwnerValid before incident.wait.processInstanceId incident.wait.owner
      incident.wait.elementId incident.wait.activation && _) = true at valid
    simpa only [regional_child_occurrence_owner_frame before after removed incident.wait.owner _ _ _ scopes different] using valid
  · change (let waits := after.effectWaits ++ after.effectIncidents.map (·.wait)
            waits.all _ && after.variables.activities.all _) = true
    simp only [effects, incidents, locals]
    exact prior.2

/-- The unchanged task/effect fields are derived from the actual selected evaluator, not
assumed as a successor shape. Bounded completion's Timer withdrawal remains a separate lane. -/
theorem preparedChildComplete_task_and_effect_validity (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (identities : waitIdentitiesUnique before = true)
    (tasks : flowNodeOccurrenceUserTaskProgramValidity program before = true)
    (effects : flowNodeOccurrenceEffectProgramValidity program before = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceUserTaskProgramValidity program after = true ∧
      flowNodeOccurrenceEffectProgramValidity program after = true := by
  obtain ⟨snapshots, _, _, closedSelection, _⟩ := prepareInternalRegional_facts program before _ prepared found
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
  obtain ⟨withdrawal, kind, _⟩ := regionalSelection_complete_census program before id origin definition (some output)
    prepared.selection selection
  obtain ⟨after, applied, quiet, control, calls, scopes⟩ :=
    preparedChildComplete_projection_lookup_fields program before id origin definition output prepared found
  obtain ⟨actual, fired, appliedAgain⟩ := prepareInternalRegional_executes program before _ prepared found
  have same : actual = after := Option.some.inj (appliedAgain.symm.trans applied)
  subst actual
  have result : completeSelectedScope? program before definition (some output) = some after := by
    simp only [fire?, snapshots] at fired
    change completeSelectedScope? program before definition (some output) = some after at fired
    exact fired
  have fields := regionalSelection_reference_fields program before after _ prepared.selection snapshots identities selection fired
  have taskFields : after.waits = before.waits := by
    rw [fields.2.2.1]
    apply List.filter_eq_self.mpr
    intro wait member
    simp only [regionalSelectionReferenceRetention, kind]
    cases withdrawal <;> rfl
  obtain ⟨effectFields, incidentFields, _⟩ := regionalSelectedCompletion_effect_and_branch_fields program before after
    definition (some output) result
  have localFields := congrArg ScopedVariables.activities
    (regionalLocalData_selected_completion_variables program before after definition (some output) result)
  exact ⟨after, applied,
    regional_child_user_task_program_validity program before after _ tasks quiet scopes taskFields,
    regional_child_effect_program_validity program before after _ effects quiet scopes effectFields incidentFields localFields⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
