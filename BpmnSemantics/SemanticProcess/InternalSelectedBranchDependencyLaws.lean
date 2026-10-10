import BpmnSemantics.SemanticProcess.InternalSelectedBranchDependencies
import BpmnSemantics.SemanticProcess.TokenPatchLaws

/-! Selected-join readiness is unchanged by token patches outside its recorded read dependency. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem selectedJoin_input_tokenPatch_frame (state : RuntimeState) (selectionKey : String)
    (record : SelectedBranchSet) (input : ControlPlaceId) (patch : TokenPatch)
    (separated : listsDisjoint (tokenPatchWriteAtoms patch)
      (selectedJoinReadAtoms state selectionKey) = true)
    (present : record ∈ state.selectedBranchSets) (keyMatches : record.selectionKey = selectionKey)
    (expected : input ∈ record.expectedInputs) :
    selectedInputOwnedReady { state with tokens := patch.apply state.tokens } record.owner input =
      selectedInputOwnedReady state record.owner input := by
  have rejected (place : ControlPlaceId) (written : place ∈ patch.consumed ++ patch.produced) :
      decide (place = input && patch.owner = record.owner) = false := by
    have different := selectedJoin_tokenPatch_bucket_ne state selectionKey record input patch
      separated present keyMatches expected place written
    simp only [decide_eq_false_iff_not, Bool.and_eq_true, decide_eq_true_eq]
    intro same
    exact different (by rw [same.1, same.2])
  unfold selectedInputOwnedReady
  rw [patch.filter_untouched state.tokens _
    (fun place member => rejected place (List.mem_append_left _ member))
    (fun place member => rejected place (List.mem_append_right _ member))]

theorem selectedJoin_record_tokenPatch_frame (state : RuntimeState) (selectionKey : String)
    (record : SelectedBranchSet) (patch : TokenPatch)
    (separated : listsDisjoint (tokenPatchWriteAtoms patch)
      (selectedJoinReadAtoms state selectionKey) = true)
    (present : record ∈ state.selectedBranchSets) :
    selectedBranchJoinReady { state with tokens := patch.apply state.tokens } selectionKey record =
      selectedBranchJoinReady state selectionKey record := by
  by_cases keyMatches : record.selectionKey = selectionKey
  · simp only [selectedBranchJoinReady, keyMatches, decide_true, Bool.true_and]
    apply Bool.eq_iff_iff.mpr
    simp only [List.all_eq_true]
    constructor <;> intro ready input expected
    · rw [← selectedJoin_input_tokenPatch_frame state selectionKey record input patch
        separated present keyMatches expected]
      exact ready input expected
    · rw [selectedJoin_input_tokenPatch_frame state selectionKey record input patch
        separated present keyMatches expected]
      exact ready input expected
  · simp [selectedBranchJoinReady, keyMatches]

/-- The actual InclusiveGateway ready-record filter is stable from predecessor dependencies alone. -/
theorem selectedJoinReadyRecords_tokenPatch_frame (state : RuntimeState) (selectionKey : String)
    (patch : TokenPatch)
    (separated : listsDisjoint (tokenPatchWriteAtoms patch)
      (selectedJoinReadAtoms state selectionKey) = true) :
    ({ state with tokens := patch.apply state.tokens } : RuntimeState).selectedBranchSets.filter
        (selectedBranchJoinReady { state with tokens := patch.apply state.tokens } selectionKey) =
      state.selectedBranchSets.filter (selectedBranchJoinReady state selectionKey) := by
  apply List.filter_congr
  intro record present
  exact selectedJoin_record_tokenPatch_frame state selectionKey record patch separated present

theorem selectedJoin_uniqueReady_tokenPatch_frame (state : RuntimeState) (selectionKey : String)
    (patch : TokenPatch) (record : SelectedBranchSet)
    (separated : listsDisjoint (tokenPatchWriteAtoms patch)
      (selectedJoinReadAtoms state selectionKey) = true) :
    ({ state with tokens := patch.apply state.tokens } : RuntimeState).selectedBranchSets.filter
        (selectedBranchJoinReady { state with tokens := patch.apply state.tokens } selectionKey) =
        [record] ↔
      state.selectedBranchSets.filter (selectedBranchJoinReady state selectionKey) = [record] := by
  rw [selectedJoinReadyRecords_tokenPatch_frame state selectionKey patch separated]

end BpmnSemantics.SemanticProcess.InternalCommutation
