module

public import Kernel.Step.Stale
public import Kernel.Laws.Step.Ran
import all Kernel.Step.Stale

/-! # Laws of the step function: queued work whose target is gone

What `Kernel.Step.Stale` lets the closure meet, read from its bodies: queued work naming a target issued and since
removed, which is inert. Work that names such a target fails the input (`perform_stale`, CIB-LIM-0055); work whose
scope occurrence or occurrence is absent fails it as an invariant failure (`perform_gone`, #121, #151); work that ran
found what it names standing. This is the one module that sees `Kernel.Step.Stale`'s bodies
([module table](../../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)); `Kernel.Laws.Step` composes these
facts with `Step.signalWork`, which names each signal's targets. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-- `Step.stale` restated. -/
theorem stale_eq {state : State} {work : SignalWork} : stale state work =
    (work.scopes.any (fun scope => scopeIssued state scope && !state.scopes.any (·.id == scope)) ||
      work.occurrences.any fun id => occurrenceIssued state id && (state.occurrence? id).isNone) := by
  unfold stale; rfl

/-- What the counters that remain read of a key some history holds: issued (`scopeIssued`), as `stale` reads it of a
key below a removed subtree. -/
theorem scopeIssued_of_issued {state : State} {scope : ScopeOccurrenceId} (issued : Laws.State.ScopeIssued state scope) :
    scopeIssued state scope = true := by
  obtain ⟨H, history, held⟩ := issued
  simp only [scopeIssued]
  suffices up : ∀ segments (scope : ScopeOccurrenceId) (same : scope.segments = segments), H scope →
      scopeIssued.go state segments scope same = true from up _ scope rfl held
  intro segments
  induction segments with
  | nil => intro _ _ _; simp only [scopeIssued.go]
  | cons segment rest ih =>
    intro scope same held
    have parent : ∀ {head tail} (same : scope.segments = head :: tail), scope.up same = .ofSegments tail :=
      fun _ => Laws.State.ScopeOccurrenceId.ext (by simp [Laws.State.ScopeOccurrenceId.ofSegments_segments])
    have keyed : scope = .ofSegments (segment :: rest) :=
      Laws.State.ScopeOccurrenceId.ext (by simp [same, Laws.State.ScopeOccurrenceId.ofSegments_segments])
    rw [keyed] at held
    simp only [scopeIssued.go, parent]
    split
    · rename_i unit index ordinal
      simp [Std.ExtTreeMap.contains_eq_isSome_getElem?, ordinal, history.tabled segment rest unit index held ordinal]
    · rename_i n ordinal
      by_cases stands : state.scopes.any (·.id == .ofSegments rest) = true
      · simp only [stands, ite_true, decide_eq_true_eq]
        exact history.below segment rest n held ordinal (by simpa using stands)
      · simp only [stands, Bool.false_eq_true, ite_false]
        exact ih _ (Laws.State.ScopeOccurrenceId.ofSegments_segments rest) (history.closed segment rest held)

/-- What the counters that remain read of an occurrence key issued (`Laws.State.OccurrenceIssued`): issued
(`occurrenceIssued`), as `stale` reads it. -/
theorem occurrenceIssued_of_issued {state : State} {id : OccurrenceId} (issued : Laws.State.OccurrenceIssued state id) :
    occurrenceIssued state id = true := by
  obtain ⟨scopeIs, -, below, tabled⟩ := issued
  simp only [occurrenceIssued, scopeIssued_of_issued scopeIs, Bool.true_and]
  split
  · rename_i unit index ordinal
    simp [Std.ExtTreeMap.contains_eq_isSome_getElem?, ordinal, tabled unit index ordinal]
  · rename_i n ordinal
    cases standing : state.scopes.any (·.id == id.scope) with
    | false => rfl
    | true =>
      simp only [Bool.not_true, Bool.false_or, decide_eq_true_eq]
      exact below n ordinal (by simpa [Laws.State.standingKeys] using standing)

/-- The designated KD1 change: a committed key below a removed scope occurrence `segment` entered in `⟨outer⟩`, which
stands and counted it, reads as issued whether or not some history holds it, since the counters that would tell went
with the removed subtree; work naming it is stale (`stale_below_removed`), never the invariant failure of a key never
issued. A fresh key is read from the issue table instead (DC12), so the change concerns committed keys alone. -/
theorem scopeIssued_below_removed {state : State} {outer : List ScopeSegment} {segment : ScopeSegment} {n : Nat}
    (stands : state.scopes.any (·.id == .ofSegments outer) = true) (committed : segment.ordinal = .committed n)
    (counted : n < state.scopeOrdinals.getD { parent := .ofSegments outer, element := segment.element } 0)
    (removed : ∀ rest, state.scopes.any (·.id == .ofSegments (rest ++ segment :: outer)) = false) (rest : List ScopeSegment)
    (settled : ∀ inner ∈ rest, ∃ k, inner.ordinal = .committed k) :
    scopeIssued state (.ofSegments (rest ++ segment :: outer)) = true := by
  simp only [scopeIssued]
  suffices down : ∀ rest, (∀ inner ∈ rest, ∃ k, inner.ordinal = .committed k) → ∀ segments (scope : ScopeOccurrenceId)
      (same : scope.segments = segments), segments = rest ++ segment :: outer →
        scopeIssued.go state segments scope same = true from
    down rest settled _ _ rfl (Laws.State.ScopeOccurrenceId.ofSegments_segments _)
  intro rest
  induction rest with
  | nil =>
    intro _ segments scope same keyed
    subst keyed
    have parent : ∀ {head tail} (same : scope.segments = head :: tail), scope.up same = .ofSegments tail :=
      fun _ => Laws.State.ScopeOccurrenceId.ext (by simp [Laws.State.ScopeOccurrenceId.ofSegments_segments])
    simp only [List.nil_append, scopeIssued.go, parent, committed, stands, ite_true, decide_eq_true_eq]
    exact counted
  | cons inner rest ih =>
    intro settled segments scope same keyed
    subst keyed
    have parent : ∀ {head tail} (same : scope.segments = head :: tail), scope.up same = .ofSegments tail :=
      fun _ => Laws.State.ScopeOccurrenceId.ext (by simp [Laws.State.ScopeOccurrenceId.ofSegments_segments])
    obtain ⟨k, innerCommitted⟩ := settled inner (.head _)
    simp only [List.cons_append, scopeIssued.go, parent, innerCommitted, removed rest, Bool.false_eq_true, ite_false]
    exact ih (fun other member => settled other (.tail _ member)) _ _ (Laws.State.ScopeOccurrenceId.ofSegments_segments _) rfl

/-- `Step.gone` restated. -/
theorem gone_eq {state : State} {work : SignalWork} : gone state work =
    if work.requires.any (fun scope => !state.scopes.any (·.id == scope)) then some "queued-work-scope-gone"
    else if work.acts.any (fun id => (state.occurrence? id).isNone) then some "queued-work-occurrence-gone"
    else none := by
  unfold gone; rfl

/-- Committed work named no target that is gone and ran. -/
theorem perform_ok {work : SignalWork} {state after : State} (ran : work.perform state = .ok after) :
    stale state work = false ∧ gone state work = none ∧ work.run state = .ok after := by
  unfold SignalWork.perform at ran
  split at ran
  · simp at ran
  · split at ran
    · simp at ran
    · exact ⟨by simpa using ‹¬stale state work = true›, ‹_›, ran⟩

theorem perform_stale {work : SignalWork} {state : State} (refused : stale state work = true) :
    work.perform state = .error (.unsupported "interrupted-before-wait") := by
  simp [SignalWork.perform, refused]

/-- Work naming a key below a removed scope occurrence that its standing parent counted fails the input as stale
(`scopeIssued_below_removed`). -/
theorem stale_below_removed {work : SignalWork} {state : State} {outer rest : List ScopeSegment} {segment : ScopeSegment}
    {n : Nat} (stands : state.scopes.any (·.id == (.ofSegments outer)) = true) (committed : segment.ordinal = .committed n)
    (counted : n < state.scopeOrdinals.getD { parent := (.ofSegments outer), element := segment.element } 0)
    (removed : ∀ rest, state.scopes.any (·.id == (.ofSegments (rest ++ segment :: outer))) = false)
    (settled : ∀ inner ∈ rest, ∃ k, inner.ordinal = .committed k)
    (named : (.ofSegments (rest ++ segment :: outer)) ∈ work.scopes) :
    work.perform state = .error (.unsupported "interrupted-before-wait") := by
  apply perform_stale
  rw [stale_eq, Bool.or_eq_true, List.any_eq_true]
  exact .inl ⟨_, named, by simp [scopeIssued_below_removed stands committed counted removed rest settled, removed rest]⟩

/-- K0.7's designated change: an occurrence key issued in a scope occurrence below a removed one that its standing
parent counted reads as issued whatever its committed ordinal, even one never issued, since the counter that would tell went
with the removed subtree; work naming it while it is absent fails the input as stale, never as the invariant failure
of a key never issued (`queued-work-occurrence-gone`). -/
theorem stale_occurrence_below_removed {work : SignalWork} {state : State} {outer rest : List ScopeSegment}
    {segment : ScopeSegment} {id : OccurrenceId} {n : Nat}
    (stands : state.scopes.any (·.id == (.ofSegments outer)) = true) (committed : segment.ordinal = .committed n)
    (counted : n < state.scopeOrdinals.getD { parent := (.ofSegments outer), element := segment.element } 0)
    (removed : ∀ rest, state.scopes.any (·.id == (.ofSegments (rest ++ segment :: outer))) = false)
    (settled : ∀ inner ∈ rest, ∃ k, inner.ordinal = .committed k) (ordinal : ∃ k, id.ordinal = .committed k)
    (issuing : id.scope = (.ofSegments (rest ++ segment :: outer))) (absent : state.occurrence? id = none)
    (named : id ∈ work.occurrences) :
    work.perform state = .error (.unsupported "interrupted-before-wait") := by
  apply perform_stale
  rw [stale_eq, Bool.or_eq_true, List.any_eq_true, List.any_eq_true]
  refine .inr ⟨id, named, ?_⟩
  obtain ⟨k, ordinal⟩ := ordinal
  simp [occurrenceIssued, issuing, ordinal, scopeIssued_below_removed stands committed counted removed rest settled,
    removed rest, absent]

theorem perform_gone {work : SignalWork} {state : State} {code : String} (fresh : stale state work = false)
    (absent : gone state work = some code) : work.perform state = .error (.semanticFailure .invariant code) := by
  simp [SignalWork.perform, fresh, absent]

/-- Work that does something in, or acts from, a scope occurrence that was issued and is gone fails the input, as
interrupted before its wait (`perform_stale`) or as an invariant failure (`perform_gone`), whatever its hooks would do
there: no write reaches the instance root or leaves a variable set for a removed scope occurrence (#121). -/
theorem perform_absent {work : SignalWork} {state : State} {scope : ScopeOccurrenceId}
    (names : scope ∈ work.scopes ∨ scope ∈ work.requires) (issued : Laws.State.ScopeIssued state scope)
    (absent : ∀ entry ∈ state.scopes, entry.id ≠ scope) :
    work.perform state = .error (.unsupported "interrupted-before-wait") ∨
      work.perform state = .error (.semanticFailure .invariant "queued-work-scope-gone") := by
  have none : state.scopes.any (·.id == scope) = false :=
    List.any_eq_false.mpr fun entry member same => absent entry member (by simpa using same)
  cases fresh : stale state work with
  | true => exact .inl (perform_stale fresh)
  | false =>
    refine .inr (perform_gone fresh ?_)
    rcases names with named | named
    · have refused : stale state work = true := by
        unfold stale
        simp only [Bool.or_eq_true, List.any_eq_true]
        exact .inl ⟨scope, named, by simp [scopeIssued_of_issued issued, none]⟩
      simp [refused] at fresh
    · have scopeGone : work.requires.any (fun scope => !state.scopes.any (·.id == scope)) = true :=
        List.any_eq_true.mpr ⟨scope, named, by simp [none]⟩
      simp [gone, scopeGone]

/-! ## What work that ran found standing -/

theorem requireScope_stands {state : State} {scope : ScopeOccurrenceId} {done : Unit}
    (ran : requireScope state scope = .ok done) : ScopeStands state scope := by
  unfold requireScope at ran
  split at ran
  · rename_i present
    obtain ⟨entry, member, same⟩ := List.any_eq_true.mp present
    exact ⟨entry, member, by simpa using same⟩
  · simp at ran

theorem scope_of_fresh {state : State} {work : SignalWork} {scope : ScopeOccurrenceId}
    (fresh : stale state work = false) (named : scope ∈ work.scopes) (issued : Laws.State.ScopeIssued state scope) :
    ScopeStands state scope := by
  cases present : state.scopes.any (·.id == scope) with
  | true =>
    obtain ⟨entry, member, same⟩ := List.any_eq_true.mp present
    exact ⟨entry, member, by simpa using same⟩
  | false =>
    have refused : stale state work = true := by
      unfold stale
      simp only [Bool.or_eq_true, List.any_eq_true]
      exact .inl ⟨scope, named, by simp [scopeIssued_of_issued issued, present]⟩
    simp [refused] at fresh

theorem occurrence_of_fresh {state : State} {work : SignalWork} {id : OccurrenceId}
    (fresh : stale state work = false) (named : id ∈ work.occurrences) (issued : Laws.State.OccurrenceIssued state id) :
    ∃ occurrence, state.occurrence? id = some occurrence := by
  cases found : state.occurrence? id with
  | none =>
    have refused : stale state work = true := by
      unfold stale
      simp only [Bool.or_eq_true, List.any_eq_true]
      exact .inr ⟨id, named, by simp [occurrenceIssued_of_issued issued, found]⟩
    simp [refused] at fresh
  | some occurrence => exact ⟨occurrence, rfl⟩

theorem scope_of_present {state : State} {work : SignalWork} {scope : ScopeOccurrenceId}
    (present : gone state work = none) (named : scope ∈ work.requires) : ScopeStands state scope := by
  cases standing : state.scopes.any (·.id == scope) with
  | true =>
    obtain ⟨entry, member, same⟩ := List.any_eq_true.mp standing
    exact ⟨entry, member, by simpa using same⟩
  | false =>
    have scopeGone : work.requires.any (fun scope => !state.scopes.any (·.id == scope)) = true :=
      List.any_eq_true.mpr ⟨scope, named, by simp [standing]⟩
    simp [gone, scopeGone] at present

end Kernel.Laws.Step
