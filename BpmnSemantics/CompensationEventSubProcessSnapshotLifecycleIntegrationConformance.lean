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
def child_entry_reserves_before_exposing_child_work : Bool := decide <|
    startResult.outcome = .committed ∧
      startResult.state.compensationParentContextRetentions.length = 1

/-- Ordinary child completion promotes the exact provisional record before removing the occurrence. -/
def child_completion_promotes_the_deciding_prestate : Bool := decide <|
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
          [SubProcessBoundaryTimerConformance.rootScopeId]

def timerInterruptionResult : StimulusResult :=
  applyStimulusWithCompensationSnapshots scenarioClosureLimit
    CompensationEventSubProcessSnapshotAdmissionConformance.program startResult.state
    (.fireTimer ⟨"interrupt-snapshot-child"⟩
      { processInstanceId := CompensationEventSubProcessSnapshotConformance.instanceId
        elementId := ⟨"Deadline"⟩
        activation := 1 }
      1000)

def timerInterruptionAdmission : ExternalAdmission :=
  admitStimulusWithCompensationSnapshots
    CompensationEventSubProcessSnapshotAdmissionConformance.program startResult.state
    (.fireTimer ⟨"interrupt-snapshot-child-before-closure"⟩
      { processInstanceId := CompensationEventSubProcessSnapshotConformance.instanceId
        elementId := ⟨"Deadline"⟩
        activation := 1 }
      1000)

/-- The external Timer transition itself purges the unsuccessful parent; closure cannot repair admission. -/
def timer_admission_purges_before_closure : Bool := decide <|
    timerInterruptionAdmission.outcome = .committed ∧
      timerInterruptionAdmission.state.compensationParentContextRetentions = [] ∧
      compensationEventSubProcessSnapshotStateValid
          CompensationEventSubProcessSnapshotAdmissionConformance.program
          timerInterruptionAdmission.state = true

/-- Timer interruption removes the failed child's reservation in the same regional transition. -/
def timer_interruption_purges_without_promotion : Bool := decide <|
    timerInterruptionResult.outcome = .committed ∧
      timerInterruptionResult.state.compensationParentContextRetentions = [] ∧
      (timerInterruptionResult.state.waits.map fun wait => wait.task.id.value) =
        ["EscalationTask"]

def oneOfTwoSameDefinitionPurged : RuntimeState :=
  purgeCompensationParentContextsAfterUnsuccessfulScopeRemoval <|
    cancelScopeSubtree
      CompensationEventSubProcessSnapshotConformance.twoLiveReservedState
      CompensationEventSubProcessSnapshotConformance.childOccurrence.id .remove

/-- Regional purge keys by complete occurrence identity, not the shared definition scope. -/
def same_definition_occurrences_do_not_alias_during_purge : Bool := decide <|
    oneOfTwoSameDefinitionPurged.compensationParentContextRetentions =
      [.provisional CompensationEventSubProcessSnapshotConformance.secondChildOccurrence
        CompensationEventSubProcessSnapshotAdmissionConformance.handlerScopeId] ∧
      oneOfTwoSameDefinitionPurged.scopeOccurrences.any (fun occurrence =>
        occurrence.id ==
          CompensationEventSubProcessSnapshotConformance.secondChildOccurrence.id) = true

def removedRootWithPromotedChild : RuntimeState :=
  cancelScopeSubtree CompensationEventSubProcessSnapshotConformance.settledChildState
    CompensationEventSubProcessSnapshotConformance.rootOccurrence.id .remove

/-- Removing the owning root purges promoted children even though their completed occurrences are already absent. -/
def root_removal_purges_promoted_child_snapshots : Bool := decide <|
    removedRootWithPromotedChild.compensationParentContextRetentions = []

/-- The footprint vocabulary names capacity, exact retention identity, captured Process data, and purge ownership. -/
def snapshot_footprints_are_exact_and_region_owned : Bool := decide <|
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
        , .ordinary (.processVariable "context") ]
      , [ .compensationParentContextCapacity
        , .compensationParentContextRetention
            CompensationEventSubProcessSnapshotConformance.childOccurrence ] ) ∧
    compensationSnapshotPurgeAtoms
        CompensationEventSubProcessSnapshotConformance.twoLiveReservedState
        (fun owner => owner ==
          CompensationEventSubProcessSnapshotConformance.childOccurrence.id) =
      [ .compensationParentContextCapacity
      , .compensationParentContextRetention
          CompensationEventSubProcessSnapshotConformance.childOccurrence ]

/-- Every executable check of this module, named for the driver's failure report. -/
def compensationEventSubProcessSnapshotLifecycleIntegrationConformanceChecks : List (String × Bool) := [
  ("child_entry_reserves_before_exposing_child_work", child_entry_reserves_before_exposing_child_work),
  ("child_completion_promotes_the_deciding_prestate", child_completion_promotes_the_deciding_prestate),
  ("timer_admission_purges_before_closure", timer_admission_purges_before_closure),
  ("timer_interruption_purges_without_promotion", timer_interruption_purges_without_promotion),
  ("same_definition_occurrences_do_not_alias_during_purge", same_definition_occurrences_do_not_alias_during_purge),
  ("root_removal_purges_promoted_child_snapshots", root_removal_purges_promoted_child_snapshots),
  ("snapshot_footprints_are_exact_and_region_owned", snapshot_footprints_are_exact_and_region_owned)
]

end BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance
