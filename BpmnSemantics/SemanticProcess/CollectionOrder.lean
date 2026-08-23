import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Canonical collection order

The order theory `canonicalCollectionOrder` needs but does not contain.

`orderedBy` checks adjacent pairs only. That is the right shape for a decidable conjunct, but it means
a transition cannot preserve the invariant by local reasoning alone: filtering makes distant elements
neighbours, so the surviving pair has to be justified from the original list. This module supplies
that step once, generically over the comparator, together with the order facts each concrete
comparator needs to use it.

Its existence is what makes a quantified preservation law possible at all. Every well-formedness fact
in this repository before it was decided of a concrete state, because the initial state has empty
collections and needed no order argument; the first transition-level preservation claim is what forces
the theory.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-! ## Order preservation

`canonicalCollectionOrder` checks adjacent pairs only, so preserving it needs two facts about the
comparator rather than a sortedness argument. Filtering needs the *negation* to compose: dropping an
element makes its neighbours adjacent, and their pair must still be uninverted. Inserting needs
asymmetry: the element placed before `current` must not also belong after it.

Both are stated as hypotheses over an arbitrary `before`, so the two comparators this transition
touches discharge them once at their own owner instead of each collection carrying its own induction.
-/

/-- In an uninverted list, a bound the head does not invert against is not inverted by any element.

This is the fact filtering needs and adjacency alone does not give: dropping an element makes distant
elements neighbours, so the surviving pair must be justified from the original list rather than from
the pair it replaces. -/
theorem orderedBy_bound {α : Type} {before : α → α → Bool}
    (compose : ∀ a b c, before b a = false → before c b = false → before c a = false) :
    ∀ (first : α) (rest : List α) (bound : α),
      orderedBy before (first :: rest) = true →
      before first bound = false →
      ∀ value ∈ first :: rest, before value bound = false := by
  intro first rest
  induction rest generalizing first with
  | nil =>
    intro bound _ head value mem
    cases List.mem_singleton.mp mem
    exact head
  | cons second more ih =>
    intro bound ordered head value mem
    simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true'] at ordered
    obtain ⟨pair, tail⟩ := ordered
    rcases List.mem_cons.mp mem with rfl | later
    · exact head
    · exact ih second bound tail (compose _ _ _ head pair) value later

/-- Removing elements keeps an uninverted list uninverted, given that non-inversion composes. -/
theorem orderedBy_filter {α : Type} {before : α → α → Bool}
    (compose : ∀ a b c, before b a = false → before c b = false → before c a = false)
    (p : α → Bool) :
    ∀ values : List α, orderedBy before values = true →
      orderedBy before (values.filter p) = true := by
  intro values
  induction values with
  | nil => intro _; rfl
  | cons left rest ih =>
    intro ordered
    have tail : orderedBy before rest = true := by
      cases rest with
      | nil => rfl
      | cons right more =>
        simp only [orderedBy, Bool.and_eq_true] at ordered
        exact ordered.2
    have inner := ih tail
    by_cases hleft : p left = true
    · simp only [List.filter_cons, hleft, if_true]
      cases hfiltered : rest.filter p with
      | nil => simp [orderedBy]
      | cons next more =>
        have next_in : next ∈ rest :=
          (List.mem_filter.mp (by simp [hfiltered] : next ∈ rest.filter p)).1
        have bound : before next left = false := by
          cases rest with
          | nil => simp at next_in
          | cons right tailRest =>
            simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true'] at ordered
            exact orderedBy_bound compose right tailRest left tail ordered.1 next next_in
        simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true']
        exact ⟨bound, by rw [← hfiltered]; exact inner⟩
    · simp only [Bool.not_eq_true] at hleft
      simpa [List.filter_cons, hleft] using inner

/-! ## The lexicographic step

Every comparator this state uses is a chain of the same shape: compare one key, and fall through to
the rest when it ties. Naming that step once turns two proofs that would each case-split five levels
into one pair of proofs about the step, applied five times.

The step is stated over an arbitrary ordered key rather than over `String` and `Nat` separately so
that the chain can mix them, which every comparator here does.
-/

private def lexStep {α : Type} [DecidableEq α] [LT α] [DecidableLT α]
    (left right : α) (rest : Bool) : Bool :=
  if left ≠ right then decide (left < right) else rest

/-- Both order lemmas read the step through this shape rather than through its `if`, so each branch
below names a case of the key comparison instead of a case of the encoding. -/
private theorem lexStep_false_iff {α : Type} [DecidableEq α] [LT α] [DecidableLT α]
    (left right : α) (rest : Bool) :
    lexStep left right rest = false ↔
      (if left = right then rest = false else ¬ (left < right)) := by
  unfold lexStep
  by_cases h : left = right <;> simp [h]

private theorem lexStep_true_iff {α : Type} [DecidableEq α] [LT α] [DecidableLT α]
    (left right : α) (rest : Bool) :
    lexStep left right rest = true ↔
      (if left = right then rest = true else left < right) := by
  unfold lexStep
  by_cases h : left = right <;> simp [h]

private theorem lexStep_asymm {α : Type} [DecidableEq α] [LT α] [DecidableLT α]
    (asymm : ∀ x y : α, x < y → ¬ (y < x)) (left right : α) (forward backward : Bool)
    (fall : forward = true → backward = false) :
    lexStep left right forward = true → lexStep right left backward = false := by
  rw [lexStep_true_iff, lexStep_false_iff]
  by_cases h : left = right
  · subst h; simpa using fall
  · have h' : right ≠ left := fun eq => h eq.symm
    simp only [h, h', if_neg, not_false_eq_true]
    exact asymm left right

private theorem lexStep_compose {α : Type} [DecidableEq α] [LT α] [DecidableLT α]
    (asymm : ∀ x y : α, x < y → ¬ (y < x)) (total : ∀ x y : α, x ≠ y → x < y ∨ y < x)
    (trans : ∀ x y z : α, x < y → y < z → x < z) (a b c : α) (ba cb ca : Bool)
    (fall : ba = false → cb = false → ca = false) :
    lexStep b a ba = false → lexStep c b cb = false → lexStep c a ca = false := by
  rw [lexStep_false_iff, lexStep_false_iff, lexStep_false_iff]
  intro h1 h2
  by_cases hba : b = a
  · subst hba
    by_cases hcb : c = b
    · subst hcb; simp_all
    · simp_all
  · simp only [hba, if_neg, not_false_eq_true] at h1
    by_cases hcb : c = b
    · subst hcb; simp only [hba, if_neg, not_false_eq_true]; exact h1
    · simp only [hcb, if_neg, not_false_eq_true] at h2
      by_cases hca : c = a
      · subst hca
        -- `a < b` and `b < a` are both refused while `a ≠ b`, which totality forbids.
        exact absurd ((total _ _ (fun eq => hba eq.symm)).resolve_right h1) h2
      · simp only [hca, if_neg, not_false_eq_true]
        have hab : a < b := (total _ _ (fun eq => hba eq.symm)).resolve_right h1
        have hbc : b < c := (total _ _ (fun eq => hcb eq.symm)).resolve_right h2
        exact asymm a c (trans _ _ _ hab hbc)

/-! ## The User Task wait comparator

Five lexicographic levels over `String`, `String`, `Nat`, `String`, `Nat`. The chain is stated as an
equation rather than re-derived, so the two order lemmas are five applications of the step lemmas
above and carry no case analysis of their own.
-/

private theorem string_total (x y : String) : x ≠ y → x < y ∨ y < x := by
  intro hne
  by_cases h : x < y
  · exact Or.inl h
  · exact Or.inr (Std.lt_of_le_of_ne (by simpa using h) (Ne.symm hne))

private theorem nat_total (x y : Nat) : x ≠ y → x < y ∨ y < x := by
  intro hne
  omega

private theorem userTaskWaitBefore_chain (left right : UserTaskWait) :
    userTaskWaitBefore left right =
      lexStep left.processInstanceId.value right.processInstanceId.value
        (lexStep left.owner.definitionScopeId.value right.owner.definitionScopeId.value
          (lexStep left.owner.activation right.owner.activation
            (lexStep left.task.id.value right.task.id.value
              (decide (left.activation < right.activation))))) := rfl

theorem userTaskWaitBefore_asymm (left right : UserTaskWait) :
    userTaskWaitBefore left right = true → userTaskWaitBefore right left = false := by
  rw [userTaskWaitBefore_chain, userTaskWaitBefore_chain]
  refine lexStep_asymm (fun _ _ => String.lt_asymm) _ _ _ _ ?_
  refine lexStep_asymm (fun _ _ => String.lt_asymm) _ _ _ _ ?_
  refine lexStep_asymm (fun _ _ => Nat.lt_asymm) _ _ _ _ ?_
  refine lexStep_asymm (fun _ _ => String.lt_asymm) _ _ _ _ ?_
  intro h
  simp only [decide_eq_true_eq] at h
  simp only [decide_eq_false_iff_not]
  exact Nat.lt_asymm h

theorem userTaskWaitBefore_compose (a b c : UserTaskWait) :
    userTaskWaitBefore b a = false → userTaskWaitBefore c b = false →
      userTaskWaitBefore c a = false := by
  rw [userTaskWaitBefore_chain, userTaskWaitBefore_chain, userTaskWaitBefore_chain]
  refine lexStep_compose (fun _ _ => String.lt_asymm) string_total (fun _ _ _ => String.lt_trans) _ _ _ _ _ _ ?_
  refine lexStep_compose (fun _ _ => String.lt_asymm) string_total (fun _ _ _ => String.lt_trans) _ _ _ _ _ _ ?_
  refine lexStep_compose (fun _ _ => Nat.lt_asymm) nat_total (fun _ _ _ => Nat.lt_trans) _ _ _ _ _ _ ?_
  refine lexStep_compose (fun _ _ => String.lt_asymm) string_total (fun _ _ _ => String.lt_trans) _ _ _ _ _ _ ?_
  intro h1 h2
  simp only [decide_eq_false_iff_not] at *
  omega

end BpmnSemantics.SemanticProcess
