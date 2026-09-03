import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Withdrawal finality for wait identities

This module owns the laws that make a wait withdrawal final: under the uniqueness conjunct of
`runtimeStateWellFormed`, erasing the wait that holds an occurrence key leaves no wait a later
lookup could find.

That is the fact the boundary-Timer stale-identity obligation was deferred on. Refuting a late
firing after a victory needs more than "the winner erased its own wait": without uniqueness a second
wait could carry the same `(instance, element, activation)` key, so the erase would remove one and a
later lookup would still succeed. The finite witnesses in the conformance modules could not see that,
because one concrete state never holds the duplicate.

The laws are stated over `List.erase` rather than over any one victory, so every arm that withdraws a
wait by erasing it inherits them instead of restating the argument.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The one law the family results below specialize.

Both hypotheses are load-bearing. Without `member` the filter's single selected element could be some
other value sharing the key, and a surviving match would be legitimate. Without cardinality one a
duplicate could survive `List.erase`, which removes a single occurrence. The induction is written out
because neither this repository nor the core library carries a `List.filter`/`List.erase` commutation
lemma, and no Mathlib is available. -/
private theorem key_absent_after_erase {α : Type} [DecidableEq α]
    (key : α → α → Bool) : ∀ (values : List α) (value : α),
    key value value = true →
    value ∈ values →
    (values.filter (key value)).length = 1 →
    ∀ candidate ∈ values.erase value, key value candidate = false
  | [], _, _, member, _, _, _ => absurd member (by simp)
  | head :: tail, value, reflexive, member, counted, candidate, remaining => by
      by_cases sameHead : head = value
      · -- The erased element is this one, so what remains is `tail` and the single selection was
        -- already spent on `head`.
        subst sameHead
        rw [List.filter_cons_of_pos reflexive] at counted
        have emptyTail : tail.filter (key head) = [] := by
          have zero : (tail.filter (key head)).length = 0 := by simpa using counted
          exact List.eq_nil_of_length_eq_zero zero
        have inTail : candidate ∈ tail := by simpa using remaining
        cases matched : key head candidate with
        | false => rfl
        | true =>
            have selected : candidate ∈ tail.filter (key head) := by
              simp [List.mem_filter, inTail, matched]
            simp [emptyTail] at selected
      · -- The erased element is further down, so `head` cannot share the key: `value` already
        -- contributes the one selection from the tail.
        have inTail : value ∈ tail := by
          cases List.mem_cons.mp member with
          | inl headEq => exact absurd headEq.symm sameHead
          | inr rest => exact rest
        have tailSelects : value ∈ tail.filter (key value) := by
          simp [List.mem_filter, inTail, reflexive]
        have headUnselected : key value head = false := by
          cases selectsHead : key value head with
          | false => rfl
          | true =>
              rw [List.filter_cons_of_pos selectsHead] at counted
              have zero : (tail.filter (key value)).length = 0 := by simpa using counted
              have empty : tail.filter (key value) = [] := List.eq_nil_of_length_eq_zero zero
              simp [empty] at tailSelects
        have tailCounted : (tail.filter (key value)).length = 1 := by
          rw [List.filter_cons_of_neg (by simp [headUnselected])] at counted
          exact counted
        have eraseCons : (head :: tail).erase value = head :: tail.erase value := by
          simp [sameHead]
        rw [eraseCons] at remaining
        cases List.mem_cons.mp remaining with
        | inl headEq => rw [headEq]; exact headUnselected
        | inr rest =>
            exact key_absent_after_erase key tail value reflexive inTail tailCounted candidate rest

private theorem occursOnce_counted {α : Type} [DecidableEq α]
    (key : α → α → Bool) (values : List α) (value : α)
    (unique : occursOnce key values value = true) :
    (values.filter (key value)).length = 1 := by
  simpa [occursOnce] using unique

theorem timerWaitKeyMatches_refl (wait : TimerWait) : timerWaitKeyMatches wait wait = true := by
  simp [timerWaitKeyMatches]

theorem userTaskWaitKeyMatches_refl (wait : UserTaskWait) :
    userTaskWaitKeyMatches wait wait = true := by
  simp [userTaskWaitKeyMatches]

/-- `TIMER-WITHDRAWAL-01`. Erasing a live Timer wait from a state whose wait identities are unique
leaves no Timer wait carrying that deadline's occurrence key.

This is the quantified form of the stale-firing refusal that the boundary-Timer families previously
carried only as finite witnesses: it holds for every state and every erased wait, not for one
scenario, and a wrong withdrawal that removed some other wait fails it. -/
theorem timer_key_absent_after_withdrawal (state : RuntimeState) (wait candidate : TimerWait)
    (unique : waitIdentitiesUnique state = true)
    (live : wait ∈ state.timerWaits)
    (remaining : candidate ∈ state.timerWaits.erase wait) :
    timerWaitKeyMatches wait candidate = false := by
  have occurs : occursOnce timerWaitKeyMatches state.timerWaits wait = true := by
    simp [waitIdentitiesUnique] at unique
    exact unique.1.2 wait live
  exact key_absent_after_erase timerWaitKeyMatches state.timerWaits wait
    (timerWaitKeyMatches_refl wait) live (occursOnce_counted _ _ _ occurs) candidate remaining

/-- The same law for User Task waits, which the bounded-task arm withdraws in the same transition.
Its stale completion is refused for the same reason its sibling deadline cannot fire. -/
theorem userTask_key_absent_after_withdrawal (state : RuntimeState)
    (wait candidate : UserTaskWait)
    (unique : waitIdentitiesUnique state = true)
    (live : wait ∈ state.waits)
    (remaining : candidate ∈ state.waits.erase wait) :
    userTaskWaitKeyMatches wait candidate = false := by
  have occurs : occursOnce userTaskWaitKeyMatches state.waits wait = true := by
    simp [waitIdentitiesUnique] at unique
    exact unique.1.1.1 wait live
  exact key_absent_after_erase userTaskWaitKeyMatches state.waits wait
    (userTaskWaitKeyMatches_refl wait) live (occursOnce_counted _ _ _ occurs) candidate remaining

end BpmnSemantics.SemanticProcess
