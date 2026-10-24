module

public import BpmnSemantics.SemanticProcess.InternalCommutationCore
public import BpmnSemantics.SemanticProcess.TokenPatch
public import BpmnSemantics.SemanticProcess.InclusiveGateway

/-! The selected-join dependency checkpoint protects InclusiveGateway's unique-ready filter across
independent token patches; complete preparation and publication preservation remain separate obligations.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

namespace InternalCommutation

/-- InclusiveGateway's selector examines every same-key record, including its absent token buckets. -/
def selectedJoinReadAtoms (state : RuntimeState) (selectionKey : String) :
    List InternalStateAtom :=
  canonicalStateAtomSet
    (.selectedBranchOwners selectionKey ::
      (state.selectedBranchSets.filter fun record =>
        decide (record.selectionKey = selectionKey)).flatMap fun record =>
          .selectedBranch record.owner record.selectionKey ::
            record.expectedInputs.map (.controlToken record.owner))

def selectedBranchWriteAtoms (owner : ScopeOccurrenceId) (selectionKey : String) :
    List InternalStateAtom :=
  canonicalStateAtomSet [.selectedBranch owner selectionKey, .selectedBranchOwners selectionKey]

def tokenPatchWriteAtoms (patch : TokenPatch) : List InternalStateAtom :=
  canonicalStateAtomSet ((patch.consumed ++ patch.produced).flatMap fun place =>
    [.controlToken patch.owner place, .tokenOwners place])

theorem selectedBranchOwners_mem_selectedJoinReadAtoms (state : RuntimeState)
    (selectionKey : String) :
    .selectedBranchOwners selectionKey ∈ selectedJoinReadAtoms state selectionKey := by
  simp [selectedJoinReadAtoms, canonicalStateAtomSet, mem_sortBy]

theorem selectedBranch_mem_selectedJoinReadAtoms (state : RuntimeState)
    (selectionKey : String) (record : SelectedBranchSet)
    (present : record ∈ state.selectedBranchSets) (keyMatches : record.selectionKey = selectionKey) :
    .selectedBranch record.owner selectionKey ∈ selectedJoinReadAtoms state selectionKey := by
  simp only [selectedJoinReadAtoms, canonicalStateAtomSet, mem_sortBy, List.mem_eraseDups,
    List.mem_cons, List.mem_flatMap]
  exact Or.inr ⟨record, by simp [present, keyMatches], by simp [keyMatches]⟩

theorem controlToken_mem_selectedJoinReadAtoms (state : RuntimeState)
    (selectionKey : String) (record : SelectedBranchSet) (input : ControlPlaceId)
    (present : record ∈ state.selectedBranchSets) (keyMatches : record.selectionKey = selectionKey)
    (expected : input ∈ record.expectedInputs) :
    .controlToken record.owner input ∈ selectedJoinReadAtoms state selectionKey := by
  simp only [selectedJoinReadAtoms, canonicalStateAtomSet, mem_sortBy, List.mem_eraseDups,
    List.mem_cons, List.mem_flatMap]
  exact Or.inr ⟨record, by simp [present, keyMatches], Or.inr (List.mem_map.mpr ⟨input, expected, rfl⟩)⟩

theorem selectedBranchOwners_mem_selectedBranchWriteAtoms
    (owner : ScopeOccurrenceId) (selectionKey : String) :
    .selectedBranchOwners selectionKey ∈ selectedBranchWriteAtoms owner selectionKey := by
  simp [selectedBranchWriteAtoms, canonicalStateAtomSet, mem_sortBy]

theorem selectedBranch_mem_selectedBranchWriteAtoms
    (owner : ScopeOccurrenceId) (selectionKey : String) :
    .selectedBranch owner selectionKey ∈ selectedBranchWriteAtoms owner selectionKey := by
  simp [selectedBranchWriteAtoms, canonicalStateAtomSet, mem_sortBy]

theorem controlToken_mem_tokenPatchWriteAtoms (patch : TokenPatch) (place : ControlPlaceId)
    (written : place ∈ patch.consumed ++ patch.produced) :
    .controlToken patch.owner place ∈ tokenPatchWriteAtoms patch := by
  simp only [tokenPatchWriteAtoms, canonicalStateAtomSet, mem_sortBy, List.mem_eraseDups,
    List.mem_flatMap]
  exact ⟨place, written, by simp⟩

private theorem disjoint_excludes_shared_atom (writes reads : List InternalStateAtom)
    (separated : listsDisjoint writes reads = true) (atom : InternalStateAtom)
    (written : atom ∈ writes) (read : atom ∈ reads) : False := by
  simp only [listsDisjoint, List.all_eq_true] at separated
  have absent := separated atom written
  simp [List.contains_eq_mem, read] at absent

theorem selectedBranchOwners_write_conflicts (state : RuntimeState) (selectionKey : String)
    (writes : List InternalStateAtom) (written : .selectedBranchOwners selectionKey ∈ writes) :
    listsDisjoint writes (selectedJoinReadAtoms state selectionKey) = false := by
  cases separated : listsDisjoint writes (selectedJoinReadAtoms state selectionKey) with
  | false => rfl
  | true => exact False.elim (disjoint_excludes_shared_atom _ _ separated _ written
      (selectedBranchOwners_mem_selectedJoinReadAtoms state selectionKey))

theorem selectedBranchWriteAtoms_conflict (state : RuntimeState)
    (owner : ScopeOccurrenceId) (selectionKey : String) :
    listsDisjoint (selectedBranchWriteAtoms owner selectionKey)
      (selectedJoinReadAtoms state selectionKey) = false :=
  selectedBranchOwners_write_conflicts state selectionKey _
    (selectedBranchOwners_mem_selectedBranchWriteAtoms owner selectionKey)

theorem selectedJoin_input_tokenPatch_conflicts (state : RuntimeState) (selectionKey : String)
    (record : SelectedBranchSet) (input : ControlPlaceId) (patch : TokenPatch)
    (present : record ∈ state.selectedBranchSets) (keyMatches : record.selectionKey = selectionKey)
    (expected : input ∈ record.expectedInputs) (ownerMatches : patch.owner = record.owner)
    (written : input ∈ patch.consumed ++ patch.produced) :
    listsDisjoint (tokenPatchWriteAtoms patch) (selectedJoinReadAtoms state selectionKey) = false := by
  cases separated : listsDisjoint (tokenPatchWriteAtoms patch)
      (selectedJoinReadAtoms state selectionKey) with
  | false => rfl
  | true =>
      have read := controlToken_mem_selectedJoinReadAtoms state selectionKey record input
        present keyMatches expected
      rw [← ownerMatches] at read
      exact False.elim (disjoint_excludes_shared_atom _ _ separated _
        (controlToken_mem_tokenPatchWriteAtoms patch input written) read)

theorem selectedJoin_tokenPatch_bucket_ne (state : RuntimeState) (selectionKey : String)
    (record : SelectedBranchSet) (input : ControlPlaceId) (patch : TokenPatch)
    (separated : listsDisjoint (tokenPatchWriteAtoms patch)
      (selectedJoinReadAtoms state selectionKey) = true)
    (present : record ∈ state.selectedBranchSets) (keyMatches : record.selectionKey = selectionKey)
    (expected : input ∈ record.expectedInputs) (place : ControlPlaceId)
    (written : place ∈ patch.consumed ++ patch.produced) :
    ({ placeId := place, owner := patch.owner } : ControlToken) ≠
      { placeId := input, owner := record.owner } := by
  intro same
  have placeMatches : place = input := congrArg ControlToken.placeId same
  have ownerMatches : patch.owner = record.owner := congrArg ControlToken.owner same
  have conflict := selectedJoin_input_tokenPatch_conflicts state selectionKey record input patch
    present keyMatches expected ownerMatches (placeMatches ▸ written)
  simp [separated] at conflict

theorem selectedJoinReadAtoms_tokenPatch_frame (state : RuntimeState) (selectionKey : String)
    (patch : TokenPatch) :
    selectedJoinReadAtoms { state with tokens := patch.apply state.tokens } selectionKey =
      selectedJoinReadAtoms state selectionKey := rfl

end InternalCommutation

end BpmnSemantics.SemanticProcess
