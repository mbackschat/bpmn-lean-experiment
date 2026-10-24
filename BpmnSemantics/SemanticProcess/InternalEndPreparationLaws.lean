module

public import BpmnSemantics.SemanticProcess.InternalEndPreparation
public import BpmnSemantics.SemanticProcess.InternalLocalControlPreparationValidity

/-! Prepared End selections preserve runtime-state validity through the local token update. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- End counting is outside the state invariant; token removal uses the existing owned patch law. -/
theorem InternalEndSelection.preserves_runtimeStateWellFormed (program : Program)
    (state : RuntimeState) (selected : InternalEndSelection) (instanceId : SemanticId)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (live : exactLiveOccurrence state selected.owner = true) :
    runtimeStateWellFormed program instanceId (selected.apply state) = true := by
  have separated : selected.tokens.SeparatesActiveCancelOwners program state := by
    unfold TokenPatch.SeparatesActiveCancelOwners
    cases declared : program.compensationExecution with
    | none => trivial
    | some declaration =>
        simp only
        split <;> simp [InternalEndSelection.tokens]
  have tokenValid := selected.tokens.preserves_runtimeStateWellFormed program instanceId state
    valid separated live (by simp [InternalEndSelection.tokens]) (by simp [InternalEndSelection.tokens])
  exact tokenValid

theorem prepareInternalEnd_preserves_runtimeStateWellFormed (program : Program)
    (state : RuntimeState) (operation : SemanticOperation) (prepared : PreparedInternalEnd)
    (instanceId : SemanticId) (valid : runtimeStateWellFormed program instanceId state = true)
    (found : prepareInternalEnd? program state operation = some prepared) :
    runtimeStateWellFormed program instanceId (prepared.selection.apply state) = true := by
  obtain ⟨_, selected, _, _, _, _, _, _, _, live, _, _, _, _, rfl⟩ :=
    prepareInternalEnd_facts program state operation prepared found
  exact selected.preserves_runtimeStateWellFormed program state instanceId valid live

end BpmnSemantics.SemanticProcess.InternalCommutation
