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

/-- Pending task identities retain their relative order inside the complete slot-identity list. -/
theorem pendingParallelTaskIds_sublist_parallelSlotTaskIds
    (slots : List ParallelMultiInstanceSlot) :
    List.Sublist (pendingParallelTaskIds slots) (parallelSlotTaskIds slots) := by
  induction slots with
  | nil => simp [pendingParallelTaskIds, parallelSlotTaskIds]
  | cons slot rest ih =>
      cases slot with
      | pending taskId =>
          simpa [pendingParallelTaskIds, parallelSlotTaskIds, ParallelMultiInstanceSlot.taskId]
            using ih.cons_cons taskId
      | completed taskId result =>
          simpa [pendingParallelTaskIds, parallelSlotTaskIds, ParallelMultiInstanceSlot.taskId]
            using ih.cons taskId

/-- Equal-length duplicate-free lists with a one-way inclusion contain exactly the same values. -/
theorem nodup_subset_of_nodup_subset_length_eq [BEq α] [LawfulBEq α]
    {left right : List α} (leftNodup : left.Nodup) (rightNodup : right.Nodup)
    (included : left ⊆ right) (sameLength : left.length = right.length) :
    right ⊆ left := by
  induction left generalizing right with
  | nil =>
      have rightEmpty : right = [] := List.eq_nil_of_length_eq_zero (by simpa using sameLength.symm)
      simp [rightEmpty]
  | cons head tail ih =>
      obtain ⟨headFresh, tailNodup⟩ := List.nodup_cons.mp leftNodup
      have headMember : head ∈ right := included (by simp)
      have tailIncluded : tail ⊆ right.erase head := by
        intro candidate candidateMember
        rw [rightNodup.mem_erase_iff]
        exact ⟨fun same => headFresh (same ▸ candidateMember), included (by simp [candidateMember])⟩
      have erasedLength : tail.length = (right.erase head).length := by
        rw [List.length_erase_of_mem headMember]
        simp only [List.length_cons] at sameLength
        omega
      have erasedIncluded := ih tailNodup (rightNodup.erase head) tailIncluded erasedLength
      intro candidate candidateMember
      by_cases same : candidate = head
      · simp [same]
      · exact List.mem_cons_of_mem head
          (erasedIncluded ((rightNodup.mem_erase_iff).mpr ⟨same, candidateMember⟩))

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
