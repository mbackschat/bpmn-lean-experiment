import BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionFixture

/-! # Compensation Event Sub-Process snapshot Error interruption

Evidence that direct Error propagation purges the failed occurrence's provisional snapshot without
disturbing recovery work, as an executable check that
[`ConformanceChecksMain`](ConformanceChecksMain.lean) runs natively.
-/

namespace BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance

open BpmnSemantics.SemanticProcess

/-- Direct Error propagation purges the failed occurrence and never promotes it. -/
def error_interruption_purges_only_the_failed_parent : Bool := decide <|
    programWellFormed errorProgram = true ∧
      compensationEventSubProcessSnapshotStateValid errorProgram errorReadyState = true ∧
      errorReadyState.compensationParentContextRetentions =
        [.provisional errorChildOccurrence errorHandlerScopeId] ∧
      errorInterrupted.outcome = .committed ∧
      errorInterrupted.state.compensationParentContextRetentions = [] ∧
      (errorInterrupted.state.waits.map fun wait => wait.task.id.value) =
        ["UserTask_Recover"]

/-- Every executable check of this module, named for the driver's failure report. -/
def compensationEventSubProcessSnapshotErrorInterruptionConformanceChecks : List (String × Bool) := [
  ("error_interruption_purges_only_the_failed_parent", error_interruption_purges_only_the_failed_parent)
]

end BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance
