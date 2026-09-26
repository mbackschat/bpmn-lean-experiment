import BpmnSemantics.TransactionCancellationPublicationFixtures

/-! Transaction journey checks are separated at command boundaries because the combined
kernel reduction reached the 3 GiB ceiling on 2026-09-26. Each module retains the complete
preceding command chain and its exact publication oracle. -/

namespace BpmnSemantics.TransactionCancellationPublicationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

theorem manual_program_is_structurally_well_formed : programWellFormed program = true := by
  decide +kernel

theorem start_admission_uses_the_manual_program :
    (admitStimulusWithCompensationSnapshots program initialState startStimulus).outcome =
      .committed := by
  decide +kernel

theorem start_enters_child_and_arms_both_tasks_with_accepted_publication :
    publicationAccepted initialState startStimulus started = true ∧
      projectOpenFlowNodeOccurrencesWithCompensation? program started.result.state =
        some [taskStart "Reserve" childOwner, taskStart "Withdraw" childOwner, transactionStart] ∧
      started.result.state.compensationActivityRetentions =
        [{ owner := childOwner, nextCompletionOrdinal := 1, records := [] }] := by
  decide +kernel

end BpmnSemantics.TransactionCancellationPublicationConformance
