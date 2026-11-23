module

public import Kernel.Laws.State.Tree
public import Kernel.Laws.State.Transitions

/-! # Laws of the kernel state: the subtree of a scope occurrence

In a well-formed state a standing scope occurrence's parent stands, and the subtree `State.subtree` walks from a
present scope occurrence is exactly what lies within it (`Within`). `Kernel.Laws.State` imports this module; nothing
executable does.
-/

@[expose] public section

namespace Kernel.Laws.State

variable {le : Issue → Issue → Bool}

open Kernel

variable {program : Program}

/-- What lies within the root is the root or stands. -/
private theorem within_root_stands {s : State} (formed : WellFormed program s) :
    ∀ {x outer : ScopeOccurrenceId}, Within s x outer → outer = State.root → x ∈ scopeIds s
  | _, _, .refl _, rfl => formed.rooted.1
  | _, _, .parent _ _ _ member _ _, _ => List.mem_map_of_mem (f := ScopeOccurrence.id) member

/-- A standing scope occurrence's parent stands, in a rooted state. -/
theorem parent_stands {s : State} (formed : WellFormed program s) {entry : ScopeOccurrence} (member : entry ∈ s.scopes)
    {segment : ScopeSegment} {rest : List ScopeSegment} (keyed : entry.id.segments = segment :: rest) :
    (.ofSegments rest : ScopeOccurrenceId) ∈ scopeIds s := by
  suffices up : ∀ {x outer : ScopeOccurrenceId}, Within s x outer → outer = State.root → x = entry.id →
      (.ofSegments rest : ScopeOccurrenceId) ∈ scopeIds s from up (formed.rooted.2.2 entry member) rfl rfl
  intro x outer within rooted named
  cases within with
  | refl =>
    subst rooted
    have orphan := (formed.rooted.2.1 entry member).mpr named.symm
    rw [ScopeOccurrence.parent_eq, ScopeOccurrenceId.parent?_cons_eq keyed] at orphan
    cases orphan
  | parent child parent _ _ link above =>
    have same : parent = .ofSegments rest := by
      rw [ScopeOccurrence.parent_eq, named, ScopeOccurrenceId.parent?_cons_eq keyed] at link
      exact (Option.some.inj link).symm
    exact same ▸ within_root_stands formed above rooted

/-- In a well-formed state, the subtree of a present scope occurrence is exactly what lies within it. -/
theorem subtree_iff {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s)
    (x : ScopeOccurrenceId) : x ∈ s.subtree le scope ↔ Within s x scope := by
  rw [mem_subtree_inside, mem_inside]
  constructor
  · rintro (rfl | ⟨entry, member, rfl, below⟩)
    · exact .refl _
    · suffices up : ∀ (segments : List ScopeSegment) (entry : ScopeOccurrence), entry ∈ s.scopes →
          entry.id.segments = segments → State.below scope.segments segments = true → Within s entry.id scope from
        up _ entry member rfl below
      intro segments
      induction segments with
      | nil => intro _ _ _ below; simp [below_nil] at below
      | cons segment rest ih =>
        intro entry member keyed below
        have link : entry.parent = some (.ofSegments rest) := by
          rw [ScopeOccurrence.parent_eq, ScopeOccurrenceId.parent?_cons_eq keyed]
        rw [below_cons, Bool.or_eq_true, beq_iff_eq] at below
        rcases below with same | deeper
        · have top : (.ofSegments rest : ScopeOccurrenceId) = scope := by rw [same, ScopeOccurrenceId.ofSegments_eta]
          exact .parent entry _ scope member link (top ▸ .refl _)
        · obtain ⟨parentEntry, parentMember, named⟩ := List.mem_map.mp (parent_stands formed member keyed)
          exact .parent entry _ scope member link
            (named ▸ ih parentEntry parentMember (by rw [named, ScopeOccurrenceId.ofSegments_segments]) deeper)
  · intro within
    induction within with
    | refl => exact .inl rfl
    | parent child parent outer member link _ ih =>
      have keyed : ∃ segment, child.id.segments = segment :: parent.segments :=
        ScopeOccurrenceId.parent?_eq_some.mp (by rwa [ScopeOccurrence.parent_eq] at link)
      obtain ⟨segment, keyed⟩ := keyed
      refine .inr ⟨child, member, rfl, ?_⟩
      rw [keyed, below_cons, Bool.or_eq_true, beq_iff_eq]
      rcases ih present with same | ⟨_, _, rfl, deeper⟩
      · exact .inl (by rw [same])
      · exact .inr deeper

/-- In a well-formed state, what lies inside a present scope occurrence (`State.inside`) is exactly what lies within it. -/
theorem inside_iff {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s)
    (x : ScopeOccurrenceId) : x ∈ s.inside scope ↔ Within s x scope := by
  rw [← mem_subtree_inside s (fun _ _ => true)]
  exact subtree_iff (le := fun _ _ => true) formed present x

end Kernel.Laws.State
