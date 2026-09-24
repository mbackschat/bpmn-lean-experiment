import BpmnSemantics.SemanticProcess.InternalScopeCreationFreshness
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidity

/-! Existing lifecycle owners survive fresh scope insertion under the
[scope-creation contract](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#scope-creation-preparation-prerequisite).
Boundary-Timer classification additionally needs the static exclusion of the new ordinary child.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics FlowNodeOccurrenceProgramValidity.Internal

theorem scopeCreation_preserves_occurrence_owner (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (process : SemanticId) (owner : ScopeOccurrenceId) (element : NodeId) (activation : Nat)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (prior : occurrenceOwnerValid state process owner element activation = true) :
    occurrenceOwnerValid (selected.apply state) process owner element activation = true := by
  simp only [occurrenceOwnerValid, Bool.and_eq_true] at prior ⊢
  refine ⟨prior.1, ?_⟩
  exact selectInternalScopeCreation_preserves_live state operation selected owner selection prior.2

theorem scopeCreation_preserves_user_task_validity (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (prior : flowNodeOccurrenceUserTaskProgramValidity program state = true) :
    flowNodeOccurrenceUserTaskProgramValidity program (selected.apply state) = true := by
  have waitFrame : (selected.apply state).waits = state.waits := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl
  unfold flowNodeOccurrenceUserTaskProgramValidity at prior ⊢
  rw [waitFrame, List.all_eq_true]
  intro wait member
  have old := List.all_eq_true.mp prior wait member
  change (occurrenceOwnerValid state wait.processInstanceId wait.owner
    ⟨wait.task.id.value⟩ wait.activation && _) = true at old
  change (occurrenceOwnerValid (selected.apply state) wait.processInstanceId wait.owner
    ⟨wait.task.id.value⟩ wait.activation && _) = true
  simp only [Bool.and_eq_true] at old ⊢
  exact ⟨scopeCreation_preserves_occurrence_owner state operation selected _ _ _ _ selection old.1,
    old.2⟩

theorem scopeCreation_preserves_effect_validity (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (prior : flowNodeOccurrenceEffectProgramValidity program state = true) :
    flowNodeOccurrenceEffectProgramValidity program (selected.apply state) = true := by
  have waitFrame : (selected.apply state).effectWaits = state.effectWaits := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl
  have incidentFrame : (selected.apply state).effectIncidents = state.effectIncidents := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl
  unfold flowNodeOccurrenceEffectProgramValidity at prior ⊢
  rw [waitFrame, incidentFrame]
  simp only [Bool.and_eq_true] at prior ⊢
  refine ⟨⟨?_, ?_⟩, ?_⟩
  · rw [List.all_eq_true]
    intro wait member
    have old := List.all_eq_true.mp prior.1.1 wait member
    change (occurrenceOwnerValid state wait.processInstanceId wait.owner
      wait.elementId wait.activation && _) = true at old
    change (occurrenceOwnerValid (selected.apply state) wait.processInstanceId wait.owner
      wait.elementId wait.activation && _) = true
    simp only [Bool.and_eq_true] at old ⊢
    exact ⟨scopeCreation_preserves_occurrence_owner state operation selected _ _ _ _ selection old.1,
      old.2⟩
  · rw [List.all_eq_true]
    intro incident member
    have old := List.all_eq_true.mp prior.1.2 incident member
    change (occurrenceOwnerValid state incident.wait.processInstanceId incident.wait.owner
      incident.wait.elementId incident.wait.activation && _) = true at old
    change (occurrenceOwnerValid (selected.apply state) incident.wait.processInstanceId incident.wait.owner
      incident.wait.elementId incident.wait.activation && _) = true
    simp only [Bool.and_eq_true] at old ⊢
    exact ⟨scopeCreation_preserves_occurrence_owner state operation selected _ _ _ _ selection old.1,
      old.2⟩
  · cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
    all_goals with_unfolding_all exact prior.2

theorem scopeCreation_bounded_scope_filter_frame (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (timer : TimerWait) (definition : DefinitionScopeId)
    (record : ActivityOccurrence)
    (excluded : selected.created.parent = none ∨
      definition ≠ selected.created.id.definitionScopeId) :
    ((selected.apply state).scopeOccurrences.filter fun child =>
      decide (child.id.definitionScopeId = definition && child.parent = some timer.owner) &&
        activityBodyScope? record == some child.id).length =
      (state.scopeOccurrences.filter fun child =>
        decide (child.id.definitionScopeId = definition && child.parent = some timer.owner) &&
          activityBodyScope? record == some child.id).length := by
  cases kind : selected.kind <;>
    simp only [InternalScopeCreationSelection.apply, kind, insertScopeOccurrence,
      length_filter_canonicalInsertBy]
  all_goals
    rcases excluded with parent | different
    · simp [parent]
    · simp [Ne.symm different]

theorem scopeCreation_boundary_timer_frame (program : Program) (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (timer : TimerWait)
    (excluded : ∀ id origin input entry definition boundary,
      (.enterBoundedScope id origin input entry definition boundary ∈ program.operations ∨
        .enterMonitoredScope id origin input entry definition boundary ∈ program.operations) →
        selected.created.parent = none ∨ definition ≠ selected.created.id.definitionScopeId) :
    flowNodeOccurrenceBoundaryTimerBound program (selected.apply state) timer =
      flowNodeOccurrenceBoundaryTimerBound program state timer := by
  unfold flowNodeOccurrenceBoundaryTimerBound
  congr 3
  apply List.filter_congr
  intro candidate member
  let selectedOperation := candidate
  cases candidate <;> try (cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl)
  all_goals
    rename_i id origin input entry definition boundary
    have counts := fun record => scopeCreation_bounded_scope_filter_frame state selected timer definition record
      (excluded id origin input entry definition boundary (by first | exact Or.inl member | exact Or.inr member))
    have activities : (selected.apply state).activityOccurrences = state.activityOccurrences := by
      cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl
    change (if !operationOwnedBy program selectedOperation
        timer.owner then false else _ && _ && decide (_ = 1)) = _
    rw [activities]
    simp only [counts]
    rfl

theorem scopeCreation_preserves_wait_validity (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (excluded : ∀ id origin input entry definition boundary,
      (.enterBoundedScope id origin input entry definition boundary ∈ program.operations ∨
        .enterMonitoredScope id origin input entry definition boundary ∈ program.operations) →
        selected.created.parent = none ∨ definition ≠ selected.created.id.definitionScopeId)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true) :
    flowNodeOccurrenceWaitProgramValidity program (selected.apply state) = true := by
  have messageFrame : (selected.apply state).messageWaits = state.messageWaits := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl
  have timerFrame : (selected.apply state).timerWaits = state.timerWaits := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl
  unfold flowNodeOccurrenceWaitProgramValidity at prior ⊢
  rw [messageFrame, timerFrame]
  simp only [Bool.and_eq_true] at prior ⊢
  refine ⟨⟨⟨scopeCreation_preserves_user_task_validity program state operation selected selection
    prior.1.1.1, ?_⟩, ?_⟩,
    scopeCreation_preserves_effect_validity program state operation selected selection prior.2⟩
  · rw [List.all_eq_true]
    intro wait member
    have old := List.all_eq_true.mp prior.1.1.2 wait member
    change (occurrenceOwnerValid state wait.processInstanceId wait.owner
      wait.elementId wait.activation && _) = true at old
    change (occurrenceOwnerValid (selected.apply state) wait.processInstanceId wait.owner
      wait.elementId wait.activation && _) = true
    simp only [Bool.and_eq_true] at old ⊢
    refine ⟨scopeCreation_preserves_occurrence_owner state operation selected _ _ _ _ selection old.1,
      ?_⟩
    cases kind : selected.kind <;>
      simpa only [InternalScopeCreationSelection.apply, kind] using old.2
  · rw [List.all_eq_true]
    intro timer member
    have old := List.all_eq_true.mp prior.1.2 timer member
    change (occurrenceOwnerValid state timer.processInstanceId timer.owner
      timer.elementId timer.activation && _) = true at old
    change (occurrenceOwnerValid (selected.apply state) timer.processInstanceId timer.owner
      timer.elementId timer.activation && _) = true
    simp only [Bool.and_eq_true] at old ⊢
    refine ⟨scopeCreation_preserves_occurrence_owner state operation selected _ _ _ _ selection old.1,
      Eq.trans ?_ old.2⟩
    congr 3
    apply List.filter_congr
    intro candidate candidateMember
    let selectedOperation := candidate
    cases candidate <;> try (cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl)
    all_goals
      rename_i id origin input entry definition boundary
      have counts := fun record => scopeCreation_bounded_scope_filter_frame state selected timer definition record
        (excluded id origin input entry definition boundary (by first | exact Or.inl candidateMember | exact Or.inr candidateMember))
      have activities : (selected.apply state).activityOccurrences = state.activityOccurrences := by
        cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl
      change (if !operationOwnedBy program selectedOperation
          timer.owner then false else
          if !operationOwnedBy program selectedOperation
            timer.owner then false else _ && _ && decide (_ = 1)) = _
      rw [activities]
      simp only [counts]
      rfl

theorem scopeCreation_program_validity_of_structural (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (excluded : ∀ id origin input entry definition boundary,
      (.enterBoundedScope id origin input entry definition boundary ∈ program.operations ∨
        .enterMonitoredScope id origin input entry definition boundary ∈ program.operations) →
        selected.created.parent = none ∨ definition ≠ selected.created.id.definitionScopeId)
    (prior : flowNodeOccurrenceProgramValidity program state = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program (selected.apply state) = true) :
    flowNodeOccurrenceProgramValidity program (selected.apply state) = true := by
  have selectedFrame : (selected.apply state).selectedBranchSets = state.selectedBranchSets := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl
  have racesFrame : (selected.apply state).eventRaces = state.eventRaces := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind] <;> rfl
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at prior ⊢
  rw [selectedFrame, racesFrame]
  refine ⟨⟨⟨structural, scopeCreation_preserves_wait_validity program state operation selected
    selection excluded prior.1.1.2⟩, ?_⟩, ?_⟩
  · rw [List.all_eq_true]
    intro record member
    exact selectInternalScopeCreation_preserves_live state operation selected record.owner
      selection (List.all_eq_true.mp prior.1.2 record member)
  · rw [List.all_eq_true]
    intro race member
    exact selectInternalScopeCreation_preserves_live state operation selected race.owner
      selection (List.all_eq_true.mp prior.2 race member)

end BpmnSemantics.SemanticProcess.InternalCommutation
