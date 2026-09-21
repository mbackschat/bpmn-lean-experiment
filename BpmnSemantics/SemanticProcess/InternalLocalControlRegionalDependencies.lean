import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlDependencies

/-! The reverse preparation frame uses regional writes against local-control reads, including
the scope owner and competing selected-join buckets in the complete predecessor footprint. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem regional_disjoint_members (left right : List InternalRegionalStateAtom)
    (disjoint : regionalAtomListsDisjoint left right = true)
    (written read : InternalRegionalStateAtom) (writes : written ∈ left) (reads : read ∈ right) :
    regionalStateAtomsConflict written read = false := by
  have absent := List.all_eq_true.mp disjoint written writes
  apply Bool.eq_false_iff.mpr
  intro conflict
  have present : right.any (regionalStateAtomsConflict written) = true :=
    List.any_eq_true.mpr ⟨read, reads, conflict⟩
  simp [present] at absent

theorem regional_independent_read_write (left right : InternalRegionalStateFootprint)
    (independent : regionalStateFootprintsIndependent left right = true)
    (written read : InternalRegionalStateAtom) (writes : written ∈ left.writes)
    (reads : read ∈ right.reads) : regionalStateAtomsConflict written read = false := by
  exact regional_disjoint_members _ _
    (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp independent).1).1 written read writes reads

theorem regional_independent_write_write (left right : InternalRegionalStateFootprint)
    (independent : regionalStateFootprintsIndependent left right = true)
    (first second : InternalRegionalStateAtom) (firstWrite : first ∈ left.writes)
    (secondWrite : second ∈ right.writes) : regionalStateAtomsConflict first second = false := by
  exact regional_disjoint_members _ _ (Bool.and_eq_true_iff.mp independent).2
    first second firstWrite secondWrite

theorem regionalStateFootprint_region_write (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint)
    (found : regionalStateFootprint? state selected region = some footprint) :
    .occurrenceRegion region ∈ footprint.writes := by
  unfold regionalStateFootprint? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨base, selectedBase, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  apply (canonicalRegionalStateAtoms_mem _ _).mpr
  apply List.mem_append_left
  unfold regionalBaseFootprint? at selectedBase
  repeat' first | (solve | simp at selectedBase) | split at selectedBase
  all_goals cases selectedBase <;> simp

theorem regionalStateFootprint_base_write (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint base : InternalRegionalStateFootprint) (hosting : SemanticId)
    (running : state.control = .running hosting)
    (found : regionalStateFootprint? state selected region = some footprint)
    (baseFound : regionalBaseFootprint? state hosting selected region = some base)
    (atom : InternalRegionalStateAtom) (written : atom ∈ base.writes) : atom ∈ footprint.writes := by
  simp only [regionalStateFootprint?, runningInstance?, running, baseFound,
    Option.bind_eq_bind, Option.bind_some] at found
  cases found
  exact (canonicalRegionalStateAtoms_mem _ _).mpr (List.mem_append_left _ written)

theorem regionalStateFootprint_census_writes (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint)
    (found : regionalStateFootprint? state selected region = some footprint) :
    match selected.operation, selected.kind with
    | .returnProcess _ _ _ _ output, .returning _ =>
        ∀ atom ∈ regionalCensusWrites state region [output], atom ∈ footprint.writes
    | .throwError _ _ _ _ handler, .interrupting _ =>
        ∀ atom ∈ regionalCensusWrites state region [handler.output], atom ∈ footprint.writes
    | .terminateScope .., .terminating =>
        ∀ atom ∈ regionalCensusWrites state region [], atom ∈ footprint.writes
    | _, _ => True := by
  unfold regionalStateFootprint? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨base, selectedBase, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  unfold regionalBaseFootprint? at selectedBase
  repeat' first | (solve | simp at selectedBase) | split at selectedBase
  all_goals cases selectedBase <;> simp_all only
  all_goals first
    | trivial
    | (intro atom member; exact (canonicalRegionalStateAtoms_mem _ _).mpr
        (List.mem_append_left _ (List.mem_append_left _ member)))

theorem localControl_regional_bucket_not_written (state : RuntimeState)
    (footprint : InternalRegionalStateFootprint) (control : InternalLocalControlSelection)
    (instanceId : SemanticId)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)) = true)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId)
    (read : .controlToken owner place ∈
      (internalLocalControlStateFootprint state control instanceId).reads) :
    .ordinary (.controlToken owner place) ∉ footprint.writes := by
  intro written
  have lifted : liftRegionalStateAtom control.owner (.controlToken owner place) ∈
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)).reads :=
    List.mem_map.mpr ⟨_, read, rfl⟩
  have conflict := regional_independent_read_write _ _ independent _ _ written lifted
  simp [liftRegionalStateAtom, regionalStateAtomsConflict] at conflict

theorem localControl_regional_control_not_written (state : RuntimeState)
    (footprint : InternalRegionalStateFootprint) (control : InternalLocalControlSelection)
    (instanceId : SemanticId)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)) = true) :
    .ordinary (.runtimeControl instanceId) ∉ footprint.writes := by
  intro written
  have read : .runtimeControl instanceId ∈
      (internalLocalControlStateFootprint state control instanceId).reads := by
    simp [internalLocalControlStateFootprint, canonicalStateAtomSet, mem_sortBy]
  have lifted : liftRegionalStateAtom control.owner (.runtimeControl instanceId) ∈
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)).reads :=
    List.mem_map.mpr ⟨_, read, rfl⟩
  have conflict := regional_independent_read_write _ _ independent _ _ written lifted
  simp [liftRegionalStateAtom, regionalStateAtomsConflict] at conflict

theorem localControl_regional_scope_outside (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (control : InternalLocalControlSelection)
    (instanceId : SemanticId)
    (found : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)) = true) :
    region.contains control.owner = false := by
  have read : .scopeOccurrence control.owner ∈
      (internalLocalControlStateFootprint state control instanceId).reads := by
    simp [internalLocalControlStateFootprint, canonicalStateAtomSet, mem_sortBy]
  have lifted : liftRegionalStateAtom control.owner (.scopeOccurrence control.owner) ∈
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)).reads :=
    List.mem_map.mpr ⟨_, read, rfl⟩
  have conflict := regional_independent_read_write _ _ independent _ _
    (regionalStateFootprint_region_write state selected region footprint found) lifted
  simpa [liftRegionalStateAtom, regionalStateAtomsConflict, regionalOwnsAtom,
    regionalOwnsOrdinaryAtom] using conflict

theorem localControl_regional_bucket_outside (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (control : InternalLocalControlSelection)
    (instanceId : SemanticId)
    (found : regionalStateFootprint? state selected region = some footprint)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)) = true)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId)
    (read : .controlToken owner place ∈
      (internalLocalControlStateFootprint state control instanceId).reads) :
    region.contains owner = false := by
  have lifted : liftRegionalStateAtom control.owner (.controlToken owner place) ∈
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)).reads :=
    List.mem_map.mpr ⟨_, read, rfl⟩
  have conflict := regional_independent_read_write _ _ independent _ _
    (regionalStateFootprint_region_write state selected region footprint found) lifted
  simpa [liftRegionalStateAtom, regionalStateAtomsConflict, regionalOwnsAtom,
    regionalOwnsOrdinaryAtom] using conflict

theorem localControl_regional_census_not_written (state : RuntimeState)
    (footprint : InternalRegionalStateFootprint) (control : InternalLocalControlSelection)
    (instanceId : SemanticId)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)) = true)
    (place : ControlPlaceId) (read : place ∈ control.censusReads) :
    .ordinary (.tokenOwners place) ∉ footprint.writes := by
  intro written
  have lifted : liftRegionalStateAtom control.owner (.tokenOwners place) ∈
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)).reads :=
    List.mem_map.mpr ⟨_, localControl_tokenOwners_read state control instanceId place read, rfl⟩
  have conflict := regional_independent_read_write _ _ independent _ _ written lifted
  simp [liftRegionalStateAtom, regionalStateAtomsConflict] at conflict

theorem localControl_regional_selectedKey_not_written (state : RuntimeState)
    (footprint : InternalRegionalStateFootprint) (control : InternalLocalControlSelection)
    (instanceId : SemanticId)
    (independent : regionalStateFootprintsIndependent footprint
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)) = true)
    (key : String) (changed : control.selectedBranch.selectionKey = some key) :
    .ordinary (.selectedBranchOwners key) ∉ footprint.writes := by
  intro written
  have lifted : liftRegionalStateAtom control.owner (.selectedBranchOwners key) ∈
      (liftRegionalStateFootprint control.owner
        (internalLocalControlStateFootprint state control instanceId)).writes :=
    List.mem_map.mpr ⟨_, localControl_selectedKey_write state control instanceId key changed, rfl⟩
  have conflict := regional_independent_write_write _ _ independent _ _ written lifted
  simp [liftRegionalStateAtom, regionalStateAtomsConflict] at conflict

end BpmnSemantics.SemanticProcess.InternalCommutation
