module

public import BpmnSemantics.RuntimeStateWellFormedEventRaceFixtures
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Runtime-state well-formedness event-race negatives

This module owns the kernel-decided hidden Event-Based Gateway record refusal, its association
attribution check, and the reachable positive race state independently of the ordinary and successor
reduction families.
-/

@[expose] public section

namespace BpmnSemantics.RuntimeStateWellFormedConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def undeclared_event_race_is_refused : Bool := decide <|
    runtimeStateWellFormed EventBasedGatewayConformance.program
      EventBasedGatewayConformance.instanceId undeclaredEventRaceState = false

def undeclared_event_race_fails_declaration_with_association_intact : Bool := decide <|
    hiddenRecordDeclarationsValid EventBasedGatewayConformance.program
        undeclaredEventRaceState = false ∧
      eventRaceAssociationsValid undeclaredEventRaceState = true ∧
      waitOwnersLive undeclaredEventRaceState = true ∧
      waitIdentitiesUnique undeclaredEventRaceState = true ∧
      waitDeclarationsValid EventBasedGatewayConformance.program
        EventBasedGatewayConformance.instanceId undeclaredEventRaceState = true

def armed_event_race_state_is_well_formed : Bool := decide <|
    runtimeStateWellFormed EventBasedGatewayConformance.program
      EventBasedGatewayConformance.instanceId
      EventBasedGatewayConformance.armed.state = true

/-- Every executable check of this module, named for the driver's failure report. -/
def runtimeStateWellFormedEventRaceConformanceChecks : List (String × Bool) := [
  ("undeclared_event_race_is_refused", undeclared_event_race_is_refused),
  ("undeclared_event_race_fails_declaration_with_association_intact", undeclared_event_race_fails_declaration_with_association_intact),
  ("armed_event_race_state_is_well_formed", armed_event_race_state_is_well_formed)
]

end BpmnSemantics.RuntimeStateWellFormedConformance
