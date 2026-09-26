import BpmnSemantics.TransactionCancellationPublicationFixtures

/-! Transaction journey checks are separated at command boundaries because the combined
kernel reduction reached the 3 GiB ceiling on 2026-09-26. Each module retains the complete
preceding command chain and its exact publication oracle. -/

namespace BpmnSemantics.TransactionCancellationPublicationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

theorem reserve_completion_retains_exact_owner_and_opens_prepare :
    publicationAccepted started.result.state (completeTask "Reserve") reserved = true ∧
      projectOpenFlowNodeOccurrencesWithCompensation? program reserved.result.state =
        some [taskStart "Prepare" childOwner, taskStart "Withdraw" childOwner, transactionStart] ∧
      reserved.result.state.compensationActivityRetentions =
        [{ owner := childOwner
           nextCompletionOrdinal := 2
           records := [
             { id := { processInstanceId := instanceId
                       activityElementId := ⟨"Reserve"⟩
                       activation := 1 }
               completionOrdinal := 1 }] }] := by
  decide +kernel

end BpmnSemantics.TransactionCancellationPublicationConformance
