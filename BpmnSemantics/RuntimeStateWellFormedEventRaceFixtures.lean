module

public import BpmnSemantics.EventBasedGatewayFixtures

/-! The malformed race state preserves its real association, isolating declaration refusal. -/

@[expose] public section

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

end BpmnSemantics.RuntimeStateWellFormedConformance
