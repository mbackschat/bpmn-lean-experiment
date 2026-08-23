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

/-! ## Canonical insertion

Arming inserts one wait; turnover withdraws one and inserts one. Both need the same fact, and it
needs only asymmetry: the element placed before `current` must not also belong after it.
-/

/-- Insertion puts either the new wait or the old head first, which is what the adjacent-pair check
needs in order to know what the new first pair is. -/
private theorem insertUserTaskWait_head (wait current : UserTaskWait)
    (rest : List UserTaskWait) :
    (insertUserTaskWait wait (current :: rest) = wait :: current :: rest ∧
        userTaskWaitBefore wait current = true) ∨
      ∃ tail, insertUserTaskWait wait (current :: rest) = current :: tail ∧
        userTaskWaitBefore wait current = false := by
  unfold insertUserTaskWait
  by_cases h : userTaskWaitBefore wait current = true
  · exact Or.inl ⟨by simp [h], h⟩
  · simp only [Bool.not_eq_true] at h
    exact Or.inr ⟨insertUserTaskWait wait rest, by simp [h], h⟩

/-- `RSI-ORDER-01` survives canonical insertion. -/
theorem orderedBy_insertUserTaskWait (wait : UserTaskWait) :
    ∀ waits : List UserTaskWait, orderedBy userTaskWaitBefore waits = true →
      orderedBy userTaskWaitBefore (insertUserTaskWait wait waits) = true := by
  intro waits
  induction waits with
  | nil => intro _; rfl
  | cons current rest ih =>
    intro ordered
    have tail : orderedBy userTaskWaitBefore rest = true := by
      cases rest with
      | nil => rfl
      | cons second more =>
        simp only [orderedBy, Bool.and_eq_true] at ordered
        exact ordered.2
    unfold insertUserTaskWait
    by_cases h : userTaskWaitBefore wait current = true
    · simp only [h, if_pos]
      simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true']
      exact ⟨userTaskWaitBefore_asymm wait current h, ordered⟩
    · simp only [Bool.not_eq_true] at h
      simp only [h, Bool.false_eq_true, if_neg, not_false_eq_true]
      have inner := ih tail
      cases rest with
      | nil => simpa [orderedBy, insertUserTaskWait, h] using rfl
      | cons second more =>
        simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true'] at ordered
        rcases insertUserTaskWait_head wait second more with ⟨heq, hlt⟩ | ⟨tailList, heq, _⟩
        · simp only [heq, orderedBy, Bool.and_eq_true, Bool.not_eq_true']
          exact ⟨h, userTaskWaitBefore_asymm wait second hlt, tail⟩
        · simp only [heq, orderedBy, Bool.and_eq_true, Bool.not_eq_true']
          exact ⟨ordered.1, by rw [← heq]; exact inner⟩

/-- Insertion contributes exactly the inserted wait to any `all` check. -/
theorem all_insertUserTaskWait (p : UserTaskWait → Bool) (wait : UserTaskWait) :
    ∀ waits : List UserTaskWait,
      (insertUserTaskWait wait waits).all p = (p wait && waits.all p) := by
  intro waits
  induction waits with
  | nil => simp [insertUserTaskWait]
  | cons current rest ih =>
    unfold insertUserTaskWait
    by_cases h : userTaskWaitBefore wait current = true
    · simp [h]
    · simp only [Bool.not_eq_true] at h
      simp [h, ih, Bool.and_left_comm]

/-- Filtering cannot break an `all` check. -/
theorem all_filter {α : Type} (p q : α → Bool) :
    ∀ values : List α, values.all p = true → (values.filter q).all p = true := by
  intro values hall
  simp only [List.all_eq_true] at *
  exact fun value mem => hall value (List.mem_filter.mp mem).1

/-- A uniqueness check factors through the key it compares, so two lists with the same key sequence
answer it identically.

This is what carries the record-side well-formedness conjuncts across a body rewrite: `occursOnce`
reads records only through their identity, and replacement leaves the identity sequence alone. The
key's own comparator is a parameter rather than `BEq β`, so a caller supplies the comparison its
predicate already performs instead of matching a derived instance. -/
theorem all_occursOnce_of_map_eq {α β : Type} (key : α → β)
    (same : α → α → Bool) (keySame : β → β → Bool)
    (hsame : ∀ a b, same a b = keySame (key a) (key b))
    (left right : List α) (h : left.map key = right.map key) :
    left.all (occursOnce same left) = right.all (occursOnce same right) := by
  have count : ∀ (values : List α) (value : α),
      (values.filter (same value)).length =
        (values.map key).countP (keySame (key value)) := by
    intro values value
    rw [List.countP_map, ← List.countP_eq_length_filter]
    exact List.countP_congr (fun a _ => by simp [hsame])
  have expand : ∀ values : List α,
      values.all (occursOnce same values) =
        (values.map key).all
          (fun k => decide ((values.map key).countP (keySame k) = 1)) := by
    intro values
    rw [List.all_map]
    congr 1
    funext a
    simp only [Function.comp_apply, occursOnce, count values a]
  rw [expand left, expand right, h]

/-- An `all` check whose predicate factors through a key is decided by the key sequence alone. -/
theorem all_of_map_eq {α β : Type} (key : α → β) (p : α → Bool) (q : β → Bool)
    (hp : ∀ a, p a = q (key a)) (left right : List α)
    (h : left.map key = right.map key) : left.all p = right.all p := by
  have expand : ∀ values : List α, values.all p = (values.map key).all q := by
    intro values
    rw [List.all_map]
    congr 1
    funext a
    exact hp a
  rw [expand left, expand right, h]

/-! ## The task activation comparator

One level rather than five, so the two order facts come straight from `String`.
-/

/-- The canonical order on the task activation family, named so laws about it are stateable. -/
def activationBefore (left right : TaskActivation) : Bool :=
  decide (left.taskId.value < right.taskId.value)

theorem activationBefore_asymm (left right : TaskActivation) :
    activationBefore left right = true → activationBefore right left = false := by
  simp only [activationBefore, decide_eq_true_eq, decide_eq_false_iff_not]
  exact String.lt_asymm

theorem activationBefore_compose (a b c : TaskActivation) :
    activationBefore b a = false → activationBefore c b = false →
      activationBefore c a = false := by
  simp only [activationBefore, decide_eq_false_iff_not]
  intro h1 h2
  have hab : a.taskId.value ≤ b.taskId.value := by simpa using h1
  have hbc : b.taskId.value ≤ c.taskId.value := by simpa using h2
  simpa using Std.le_trans hab hbc

/-- Canonical insertion preserves the activation order. -/
theorem orderedBy_insertTaskActivation (activation : TaskActivation) :
    ∀ activations : List TaskActivation,
      orderedBy activationBefore activations = true →
        orderedBy activationBefore (insertTaskActivation activation activations) = true := by
  intro activations
  induction activations with
  | nil => intro _; rfl
  | cons current rest ih =>
    intro ordered
    have tail : orderedBy activationBefore rest = true := by
      cases rest with
      | nil => rfl
      | cons second more =>
        simp only [orderedBy, Bool.and_eq_true] at ordered
        exact ordered.2
    unfold insertTaskActivation
    by_cases h : activation.taskId.value < current.taskId.value
    · simp only [h, if_pos]
      simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true']
      exact ⟨activationBefore_asymm _ _ (by simpa [activationBefore] using h), ordered⟩
    · simp only [h, if_neg, not_false_eq_true]
      have inner := ih tail
      cases rest with
      | nil =>
        simp only [insertTaskActivation, orderedBy, Bool.and_eq_true, Bool.not_eq_true']
        exact ⟨by simpa [activationBefore] using h, trivial⟩
      | cons second more =>
        simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true'] at ordered
        unfold insertTaskActivation
        by_cases h2 : activation.taskId.value < second.taskId.value
        · simp only [h2, if_pos, orderedBy, Bool.and_eq_true, Bool.not_eq_true']
          refine ⟨by simpa [activationBefore] using h, ?_, tail⟩
          exact activationBefore_asymm _ _ (by simpa [activationBefore] using h2)
        · simp only [h2, if_neg, not_false_eq_true, orderedBy, Bool.and_eq_true,
            Bool.not_eq_true']
          refine ⟨ordered.1, ?_⟩
          have := ih tail
          simpa [insertTaskActivation, h2] using this

/-- An adjacent-pair check whose comparator factors through a key is decided by the key sequence. -/
theorem orderedBy_of_map_eq {α β : Type} (key : α → β) (before : α → α → Bool)
    (keyBefore : β → β → Bool) (hb : ∀ a b, before a b = keyBefore (key a) (key b))
    (left right : List α) (h : left.map key = right.map key) :
    orderedBy before left = orderedBy before right := by
  have expand : ∀ values : List α,
      orderedBy before values = orderedBy keyBefore (values.map key) := by
    intro values
    induction values with
    | nil => rfl
    | cons first rest ih =>
      cases rest with
      | nil => rfl
      | cons second more =>
        simp only [List.map_cons, orderedBy, hb] at *
        rw [ih]
  rw [expand left, expand right, h]

/-- Canonical insertion adds exactly the inserted wait to the membership of the list.

Membership rather than an algebraic rewrite is what the remaining well-formedness conjuncts need:
each of them quantifies over the waits, and the interesting cases are "this is the wait just armed"
and "this wait was already here". -/
theorem mem_insertUserTaskWait (wait candidate : UserTaskWait) :
    ∀ waits : List UserTaskWait,
      candidate ∈ insertUserTaskWait wait waits ↔ candidate = wait ∨ candidate ∈ waits := by
  intro waits
  induction waits with
  | nil => simp [insertUserTaskWait]
  | cons current rest ih =>
    unfold insertUserTaskWait
    by_cases h : userTaskWaitBefore wait current = true
    · simp [h]
    · simp only [Bool.not_eq_true] at h
      simp only [h, Bool.false_eq_true, if_neg, not_false_eq_true, List.mem_cons, ih]
      exact or_left_comm

/-- Canonical insertion adds exactly one occurrence to any count. -/
theorem countP_insertUserTaskWait (p : UserTaskWait → Bool) (wait : UserTaskWait) :
    ∀ waits : List UserTaskWait,
      (insertUserTaskWait wait waits).countP p =
        (if p wait then 1 else 0) + waits.countP p := by
  intro waits
  induction waits with
  | nil => cases hp : p wait <;> simp [insertUserTaskWait, List.countP_cons, hp]
  | cons current rest ih =>
    unfold insertUserTaskWait
    by_cases h : userTaskWaitBefore wait current = true
    · cases hp : p wait <;> simp [h, List.countP_cons, hp] <;> omega
    · simp only [Bool.not_eq_true] at h
      simp only [h, Bool.false_eq_true, if_neg, not_false_eq_true, List.countP_cons, ih]
      cases hp : p wait <;> cases hq : p current <;> simp [hp, hq] <;> omega

end BpmnSemantics.SemanticProcess
