module

public import Kernel.Hooks
import all Kernel.Feature.Decision

/-! # Laws of Decision

The rules of the [decision semantics](../../docs/kernel/semantics/DECISION-SEMANTICS-SPEC.md#selected-contract),
independent of `Kernel.Feature.Decision`'s code: tests are three-valued, a test against a null input reads by its kind,
a test list is their disjunction and `not` holds only when every test is false, a rule matches only when every entry is
true; every matching rule's outputs are converted before the hit policy applies, so one failed conversion fails the
decision whatever the policy would keep; UNIQUE, FIRST, ANY, RULE ORDER and COLLECT select as item 5 says; `singleEntry`
and `collectEntries` map the result as CIB's mappers do; and a task without a result variable writes nothing.

A test's three values are `Option Bool`, `none` being null; an entry map is a list of output names and values in output
order. The laws name no hit policy, test or mapper constructor: each states one policy's or one reading's rule, and the
caller supplies the case. Nothing executable imports this module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it.
-/

@[expose] public section

namespace Kernel.Laws.Decision

open Kernel

/-- Every decision failure is a rollback with one code, whose outcome per stimulus the expression semantics give
(item 8). -/
def decisionFailed : Failure := .rolledBack "decision-failed"

/-! ## Tests and rules -/

/-- A test against a null input (item 5): a comparison or an interval (`ordered`) is null; an equality is true only
for the `null` literal (`nullLiteral`) and false for every other literal. -/
def AgainstNull (ordered nullLiteral : Bool) (result : Option Bool) : Prop :=
  (ordered = true → result = none) ∧
  (ordered = false → nullLiteral = true → result = some true) ∧
  (ordered = false → nullLiteral = false → result = some false)

/-- A test list's entry holds when one of its tests is true; a negated one, `not(...)`, holds only when every test is
false, so a null test fails both (item 5). -/
def ListHolds (negated : Bool) (results : List (Option Bool)) (holds : Bool) : Prop :=
  (negated = false → (holds = true ↔ ∃ result ∈ results, result = some true)) ∧
  (negated = true → (holds = true ↔ ∀ result ∈ results, result = some false))

/-- A rule matches only when every one of its input entries holds. -/
def Matches (entries : List Bool) (matched : Bool) : Prop :=
  matched = true ↔ ∀ entry ∈ entries, entry = true

/-- Every matching rule's output entries are converted before the hit policy applies (step 4): one failed conversion
(`converted` false) fails the decision, even where the policy would discard that rule. -/
def EveryMatchConverted {α : Type} (converted : List Bool) (outcome : Except Failure α) : Prop :=
  (∃ ok ∈ converted, ok = false) → outcome = .error decisionFailed

/-! ## Hit policies

Each takes the entry maps of the matching rules in rule order and the selected list. -/

/-- UNIQUE: the one matching rule or none; two matches fail the decision. -/
def Unique {α : Type} (matching : List α) (selected : Except Failure (List α)) : Prop :=
  (matching.length ≤ 1 → selected = .ok matching) ∧ (2 ≤ matching.length → selected = .error decisionFailed)

/-- FIRST: the first matching rule, or none. -/
def First {α : Type} (matching : List α) (selected : Except Failure (List α)) : Prop :=
  selected = .ok (matching.take 1)

/-- ANY: the first matching rule when every matching rule's entries equal it; differing entries fail the decision. -/
def AnySame {α : Type} (matching : List α) (selected : Except Failure (List α)) : Prop :=
  ((∀ first ∈ matching.head?, ∀ other ∈ matching, other = first) → selected = .ok (matching.take 1)) ∧
  ((∃ first ∈ matching.head?, ∃ other ∈ matching, other ≠ first) → selected = .error decisionFailed)

/-- RULE ORDER and COLLECT without an aggregator: every matching rule, in rule order. -/
def EveryMatch {α : Type} (matching : List α) (selected : Except Failure (List α)) : Prop :=
  selected = .ok matching

/-! ## Mapping and writing -/

/-- `singleEntry`: null without a result, the only entry of the only result, and a failure for two results or two
entries. -/
def SingleEntry (results : List (List (String × Value))) (mapped : Except Failure Value) : Prop :=
  (results = [] → mapped = .ok .null) ∧
  (∀ name value, results = [[(name, value)]] → mapped = .ok value) ∧
  ((2 ≤ results.length ∨ ∃ result ∈ results, 2 ≤ result.length) → mapped = .error decisionFailed)

/-- `collectEntries`: the list of the one output's values in rule order, empty without a result; results naming two
outputs fail the decision. -/
def CollectEntries (results : List (List (String × Value))) (mapped : Except Failure Value) : Prop :=
  ((∃ name, ∀ result ∈ results, ∀ entry ∈ result, entry.1 = name) →
    mapped = .ok (.list (results.flatMap (·.map (·.2))))) ∧
  ((∃ result ∈ results, ∃ entry ∈ result, ∃ other ∈ results, ∃ second ∈ other, entry.1 ≠ second.1) →
    mapped = .error decisionFailed)

/-- The task writes the mapped value to its result variable alone, and nothing without one, since `decisionResult` is
transient (item 6). -/
def WritesResult (resultVariable : Option String) (mapped : Value) (writes : List (String × Value)) : Prop :=
  (resultVariable = none → writes = []) ∧ ∀ name, resultVariable = some name → writes = [(name, mapped)]

/-! ## Non-vacuity -/

theorem comparison_null : AgainstNull true false none := ⟨fun _ => rfl, nofun, nofun⟩

theorem null_literal_matches_null : AgainstNull false true (some true) := ⟨nofun, fun _ _ => rfl, fun _ => nofun⟩

theorem literal_misses_null : AgainstNull false false (some false) := ⟨nofun, fun _ => nofun, fun _ _ => rfl⟩

/-- A comparison that reads a null input as false is rejected. -/
theorem comparison_false_rejected : ¬ AgainstNull true false (some false) := fun law => by
  simpa using law.1 rfl

/-- `not("a")` against a null input holds. -/
theorem negated_literal_holds : ListHolds true [some false] true :=
  ⟨nofun, fun _ => by simp⟩

/-- `not(< 5)` against a null input does not hold. -/
theorem negated_comparison_fails : ListHolds true [none] false :=
  ⟨nofun, fun _ => by simp⟩

/-- Reading `not` as plain negation of the null disjunction, holding, is rejected. -/
theorem negated_null_holds_rejected : ¬ ListHolds true [none] true := fun law => by
  simpa using (law.2 rfl).1 rfl

theorem list_disjunction : ListHolds false [some false, none, some true] true :=
  ⟨fun _ => by simp, nofun⟩

theorem all_entries_match : Matches [true, true] true := by simp [Matches]

/-- Matching a rule with one entry not true is rejected. -/
theorem partial_match_rejected : ¬ Matches [true, false] true := by simp [Matches]

theorem failed_conversion_fails : EveryMatchConverted [true, false] (Except.error decisionFailed : Except Failure Unit) :=
  fun _ => rfl

/-- Keeping the first rule under FIRST when a later matching rule's conversion fails is rejected. -/
theorem first_skips_conversion_rejected :
    ¬ EveryMatchConverted [true, false] (Except.ok [1] : Except Failure (List Nat)) := fun law => by
  simpa using law ⟨false, by simp, rfl⟩

theorem unique_one : Unique [1] (.ok [1]) := ⟨fun _ => rfl, by simp⟩

/-- Selecting either of two UNIQUE matches is rejected. -/
theorem unique_two_rejected : ¬ Unique [1, 2] (.ok [1]) := fun law => by
  simpa using law.2 (by simp)

theorem first_selects : First [1, 2] (.ok [1]) := rfl

/-- Selecting every match under FIRST is rejected. -/
theorem first_all_rejected : ¬ First [1, 2] (.ok [1, 2]) := by simp [First]

theorem any_same : AnySame [1, 1] (.ok [1]) :=
  ⟨fun _ => rfl, fun found => by
    obtain ⟨first, head, rest⟩ := found
    obtain ⟨other, mem, differs⟩ := rest
    simp at head mem
    subst head
    rcases mem with rfl | rfl <;> exact absurd rfl differs⟩

/-- Selecting the first of two differing ANY matches is rejected. -/
theorem any_differing_rejected : ¬ AnySame [1, 2] (.ok [1]) := fun law => by
  simpa using law.2 ⟨1, by simp, 2, by simp, by simp⟩

theorem every_match : EveryMatch [1, 2] (.ok [1, 2]) := rfl

/-- Dropping a later match under RULE ORDER or COLLECT is rejected. -/
theorem every_match_dropped_rejected : ¬ EveryMatch [1, 2] (.ok [1]) := by simp [EveryMatch]

theorem single_entry : SingleEntry [[("out", .int 1)]] (.ok (.int 1)) :=
  ⟨nofun, fun _ _ same => by simp at same; rw [same.2], fun two => by simp at two⟩

theorem single_entry_empty : SingleEntry [] (.ok .null) := ⟨fun _ => rfl, fun _ _ => nofun, fun two => by simp at two⟩

/-- Mapping the first of two results to a single entry is rejected. -/
theorem single_entry_two_rejected : ¬ SingleEntry [[("out", .int 1)], [("out", .int 2)]] (.ok (.int 1)) :=
  fun law => by simpa using law.2.2 (.inl (by simp))

theorem collect_entries : CollectEntries [[("out", .int 1)], [("out", .int 2)]] (.ok (.list [.int 1, .int 2])) :=
  ⟨fun _ => rfl, fun ⟨_, mem, rest⟩ => by
    obtain ⟨entry, entryMem, rest⟩ := rest
    obtain ⟨other, otherMem, rest⟩ := rest
    obtain ⟨second, secondMem, differs⟩ := rest
    simp at mem otherMem
    rcases mem with rfl | rfl <;> rcases otherMem with rfl | rfl <;> simp_all⟩

/-- Collecting across two output names is rejected. -/
theorem collect_two_names_rejected :
    ¬ CollectEntries [[("a", .int 1)], [("b", .int 2)]] (.ok (.list [.int 1, .int 2])) := fun law => by
  simpa using law.2 ⟨[("a", .int 1)], by simp, ("a", .int 1), by simp, [("b", .int 2)], by simp, ("b", .int 2), by simp,
    by simp⟩

theorem writes_result : WritesResult (some "approved") (.bool true) [("approved", .bool true)] :=
  ⟨nofun, fun _ same => by simp at same; rw [same]⟩

theorem writes_nothing : WritesResult none (.bool true) [] := ⟨fun _ => rfl, fun _ => nofun⟩

/-- Writing `decisionResult` without a result variable is rejected. -/
theorem transient_written_rejected : ¬ WritesResult none (.bool true) [("decisionResult", .bool true)] := fun law => by
  simpa using law.1 rfl

end Kernel.Laws.Decision
