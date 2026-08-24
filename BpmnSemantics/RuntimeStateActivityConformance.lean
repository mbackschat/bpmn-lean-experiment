import BpmnSemantics.ActivityBoundaryTimerConformance
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Runtime-state Activity and controller negative fixtures

This module owns the kernel-decided Activity occurrence and sequential Multi-Instance controller
fixtures separated from the other runtime-state negatives so each fixture owner stays within the
repository's hard 3 GiB Lean measurement bound.
-/

namespace BpmnSemantics.RuntimeStateWellFormedConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def program : Program := ActivityBoundaryTimerConformance.program

def instanceId : SemanticId := ActivityBoundaryTimerConformance.instanceId

def armedState : RuntimeState := ActivityBoundaryTimerConformance.armedState

theorem armed_state_is_well_formed :
    runtimeStateWellFormed program instanceId armedState = true := by decide +kernel

/-- `A1`, violating `AOO-BODY-01`: a record whose body has been removed while it survives. -/
def strandedActivityBodyState : RuntimeState :=
  { armedState with waits := [] }

theorem stranded_activity_body_is_refused :
    runtimeStateWellFormed program instanceId strandedActivityBodyState = false := by decide +kernel

theorem stranded_activity_body_fails_ownership_with_siblings_intact :
    activityRecordsOwnLiveWork strandedActivityBodyState = false ∧
      attachedTimersUnambiguous strandedActivityBodyState = true ∧
      activityIdentitiesUnique strandedActivityBodyState = true ∧
      waitOwnersLive strandedActivityBodyState = true := by decide +kernel

/-- `A2`, violating `AOO-ATTACH-01`: two records claiming one live deadline. -/
def ambiguousAttachedTimerState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences ++
      armedState.activityOccurrences.map fun record =>
        { record with activityElementId := { value := record.activityElementId.value ++ "_Other" } }
    activityActivations := armedState.activityActivations ++
      armedState.activityOccurrences.map fun record =>
        { taskId := { value := record.activityElementId.value ++ "_Other" }
          count := record.activation } }

theorem ambiguous_attached_timer_is_refused :
    runtimeStateWellFormed program instanceId ambiguousAttachedTimerState = false := by decide +kernel

theorem ambiguous_attached_timer_fails_attachment_with_identity_intact :
    attachedTimersUnambiguous ambiguousAttachedTimerState = false ∧
      activityIdentitiesUnique ambiguousAttachedTimerState = true := by decide +kernel

/-- `A3`, violating `AOO-ID-01`: one Activity occurrence identity carried twice. -/
def duplicateActivityIdentityState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences ++ armedState.activityOccurrences }

theorem duplicate_activity_identity_is_refused :
    runtimeStateWellFormed program instanceId duplicateActivityIdentityState = false := by
  decide +kernel

theorem duplicate_activity_identity_fails_uniqueness :
    activityIdentitiesUnique duplicateActivityIdentityState = false := by decide +kernel

/-- The incidental Activity/task counter agreement is asserted nowhere, so disagreement stays admitted. -/
def disagreeingActivityCounterState : RuntimeState :=
  { armedState with
    activityActivations := armedState.activityActivations.map fun activation =>
      { activation with count := activation.count + 4 } }

theorem disagreeing_activity_counter_is_admitted :
    runtimeStateWellFormed program instanceId disagreeingActivityCounterState = true := by
  decide +kernel

private def controllerOn (record : ActivityOccurrence)
    (outputSlots : List String) : SequentialMultiInstanceController :=
  { processInstanceId := record.processInstanceId
    activityElementId := record.activityElementId
    activation := record.activation
    snapshot := ["Invoice_1", "Invoice_2"]
    outputSlots }

def openControllerState : RuntimeState :=
  { armedState with
    sequentialMultiInstanceControllers :=
      armedState.activityOccurrences.map (controllerOn · []) }

theorem open_controller_state_is_well_formed :
    runtimeStateWellFormed program instanceId openControllerState = true := by decide +kernel

/-- `C1`: a controller whose identity names no Activity occurrence record. -/
def unownedControllerState : RuntimeState :=
  { openControllerState with
    sequentialMultiInstanceControllers :=
      openControllerState.sequentialMultiInstanceControllers.map fun controller =>
        { controller with activation := controller.activation + 1 } }

theorem unowned_controller_is_refused :
    runtimeStateWellFormed program instanceId unownedControllerState = false := by decide +kernel

theorem unowned_controller_fails_binding_with_siblings_intact :
    controllersOwnLiveActivity unownedControllerState = false ∧
      controllerIdentitiesUnique unownedControllerState = true ∧
      controllersNotExhausted unownedControllerState = true ∧
      activityRecordsOwnLiveWork unownedControllerState = true ∧
      activityIdentitiesUnique unownedControllerState = true ∧
      canonicalCollectionOrder unownedControllerState = true := by decide +kernel

/-- `C2`: one Activity occurrence carrying two controllers. -/
def duplicateControllerState : RuntimeState :=
  { openControllerState with
    sequentialMultiInstanceControllers :=
      openControllerState.sequentialMultiInstanceControllers ++
        openControllerState.sequentialMultiInstanceControllers }

theorem duplicate_controller_is_refused :
    runtimeStateWellFormed program instanceId duplicateControllerState = false := by decide +kernel

theorem duplicate_controller_fails_uniqueness_with_binding_intact :
    controllerIdentitiesUnique duplicateControllerState = false ∧
      controllersOwnLiveActivity duplicateControllerState = true ∧
      controllersNotExhausted duplicateControllerState = true ∧
      canonicalCollectionOrder duplicateControllerState = true := by decide +kernel

/-- `C3`: an open controller whose slots already cover its whole snapshot. -/
def exhaustedControllerState : RuntimeState :=
  { armedState with
    sequentialMultiInstanceControllers :=
      armedState.activityOccurrences.map (controllerOn · ["Reviewed_1", "Reviewed_2"]) }

theorem exhausted_controller_is_refused :
    runtimeStateWellFormed program instanceId exhaustedControllerState = false := by decide +kernel

theorem exhausted_controller_fails_remaining_work_with_binding_intact :
    controllersNotExhausted exhaustedControllerState = false ∧
      controllersOwnLiveActivity exhaustedControllerState = true ∧
      controllerIdentitiesUnique exhaustedControllerState = true := by decide +kernel

/-- `C4`: a controller over an empty collection, refused by the same conjunct as `C3`. -/
def emptySnapshotControllerState : RuntimeState :=
  { openControllerState with
    sequentialMultiInstanceControllers :=
      openControllerState.sequentialMultiInstanceControllers.map fun controller =>
        { controller with snapshot := [] } }

theorem empty_snapshot_controller_is_refused :
    runtimeStateWellFormed program instanceId emptySnapshotControllerState = false := by
  decide +kernel

theorem empty_snapshot_controller_fails_remaining_work_with_binding_intact :
    controllersNotExhausted emptySnapshotControllerState = false ∧
      controllersOwnLiveActivity emptySnapshotControllerState = true ∧
      controllerIdentitiesUnique emptySnapshotControllerState = true := by decide +kernel

end BpmnSemantics.RuntimeStateWellFormedConformance
