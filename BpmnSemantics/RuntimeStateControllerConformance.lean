import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SequentialMultiInstanceProgramBindingConformance

/-! # Runtime-state sequential Multi-Instance controller negative fixtures

This module owns the kernel-decided sequential Multi-Instance controller fixtures separately from
the Activity-occurrence reductions so the independent proof families do not accumulate in one
kernel target under the repository's hard 3 GiB Lean measurement bound.
-/

namespace BpmnSemantics.RuntimeStateWellFormedConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def controllerProgram : Program :=
  SequentialMultiInstanceProgramBindingConformance.program

def controllerInstanceId : SemanticId :=
  SequentialMultiInstanceProgramBindingConformance.instanceId

def openControllerState : RuntimeState :=
  match SequentialMultiInstanceProgramBindingConformance.entered? with
  | some state => state
  | none => initialState

theorem open_controller_state_is_well_formed :
    runtimeStateWellFormed controllerProgram controllerInstanceId openControllerState = true := by
  decide +kernel

/-- `C1`: a controller whose identity names no Activity occurrence record. -/
def unownedControllerState : RuntimeState :=
  { openControllerState with
    sequentialMultiInstanceControllers :=
      openControllerState.sequentialMultiInstanceControllers.map fun controller =>
        { controller with activation := controller.activation + 1 } }

theorem unowned_controller_is_refused :
    runtimeStateWellFormed controllerProgram controllerInstanceId unownedControllerState = false := by
  decide +kernel

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
    runtimeStateWellFormed controllerProgram controllerInstanceId duplicateControllerState = false := by
  decide +kernel

theorem duplicate_controller_fails_uniqueness_with_binding_intact :
    controllerIdentitiesUnique duplicateControllerState = false ∧
      controllersOwnLiveActivity duplicateControllerState = true ∧
      controllersNotExhausted duplicateControllerState = true ∧
      canonicalCollectionOrder duplicateControllerState = true := by decide +kernel

/-- `C3`: an open controller whose slots already cover its whole snapshot. -/
def exhaustedControllerState : RuntimeState :=
  { openControllerState with
    sequentialMultiInstanceControllers :=
      openControllerState.sequentialMultiInstanceControllers.map fun controller =>
        { controller with outputSlots := controller.snapshot } }

theorem exhausted_controller_is_refused :
    runtimeStateWellFormed controllerProgram controllerInstanceId exhaustedControllerState = false := by
  decide +kernel

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
    runtimeStateWellFormed controllerProgram controllerInstanceId emptySnapshotControllerState = false := by
  decide +kernel

theorem empty_snapshot_controller_fails_remaining_work_with_binding_intact :
    controllersNotExhausted emptySnapshotControllerState = false ∧
      controllersOwnLiveActivity emptySnapshotControllerState = true ∧
      controllerIdentitiesUnique emptySnapshotControllerState = true := by decide +kernel

end BpmnSemantics.RuntimeStateWellFormedConformance
