import BpmnSemantics.SemanticProcess.InternalRegionalScopeCreationGraph
import BpmnSemantics.SemanticProcess.InternalRegionalPairOwnershipFrame

/-! Regional ownership guards also inspect historical identities. Parent ancestry and Call reachability must therefore retain their answers for arbitrary IDs, beyond the live members of the prepared region. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem scopeCreation_subtree_frame (state : RuntimeState) (creation : InternalScopeCreationSelection)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (derived : deriveInternalOccurrenceRegion? state root = some region)
    (beforeUnique : (state.scopeOccurrences.map (·.id)).Nodup)
    (beforeParents : ScopeParentsLive state.scopeOccurrences)
    (afterUnique : ((creation.apply state).scopeOccurrences.map (·.id)).Nodup)
    (afterParents : ScopeParentsLive (creation.apply state).scopeOccurrences)
    (parentOutside : creation.created.parent.any region.contains = false)
    (owner : ScopeOccurrenceId) :
    occurrenceInSubtree (creation.apply state).scopeOccurrences root owner =
      occurrenceInSubtree state.scopeOccurrences root owner := by
  have scopes : (creation.apply state).scopeOccurrences = insertScopeOccurrence creation.created state.scopeOccurrences := by
    cases kind : creation.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  have spec := deriveInternalOccurrenceRegion_spec state root region derived
  have reached (id : ScopeOccurrenceId) (ancestry : ScopeAncestry state.scopeOccurrences root id) : id ∈ region.members := by
    induction ancestry with
    | seed => exact spec.2.1
    | child _ edge ih => exact spec.2.2.2.2.1 _ ih _ (.inl edge)
  have forward (parent child : ScopeOccurrenceId) (edge : ScopeParentEdge state.scopeOccurrences parent child) :
      ScopeParentEdge (creation.apply state).scopeOccurrences parent child := by
    obtain ⟨scope, present, parentEq, identity⟩ := edge
    refine ⟨scope, ?_, parentEq, identity⟩
    rw [scopes, mem_insertScopeOccurrence]
    exact .inr present
  have back (id : ScopeOccurrenceId) (ancestry : ScopeAncestry (creation.apply state).scopeOccurrences root id) :
      ScopeAncestry state.scopeOccurrences root id := by
    induction ancestry with
    | seed => exact .seed
    | child _ edge ih =>
        obtain ⟨scope, present, parentEq, identity⟩ := edge
        rw [scopes, mem_insertScopeOccurrence] at present
        rcases present with rfl | old
        · have inside : region.contains _ = true := List.contains_iff_mem.mpr (reached _ ih)
          simp [parentEq, inside] at parentOutside
        · exact .child ih ⟨scope, old, parentEq, identity⟩
  apply Bool.eq_iff_iff.mpr
  rw [occurrenceInSubtree_iff_ancestry _ afterUnique afterParents,
    occurrenceInSubtree_iff_ancestry _ beforeUnique beforeParents]
  constructor
  · exact back owner
  · intro ancestry
    induction ancestry with
    | seed => exact .seed
    | child _ edge ih => exact .child ih (forward _ _ edge)

private theorem call_closure_extension_frame (before after : List CalledProcessOccurrence)
    (beforeSeed afterSeed : List SemanticId) (beforeUnique : beforeSeed.Nodup) (afterUnique : afterSeed.Nodup)
    (seeds : ∀ id, id ∈ afterSeed ↔ id ∈ beforeSeed)
    (included : before ⊆ after)
    (oldEdge : ∀ record ∈ after,
      record.caller.processInstanceId ∈ processInstanceClosureWithin before beforeSeed (before.length + 1) →
        record ∈ before) (id : SemanticId) :
    id ∈ processInstanceClosureWithin after afterSeed (after.length + 1) ↔
      id ∈ processInstanceClosureWithin before beforeSeed (before.length + 1) := by
  constructor
  · intro member
    exact processInstanceClosureWithin_least after afterSeed _
      (fun value => value ∈ processInstanceClosureWithin before beforeSeed (before.length + 1))
      (fun value present => processInstanceClosureWithin_seed_subset _ _ _ ((seeds value).mp present))
      (fun record present caller => processInstanceClosureWithin_closed _ _ beforeUnique record
        (oldEdge record present caller) caller) id member
  · intro member
    exact processInstanceClosureWithin_least before beforeSeed _
      (fun value => value ∈ processInstanceClosureWithin after afterSeed (after.length + 1))
      (fun value present => processInstanceClosureWithin_seed_subset _ _ _ ((seeds value).mpr present))
      (fun record present caller => processInstanceClosureWithin_closed _ _ afterUnique record
        (included present) caller) id member

theorem scopeCreation_process_closure_frame (state : RuntimeState) (creation : InternalScopeCreationSelection)
    (seed : List SemanticId) (unique : seed.Nodup)
    (outside : ∀ record, creation.kind = .called record → record.caller.processInstanceId ∉
      processInstanceClosureWithin state.calledProcessOccurrences seed (state.calledProcessOccurrences.length + 1))
    (id : SemanticId) :
    (processInstanceClosureWithin (creation.apply state).calledProcessOccurrences seed
      ((creation.apply state).calledProcessOccurrences.length + 1)).contains id =
      (processInstanceClosureWithin state.calledProcessOccurrences seed (state.calledProcessOccurrences.length + 1)).contains id := by
  apply Bool.eq_iff_iff.mpr
  simp only [List.contains_iff_mem]
  cases kind : creation.kind with
  | child => simp only [InternalScopeCreationSelection.apply, kind]
  | called record =>
      simp only [InternalScopeCreationSelection.apply, kind]
      apply call_closure_extension_frame _ _ seed seed unique unique (by intros; rfl)
      · intro candidate present
        exact (sortCallRecords_perm _).symm.subset (List.mem_cons_of_mem record present)
      · intro candidate present reachable
        have original := (sortCallRecords_perm _).subset present
        rcases List.mem_cons.mp original with same | old
        · subst candidate; exact False.elim (outside record kind reachable)
        · exact old

theorem scopeCreation_called_closure_frame (state : RuntimeState) (creation : InternalScopeCreationSelection)
    (root : ScopeOccurrenceId)
    (beforeUnique : (state.calledProcessOccurrences.map (fun record => record.calledRoot.processInstanceId)).Nodup)
    (afterUnique : ((creation.apply state).calledProcessOccurrences.map (fun record => record.calledRoot.processInstanceId)).Nodup)
    (subtree : ∀ owner, occurrenceInSubtree (creation.apply state).scopeOccurrences root owner =
      occurrenceInSubtree state.scopeOccurrences root owner)
    (outside : ∀ record, creation.kind = .called record →
      occurrenceInSubtree state.scopeOccurrences root record.caller = false ∧
      record.caller.processInstanceId ∉ calledInstanceClosure state root)
    (id : SemanticId) :
    (calledInstanceClosure (creation.apply state) root).contains id = (calledInstanceClosure state root).contains id := by
  let beforeSeed := state.calledProcessOccurrences.filterMap fun record =>
    if occurrenceInSubtree state.scopeOccurrences root record.caller then some record.calledRoot.processInstanceId else none
  let afterSeed := (creation.apply state).calledProcessOccurrences.filterMap fun record =>
    if occurrenceInSubtree (creation.apply state).scopeOccurrences root record.caller then some record.calledRoot.processInstanceId else none
  have seeds : ∀ value, value ∈ afterSeed ↔ value ∈ beforeSeed := by
    intro value
    dsimp only [afterSeed, beforeSeed]
    simp only [subtree]
    cases kind : creation.kind with
    | child => simp only [InternalScopeCreationSelection.apply, kind]
    | called record =>
        have absent := (outside record kind).1
        simp only [InternalScopeCreationSelection.apply, kind,
          List.mem_filterMap, (sortCallRecords_perm _).mem_iff, List.mem_cons]
        constructor
        · rintro ⟨candidate, same | old, selected⟩
          · subst candidate; simp [absent] at selected
          · exact ⟨candidate, old, selected⟩
        · rintro ⟨candidate, present, selected⟩
          exact ⟨candidate, .inr present, selected⟩
  apply Bool.eq_iff_iff.mpr
  simp only [calledInstanceClosure, List.contains_iff_mem]
  apply call_closure_extension_frame _ _ beforeSeed afterSeed
    (called_seed_unique _ beforeUnique _) (called_seed_unique _ afterUnique _) seeds
  · intro candidate member
    cases kind : creation.kind with
    | child => simpa only [InternalScopeCreationSelection.apply, kind] using member
    | called record =>
        simp only [InternalScopeCreationSelection.apply, kind]
        exact (sortCallRecords_perm _).symm.subset (List.mem_cons_of_mem record member)
  · intro candidate member reachable
    cases kind : creation.kind with
    | child => simpa only [InternalScopeCreationSelection.apply, kind] using member
    | called record =>
        simp only [InternalScopeCreationSelection.apply, kind] at member
        have original := (sortCallRecords_perm (record :: state.calledProcessOccurrences)).subset member
        rcases List.mem_cons.mp original with same | old
        · subst candidate; exact False.elim ((outside record kind).2 reachable)
        · exact old

/-- All ownership traversals retain their answers on arbitrary IDs, using each state's actual population bound. -/
theorem preparedScopeCreation_regional_classifiers (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program creation.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true) :
    (∀ owner, occurrenceInSubtree (creation.selection.apply state).scopeOccurrences regional.selection.root.id owner =
      occurrenceInSubtree state.scopeOccurrences regional.selection.root.id owner) ∧
    (∀ id, (calledInstanceClosure (creation.selection.apply state) regional.selection.root.id).contains id =
      (calledInstanceClosure state regional.selection.root.id).contains id) ∧
    (regional.selection.root.parent = none → ∀ id,
      (processInstanceClosureWithin (creation.selection.apply state).calledProcessOccurrences
        [regional.selection.root.id.processInstanceId]
        ((creation.selection.apply state).calledProcessOccurrences.length + 1)).contains id =
      (processInstanceClosureWithin state.calledProcessOccurrences [regional.selection.root.id.processInstanceId]
        (state.calledProcessOccurrences.length + 1)).contains id) := by
  have afterValid := prepareInternalScopeCreation_preserves_runtimeStateWellFormed program creation.runtimeInstanceId
    state creationOperation creation programValid valid creationFound
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
    selection, running, _, _, ownerExact, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state creationOperation creation creationFound
  dsimp only [makeInternalScopeCreationPreparation] at valid afterValid independent ⊢
  have position : runtimePositionValid program hosting state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  have afterPosition : runtimePositionValid program hosting (selected.apply state) = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterValid
    exact afterValid.1
  have afterRunning := (scopeCreation_apply_control state selected).trans running
  have facts := prepareInternalRegional_facts program state operation regional regionalFound
  have derived := facts.2.2.2.2.1
  have selectedRegional := (ownershipClosedSelection_facts program state operation regional.selection facts.2.2.2.1).1
  have rootMember := regionalSelection_root_member program state operation regional.selection selectedRegional
  have outside := scopeCreation_regional_outside state regional.selection regional.region regional.footprint selected
    hosting ownerRecord facts.2.2.2.2.2.1 independent
  have subtree := scopeCreation_subtree_frame state selected regional.selection.root.id regional.region derived
    (runtimePositionValid_scope_ids_nodup program hosting hosting state position running)
    (runtimePositionValid_scope_parents_live program hosting hosting state position running)
    (runtimePositionValid_scope_ids_nodup program hosting hosting (selected.apply state) afterPosition afterRunning)
    (runtimePositionValid_scope_parents_live program hosting hosting (selected.apply state) afterPosition afterRunning)
    outside.2.2.1
  have caller (record : CalledProcessOccurrence) (called : selected.kind = .called record) :
      record.caller ∈ state.scopeOccurrences.map (·.id) ∧ record.caller ∉ regional.region.members := by
    have callerEq := (scopeCreation_selection_call_facts state creationOperation selected record hosting running selection called).2.1
    have ownerId := scope_identity_of_census state selected.owner ownerRecord ownerExact
    have member : ownerRecord ∈ state.scopeOccurrences := by
      have exactOwner : ownerRecord ∈ state.scopeOccurrences.filter (fun scope => decide (scope.id = selected.owner)) := by
        rw [ownerExact]; simp
      exact (List.mem_filter.mp exactOwner).1
    refine ⟨List.mem_map.mpr ⟨ownerRecord, member, ownerId.trans callerEq.symm⟩, ?_⟩
    intro inside
    have positive : regional.region.contains record.caller = true := List.contains_iff_mem.mpr inside
    simp only [callerEq, outside.1] at positive
    contradiction
  refine ⟨subtree, ?_, ?_⟩
  · apply scopeCreation_called_closure_frame state selected regional.selection.root.id
      (calledProcessAssociationsValid_called_instances_nodup state hosting running
        (runtimePositionValid_called_associations program hosting hosting state position running))
      (calledProcessAssociationsValid_called_instances_nodup (selected.apply state) hosting afterRunning
        (runtimePositionValid_called_associations program hosting hosting (selected.apply state) afterPosition afterRunning)) subtree
    intro record called
    have actual := caller record called
    have membership := regional_cancellation_membership program state hosting hosting position running
      regional.selection.root.id regional.region derived record.caller actual.1
    exact ⟨Bool.eq_false_iff.mpr (fun inside => actual.2 (membership.mpr (.inl inside))),
      fun reached => actual.2 (membership.mpr (.inr reached))⟩
  · intro parentless
    apply scopeCreation_process_closure_frame state selected _ (by simp)
    intro record called reached
    have actual := caller record called
    exact actual.2 ((regional_called_tree_membership program state hosting hosting position running
      regional.selection.root regional.region derived rootMember parentless record.caller actual.1).mpr reached)

end BpmnSemantics.SemanticProcess.InternalCommutation
