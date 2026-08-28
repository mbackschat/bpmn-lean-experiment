import BpmnSemantics.SemanticProcess.ParallelMultiInstanceController

/-! # Parallel Multi-Instance family runtime invariant

This family-local carrier isolates the proved transition account while shared `RuntimeState` roots are
integrated separately. A present controller is the one live outer Activity region. Its pending slot
identities equal the canonical live-child list, it owns exactly one lifetime Timer, and output remains
absent. A closed region has no controller, child, or Timer. The enabled route distinguishes normal
from Timer closure without retaining a second copy of controller progress.

Scope boundary: the family-local state relation and its executable predicate. It does not define a
transition, public observation, shared runtime-state field, or host state.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The exact state slice owned by one bounded parallel Multi-Instance family. -/
structure ParallelMultiInstanceRuntimeState where
  processInstanceId : SemanticId
  controller : Option ParallelMultiInstanceController := none
  liveChildren : List UserTaskInstanceId := []
  lifetimeTimer : Option TimerOccurrenceId := none
  processBindings : List VariableBinding := []
  enabledOutput : Option ControlPlaceId := none
  taskActivationHighWater : Nat := 0
  activityActivationHighWater : Nat := 0
  timerActivationHighWater : Nat := 0
  deriving Repr, DecidableEq

/-- Initial family slice for one running Process instance. -/
def emptyParallelMultiInstanceRuntimeState (processInstanceId : SemanticId)
    (processBindings : List VariableBinding) : ParallelMultiInstanceRuntimeState :=
  { processInstanceId, processBindings }

def parallelOutputAbsent (arm : ParallelMultiInstanceArm)
    (state : ParallelMultiInstanceRuntimeState) : Bool :=
  state.processBindings.all fun binding =>
    decide (binding.name ≠ arm.data.output.dataObjectReferenceId)

def parallelSlotIdentityValid (arm : ParallelMultiInstanceArm)
    (state : ParallelMultiInstanceRuntimeState) (slot : ParallelMultiInstanceSlot) : Bool :=
  let taskId := slot.taskId
  decide (taskId.processInstanceId = state.processInstanceId) &&
    decide (taskId.elementId.value = arm.taskId.value) &&
    decide (taskId.activation ≤ state.taskActivationHighWater)

/-- The complete applicable invariant for one open or closed family slice. -/
def parallelMultiInstanceRuntimeWellFormed (arm : ParallelMultiInstanceArm)
    (state : ParallelMultiInstanceRuntimeState) : Bool :=
  match state.controller with
  | some controller =>
      decide (controller.id.processInstanceId = state.processInstanceId) &&
        decide (controller.id.activityElementId.value = arm.taskId.value) &&
        decide (controller.id.activation ≤ state.activityActivationHighWater) &&
        decide (controller.snapshot.length = controller.slots.length) &&
        decide ((parallelSlotTaskIds controller.slots).Nodup) &&
        controller.slots.all (parallelSlotIdentityValid arm state) &&
        decide (state.liveChildren = pendingParallelTaskIds controller.slots) &&
        (match state.lifetimeTimer with
          | some timer =>
              decide (timer.processInstanceId = state.processInstanceId) &&
                decide (timer.elementId.value = arm.boundaryTimer.elementId.value) &&
                decide (timer.activation ≤ state.timerActivationHighWater)
          | none => false) &&
        state.enabledOutput.isNone && parallelOutputAbsent arm state
  | none =>
      decide (state.liveChildren = []) && state.lifetimeTimer.isNone &&
        match state.enabledOutput with
        | none => parallelOutputAbsent arm state
        | some output =>
            if output = arm.normalOutput then true
            else decide (output = arm.boundaryTimer.output) && parallelOutputAbsent arm state

end BpmnSemantics.SemanticProcess
