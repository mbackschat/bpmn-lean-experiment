module

public import Kernel.Laws.State

/-! # Laws of the kernel state: what clearing and leaving a scope occurrence give

The consequences of the clearing and leaving equations (`Laws.State.clearInside_eq`, `leaveScope_eq`,
`leaveScope_slots_eq`) that the laws above read, stated over those equations without opening `Kernel.State`'s bodies,
so `Kernel.Laws.State` keeps only what needs them. Every module that read `Kernel.Laws.State` reads it through this
one. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- Clearing a scope occurrence keeps the instance identity. -/
theorem clearInside_instanceId (s : State) (scope : ScopeOccurrenceId) (keep : List Nat) :
    (s.clearInside scope keep).instanceId = s.instanceId := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]

/-- Clearing a scope occurrence queues and drops no signal, whatever it clears. -/
theorem clearInside_signals (s : State) (scope : ScopeOccurrenceId) (keep : List Nat) :
    (s.clearInside scope keep).signals = s.signals := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]

/-- Clearing a scope occurrence only drops tokens, whatever it clears. -/
theorem clearInside_tokens (s : State) (scope : ScopeOccurrenceId) (keep : List Nat) :
    (s.clearInside scope keep).tokens.Sublist s.tokens := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]
  exact List.filter_sublist

/-- Clearing drops scope occurrences and issues no identity, whatever it clears. -/
theorem clearInside_shrinks (s : State) (scope : ScopeOccurrenceId) (keep : List Nat) :
    (s.clearInside scope keep).scopes.Sublist s.scopes ∧ (s.clearInside scope keep).nextIssue = s.nextIssue := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]
  exact ⟨List.filter_sublist, rfl⟩

/-- Clearing a scope occurrence drops the compensation records retained strictly inside it and the runs inside it, its
own included, and keeps the others in order. -/
theorem clearInside_compensation (s : State) (scope : ScopeOccurrenceId) (keep : List Nat) :
    (s.clearInside scope keep).slots.compensation =
      { retained := s.slots.compensation.retained.filter (!((s.subtree scope).filter (· != scope)).contains ·.scope)
        runs := s.slots.compensation.runs.filter (!(s.subtree scope).contains ·.scope) } := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]

/-- Leaving a scope occurrence keeps the slots its clearing leaves but the retained compensation records. -/
theorem leaveScope_slots (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope scope).slots.parked = (s.clearInside scope).slots.parked ∧
      (s.leaveScope scope).slots.multiInstances = (s.clearInside scope).slots.multiInstances ∧
      (s.leaveScope scope).slots.compensation.runs = (s.clearInside scope).slots.compensation.runs := by
  rw [leaveScope_slots_eq]
  exact ⟨rfl, rfl, rfl⟩

theorem leaveScope_signals (s : State) (scope : ScopeOccurrenceId) : (s.leaveScope scope).signals = s.signals := by
  rw [(leaveScope_eq s scope).1]
  exact clearInside_signals s scope []

/-- Leaving a scope occurrence removes it and the scope occurrences below it, with the records they retain and the runs
in its subtree, and keeps the counters: what a compensation run's release changes, read without a well-formed state. -/
theorem leaveScope_compensation (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope scope).slots.compensation.retained =
      (s.slots.compensation.retained.filter fun record =>
        !((s.subtree scope).filter (· != scope)).contains record.scope).filter (·.scope != scope) ∧
    (s.leaveScope scope).slots.compensation.runs = s.slots.compensation.runs.filter (!(s.subtree scope).contains ·.scope) ∧
    (s.leaveScope scope).scopes = (s.scopes.filter fun entry =>
      !((s.subtree scope).filter (· != scope)).contains entry.id).filter (·.id != scope) ∧
    (s.leaveScope scope).activations = s.activations ∧ (s.leaveScope scope).nextIssue = s.nextIssue := by
  obtain ⟨_, made⟩ := clearInside_eq s scope []
  rw [leaveScope_slots_eq, (leaveScope_eq s scope).1, made]
  exact ⟨rfl, rfl, rfl, rfl, rfl⟩

end Kernel.Laws.State
