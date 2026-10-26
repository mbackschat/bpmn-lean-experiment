module

import BpmnSemantics.TransactionCancellationJoinPublicationConformance
public import BpmnSemantics.TransactionCancellationPublicationFixtures

/-! Transaction journey checks are separated at command boundaries because the combined
kernel reduction reached the 3 GiB ceiling on 2026-09-26. Each module retains the complete
preceding command chain and its exact publication oracle. -/

@[expose] public section

namespace BpmnSemantics.TransactionCancellationPublicationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def acknowledgement_completes_the_process_and_closes_publication : Bool := decide <|
    publicationAccepted joined.result.state (completeTask "Acknowledge") completed = true ∧
      completed.result.state.control = .completed instanceId ∧
      completed.result.state.scopeOccurrences = [] ∧
      projectOpenFlowNodeOccurrencesWithCompensation? program completed.result.state = some []

/-- Every executable check of this module, named for the driver's failure report. -/
def transactionCancellationTerminalPublicationConformanceChecks : List (String × Bool) := [
  ("acknowledgement_completes_the_process_and_closes_publication", acknowledgement_completes_the_process_and_closes_publication)
]

end BpmnSemantics.TransactionCancellationPublicationConformance
