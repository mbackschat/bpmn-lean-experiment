import BpmnSemantics.SemanticProcess.InternalCommutationCore

/-! Exact alternatives separate Merge input choice from canonical presentation order under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#explicit-observable-choice).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

inductive InternalAlternative where
  | operation (id : OperationId)
  | mergeInput (id : OperationId) (owner : ScopeOccurrenceId) (input : ControlPlaceId)
  deriving Repr, DecidableEq

def InternalAlternative.operationId : InternalAlternative → OperationId
  | .operation id | .mergeInput id _ _ => id

def internalAlternativeBefore : InternalAlternative → InternalAlternative → Bool
  | .operation left, .operation right => left.value < right.value
  | .operation _, .mergeInput .. => true
  | .mergeInput .., .operation _ => false
  | .mergeInput left leftOwner leftInput, .mergeInput right rightOwner rightInput =>
      if left ≠ right then left.value < right.value
      else if leftOwner ≠ rightOwner then scopeBefore leftOwner rightOwner
      else leftInput.value < rightInput.value

/-- Bucket multiplicity is retained by execution; indistinguishable units present one exact choice. -/
def internalMergeInputAlternatives (state : RuntimeState) : SemanticOperation → List InternalAlternative
  | .mergeExclusive id _ inputs _ =>
      sortBy internalAlternativeBefore
        ((exclusiveMergeInputTokens state inputs).map fun token =>
          InternalAlternative.mergeInput id token.owner token.placeId).eraseDups
  | _ => []

/-- Discovery includes exactly every offered owner/input key even when the unique-offer evaluator refuses. -/
theorem mem_internalMergeInputAlternatives (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (inputs : List ControlPlaceId)
    (output input : ControlPlaceId) (owner : ScopeOccurrenceId) :
    InternalAlternative.mergeInput id owner input ∈
        internalMergeInputAlternatives state (.mergeExclusive id origin inputs output) ↔
      input ∈ inputs ∧ ⟨input, owner⟩ ∈ state.tokens := by
  simp only [internalMergeInputAlternatives, mem_sortBy, List.mem_eraseDups,
    List.mem_map, exclusiveMergeInputTokens, List.mem_filter]
  constructor
  · rintro ⟨⟨place, tokenOwner⟩, ⟨present, offered⟩, matched⟩
    cases matched
    change inputs.contains place = true at offered
    exact ⟨by simpa using offered, present⟩
  · rintro ⟨offered, present⟩
    refine ⟨⟨input, owner⟩, ⟨present, ?_⟩, rfl⟩
    change inputs.contains input = true
    simpa using offered

end BpmnSemantics.SemanticProcess.InternalCommutation
