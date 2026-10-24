module

public import BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission

/-! # Wait declarations across parallel-scope command completion

PMIS-DATA-01 completion erases a selected wait and changes data and tokens.
RSI-BIND-04 therefore follows from the predecessor declaration census without
assuming successful scheduling or a well-formed successor.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.ParallelScopeCommand

open BpmnSemantics

private theorem declared_after_erase {α : Type} [BEq α] [LawfulBEq α]
    (values : List α) (removed : α) (inInstance declaration : α → Bool)
    (valid : (values.filter inInstance).all declaration = true) :
    ((values.erase removed).filter inInstance).all declaration = true := by
  apply List.all_eq_true.mpr
  intro value member
  obtain ⟨retained, hosting⟩ := List.mem_filter.mp member
  exact List.all_eq_true.mp valid value
    (List.mem_filter.mpr ⟨List.erase_sublist.subset retained, hosting⟩)

private theorem human_erasure_declarations (program : Program) (hosting : SemanticId)
    (state : RuntimeState) (wait : UserTaskWait)
    (valid : waitDeclarationsValid program hosting state = true) :
    waitDeclarationsValid program hosting { state with waits := state.waits.erase wait } = true := by
  simp only [waitDeclarationsValid, Bool.and_eq_true, and_assoc] at valid ⊢
  exact ⟨declared_after_erase _ _ _ _ valid.1, valid.2⟩

private theorem effect_erasure_declarations (program : Program) (hosting : SemanticId)
    (state : RuntimeState) (wait : EffectWait)
    (valid : waitDeclarationsValid program hosting state = true) :
    waitDeclarationsValid program hosting { state with effectWaits := state.effectWaits.erase wait } = true := by
  simp only [waitDeclarationsValid, Bool.and_eq_true, and_assoc] at valid ⊢
  exact ⟨valid.1, valid.2.1, valid.2.2.1,
    declared_after_erase _ _ _ _ valid.2.2.2.1, valid.2.2.2.2⟩

/-- Actual ordinary and scoped Human completion retain the canonical declarations of every surviving wait. -/
theorem completeTask_wait_declarations (program : Program) (hosting : SemanticId)
    (before after : RuntimeState) (id : UserTaskInstanceId) (values : List VariableBinding)
    (valid : waitDeclarationsValid program hosting before = true)
    (completed : completeTask? program before id values = some after) :
    waitDeclarationsValid program hosting after = true := by
  unfold completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact human_erasure_declarations program hosting before _ valid
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact human_erasure_declarations program hosting before _ valid

/-- Both successful Service completion routes dispose work without changing a surviving wait's declarer. -/
theorem completeEffect_success_wait_declarations (program : Program) (hosting : SemanticId)
    (before after : RuntimeState) (id : EffectOccurrenceId) (values : List VariableBinding)
    (valid : waitDeclarationsValid program hosting before = true)
    (completed : completeEffect? program before id (.success values) = some after) :
    waitDeclarationsValid program hosting after = true := by
  unfold completeEffect? at completed
  split at completed <;> try contradiction
  rename_i candidates wait selected
  split at completed
  · unfold completeParallelScopeEffect? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact effect_erasure_declarations program hosting before _ valid
    case h_2 =>
      rename_i result impossible
      exact False.elim (impossible values rfl)
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact effect_erasure_declarations program hosting before _ valid

end BpmnSemantics.SemanticProcess.ParallelScopeCommand
