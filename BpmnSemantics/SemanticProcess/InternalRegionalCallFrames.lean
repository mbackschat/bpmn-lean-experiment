import BpmnSemantics.SemanticProcess.InternalRegionalOwnershipClosure

/-! REG-OWN-FRAME-01 requires re-derived Call masks, not just closure under a fixed mask.
Disjoint forward closures preserve every reachable Call edge, including the selected-ID filter;
the filtered graph is evaluated with its own record-count fuel. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The actual association predicate rules out an equal-ID edge with a different called target.
This is the identity fact needed by removal's selected-ID conjunct, beyond endpoint separation. -/
theorem calledProcessAssociationsValid_same_id_same_target (state : RuntimeState)
    (valid : calledProcessAssociationsValid state = true)
    (left right : CalledProcessOccurrence)
    (leftMember : left ∈ state.calledProcessOccurrences)
    (rightMember : right ∈ state.calledProcessOccurrences)
    (same : left.id = right.id) :
    left.calledRoot.processInstanceId = right.calledRoot.processInstanceId := by
  unfold calledProcessAssociationsValid at valid
  split at valid
  · contradiction
  · split at valid
    · simp only [Bool.and_eq_true, List.all_eq_true] at valid
      have leftFields := valid.1.1 left leftMember
      have rightFields := valid.1.1 right rightMember
      have leftId : left.id.processInstanceId = left.caller.processInstanceId :=
        of_decide_eq_true leftFields.1.1.1.1.1.1.1.1
      have rightId : right.id.processInstanceId = right.caller.processInstanceId :=
        of_decide_eq_true rightFields.1.1.1.1.1.1.1.1
      have leftTarget : left.calledRoot.processInstanceId =
          deriveCalledProcessInstanceId left.caller.processInstanceId
            ⟨left.id.elementId.value⟩ left.id.activation :=
        of_decide_eq_true leftFields.1.1.1.1.1.2
      have rightTarget : right.calledRoot.processInstanceId =
          deriveCalledProcessInstanceId right.caller.processInstanceId
            ⟨right.id.elementId.value⟩ right.id.activation :=
        of_decide_eq_true rightFields.1.1.1.1.1.2
      rw [leftTarget, rightTarget, ← leftId, ← rightId, same]
    · contradiction

/-- Actual Call removal preserves the other forward closure's membership with fresh fuel. -/
theorem processInstanceClosureWithin_removeCalledProcessTree (state : RuntimeState)
    (left right : CalledProcessOccurrence)
    (valid : calledProcessAssociationsValid state = true)
    (leftMember : left ∈ state.calledProcessOccurrences)
    (disjoint : ∀ instanceId,
      instanceId ∈ processInstanceClosureWithin state.calledProcessOccurrences
        [left.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1) →
      instanceId ∈ processInstanceClosureWithin state.calledProcessOccurrences
        [right.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1) → False)
    (instanceId : SemanticId) :
    instanceId ∈ processInstanceClosureWithin
      (removeCalledProcessTree state left).calledProcessOccurrences
      [right.calledRoot.processInstanceId]
      ((removeCalledProcessTree state left).calledProcessOccurrences.length + 1) ↔
    instanceId ∈ processInstanceClosureWithin state.calledProcessOccurrences
      [right.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1) := by
  apply processInstanceClosureWithin_filter _ _ (by simp)
  intro record member caller
  have target := processInstanceClosureWithin_closed state.calledProcessOccurrences
    [right.calledRoot.processInstanceId] (by simp) record member caller
  have callerOutside : record.caller.processInstanceId ∉
      processInstanceClosureWithin state.calledProcessOccurrences
        [left.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1) := by
    intro inside
    exact disjoint _ inside caller
  have targetOutside : record.calledRoot.processInstanceId ∉
      processInstanceClosureWithin state.calledProcessOccurrences
        [left.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1) := by
    intro inside
    exact disjoint _ inside target
  have distinct : record.id ≠ left.id := by
    intro same
    have sameTarget := calledProcessAssociationsValid_same_id_same_target state valid
      record left member leftMember same
    apply targetOutside
    rw [sameTarget]
    exact processInstanceClosureWithin_seed_subset _ _ _ (by simp)
  simp [distinct, callerOutside, targetOutside]

/-- All six re-derived reference masks agree extensionally after disjoint Call-tree removal. -/
theorem callReferenceRetention_after_disjoint_removal (state : RuntimeState)
    (left right : CalledProcessOccurrence)
    (valid : calledProcessAssociationsValid state = true)
    (leftMember : left ∈ state.calledProcessOccurrences)
    (disjoint : ∀ instanceId,
      instanceId ∈ processInstanceClosureWithin state.calledProcessOccurrences
        [left.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1) →
      instanceId ∈ processInstanceClosureWithin state.calledProcessOccurrences
        [right.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1) → False) :
    callReferenceRetention (removeCalledProcessTree state left) right =
      callReferenceRetention state right := by
  have containsSame (instanceId : SemanticId) :
      (processInstanceClosureWithin (removeCalledProcessTree state left).calledProcessOccurrences
        [right.calledRoot.processInstanceId]
        ((removeCalledProcessTree state left).calledProcessOccurrences.length + 1)).contains instanceId =
      (processInstanceClosureWithin state.calledProcessOccurrences
        [right.calledRoot.processInstanceId]
        (state.calledProcessOccurrences.length + 1)).contains instanceId := by
    apply Bool.eq_iff_iff.mpr
    simpa only [List.contains_iff_mem] using
      processInstanceClosureWithin_removeCalledProcessTree state left right valid leftMember disjoint instanceId
  simp only [callReferenceRetention, containsSame]

/-- The actual successor passes the original right-hand ownership check with its re-derived masks.
Selection, quiescence, and disjointness derived from public footprints remain separate obligations. -/
theorem regionalOwnershipClosed_after_disjoint_call_removal (state : RuntimeState)
    (left right : CalledProcessOccurrence)
    (valid : calledProcessAssociationsValid state = true)
    (leftMember : left ∈ state.calledProcessOccurrences)
    (disjoint : ∀ instanceId,
      instanceId ∈ processInstanceClosureWithin state.calledProcessOccurrences
        [left.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1) →
      instanceId ∈ processInstanceClosureWithin state.calledProcessOccurrences
        [right.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1) → False)
    (closed : regionalOwnershipClosed state (callReferenceRetention state right) = true) :
    regionalOwnershipClosed (removeCalledProcessTree state left)
      (callReferenceRetention (removeCalledProcessTree state left) right) = true := by
  rw [callReferenceRetention_after_disjoint_removal state left right valid leftMember disjoint]
  exact regionalOwnershipClosed_after_filter state (removeCalledProcessTree state left)
    (callReferenceRetention state right) (callReferenceRetention state left)
    (callReferenceRetention_matches_removal state left) closed

end BpmnSemantics.SemanticProcess
