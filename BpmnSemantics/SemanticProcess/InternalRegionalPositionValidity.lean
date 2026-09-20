import BpmnSemantics.SemanticProcess.InternalRegionalRemovalValidity

/-! # Regional position preservation

The selected child-scope domain preserves parentless Process roots and their Call graph. The
actual cancellation masks must retain each surviving parent and token owner before the position
frame applies; arbitrary root deletion is not a position-preserving operation.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem calledProcessAssociationsValid_parentless_endpoints (state : RuntimeState)
    (valid : calledProcessAssociationsValid state = true)
    (record : CalledProcessOccurrence) (member : record ∈ state.calledProcessOccurrences) :
    (∃ caller ∈ state.scopeOccurrences, caller.id = record.caller ∧ caller.parent = none) ∧
      (∃ root ∈ state.scopeOccurrences, root.id = record.calledRoot ∧ root.parent = none) := by
  have endpoint (owner : ScopeOccurrenceId)
      (count : (state.scopeOccurrences.filter fun occurrence =>
        decide (occurrence.id = owner) && occurrence.parent.isNone).length = 1) :
      ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = owner ∧ occurrence.parent = none := by
    obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp count
    have present : occurrence ∈ state.scopeOccurrences.filter fun candidate =>
        decide (candidate.id = owner) && candidate.parent.isNone := by rw [singleton]; simp
    obtain ⟨present, fields⟩ := List.mem_filter.mp present
    simp only [Bool.and_eq_true, decide_eq_true_eq, Option.isNone_iff_eq_none] at fields
    exact ⟨occurrence, present, fields⟩
  unfold calledProcessAssociationsValid at valid
  split at valid
  · contradiction
  · split at valid
    · simp only [Bool.and_eq_true, List.all_eq_true] at valid
      have fields := valid.1.1 record member
      constructor
      · apply endpoint record.caller
        simpa only [Bool.decide_and, Bool.decide_eq_true] using (of_decide_eq_true fields.1.1.1.1.1.1.2)
      · apply endpoint record.calledRoot
        simpa only [Bool.decide_and, Bool.decide_eq_true] using (of_decide_eq_true fields.2)
    · contradiction

private theorem child_seed_excludes_parentless (state : RuntimeState)
    (unique : (state.scopeOccurrences.map (·.id)).Nodup)
    (root : RuntimeScopeOccurrence) (rootMember : root ∈ state.scopeOccurrences)
    (child : root.parent ≠ none) (candidate : RuntimeScopeOccurrence)
    (member : candidate ∈ state.scopeOccurrences) (parentless : candidate.parent = none) :
    occurrenceInSubtree state.scopeOccurrences root.id candidate.id = false := by
  have different : candidate.id ≠ root.id := by
    intro same
    have left := occurrence_find_exact state.scopeOccurrences unique candidate member
    have right := occurrence_find_exact state.scopeOccurrences unique root rootMember
    rw [same, right] at left
    have equal := Option.some.inj left
    exact child (by rw [equal]; exact parentless)
  exact occurrenceInSubtreeWithin_parentless state.scopeOccurrences root.id candidate.id different
    (by rw [occurrenceParent_of_mem state.scopeOccurrences unique candidate member, parentless]) _

/-- A valid Call's caller is parentless, so cancelling a child scope seeds no called instance. -/
theorem calledInstanceClosure_child_empty (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (member : root ∈ state.scopeOccurrences)
    (child : root.parent ≠ none) : calledInstanceClosure state root.id = [] := by
  have unique := runtimePositionValid_scope_ids_nodup program expectedInstanceId instanceId state valid running
  have calls := runtimePositionValid_called_associations program expectedInstanceId instanceId state valid running
  have seeds : (state.calledProcessOccurrences.filterMap fun record =>
      if occurrenceInSubtree state.scopeOccurrences root.id record.caller then
        some record.calledRoot.processInstanceId else none) = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro record present
    obtain ⟨⟨caller, callerMember, callerId, parentless⟩, _⟩ :=
      calledProcessAssociationsValid_parentless_endpoints state calls record present
    have outside := child_seed_excludes_parentless state unique root member child caller callerMember parentless
    simp only [callerId] at outside
    simp [outside]
  unfold calledInstanceClosure
  rw [seeds]
  have noEdges : (state.calledProcessOccurrences.filterMap
      (fun _ => (none : Option SemanticId))) = [] :=
    List.filterMap_eq_nil_iff.mpr (by intros; rfl)
  simp [processInstanceClosureWithin, noEdges]

theorem cancellation_child_calls_frame (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (member : root ∈ state.scopeOccurrences)
    (child : root.parent ≠ none) (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root.id disposition).calledProcessOccurrences =
      state.calledProcessOccurrences := by
  have empty := calledInstanceClosure_child_empty program state expectedInstanceId instanceId
    valid running root member child
  have unique := runtimePositionValid_scope_ids_nodup program expectedInstanceId instanceId state valid running
  have calls := runtimePositionValid_called_associations program expectedInstanceId instanceId state valid running
  change state.calledProcessOccurrences.filter _ = _
  apply List.filter_eq_self.mpr
  intro record present
  obtain ⟨⟨caller, callerMember, callerId, callerParent⟩, ⟨called, calledMember, calledId, calledParent⟩⟩ :=
    calledProcessAssociationsValid_parentless_endpoints state calls record present
  have callerOutside := child_seed_excludes_parentless state unique root member child caller callerMember callerParent
  have calledOutside := child_seed_excludes_parentless state unique root member child called calledMember calledParent
  simpa only [callerId, calledId] using show
    (!(occurrenceInSubtree state.scopeOccurrences root.id caller.id ||
      (calledInstanceClosure state root.id).contains caller.id.processInstanceId) &&
      !(occurrenceInSubtree state.scopeOccurrences root.id called.id ||
        (calledInstanceClosure state root.id).contains called.id.processInstanceId)) = true from
      by simp [empty, callerOutside, calledOutside]

private theorem position_parent_rank_lt (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (parent child : ScopeOccurrenceId) (edge : ScopeParentEdge state.scopeOccurrences parent child) :
    definitionScopeAncestorRank program parent.definitionScopeId <
      definitionScopeAncestorRank program child.definitionScopeId := by
  have programValid : programWellFormed program = true := by
    simp only [runtimePositionValid, Bool.and_eq_true] at valid
    exact valid.1.1
  obtain ⟨occurrence, member, parentEq, identity⟩ := edge
  obtain ⟨_, definition, definitionMember, definitionId, binding⟩ :=
    runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId state valid running occurrence member
  rcases binding with ⟨_, parentless⟩ | ⟨owner, ownerEq, staticParent, _, _⟩
  · simp [parentless] at parentEq
  · have same := Option.some.inj (ownerEq.symm.trans parentEq)
    have rank := definitionScopeAncestorRank_parent_lt program
      (programWellFormed_scopeForest program programValid) definition definitionMember staticParent
    simpa only [same, definitionId, identity] using rank

/-- The static forest rank forbids a live child's cancellation region from reaching its parent. -/
theorem runtimePositionValid_parent_outside_child_subtree (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (member : root ∈ state.scopeOccurrences)
    (parent : ScopeOccurrenceId) (parentEq : root.parent = some parent) :
    occurrenceInSubtree state.scopeOccurrences root.id parent = false := by
  have strict := position_parent_rank_lt program state expectedInstanceId instanceId valid running
    parent root.id ⟨root, member, parentEq, rfl⟩
  apply Bool.eq_false_iff.mpr
  intro inside
  have ancestry := occurrenceInSubtreeWithin_ancestry state.scopeOccurrences root.id parent _ inside
  have monotone : ∀ owner, ScopeAncestry state.scopeOccurrences root.id owner →
      definitionScopeAncestorRank program root.id.definitionScopeId ≤
        definitionScopeAncestorRank program owner.definitionScopeId := by
    intro owner path
    induction path with
    | seed => exact Nat.le_refl _
    | child _ edge ih =>
        exact Nat.le_trans ih (Nat.le_of_lt
          (position_parent_rank_lt program state expectedInstanceId instanceId valid running _ _ edge))
  have bound := monotone parent ancestry
  omega

/-- Both actual child-cancellation dispositions preserve complete runtime position, including
unrelated called Processes. No successor validity or precomputed successor mask is assumed. -/
theorem cancelScopeSubtree_child_preserves_position (program : Program) (state : RuntimeState)
    (expectedInstanceId instanceId : SemanticId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (running : state.control = .running instanceId)
    (root : RuntimeScopeOccurrence) (rootMember : root ∈ state.scopeOccurrences)
    (child : root.parent ≠ none) (disposition : SelectedScopeDisposition) :
    runtimePositionValid program expectedInstanceId (cancelScopeSubtree state root.id disposition) = true := by
  have empty := calledInstanceClosure_child_empty program state expectedInstanceId instanceId
    valid running root rootMember child
  have unique := runtimePositionValid_scope_ids_nodup program expectedInstanceId instanceId state valid running
  have parents := runtimePositionValid_scope_parents_live program expectedInstanceId instanceId state valid running
  apply runtimePositionValid_scope_removal_frame program expectedInstanceId instanceId state
    (cancelScopeSubtree state root.id disposition) valid running rfl (List.filter_sublist)
  · cases disposition <;>
      change (state.scopeOccurrences.filter _).filter (·.parent.isNone) = _
    all_goals
      rw [List.filter_filter]
      apply List.filter_congr
      intro occurrence member
      by_cases parentless : occurrence.parent = none
      · have outside := child_seed_excludes_parentless state unique root rootMember child occurrence member parentless
        change (occurrence.parent.isNone && _) = occurrence.parent.isNone
        simp only [parentless, Option.isNone_none, Bool.true_and]
        first
        | change (decide (occurrence.id = root.id) || !(_ || _)) = true
        | change (!(_ || _)) = true
        all_goals simp [empty, outside]
      · simp [parentless]
  · exact cancellation_child_calls_frame program state expectedInstanceId instanceId
      valid running root rootMember child disposition
  · intro occurrence member parent parentEq
    obtain ⟨prior, kept⟩ := List.mem_filter.mp member
    obtain ⟨_, definition, _, _, binding⟩ := runtimePositionValid_scope_parent_binding
      program expectedInstanceId instanceId state valid running occurrence prior
    have parentLive : exactLiveOccurrence state parent = true := by
      rcases binding with ⟨_, parentless⟩ | ⟨owner, ownerEq, _, _, live⟩
      · simp [parentless] at parentEq
      · simpa only [Option.some.inj (ownerEq.symm.trans parentEq)] using live
    apply cancelScopeSubtree_preserves_uncancelled_owner state root.id disposition parent parentLive
    simp only [empty, List.contains_nil, Bool.or_false]
    by_cases same : occurrence.id = root.id
    · simpa only [same] using runtimePositionValid_parent_outside_child_subtree
        program state expectedInstanceId instanceId valid running occurrence prior parent parentEq
    · have outside : occurrenceInSubtree state.scopeOccurrences root.id occurrence.id = false := by
        cases disposition with
        | retain =>
            change (decide (occurrence.id = root.id) ||
              !(occurrenceInSubtree state.scopeOccurrences root.id occurrence.id ||
                (calledInstanceClosure state root.id).contains occurrence.id.processInstanceId)) = true at kept
            simpa only [same, decide_false, Bool.false_or, empty, List.contains_nil,
              Bool.or_false, Bool.not_eq_true'] using kept
        | remove =>
            change (!(occurrenceInSubtree state.scopeOccurrences root.id occurrence.id ||
              (calledInstanceClosure state root.id).contains occurrence.id.processInstanceId)) = true at kept
            simpa only [empty, List.contains_nil, Bool.or_false, Bool.not_eq_true'] using kept
      apply Bool.eq_false_iff.mpr
      intro reached
      have included := occurrenceInSubtree_closed state.scopeOccurrences unique parents root.id parent occurrence.id
        reached ⟨occurrence, prior, parentEq, rfl⟩
      simp [outside] at included
  · exact List.filter_sublist
  · intro token member
    obtain ⟨prior, kept⟩ := List.mem_filter.mp member
    apply cancelScopeSubtree_preserves_uncancelled_owner state root.id disposition token.owner
      (runtimePositionValid_token_owner_live program expectedInstanceId instanceId state token valid running prior)
    simpa only [Bool.not_eq_true'] using kept

end BpmnSemantics.SemanticProcess
