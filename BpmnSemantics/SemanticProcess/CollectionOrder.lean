import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Collection laws for transition-level preservation

The list laws a transition needs to carry `runtimeStateWellFormed` across a rewrite, in three groups.

**Canonical order.** `orderedBy` checks adjacent pairs only. That is the right shape for a decidable
conjunct, but it means a transition cannot preserve the invariant by local reasoning alone: filtering
makes distant elements neighbours, so the surviving pair has to be justified from the original list.
This module supplies that step once, generically over the comparator, together with the order facts
each concrete comparator needs to use it.

**Canonical insertion.** Arming inserts one wait; turnover withdraws one and inserts one. Both need
membership, count, and order preservation for `insertUserTaskWait` and `insertTaskActivation`.

**Key factoring.** Several conjuncts read a collection only through a projection — an identity, an
owner, an order key. When a rewrite leaves that projection alone, the conjunct is decided by the key
sequence rather than by the elements, and `all_of_map_eq`, `all_occursOnce_of_map_eq`, and
`orderedBy_of_map_eq` are what turn a frame law into a preservation law without a per-conjunct
induction.

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

/-! ## Canonical insertion for waits, and the laws that read a collection through a key

Insertion needs only asymmetry: the element placed before `current` must not also belong after it.
`all_insertUserTaskWait` and `all_filter` follow it because a conjunct crossing this transition meets
the inserted element and the filtered ones in the same step. The three `of_map_eq` laws after them are
the key-factoring group and are about neither insertion nor filtering: they are what turns a frame law
into a preservation law.
-/

theorem mem_canonicalInsertBy [DecidableEq α] (before : α → α → Bool)
    (inserted value : α) (values : List α) :
    value ∈ canonicalInsertBy before inserted values ↔ value = inserted ∨ value ∈ values := by
  induction values with
  | nil => simp [canonicalInsertBy]
  | cons current rest ih =>
      simp only [canonicalInsertBy]
      split <;> simp_all [or_left_comm]

theorem all_canonicalInsertBy (before : α → α → Bool) (p : α → Bool)
    (inserted : α) (values : List α) :
    (canonicalInsertBy before inserted values).all p = (p inserted && values.all p) := by
  induction values with
  | nil => simp [canonicalInsertBy]
  | cons current rest ih =>
      simp only [canonicalInsertBy]
      split <;> simp_all [Bool.and_left_comm]

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
      | nil => simp [orderedBy, insertUserTaskWait, h]
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

/-- Message-handler ambiguity depends only on the sequence of Message-handler projections. -/
theorem attachedMessagesUnambiguous_of_handler_map_eq
    (before after : List ActivityOccurrence)
    (handlers : after.map (fun record => record.messageHandlerOccurrences) =
      before.map (fun record => record.messageHandlerOccurrences)) :
    after.all (fun record =>
      record.messageHandlerOccurrences.all fun subscription =>
        (after.filter fun candidate =>
          candidate.messageHandlerOccurrences.contains subscription).length ≤ 1) =
      before.all (fun record =>
        record.messageHandlerOccurrences.all fun subscription =>
          (before.filter fun candidate =>
            candidate.messageHandlerOccurrences.contains subscription).length ≤ 1) := by
  have counts : ∀ subscription,
      (after.filter fun candidate =>
        candidate.messageHandlerOccurrences.contains subscription).length =
      (before.filter fun candidate =>
        candidate.messageHandlerOccurrences.contains subscription).length := by
    intro subscription
    simp only [← List.countP_eq_length_filter]
    change after.countP ((fun messageHandlers : List OccurrenceId =>
        messageHandlers.contains subscription) ∘
          fun record => record.messageHandlerOccurrences) =
      before.countP ((fun messageHandlers : List OccurrenceId =>
        messageHandlers.contains subscription) ∘
          fun record => record.messageHandlerOccurrences)
    rw [← List.countP_map, ← List.countP_map, handlers]
  let afterPredicate : ActivityOccurrence → Bool := fun record =>
    record.messageHandlerOccurrences.all fun subscription =>
      (after.filter fun candidate =>
        candidate.messageHandlerOccurrences.contains subscription).length ≤ 1
  let beforePredicate : ActivityOccurrence → Bool := fun record =>
    record.messageHandlerOccurrences.all fun subscription =>
      (before.filter fun candidate =>
        candidate.messageHandlerOccurrences.contains subscription).length ≤ 1
  let projectedPredicate : List OccurrenceId → Bool := fun messageHandlers =>
    messageHandlers.all fun subscription =>
      (after.filter fun candidate =>
        candidate.messageHandlerOccurrences.contains subscription).length ≤ 1
  have moved := all_of_map_eq
    (fun record : ActivityOccurrence => record.messageHandlerOccurrences)
    afterPredicate projectedPredicate (fun _ => rfl) after before handlers
  have samePredicate : afterPredicate = beforePredicate := by
    funext record
    simp only [afterPredicate, beforePredicate]
    congr 1
    funext subscription
    rw [counts subscription]
  exact moved.trans (congrArg (fun predicate => before.all predicate) samePredicate)

/-- Activity insertion is the generic canonical insert specialized to the runtime-state order. -/
theorem insertActivityOccurrence_eq_canonicalInsertBy (record : ActivityOccurrence) :
    ∀ records, insertActivityOccurrence record records =
      canonicalInsertBy activityOccurrenceBefore record records := by
  intro records
  induction records with
  | nil => rfl
  | cons current rest ih =>
      simp only [insertActivityOccurrence, canonicalInsertBy]
      split <;> simp_all

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

/-! ## The task activation comparator, and the membership and counting laws

One level rather than five, so the two order facts come straight from `String`. The membership and
counting laws after the comparator belong to the wait insertion further up; they are stated here
because both uniqueness conjuncts consume them together with `countP_pos_exists`, which has no other
consumer.
-/

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
  | nil => cases hp : p wait <;> simp [insertUserTaskWait, hp]
  | cons current rest ih =>
    unfold insertUserTaskWait
    by_cases h : userTaskWaitBefore wait current = true
    · cases hp : p wait <;> simp [h, List.countP_cons, hp] <;> omega
    · simp only [Bool.not_eq_true] at h
      simp only [h, Bool.false_eq_true, if_neg, not_false_eq_true, List.countP_cons, ih]
      cases hp : p wait <;> cases hq : p current <;> simp <;> omega

/-- Mapping a canonical insertion succeeds by inserting exactly the mapped value, up to order. -/
theorem mapM_canonicalInsertBy_some (before : α → α → Bool) (f : α → Option β)
    (value : α) (mappedValue : β) (values : List α) (mapped : List β)
    (valueMapped : f value = some mappedValue) (valuesMapped : values.mapM f = some mapped) :
    ∃ inserted, (canonicalInsertBy before value values).mapM f = some inserted ∧
      inserted.Perm (mappedValue :: mapped) := by
  induction values generalizing mapped with
  | nil =>
      simp at valuesMapped
      subst mapped
      exact ⟨[mappedValue], by simp [canonicalInsertBy, valueMapped]⟩
  | cons current rest ih =>
      cases currentMapped : f current with
      | none => simp [currentMapped] at valuesMapped
      | some currentResult =>
          cases restMapped : rest.mapM f with
          | none => simp [currentMapped, restMapped] at valuesMapped
          | some restResult =>
              simp [currentMapped, restMapped] at valuesMapped
              subst mapped
              simp only [canonicalInsertBy]
              split
              · exact ⟨mappedValue :: currentResult :: restResult,
                  by simp [valueMapped, currentMapped, restMapped]⟩
              · obtain ⟨inserted, insertedMapped, perm⟩ := ih restResult restMapped
                exact ⟨currentResult :: inserted, by simp [currentMapped, insertedMapped],
                  (List.Perm.cons currentResult perm).trans
                    (List.Perm.swap mappedValue currentResult restResult)⟩

/-- Filtering a canonical insertion keeps exactly the inserted matching value, up to order. -/
theorem filter_canonicalInsertBy_perm (before : α → α → Bool) (p : α → Bool)
    (value : α) (values : List α) (kept : p value = true) :
    (canonicalInsertBy before value values).filter p |>.Perm (value :: values.filter p) := by
  induction values with
  | nil => simp [canonicalInsertBy, kept]
  | cons current rest ih =>
      simp only [canonicalInsertBy]
      split
      · simp [kept]
      · by_cases currentKept : p current = true
        · simp only [List.filter_cons, currentKept, if_true]
          exact (List.Perm.cons current ih).trans (List.Perm.swap value current _)
        · simp [currentKept, ih]

/-- Filtering a canonical insertion changes the count only when the inserted value is kept. -/
theorem length_filter_canonicalInsertBy (before : α → α → Bool) (p : α → Bool)
    (value : α) : ∀ values : List α,
    ((canonicalInsertBy before value values).filter p).length =
      (if p value then 1 else 0) + (values.filter p).length := by
  intro values
  by_cases kept : p value = true
  · have lengthEq := (filter_canonicalInsertBy_perm before p value values kept).length_eq
    simpa [kept, Nat.add_comm] using lengthEq
  · have rejected : p value = false := by cases valueEq : p value <;> simp_all
    induction values with
    | nil => simp [canonicalInsertBy, rejected]
    | cons current rest ih =>
        simp only [canonicalInsertBy]
        split
        · simp [rejected]
        · cases currentEq : p current <;> simp [rejected, currentEq, ih]

/-- Inserting an Activity with no Message handler cannot introduce a Message-subscription claimant. -/
theorem insertActivityOccurrence_preserves_attachedMessagesUnambiguous_of_empty
    (state : RuntimeState) (record : ActivityOccurrence)
    (empty : record.messageHandlerOccurrences = [])
    (unambiguous : attachedMessagesUnambiguous state = true) :
    attachedMessagesUnambiguous
      { state with activityOccurrences := insertActivityOccurrence record state.activityOccurrences } =
      true := by
  simp only [attachedMessagesUnambiguous, List.all_eq_true,
    decide_eq_true_eq] at unambiguous ⊢
  intro candidate candidateMem
  rw [insertActivityOccurrence_eq_canonicalInsertBy] at candidateMem
  rcases (mem_canonicalInsertBy activityOccurrenceBefore record candidate
    state.activityOccurrences).mp candidateMem with new | old
  · subst candidate
    simp [empty]
  · intro subscription subscriptionMem
    have prior := unambiguous candidate old subscription subscriptionMem
    rw [insertActivityOccurrence_eq_canonicalInsertBy,
      length_filter_canonicalInsertBy]
    have rejected : subscription ∉ record.messageHandlerOccurrences := by simp [empty]
    simpa [rejected] using prior

theorem filter_canonicalInsertBy_rejected (before : α → α → Bool) (p : α → Bool)
    (value : α) (values : List α) (rejected : p value = false) :
    (canonicalInsertBy before value values).filter p = values.filter p := by
  induction values with
  | nil => simp [canonicalInsertBy, rejected]
  | cons current rest ih =>
      simp only [canonicalInsertBy]
      split <;> cases currentEq : p current <;> simp [rejected, currentEq, ih]

theorem insertUserTaskWait_eq_canonicalInsertBy (wait : UserTaskWait) (waits : List UserTaskWait) :
    insertUserTaskWait wait waits = canonicalInsertBy userTaskWaitBefore wait waits := by
  induction waits with
  | nil => rfl
  | cons current rest ih =>
      simp only [insertUserTaskWait, canonicalInsertBy]
      split <;> simp_all

theorem length_filter_insertUserTaskWait (p : UserTaskWait → Bool) (value : UserTaskWait)
    (values : List UserTaskWait) : ((insertUserTaskWait value values).filter p).length =
      (if p value then 1 else 0) + (values.filter p).length := by
  rw [insertUserTaskWait_eq_canonicalInsertBy]
  exact length_filter_canonicalInsertBy userTaskWaitBefore p value values

theorem length_filter_insertMessageWait (p : MessageWait → Bool) (value : MessageWait)
    (values : List MessageWait) : ((insertMessageWait value values).filter p).length =
      (if p value then 1 else 0) + (values.filter p).length :=
  length_filter_canonicalInsertBy messageWaitBefore p value values

theorem length_filter_insertTimerWait (p : TimerWait → Bool) (value : TimerWait)
    (values : List TimerWait) : ((insertTimerWait value values).filter p).length =
      (if p value then 1 else 0) + (values.filter p).length :=
  length_filter_canonicalInsertBy timerWaitBefore p value values

theorem length_filter_insertEffectWait (p : EffectWait → Bool) (value : EffectWait)
    (values : List EffectWait) : ((insertEffectWait value values).filter p).length =
      (if p value then 1 else 0) + (values.filter p).length :=
  length_filter_canonicalInsertBy effectWaitBefore p value values

/-- A successful monadic list map transfers across an input permutation. -/
theorem mapM_some_of_perm (f : α → Option β) (left right : List α)
    (permutation : left.Perm right)
    (mapped : List β) (rightMapped : right.mapM f = some mapped) :
    ∃ result, left.mapM f = some result ∧ result.Perm mapped := by
  induction permutation generalizing mapped with
  | nil => simp at rightMapped; subst mapped; exact ⟨[], by simp⟩
  | cons value permutation ih =>
      cases valueMapped : f value with
      | none => simp [valueMapped] at rightMapped
      | some mappedValue =>
          simp only [List.mapM_cons, valueMapped] at rightMapped
          obtain ⟨mappedHead, headMapped, mappedTail⟩ :=
            Option.bind_eq_some_iff.mp rightMapped
          simp at headMapped
          subst mappedHead
          obtain ⟨mappedRest, restMapped, mappedEq⟩ :=
            Option.bind_eq_some_iff.mp mappedTail
          simp at mappedEq
          subst mapped
          obtain ⟨result, resultMapped, resultPerm⟩ := ih mappedRest restMapped
          exact ⟨mappedValue :: result, by simp [valueMapped, resultMapped],
            List.Perm.cons mappedValue resultPerm⟩
  | swap left right rest =>
      cases leftMapped : f left with
      | none => simp [leftMapped] at rightMapped
      | some mappedLeft =>
          cases rightValueMapped : f right with
          | none => simp [leftMapped, rightValueMapped] at rightMapped
          | some mappedRight =>
              cases restMapped : rest.mapM f with
              | none => simp [leftMapped, rightValueMapped, restMapped] at rightMapped
              | some mappedRest =>
                  simp [leftMapped, rightValueMapped, restMapped] at rightMapped
                  subst mapped
                  exact ⟨mappedRight :: mappedLeft :: mappedRest,
                    by simp [leftMapped, rightValueMapped, restMapped], List.Perm.swap _ _ _⟩
  | trans leftMiddle middleRight ihLeft ihRight =>
      obtain ⟨middleMapped, middleEq, middlePerm⟩ := ihRight mapped rightMapped
      obtain ⟨result, resultEq, resultPerm⟩ := ihLeft middleMapped middleEq
      exact ⟨result, resultEq, resultPerm.trans middlePerm⟩

/-- Filtering and mapping a canonical insertion adds its mapped value, up to order. -/
theorem filter_mapM_canonicalInsertBy_some (before : α → α → Bool) (p : α → Bool)
    (f : α → Option β) (value : α) (mappedValue : β) (values : List α)
    (mapped : List β) (kept : p value = true) (valueMapped : f value = some mappedValue)
    (valuesMapped : (values.filter p).mapM f = some mapped) :
    ∃ result, ((canonicalInsertBy before value values).filter p).mapM f = some result ∧
      result.Perm (mappedValue :: mapped) := by
  have inputPerm := filter_canonicalInsertBy_perm before p value values kept
  have insertedMapped : (value :: values.filter p).mapM f = some (mappedValue :: mapped) := by
    simp [valueMapped, valuesMapped]
  exact mapM_some_of_perm f _ _ inputPerm (mappedValue :: mapped) insertedMapped

/-- Pointwise equality frames a monadic list projection. -/
theorem mapM_eq_of_pointwise (values : List α) (left right : α → Option β)
    (frame : ∀ value, left value = right value) : values.mapM left = values.mapM right := by
  induction values with
  | nil => rfl
  | cons value rest ih => simp [frame value, ih]

/-- A permutation inserting one component can move that insertion before an unchanged prefix. -/
theorem append_component_insert_perm (front afterComponent beforeComponent suffix : List α)
    (value : α) (component : afterComponent.Perm (value :: beforeComponent)) :
    (front ++ (afterComponent ++ suffix)).Perm
      (value :: (front ++ (beforeComponent ++ suffix))) := by
  induction front with
  | nil => simpa using component.append (List.Perm.refl suffix)
  | cons current rest ih =>
      simpa using (List.Perm.cons current ih).trans (List.Perm.swap value current _)

/-- A positive count names an element that satisfies the predicate. -/
theorem countP_pos_exists {α : Type} (p : α → Bool) (values : List α)
    (positive : 0 < values.countP p) : ∃ value ∈ values, p value = true := by
  induction values with
  | nil => simp at positive
  | cons current rest ih =>
    rw [List.countP_cons] at positive
    by_cases h : p current = true
    · exact ⟨current, List.mem_cons_self, h⟩
    · simp only [Bool.not_eq_true] at h
      simp only [h, Bool.false_eq_true, if_neg, not_false_eq_true, Nat.add_zero] at positive
      obtain ⟨value, mem, hv⟩ := ih positive
      exact ⟨value, List.mem_cons_of_mem _ mem, hv⟩

end BpmnSemantics.SemanticProcess
