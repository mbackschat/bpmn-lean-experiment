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
    (work.scopes.any (fun scope => scope.value < state.nextIssue && !state.scopes.any (·.id == scope)) ||
      work.occurrences.any fun id => id < state.nextIssue && (state.occurrence? id).isNone) := by
  unfold stale; rfl

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

theorem perform_gone {work : SignalWork} {state : State} {code : String} (fresh : stale state work = false)
    (absent : gone state work = some code) : work.perform state = .error (.semanticFailure .invariant code) := by
  simp [SignalWork.perform, fresh, absent]

/-- Work that does something in, or acts from, a scope occurrence that was issued and is gone fails the input, as
interrupted before its wait (`perform_stale`) or as an invariant failure (`perform_gone`), whatever its hooks would do
there: no write reaches the instance root or leaves a variable set for a removed scope occurrence (#121). -/
theorem perform_absent {work : SignalWork} {state : State} {scope : ScopeOccurrenceId}
    (names : scope ∈ work.scopes ∨ scope ∈ work.requires) (issued : scope.value < state.nextIssue)
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
        exact .inl ⟨scope, named, by simp [issued, none]⟩
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
    (fresh : stale state work = false) (named : scope ∈ work.scopes) (issued : scope.value < state.nextIssue) :
    ScopeStands state scope := by
  cases present : state.scopes.any (·.id == scope) with
  | true =>
    obtain ⟨entry, member, same⟩ := List.any_eq_true.mp present
    exact ⟨entry, member, by simpa using same⟩
  | false =>
    have refused : stale state work = true := by
      unfold stale
      simp only [Bool.or_eq_true, List.any_eq_true]
      exact .inl ⟨scope, named, by simp [issued, present]⟩
    simp [refused] at fresh

theorem occurrence_of_fresh {state : State} {work : SignalWork} {id : Nat}
    (fresh : stale state work = false) (named : id ∈ work.occurrences) (issued : id < state.nextIssue) :
    ∃ occurrence, state.occurrence? id = some occurrence := by
  cases found : state.occurrence? id with
  | none =>
    have refused : stale state work = true := by
      unfold stale
      simp only [Bool.or_eq_true, List.any_eq_true]
      exact .inr ⟨id, named, by simp [issued, found]⟩
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
