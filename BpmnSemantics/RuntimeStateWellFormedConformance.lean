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
conjunct can apply to: the boundary-Timer armed state for the wait and order conjuncts, that state
carrying one outer Multi-Instance controller for the controller conjuncts, the empty state for the
lifecycle conjunct, and the Event-Based Gateway armed race for the hidden-record conjunct.

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

/-- `A1`, violating `AOO-BODY-01`: a record whose body has been removed while it survives.

This is the state an owner-filtered region removal produces when the handler it strands is owned by a
scope outside that region. The perturbation empties the task wait rather than the record, because that
is the direction a cancellation takes: the body goes and the record is left naming it. -/
def strandedActivityBodyState : RuntimeState :=
  { armedState with waits := [] }

theorem stranded_activity_body_is_refused :
    runtimeStateWellFormed program instanceId strandedActivityBodyState = false := by decide +kernel

theorem stranded_activity_body_fails_ownership_with_siblings_intact :
    activityRecordsOwnLiveWork strandedActivityBodyState = false ∧
      attachedTimersUnambiguous strandedActivityBodyState = true ∧
      activityIdentitiesUnique strandedActivityBodyState = true ∧
      waitOwnersLive strandedActivityBodyState = true := by decide +kernel

/-- `A2`, violating `AOO-ATTACH-01`: two records claiming one live deadline.

The duplicate names a different Activity element, so identity uniqueness stays true and the refusal is
attributable to the ambiguity rather than to a repeated identity. -/
def ambiguousAttachedTimerState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences ++
      armedState.activityOccurrences.map fun record =>
        { record with activityElementId := { value := record.activityElementId.value ++ "_Other" } } }

theorem ambiguous_attached_timer_is_refused :
    runtimeStateWellFormed program instanceId ambiguousAttachedTimerState = false := by decide +kernel

theorem ambiguous_attached_timer_fails_attachment_with_identity_intact :
    attachedTimersUnambiguous ambiguousAttachedTimerState = false ∧
      activityIdentitiesUnique ambiguousAttachedTimerState = true := by decide +kernel

/-- `A3`, violating `AOO-ID-01`: one Activity occurrence identity carried twice. -/
def duplicateActivityIdentityState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences ++ armedState.activityOccurrences }

theorem duplicate_activity_identity_is_refused :
    runtimeStateWellFormed program instanceId duplicateActivityIdentityState = false := by
  decide +kernel

theorem duplicate_activity_identity_fails_uniqueness :
    activityIdentitiesUnique duplicateActivityIdentityState = false := by decide +kernel

/-- The counter agreement is asserted nowhere, so a state where it fails stays admitted.

`activityActivations` agrees with `activations` under every registered profile because an Activity is
armed once per body it produces. Asserting that agreement would install exactly the ordinal
coincidence the record removes, so this is a positive fact rather than a negative. -/
def disagreeingActivityCounterState : RuntimeState :=
  { armedState with
    activityActivations := armedState.activityActivations.map fun activation =>
      { activation with count := activation.count + 4 } }

theorem disagreeing_activity_counter_is_admitted :
    runtimeStateWellFormed program instanceId disagreeingActivityCounterState = true := by
  decide +kernel

/-- One outer Multi-Instance controller bound to an Activity occurrence record.

Only the identity is derived from the record, so each controller negative below perturbs exactly one of
identity binding, cardinality, or remaining work while the other two stay satisfied. The snapshot is
the fixture's own two-item batch, which is what leaves an item to generate after zero results. -/
private def controllerOn (record : ActivityOccurrence)
    (outputSlots : List String) : SequentialMultiInstanceController :=
  { processInstanceId := record.processInstanceId
    activityElementId := record.activityElementId
    activation := record.activation
    snapshot := ["Invoice_1", "Invoice_2"]
    outputSlots }

/-- The unperturbed controller state: one open controller on the armed Activity occurrence.

The baseline the three controller negatives differ from in one respect each. No registered profile
reaches it, because no transition creates a controller yet; what it establishes is that the three
conjuncts admit the shape the capsule's entry transition will produce, so each refusal below is
attributable to its own perturbation rather than to the controller field being populated at all. -/
def openControllerState : RuntimeState :=
  { armedState with
    sequentialMultiInstanceControllers :=
      armedState.activityOccurrences.map (controllerOn · []) }

theorem open_controller_state_is_well_formed :
    runtimeStateWellFormed program instanceId openControllerState = true := by decide +kernel

/-- `C1`: a controller whose identity names no Activity occurrence record.

The activation is advanced by one rather than the element renamed, because that is the shape a reissued
or stale identity takes: every other field still resolves, so nothing but the binding conjunct can
refuse it. -/
def unownedControllerState : RuntimeState :=
  { openControllerState with
    sequentialMultiInstanceControllers :=
      openControllerState.sequentialMultiInstanceControllers.map fun controller =>
        { controller with activation := controller.activation + 1 } }

theorem unowned_controller_is_refused :
    runtimeStateWellFormed program instanceId unownedControllerState = false := by decide +kernel

theorem unowned_controller_fails_binding_with_siblings_intact :
    controllersOwnLiveActivity unownedControllerState = false ∧
      controllerIdentitiesUnique unownedControllerState = true ∧
      controllersNotExhausted unownedControllerState = true ∧
      activityRecordsOwnLiveWork unownedControllerState = true ∧
      activityIdentitiesUnique unownedControllerState = true ∧
      canonicalCollectionOrder unownedControllerState = true := by decide +kernel

/-- `C2`: one Activity occurrence carrying two controllers.

Both duplicates resolve to the one record, so the binding conjunct stays true and the refusal is
attributable to the cardinality. That is the direction that matters: the record-side conjuncts count
records per controller and cannot see a second controller on one record. -/
def duplicateControllerState : RuntimeState :=
  { openControllerState with
    sequentialMultiInstanceControllers :=
      openControllerState.sequentialMultiInstanceControllers ++
        openControllerState.sequentialMultiInstanceControllers }

theorem duplicate_controller_is_refused :
    runtimeStateWellFormed program instanceId duplicateControllerState = false := by decide +kernel

theorem duplicate_controller_fails_uniqueness_with_binding_intact :
    controllerIdentitiesUnique duplicateControllerState = false ∧
      controllersOwnLiveActivity duplicateControllerState = true ∧
      controllersNotExhausted duplicateControllerState = true ∧
      canonicalCollectionOrder duplicateControllerState = true := by decide +kernel

/-- `C3`: an open controller whose slots already cover its whole snapshot.

Unreachable because final completion removes the controller in the step that fills the last slot, so a
state that still holds it has either published its output twice or lost the removal. -/
def exhaustedControllerState : RuntimeState :=
  { armedState with
    sequentialMultiInstanceControllers :=
      armedState.activityOccurrences.map (controllerOn · ["Reviewed_1", "Reviewed_2"]) }

theorem exhausted_controller_is_refused :
    runtimeStateWellFormed program instanceId exhaustedControllerState = false := by decide +kernel

theorem exhausted_controller_fails_remaining_work_with_binding_intact :
    controllersNotExhausted exhaustedControllerState = false ∧
      controllersOwnLiveActivity exhaustedControllerState = true ∧
      controllerIdentitiesUnique exhaustedControllerState = true := by decide +kernel

/-- `C4`: a controller over an empty collection, refused by the same conjunct as `C3`.

Its own fact rather than a variant of `C3`, because the reason differs: a zero-item collection completes
atomically at entry and creates no controller at all, so this is the entry transition's refusal seen as
a state rather than an off-by-one in the exhaustion test. -/
def emptySnapshotControllerState : RuntimeState :=
  { openControllerState with
    sequentialMultiInstanceControllers :=
      openControllerState.sequentialMultiInstanceControllers.map fun controller =>
        { controller with snapshot := [] } }

theorem empty_snapshot_controller_is_refused :
    runtimeStateWellFormed program instanceId emptySnapshotControllerState = false := by
  decide +kernel

theorem empty_snapshot_controller_fails_remaining_work_with_binding_intact :
    controllersNotExhausted emptySnapshotControllerState = false ∧
      controllersOwnLiveActivity emptySnapshotControllerState = true ∧
      controllerIdentitiesUnique emptySnapshotControllerState = true := by decide +kernel

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
    fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, Nat.le_refl _⟩

end BpmnSemantics.RuntimeStateWellFormedConformance
