import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime

/-! # Compensation trigger and handler runtime invariant conformance -/

namespace BpmnSemantics.CompensationTriggerHandlerRuntimeConformance

open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
open BpmnSemantics.SemanticProcess

theorem active_frontier_requires_exact_dependencies_context_and_disjoint_effect_identity :
    compensationExecutionStateValid program activeState = true ∧
      compensationExecutionStateValid program dependencyDriftState = false ∧
      compensationExecutionStateValid program contextDriftState = false ∧
      compensationExecutionStateValid program effectCollisionState = false ∧
      compensationExecutionStateValid program secondActiveTriggerState = false := by
  decide +kernel

private def incidentState (elementId : String) : RuntimeState :=
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

theorem event_subprocess_handler_rejects_incident_collision_without_ordinary_waits :
    compensationExecutionStateValid program (incidentState "EB") = false := by
  decide +kernel

theorem boundary_handler_rejects_incident_collision_without_ordinary_waits :
    compensationExecutionStateValid program (incidentState "HC") = false := by
  decide +kernel

theorem unrelated_incident_does_not_collide_with_either_handler :
    compensationExecutionStateValid program (incidentState "Unrelated") = true := by
  decide +kernel

private def programWithCanonicalByteLimit (limit : Nat) : Program :=
  { program with
    compensationExecution := some
      { executionDeclaration with
        limits := { executionDeclaration.limits with maxCanonicalBytes := limit } } }

theorem exact_cross_language_bytes_drive_the_capacity_boundary :
    canonicalCompensationExecutionStateUtf8Bytes activeState.compensationTriggers
        activeState.compensationHandlerEffectWaits = 3031 ∧
      compensationExecutionStateValid (programWithCanonicalByteLimit 3031) activeState = true ∧
      compensationExecutionStateValid (programWithCanonicalByteLimit 3030) activeState = false := by
  decide +kernel

end BpmnSemantics.CompensationTriggerHandlerRuntimeConformance
