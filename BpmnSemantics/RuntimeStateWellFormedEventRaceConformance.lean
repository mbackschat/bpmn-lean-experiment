import BpmnSemantics.EventBasedGatewayConformance
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Runtime-state well-formedness event-race negatives

This module owns the kernel-decided hidden Event-Based Gateway record refusal, its association
attribution check, and the reachable positive race state independently of the ordinary and successor
reduction families.
-/

namespace BpmnSemantics.RuntimeStateWellFormedConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

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

end BpmnSemantics.RuntimeStateWellFormedConformance
