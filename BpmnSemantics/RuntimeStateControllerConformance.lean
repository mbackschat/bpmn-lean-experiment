module

public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
public import BpmnSemantics.SequentialMultiInstanceProgramBindingConformance
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries
import all Init.Data.List.Control
import all Init.Data.String.Basic
import all Init.Data.String.Bootstrap
import all Init.Data.String.Decode
import all Init.Data.String.Defs
import all Init.Data.String.Extra
import all Init.Data.String.FindPos
import all Init.Data.String.Hashable
import all Init.Data.String.Iter
import all Init.Data.String.Iter.Basic
import all Init.Data.String.Iter.Intercalate
import all Init.Data.String.Iterate
import all Init.Data.String.Iterator
import all Init.Data.String.Legacy
import all Init.Data.String.Length
import all Init.Data.String.Modify
import all Init.Data.String.OrderInstances
import all Init.Data.String.Pattern
import all Init.Data.String.Pattern.Basic
import all Init.Data.String.Pattern.Char
import all Init.Data.String.Pattern.Pred
import all Init.Data.String.Pattern.String
import all Init.Data.String.PosRaw
import all Init.Data.String.Search
import all Init.Data.String.Slice
import all Init.Data.String.Stream
import all Init.Data.String.Subslice
import all Init.Data.String.Substring
import all Init.Data.String.TakeDrop
import all Init.Data.String.Termination
import all Init.Data.String.ToSlice
import all Lean.Data.Json.Basic
import all Lean.Data.Json.Elab
import all Lean.Data.Json.FromToJson
import all Lean.Data.Json.FromToJson.Basic
import all Lean.Data.Json.FromToJson.Extra
import all Lean.Data.Json.Parser
import all Lean.Data.Json.Printer
import all Lean.Data.Json.Stream

/-! # Runtime-state sequential Multi-Instance controller negative fixtures

This module owns the kernel-decided sequential Multi-Instance controller fixtures separately from
the Activity-occurrence reductions so the independent proof families do not accumulate in one
kernel target under the repository's hard 3 GiB Lean measurement bound.
-/

@[expose] public section

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
