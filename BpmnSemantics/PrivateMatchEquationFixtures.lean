module

meta import BpmnSemantics.PrivateEquationLemmas

/-!
The definitions and proofs of `RealizedLeakFixtures`, with `privateMatchEquations` declaring what the proofs realize
before they run, so the realized-constant check (`scripts/lean-realized-leaks.lean`) finds nothing here.
-/

public section

namespace BpmnSemantics.PrivateMatchEquationFixtures

inductive Shape where
  | a | b | c | d | e

/-- A sparse `match`: its wildcard arm compiles to a sparse case split with an `else_eq`. -/
def weight (s : Shape) (n : Nat) : Nat :=
  match s with
  | .a => n
  | .b => n + 1
  | _ => 0

/-- Overlapping arms over two discriminants: `split` needs the matcher's splitter and equations. -/
def pick (m n : Nat) : Nat :=
  match m, n with
  | 0, _ => n
  | _, 0 => m
  | _, _ => m + n

/-- A `match` inside the body on list and `Bool` constructor patterns. -/
def classify (xs : List Nat) (b : Bool) : Nat :=
  0 + match xs, b with
    | [], _ => 0
    | [x], true => x
    | _, _ => 1

run_meta privateEquations `BpmnSemantics.PrivateMatchEquationFixtures #[`classify]
run_meta privateMatchEquations `BpmnSemantics.PrivateMatchEquationFixtures #[`weight, `classify]
-- The other order, with congruence equations: the definition's equation lemmas then reuse the declared matcher ones.
run_meta privateMatchEquations `BpmnSemantics.PrivateMatchEquationFixtures #[`pick] (congruence := true)
run_meta privateEquations `BpmnSemantics.PrivateMatchEquationFixtures #[`pick]

theorem weight_le (s : Shape) (n : Nat) : weight s n ≤ n + 1 := by
  unfold weight
  split <;> omega

theorem pick_le (m n : Nat) : pick m n ≤ m + n := by
  unfold pick
  split <;> omega

theorem pick_zero_left (n : Nat) : pick 0 n = n := by
  simp [pick]

/-- `simp [classify]` rewrites with the definition's equation lemmas, one per `match` arm. -/
theorem classify_singleton (x : Nat) : classify [x] true = x := by
  simp [classify]

end BpmnSemantics.PrivateMatchEquationFixtures

end
