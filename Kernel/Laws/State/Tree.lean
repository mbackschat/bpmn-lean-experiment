module

public import Kernel.State.Tree
import all Kernel.State.Tree

/-! # Laws of the kernel state: the scope tree

What `Kernel.State.Tree`'s readers do, read from their bodies; this is the one module that sees them. What the subtree
of a present scope occurrence is in a well-formed state (`subtree_iff`) needs the root's value and is proved in
`Kernel.Laws.State`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- A key lies strictly below a proper tail of itself only. -/
theorem below_length {outer : List ScopeSegment} :
    ∀ {inner : List ScopeSegment}, State.below outer inner = true → outer.length < inner.length
  | [], below => by simp [State.below] at below
  | _ :: rest, below => by
    simp only [State.below, Bool.or_eq_true, beq_iff_eq] at below
    rcases below with rfl | deeper
    · simp
    · have := below_length deeper
      simp; omega

/-- A key lies strictly below its parent's key, and below whatever its parent's key lies below. -/
theorem below_cons (outer rest : List ScopeSegment) (segment : ScopeSegment) :
    State.below outer (segment :: rest) = (rest == outer || State.below outer rest) := by
  simp only [State.below]

/-- No key lies below another as the root's empty key. -/
theorem below_nil (outer : List ScopeSegment) : State.below outer [] = false := by
  simp only [State.below]

/-- `State.inside` holds `scope` and the standing scope occurrences whose keys lie below its key. -/
theorem mem_inside (s : State) (scope x : ScopeOccurrenceId) : x ∈ s.inside scope ↔
    x = scope ∨ ∃ entry ∈ s.scopes, entry.id = x ∧ State.below scope.segments x.segments = true := by
  simp only [State.inside, List.mem_cons, List.mem_map, List.mem_filter]
  constructor
  · rintro (same | ⟨entry, ⟨member, below⟩, named⟩)
    · exact .inl same
    · exact .inr ⟨entry, member, named, named ▸ below⟩
  · rintro (same | ⟨entry, member, rfl, below⟩)
    · exact .inl same
    · exact .inr ⟨entry, ⟨member, below⟩, rfl⟩

/-- `State.subtree` holds `scope` and the standing scope occurrences whose keys lie below its key, under every position
order. -/
theorem mem_subtree (s : State) (le : Issue → Issue → Bool) (scope x : ScopeOccurrenceId) : x ∈ s.subtree le scope ↔
    x = scope ∨ ∃ entry ∈ s.scopes, entry.id = x ∧ State.below scope.segments x.segments = true := by
  simp only [State.subtree, List.mem_cons, List.mem_map, List.mem_mergeSort, List.mem_filter, Prod.exists]
  constructor
  · rintro (same | ⟨_, _, ⟨entry, ⟨member, below⟩, pair⟩, named⟩)
    · exact .inl same
    · simp only [Prod.mk.injEq] at pair
      obtain ⟨_, rfl⟩ := pair
      exact .inr ⟨entry, member, named, named ▸ below⟩
  · rintro (same | ⟨entry, member, rfl, below⟩)
    · exact .inl same
    · exact .inr ⟨_, entry.id, ⟨entry, ⟨member, below⟩, rfl⟩, rfl⟩

/-- `State.subtree` and `State.inside` hold the same scope occurrences. -/
theorem mem_subtree_inside (s : State) (le : Issue → Issue → Bool) (scope x : ScopeOccurrenceId) :
    x ∈ s.subtree le scope ↔ x ∈ s.inside scope := by
  rw [mem_subtree, mem_inside]

/-- A membership test of `State.subtree` is one of `State.inside`. -/
@[simp] theorem subtree_contains (s : State) (le : Issue → Issue → Bool) (scope x : ScopeOccurrenceId) :
    (s.subtree le scope).contains x = (s.inside scope).contains x := by
  rw [Bool.eq_iff_iff, List.contains_iff_mem, List.contains_iff_mem, mem_subtree_inside]

/-- `State.subtree` meets each scope occurrence once. -/
theorem subtree_nodup (s : State) (le : Issue → Issue → Bool) (distinct : (s.scopes.map (·.id)).Nodup)
    (scope : ScopeOccurrenceId) : (s.subtree le scope).Nodup := by
  simp only [State.subtree]
  refine List.nodup_cons.mpr ⟨fun inside => ?_, ?_⟩
  · obtain ⟨_, member, named⟩ := List.mem_map.mp inside
    obtain ⟨entry, filtered, pair⟩ := List.mem_map.mp ((List.mem_mergeSort).mp member)
    have below := (List.mem_filter.mp filtered).2
    subst pair
    have := below_length below
    simp only at named
    rw [← named] at this
    omega
  · refine ((List.mergeSort_perm _ _).map Prod.snd).nodup_iff.mpr ?_
    rw [List.map_map]
    exact (distinct.sublist ((List.filter_sublist).map _))

/-- `State.inside` reads only the scope occurrences. -/
theorem inside_congr {s t : State} (scopes : t.scopes = s.scopes) (scope : ScopeOccurrenceId) :
    t.inside scope = s.inside scope := by
  simp only [State.inside, scopes]

/-- `State.subtree` reads only the scope occurrences. -/
theorem subtree_congr {s t : State} (scopes : t.scopes = s.scopes) (le : Issue → Issue → Bool) (scope : ScopeOccurrenceId) :
    t.subtree le scope = s.subtree le scope := by
  have ranks : ∀ outer inner, t.ranks outer inner = s.ranks outer inner := by
    intro outer inner
    induction inner with
    | nil => simp [State.ranks]
    | cons segment rest ih => simp [State.ranks, ih, scopes]
  simp [State.subtree, ranks, scopes]

end Kernel.Laws.State
