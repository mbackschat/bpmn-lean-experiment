import BpmnSemantics.CompensationEventSubProcessSnapshotErrorProgramConformance
import BpmnSemantics.CompensationEventSubProcessSnapshotErrorReadyStateConformance
import BpmnSemantics.CompensationEventSubProcessSnapshotErrorOutcomeConformance
import BpmnSemantics.CompensationEventSubProcessSnapshotErrorPurgeConformance
import BpmnSemantics.CompensationEventSubProcessSnapshotErrorRecoveryConformance

/-! # Compensation Event Sub-Process snapshot Error interruption

Aggregate evidence that direct Error propagation purges the failed occurrence's provisional
snapshot without disturbing recovery work. Each kernel-decided observation is compiled in its own
process so the enforced resource boundary applies to one claim at a time.
-/

namespace BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance

open BpmnSemantics.SemanticProcess

/-- Direct Error propagation purges the failed occurrence and never promotes it. -/
theorem error_interruption_purges_only_the_failed_parent :
    programWellFormed errorProgram = true ∧
      compensationEventSubProcessSnapshotStateValid errorProgram errorReadyState = true ∧
      errorReadyState.compensationParentContextRetentions =
        [.provisional errorChildOccurrence errorHandlerScopeId] ∧
      errorInterrupted.outcome = .committed ∧
      errorInterrupted.state.compensationParentContextRetentions = [] ∧
      (errorInterrupted.state.waits.map fun wait => wait.task.id.value) =
        ["UserTask_Recover"] := by
  exact ⟨error_program_is_well_formed,
    error_ready_state_is_valid_and_reserved.1,
    error_ready_state_is_valid_and_reserved.2,
    error_interruption_commits,
    error_interruption_purges_the_provisional_context,
    error_interruption_exposes_recovery⟩

end BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance
