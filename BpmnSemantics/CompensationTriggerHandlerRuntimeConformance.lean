import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime

/-! # Compensation trigger and handler runtime invariant conformance -/

namespace BpmnSemantics.CompensationTriggerHandlerRuntimeConformance

open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
open BpmnSemantics.SemanticProcess

def active_frontier_requires_exact_dependencies_context_and_disjoint_effect_identity : Bool := decide <|
    compensationExecutionStateValid program activeState = true ∧
      compensationExecutionStateValid program dependencyDriftState = false ∧
      compensationExecutionStateValid program contextDriftState = false ∧
      compensationExecutionStateValid program effectCollisionState = false ∧
      compensationExecutionStateValid program secondActiveTriggerState = false

def incidentState (elementId : String) : RuntimeState :=
  { activeState with
    effectWaits := []
    effectIncidents :=
      [{ id := { effectId := occurrence elementId, generation := 1 }
         wait :=
           { processInstanceId := instanceId
             owner := rootOwner
             elementId := ⟨elementId⟩
             activation := 1
             descriptor := compensationDescriptor
             arguments := []
             outputMappings := []
             output := ⟨"place:done"⟩
             bpmnErrorRoute := none } }] }

def event_subprocess_handler_rejects_incident_collision_without_ordinary_waits : Bool := decide <|
    compensationExecutionStateValid program (incidentState "EB") = false

def boundary_handler_rejects_incident_collision_without_ordinary_waits : Bool := decide <|
    compensationExecutionStateValid program (incidentState "HC") = false

def unrelated_incident_does_not_collide_with_either_handler : Bool := decide <|
    compensationExecutionStateValid program (incidentState "Unrelated") = true

def programWithCanonicalByteLimit (limit : Nat) : Program :=
  { program with
    compensationExecution := some
      { executionDeclaration with
        limits := { executionDeclaration.limits with maxCanonicalBytes := limit } } }

def exact_cross_language_bytes_drive_the_capacity_boundary : Bool := decide <|
    canonicalCompensationExecutionStateUtf8Bytes activeState.compensationTriggers
        activeState.compensationHandlerEffectWaits = 3031 ∧
      compensationExecutionStateValid (programWithCanonicalByteLimit 3031) activeState = true ∧
      compensationExecutionStateValid (programWithCanonicalByteLimit 3030) activeState = false

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("active_frontier_requires_exact_dependencies_context_and_disjoint_effect_identity", active_frontier_requires_exact_dependencies_context_and_disjoint_effect_identity),
  ("event_subprocess_handler_rejects_incident_collision_without_ordinary_waits", event_subprocess_handler_rejects_incident_collision_without_ordinary_waits),
  ("boundary_handler_rejects_incident_collision_without_ordinary_waits", boundary_handler_rejects_incident_collision_without_ordinary_waits),
  ("unrelated_incident_does_not_collide_with_either_handler", unrelated_incident_does_not_collide_with_either_handler),
  ("exact_cross_language_bytes_drive_the_capacity_boundary", exact_cross_language_bytes_drive_the_capacity_boundary)
]

end BpmnSemantics.CompensationTriggerHandlerRuntimeConformance
