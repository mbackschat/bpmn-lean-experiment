import BpmnSemantics.CompensationEventSubProcessSnapshotConformance
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotInternalCommutation
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace

/-! # Compensation Event Sub-Process snapshot lifecycle integration

Kernel-decided witnesses for root start, child entry and completion, Timer interruption,
occurrence isolation, and exact commutation atoms.
-/

namespace BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def startResult : StimulusResult :=
  applyStimulusWithCompensationSnapshots scenarioClosureLimit
    CompensationEventSubProcessSnapshotAdmissionConformance.program initialState
    (.startProcess ⟨"start-snapshot-process"⟩
      ⟨SubProcessBoundaryTimerConformance.processId.value⟩
      CompensationEventSubProcessSnapshotConformance.instanceId [])

def childTaskId : UserTaskInstanceId :=
  { processInstanceId := CompensationEventSubProcessSnapshotConformance.instanceId
    elementId := ⟨"ChildTask"⟩
    activation := 1 }

def childCompletionResult : StimulusResult :=
  applyStimulusWithCompensationSnapshots scenarioClosureLimit
    CompensationEventSubProcessSnapshotAdmissionConformance.program startResult.state
    (.completeUserTaskInstance ⟨"complete-snapshot-child"⟩ childTaskId [])

/-- Child entry and its provisional context record are one public-evaluator commit. -/
theorem child_entry_reserves_before_exposing_child_work :
    startResult.outcome = .committed ∧
      startResult.state.compensationParentContextRetentions.length = 1 := by
  decide +kernel

/-- Ordinary child completion promotes the exact provisional record before removing the occurrence. -/
theorem child_completion_promotes_the_deciding_prestate :
    childCompletionResult.outcome = .committed ∧
      childCompletionResult.state.compensationParentContextRetentions =
        [.promoted CompensationEventSubProcessSnapshotConformance.childOccurrence
          CompensationEventSubProcessSnapshotAdmissionConformance.handlerScopeId
          { frames :=
              [ { owner := CompensationEventSubProcessSnapshotConformance.rootOccurrence.id
                  bindings := [] }
              , { owner := CompensationEventSubProcessSnapshotConformance.childOccurrence.id
                  bindings := [] } ] }] ∧
      (childCompletionResult.state.scopeOccurrences.map fun occurrence =>
        occurrence.id.definitionScopeId) =
          [SubProcessBoundaryTimerConformance.rootScopeId] := by
  decide +kernel

def timerInterruptionResult : StimulusResult :=
  applyStimulusWithCompensationSnapshots scenarioClosureLimit
    CompensationEventSubProcessSnapshotAdmissionConformance.program startResult.state
    (.fireTimer ⟨"interrupt-snapshot-child"⟩
      { processInstanceId := CompensationEventSubProcessSnapshotConformance.instanceId
        elementId := ⟨"Deadline"⟩
        activation := 1 }
      1000)

/-- Timer interruption removes the failed child's reservation in the same regional transition. -/
theorem timer_interruption_purges_without_promotion :
    timerInterruptionResult.outcome = .committed ∧
      timerInterruptionResult.state.compensationParentContextRetentions = [] ∧
      (timerInterruptionResult.state.waits.map fun wait => wait.task.id.value) =
        ["EscalationTask"] := by
  decide +kernel

def oneOfTwoSameDefinitionPurged : RuntimeState :=
  purgeCompensationParentContextsAfterUnsuccessfulScopeRemoval <|
    cancelScopeSubtree
      CompensationEventSubProcessSnapshotConformance.twoLiveReservedState
      CompensationEventSubProcessSnapshotConformance.childOccurrence.id .remove

/-- Regional purge keys by complete occurrence identity, not the shared definition scope. -/
theorem same_definition_occurrences_do_not_alias_during_purge :
    oneOfTwoSameDefinitionPurged.compensationParentContextRetentions =
      [.provisional CompensationEventSubProcessSnapshotConformance.secondChildOccurrence
        CompensationEventSubProcessSnapshotAdmissionConformance.handlerScopeId] ∧
      oneOfTwoSameDefinitionPurged.scopeOccurrences.any (fun occurrence =>
        occurrence.id ==
          CompensationEventSubProcessSnapshotConformance.secondChildOccurrence.id) = true := by
  decide +kernel

/-- The footprint vocabulary names capacity, exact retention identity, captured Process data, and purge ownership. -/
theorem snapshot_footprints_are_exact_and_region_owned :
    compensationSnapshotReservationAtoms
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        CompensationEventSubProcessSnapshotConformance.childOccurrence =
      [ .compensationParentContextCapacity
      , .compensationParentContextRetention
          CompensationEventSubProcessSnapshotConformance.childOccurrence ] ∧
    compensationSnapshotPromotionAtoms
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        CompensationEventSubProcessSnapshotConformance.childRunningState
        CompensationEventSubProcessSnapshotConformance.childOccurrence =
      ( [ .compensationParentContextCapacity
        , .compensationParentContextRetention
            CompensationEventSubProcessSnapshotConformance.childOccurrence
        , .ordinary (.processVariable
            CompensationEventSubProcessSnapshotConformance.instanceId "context") ]
      , [ .compensationParentContextCapacity
        , .compensationParentContextRetention
            CompensationEventSubProcessSnapshotConformance.childOccurrence ] ) ∧
    compensationSnapshotPurgeAtoms
        CompensationEventSubProcessSnapshotConformance.twoLiveReservedState
        (fun owner => owner ==
          CompensationEventSubProcessSnapshotConformance.childOccurrence.id) =
      [ .compensationParentContextCapacity
      , .compensationParentContextRetention
          CompensationEventSubProcessSnapshotConformance.childOccurrence ] := by
  decide +kernel

end BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance
