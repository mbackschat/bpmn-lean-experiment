import BpmnSemantics.SemanticProcess.InternalRegionalCallFrames

/-! # Called-tree position preservation

Call cleanup removes a forward-closed set of Process instances. Retained endpoints, their exact
Call censuses, and reachability in the smaller graph must be derived from predecessor validity;
keeping the old traversal fuel or assuming successor association validity would miss that boundary.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem retained_singleton_census {α : Type} (values : List α) (keep names : α → Bool)
    (value : α) (member : value ∈ values) (named : names value = true)
    (count : (values.filter names).length = 1) (retained : keep value = true) :
    (values.filter keep).filter names = values.filter names := by
  obtain ⟨single, singleton⟩ := List.length_eq_one_iff.mp count
  have selected := List.mem_filter.mpr ⟨member, named⟩
  rw [singleton] at selected
  have same := List.mem_singleton.mp selected
  calc
    (values.filter keep).filter names = (values.filter names).filter keep := by
      simp only [List.filter_filter, Bool.and_comm]
    _ = values.filter names := by rw [singleton, ← same]; simp [retained]

/-- Every retained target retains its incoming edge: removed instances are forward-closed,
and an equal selected Call identity cannot name a different target. -/
theorem removeCalledProcessTree_keeps_outside_target (state : RuntimeState)
    (selected record : CalledProcessOccurrence)
    (valid : calledProcessAssociationsValid state = true)
    (selectedMember : selected ∈ state.calledProcessOccurrences)
    (member : record ∈ state.calledProcessOccurrences)
    (outside : record.calledRoot.processInstanceId ∉ processInstanceClosureWithin
      state.calledProcessOccurrences [selected.calledRoot.processInstanceId]
      (state.calledProcessOccurrences.length + 1)) :
    record.id ≠ selected.id ∧
      record.caller.processInstanceId ∉ processInstanceClosureWithin state.calledProcessOccurrences
        [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1) := by
  constructor
  · intro same
    apply outside
    rw [calledProcessAssociationsValid_same_id_same_target state valid record selected member selectedMember same]
    exact processInstanceClosureWithin_seed_subset _ _ _ (by simp)
  · intro caller
    exact outside (processInstanceClosureWithin_closed _ _ (by simp) record member caller)

/-- The actual smaller Call graph preserves reachability of each target outside the removed tree. -/
theorem removeCalledProcessTree_preserves_outside_reachability (state : RuntimeState)
    (selected : CalledProcessOccurrence) (seed : List SemanticId) (unique : seed.Nodup)
    (valid : calledProcessAssociationsValid state = true)
    (selectedMember : selected ∈ state.calledProcessOccurrences)
    (target : SemanticId)
    (outside : target ∉ processInstanceClosureWithin state.calledProcessOccurrences
      [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)) :
    target ∈ processInstanceClosureWithin (removeCalledProcessTree state selected).calledProcessOccurrences seed
      ((removeCalledProcessTree state selected).calledProcessOccurrences.length + 1) ↔
    target ∈ processInstanceClosureWithin state.calledProcessOccurrences seed
      (state.calledProcessOccurrences.length + 1) := by
  apply processInstanceClosureWithin_filter_complement _ _ unique _
    (fun process => process ∈ processInstanceClosureWithin state.calledProcessOccurrences
      [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1))
    (fun record member caller => processInstanceClosureWithin_closed _ _ (by simp) record member caller) _ target outside
  intro record member targetOutside
  obtain ⟨different, callerOutside⟩ := removeCalledProcessTree_keeps_outside_target state selected record
    valid selectedMember member targetOutside
  simp [different, callerOutside, targetOutside]

/-- All matching live scopes of an outside owner survive, including parentless endpoint censuses. -/
theorem removeCalledProcessTree_preserves_scope_census (state : RuntimeState)
    (selected : CalledProcessOccurrence) (owner : ScopeOccurrenceId)
    (predicate : RuntimeScopeOccurrence → Bool)
    (outside : owner.processInstanceId ∉ processInstanceClosureWithin state.calledProcessOccurrences
      [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)) :
    ((removeCalledProcessTree state selected).scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id = owner) && predicate occurrence) =
    (state.scopeOccurrences.filter fun occurrence => decide (occurrence.id = owner) && predicate occurrence) := by
  change (state.scopeOccurrences.filter _).filter _ = _
  rw [List.filter_filter]
  apply List.filter_congr
  intro occurrence _
  by_cases same : occurrence.id = owner <;> simp [same, outside]

/-- An outside root keeps every matching incoming Call record, not just a chosen witness. -/
theorem removeCalledProcessTree_preserves_call_census (state : RuntimeState)
    (selected : CalledProcessOccurrence)
    (valid : calledProcessAssociationsValid state = true)
    (selectedMember : selected ∈ state.calledProcessOccurrences)
    (owner : ScopeOccurrenceId)
    (outside : owner.processInstanceId ∉ processInstanceClosureWithin state.calledProcessOccurrences
      [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)) :
    ((removeCalledProcessTree state selected).calledProcessOccurrences.filter fun record =>
      decide (record.calledRoot = owner)) =
    (state.calledProcessOccurrences.filter fun record => decide (record.calledRoot = owner)) := by
  let removed := processInstanceClosureWithin state.calledProcessOccurrences
    [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)
  let keep := fun record : CalledProcessOccurrence =>
    decide (record.id ≠ selected.id) && !removed.contains record.caller.processInstanceId &&
      !removed.contains record.calledRoot.processInstanceId
  change owner.processInstanceId ∉ removed at outside
  change (state.calledProcessOccurrences.filter keep).filter _ = _
  rw [List.filter_filter]
  apply List.filter_congr
  intro record member
  by_cases same : record.calledRoot = owner
  · have targetOutside : record.calledRoot.processInstanceId ∉ removed := by simpa only [same] using outside
    obtain ⟨different, callerOutside⟩ := removeCalledProcessTree_keeps_outside_target state selected record
      valid selectedMember member targetOutside
    change record.caller.processInstanceId ∉ removed at callerOutside
    simp [keep, same, different, callerOutside, outside]
  · simp [same]

/-- A valid selected called instance and every forward successor differ from the hosting instance. -/
theorem removeCalledProcessTree_keeps_hosting_instance (state : RuntimeState)
    (instanceId : SemanticId) (selected : CalledProcessOccurrence)
    (running : state.control = .running instanceId)
    (valid : calledProcessAssociationsValid state = true)
    (selectedMember : selected ∈ state.calledProcessOccurrences) :
    instanceId ∉ processInstanceClosureWithin state.calledProcessOccurrences
      [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1) := by
  unfold calledProcessAssociationsValid at valid
  simp only [rootInstanceId?, running] at valid
  split at valid
  · simp only [Bool.and_eq_true, List.all_eq_true] at valid
    intro inside
    have excludes := processInstanceClosureWithin_least state.calledProcessOccurrences
      [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)
      (fun candidate => candidate ≠ instanceId)
      (by intro candidate member
          have fields := valid.1.1 selected selectedMember
          simpa only [List.mem_singleton.mp member] using of_decide_eq_true fields.1.1.1.1.2)
      (by intro record member _
          exact of_decide_eq_true (valid.1.1 record member).1.1.1.1.2)
      instanceId inside
    exact excludes rfl
  · contradiction

/-- Removing a present Call's complete forward tree preserves the full Call association validator,
including the hosting singleton and reachability computed with the successor graph's own fuel. -/
theorem removeCalledProcessTree_preserves_call_associations (state : RuntimeState)
    (instanceId : SemanticId) (selected : CalledProcessOccurrence)
    (running : state.control = .running instanceId)
    (valid : calledProcessAssociationsValid state = true)
    (selectedMember : selected ∈ state.calledProcessOccurrences) :
    calledProcessAssociationsValid (removeCalledProcessTree state selected) = true := by
  let removed := processInstanceClosureWithin state.calledProcessOccurrences
    [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)
  let keep := fun record : CalledProcessOccurrence =>
    decide (record.id ≠ selected.id) && !removed.contains record.caller.processInstanceId &&
      !removed.contains record.calledRoot.processInstanceId
  have scopeCensus := removeCalledProcessTree_preserves_scope_census state selected
  have callCensus := removeCalledProcessTree_preserves_call_census state selected valid selectedMember
  have prior := valid
  unfold calledProcessAssociationsValid at prior
  simp only [rootInstanceId?, running] at prior
  generalize rootsEq : (state.scopeOccurrences.filter fun occurrence =>
    decide (occurrence.parent.isNone && occurrence.id.processInstanceId = instanceId)) = roots at prior
  cases roots with
  | nil => simp at prior
  | cons hostingRoot rest => cases rest with
    | cons other tail => simp at prior
    | nil =>
        simp only [Bool.and_eq_true, List.all_eq_true] at prior
        have hostingOutside := removeCalledProcessTree_keeps_hosting_instance state instanceId selected
          running valid selectedMember
        have hostingCensus : ((removeCalledProcessTree state selected).scopeOccurrences.filter fun occurrence =>
            decide (occurrence.parent.isNone && occurrence.id.processInstanceId = instanceId)) =
            state.scopeOccurrences.filter (fun occurrence =>
              decide (occurrence.parent.isNone && occurrence.id.processInstanceId = instanceId)) := by
          change (state.scopeOccurrences.filter _).filter _ = _
          rw [List.filter_filter]
          apply List.filter_congr
          intro occurrence _
          by_cases same : occurrence.id.processInstanceId = instanceId <;>
            simp [same, hostingOutside]
        unfold calledProcessAssociationsValid
        simp only [rootInstanceId?, removeCalledProcessTree, running]
        simp only [removeCalledProcessTree] at hostingCensus scopeCensus callCensus
        rw [hostingCensus, rootsEq]
        simp only [Bool.and_eq_true, List.all_eq_true]
        refine ⟨⟨?_, ?_⟩, ?_⟩
        · intro record member
          obtain ⟨oldMember, kept⟩ := List.mem_filter.mp member
          have fields := prior.1.1 record oldMember
          change keep record = true at kept
          have keptFields := kept
          simp only [keep, Bool.and_eq_true, Bool.not_eq_true', Bool.eq_false_iff, ne_eq, List.contains_iff_mem] at keptFields
          have callerCensus := scopeCensus record.caller (·.parent.isNone) keptFields.1.2
          have targetCensus := scopeCensus record.calledRoot (·.parent.isNone) keptFields.2
          have anchorCensus := retained_singleton_census state.calledProcessOccurrences keep
            (fun candidate => decide (candidate.caller = record.caller) &&
              decide (candidate.id.elementId.value = record.id.elementId.value))
            record oldMember (by simp) (of_decide_eq_true fields.1.2) kept
          simp only [Bool.decide_and, Bool.decide_eq_true] at fields ⊢
          rw [callerCensus, targetCensus]
          refine ⟨⟨fields.1.1, ?_⟩, fields.2⟩
          change decide (((state.calledProcessOccurrences.filter keep).filter
            (fun candidate => decide (candidate.caller = record.caller) &&
              decide (candidate.id.elementId.value = record.id.elementId.value))).length = 1) = true
          rw [anchorCensus]
          exact fields.1.2
        · intro occurrence member
          obtain ⟨oldMember, kept⟩ := List.mem_filter.mp member
          have outside : occurrence.id.processInstanceId ∉ removed := by
            simpa only [Bool.not_eq_true', Bool.eq_false_iff, ne_eq, List.contains_iff_mem] using kept
          have fields := prior.1.2 occurrence oldMember
          rw [callCensus occurrence.id outside]
          exact fields
        · intro record member
          obtain ⟨oldMember, kept⟩ := List.mem_filter.mp member
          have outside : record.calledRoot.processInstanceId ∉ removed := by
            change keep record = true at kept
            simp only [keep, Bool.and_eq_true, Bool.not_eq_true', Bool.eq_false_iff, ne_eq, List.contains_iff_mem] at kept
            exact kept.2
          apply List.contains_iff_mem.mpr
          exact (removeCalledProcessTree_preserves_outside_reachability state selected
            [hostingRoot.id.processInstanceId] (by simp) valid selectedMember _ outside).mpr
            (List.contains_iff_mem.mp (prior.2 record oldMember))

/-- Complete scope-identity censuses preserve liveness for every owner outside the called tree. -/
theorem removeCalledProcessTree_preserves_live_owner (state : RuntimeState)
    (selected : CalledProcessOccurrence) (owner : ScopeOccurrenceId)
    (live : exactLiveOccurrence state owner = true)
    (outside : owner.processInstanceId ∉ processInstanceClosureWithin state.calledProcessOccurrences
      [selected.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)) :
    exactLiveOccurrence (removeCalledProcessTree state selected) owner = true := by
  have census := removeCalledProcessTree_preserves_scope_census state selected owner (fun _ => true) outside
  simp only [Bool.and_true] at census
  simpa only [exactLiveOccurrence, census] using live

/-- Actual Call-tree removal preserves complete running position. Parent-instance binding keeps
retained parents live, while the separately proved Call theorem supplies the smaller graph. -/
theorem removeCalledProcessTree_preserves_position (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (selected : CalledProcessOccurrence)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (selectedMember : selected ∈ state.calledProcessOccurrences) :
    runtimePositionValid program expectedInstanceId (removeCalledProcessTree state selected) = true := by
  have calls := runtimePositionValid_called_associations program expectedInstanceId instanceId state valid running
  have hostingOutside := removeCalledProcessTree_keeps_hosting_instance state instanceId selected
    running calls selectedMember
  apply runtimePositionValid_forest_removal_frame program expectedInstanceId instanceId state
    (removeCalledProcessTree state selected) valid running rfl List.filter_sublist
  · change (state.scopeOccurrences.filter _).filter _ = _
    rw [List.filter_filter]
    apply List.filter_congr
    intro occurrence _
    by_cases same : occurrence.id.processInstanceId = instanceId <;> simp [same, hostingOutside]
  · intro occurrence member
    obtain ⟨_, kept⟩ := List.mem_filter.mp member
    apply removeCalledProcessTree_preserves_call_census state selected calls selectedMember occurrence.id
    simpa only [Bool.not_eq_true', Bool.eq_false_iff, ne_eq, List.contains_iff_mem] using kept
  · exact removeCalledProcessTree_preserves_call_associations state instanceId selected running calls selectedMember
  · intro occurrence member parent parentEq
    obtain ⟨prior, kept⟩ := List.mem_filter.mp member
    obtain ⟨_, definition, _, _, binding⟩ := runtimePositionValid_scope_parent_binding
      program expectedInstanceId instanceId state valid running occurrence prior
    rcases binding with ⟨_, parentless⟩ | ⟨owner, ownerEq, _, sameInstance, live⟩
    · simp [parentless] at parentEq
    · have equal := Option.some.inj (ownerEq.symm.trans parentEq)
      apply removeCalledProcessTree_preserves_live_owner state selected parent (equal ▸ live)
      rw [← equal, sameInstance]
      simpa only [Bool.not_eq_true', Bool.eq_false_iff, ne_eq, List.contains_iff_mem] using kept
  · exact List.filter_sublist
  · intro token member
    obtain ⟨prior, kept⟩ := List.mem_filter.mp member
    apply removeCalledProcessTree_preserves_live_owner state selected token.owner
      (runtimePositionValid_token_owner_live program expectedInstanceId instanceId state token valid running prior)
    simpa only [Bool.not_eq_true', Bool.eq_false_iff, ne_eq, List.contains_iff_mem] using kept

end BpmnSemantics.SemanticProcess
