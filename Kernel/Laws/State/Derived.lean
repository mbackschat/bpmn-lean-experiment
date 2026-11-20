module

public import Kernel.Laws.State.Removal

/-! # Laws of the kernel state: what keying, clearing and leaving give

The consequences of the keying, entering, clearing and leaving equations (`Laws.State.keyed_eq`, `enterScope_eq`,
`clearInside_eq`, `leaveScope_eq`, `leaveScope_slots_eq`) that the laws above read, stated over those equations without
opening `Kernel.State`'s bodies, so `Kernel.Laws.State` keeps only what needs them. Every module that read
`Kernel.Laws.State` reads it through this one. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## Keyed variable sets -/

/-- `keyed` binds each name at most once, whatever bindings it was given. -/
theorem keyed_names (bindings : List (String × Value)) : ((keyed bindings).map (·.1)).Nodup := by
  induction bindings with
  | nil => simp [keyed_eq.1]
  | cons binding rest held =>
    rw [keyed_eq.2]
    split
    · exact held
    · rename_i absent
      refine List.nodup_cons.mpr ⟨fun member => absent ?_, held⟩
      obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
      exact List.any_eq_true.mpr ⟨entry, inside, beq_iff_eq.mpr named⟩

/-- `keyed` keeps a binding whose name no later binding repeats. -/
theorem mem_keyed {binding : String × Value} (earlier : List (String × Value)) {later : List (String × Value)}
    (last : ∀ other ∈ later, other.1 ≠ binding.1) : binding ∈ keyed (earlier ++ binding :: later) := by
  induction earlier with
  | nil =>
    rw [List.nil_append, keyed_eq.2]
    split
    · rename_i repeated
      obtain ⟨other, inside, named⟩ := List.any_eq_true.mp repeated
      exact absurd (beq_iff_eq.mp named) (last other (keyed_sublist later |>.subset inside))
    · exact List.mem_cons_self ..
  | cons first rest held =>
    rw [List.cons_append, keyed_eq.2]
    split
    · exact held
    · exact List.mem_cons_of_mem _ held
where
  keyed_sublist : ∀ bindings : List (String × Value), (keyed bindings).Sublist bindings
    | [] => by simp [keyed_eq.1]
    | binding :: rest => by
      rw [keyed_eq.2]
      split
      · exact (keyed_sublist rest).cons binding
      · exact (keyed_sublist rest).cons_cons binding

/-- `keyed` keeps bindings whose names are already distinct as they are. -/
theorem keyed_of_nodup : ∀ {bindings : List (String × Value)}, (bindings.map (·.1)).Nodup → keyed bindings = bindings
  | [], _ => keyed_eq.1
  | binding :: rest, distinct => by
    obtain ⟨absent, restDistinct⟩ := List.nodup_cons.mp distinct
    rw [keyed_eq.2, keyed_of_nodup restDistinct]
    split
    · rename_i repeated
      obtain ⟨other, inside, named⟩ := List.any_eq_true.mp repeated
      exact absurd (List.mem_map.mpr ⟨other, inside, beq_iff_eq.mp named⟩) absent
    · rfl

/-- The variable set a new scope occurrence installs binds each name at most once, whatever locals it was given (#147). -/
theorem enterScope_names (state : State) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) (occurrence : Option OccurrenceId)
    (names : ∀ vars ∈ state.variables, (vars.entries.map (·.1)).Nodup) :
    ∀ vars ∈ (state.enterScope element parent locals occurrence).1.variables, (vars.entries.map (·.1)).Nodup := by
  intro vars member
  rw [enterScope_eq] at member
  simp only [List.mem_append, List.mem_singleton] at member
  rcases member with old | fresh
  · exact names vars old
  · subst fresh
    exact keyed_names locals

/-- A scope occurrence with a child is busy (`State.busyScopes`). -/
theorem busyScopes_parent (state : State) (child : ScopeOccurrence) (member : child ∈ state.scopes)
    (parent : ScopeOccurrenceId) (linked : child.parent = some parent) : parent ∈ state.busyScopes := by
  rw [busyScopes_eq]
  simp only [List.mem_append]
  exact .inl (.inr (List.mem_filterMap.mpr ⟨child, member, linked⟩))

/-! ## Clearing and leaving -/

/-- Clearing a scope occurrence keeps the instance identity. -/
theorem clearInside_instanceId (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    (s.clearInside scope keep).instanceId = s.instanceId := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]

/-- Clearing a scope occurrence queues and drops no signal, whatever it clears. -/
theorem clearInside_signals (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    (s.clearInside scope keep).signals = s.signals := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]

theorem allSignals_clearInside (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    allSignals (s.clearInside scope keep) = allSignals s := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]
  rfl

/-- Clearing a scope occurrence only drops tokens, whatever it clears. -/
theorem clearInside_tokens (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    (s.clearInside scope keep).tokens.Sublist s.tokens := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]
  exact List.filter_sublist

theorem allQueuedTokens_clearInside (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    (allQueuedTokens (s.clearInside scope keep)).Sublist (allQueuedTokens s) := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]
  simp only [allQueuedTokens, Std.ExtTreeMap.toList_filter]
  exact ((List.filter_sublist).map _).append List.filter_sublist

/-- Clearing drops scope occurrences and takes no position, whatever it clears. -/
theorem clearInside_shrinks (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
    (s.clearInside scope keep).scopes.Sublist s.scopes ∧ (s.clearInside scope keep).nextPosition = s.nextPosition := by
  obtain ⟨_, made⟩ := clearInside_eq s scope keep
  rw [made]
  exact ⟨List.filter_sublist, rfl⟩

/-- Clearing a scope occurrence drops the compensation records retained strictly inside it and the runs inside it, its
own included, and keeps the others in order. -/
theorem clearInside_compensation (s : State) (scope : ScopeOccurrenceId) (keep : List OccurrenceId) :
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

/-- Leaving a scope occurrence keeps only instance entries the state had, and none rooted at it, so a completed called
instance leaves no entry behind (DC24, #169). -/
theorem leaveScope_instances (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope scope).slots.instances.Sublist s.slots.instances ∧
      ∀ entry ∈ (s.leaveScope scope).slots.instances, entry.root ≠ scope := by
  obtain ⟨_, made⟩ := clearInside_eq s scope []
  rw [leaveScope_slots_eq, made]
  refine ⟨List.filter_sublist.trans List.filter_sublist, fun entry member => ?_⟩
  simpa using (List.mem_filter.mp member).2

/-- Leaving a scope occurrence keeps a sublist of the occurrences. -/
theorem leaveScope_occurrences (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope scope).occurrences.Sublist s.occurrences := by
  rw [(leaveScope_eq s scope).1]
  obtain ⟨_, made⟩ := clearInside_eq s scope []
  rw [made]
  exact List.filter_sublist

theorem leaveScope_signals (s : State) (scope : ScopeOccurrenceId) : (s.leaveScope scope).signals = s.signals := by
  rw [(leaveScope_eq s scope).1]
  exact clearInside_signals s scope []

theorem allSignals_leaveScope (s : State) (scope : ScopeOccurrenceId) :
    allSignals (s.leaveScope scope) = allSignals s := by
  rw [(leaveScope_eq s scope).1]
  exact allSignals_clearInside s scope []

/-- Leaving a scope occurrence removes it and the scope occurrences below it, with the records they retain and the runs
in its subtree, and keeps the counters: what a compensation run's release changes, read without a well-formed state. -/
theorem leaveScope_compensation (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope scope).slots.compensation.retained =
      (s.slots.compensation.retained.filter fun record =>
        !((s.subtree scope).filter (· != scope)).contains record.scope).filter (·.scope != scope) ∧
    (s.leaveScope scope).slots.compensation.runs = s.slots.compensation.runs.filter (!(s.subtree scope).contains ·.scope) ∧
    (s.leaveScope scope).scopes = (s.scopes.filter fun entry =>
      !((s.subtree scope).filter (· != scope)).contains entry.id).filter (·.id != scope) ∧
    (s.leaveScope scope).activations = s.activations ∧ (s.leaveScope scope).nextPosition = s.nextPosition := by
  obtain ⟨_, made⟩ := clearInside_eq s scope []
  rw [leaveScope_slots_eq, (leaveScope_eq s scope).1, made]
  exact ⟨rfl, rfl, rfl, rfl, rfl⟩

end Kernel.Laws.State
