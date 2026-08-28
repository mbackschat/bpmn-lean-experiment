import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeInvariant
import BpmnSemantics.SemanticProcess.ActivityOccurrence

/-! # Parallel Multi-Instance Program-binding facts

This module owns the public proof view of one Parallel Multi-Instance controller's exact Program and
shared-runtime bindings. It exposes only propositions already checked by the runtime validator so
downstream preservation proofs do not unfold its private implementation.

Scope boundary: proof facts for one controller. This module defines no validator, transition,
evaluator, runtime representation, admission rule, public observation, or Program-wide census.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Exact Program and shared-runtime witnesses owned by one admitted Parallel Multi-Instance
controller. The carrier is proof-only; the Program-wide operation census remains a separate
aggregate fact. -/
structure ParallelControllerProgramBindingFacts (program : Program) (state : RuntimeState)
    (controller : ParallelMultiInstanceController) : Prop where
  witnesses : ∃ (entry : SemanticOperation) (arm : ParallelMultiInstanceArm)
      (record : ActivityOccurrence) (timer : TimerOccurrenceId) (timerWait : TimerWait)
      (childWaits : List UserTaskWait) (pendingTask : UserTaskInstanceId)
      (pendingWait : UserTaskWait),
    state.activityOccurrences.filter (fun candidate =>
      parallelControllerNamesIdentity controller candidate.processInstanceId
        ⟨candidate.activityElementId.value⟩ candidate.activation) = [record] ∧
    program.operations.filter (fun operation =>
      match ParallelMultiInstanceArm.ofOperation? operation with
      | some candidate => candidate.taskId.value == controller.id.activityElementId.value
      | none => false) = [entry] ∧
    ParallelMultiInstanceArm.ofOperation? entry = some arm ∧
    operationOwningScope? program entry.id = some record.owner.definitionScopeId ∧
    parallelMultiInstanceRuntimeWellFormed arm
      { processInstanceId := controller.id.processInstanceId
        controller := some controller
        liveChildren := pendingParallelTaskIds controller.slots
        lifetimeTimer := some timer
        processBindings := state.variables.process.bindings
        taskActivationHighWater := activationCount state arm.taskId
        activityActivationHighWater := activityActivationCount state arm.taskId
        timerActivationHighWater := timerActivationCount state arm.boundaryTimer.elementId } = true ∧
    activityBodyParallelTasks? record = some (pendingParallelTaskIds controller.slots) ∧
    state.waits.filter (fun wait =>
      (pendingParallelTaskIds controller.slots).contains
        (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : UserTaskInstanceId)) =
      childWaits ∧
    childWaits.length = (pendingParallelTaskIds controller.slots).length ∧
    (childWaits.map fun wait =>
      (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ :
        UserTaskInstanceId)).Nodup ∧
    childWaits.all (fun wait =>
      wait.owner == record.owner && wait.task.id == arm.taskId &&
        wait.task.name == arm.taskName && wait.metadata == none &&
        wait.output == arm.normalOutput) = true ∧
    record.attachedTimers = [timer] ∧
    state.timerWaits.filter (timerIdNamesWait timer) = [timerWait] ∧
    timerWait.owner = record.owner ∧
    timerWait.elementId = arm.boundaryTimer.elementId ∧
    timerWait.output = arm.boundaryTimer.output ∧
    pendingTask ∈ pendingParallelTaskIds controller.slots ∧
    pendingWait ∈ state.waits ∧
    (⟨pendingWait.processInstanceId, ⟨pendingWait.task.id.value⟩, pendingWait.activation⟩ :
      UserTaskInstanceId) = pendingTask ∧
    pendingWait.owner = record.owner ∧
    pendingWait.task.id = arm.taskId

end BpmnSemantics.SemanticProcess
