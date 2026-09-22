import BpmnSemantics.SemanticProcess.InternalTransitionAlternative
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycleOrder

/-! Exact frontier presentation uses the existing lexicographic and scope-order laws. Sorting
does not resolve choice under the [explicit-choice account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#explicit-observable-choice).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem string_before_asymm (left right : String) :
    decide (left < right) = true → decide (right < left) = false := by
  simp only [decide_eq_true_eq, decide_eq_false_iff_not]
  exact String.lt_asymm

private theorem string_before_trans (left middle right : String) :
    decide (left < middle) = true → decide (middle < right) = true → decide (left < right) = true := by
  simp only [decide_eq_true_eq]
  exact String.lt_trans

private theorem string_before_total (left right : String) (different : left ≠ right) :
    decide (left < right) = true ∨ decide (right < left) = true := by
  simp only [decide_eq_true_eq]
  by_cases before : left < right
  · exact Or.inl before
  · exact Or.inr (Std.lt_of_le_of_ne (by simpa using before) (Ne.symm different))

private theorem merge_before_chain (left right : OperationId) (lo ro : ScopeOccurrenceId) (li ri : ControlPlaceId) :
    internalAlternativeBefore (.mergeInput left lo li) (.mergeInput right ro ri) =
      lifecycleLexStep (fun a b : OperationId => decide (a.value < b.value)) left right
        (lifecycleLexStep scopeBefore lo ro (decide (li.value < ri.value))) := rfl

theorem internalAlternativeBefore_asymm (left right : InternalAlternative) :
    internalAlternativeBefore left right = true → internalAlternativeBefore right left = false := by
  cases left <;> cases right <;> try (solve | simp [internalAlternativeBefore])
  · exact string_before_asymm _ _
  · rw [merge_before_chain, merge_before_chain]
    apply lifecycleLexStep_asymm _ (fun _ _ => string_before_asymm _ _)
    apply lifecycleLexStep_asymm _ BpmnSemantics.SemanticProcess.scopeBefore_asymm
    exact string_before_asymm _ _

theorem internalAlternativeBefore_trans (left middle right : InternalAlternative) :
    internalAlternativeBefore left middle = true → internalAlternativeBefore middle right = true →
      internalAlternativeBefore left right = true := by
  cases left <;> cases middle <;> cases right <;> try (solve | simp [internalAlternativeBefore])
  · exact string_before_trans _ _ _
  · rw [merge_before_chain, merge_before_chain, merge_before_chain]
    apply lifecycleLexStep_trans (fun a b : OperationId => decide (a.value < b.value))
      (fun a b => string_before_asymm a.value b.value)
      (fun a b c => string_before_trans a.value b.value c.value)
    apply lifecycleLexStep_trans _ BpmnSemantics.SemanticProcess.scopeBefore_asymm BpmnSemantics.SemanticProcess.scopeBefore_trans
    exact string_before_trans _ _ _

theorem internalAlternativeBefore_total (left right : InternalAlternative) (different : left ≠ right) :
    internalAlternativeBefore left right = true ∨ internalAlternativeBefore right left = true := by
  cases left with
  | operation left =>
      cases right with
      | operation right =>
          exact string_before_total left.value right.value (by intro same; cases left; cases right; simp_all)
      | mergeInput _ _ _ => simp [internalAlternativeBefore]
  | mergeInput left lo li =>
      cases right with
      | operation _ => simp [internalAlternativeBefore]
      | mergeInput right ro ri =>
          rw [merge_before_chain, merge_before_chain]
          apply lifecycleLexStep_comparable
          · intro a b distinct
            exact string_before_total a.value b.value (by intro same; cases a; cases b; simp_all)
          intro operationEq
          apply lifecycleLexStep_comparable _ BpmnSemantics.SemanticProcess.scopeBefore_total
          intro ownerEq
          exact string_before_total li.value ri.value (by
            intro same
            cases li
            cases ri
            simp_all)

end BpmnSemantics.SemanticProcess.InternalCommutation
