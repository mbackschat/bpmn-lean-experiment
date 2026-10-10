import BpmnSemantics.RuntimeStateWellFormedEventRaceFixtures
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Runtime-state well-formedness event-race negatives

This module owns the kernel-decided hidden Event-Based Gateway record refusal, its association
attribution check, and the reachable positive race state independently of the ordinary and successor
reduction families.
-/

namespace BpmnSemantics.RuntimeStateWellFormedConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

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
