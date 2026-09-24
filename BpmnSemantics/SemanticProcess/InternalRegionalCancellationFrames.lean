import BpmnSemantics.SemanticProcess.InternalRegionalCancellationCallFrames

/-! REG-OWN-FRAME-01 preserves cancellation ownership through exact owner reachability and
monotone handler retention. Removing an Activity can erase its handler claim, so equality of
every re-derived target mask would demand a false invariant. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open InternalCommutation

/-- Re-derivation may remove an Activity's handler claim even when the owner classifier is
unchanged. REG-OWN-FRAME-01 therefore transports closure through target-retention growth. -/
theorem cancellationOwnershipClosed_of_owner_frame (before after : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (other : RegionalReferenceRetention)
    (fields : regionalReferenceFieldsMatch before after other)
    (owners : ∀ owner, (occurrenceInSubtree after.scopeOccurrences root owner ||
      (calledInstanceClosure after root).contains owner.processInstanceId) =
      (occurrenceInSubtree before.scopeOccurrences root owner ||
        (calledInstanceClosure before root).contains owner.processInstanceId))
    (closed : regionalOwnershipClosed before
      (cancellationReferenceRetention before root disposition) = true) :
    regionalOwnershipClosed after (cancellationReferenceRetention after root disposition) = true := by
  let cancelled := fun owner => occurrenceInSubtree before.scopeOccurrences root owner ||
    (calledInstanceClosure before root).contains owner.processInstanceId
  have classifier : (fun owner => occurrenceInSubtree after.scopeOccurrences root owner ||
      (calledInstanceClosure after root).contains owner.processInstanceId) = cancelled := funext owners
  have withdrawn : withdrawnByRegion cancelled after.activityOccurrences (retainedCancellationRoot root disposition) ⊆
      withdrawnByRegion cancelled before.activityOccurrences (retainedCancellationRoot root disposition) := by
    intro record member
    obtain ⟨member, selected⟩ := List.mem_filter.mp member
    rw [fields.2.1] at member
    exact List.mem_filter.mpr ⟨(List.mem_filter.mp member).1, selected⟩
  have messageBack (wait : MessageWait) :
      activityRecordsAttachMessageWait (withdrawnByRegion cancelled after.activityOccurrences (retainedCancellationRoot root disposition)) wait = true →
      activityRecordsAttachMessageWait (withdrawnByRegion cancelled before.activityOccurrences (retainedCancellationRoot root disposition)) wait = true := by
    intro attached
    obtain ⟨record, member, names⟩ := List.any_eq_true.mp attached
    exact List.any_eq_true.mpr ⟨record, withdrawn member, names⟩
  have timerBack (wait : TimerWait) :
      anyTimerIdNamesWait (attachedTimersOf (withdrawnByRegion cancelled after.activityOccurrences (retainedCancellationRoot root disposition))) wait = true →
      anyTimerIdNamesWait (attachedTimersOf (withdrawnByRegion cancelled before.activityOccurrences (retainedCancellationRoot root disposition))) wait = true := by
    intro attached
    obtain ⟨timer, member, names⟩ := List.any_eq_true.mp attached
    obtain ⟨record, recordMember, timerMember⟩ := List.mem_flatMap.mp member
    exact List.any_eq_true.mpr ⟨timer,
      List.mem_flatMap.mpr ⟨record, withdrawn recordMember, timerMember⟩, names⟩
  apply regionalOwnershipClosed_mono after
    (cancellationReferenceRetention before root disposition)
    (cancellationReferenceRetention after root disposition)
  · intro value _ kept
    simpa only [cancellationReferenceRetention, classifier, owners] using kept
  · intro value _ kept
    simpa only [cancellationReferenceRetention, classifier, owners] using kept
  · intro value _ kept
    simpa only [cancellationReferenceRetention, classifier, owners] using kept
  · intro value _ kept
    simpa only [cancellationReferenceRetention, classifier, owners] using kept
  · intro value _ kept
    simp only [cancellationReferenceRetention, owners, Bool.and_eq_true, Bool.not_eq_true'] at kept ⊢
    refine ⟨kept.1, ?_⟩
    cases next : activityRecordsAttachMessageWait (withdrawnByRegion cancelled after.activityOccurrences (retainedCancellationRoot root disposition)) value
    · rfl
    · have old := messageBack value next
      exact Bool.noConfusion (old.symm.trans kept.2)
  · intro value _ kept
    simp only [cancellationReferenceRetention, owners, Bool.and_eq_true, Bool.not_eq_true'] at kept ⊢
    refine ⟨kept.1, ?_⟩
    cases next : anyTimerIdNamesWait (attachedTimersOf
        (withdrawnByRegion cancelled after.activityOccurrences (retainedCancellationRoot root disposition))) value
    · rfl
    · have old := timerBack value next
      exact Bool.noConfusion (old.symm.trans kept.2)
  · exact regionalOwnershipClosed_after_filter before after _ other fields closed

theorem calledInstanceClosure_of_graph_frame (before after : RuntimeState)
    (root : ScopeOccurrenceId) (keep : CalledProcessOccurrence → Bool)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences.filter keep)
    (unique : (before.calledProcessOccurrences.map (fun record => record.calledRoot.processInstanceId)).Nodup)
    (subtree : ∀ owner, occurrenceInSubtree after.scopeOccurrences root owner =
      occurrenceInSubtree before.scopeOccurrences root owner)
    (directSurvives : ∀ record ∈ before.calledProcessOccurrences,
      occurrenceInSubtree before.scopeOccurrences root record.caller = true → keep record = true)
    (reachableSurvives : ∀ record ∈ before.calledProcessOccurrences,
      record.caller.processInstanceId ∈ calledInstanceClosure before root → keep record = true)
    (instanceId : SemanticId) :
    instanceId ∈ calledInstanceClosure after root ↔ instanceId ∈ calledInstanceClosure before root := by
  have direct : (after.calledProcessOccurrences.filterMap fun record =>
      if occurrenceInSubtree after.scopeOccurrences root record.caller then
        some record.calledRoot.processInstanceId else none) =
      (before.calledProcessOccurrences.filterMap fun record =>
        if occurrenceInSubtree before.scopeOccurrences root record.caller then
          some record.calledRoot.processInstanceId else none) := by
    simp only [calls, subtree, List.filterMap_filter]
    have restrict (records : List CalledProcessOccurrence)
        (included : records ⊆ before.calledProcessOccurrences) :
        (records.filterMap fun record => if keep record then
          if occurrenceInSubtree before.scopeOccurrences root record.caller then
            some record.calledRoot.processInstanceId else none else none) =
        (records.filterMap fun record => if occurrenceInSubtree before.scopeOccurrences root record.caller then
          some record.calledRoot.processInstanceId else none) := by
      induction records with
      | nil => rfl
      | cons record rest ih =>
        have tailIncluded : rest ⊆ before.calledProcessOccurrences :=
          fun _ member => included (List.mem_cons_of_mem record member)
        rw [List.filterMap_cons, List.filterMap_cons]
        by_cases selected : occurrenceInSubtree before.scopeOccurrences root record.caller = true
        · simp only [selected, directSurvives record (included (by simp)) selected, ↓reduceIte]
          exact congrArg (record.calledRoot.processInstanceId :: ·) (ih tailIncluded)
        · by_cases kept : keep record = true <;> simp [kept, selected, ih tailIncluded]
    exact restrict before.calledProcessOccurrences (by intro value member; exact member)
  unfold calledInstanceClosure
  rw [direct, calls]
  exact processInstanceClosureWithin_filter _ _ (called_seed_unique _ unique _) keep reachableSurvives instanceId

/-- Every live endpoint selected by the right cancellation belongs to its prepared region.
The owner classifier itself is still evaluated on arbitrary, including historical, IDs. -/
private theorem cancellation_call_endpoints_in_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (record : CalledProcessOccurrence) (member : record ∈ state.calledProcessOccurrences)
    (selected : occurrenceInSubtree state.scopeOccurrences root record.caller = true ∨
      record.caller.processInstanceId ∈ calledInstanceClosure state root) :
    record.caller ∈ region.members ∧ record.calledRoot ∈ region.members := by
  have endpoints := exact_graph_call_endpoints_live state
    (deriveInternalOccurrenceRegion_success state root region prepared).1 record member
  have caller := (regional_cancellation_membership program state expectedInstanceId instanceId
    valid running root region prepared record.caller endpoints.1).mpr selected
  exact ⟨caller, (deriveInternalOccurrenceRegion_spec state root region prepared).2.2.2.2.1
    record.caller caller record.calledRoot (.inr ⟨record, member, rfl, rfl⟩)⟩

theorem occurrenceInSubtree_after_disjoint_call_removal (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (left : CalledProcessOccurrence) (leftRoot : RuntimeScopeOccurrence)
    (leftBinding : leftRoot.id = left.calledRoot) (leftLive : leftRoot ∈ state.scopeOccurrences)
    (leftParent : leftRoot.parent = none) (leftRegion : InternalOccurrenceRegion)
    (leftPrepared : deriveInternalOccurrenceRegion? state leftRoot.id = some leftRegion)
    (rightRoot : ScopeOccurrenceId) (rightRegion : InternalOccurrenceRegion)
    (rightPrepared : deriveInternalOccurrenceRegion? state rightRoot = some rightRegion)
    (disjoint : ∀ owner, owner ∈ leftRegion.members → owner ∈ rightRegion.members → False)
    (owner : ScopeOccurrenceId) :
    occurrenceInSubtree (removeCalledProcessTree state left).scopeOccurrences rightRoot owner =
      occurrenceInSubtree state.scopeOccurrences rightRoot owner := by
  let removed := processInstanceClosureWithin state.calledProcessOccurrences
    [left.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)
  let keep := fun occurrence : RuntimeScopeOccurrence => !removed.contains occurrence.id.processInstanceId
  have unique := runtimePositionValid_scope_ids_nodup program expectedInstanceId instanceId state valid running
  have parents := runtimePositionValid_scope_parents_live program expectedInstanceId instanceId state valid running
  apply occurrenceInSubtree_filter state.scopeOccurrences unique parents keep
  · intro occurrence member parent edge
    obtain ⟨live, kept⟩ := List.mem_filter.mp member
    obtain ⟨parentOccurrence, parentLive, parentId⟩ := List.mem_map.mp (parents occurrence live parent edge)
    have same := runtimePositionValid_scope_parent_instance program expectedInstanceId instanceId
      state valid running parent occurrence.id ⟨occurrence, live, edge, rfl⟩
    exact List.mem_map.mpr ⟨parentOccurrence, List.mem_filter.mpr ⟨parentLive,
      by simpa only [keep, parentId, same] using kept⟩, parentId⟩
  · intro occurrence live parent edge reached
    have insideRight := (regional_cancellation_membership program state expectedInstanceId instanceId
      valid running rightRoot rightRegion rightPrepared occurrence.id
      (List.mem_map.mpr ⟨occurrence, live, rfl⟩)).mpr (.inl
        ((occurrenceInSubtree_iff_ancestry state.scopeOccurrences unique parents rightRoot occurrence.id).mpr
          (.child reached ⟨occurrence, live, edge, rfl⟩)))
    have outside : occurrence.id.processInstanceId ∉ removed := by
      intro member
      have insideLeft := (regional_called_tree_membership program state expectedInstanceId instanceId
        valid running leftRoot leftRegion leftPrepared leftLive leftParent occurrence.id
        (List.mem_map.mpr ⟨occurrence, live, rfl⟩)).mpr (by simpa [removed, leftBinding] using member)
      exact disjoint _ insideLeft insideRight
    simpa [keep] using outside

theorem cancellation_owner_after_disjoint_call_removal (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (left : CalledProcessOccurrence) (leftMember : left ∈ state.calledProcessOccurrences)
    (leftRoot : RuntimeScopeOccurrence)
    (leftBinding : leftRoot.id = left.calledRoot) (leftLive : leftRoot ∈ state.scopeOccurrences)
    (leftParent : leftRoot.parent = none) (leftRegion : InternalOccurrenceRegion)
    (leftPrepared : deriveInternalOccurrenceRegion? state leftRoot.id = some leftRegion)
    (rightRoot : ScopeOccurrenceId) (rightRegion : InternalOccurrenceRegion)
    (rightPrepared : deriveInternalOccurrenceRegion? state rightRoot = some rightRegion)
    (disjoint : ∀ owner, owner ∈ leftRegion.members → owner ∈ rightRegion.members → False)
    (owner : ScopeOccurrenceId) :
    (occurrenceInSubtree (removeCalledProcessTree state left).scopeOccurrences rightRoot owner ||
      (calledInstanceClosure (removeCalledProcessTree state left) rightRoot).contains owner.processInstanceId) =
    (occurrenceInSubtree state.scopeOccurrences rightRoot owner ||
      (calledInstanceClosure state rightRoot).contains owner.processInstanceId) := by
  have subtree := occurrenceInSubtree_after_disjoint_call_removal program state expectedInstanceId instanceId
    valid running left leftRoot leftBinding leftLive leftParent leftRegion leftPrepared
    rightRoot rightRegion rightPrepared disjoint
  have associations := runtimePositionValid_called_associations program expectedInstanceId instanceId state valid running
  let removed := processInstanceClosureWithin state.calledProcessOccurrences
    [left.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)
  let keep := fun record : CalledProcessOccurrence => decide (record.id ≠ left.id) &&
    !removed.contains record.caller.processInstanceId && !removed.contains record.calledRoot.processInstanceId
  have survives (record : CalledProcessOccurrence) (member : record ∈ state.calledProcessOccurrences)
      (selected : occurrenceInSubtree state.scopeOccurrences rightRoot record.caller = true ∨
        record.caller.processInstanceId ∈ calledInstanceClosure state rightRoot) : keep record = true := by
    have endpoints := exact_graph_call_endpoints_live state
      (deriveInternalOccurrenceRegion_success state rightRoot rightRegion rightPrepared).1 record member
    have inside := cancellation_call_endpoints_in_region program state expectedInstanceId instanceId
      valid running rightRoot rightRegion rightPrepared record member selected
    have outside (candidate : ScopeOccurrenceId) (live : candidate ∈ state.scopeOccurrences.map (·.id))
        (insideRight : candidate ∈ rightRegion.members) : candidate.processInstanceId ∉ removed := by
      intro deleted
      exact disjoint candidate ((regional_called_tree_membership program state expectedInstanceId instanceId
        valid running leftRoot leftRegion leftPrepared leftLive leftParent candidate live).mpr
        (by simpa only [removed, leftBinding] using deleted)) insideRight
    have callerOutside := outside record.caller endpoints.1 inside.1
    have targetOutside := outside record.calledRoot endpoints.2 inside.2
    have distinct : record.id ≠ left.id := by
      intro same
      have targetSame := calledProcessAssociationsValid_same_id_same_target state associations
        record left member leftMember same
      apply targetOutside
      rw [targetSame]
      exact processInstanceClosureWithin_seed_subset _ _ _ (by simp)
    simp [keep, distinct, callerOutside, targetOutside]
  have closure (candidate : SemanticId) := calledInstanceClosure_of_graph_frame state
    (removeCalledProcessTree state left) rightRoot keep rfl
    (calledProcessAssociationsValid_called_instances_nodup state instanceId running associations)
    subtree (fun record member selected => survives record member (.inl selected))
    (fun record member selected => survives record member (.inr selected)) candidate
  have contains : (calledInstanceClosure (removeCalledProcessTree state left) rightRoot).contains
      owner.processInstanceId = (calledInstanceClosure state rightRoot).contains owner.processInstanceId := by
    apply Bool.eq_iff_iff.mpr
    simpa only [List.contains_iff_mem] using closure owner.processInstanceId
  rw [subtree, contains]

/-- Actual Call-tree removal preserves the re-derived cancellation ownership condition.
Only owner classification is equal; detached handler target masks may grow. -/
theorem cancellationOwnershipClosed_after_disjoint_call_removal (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (left : CalledProcessOccurrence) (leftMember : left ∈ state.calledProcessOccurrences)
    (leftRoot : RuntimeScopeOccurrence)
    (leftBinding : leftRoot.id = left.calledRoot) (leftLive : leftRoot ∈ state.scopeOccurrences)
    (leftParent : leftRoot.parent = none) (leftRegion : InternalOccurrenceRegion)
    (leftPrepared : deriveInternalOccurrenceRegion? state leftRoot.id = some leftRegion)
    (rightRoot : ScopeOccurrenceId) (rightRegion : InternalOccurrenceRegion)
    (rightPrepared : deriveInternalOccurrenceRegion? state rightRoot = some rightRegion)
    (disjoint : ∀ owner, owner ∈ leftRegion.members → owner ∈ rightRegion.members → False)
    (disposition : SelectedScopeDisposition)
    (closed : regionalOwnershipClosed state (cancellationReferenceRetention state rightRoot disposition) = true) :
    regionalOwnershipClosed (removeCalledProcessTree state left)
      (cancellationReferenceRetention (removeCalledProcessTree state left) rightRoot disposition) = true :=
  cancellationOwnershipClosed_of_owner_frame state (removeCalledProcessTree state left) rightRoot disposition
    (callReferenceRetention state left) (callReferenceRetention_matches_removal state left)
    (cancellation_owner_after_disjoint_call_removal program state expectedInstanceId instanceId
      valid running left leftMember leftRoot leftBinding leftLive leftParent leftRegion leftPrepared
      rightRoot rightRegion rightPrepared disjoint) closed

private theorem subtree_sublist (small large : List RuntimeScopeOccurrence)
    (included : small.Sublist large) (unique : (large.map (·.id)).Nodup)
    (root owner : ScopeOccurrenceId) :
    occurrenceInSubtree small root owner = true → occurrenceInSubtree large root owner = true := by
  have bounded : ∀ fuel owner, occurrenceInSubtreeWithin small root owner fuel = true →
      occurrenceInSubtreeWithin large root owner fuel = true := by
    intro fuel
    induction fuel with
    | zero => simp [occurrenceInSubtreeWithin]
    | succ fuel ih =>
      intro candidate reached
      by_cases same : candidate = root
      · simp [occurrenceInSubtreeWithin, same]
      · simp only [occurrenceInSubtreeWithin, same, ↓reduceIte] at reached ⊢
        cases found : occurrenceParent? small candidate with
        | none => simp [found] at reached
        | some parent =>
          obtain ⟨occurrence, member, edge, identity⟩ := occurrenceParent_some_edge small candidate parent found
          have next : occurrenceParent? large candidate = some parent := by
            rw [← identity, occurrenceParent_of_mem large unique occurrence (included.subset member), edge]
          simpa only [next] using ih parent (by simpa only [found] using reached)
  intro reached
  exact occurrenceInSubtreeWithin_fuel_mono large root owner _ _
    (Nat.add_le_add_right included.length_le 1) (bounded _ owner reached)

/-- The remove-disposition parent graph sits inside either actual cancellation graph. This
sandwich avoids assuming that every unrelated retained root still has a live parent. -/
theorem occurrenceInSubtree_after_disjoint_cancellation (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (leftRoot : ScopeOccurrenceId) (leftRegion : InternalOccurrenceRegion)
    (leftPrepared : deriveInternalOccurrenceRegion? state leftRoot = some leftRegion)
    (rightRoot : ScopeOccurrenceId) (rightRegion : InternalOccurrenceRegion)
    (rightPrepared : deriveInternalOccurrenceRegion? state rightRoot = some rightRegion)
    (disjoint : ∀ owner, owner ∈ leftRegion.members → owner ∈ rightRegion.members → False)
    (disposition : SelectedScopeDisposition) (owner : ScopeOccurrenceId) :
    occurrenceInSubtree (cancelScopeSubtree state leftRoot disposition).scopeOccurrences rightRoot owner =
      occurrenceInSubtree state.scopeOccurrences rightRoot owner := by
  let keep := fun occurrence : RuntimeScopeOccurrence => !leftRegion.contains occurrence.id
  have unique := runtimePositionValid_scope_ids_nodup program expectedInstanceId instanceId state valid running
  have parents := runtimePositionValid_scope_parents_live program expectedInstanceId instanceId state valid running
  have leftClosed := (deriveInternalOccurrenceRegion_spec state leftRoot leftRegion leftPrepared).2.2.2.2.1
  have innerParents : ScopeParentsLive (state.scopeOccurrences.filter keep) := by
    intro occurrence member parent edge
    obtain ⟨live, kept⟩ := List.mem_filter.mp member
    obtain ⟨parentOccurrence, parentLive, parentId⟩ := List.mem_map.mp (parents occurrence live parent edge)
    have outside : parent ∉ leftRegion.members := by
      intro inside
      have childInside := leftClosed parent inside occurrence.id (.inl ⟨occurrence, live, edge, rfl⟩)
      simp [keep, InternalOccurrenceRegion.contains, childInside] at kept
    exact List.mem_map.mpr ⟨parentOccurrence, List.mem_filter.mpr ⟨parentLive,
      by simpa [keep, parentId, InternalOccurrenceRegion.contains] using outside⟩, parentId⟩
  have inner (candidate : ScopeOccurrenceId) :
      occurrenceInSubtree (state.scopeOccurrences.filter keep) rightRoot candidate =
      occurrenceInSubtree state.scopeOccurrences rightRoot candidate := by
    apply occurrenceInSubtree_filter state.scopeOccurrences unique parents keep innerParents
    intro occurrence live parent edge reached
    have childReached := (occurrenceInSubtree_iff_ancestry state.scopeOccurrences unique parents
      rightRoot occurrence.id).mpr (.child reached ⟨occurrence, live, edge, rfl⟩)
    have childInside := (regional_cancellation_membership program state expectedInstanceId instanceId
      valid running rightRoot rightRegion rightPrepared occurrence.id
      (List.mem_map.mpr ⟨occurrence, live, rfl⟩)).mpr (.inl childReached)
    have outside : occurrence.id ∉ leftRegion.members := fun inside => disjoint _ inside childInside
    simpa [keep, InternalOccurrenceRegion.contains] using outside
  have afterSublist : (cancelScopeSubtree state leftRoot disposition).scopeOccurrences.Sublist state.scopeOccurrences := by
    rw [cancelScopeSubtree_scopes_eq_prepared_region program state expectedInstanceId instanceId
      valid running leftRoot leftRegion leftPrepared disposition]
    cases disposition <;> exact List.filter_sublist
  have innerSublist : (state.scopeOccurrences.filter keep).Sublist
      (cancelScopeSubtree state leftRoot disposition).scopeOccurrences := by
    rw [cancelScopeSubtree_scopes_eq_prepared_region program state expectedInstanceId instanceId
      valid running leftRoot leftRegion leftPrepared disposition]
    cases disposition with
    | remove => exact List.Sublist.refl _
    | retain =>
      have same : (state.scopeOccurrences.filter (fun occurrence =>
          decide (occurrence.id = leftRoot) || !leftRegion.contains occurrence.id)).filter keep =
          state.scopeOccurrences.filter keep := by
        rw [List.filter_filter]
        apply List.filter_congr
        intro value _
        cases deleted : leftRegion.contains value.id <;> simp [keep, deleted]
      rw [← same]
      exact List.filter_sublist
  have afterUnique := (afterSublist.map (·.id)).nodup unique
  apply Bool.eq_iff_iff.mpr
  constructor
  · exact subtree_sublist _ _ afterSublist unique rightRoot owner
  · intro reached
    exact subtree_sublist _ _ innerSublist afterUnique rightRoot owner (by rw [inner]; exact reached)

/-- Exact cancellation preserves the other subtree-plus-transitive-Calls classifier for every
owner identity, including historical IDs absent from the live scope population. -/
theorem cancellation_owner_after_disjoint_cancellation (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (leftRoot : ScopeOccurrenceId) (leftRegion : InternalOccurrenceRegion)
    (leftPrepared : deriveInternalOccurrenceRegion? state leftRoot = some leftRegion)
    (rightRoot : ScopeOccurrenceId) (rightRegion : InternalOccurrenceRegion)
    (rightPrepared : deriveInternalOccurrenceRegion? state rightRoot = some rightRegion)
    (disjoint : ∀ owner, owner ∈ leftRegion.members → owner ∈ rightRegion.members → False)
    (disposition : SelectedScopeDisposition) (owner : ScopeOccurrenceId) :
    (occurrenceInSubtree (cancelScopeSubtree state leftRoot disposition).scopeOccurrences rightRoot owner ||
      (calledInstanceClosure (cancelScopeSubtree state leftRoot disposition) rightRoot).contains owner.processInstanceId) =
    (occurrenceInSubtree state.scopeOccurrences rightRoot owner ||
      (calledInstanceClosure state rightRoot).contains owner.processInstanceId) := by
  have subtree := occurrenceInSubtree_after_disjoint_cancellation program state expectedInstanceId instanceId
    valid running leftRoot leftRegion leftPrepared rightRoot rightRegion rightPrepared disjoint disposition
  let keep := fun record : CalledProcessOccurrence =>
    !leftRegion.contains record.caller && !leftRegion.contains record.calledRoot
  have survives (record : CalledProcessOccurrence) (member : record ∈ state.calledProcessOccurrences)
      (selected : occurrenceInSubtree state.scopeOccurrences rightRoot record.caller = true ∨
        record.caller.processInstanceId ∈ calledInstanceClosure state rightRoot) : keep record = true := by
    have inside := cancellation_call_endpoints_in_region program state expectedInstanceId instanceId
      valid running rightRoot rightRegion rightPrepared record member selected
    have callerOutside : record.caller ∉ leftRegion.members := fun member => disjoint _ member inside.1
    have targetOutside : record.calledRoot ∉ leftRegion.members := fun member => disjoint _ member inside.2
    simp [keep, InternalOccurrenceRegion.contains, callerOutside, targetOutside]
  have closure (candidate : SemanticId) := calledInstanceClosure_of_graph_frame state
    (cancelScopeSubtree state leftRoot disposition) rightRoot keep
    (cancelScopeSubtree_calls_eq_prepared_region program state expectedInstanceId instanceId
      valid running leftRoot leftRegion leftPrepared disposition)
    (calledProcessAssociationsValid_called_instances_nodup state instanceId running
      (runtimePositionValid_called_associations program expectedInstanceId instanceId state valid running))
    subtree (fun record member selected => survives record member (.inl selected))
    (fun record member selected => survives record member (.inr selected)) candidate
  have contains : (calledInstanceClosure (cancelScopeSubtree state leftRoot disposition) rightRoot).contains
      owner.processInstanceId = (calledInstanceClosure state rightRoot).contains owner.processInstanceId := by
    apply Bool.eq_iff_iff.mpr
    simpa only [List.contains_iff_mem] using closure owner.processInstanceId
  rw [subtree, contains]

/-- Both actual cancellation dispositions preserve a disjoint cancellation's re-derived
ownership condition; the left cancellation needs no ownership-closure premise. -/
theorem cancellationOwnershipClosed_after_disjoint_cancellation (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (leftRoot : ScopeOccurrenceId) (leftRegion : InternalOccurrenceRegion)
    (leftPrepared : deriveInternalOccurrenceRegion? state leftRoot = some leftRegion)
    (rightRoot : ScopeOccurrenceId) (rightRegion : InternalOccurrenceRegion)
    (rightPrepared : deriveInternalOccurrenceRegion? state rightRoot = some rightRegion)
    (disjoint : ∀ owner, owner ∈ leftRegion.members → owner ∈ rightRegion.members → False)
    (leftDisposition rightDisposition : SelectedScopeDisposition)
    (closed : regionalOwnershipClosed state
      (cancellationReferenceRetention state rightRoot rightDisposition) = true) :
    regionalOwnershipClosed (cancelScopeSubtree state leftRoot leftDisposition)
      (cancellationReferenceRetention (cancelScopeSubtree state leftRoot leftDisposition)
        rightRoot rightDisposition) = true :=
  cancellationOwnershipClosed_of_owner_frame state (cancelScopeSubtree state leftRoot leftDisposition)
    rightRoot rightDisposition (cancellationReferenceRetention state leftRoot leftDisposition)
    (cancellationReferenceRetention_matches_removal state leftRoot leftDisposition)
    (cancellation_owner_after_disjoint_cancellation program state expectedInstanceId instanceId
      valid running leftRoot leftRegion leftPrepared rightRoot rightRegion rightPrepared disjoint leftDisposition) closed

end BpmnSemantics.SemanticProcess
