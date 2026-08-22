import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.ActivityBoundaryTimerConformance
import BpmnSemantics.EventBasedGatewayConformance

/-! # Runtime-state well-formedness negative fixtures

This module owns the concrete malformed states the runtime-state invariant refuses, one per conjunct
this slice adds, each decided in the kernel.

The fixtures exist because preservation cannot find a weakened conjunct: a predicate that omits a
fact preserves it vacuously, so every conjunct needs a state that fails it and would pass without it.
They are the falsifying half of the account, not illustrations of it.

Every state here is unreachable by construction, and each perturbs a single field of a state its own
conjunct can apply to: the boundary-Timer armed state for the wait and order conjuncts, the empty
state for the lifecycle conjunct, and the Event-Based Gateway armed race for the hidden-record
conjunct.

Each negative is paired with a theorem naming sibling conjuncts that stay true, so a refusal is
attributable to the named conjunct rather than to something the aggregate already caught.

That pairing is not decoration. The first hidden-record fixture was refused by the event-race
association predicate instead of by the conjunct it was written for, and only a sibling theorem
exposed it. A class an admitted transition could actually produce would be a semantic
defect rather than a witness, and the positive fact below is what keeps the perturbations honest: the
unperturbed state is well-formed, so each negative differs from a reachable state in exactly the one
respect its conjunct names.
-/

namespace BpmnSemantics.RuntimeStateWellFormedConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- The armed state and its expected instance, reused so every negative below differs from a
reachable state in one field only. -/
def program : Program := ActivityBoundaryTimerConformance.program

def instanceId : SemanticId := ActivityBoundaryTimerConformance.instanceId

def armedState : RuntimeState := ActivityBoundaryTimerConformance.armedState

theorem armed_state_is_well_formed :
    runtimeStateWellFormed program instanceId armedState = true := by decide +kernel

/-- `W1`, violating `RSI-OWN-01`: a Timer wait whose owner occurrence does not exist.

The owner is stranded by naming an activation no occurrence carries rather than by emptying
`scopeOccurrences`, which would destroy the hosting root and be refused by the existing position
predicate instead. -/
def strandedTimerOwnerState : RuntimeState :=
  { armedState with
    timerWaits := armedState.timerWaits.map fun wait =>
      { wait with owner := { wait.owner with activation := wait.owner.activation + 1 } } }

theorem stranded_timer_owner_is_refused :
    runtimeStateWellFormed program instanceId strandedTimerOwnerState = false := by decide +kernel

theorem stranded_timer_owner_fails_ownership_with_siblings_intact :
    waitOwnersLive strandedTimerOwnerState = false ∧
      waitIdentitiesUnique strandedTimerOwnerState = true ∧
      canonicalCollectionOrder strandedTimerOwnerState = true := by decide +kernel

/-- `W2`, violating `RSI-UNIQ-02`: two Timer waits sharing one occurrence key.

The duplicate differs in its deadline, so the pair is not caught by ordinary structural equality and
the state is refused for the key rather than for the value. -/
def duplicateTimerKeyState : RuntimeState :=
  { armedState with
    timerWaits := armedState.timerWaits ++
      armedState.timerWaits.map fun wait => { wait with deadlineMs := wait.deadlineMs + 1 } }

theorem duplicate_timer_key_is_refused :
    runtimeStateWellFormed program instanceId duplicateTimerKeyState = false := by decide +kernel

theorem duplicate_timer_key_fails_uniqueness_with_ownership_intact :
    waitIdentitiesUnique duplicateTimerKeyState = false ∧
      waitOwnersLive duplicateTimerKeyState = true := by decide +kernel

/-- `W3`, violating `RSI-BIND-04`: a Timer wait whose element identity no operation declares.

Reachable only through an injected or cross-program state, because no arming operation can produce a
wait for an element the program does not carry. -/
def undeclaredTimerElementState : RuntimeState :=
  { armedState with
    timerWaits := armedState.timerWaits.map fun wait =>
      { wait with elementId := ⟨wait.elementId.value ++ "_Injected"⟩ } }

theorem undeclared_timer_element_is_refused :
    runtimeStateWellFormed program instanceId undeclaredTimerElementState = false := by
  decide +kernel

theorem undeclared_timer_element_fails_declaration_with_siblings_intact :
    waitDeclarationsValid program instanceId undeclaredTimerElementState = false ∧
      waitOwnersLive undeclaredTimerElementState = true ∧
      waitIdentitiesUnique undeclaredTimerElementState = true := by decide +kernel

/-- Violating `RSI-ORDER-01`: a canonically ordered collection holding its elements reversed.

Separate from the wait conjuncts because order is retained state: `RuntimeState` derives
`DecidableEq`, so a collection whose add sites all insert canonically carries its order as meaning
rather than as presentation. -/
def unorderedActivationsState : RuntimeState :=
  { armedState with
    activations :=
      [ { taskId := ⟨"Task_ZZZ"⟩, count := 1 }
      , { taskId := ⟨"Task_AAA"⟩, count := 1 } ] }

theorem unordered_activations_are_refused :
    runtimeStateWellFormed program instanceId unorderedActivationsState = false := by decide +kernel

theorem unordered_activations_fail_order_with_ownership_intact :
    canonicalCollectionOrder unorderedActivationsState = false ∧
      waitOwnersLive unorderedActivationsState = true := by decide +kernel

/-- Violating `RSI-LIFE-01`: a not-started state holding runtime work.

`lifecyclePositionValid` reaches occurrences and tokens here but no wait family, so a pending
initiation flag with no occurrences is admitted by the existing predicate and refused only by this
conjunct. -/
def notStartedWithPendingInitiationState : RuntimeState :=
  { initialState with initiationPending := true }

theorem not_started_with_pending_initiation_is_refused :
    runtimeStateWellFormed program instanceId notStartedWithPendingInitiationState = false := by
  decide +kernel

theorem not_started_with_pending_initiation_fails_lifecycle :
    notStartedStateEmpty notStartedWithPendingInitiationState = false ∧
      waitOwnersLive notStartedWithPendingInitiationState = true ∧
      waitIdentitiesUnique notStartedWithPendingInitiationState = true ∧
      canonicalCollectionOrder notStartedWithPendingInitiationState = true := by decide +kernel

/-- Violating the `awaitEventRace` half of `RSI-BIND-05`: a live race whose gateway element no
operation declares.

Built on the armed Event-Based Gateway state rather than on the boundary-Timer state, and perturbing
only `race.id.elementId`. That matters for attribution: an injected race carrying invented
subscription and timer identities is already refused by `eventRaceAssociationsValid`, whose
cardinality-one requirement no such state can meet, so the aggregate would refuse it without this
conjunct existing. Leaving the association intact is what makes the refusal attributable here, and
the siblings-intact theorem is what checks that. -/
def undeclaredEventRaceState : RuntimeState :=
  { EventBasedGatewayConformance.armed.state with
    eventRaces := EventBasedGatewayConformance.armed.state.eventRaces.map fun race =>
      { race with id := { race.id with elementId := ⟨race.id.elementId.value ++ "_Injected"⟩ } } }

theorem undeclared_event_race_is_refused :
    runtimeStateWellFormed EventBasedGatewayConformance.program
      EventBasedGatewayConformance.instanceId undeclaredEventRaceState = false := by decide +kernel

theorem undeclared_event_race_fails_declaration_with_association_intact :
    hiddenRecordDeclarationsValid EventBasedGatewayConformance.program
        undeclaredEventRaceState = false ∧
      eventRaceAssociationsValid undeclaredEventRaceState = true ∧
      waitOwnersLive undeclaredEventRaceState = true ∧
      waitIdentitiesUnique undeclaredEventRaceState = true ∧
      waitDeclarationsValid EventBasedGatewayConformance.program
        EventBasedGatewayConformance.instanceId undeclaredEventRaceState = true := by decide +kernel

theorem armed_event_race_state_is_well_formed :
    runtimeStateWellFormed EventBasedGatewayConformance.program
      EventBasedGatewayConformance.instanceId
      EventBasedGatewayConformance.armed.state = true := by decide +kernel

/-- `W4`, violating `RSI-MONO-01`: a successor that lowers an activation counter after removing its
wait.

It satisfies every state conjunct, which is why monotonicity is a separate relation rather than a
conjunct: no predicate over one state can refuse it. -/
def rewoundCounterSuccessor : RuntimeState :=
  { armedState with
    timerWaits := []
    timerActivations := armedState.timerActivations.map fun activation =>
      { activation with count := activation.count - 1 } }

theorem rewound_counter_successor_is_still_well_formed :
    runtimeStateWellFormed program instanceId rewoundCounterSuccessor = true := by decide +kernel

theorem rewound_counter_successor_breaks_monotonicity :
    ¬ RuntimeStateMonotone armedState rewoundCounterSuccessor := by
  intro monotone
  -- Instantiated at the deadline's own element, which is the only key the perturbation lowers.
  exact absurd (monotone.2.2.1 ⟨"Deadline"⟩) (by decide +kernel)

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
    fun _ => Nat.le_refl _, Nat.le_refl _⟩

end BpmnSemantics.RuntimeStateWellFormedConformance
