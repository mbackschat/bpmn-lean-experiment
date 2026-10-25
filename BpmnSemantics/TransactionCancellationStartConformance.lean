module

public import BpmnSemantics.TransactionCancellationPublicationFixtures

/-! Transaction journey checks are separated at command boundaries because the combined
kernel reduction reached the 3 GiB ceiling on 2026-09-26. Each module retains the complete
preceding command chain and its exact publication oracle. -/

@[expose] public section

namespace BpmnSemantics.TransactionCancellationPublicationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def manual_program_is_structurally_well_formed : Bool := decide <| programWellFormed program = true

def start_admission_uses_the_manual_program : Bool := decide <|
    (admitStimulusWithCompensationSnapshots program initialState startStimulus).outcome =
      .committed

def start_enters_child_and_arms_both_tasks_with_accepted_publication : Bool := decide <|
    publicationAccepted initialState startStimulus started = true ∧
      projectOpenFlowNodeOccurrencesWithCompensation? program started.result.state =
        some [taskStart "Reserve" childOwner, taskStart "Withdraw" childOwner, transactionStart] ∧
      started.result.state.compensationActivityRetentions =
        [{ owner := childOwner, nextCompletionOrdinal := 1, records := [] }]

/-- Every executable check of this module, named for the driver's failure report. -/
def transactionCancellationStartConformanceChecks : List (String × Bool) := [
  ("manual_program_is_structurally_well_formed", manual_program_is_structurally_well_formed),
  ("start_admission_uses_the_manual_program", start_admission_uses_the_manual_program),
  ("start_enters_child_and_arms_both_tasks_with_accepted_publication", start_enters_child_and_arms_both_tasks_with_accepted_publication)
]

end BpmnSemantics.TransactionCancellationPublicationConformance
