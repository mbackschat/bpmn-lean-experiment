import BpmnSemantics.TransactionCancellationPublicationFixtures

/-! Transaction journey checks are separated at command boundaries because the combined
kernel reduction reached the 3 GiB ceiling on 2026-09-26. Each module retains the complete
preceding command chain and its exact publication oracle. -/

namespace BpmnSemantics.TransactionCancellationPublicationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

theorem cancellation_pins_child_without_early_boundary_or_synthetic_trigger :
    publicationAccepted reserved.result.state (completeTask "Withdraw") cancelled = true ∧
      cancelled.flowNodeOccurrenceLifecycles[1]? = some cancelDelta ∧
      projectOpenFlowNodeOccurrencesWithCompensation? program cancelled.result.state =
        some [transactionStart, handlerStart] ∧
      cancelled.result.state.tokens = [] ∧
      cancelled.result.state.waits = [] ∧
      cancelled.result.state.compensationActivityRetentions =
        [{ owner := childOwner, nextCompletionOrdinal := 2, records := [] }] := by
  decide +kernel

end BpmnSemantics.TransactionCancellationPublicationConformance
