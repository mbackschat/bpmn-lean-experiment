import BpmnSemantics.SemanticProcess.InternalTransitionAlternative

/-! Exact directive consumption follows the fixed failure precedence in the
[explicit-choice account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#explicit-observable-choice).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

structure InternalChoiceDirective where
  ordinal : Nat
  alternatives : List InternalAlternative
  selected : InternalAlternative
  deriving Repr, DecidableEq

abbrev InternalChoiceSchedule := List InternalChoiceDirective

inductive InternalChoiceScheduleFailure where
  | scheduleForbiddenForMode
  | missingDirective
  | ordinalMismatch
  | alternativesMismatch
  | selectedAlternativeMissing
  | unusedDirective
  deriving Repr, DecidableEq

/-- The full canonical frontier is compared before membership; no directive is repaired or reordered. -/
def consumeInternalChoiceDirective (ordinal : Nat) (alternatives : List InternalAlternative) :
    InternalChoiceSchedule → Except InternalChoiceScheduleFailure
      (InternalAlternative × InternalChoiceSchedule)
  | [] => .error .missingDirective
  | directive :: remaining =>
      if directive.ordinal ≠ ordinal then .error .ordinalMismatch
      else if directive.alternatives ≠ alternatives then .error .alternativesMismatch
      else if directive.selected ∉ alternatives then .error .selectedAlternativeMissing
      else .ok (directive.selected, remaining)

/-- Success consumes exactly one matching head and preserves every remaining directive verbatim. -/
theorem consumeInternalChoiceDirective_iff (ordinal : Nat) (alternatives : List InternalAlternative)
    (schedule remaining : InternalChoiceSchedule) (selected : InternalAlternative) :
    consumeInternalChoiceDirective ordinal alternatives schedule = .ok (selected, remaining) ↔
      ∃ directive, schedule = directive :: remaining ∧ directive.ordinal = ordinal ∧
        directive.alternatives = alternatives ∧ directive.selected = selected ∧ selected ∈ alternatives := by
  cases schedule with
  | nil => simp [consumeInternalChoiceDirective]
  | cons directive tail =>
      simp only [consumeInternalChoiceDirective]
      by_cases ordinalEq : directive.ordinal = ordinal
      · by_cases alternativesEq : directive.alternatives = alternatives
        · by_cases member : directive.selected ∈ alternatives
          · simp [ordinalEq, alternativesEq, member, and_assoc]
            constructor
            · rintro ⟨rfl, rfl⟩
              exact ⟨rfl, rfl, member⟩
            · rintro ⟨rfl, rfl, _⟩
              exact ⟨rfl, rfl⟩
          · simp [ordinalEq, alternativesEq, member]
            intro _ selectedEq
            simpa only [← selectedEq] using member
        · simp [ordinalEq, alternativesEq]
      · simp [ordinalEq]

end BpmnSemantics.SemanticProcess.InternalCommutation
