module

public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
public import BpmnSemantics.SequentialMultiInstanceProgramBindingConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
public import BpmnSemantics.SemanticProcess.CheckedGraphValidation
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
public import BpmnSemantics.SemanticProcess.CallActivity
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

/-! Fixture definitions and executable checks of [`RuntimeStateControllerConformance`](RuntimeStateControllerConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

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

def open_controller_state_is_well_formed : Bool := decide <|
    runtimeStateWellFormed controllerProgram controllerInstanceId openControllerState = true

/-- `C1`: a controller whose identity names no Activity occurrence record. -/
def unownedControllerState : RuntimeState :=
  { openControllerState with
    sequentialMultiInstanceControllers :=
      openControllerState.sequentialMultiInstanceControllers.map fun controller =>
        { controller with activation := controller.activation + 1 } }

def unowned_controller_is_refused : Bool := decide <|
    runtimeStateWellFormed controllerProgram controllerInstanceId unownedControllerState = false

def unowned_controller_fails_binding_with_siblings_intact : Bool := decide <|
    controllersOwnLiveActivity unownedControllerState = false ∧
      controllerIdentitiesUnique unownedControllerState = true ∧
      controllersNotExhausted unownedControllerState = true ∧
      activityRecordsOwnLiveWork unownedControllerState = true ∧
      activityIdentitiesUnique unownedControllerState = true ∧
      canonicalCollectionOrder unownedControllerState = true

/-- `C2`: one Activity occurrence carrying two controllers. -/
def duplicateControllerState : RuntimeState :=
  { openControllerState with
    sequentialMultiInstanceControllers :=
      openControllerState.sequentialMultiInstanceControllers ++
        openControllerState.sequentialMultiInstanceControllers }

def duplicate_controller_is_refused : Bool := decide <|
    runtimeStateWellFormed controllerProgram controllerInstanceId duplicateControllerState = false

def duplicate_controller_fails_uniqueness_with_binding_intact : Bool := decide <|
    controllerIdentitiesUnique duplicateControllerState = false ∧
      controllersOwnLiveActivity duplicateControllerState = true ∧
      controllersNotExhausted duplicateControllerState = true ∧
      canonicalCollectionOrder duplicateControllerState = true

/-- `C3`: an open controller whose slots already cover its whole snapshot. -/
def exhaustedControllerState : RuntimeState :=
  { openControllerState with
    sequentialMultiInstanceControllers :=
      openControllerState.sequentialMultiInstanceControllers.map fun controller =>
        { controller with outputSlots := controller.snapshot } }

def exhausted_controller_is_refused : Bool := decide <|
    runtimeStateWellFormed controllerProgram controllerInstanceId exhaustedControllerState = false

def exhausted_controller_fails_remaining_work_with_binding_intact : Bool := decide <|
    controllersNotExhausted exhaustedControllerState = false ∧
      controllersOwnLiveActivity exhaustedControllerState = true ∧
      controllerIdentitiesUnique exhaustedControllerState = true

/-- `C4`: a controller over an empty collection, refused by the same conjunct as `C3`. -/
def emptySnapshotControllerState : RuntimeState :=
  { openControllerState with
    sequentialMultiInstanceControllers :=
      openControllerState.sequentialMultiInstanceControllers.map fun controller =>
        { controller with snapshot := [] } }

def empty_snapshot_controller_is_refused : Bool := decide <|
    runtimeStateWellFormed controllerProgram controllerInstanceId emptySnapshotControllerState = false

def empty_snapshot_controller_fails_remaining_work_with_binding_intact : Bool := decide <|
    controllersNotExhausted emptySnapshotControllerState = false ∧
      controllersOwnLiveActivity emptySnapshotControllerState = true ∧
      controllerIdentitiesUnique emptySnapshotControllerState = true

/-- Every executable check of this module, named for the driver's failure report. -/
def runtimeStateControllerConformanceChecks : List (String × Bool) := [
  ("open_controller_state_is_well_formed", open_controller_state_is_well_formed),
  ("unowned_controller_is_refused", unowned_controller_is_refused),
  ("unowned_controller_fails_binding_with_siblings_intact", unowned_controller_fails_binding_with_siblings_intact),
  ("duplicate_controller_is_refused", duplicate_controller_is_refused),
  ("duplicate_controller_fails_uniqueness_with_binding_intact", duplicate_controller_fails_uniqueness_with_binding_intact),
  ("exhausted_controller_is_refused", exhausted_controller_is_refused),
  ("exhausted_controller_fails_remaining_work_with_binding_intact", exhausted_controller_fails_remaining_work_with_binding_intact),
  ("empty_snapshot_controller_is_refused", empty_snapshot_controller_is_refused),
  ("empty_snapshot_controller_fails_remaining_work_with_binding_intact", empty_snapshot_controller_fails_remaining_work_with_binding_intact)
]

end BpmnSemantics.RuntimeStateWellFormedConformance
