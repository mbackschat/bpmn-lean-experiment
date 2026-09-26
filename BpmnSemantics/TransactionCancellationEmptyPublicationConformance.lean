import BpmnSemantics.TransactionCancellationPublicationFixtures

/-! Transaction journey checks are separated at command boundaries because the combined
kernel reduction reached the 3 GiB ceiling on 2026-09-26. Each module retains the complete
preceding command chain and its exact publication oracle. -/

namespace BpmnSemantics.TransactionCancellationPublicationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

theorem withdrawal_first_cancels_unfinished_reservation_without_a_handler :
    publicationAccepted started.result.state (completeTask "Withdraw") emptyCancelled = true ∧
      emptyCancelled.flowNodeOccurrenceLifecycles[1]? = some emptyDelta ∧
      projectOpenFlowNodeOccurrencesWithCompensation? program emptyCancelled.result.state =
        some [taskStart "Acknowledge" rootOwner] ∧
      emptyCancelled.result.state.scopeOccurrences = [{ id := rootOwner, parent := none }] ∧
      emptyCancelled.result.state.compensationActivityRetentions = [] ∧
      emptyCancelled.result.state.compensationTriggers = [] ∧
      emptyCancelled.result.state.compensationHandlerEffectWaits = [] := by
  decide +kernel

end BpmnSemantics.TransactionCancellationPublicationConformance
