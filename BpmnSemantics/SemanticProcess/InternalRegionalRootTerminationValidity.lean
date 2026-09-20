import BpmnSemantics.SemanticProcess.InternalRegionalPositionValidity
import BpmnSemantics.SemanticProcess.InternalRegionalCallPositionValidity

/-! # Hosting-root termination position

The admitted Terminate selector binds its owner to the hosting Process. Cancelling that root
reaches every live child and called instance, retains the hosting root, and leaves ordinary
completion responsible for the terminal control change.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Every Call target reachable from the host belongs to the host root's cancellation closure. -/
theorem calledInstanceClosure_hosting_covers_calls (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (rootMember : root ∈ state.scopeOccurrences)
    (parentless : root.parent = none) (hosting : root.id.processInstanceId = instanceId) :
    ∀ record ∈ state.calledProcessOccurrences,
      record.calledRoot.processInstanceId ∈ calledInstanceClosure state root.id := by
  have calls := runtimePositionValid_called_associations program expectedInstanceId instanceId state valid running
  let seeds := state.calledProcessOccurrences.filterMap fun record =>
    if occurrenceInSubtree state.scopeOccurrences root.id record.caller then
      some record.calledRoot.processInstanceId else none
  have unique : seeds.Nodup := called_seed_unique state.calledProcessOccurrences
    (calledProcessAssociationsValid_called_instances_nodup state instanceId running calls) _
  have direct (record : CalledProcessOccurrence) (member : record ∈ state.calledProcessOccurrences)
      (callerHost : record.caller.processInstanceId = instanceId) :
      record.calledRoot.processInstanceId ∈ calledInstanceClosure state root.id := by
    obtain ⟨⟨caller, callerMember, callerId, _⟩, _⟩ :=
      calledProcessAssociationsValid_parentless_endpoints state calls record member
    have inside := runtimePositionValid_same_instance_root_subtree program expectedInstanceId instanceId
      state valid running root caller rootMember callerMember parentless (by rw [callerId, callerHost, hosting])
    have callerInside : occurrenceInSubtree state.scopeOccurrences root.id record.caller = true := by
      simpa only [callerId] using inside
    apply processInstanceClosureWithin_seed_subset
    apply List.mem_filterMap.mpr
    exact ⟨record, member, by simp [callerInside]⟩
  have prior := calls
  unfold calledProcessAssociationsValid at prior
  simp only [rootInstanceId?, running] at prior
  split at prior
  · rename_i actualRoot rootsEq
    have actualHosting : actualRoot.id.processInstanceId = instanceId := by
      have member : actualRoot ∈ state.scopeOccurrences.filter fun occurrence =>
          decide (occurrence.parent.isNone && occurrence.id.processInstanceId = instanceId) := by
        rw [rootsEq]; simp
      have fields := (List.mem_filter.mp member).2
      simp only [decide_eq_true_eq, Bool.and_eq_true] at fields
      exact fields.2
    simp only [Bool.and_eq_true, List.all_eq_true] at prior
    have classified := processInstanceClosureWithin_least state.calledProcessOccurrences
      [actualRoot.id.processInstanceId] (state.calledProcessOccurrences.length + 1)
      (fun candidate => candidate = instanceId ∨ candidate ∈ calledInstanceClosure state root.id)
      (by intro candidate member; exact Or.inl ((List.mem_singleton.mp member).trans actualHosting))
      (by
        intro record member caller
        apply Or.inr
        rcases caller with same | reached
        · exact direct record member same
        · exact processInstanceClosureWithin_closed state.calledProcessOccurrences seeds unique record member reached)
    intro record member
    have covered := classified record.calledRoot.processInstanceId
      (List.contains_iff_mem.mp (prior.2 record member))
    exact covered.resolve_left (of_decide_eq_true (prior.1.1 record member).1.1.1.1.2)
  · contradiction

/-- Every live scope is either in the host's own subtree or in a transitively called instance. -/
theorem hosting_cancellation_covers_live_scope (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (rootMember : root ∈ state.scopeOccurrences)
    (parentless : root.parent = none) (hosting : root.id.processInstanceId = instanceId)
    (occurrence : RuntimeScopeOccurrence) (member : occurrence ∈ state.scopeOccurrences) :
    (occurrenceInSubtree state.scopeOccurrences root.id occurrence.id ||
      (calledInstanceClosure state root.id).contains occurrence.id.processInstanceId) = true := by
  by_cases same : occurrence.id.processInstanceId = instanceId
  · have inside := runtimePositionValid_same_instance_root_subtree program expectedInstanceId instanceId
      state valid running root occurrence rootMember member parentless (hosting.trans same.symm)
    simp [inside]
  · have live := (runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId
      state valid running occurrence member).1
    obtain ⟨instanceRoot, rootLive, rootParent, rootInstance, _⟩ :=
      runtimePositionValid_live_instance_root program expectedInstanceId instanceId state valid running occurrence.id live
    have calls := runtimePositionValid_called_associations program expectedInstanceId instanceId state valid running
    have coverage := calledInstanceClosure_hosting_covers_calls program state expectedInstanceId instanceId
      valid running root rootMember parentless hosting
    unfold calledProcessAssociationsValid at calls
    simp only [rootInstanceId?, running] at calls
    split at calls
    · simp only [Bool.and_eq_true, List.all_eq_true] at calls
      have count := calls.1.2 instanceRoot rootLive
      simp [rootParent, rootInstance, same] at count
      obtain ⟨record, singleton⟩ := List.length_eq_one_iff.mp count
      have selected : record ∈ state.calledProcessOccurrences.filter
          (fun candidate => decide (candidate.calledRoot = instanceRoot.id)) := by rw [singleton]; simp
      obtain ⟨recordMember, identity⟩ := List.mem_filter.mp selected
      have inside := coverage record recordMember
      rw [of_decide_eq_true identity, rootInstance] at inside
      simp only [Bool.or_eq_true]
      exact Or.inr (List.contains_iff_mem.mpr inside)
    · contradiction

/-- Host cancellation retains exactly its root and removes every token and Call association. -/
theorem cancelScopeSubtree_hosting_position_fields (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (rootMember : root ∈ state.scopeOccurrences)
    (parentless : root.parent = none) (hosting : root.id.processInstanceId = instanceId) :
    (cancelScopeSubtree state root.id .retain).scopeOccurrences = [root] ∧
      (cancelScopeSubtree state root.id .retain).tokens = [] ∧
      (cancelScopeSubtree state root.id .retain).calledProcessOccurrences = [] := by
  have coverage := hosting_cancellation_covers_live_scope program state expectedInstanceId instanceId
    valid running root rootMember parentless hosting
  refine ⟨?_, ?_, ?_⟩
  · have selected : (cancelScopeSubtree state root.id .retain).scopeOccurrences =
        state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = root.id)) := by
      apply List.filter_congr
      intro occurrence member
      change (decide (occurrence.id = root.id) || !(_ || _)) = _
      rw [coverage occurrence member]
      simp
    rw [selected]
    have live := (runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId
      state valid running root rootMember).1
    obtain ⟨single, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
    have member : root ∈ state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = root.id)) :=
      List.mem_filter.mpr ⟨rootMember, by simp⟩
    rw [singleton] at member
    simpa only [← List.mem_singleton.mp member] using singleton
  · apply List.filter_eq_nil_iff.mpr
    intro token member
    have live := runtimePositionValid_token_owner_live program expectedInstanceId instanceId state token valid running member
    obtain ⟨owner, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
    have present : owner ∈ state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = token.owner)) := by
      rw [singleton]; simp
    obtain ⟨ownerMember, identity⟩ := List.mem_filter.mp present
    have inside := coverage owner ownerMember
    rw [of_decide_eq_true identity] at inside
    apply Bool.eq_false_iff.mp
    change (!(_ || _)) = false
    rw [inside]
    rfl
  · apply List.filter_eq_nil_iff.mpr
    intro record member
    have inside := List.contains_iff_mem.mpr
      (calledInstanceClosure_hosting_covers_calls program state expectedInstanceId instanceId
        valid running root rootMember parentless hosting record member)
    apply Bool.eq_false_iff.mp
    change (!(_ || _) && !(_ || _)) = false
    simp only [inside, Bool.or_true, Bool.not_true, Bool.and_false]

/-- Keeping the hosting root after complete content cancellation preserves running position. -/
theorem cancelScopeSubtree_hosting_preserves_position (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (rootMember : root ∈ state.scopeOccurrences)
    (parentless : root.parent = none) (hosting : root.id.processInstanceId = instanceId) :
    runtimePositionValid program expectedInstanceId (cancelScopeSubtree state root.id .retain) = true := by
  have calls := runtimePositionValid_called_associations program expectedInstanceId instanceId state valid running
  have fields := cancelScopeSubtree_hosting_position_fields program state expectedInstanceId instanceId
    valid running root rootMember parentless hosting
  have hostingCensus : (state.scopeOccurrences.filter fun occurrence =>
      occurrence.parent.isNone && decide (occurrence.id.processInstanceId = instanceId)) = [root] := by
    have prior := calls
    unfold calledProcessAssociationsValid at prior
    simp only [rootInstanceId?, running, Bool.decide_eq_true] at prior
    split at prior
    · rename_i single singleton
      have member : root ∈ state.scopeOccurrences.filter (fun occurrence =>
          occurrence.parent.isNone && decide (occurrence.id.processInstanceId = instanceId)) :=
        List.mem_filter.mpr ⟨rootMember, by simp [parentless, hosting]⟩
      rw [singleton] at member
      simpa only [← List.mem_singleton.mp member] using singleton
    · contradiction
  have incoming : (state.calledProcessOccurrences.filter fun record => decide (record.calledRoot = root.id)) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro record member
    simp only [decide_eq_true_eq]
    intro same
    have outside := removeCalledProcessTree_keeps_hosting_instance state instanceId record running calls member
    apply outside
    have equal : record.calledRoot.processInstanceId = instanceId := by rw [same, hosting]
    rw [← equal]
    exact processInstanceClosureWithin_seed_subset _ _ _ (by simp)
  apply runtimePositionValid_forest_removal_frame program expectedInstanceId instanceId state
    (cancelScopeSubtree state root.id .retain) valid running rfl List.filter_sublist
  · simp only [fields.1, hostingCensus, List.filter_cons, parentless, hosting, Option.isNone_none,
      decide_true, Bool.and_self, ↓reduceIte, List.filter_nil]
  · intro occurrence member
    rw [fields.1] at member
    have same := List.mem_singleton.mp member
    simp only [same, fields.2.2, List.filter_nil, incoming]
  · simp only [calledProcessAssociationsValid, rootInstanceId?, cancelScopeSubtree_preserves_control,
      running, fields.1, fields.2.2]
    simp [parentless, hosting]
  · intro occurrence member parent parentEq
    rw [fields.1] at member
    rw [List.mem_singleton.mp member, parentless] at parentEq
    contradiction
  · exact List.filter_sublist
  · intro token member
    rw [fields.2.1] at member
    simp at member

/-- The actual Terminate evaluator preserves position for every selected child or hosting root;
its End-history increment changes neither control nor ownership. -/
theorem terminateScopeState_preserves_position (program : Program) (before after : RuntimeState)
    (expectedInstanceId : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (scopeId : DefinitionScopeId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (result : terminateScopeState? program before id origin input scopeId = some after) :
    runtimePositionValid program expectedInstanceId after = true := by
  have step := terminateScopeState_sound program before after id origin input scopeId result
  cases step with
  | terminate owner enabled =>
      obtain ⟨root, singleton⟩ := List.length_eq_one_iff.mp enabled.liveOccurrence
      have member : root ∈ before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = owner)) := by
        rw [singleton]; simp
      obtain ⟨rootMember, identity⟩ := List.mem_filter.mp member
      have rootId := of_decide_eq_true identity
      have cancelledValid : runtimePositionValid program expectedInstanceId
          (cancelScopeSubtree before owner .retain) = true := by
        rw [← rootId]
        cases parent : root.parent with
        | none =>
            exact cancelScopeSubtree_hosting_preserves_position program before expectedInstanceId
              owner.processInstanceId valid enabled.running root rootMember parent (by rw [rootId])
        | some value =>
            exact cancelScopeSubtree_child_preserves_position program before expectedInstanceId
              owner.processInstanceId valid enabled.running root rootMember (by simp [parent]) .retain
      exact runtimePositionValid_tokens_sublist_frame program expectedInstanceId
        (cancelScopeSubtree before owner .retain) _ cancelledValid rfl rfl rfl (List.Sublist.refl _)

end BpmnSemantics.SemanticProcess
