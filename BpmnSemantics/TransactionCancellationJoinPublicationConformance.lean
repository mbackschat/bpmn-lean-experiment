import BpmnSemantics.TransactionCancellationPublicationFixtures

/-! Transaction journey checks are separated at command boundaries because the combined
kernel reduction reached the 3 GiB ceiling on 2026-09-26. Each module retains the complete
preceding command chain and its exact publication oracle. -/

namespace BpmnSemantics.TransactionCancellationPublicationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def joinedCheckpoint : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := rootOwner, parent := none }]
    waits := [{ processInstanceId := instanceId, owner := rootOwner
                task := { id := ⟨"Acknowledge"⟩, name := none }
                activation := 1, output := ⟨"place:Acknowledge_End"⟩ }]
    compensationTriggers := [
      { id := occurrence "operation:Cancel", owner := childOwner
        output := ⟨"place:Cancel_Acknowledge"⟩, lifecycle := .succeeded
        handlers := [
          { identity :=
              { id := occurrence "Release_Reservation"
                subject := .boundaryActivity
                  { processInstanceId := instanceId, activityElementId := ⟨"Reserve"⟩, activation := 1 }
                handlerElementId := ⟨"Release_Reservation"⟩ }
            lifecycle := .compensated }]
        dependencies := [] }]
    activations := ["Acknowledge", "Prepare", "Reserve", "Withdraw"].map
      (fun name => { taskId := ⟨name⟩, count := 1 })
    effectActivations := [{ elementId := ⟨"Release_Reservation"⟩, count := 1 }]
    scopeActivations := [{ scopeId := rootScope, count := 1 }, { scopeId := childScope, count := 1 }]
    activityActivations := [{ taskId := ⟨"Reserve"⟩, count := 1 }] }

theorem handler_success_publishes_parent_boundary_and_acknowledgement :
    publicationAccepted cancelled.result.state successStimulus joined = true ∧
      joined.flowNodeOccurrenceLifecycles.head? = some joinDelta ∧
      projectOpenFlowNodeOccurrencesWithCompensation? program joined.result.state =
        some [taskStart "Acknowledge" rootOwner] ∧
      joined.result.state.scopeOccurrences = [{ id := rootOwner, parent := none }] ∧
      joined.result.state.compensationActivityRetentions = [] ∧
      joined.result.state.compensationHandlerEffectWaits = [] ∧
      joined.result.state = joinedCheckpoint := by
  decide +kernel

theorem joined_state_checkpoint : joined.result.state = joinedCheckpoint :=
  handler_success_publishes_parent_boundary_and_acknowledgement.2.2.2.2.2.2

end BpmnSemantics.TransactionCancellationPublicationConformance
