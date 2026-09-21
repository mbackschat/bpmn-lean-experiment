import BpmnSemantics.SemanticProcess.InternalLocalControlRegionalDependencies

/-! The existing regional conflict predicate protects occurrence regions as well as concrete keys. These laws expose its symmetric and directional consequences without introducing a second independence account. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem shared_member_symmetric [DecidableEq α] (left right : List α) :
    left.any right.contains = right.any left.contains := by
  apply Bool.eq_iff_iff.mpr
  simp only [List.any_eq_true, List.contains_iff_mem]
  constructor
  · rintro ⟨value, leftMember, rightMember⟩
    exact ⟨value, rightMember, leftMember⟩
  · rintro ⟨value, rightMember, leftMember⟩
    exact ⟨value, leftMember, rightMember⟩

theorem regionalStateAtomsConflict_symmetric (left right : InternalRegionalStateAtom) :
    regionalStateAtomsConflict left right = regionalStateAtomsConflict right left := by
  have activity (first second : ActivityOccurrence) :
      regionalActivityAssociationsConflict first second =
        regionalActivityAssociationsConflict second first := by
    simp only [regionalActivityAssociationsConflict, sameActivityOccurrence]
    rw [shared_member_symmetric (regionalActivityBodyTasks first.body),
      shared_member_symmetric first.attachedHandlers]
    cases first.body <;> cases second.body <;> simp [BEq.beq, eq_comm]
  have regions (first second : InternalOccurrenceRegion) :
      occurrenceRegionsOverlap first second = occurrenceRegionsOverlap second first :=
    shared_member_symmetric first.members second.members
  cases left <;> cases right <;>
    simp [regionalStateAtomsConflict, regionalOwnsAtom, activity, regions, BEq.beq, eq_comm]

theorem regionalStateFootprintsIndependent_symmetric (left right : InternalRegionalStateFootprint)
    (independent : regionalStateFootprintsIndependent left right = true) :
    regionalStateFootprintsIndependent right left = true := by
  obtain ⟨⟨forward, reverse⟩, writes⟩ :=
    (Bool.and_eq_true_iff.mp independent).imp_left Bool.and_eq_true_iff.mp
  apply Bool.and_eq_true_iff.mpr
  refine ⟨Bool.and_eq_true_iff.mpr ⟨reverse, forward⟩, ?_⟩
  apply List.all_eq_true.mpr
  intro second secondWrite
  suffices absent : left.writes.any (regionalStateAtomsConflict second) = false by
    simp [absent]
  apply Bool.eq_false_iff.mpr
  intro conflict
  obtain ⟨first, firstWrite, clash⟩ := List.any_eq_true.mp conflict
  have absent := List.all_eq_true.mp writes first firstWrite
  have reversed : right.writes.any (regionalStateAtomsConflict first) = true :=
    List.any_eq_true.mpr ⟨second, secondWrite, by
      rwa [regionalStateAtomsConflict_symmetric]⟩
  simp [reversed] at absent

/-- The existing region read/write atoms supply the disjointness required by the removal laws. -/
theorem regional_pair_regions_disjoint (state : RuntimeState)
    (left right : InternalRegionalSelection) (leftRegion rightRegion : InternalOccurrenceRegion)
    (leftFootprint rightFootprint : InternalRegionalStateFootprint)
    (leftFound : regionalStateFootprint? state left leftRegion = some leftFootprint)
    (rightFound : regionalStateFootprint? state right rightRegion = some rightFootprint)
    (independent : regionalStateFootprintsIndependent leftFootprint rightFootprint = true) :
    ∀ owner, owner ∈ leftRegion.members → owner ∈ rightRegion.members → False := by
  have separated := regional_independent_read_write _ _ independent _ _
    (regionalStateFootprint_region_write state left leftRegion leftFootprint leftFound)
    (regionalStateFootprint_region_read state right rightRegion rightFootprint rightFound)
  intro owner leftMember rightMember
  have overlap : occurrenceRegionsOverlap leftRegion rightRegion = true :=
    List.any_eq_true.mpr ⟨owner, leftMember, List.contains_iff_mem.mpr rightMember⟩
  simp [regionalStateAtomsConflict, regionalOwnsAtom, overlap] at separated

theorem regionalStateFootprint_control_read (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (hosting : SemanticId)
    (running : state.control = .running hosting)
    (found : regionalStateFootprint? state selected region = some footprint) :
    .ordinary (.runtimeControl hosting) ∈ footprint.reads := by
  unfold regionalStateFootprint? at found
  simp only [runningInstance?, running, Option.bind_eq_bind, Option.bind_some] at found
  obtain ⟨base, selectedBase, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  apply (canonicalRegionalStateAtoms_mem _ _).mpr
  unfold regionalBaseFootprint? at selectedBase
  repeat' first | (solve | simp at selectedBase) | split at selectedBase
  all_goals cases selectedBase <;> simp

theorem regional_pair_read_owner_outside (state : RuntimeState)
    (left : InternalRegionalSelection) (leftRegion : InternalOccurrenceRegion)
    (leftFootprint rightFootprint : InternalRegionalStateFootprint)
    (leftFound : regionalStateFootprint? state left leftRegion = some leftFootprint)
    (independent : regionalStateFootprintsIndependent leftFootprint rightFootprint = true)
    (owner : ScopeOccurrenceId)
    (read : .ordinary (.scopeOccurrence owner) ∈ rightFootprint.reads) :
    leftRegion.contains owner = false := by
  have separated := regional_independent_read_write _ _ independent _ _
    (regionalStateFootprint_region_write state left leftRegion leftFootprint leftFound) read
  simpa [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom] using separated

theorem regional_pair_read_key_not_written (left right : InternalRegionalStateFootprint)
    (independent : regionalStateFootprintsIndependent left right = true)
    (atom : InternalStateAtom) (read : .ordinary atom ∈ right.reads) :
    .ordinary atom ∉ left.writes := by
  intro written
  have separated := regional_independent_read_write _ _ independent _ _ written read
  simp [regionalStateAtomsConflict] at separated

theorem regionalStateFootprint_root_read (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint)
    (found : regionalStateFootprint? state selected region = some footprint) :
    .ordinary (.scopeOccurrence selected.root.id) ∈ footprint.reads ∧
      .ordinary (.scopeParent selected.root.id selected.root.parent) ∈ footprint.reads := by
  unfold regionalStateFootprint? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨base, selectedBase, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  unfold regionalBaseFootprint? at selectedBase
  repeat' first | (solve | simp at selectedBase) | split at selectedBase
  all_goals cases selectedBase <;> simp [canonicalRegionalStateAtoms_mem]

theorem regionalStateFootprint_bounded_activity_read (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (record : ActivityOccurrence) (deadline : TimerWait)
    (kind : selected.kind = .completing (.bounded record deadline))
    (found : regionalStateFootprint? state selected region = some footprint) :
    .activityAssociation record ∈ footprint.reads := by
  unfold regionalStateFootprint? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨base, selectedBase, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  apply (canonicalRegionalStateAtoms_mem _ _).mpr
  unfold regionalBaseFootprint? at selectedBase
  rw [kind] at selectedBase
  repeat' first | (solve | simp at selectedBase) | split at selectedBase
  all_goals cases selectedBase <;> simp_all
  all_goals subst_vars; exact List.mem_cons_self

theorem regionalStateFootprint_return_caller_read (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (record : CalledProcessOccurrence)
    (kind : selected.kind = .returning record)
    (found : regionalStateFootprint? state selected region = some footprint) :
    .ordinary (.scopeOccurrence record.caller) ∈ footprint.reads := by
  unfold regionalStateFootprint? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨base, selectedBase, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  apply (canonicalRegionalStateAtoms_mem _ _).mpr
  unfold regionalBaseFootprint? at selectedBase
  rw [kind] at selectedBase
  repeat' first | (solve | simp at selectedBase) | split at selectedBase
  all_goals cases selectedBase <;> simp_all

end BpmnSemantics.SemanticProcess.InternalCommutation
