import BpmnSemantics.SemanticProcess.ParallelMultiInstanceContract

/-! # Parallel Multi-Instance outer controller

The immutable ordered input snapshot and fixed indexed result partition for one open outer Activity.
List position is the zero-based slot index, so no stored index can disagree with canonical input
order. Both slot variants retain the exact child task identity; completion later replaces one
pending slot in place and therefore preserves that indexed identity.

Planned, generated, active, and completed instance counts are derived from the slot list. None is a
stored counter that can drift from the partition.

Scope boundary: controller representation and derived projections. It defines no transition,
evaluator, runtime-state field, admission rule, or public observation.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- One fixed input-index slot, retaining its exact child task identity across completion. -/
inductive ParallelMultiInstanceSlot where
  | pending (taskId : UserTaskInstanceId)
  | completed (taskId : UserTaskInstanceId) (result : String)
  deriving Repr, DecidableEq

/-- The child task identity owned by either state of one slot. -/
def ParallelMultiInstanceSlot.taskId : ParallelMultiInstanceSlot → UserTaskInstanceId
  | .pending taskId
  | .completed taskId _ => taskId

/-- The scalar result exists exactly for a completed slot. -/
def ParallelMultiInstanceSlot.result? : ParallelMultiInstanceSlot → Option String
  | .pending _ => none
  | .completed _ result => some result

/-- One stable outer parallel Multi-Instance Activity controller. -/
structure ParallelMultiInstanceController where
  id : ActivityOccurrenceId
  snapshot : List String
  slots : List ParallelMultiInstanceSlot
  deriving Repr, DecidableEq

/-- Canonical zero-based slot indices, derived from fixed list position. -/
def indexedParallelMultiInstanceSlotsFrom (index : Nat) :
    List ParallelMultiInstanceSlot → List (Nat × ParallelMultiInstanceSlot)
  | [] => []
  | slot :: rest => (index, slot) :: indexedParallelMultiInstanceSlotsFrom (index + 1) rest

/-- Every controller slot paired with its canonical zero-based input index. -/
def indexedParallelMultiInstanceSlots (controller : ParallelMultiInstanceController) :
    List (Nat × ParallelMultiInstanceSlot) :=
  indexedParallelMultiInstanceSlotsFrom 0 controller.slots

/-- Planned instances, equal by representation to the fixed slot count. -/
def parallelPlannedInstanceCount (controller : ParallelMultiInstanceController) : Nat :=
  controller.slots.length

/-- Generated instances, equal by atomic-entry representation to the fixed slot count. -/
def parallelGeneratedInstanceCount (controller : ParallelMultiInstanceController) : Nat :=
  controller.slots.length

/-- Active instances, derived only from pending slot variants. -/
def parallelActiveSlotCount : List ParallelMultiInstanceSlot → Nat
  | [] => 0
  | .pending _ :: rest => parallelActiveSlotCount rest + 1
  | .completed _ _ :: rest => parallelActiveSlotCount rest

def parallelActiveInstanceCount (controller : ParallelMultiInstanceController) : Nat :=
  parallelActiveSlotCount controller.slots

/-- Completed instances, derived only from completed slot variants. -/
def parallelCompletedSlotCount : List ParallelMultiInstanceSlot → Nat
  | [] => 0
  | .pending _ :: rest => parallelCompletedSlotCount rest
  | .completed _ _ :: rest => parallelCompletedSlotCount rest + 1

def parallelCompletedInstanceCount (controller : ParallelMultiInstanceController) : Nat :=
  parallelCompletedSlotCount controller.slots

/-- Pending child identities in fixed input-index order. -/
def pendingParallelTaskIds : List ParallelMultiInstanceSlot → List UserTaskInstanceId
  | [] => []
  | .pending taskId :: rest => taskId :: pendingParallelTaskIds rest
  | .completed _ _ :: rest => pendingParallelTaskIds rest

/-- Every child identity, preserving the fixed slot order. -/
def parallelSlotTaskIds (slots : List ParallelMultiInstanceSlot) : List UserTaskInstanceId :=
  slots.map ParallelMultiInstanceSlot.taskId

/-- Complete ordered results, available exactly when every slot is completed. -/
def completedParallelResults? : List ParallelMultiInstanceSlot → Option (List String)
  | [] => some []
  | .pending _ :: _ => none
  | .completed _ result :: rest => do
      let remaining ← completedParallelResults? rest
      pure (result :: remaining)

/-- Number of pending slots carrying one exact child identity. -/
def pendingParallelSlotCount (target : UserTaskInstanceId) :
    List ParallelMultiInstanceSlot → Nat
  | [] => 0
  | .pending taskId :: rest =>
      (if taskId = target then 1 else 0) + pendingParallelSlotCount target rest
  | .completed _ _ :: rest => pendingParallelSlotCount target rest

/-- Complete one matching pending slot without moving or changing its identity. -/
def completeParallelSlot (target : UserTaskInstanceId) (result : String) :
    ParallelMultiInstanceSlot → ParallelMultiInstanceSlot
  | .pending taskId =>
      if taskId = target then .completed taskId result else .pending taskId
  | completed@(.completed _ _) => completed

/-- Pointwise completion preserves the fixed slot array and every child identity. -/
def replacePendingParallelSlot (slots : List ParallelMultiInstanceSlot)
    (target : UserTaskInstanceId) (result : String) : List ParallelMultiInstanceSlot :=
  slots.map (completeParallelSlot target result)

/-- Mint the child identity for one zero-based input index above the pre-entry high-water mark. -/
def mintedParallelTaskId (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (highWater index : Nat) : UserTaskInstanceId :=
  { processInstanceId
    elementId := ⟨taskId.value⟩
    activation := highWater + index + 1 }

/-- Atomically planned pending slots, one per snapshot index. -/
def pendingParallelSlotsFrom (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (highWater : Nat) : List String → Nat → List ParallelMultiInstanceSlot
  | [], _ => []
  | _ :: rest, index =>
      .pending (mintedParallelTaskId processInstanceId taskId highWater index) ::
        pendingParallelSlotsFrom processInstanceId taskId highWater rest (index + 1)

def pendingParallelSlots (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (highWater : Nat) (snapshot : List String) : List ParallelMultiInstanceSlot :=
  pendingParallelSlotsFrom processInstanceId taskId highWater snapshot 0

def parallelControllerNamesIdentity (controller : ParallelMultiInstanceController)
    (processInstanceId activityElementId : SemanticId) (activation : Nat) : Bool :=
  controller.id.processInstanceId == processInstanceId &&
    controller.id.activityElementId == activityElementId &&
    controller.id.activation == activation

def parallelMultiInstanceControllerBefore (left right : ParallelMultiInstanceController) : Bool :=
  if left.id.processInstanceId.value ≠ right.id.processInstanceId.value then
    left.id.processInstanceId.value < right.id.processInstanceId.value
  else if left.id.activityElementId.value ≠ right.id.activityElementId.value then
    left.id.activityElementId.value < right.id.activityElementId.value
  else left.id.activation < right.id.activation

def parallelMultiInstanceControllersOrdered : List ParallelMultiInstanceController → Bool
  | [] => true
  | [_] => true
  | left :: right :: rest =>
      !parallelMultiInstanceControllerBefore right left &&
        parallelMultiInstanceControllersOrdered (right :: rest)

def insertParallelMultiInstanceController (controller : ParallelMultiInstanceController) :
    List ParallelMultiInstanceController → List ParallelMultiInstanceController
  | [] => [controller]
  | current :: rest =>
      if parallelMultiInstanceControllerBefore controller current then
        controller :: current :: rest
      else current :: insertParallelMultiInstanceController controller rest

end BpmnSemantics.SemanticProcess
