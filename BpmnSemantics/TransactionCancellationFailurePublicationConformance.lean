import BpmnSemantics.TransactionCancellationPublicationFixtures

/-! Transaction journey checks are separated at command boundaries because the combined
kernel reduction reached the 3 GiB ceiling on 2026-09-26. Each module retains the complete
preceding command chain and its exact publication oracle. -/

namespace BpmnSemantics.TransactionCancellationPublicationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

theorem typed_failure_closes_all_opens_without_boundary_or_continuation :
    publicationAccepted cancelled.result.state failureStimulus failed = true ∧
      failed.result.state.control = .failed instanceId
        { kind := .compensationHandlerFailure, triggerId := occurrence "operation:Cancel",
          handlerId := occurrence "Release_Reservation", effectId := occurrence "Release_Reservation",
          code := "release-refused", message := none } ∧
      failed.flowNodeOccurrenceLifecycles =
        [{ started := [], ended := [{ anchor := .scope childOwner, terminal := .cancelled },
          { anchor := handlerStart.anchor, terminal := .cancelled }] }] ∧
      failed.result.state.scopeOccurrences = [] ∧
      failed.result.state.tokens = [] ∧
      failed.result.state.waits = [] ∧
      failed.result.state.compensationHandlerEffectWaits = [] ∧
      projectOpenFlowNodeOccurrencesWithCompensation? program failed.result.state = some [] := by
  decide +kernel

end BpmnSemantics.TransactionCancellationPublicationConformance
