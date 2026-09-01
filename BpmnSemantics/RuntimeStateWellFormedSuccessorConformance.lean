import BpmnSemantics.RuntimeStateWellFormedFixtures

/-! # Runtime-state well-formedness successor negatives

This module owns the kernel-decided counter, identity-issuing, and logical-time successor witnesses
without importing the ordinary invariant or event-race reduction families.
-/

namespace BpmnSemantics.RuntimeStateWellFormedConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- `W4`, violating `RSI-MONO-01`: a successor that lowers an activation counter after removing its
wait.

The withdrawn wait and Activity record leave no live member above the rewound counter, so this
particular successor satisfies every state conjunct. Monotonicity remains a separate relation because
the one-state bound cannot see a rewind after its live member has gone. -/
def rewoundCounterSuccessor : RuntimeState :=
  { armedState with
    timerWaits := []
    -- The Activity occurrence record is withdrawn with its deadline, as a real victory withdraws it.
    -- Leaving the record behind would make this state malformed under `activityRecordsOwnLiveWork`,
    -- and the fixture's whole point is that no single-state conjunct can refuse it.
    activityOccurrences := []
    timerActivations := armedState.timerActivations.map fun activation =>
      { activation with count := activation.count - 1 } }

theorem rewound_counter_successor_is_still_well_formed :
    runtimeStateWellFormed program instanceId rewoundCounterSuccessor = true := by decide +kernel

theorem rewound_counter_successor_breaks_monotonicity :
    ¬ RuntimeStateMonotone armedState rewoundCounterSuccessor := by
  intro monotone
  -- Instantiated at the deadline's own element, which is the only key the perturbation lowers.
  exact absurd (monotone.2.2.1 ⟨"Deadline"⟩) (by decide +kernel)

/-- `RSI-ISSUE-01` Red: activation one is live, withdrawn while its Activity high-water mark stays
one, then reintroduced under that same mark.

The middle state removes only the ownership record while retaining its Activity high-water mark; the
final state restores the exact first state. Both still satisfy the one-state identity bound and no
counter rewinds. Only the pairwise issuing discipline can distinguish the reintroduction from a
preserved live identity. -/
def withdrawnActivityIdentityState : RuntimeState :=
  { armedState with activityOccurrences := [] }

def reissuedActivityIdentityState : RuntimeState :=
  armedState

theorem reissued_activity_identity_siblings_remain_intact :
    runtimeStateWellFormed program instanceId withdrawnActivityIdentityState = true ∧
      runtimeStateWellFormed program instanceId reissuedActivityIdentityState = true ∧
      withdrawnActivityIdentityState.activations = reissuedActivityIdentityState.activations ∧
      withdrawnActivityIdentityState.messageActivations =
        reissuedActivityIdentityState.messageActivations ∧
      withdrawnActivityIdentityState.timerActivations =
        reissuedActivityIdentityState.timerActivations ∧
      withdrawnActivityIdentityState.effectActivations =
        reissuedActivityIdentityState.effectActivations ∧
      withdrawnActivityIdentityState.eventRaceActivations =
        reissuedActivityIdentityState.eventRaceActivations ∧
      withdrawnActivityIdentityState.callActivations =
        reissuedActivityIdentityState.callActivations ∧
      withdrawnActivityIdentityState.scopeActivations =
        reissuedActivityIdentityState.scopeActivations ∧
      withdrawnActivityIdentityState.activityActivations =
        reissuedActivityIdentityState.activityActivations ∧
      withdrawnActivityIdentityState.endOccurrences =
        reissuedActivityIdentityState.endOccurrences := by
  decide +kernel

theorem exact_activity_identity_reissue_breaks_issuing_discipline :
    activityIdentityIssuingDiscipline withdrawnActivityIdentityState
        reissuedActivityIdentityState = false := by
  decide +kernel

/-- Violating `RSI-MONO-03`: a successor whose clock moves backwards while the firing hypothesis
holds.

The pair is built by moving only `logicalTimeMs`, so both states satisfy every conjunct. That is the
content rather than an accident: "no live deadline below logical time" is deliberately not a
conjunct, so a state whose clock has passed its armed deadline is well-formed and only the two-state
relation can refuse the rewind. Without this witness the relation is a definition nothing consumes,
which cannot fail and therefore carries no evidence. -/
def advancedClockState : RuntimeState :=
  { armedState with logicalTimeMs := 5000 }

def rewoundClockSuccessor : RuntimeState :=
  { armedState with logicalTimeMs := 4999 }

theorem advanced_clock_state_is_well_formed :
    runtimeStateWellFormed program instanceId advancedClockState = true := by decide +kernel

theorem rewound_clock_successor_is_still_well_formed :
    runtimeStateWellFormed program instanceId rewoundClockSuccessor = true := by decide +kernel

theorem rewound_clock_successor_breaks_time_monotonicity :
    ¬ RuntimeStateTimeMonotone 5000 advancedClockState rewoundClockSuccessor := by
  intro monotone
  -- The fired deadline equals the earlier clock, so the hypothesis holds and only the conclusion
  -- can fail. A witness that discharged it with an unreachable hypothesis would prove nothing.
  exact absurd (monotone (by decide +kernel)) (by decide +kernel)

/-- Neither monotonicity relation subsumes the other: each admits the successor the other refuses.

The counter rewind leaves logical time untouched and the clock rewind leaves every counter
untouched, so a single combined relation would have to refuse both for reasons that have no common
premise. That is why `RSI-MONO-01` and `RSI-MONO-03` are stated separately. -/
theorem rewound_counter_successor_keeps_time_monotone :
    RuntimeStateTimeMonotone 0 armedState rewoundCounterSuccessor := by
  intro _
  exact Nat.le_refl _

theorem rewound_clock_successor_keeps_counters_monotone :
    RuntimeStateMonotone armedState rewoundClockSuccessor :=
  ⟨fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _,
    fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _,
    fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, Nat.le_refl _, by decide +kernel⟩

end BpmnSemantics.RuntimeStateWellFormedConformance
