import BpmnSemantics.SemanticProcess.CallStorageOrder

/-! Exact canonical Call storage requires the unique caller/element anchors of the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
The comparator omits retained payload fields, so permutation and order alone are insufficient.
-/

namespace BpmnSemantics.SemanticProcess

private theorem callRecordBefore_chain (left right : CalledProcessOccurrence) :
    callRecordBefore left right =
      armingLexStep left.caller.processInstanceId.value right.caller.processInstanceId.value
        (armingLexStep left.caller.definitionScopeId.value right.caller.definitionScopeId.value
          (armingLexStep left.caller.activation right.caller.activation
            (armingLexStep left.id.elementId.value right.id.elementId.value
              (decide (left.id.activation < right.id.activation))))) := by
  rcases left with ⟨li, ⟨⟨lp⟩, ⟨ls⟩, la⟩, lc, lr, lo⟩
  rcases right with ⟨ri, ⟨⟨rp⟩, ⟨rs⟩, ra⟩, rc, rr, ro⟩
  by_cases process : lp = rp <;> by_cases scope : ls = rs <;>
    by_cases activation : la = ra <;>
    simp [callRecordBefore, scopeOwnerBefore, armingLexStep, process, scope, activation]

private theorem string_total (left right : String) (different : left ≠ right) :
    left < right ∨ right < left := by
  by_cases before : left < right
  · exact Or.inl before
  · exact Or.inr (Std.lt_of_le_of_ne (by simpa using before) (Ne.symm different))

theorem callRecordBefore_trans (a b c : CalledProcessOccurrence) :
    callRecordBefore a b = true → callRecordBefore b c = true →
      callRecordBefore a c = true := by
  simp only [callRecordBefore_chain]
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => Nat.lt_asymm) (fun _ _ _ => Nat.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  simp only [decide_eq_true_eq]
  exact Nat.lt_trans

private theorem lexStep_compose {key : Type} [DecidableEq key] [LT key]
    [DecidableLT key] (total : ∀ x y : key, x ≠ y → x < y ∨ y < x)
    (trans : ∀ x y z : key, x < y → y < z → x < z)
    (a b c : key) (ba cb ca : Bool)
    (fall : ba = false → cb = false → ca = false) :
    armingLexStep b a ba = false → armingLexStep c b cb = false →
      armingLexStep c a ca = false := by
  by_cases ab : a = b
  · subst b
    by_cases ac : a = c
    · subst c; simpa [armingLexStep] using fall
    · simp [armingLexStep, Ne.symm ac]
  · by_cases bc : b = c
    · subst c
      simp only [armingLexStep, Ne.symm ab, ne_eq, not_false_eq_true,
        if_true, not_true_eq_false, if_false, decide_eq_false_iff_not]
      exact fun first _ => first
    · by_cases ac : a = c
      · subst c
        simp only [armingLexStep, ab, Ne.symm ab, ne_eq, not_false_eq_true,
          if_true, not_true_eq_false, if_false, decide_eq_false_iff_not]
        intro first second
        rcases total a b ab with forward | backward
        · exact False.elim (second forward)
        · exact False.elim (first backward)
      · simp only [armingLexStep, Ne.symm ab, Ne.symm bc, Ne.symm ac,
          ne_eq, not_false_eq_true, if_true, decide_eq_false_iff_not]
        intro first second reverse
        rcases total a b ab with forward | backward
        · exact second (trans _ _ _ reverse forward)
        · exact first backward

theorem callRecordBefore_compose (a b c : CalledProcessOccurrence) :
    callRecordBefore b a = false → callRecordBefore c b = false →
      callRecordBefore c a = false := by
  simp only [callRecordBefore_chain]
  apply lexStep_compose string_total (fun _ _ _ => String.lt_trans)
  apply lexStep_compose string_total (fun _ _ _ => String.lt_trans)
  apply lexStep_compose (fun _ _ _ => by omega) (fun _ _ _ => Nat.lt_trans)
  apply lexStep_compose string_total (fun _ _ _ => String.lt_trans)
  simp only [decide_eq_false_iff_not]
  omega

theorem callRecordBefore_anchor_comparable (left right : CalledProcessOccurrence)
    (different : left.caller ≠ right.caller ∨ left.id.elementId.value ≠ right.id.elementId.value) :
    callRecordBefore left right = true ∨ callRecordBefore right left = true := by
  by_cases caller : left.caller = right.caller
  · have element := different.resolve_left (not_not_intro caller)
    simpa [callRecordBefore, caller, scopeOwnerBefore, element, Ne.symm element]
      using string_total _ _ element
  · rcases scopeOwnerBefore_comparable left.caller right.caller caller with forward | backward
    · simp [callRecordBefore, forward]
    · simp [callRecordBefore, backward]

theorem orderedBy_callRecords_pairwise (records : List CalledProcessOccurrence) :
    orderedBy callRecordBefore records = true ↔
      records.Pairwise (fun left right => callRecordBefore right left = false) := by
  induction records with
  | nil => simp [orderedBy]
  | cons first rest ih =>
      rw [List.pairwise_cons]
      constructor
      · intro ordered
        have tail : orderedBy callRecordBefore rest = true := by
          cases rest with
          | nil => rfl
          | cons second more =>
              simp only [orderedBy, Bool.and_eq_true] at ordered
              exact ordered.2
        refine ⟨?_, ih.mp tail⟩
        intro record member
        exact orderedBy_bound callRecordBefore_compose first rest first ordered
          (by simp [callRecordBefore, scopeOwnerBefore]) record (List.mem_cons_of_mem first member)
      · rintro ⟨bound, tail⟩
        have ordered := ih.mpr tail
        cases rest with
        | nil => rfl
        | cons second more =>
            simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true']
            exact ⟨bound second (by simp), ordered⟩

theorem calledProcessAssociationsValid_anchor_unique (state : RuntimeState)
    (valid : calledProcessAssociationsValid state = true)
    (left right : CalledProcessOccurrence)
    (leftMember : left ∈ state.calledProcessOccurrences)
    (rightMember : right ∈ state.calledProcessOccurrences)
    (caller : left.caller = right.caller)
    (element : left.id.elementId.value = right.id.elementId.value) : left = right := by
  unfold calledProcessAssociationsValid at valid
  split at valid
  · contradiction
  · split at valid
    · simp only [Bool.and_eq_true, List.all_eq_true] at valid
      have fields := valid.1.1 left leftMember
      have count := of_decide_eq_true fields.1.2
      change (state.calledProcessOccurrences.filter (fun candidate =>
        decide (candidate.caller = left.caller) &&
          decide (candidate.id.elementId.value = left.id.elementId.value))).length = 1 at count
      obtain ⟨unique, exact⟩ := List.length_eq_one_iff.mp count
      have leftPresent : left ∈ [unique] := by
        rw [← exact]
        simp [leftMember]
      have rightPresent : right ∈ [unique] := by
        rw [← exact]
        simp [rightMember, caller, element]
      exact (List.mem_singleton.mp leftPresent).trans (List.mem_singleton.mp rightPresent).symm
    · contradiction

theorem canonical_callRecords_eq_of_perm (state : RuntimeState)
    (right : List CalledProcessOccurrence)
    (valid : calledProcessAssociationsValid state = true)
    (leftOrder : orderedBy callRecordBefore state.calledProcessOccurrences = true)
    (rightOrder : orderedBy callRecordBefore right = true)
    (same : state.calledProcessOccurrences.Perm right) :
    state.calledProcessOccurrences = right := by
  apply List.Perm.eq_of_pairwise (le := fun a b => callRecordBefore b a = false)
    ?_ ((orderedBy_callRecords_pairwise _).mp leftOrder)
    ((orderedBy_callRecords_pairwise _).mp rightOrder) same
  intro a b aMember bMember forward backward
  by_cases caller : a.caller = b.caller
  · by_cases element : a.id.elementId.value = b.id.elementId.value
    · exact calledProcessAssociationsValid_anchor_unique state valid a b aMember
        (same.symm.subset bMember) caller element
    · rcases callRecordBefore_anchor_comparable a b (Or.inr element) with first | second
      · simp [backward] at first
      · simp [forward] at second
  · rcases callRecordBefore_anchor_comparable a b (Or.inl caller) with first | second
    · simp [backward] at first
    · simp [forward] at second

end BpmnSemantics.SemanticProcess
