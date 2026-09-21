import BpmnSemantics.SemanticProcess.InternalRegionalPreparation
import BpmnSemantics.SemanticProcess.InternalOccurrenceRegionLaws
import BpmnSemantics.SemanticProcess.InternalLocalControlFootprintCommutation

/-! The complete regional read set protects the owner region and place-wide selectors from
local-control writes. These are the dependencies required by INTERNAL-COMMUTATION's frame law. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem regional_independent_write_read (left right : InternalRegionalStateFootprint)
    (independent : regionalStateFootprintsIndependent left right = true)
    (written read : InternalRegionalStateAtom) (writes : written ∈ right.writes)
    (reads : read ∈ left.reads) : regionalStateAtomsConflict written read = false := by
  have disjoint := (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp independent).1).2
  have absent := List.all_eq_true.mp disjoint written writes
  apply Bool.eq_false_iff.mpr
  intro conflict
  have present : (left.reads.any (regionalStateAtomsConflict written)) = true :=
    List.any_eq_true.mpr ⟨read, reads, conflict⟩
  simp [present] at absent

theorem regionalStateFootprint_region_read (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint)
    (found : regionalStateFootprint? state selected region = some footprint) :
    .occurrenceRegion region ∈ footprint.reads := by
  unfold regionalStateFootprint? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨base, selectedBase, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  apply (canonicalRegionalStateAtoms_mem _ _).mpr
  unfold regionalBaseFootprint? at selectedBase
  repeat' first | (solve | simp at selectedBase) | split at selectedBase
  all_goals cases selectedBase <;> simp

theorem regionalStateFootprint_selector_read (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint)
    (found : regionalStateFootprint? state selected region = some footprint) :
    match selected.operation with
    | .throwError _ _ input _ _ | .terminateScope _ _ input _ =>
        .ordinary (.tokenOwners input) ∈ footprint.reads
    | _ => True := by
  unfold regionalStateFootprint? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨base, selectedBase, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  unfold regionalBaseFootprint? at selectedBase
  repeat' first | (solve | simp at selectedBase) | split at selectedBase
  all_goals cases selectedBase <;> simp_all [canonicalRegionalStateAtoms_mem]

theorem regional_localControl_token_outside (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (control : InternalLocalControlSelection)
    (instanceId : SemanticId)
    (found : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)) = true)
    (place : ControlPlaceId) (member : place ∈ control.tokens.consumed ++ control.tokens.produced) :
    region.contains control.owner = false := by
  have written := localControl_token_write state control instanceId place member
  have lifted : liftRegionalStateAtom control.owner (.controlToken control.owner place) ∈
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)).writes :=
    List.mem_map.mpr ⟨_, written, rfl⟩
  have conflict := regional_independent_write_read _ _ independent _ _ lifted
    (regionalStateFootprint_region_read state selected region footprint found)
  simpa [liftRegionalStateAtom, regionalStateAtomsConflict, regionalOwnsAtom,
    regionalOwnsOrdinaryAtom] using conflict

theorem regional_localControl_census_untouched (state : RuntimeState)
    (footprint : InternalRegionalStateFootprint) (control : InternalLocalControlSelection)
    (instanceId : SemanticId) (input : ControlPlaceId)
    (read : .ordinary (.tokenOwners input) ∈ footprint.reads)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)) = true) :
    input ∉ control.tokens.consumed ++ control.tokens.produced := by
  intro member
  have written := localControl_tokenOwners_write state control instanceId input member
  have lifted : liftRegionalStateAtom control.owner (.tokenOwners input) ∈
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)).writes :=
    List.mem_map.mpr ⟨_, written, rfl⟩
  have conflict := regional_independent_write_read _ _ independent _ _ lifted read
  simp [liftRegionalStateAtom, regionalStateAtomsConflict] at conflict

theorem regional_localControl_branch_outside (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (control : InternalLocalControlSelection)
    (instanceId : SemanticId)
    (found : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)) = true)
    (record : SelectedBranchSet)
    (changed : control.selectedBranch = .insert record ∨ control.selectedBranch = .remove record) :
    region.contains record.owner = false := by
  have written : .selectedBranch record.owner record.selectionKey ∈
      (internalLocalControlStateFootprint state control instanceId).writes := by
    simp only [internalLocalControlStateFootprint, canonicalStateAtomSet, mem_sortBy,
      List.mem_eraseDups, List.mem_append]
    apply Or.inr
    rcases changed with inserted | removed
    · simpa only [internalLocalControlExtraWrites, inserted] using
        selectedBranch_mem_selectedBranchWriteAtoms record.owner record.selectionKey
    · simpa only [internalLocalControlExtraWrites, removed] using
        selectedBranch_mem_selectedBranchWriteAtoms record.owner record.selectionKey
  have lifted : liftRegionalStateAtom control.owner (.selectedBranch record.owner record.selectionKey) ∈
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)).writes :=
    List.mem_map.mpr ⟨_, written, rfl⟩
  have conflict := regional_independent_write_read _ _ independent _ _ lifted
    (regionalStateFootprint_region_read state selected region footprint found)
  simpa [liftRegionalStateAtom, regionalStateAtomsConflict, regionalOwnsAtom,
    regionalOwnsOrdinaryAtom] using conflict

end BpmnSemantics.SemanticProcess.InternalCommutation
