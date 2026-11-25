module

public import Kernel.State.Issue
public import Kernel.Laws.State.Key
import all Kernel.State.Issue

/-! # Laws of the kernel state: committed key forms (DC12)

What `Kernel.State.Issue` computes of a key: a scope occurrence key is fresh exactly when its innermost segment is
(`fresh_cons`), and an occurrence key when its ordinal or its scope occurrence key is (`OccurrenceId.fresh_eq`).
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

@[simp] theorem fresh_cons (segment : ScopeSegment) (rest : List ScopeSegment) :
    (ScopeOccurrenceId.ofSegments (segment :: rest)).fresh = segment.ordinal.isFresh := by
  simp only [ScopeOccurrenceId.fresh, ScopeOccurrenceId.ofSegments_segments]

@[simp] theorem fresh_nil : (ScopeOccurrenceId.ofSegments []).fresh = false := by
  simp only [ScopeOccurrenceId.fresh, ScopeOccurrenceId.ofSegments_segments]

theorem OccurrenceId.fresh_eq (id : OccurrenceId) : id.fresh = (id.ordinal.isFresh || id.scope.fresh) := by
  simp only [OccurrenceId.fresh]

/-- Any two positions compare one way or the other under an oriented unit order (DC13): `issueOrder`'s sort is total. -/
theorem notAfter_total {units : UnitKey → UnitKey → Ordering} [Std.OrientedCmp units] (p q : Issue) :
    Issue.notAfter units p q = true ∨ Issue.notAfter units q p = true := by
  cases p with
  | committed a =>
    cases q with
    | committed b => simp only [Issue.notAfter, decide_eq_true_eq]; exact Nat.le_total a b
    | fresh => simp [Issue.notAfter]
  | fresh u i =>
    cases q with
    | committed => simp [Issue.notAfter]
    | fresh v j =>
      simp only [Issue.notAfter]
      rw [Std.OrientedCmp.eq_swap (cmp := units) (a := v) (b := u)]
      cases units u v <;> simp [Ordering.swap] <;> omega

/-- Every position is not after itself. -/
theorem notAfter_refl {units : UnitKey → UnitKey → Ordering} [Std.ReflCmp units] (p : Issue) :
    Issue.notAfter units p p = true := by
  cases p with
  | committed a => simp [Issue.notAfter]
  | fresh u i => simp [Issue.notAfter, Std.ReflCmp.compare_self]

/-- A position of a unit ordered after another's is after every position of that one. -/
theorem notAfter_fresh_gt {units : UnitKey → UnitKey → Ordering} {u v : UnitKey} (after : units v u = .gt) (i j : Nat) :
    Issue.notAfter units (.fresh v j) (.fresh u i) = false := by
  simp [Issue.notAfter, after]

/-- Two positions of one unit are in index order. -/
theorem notAfter_fresh_same {units : UnitKey → UnitKey → Ordering} [Std.ReflCmp units] (u : UnitKey) (i j : Nat) :
    Issue.notAfter units (.fresh u j) (.fresh u i) = decide (j ≤ i) := by
  simp [Issue.notAfter, Std.ReflCmp.compare_self]

/-- `Issue.notAfter` is transitive under a transitive unit order (DC13): `issueOrder`'s sort is a total preorder. -/
theorem notAfter_trans {units : UnitKey → UnitKey → Ordering} [Std.TransCmp units] {p q r : Issue}
    (first : Issue.notAfter units p q = true) (second : Issue.notAfter units q r = true) :
    Issue.notAfter units p r = true := by
  match p, q, r with
  | .committed _, .committed _, .committed _ =>
    simp only [Issue.notAfter, decide_eq_true_eq] at first second ⊢; omega
  | .committed _, _, .fresh _ _ => rfl
  | .committed _, .fresh _ _, .committed _ => simp [Issue.notAfter] at second
  | .fresh _ _, .committed _, _ => simp [Issue.notAfter] at first
  | .fresh _ _, .fresh _ _, .committed _ => simp [Issue.notAfter] at second
  | .fresh u i, .fresh v j, .fresh w k =>
    simp only [Issue.notAfter] at first second ⊢
    cases uv : units u v <;> cases vw : units v w <;> simp [uv, vw] at first second
    all_goals first
      | rw [Std.TransCmp.lt_trans uv vw]
      | rw [Std.TransCmp.lt_of_lt_of_eq uv vw]
      | rw [Std.TransCmp.lt_of_eq_of_lt uv vw]
      | (rw [Std.TransCmp.eq_trans uv vw]; simp only [decide_eq_true_eq]; omega)

theorem notAfter_fresh (units : UnitKey → UnitKey → Ordering) (u v : UnitKey) (i j : Nat) :
    Issue.notAfter units (.fresh u i) (.fresh v j) =
      match units u v with
      | .lt => true
      | .gt => false
      | .eq => decide (i ≤ j) := by
  simp only [Issue.notAfter]
  cases units u v <;> rfl

@[simp] theorem notAfter_committed (units : UnitKey → UnitKey → Ordering) (a b : Nat) :
    Issue.notAfter units (.committed a) (.committed b) = decide (a ≤ b) := by
  simp only [Issue.notAfter]

@[simp] theorem notAfter_committed_fresh (units : UnitKey → UnitKey → Ordering) (a : Nat) (unit : UnitKey) (index : Nat) :
    Issue.notAfter units (.committed a) (.fresh unit index) = true := by
  simp only [Issue.notAfter]

@[simp] theorem notAfter_fresh_committed (units : UnitKey → UnitKey → Ordering) (unit : UnitKey) (index b : Nat) :
    Issue.notAfter units (.fresh unit index) (.committed b) = false := by
  simp only [Issue.notAfter]

/-- Two positions each not after the other are one, under a unit order whose ties are equal keys (DC13). -/
theorem notAfter_antisymm {units : UnitKey → UnitKey → Ordering} [Std.OrientedCmp units]
    (tied : ∀ a b, units a b = .eq → a = b) {p q : Issue} (first : Issue.notAfter units p q = true)
    (second : Issue.notAfter units q p = true) : p = q := by
  match p, q with
  | .committed _, .committed _ =>
    simp only [notAfter_committed, decide_eq_true_eq] at first second; rw [Nat.le_antisymm first second]
  | .committed _, .fresh _ _ => simp at second
  | .fresh _ _, .committed _ => simp at first
  | .fresh u i, .fresh v j =>
    simp only [Issue.notAfter] at first second
    rw [Std.OrientedCmp.eq_swap (cmp := units) (a := v) (b := u)] at second
    cases uv : units u v <;> simp [uv, Ordering.swap] at first second
    rw [tied u v uv, Nat.le_antisymm first second]

end Kernel.Laws.State
