module

public import Kernel.Laws.State.Removal

/-! # Laws of the kernel state: what entering, clearing and leaving give

The consequences of the entering, clearing and leaving equations (`enterScope_eq`,
`clearInside_eq`, `leaveScope_eq`, `leaveScope_slots_eq`) that the laws above read, stated over those equations without
opening `Kernel.State`'s bodies, so `Kernel.Laws.State` keeps only what needs them. Every module that read
`Kernel.Laws.State` reads it through this one. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

variable {le : Issue → Issue → Bool}

open Kernel

/-- A scope occurrence with a child is busy (`State.busyScopes`). -/
theorem busyScopes_parent (state : State) (child : ScopeOccurrence) (member : child ∈ state.scopes)
    (parent : ScopeOccurrenceId) (linked : child.parent = some parent) : parent ∈ state.busyScopes := by
  rw [busyScopes_eq]
  simp only [List.mem_append]
  exact .inl (.inr (List.mem_filterMap.mpr ⟨child, member, linked⟩))

/-! ## Clearing and leaving -/

/-- Clearing a scope occurrence keeps the instance identity. -/
theorem clearInside_instanceId (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    (s.clearInside le scope keep).instanceId = s.instanceId := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]

/-- Clearing a scope occurrence queues and drops no signal, whatever it clears. -/
theorem clearInside_signals (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    (s.clearInside le scope keep).batchSignals = s.batchSignals := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]

theorem allSignals_clearInside (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    allSignals (s.clearInside le scope keep) = allSignals s := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]
  rfl

/-- Clearing a scope occurrence only drops tokens, whatever it clears. -/
theorem clearInside_tokens (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    (s.clearInside le scope keep).batchTokens.Sublist s.batchTokens := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]
  exact List.filter_sublist

theorem allQueuedTokens_clearInside (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    (allQueuedTokens (s.clearInside le scope keep)).Sublist (allQueuedTokens s) := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]
  simp only [allQueuedTokens, Std.ExtTreeMap.toList_filter]
  exact ((List.filter_sublist).map _).append List.filter_sublist

/-- Clearing drops scope occurrences and takes no position, whatever it clears. -/
theorem clearInside_shrinks (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    (s.clearInside le scope keep).scopes.Sublist s.scopes ∧ (s.clearInside le scope keep).nextCompletion = s.nextCompletion := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]
  refine ⟨?_, rfl⟩
  simp only [scopes_eq, scopeList_filter_val]
  exact List.filter_sublist

/-- Clearing a scope occurrence drops the compensation records retained strictly inside it and the runs inside it, its
own included, and keeps the others in order. -/
theorem clearInside_compensation (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    (s.clearInside le scope keep).slots.compensation =
      { retained := s.slots.compensation.retained.filter (!((s.subtree le scope).filter (· != scope)).contains ·.scope)
        runs := s.slots.compensation.runs.filter (!(s.subtree le scope).contains ·.scope) } := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]

/-- Leaving a scope occurrence keeps the slots its clearing leaves but the retained compensation records. -/
theorem leaveScope_slots (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope le scope).slots.parked = (s.clearInside le scope).slots.parked ∧
      (s.leaveScope le scope).slots.multiInstances = (s.clearInside le scope).slots.multiInstances ∧
      (s.leaveScope le scope).slots.compensation.runs = (s.clearInside le scope).slots.compensation.runs := by
  rw [leaveScope_slots_eq]
  exact ⟨rfl, rfl, rfl⟩

/-- Leaving a scope occurrence keeps only instance entries the state had, and none rooted at it, so a completed called
instance leaves no entry behind (DC24, #169). -/
theorem leaveScope_instances (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope le scope).slots.instances.Sublist s.slots.instances ∧
      ∀ entry ∈ (s.leaveScope le scope).slots.instances, entry.root ≠ scope := by
  obtain ⟨_, made⟩ := clearInside_eq s scope []
  rw [leaveScope_slots_eq, made]
  refine ⟨List.filter_sublist.trans List.filter_sublist, fun entry member => ?_⟩
  simpa using (List.mem_filter.mp member).2

/-- Leaving a scope occurrence keeps a sublist of the occurrences. -/
theorem leaveScope_occurrences (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope le scope).occurrences.Sublist s.occurrences := by
  rw [(leaveScope_eq s scope).1]
  obtain ⟨_, made⟩ := clearInside_eq s scope []
  rw [made, occurrences_eq]
  exact occurrenceList_filter_val_sublist _ _

theorem leaveScope_signals (s : State) (scope : ScopeOccurrenceId) : (s.leaveScope le scope).batchSignals = s.batchSignals := by
  rw [(leaveScope_eq s scope).1]
  exact clearInside_signals s scope []

theorem allSignals_leaveScope (s : State) (scope : ScopeOccurrenceId) :
    allSignals (s.leaveScope le scope) = allSignals s := by
  rw [(leaveScope_eq s scope).1]
  exact allSignals_clearInside s scope []

/-- Leaving a scope occurrence removes it and the scope occurrences below it, with the records they retain and the runs
in its subtree, and keeps the counters: what a compensation run's release changes, read without a well-formed state. -/
theorem leaveScope_compensation (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope le scope).slots.compensation.retained =
      (s.slots.compensation.retained.filter fun record =>
        !((s.subtree le scope).filter (· != scope)).contains record.scope).filter (·.scope != scope) ∧
    (s.leaveScope le scope).slots.compensation.runs = s.slots.compensation.runs.filter (!(s.subtree le scope).contains ·.scope) ∧
    (s.leaveScope le scope).scopes = (s.scopes.filter fun entry =>
      !((s.subtree le scope).filter (· != scope)).contains entry.id).filter (·.id != scope) ∧
    (s.leaveScope le scope).activations = s.activations ∧ (s.leaveScope le scope).nextCompletion = s.nextCompletion := by
  obtain ⟨_, made⟩ := clearInside_eq s scope []
  rw [leaveScope_slots_eq, (leaveScope_eq s scope).1, made]
  exact ⟨rfl, rfl, by simp only [scopes_eq, scopeList_filter_val], rfl, rfl⟩

/-! ## The elements a scope occurrence declares -/

/-- The elements a scope occurrence declares (`State.childrenOf`) are a called process's children or the children of
an element of the program. -/
theorem childrenOf_mem {s : State} {program : Program} {scope : ScopeOccurrenceId} {child : Element}
    (member : child ∈ s.childrenOf program scope) :
    (∃ process ∈ program.processes, child ∈ program.processChildren process) ∨ ∃ parent, child ∈ program.children parent := by
  rw [childrenOf_eq] at member
  split at member
  · rename_i _ definition _ _
    cases found : program.processes.find? (·.definition == definition) with
    | none => simp [found] at member
    | some process =>
      rw [found] at member
      exact .inl ⟨process, List.mem_of_find?_eq_some found, member⟩
  · exact .inr ⟨_, member⟩

/-- The elements a scope occurrence declares (`State.childrenOf`): for a called root whose first instance entry binds a
definition, the top level of the first process of that definition, else the children of its first entry's element. -/
theorem childrenOf_cases {s : State} {program : Program} {scope : ScopeOccurrenceId} {child : Element}
    (member : child ∈ s.childrenOf program scope) :
    (∃ entry, s.scopes.find? (·.id == scope) = some entry ∧ entry.calledInstance.isSome ∧
      ∃ bound, s.slots.instances.find? (·.root == scope) = some bound ∧ ∃ definition, bound.definition = some definition ∧
        ∃ process, program.processes.find? (·.definition == definition) = some process ∧
          child ∈ program.processChildren process) ∨
      (∀ entry, s.scopes.find? (·.id == scope) = some entry → entry.calledInstance.isSome →
        ∀ bound, s.slots.instances.find? (·.root == scope) = some bound → bound.definition = none) ∧
      child ∈ program.children ((s.scopes.find? (·.id == scope)).bind (·.element)) := by
  rw [childrenOf_eq] at member
  split at member
  · rename_i _ definition called defined
    obtain ⟨entry, found, named⟩ := Option.bind_eq_some_iff.mp called
    obtain ⟨bound, boundFound, binds⟩ := Option.bind_eq_some_iff.mp defined
    cases processOf : program.processes.find? (·.definition == definition) with
    | none => simp [processOf] at member
    | some process =>
      rw [processOf] at member
      exact .inl ⟨entry, found, by simp [named], bound, boundFound, definition, binds, process, processOf, member⟩
  · rename_i unbound
    refine .inr ⟨fun entry found called bound boundFound => ?_, member⟩
    obtain ⟨name, named⟩ := Option.isSome_iff_exists.mp called
    cases defined : bound.definition with
    | none => rfl
    | some definition => exact (unbound name definition (by simp [found, named]) (by simp [boundFound, defined])).elim

end Kernel.Laws.State
