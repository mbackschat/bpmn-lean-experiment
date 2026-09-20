import BpmnSemantics.SemanticProcess.InternalOccurrenceRegionLaws
import BpmnSemantics.SemanticProcess.InternalRegionalInstanceAncestry
import BpmnSemantics.SemanticProcess.ScopeAncestryLaws

/-! # Regional removal agreement

Occurrence-region traversal and cancellation use different graphs. These laws connect their
least closures while preserving directed Calls and the existing population-fuel evaluators.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open InternalCommutation

private theorem region_contains_subtree (state : RuntimeState) (region : InternalOccurrenceRegion)
    (closed : ∀ source ∈ region.members, ∀ target,
      OccurrenceRegionEdge state source target → target ∈ region.members)
    (root candidate : ScopeOccurrenceId) (seed : root ∈ region.members)
    (descendant : occurrenceInSubtree state.scopeOccurrences root candidate = true) :
    candidate ∈ region.members :=
  occurrenceInSubtreeWithin_least state.scopeOccurrences root candidate _
    (fun value => value ∈ region.members) seed
    (fun source target member edge => closed source member target (.inl edge)) descendant

private theorem graph_call_root (state : RuntimeState)
    (graph : scopeOwnershipGraphExact state = true)
    (record : CalledProcessOccurrence) (present : record ∈ state.calledProcessOccurrences) :
    ∃ root ∈ state.scopeOccurrences, root.id = record.calledRoot ∧ root.parent = none := by
  simp only [scopeOwnershipGraphExact, Bool.and_eq_true] at graph
  have checked := List.all_eq_true.mp graph.2 record present
  simp only [Bool.and_eq_true, beq_iff_eq] at checked
  obtain ⟨root, singleton⟩ := List.length_eq_one_iff.mp checked.2
  have member : root ∈ state.scopeOccurrences.filter (fun occurrence =>
      decide (occurrence.id = record.calledRoot) && occurrence.parent.isNone) := by
    rw [singleton]
    simp
  obtain ⟨live, matched⟩ := List.mem_filter.mp member
  simp only [Bool.and_eq_true, decide_eq_true_eq, Option.isNone_iff_eq_none] at matched
  exact ⟨root, live, matched⟩

private theorem graph_call_caller_live (state : RuntimeState)
    (graph : scopeOwnershipGraphExact state = true)
    (record : CalledProcessOccurrence) (present : record ∈ state.calledProcessOccurrences) :
    ∃ caller ∈ state.scopeOccurrences, caller.id = record.caller := by
  simp only [scopeOwnershipGraphExact, Bool.and_eq_true] at graph
  have checked := List.all_eq_true.mp graph.2 record present
  simp only [Bool.and_eq_true] at checked
  have count : (state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id = record.caller)).length = 1 := by
    have selected := checked.1
    change ((state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id = record.caller)).length == 1) = true at selected
    exact beq_iff_eq.mp selected
  obtain ⟨caller, singleton⟩ := List.length_eq_one_iff.mp count
  have member : caller ∈ state.scopeOccurrences.filter
      (fun occurrence => decide (occurrence.id = record.caller)) := by
    rw [singleton]
    simp
  obtain ⟨live, matched⟩ := List.mem_filter.mp member
  exact ⟨caller, live, by simpa using matched⟩

theorem called_seed_unique (records : List CalledProcessOccurrence)
    (unique : (records.map (fun record => record.calledRoot.processInstanceId)).Nodup)
    (keep : CalledProcessOccurrence → Bool) :
    (records.filterMap fun record =>
      if keep record then some record.calledRoot.processInstanceId else none).Nodup := by
  induction records with
  | nil => simp
  | cons head tail ih =>
      obtain ⟨fresh, tailUnique⟩ := List.nodup_cons.mp unique
      by_cases retained : keep head = true
      · simp only [List.filterMap_cons, retained, ↓reduceIte, List.nodup_cons]
        refine ⟨?_, ih tailUnique⟩
        intro member
        obtain ⟨record, present, selected⟩ := List.mem_filterMap.mp member
        split at selected
        · exact fresh (List.mem_map.mpr ⟨record, present, Option.some.inj selected⟩)
        · contradiction
      · simpa [retained] using ih tailUnique

/-- Finite closure and predecessor ownership determine removal membership independently of any successor. -/
private theorem regional_cancellation_membership_of_ownership
    (state : RuntimeState) (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (parents : ScopeParentsLive state.scopeOccurrences)
    (parentInstance : ∀ occurrence ∈ state.scopeOccurrences, ∀ parent,
      occurrence.parent = some parent → parent.processInstanceId = occurrence.id.processInstanceId)
    (instanceAncestry : ∀ instanceRoot ∈ state.scopeOccurrences, instanceRoot.parent = none →
      ∀ candidate ∈ state.scopeOccurrences,
        candidate.id.processInstanceId = instanceRoot.id.processInstanceId →
        occurrenceInSubtree state.scopeOccurrences instanceRoot.id candidate.id = true)
    (callsUnique : (state.calledProcessOccurrences.map
      (fun record => record.calledRoot.processInstanceId)).Nodup)
    (candidate : ScopeOccurrenceId) (candidateLive : candidate ∈ state.scopeOccurrences.map (·.id)) :
    candidate ∈ region.members ↔
      occurrenceInSubtree state.scopeOccurrences root candidate = true ∨
        candidate.processInstanceId ∈ calledInstanceClosure state root := by
  obtain ⟨graph, _, _, _⟩ := deriveInternalOccurrenceRegion_success state root region prepared
  obtain ⟨_, seed, _, _, closed, least⟩ := deriveInternalOccurrenceRegion_spec state root region prepared
  have unique := scopeOwnershipGraphExact_unique state graph
  let direct := state.calledProcessOccurrences.filterMap fun record =>
    if occurrenceInSubtree state.scopeOccurrences root record.caller then
      some record.calledRoot.processInstanceId else none
  have directUnique : direct.Nodup := called_seed_unique state.calledProcessOccurrences callsUnique
    (fun record => occurrenceInSubtree state.scopeOccurrences root record.caller)
  have instanceIncluded : ∀ record ∈ state.calledProcessOccurrences,
      record.calledRoot ∈ region.members →
      ∀ occurrence ∈ state.scopeOccurrences,
        occurrence.id.processInstanceId = record.calledRoot.processInstanceId →
        occurrence.id ∈ region.members := by
    intro record present reached occurrence live sameInstance
    obtain ⟨instanceRoot, rootLive, rootId, parentless⟩ := graph_call_root state graph record present
    apply region_contains_subtree state region closed instanceRoot.id occurrence.id
    · simpa [rootId] using reached
    · exact instanceAncestry instanceRoot rootLive parentless occurrence live (by simpa [rootId] using sameInstance)
  constructor
  · intro member
    apply least (fun owner => occurrenceInSubtree state.scopeOccurrences root owner = true ∨
        owner.processInstanceId ∈ calledInstanceClosure state root)
        (.inl (occurrenceInSubtree_reflexive _ _)) ?_ candidate member
    intro source target reached edge
    rcases edge with parentEdge | ⟨record, present, callerEq, calledEq⟩
    · rcases reached with subtree | called
      · exact .inl (occurrenceInSubtree_closed _ unique parents root source target subtree parentEdge)
      · obtain ⟨occurrence, live, parent, id⟩ := parentEdge
        have same := parentInstance occurrence live source parent
        exact .inr (by simpa [id, same] using called)
    · subst source
      subst target
      rcases reached with subtree | called
      · apply Or.inr
        apply processInstanceClosureWithin_seed_subset state.calledProcessOccurrences direct _
        exact List.mem_filterMap.mpr ⟨record, present, by simp [subtree]⟩
      · exact .inr (processInstanceClosureWithin_closed state.calledProcessOccurrences direct directUnique
          record present called)
  · rintro (subtree | called)
    · exact region_contains_subtree state region closed root candidate seed subtree
    · have allIncluded : ∀ instanceId ∈ calledInstanceClosure state root,
          ∀ occurrence ∈ state.scopeOccurrences,
            occurrence.id.processInstanceId = instanceId → occurrence.id ∈ region.members := by
        apply processInstanceClosureWithin_least state.calledProcessOccurrences direct _
          (fun instanceId => ∀ occurrence ∈ state.scopeOccurrences,
            occurrence.id.processInstanceId = instanceId → occurrence.id ∈ region.members)
        · intro instanceId initial occurrence live same
          obtain ⟨record, present, selected⟩ := List.mem_filterMap.mp initial
          split at selected
          · next subtree =>
              have caller := region_contains_subtree state region closed root record.caller seed subtree
              have calledRoot := closed record.caller caller record.calledRoot (.inr ⟨record, present, rfl, rfl⟩)
              apply instanceIncluded record present calledRoot occurrence live
              simpa [Option.some.inj selected] using same
          · contradiction
        · intro record present callers occurrence live same
          obtain ⟨caller, callerLive, callerId⟩ := graph_call_caller_live state graph record present
          have reachedCaller : record.caller ∈ region.members := by
            simpa [callerId] using callers caller callerLive (by simp [callerId])
          have calledRoot := closed record.caller reachedCaller record.calledRoot (.inr ⟨record, present, rfl, rfl⟩)
          exact instanceIncluded record present calledRoot occurrence live same
      obtain ⟨occurrence, live, id⟩ := List.mem_map.mp candidateLive
      simpa [id] using allIncluded candidate.processInstanceId called occurrence live (by simp [id])

/-- A parentless Process root's occurrence region agrees with the forward instance closure
used by Call return; parent edges never change the semantic Process instance. -/
private theorem regional_called_tree_membership_of_ownership
    (state : RuntimeState) (root : RuntimeScopeOccurrence) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root.id = some region)
    (rootLive : root ∈ state.scopeOccurrences) (rootParent : root.parent = none)
    (parentInstance : ∀ occurrence ∈ state.scopeOccurrences, ∀ parent,
      occurrence.parent = some parent → parent.processInstanceId = occurrence.id.processInstanceId)
    (instanceAncestry : ∀ instanceRoot ∈ state.scopeOccurrences, instanceRoot.parent = none →
      ∀ candidate ∈ state.scopeOccurrences,
        candidate.id.processInstanceId = instanceRoot.id.processInstanceId →
        occurrenceInSubtree state.scopeOccurrences instanceRoot.id candidate.id = true)
    (candidate : ScopeOccurrenceId) (candidateLive : candidate ∈ state.scopeOccurrences.map (·.id)) :
    candidate ∈ region.members ↔ candidate.processInstanceId ∈
      processInstanceClosureWithin state.calledProcessOccurrences [root.id.processInstanceId]
        (state.calledProcessOccurrences.length + 1) := by
  obtain ⟨graph, _, _, _⟩ := deriveInternalOccurrenceRegion_success state root.id region prepared
  obtain ⟨_, seed, _, _, closed, least⟩ := deriveInternalOccurrenceRegion_spec state root.id region prepared
  let instances := processInstanceClosureWithin state.calledProcessOccurrences [root.id.processInstanceId]
    (state.calledProcessOccurrences.length + 1)
  constructor
  · intro member
    apply least (fun owner => owner.processInstanceId ∈ instances) ?_ ?_ candidate member
    · exact processInstanceClosureWithin_seed_subset _ _ _ (by simp)
    · intro source target reached edge
      rcases edge with ⟨occurrence, live, parent, id⟩ | ⟨record, present, callerEq, calledEq⟩
      · have same := parentInstance occurrence live source parent
        simpa [id, same] using reached
      · subst source
        subst target
        exact processInstanceClosureWithin_closed _ _ (by simp) record present reached
  · intro member
    have allIncluded : ∀ instanceId ∈ instances, ∀ occurrence ∈ state.scopeOccurrences,
        occurrence.id.processInstanceId = instanceId → occurrence.id ∈ region.members := by
      apply processInstanceClosureWithin_least state.calledProcessOccurrences [root.id.processInstanceId] _
        (fun instanceId => ∀ occurrence ∈ state.scopeOccurrences,
          occurrence.id.processInstanceId = instanceId → occurrence.id ∈ region.members)
      · intro instanceId initial occurrence live same
        have initialEq : instanceId = root.id.processInstanceId := by simpa using initial
        apply region_contains_subtree state region closed root.id occurrence.id seed
        exact instanceAncestry root rootLive rootParent occurrence live (same.trans initialEq)
      · intro record present callers occurrence live same
        obtain ⟨caller, callerLive, callerId⟩ := graph_call_caller_live state graph record present
        have reachedCaller : record.caller ∈ region.members := by
          simpa [callerId] using callers caller callerLive (by simp [callerId])
        have reachedRoot := closed record.caller reachedCaller record.calledRoot
          (.inr ⟨record, present, rfl, rfl⟩)
        obtain ⟨instanceRoot, liveRoot, rootId, parentless⟩ := graph_call_root state graph record present
        apply region_contains_subtree state region closed instanceRoot.id occurrence.id
        · simpa [rootId] using reachedRoot
        · exact instanceAncestry instanceRoot liveRoot parentless occurrence live (by simpa [rootId] using same)
    obtain ⟨occurrence, live, id⟩ := List.mem_map.mp candidateLive
    simpa [id] using allIncluded candidate.processInstanceId member occurrence live (by simp [id])

private theorem valid_parent_instance (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (occurrence : RuntimeScopeOccurrence) (live : occurrence ∈ state.scopeOccurrences)
    (parent : ScopeOccurrenceId) (edge : occurrence.parent = some parent) :
    parent.processInstanceId = occurrence.id.processInstanceId :=
  runtimePositionValid_scope_ancestry_instance program expectedInstanceId instanceId state valid running
    parent occurrence.id (.child .seed ⟨occurrence, live, edge, rfl⟩)

/-- On a valid predecessor, the prepared region is exactly cancellation's subtree-plus-Calls predicate. -/
theorem regional_cancellation_membership (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (candidate : ScopeOccurrenceId) (candidateLive : candidate ∈ state.scopeOccurrences.map (·.id)) :
    candidate ∈ region.members ↔
      occurrenceInSubtree state.scopeOccurrences root candidate = true ∨
        candidate.processInstanceId ∈ calledInstanceClosure state root :=
  regional_cancellation_membership_of_ownership state root region prepared
    (runtimePositionValid_scope_parents_live program expectedInstanceId instanceId state valid running)
    (valid_parent_instance program state expectedInstanceId instanceId valid running)
    (fun instanceRoot live parentless occurrence present same =>
      runtimePositionValid_same_instance_root_subtree program expectedInstanceId instanceId state valid running
        instanceRoot occurrence live present parentless same.symm)
    (calledProcessAssociationsValid_called_instances_nodup state instanceId running
      (runtimePositionValid_called_associations program expectedInstanceId instanceId state valid running))
    candidate candidateLive

/-- Valid parentless scope ownership binds the prepared region to Call return's existing instance traversal. -/
theorem regional_called_tree_membership (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root.id = some region)
    (rootLive : root ∈ state.scopeOccurrences) (rootParent : root.parent = none)
    (candidate : ScopeOccurrenceId) (candidateLive : candidate ∈ state.scopeOccurrences.map (·.id)) :
    candidate ∈ region.members ↔ candidate.processInstanceId ∈
      processInstanceClosureWithin state.calledProcessOccurrences [root.id.processInstanceId]
        (state.calledProcessOccurrences.length + 1) :=
  regional_called_tree_membership_of_ownership state root region prepared rootLive rootParent
    (valid_parent_instance program state expectedInstanceId instanceId valid running)
    (fun instanceRoot live parentless occurrence present same =>
      runtimePositionValid_same_instance_root_subtree program expectedInstanceId instanceId state valid running
        instanceRoot occurrence live present parentless same.symm)
    candidate candidateLive

/-- Every live owner's computed region mask is the exact mask consumed by cancellation. -/
theorem regional_cancellation_mask (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (candidate : ScopeOccurrenceId) (candidateLive : candidate ∈ state.scopeOccurrences.map (·.id)) :
    region.contains candidate = (occurrenceInSubtree state.scopeOccurrences root candidate ||
      (calledInstanceClosure state root).contains candidate.processInstanceId) := by
  apply Bool.eq_iff_iff.mpr
  simpa only [InternalOccurrenceRegion.contains, List.contains_iff_mem, Bool.or_eq_true] using
    regional_cancellation_membership program state expectedInstanceId instanceId valid running
      root region prepared candidate candidateLive

/-- Historical records may name a scope that is no longer live. The prepared live region must
therefore retain cancellation's additional called-instance test for those owners. -/
theorem regional_cancellation_full_owner_mask (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (candidate : ScopeOccurrenceId) :
    (occurrenceInSubtree state.scopeOccurrences root candidate ||
      (calledInstanceClosure state root).contains candidate.processInstanceId) =
      (region.contains candidate ||
        (calledInstanceClosure state root).contains candidate.processInstanceId) := by
  obtain ⟨_, _, rootLive, _⟩ := deriveInternalOccurrenceRegion_success state root region prepared
  have regionLive := (deriveInternalOccurrenceRegion_spec state root region prepared).2.2.2.1
  apply Bool.eq_iff_iff.mpr
  simp only [Bool.or_eq_true, InternalOccurrenceRegion.contains, List.contains_iff_mem]
  constructor
  · rintro (subtree | called)
    · have live := occurrenceInSubtree_live state.scopeOccurrences root candidate rootLive subtree
      exact .inl ((regional_cancellation_membership program state expectedInstanceId instanceId
        valid running root region prepared candidate live).mpr (.inl subtree))
    · exact .inr called
  · rintro (member | called)
    · exact (regional_cancellation_membership program state expectedInstanceId instanceId
        valid running root region prepared candidate (regionLive member)).mp member
    · exact .inr called

/-- Actual scope removal equals filtering the predecessor's prepared region, with the selected
root retained only for the existing retain disposition. -/
theorem cancelScopeSubtree_scopes_eq_prepared_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root disposition).scopeOccurrences =
      match disposition with
      | .retain => state.scopeOccurrences.filter fun occurrence =>
          decide (occurrence.id = root) || !region.contains occurrence.id
      | .remove => state.scopeOccurrences.filter fun occurrence => !region.contains occurrence.id := by
  cases disposition with
  | retain =>
      apply List.filter_congr
      intro occurrence live
      have mask := regional_cancellation_mask program state expectedInstanceId instanceId valid running
        root region prepared occurrence.id (List.mem_map.mpr ⟨occurrence, live, rfl⟩)
      change (decide (occurrence.id = root) ||
        !(occurrenceInSubtree state.scopeOccurrences root occurrence.id ||
          (calledInstanceClosure state root).contains occurrence.id.processInstanceId)) = _
      rw [← mask]
  | remove =>
      apply List.filter_congr
      intro occurrence live
      have mask := regional_cancellation_mask program state expectedInstanceId instanceId valid running
        root region prepared occurrence.id (List.mem_map.mpr ⟨occurrence, live, rfl⟩)
      change (!(occurrenceInSubtree state.scopeOccurrences root occurrence.id ||
        (calledInstanceClosure state root).contains occurrence.id.processInstanceId)) = _
      rw [← mask]

/-- Actual token removal uses the same prepared region and preserves retained token multiplicity. -/
theorem cancelScopeSubtree_tokens_eq_prepared_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root disposition).tokens =
      state.tokens.filter (fun token => !region.contains token.owner) := by
  apply List.filter_congr
  intro token member
  have ownerLive := runtimePositionValid_token_owner_live program expectedInstanceId instanceId
    state token valid running member
  obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true ownerLive)
  have selected : occurrence ∈ state.scopeOccurrences.filter
      (fun candidate => decide (candidate.id = token.owner)) := by
    rw [singleton]
    simp
  obtain ⟨occurrenceLive, identity⟩ := List.mem_filter.mp selected
  have mask := regional_cancellation_mask program state expectedInstanceId instanceId valid running
    root region prepared token.owner
    (List.mem_map.mpr ⟨occurrence, occurrenceLive, of_decide_eq_true identity⟩)
  change (!(occurrenceInSubtree state.scopeOccurrences root token.owner ||
    (calledInstanceClosure state root).contains token.owner.processInstanceId)) = _
  rw [← mask]

/-- A retained Call association keeps both live endpoints outside the cancellation region. -/
theorem cancelScopeSubtree_calls_eq_prepared_region (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (prepared : deriveInternalOccurrenceRegion? state root = some region)
    (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root disposition).calledProcessOccurrences =
      state.calledProcessOccurrences.filter fun record =>
        !region.contains record.caller && !region.contains record.calledRoot := by
  have graph := (deriveInternalOccurrenceRegion_success state root region prepared).1
  apply List.filter_congr
  intro record member
  obtain ⟨caller, callerMember, callerId⟩ := graph_call_caller_live state graph record member
  obtain ⟨called, calledMember, calledId, _⟩ := graph_call_root state graph record member
  have callerMask := regional_cancellation_mask program state expectedInstanceId instanceId
    valid running root region prepared record.caller
    (List.mem_map.mpr ⟨caller, callerMember, callerId⟩)
  have calledMask := regional_cancellation_mask program state expectedInstanceId instanceId
    valid running root region prepared record.calledRoot
    (List.mem_map.mpr ⟨called, calledMember, calledId⟩)
  change (!(occurrenceInSubtree state.scopeOccurrences root record.caller ||
    (calledInstanceClosure state root).contains record.caller.processInstanceId) &&
    !(occurrenceInSubtree state.scopeOccurrences root record.calledRoot ||
      (calledInstanceClosure state root).contains record.calledRoot.processInstanceId)) = _
  rw [← callerMask, ← calledMask]

/-- Cancellation clears work without changing the hosting lifecycle or pending-initiation flag. -/
theorem cancelScopeSubtree_preserves_control (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root disposition).control = state.control ∧
      (cancelScopeSubtree state root disposition).initiationPending = state.initiationPending :=
  ⟨rfl, rfl⟩

/-- Removal preserves issuance records even when the occurrences they issued disappear. -/
theorem cancelScopeSubtree_preserves_issuance (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root disposition).activations = state.activations ∧
      (cancelScopeSubtree state root disposition).messageActivations = state.messageActivations ∧
      (cancelScopeSubtree state root disposition).timerActivations = state.timerActivations ∧
      (cancelScopeSubtree state root disposition).effectActivations = state.effectActivations ∧
      (cancelScopeSubtree state root disposition).scopeActivations = state.scopeActivations ∧
      (cancelScopeSubtree state root disposition).eventRaceActivations = state.eventRaceActivations ∧
      (cancelScopeSubtree state root disposition).callActivations = state.callActivations ∧
      (cancelScopeSubtree state root disposition).activityActivations = state.activityActivations ∧
      (cancelScopeSubtree state root disposition).variables.process = state.variables.process ∧
      (cancelScopeSubtree state root disposition).logicalTimeMs = state.logicalTimeMs ∧
      (cancelScopeSubtree state root disposition).endOccurrences = state.endOccurrences := by
  simp [cancelScopeSubtree]

end BpmnSemantics.SemanticProcess
