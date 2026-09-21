import BpmnSemantics.SemanticProcess.InternalRegionalCancellationEffectValidity
import BpmnSemantics.SemanticProcess.InternalRegionalPositionValidity

/-! Cancellation preserves immutable Program correspondence by retaining each surviving
owner census. The selected child may itself survive; singleton preservation handles that
case without requiring it to lie outside its own cancellation region. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem cancelScopeSubtree_child_structural_program_validity (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (valid : runtimePositionValid program expected state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (prior : flowNodeOccurrenceStructuralProgramValidity program state = true) :
    flowNodeOccurrenceStructuralProgramValidity program (cancelScopeSubtree state root.id disposition) = true := by
  have calls := cancellation_child_calls_frame program state expected hosting valid running root rootMember child disposition
  have control : (cancelScopeSubtree state root.id disposition).control = state.control := rfl
  simp only [flowNodeOccurrenceStructuralProgramValidity, Bool.and_eq_true, List.all_eq_true] at prior ⊢
  constructor
  · intro occurrence member
    have previous := prior.1 occurrence (List.mem_filter.mp member).1
    change (match program.definitionScopes.filter (fun scope => decide (scope.id = occurrence.id.definitionScopeId)) with
      | [definition] => _
      | _ => false) = true at previous ⊢
    split at previous
    · rename_i definition declared
      simp only [Bool.and_eq_true] at previous ⊢
      refine ⟨⟨⟨⟨⟨previous.1.1.1.1.1, previous.1.1.1.1.2⟩, previous.1.1.1.2⟩,
        ?_⟩, previous.1.2⟩, ?_⟩
      · exact exactLiveOccurrence_sublist_of_mem state _ List.filter_sublist occurrence member previous.1.1.2
      · rw [control]
        have binding := previous.2
        cases parentEq : occurrence.parent with
        | none =>
            cases definitionParent : definition.parentScopeId <;> cases lifecycle : state.control <;>
              simpa only [definitionParent, lifecycle, parentEq, calls] using binding
        | some parent =>
            have outside := cancelScopeSubtree_child_parent_outside program state expected hosting valid running
              root rootMember child disposition occurrence member parent parentEq
            have census : flowNodeOccurrenceOwnerLiveUnique (cancelScopeSubtree state root.id disposition) parent =
                flowNodeOccurrenceOwnerLiveUnique state parent := by
              simp only [flowNodeOccurrenceOwnerLiveUnique,
                cancelScopeSubtree_uncancelled_owner_census state root.id disposition parent outside]
            cases definitionParent : definition.parentScopeId <;> cases lifecycle : state.control <;>
              simpa only [definitionParent, lifecycle, parentEq, census] using binding
    · contradiction
  · intro record member
    have previous := prior.2 record (by rwa [calls] at member)
    have kept := (List.mem_filter.mp member).2
    simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
    change (FlowNodeOccurrenceProgramValidity.Internal.occurrenceOwnerValid _ record.id.processInstanceId
      record.caller ⟨record.id.elementId.value⟩ record.id.activation && _) = true
    change (FlowNodeOccurrenceProgramValidity.Internal.occurrenceOwnerValid state record.id.processInstanceId
      record.caller ⟨record.id.elementId.value⟩ record.id.activation && _) = true at previous
    simpa only [cancelScopeSubtree_occurrence_owner_frame state root.id disposition record.caller _ _ _ kept.1]
      using previous

theorem cancelScopeSubtree_program_validity_of_structural (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (prior : flowNodeOccurrenceProgramValidity program state = true)
    (incidents : effectIncidentAssociationsValid state = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program (cancelScopeSubtree state root disposition) = true) :
    flowNodeOccurrenceProgramValidity program (cancelScopeSubtree state root disposition) = true := by
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at prior ⊢
  refine ⟨⟨⟨structural,
    cancelScopeSubtree_complete_wait_program_validity program state root disposition prior.1.1.2 incidents⟩,
    ?_⟩, ?_⟩
  · apply List.all_eq_true.mpr
    intro record member
    obtain ⟨present, outside⟩ := List.mem_filter.mp member
    have previous := List.all_eq_true.mp prior.1.2 record present
    simp only [Bool.not_eq_true'] at outside
    simpa only [flowNodeOccurrenceOwnerLiveUnique,
      cancelScopeSubtree_uncancelled_owner_census state root disposition record.owner outside] using previous
  · apply List.all_eq_true.mpr
    intro race member
    obtain ⟨present, outside⟩ := List.mem_filter.mp member
    have previous := List.all_eq_true.mp prior.2 race present
    simp only [Bool.not_eq_true'] at outside
    simpa only [flowNodeOccurrenceOwnerLiveUnique,
      cancelScopeSubtree_uncancelled_owner_census state root disposition race.owner outside] using previous

theorem cancelScopeSubtree_child_program_validity (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (valid : runtimePositionValid program expected state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (prior : flowNodeOccurrenceProgramValidity program state = true)
    (incidents : effectIncidentAssociationsValid state = true) :
    flowNodeOccurrenceProgramValidity program (cancelScopeSubtree state root.id disposition) = true := by
  have parts := prior
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at parts
  exact cancelScopeSubtree_program_validity_of_structural program state root.id disposition prior incidents
    (cancelScopeSubtree_child_structural_program_validity program state expected hosting root disposition
      valid running rootMember child parts.1.1.1)

end BpmnSemantics.SemanticProcess.InternalCommutation
