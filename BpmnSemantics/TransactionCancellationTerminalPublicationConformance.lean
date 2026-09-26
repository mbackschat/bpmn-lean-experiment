import BpmnSemantics.TransactionCancellationJoinPublicationConformance

/-! Transaction journey checks are separated at command boundaries because the combined
kernel reduction reached the 3 GiB ceiling on 2026-09-26. Each module retains the complete
preceding command chain and its exact publication oracle. -/

namespace BpmnSemantics.TransactionCancellationPublicationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

theorem acknowledgement_completes_the_process_and_closes_publication :
    publicationAccepted joined.result.state (completeTask "Acknowledge") completed = true ∧
      completed.result.state.control = .completed instanceId ∧
      completed.result.state.scopeOccurrences = [] ∧
      projectOpenFlowNodeOccurrencesWithCompensation? program completed.result.state = some [] := by
  simp only [completed, joined_state_checkpoint]
  decide +kernel

end BpmnSemantics.TransactionCancellationPublicationConformance
