import BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import BpmnSemantics.SemanticProcess.ActivityOccurrence
import BpmnSemantics.SemanticProcess.RuntimeStateIdentityBound

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

private def parallelRecordForController? (state : RuntimeState)
    (controller : ParallelMultiInstanceController) : Option ActivityOccurrence :=
  match state.activityOccurrences.filter fun record =>
      parallelControllerNamesIdentity controller record.processInstanceId
        ⟨record.activityElementId.value⟩ record.activation with
  | [record] => some record
  | _ => none

private def parallelWaitTaskId (wait : UserTaskWait) : UserTaskInstanceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.task.id.value⟩
    activation := wait.activation }

private def parallelControllerProgramBindingValid (program : Program) (state : RuntimeState)
    (controller : ParallelMultiInstanceController) : Bool :=
  match parallelRecordForController? state controller with
  | none => false
  | some record =>
      match program.operations.filter fun operation =>
          match ParallelMultiInstanceArm.ofOperation? operation with
          | some arm => arm.taskId.value == controller.id.activityElementId.value
          | none => false with
      | [entry] =>
          match ParallelMultiInstanceArm.ofOperation? entry with
          | none => false
          | some arm =>
              let pending := pendingParallelTaskIds controller.slots
              let waits := state.waits.filter fun wait => pending.contains (parallelWaitTaskId wait)
              operationOwningScope? program entry.id == some record.owner.definitionScopeId &&
                parallelMultiInstanceRuntimeWellFormed arm
                  { processInstanceId := controller.id.processInstanceId
                    controller := some controller
                    liveChildren := pending
                    lifetimeTimer := match record.attachedTimers with
                      | [timer] => some timer
                      | _ => none
                    processBindings := state.variables.process.bindings
                    taskActivationHighWater := activationCount state arm.taskId
                    activityActivationHighWater := activityActivationCount state arm.taskId
                    timerActivationHighWater := timerActivationCount state arm.boundaryTimer.elementId } &&
                activityBodyParallelTasks? record == some pending &&
                waits.length = pending.length &&
                decide ((waits.map parallelWaitTaskId).Nodup) &&
                waits.all fun wait =>
                  wait.owner == record.owner && wait.task.id == arm.taskId &&
                    wait.task.name == arm.taskName && wait.metadata == none &&
                    wait.output == arm.normalOutput &&
                match record.attachedTimers with
                | [timer] =>
                    match state.timerWaits.filter (timerIdNamesWait timer) with
                    | [wait] =>
                        wait.owner == record.owner &&
                          wait.elementId == arm.boundaryTimer.elementId &&
                          wait.output == arm.boundaryTimer.output
                    | _ => false
                | _ => false
      | _ => false

private def sameParallelControllerIdentity (left right : ParallelMultiInstanceController) : Bool :=
  left.id == right.id

def parallelMultiInstanceProgramBindingsValid (program : Program) (state : RuntimeState) : Bool :=
  state.parallelMultiInstanceControllers.all
      (parallelControllerProgramBindingValid program state) &&
    state.parallelMultiInstanceControllers.all
      (fun controller =>
        (state.parallelMultiInstanceControllers.filter
          (sameParallelControllerIdentity controller)).length = 1) &&
    parallelMultiInstanceControllersOrdered state.parallelMultiInstanceControllers &&
    program.operations.all fun operation =>
      match ParallelMultiInstanceArm.ofOperation? operation with
      | none => true
      | some arm =>
          match operationOwningScope? program operation.id with
          | none => false
          | some scopeId =>
              let controllers := state.parallelMultiInstanceControllers.filter fun controller =>
                controller.id.activityElementId.value == arm.taskId.value
              let records := state.activityOccurrences.filter fun record =>
                record.activityElementId.value == arm.taskId.value &&
                  record.owner.definitionScopeId == scopeId &&
                  (activityBodyParallelTasks? record).isSome
              let waits := state.waits.filter fun wait =>
                wait.task.id == arm.taskId && wait.owner.definitionScopeId == scopeId
              let timers := state.timerWaits.filter fun wait =>
                wait.elementId == arm.boundaryTimer.elementId &&
                  wait.owner.definitionScopeId == scopeId
              controllers.length = records.length &&
                controllers.length = timers.length &&
              waits.length = controllers.foldl
                  (fun count controller =>
                    count + (pendingParallelTaskIds controller.slots).length) 0

private theorem pendingParallelTaskIds_have_slot_task_element
    (arm : ParallelMultiInstanceArm) (state : ParallelMultiInstanceRuntimeState)
    (slots : List ParallelMultiInstanceSlot)
    (valid : ∀ slot ∈ slots, parallelSlotIdentityValid arm state slot = true) :
    ∀ taskId ∈ pendingParallelTaskIds slots,
      taskId.elementId.value = arm.taskId.value := by
  induction slots with
  | nil => simp [pendingParallelTaskIds]
  | cons slot rest ih =>
      cases slot with
      | pending taskId =>
          intro candidate member
          simp only [pendingParallelTaskIds, List.mem_cons] at member
          cases member with
          | inl same =>
              subst candidate
              have head := valid (.pending taskId) (by simp)
              simp only [parallelSlotIdentityValid, Bool.and_eq_true,
                decide_eq_true_eq] at head
              exact head.1.2
          | inr restMember =>
              exact ih (fun candidate candidateMember => valid candidate (by simp [candidateMember]))
                candidate restMember
      | completed taskId result =>
          intro candidate member
          exact ih (fun candidate candidateMember => valid candidate (by simp [candidateMember]))
            candidate (by simpa [pendingParallelTaskIds] using member)

private theorem filter_insertUserTaskWait_rejected (predicate : UserTaskWait → Bool)
    (inserted : UserTaskWait) (waits : List UserTaskWait)
    (rejected : predicate inserted = false) :
    (insertUserTaskWait inserted waits).filter predicate = waits.filter predicate := by
  induction waits with
  | nil => simp [insertUserTaskWait, rejected]
  | cons current rest ih =>
      simp only [insertUserTaskWait]
      split
      · simp only [List.filter_cons, rejected, Bool.false_eq_true, ↓reduceIte]
      · simp only [List.filter_cons, ih]

private theorem taskDefinitionId_eq_of_value_eq (left right : TaskDefinitionId)
    (equal : left.value = right.value) : left = right := by
  cases left
  cases right
  simp_all

private theorem nodeId_eq_of_value_eq (left right : NodeId)
    (equal : left.value = right.value) : left = right := by
  cases left
  cases right
  simp_all

theorem parallelMultiInstanceProgramBindingsValid_insertUserTaskWait_frame
    (program : Program) (state : RuntimeState) (inserted : UserTaskWait)
    (disjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
          task.id ≠ inserted.task.id
      | .awaitParallelMultiInstanceUserTask _ _ _ taskId _ _ _ _ _ _ =>
          taskId ≠ inserted.task.id
      | _ => True)
    (valid : parallelMultiInstanceProgramBindingsValid program state = true) :
    parallelMultiInstanceProgramBindingsValid program
      { state with
        waits := insertUserTaskWait inserted state.waits
        activations := setActivationCount state.activations inserted.task.id inserted.activation } =
      true := by
  simp only [parallelMultiInstanceProgramBindingsValid, Bool.and_eq_true,
    List.all_eq_true] at valid ⊢
  refine ⟨⟨⟨?_, valid.1.1.2⟩, valid.1.2⟩, ?_⟩
  · intro controller member
    have prior := valid.1.1.1 controller member
    unfold parallelControllerProgramBindingValid parallelRecordForController? at prior ⊢
    simp only at prior ⊢
    generalize recordsEq : state.activityOccurrences.filter
      (fun record => parallelControllerNamesIdentity controller record.processInstanceId
        ⟨record.activityElementId.value⟩ record.activation) = records at prior ⊢
    cases records with
    | nil => simp at prior
    | cons record rest =>
        cases rest with
        | cons next tail => simp at prior
        | nil =>
            simp only at prior ⊢
            generalize operationsEq : program.operations.filter (fun operation =>
              match ParallelMultiInstanceArm.ofOperation? operation with
              | some arm => arm.taskId.value == controller.id.activityElementId.value
              | none => false) = operations at prior ⊢
            cases operations with
            | nil => simp at prior
            | cons entry remaining =>
                cases remaining with
                | cons next tail => simp at prior
                | nil =>
                    cases entry <;>
                      simp only [ParallelMultiInstanceArm.ofOperation?] at prior ⊢
                    all_goals try simp at prior
                    case awaitParallelMultiInstanceUserTask id origin input taskId taskName data
                        normalOutput boundaryTimer completionCondition limits =>
                      simp only [Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq] at prior ⊢
                      have entryMember : SemanticOperation.awaitParallelMultiInstanceUserTask id
                          origin input taskId taskName data normalOutput boundaryTimer
                            completionCondition limits ∈ program.operations := by
                        have filteredMember : SemanticOperation.awaitParallelMultiInstanceUserTask
                            id origin input taskId taskName data normalOutput boundaryTimer
                              completionCondition limits ∈ program.operations.filter (fun operation =>
                                match ParallelMultiInstanceArm.ofOperation? operation with
                                | some arm =>
                                    arm.taskId.value == controller.id.activityElementId.value
                                | none => false) := by
                          rw [operationsEq]
                          simp
                        exact (List.mem_filter.mp filteredMember).1
                      have different := disjoint
                        (.awaitParallelMultiInstanceUserTask id origin input taskId taskName data
                          normalOutput boundaryTimer completionCondition limits) entryMember
                      have runtimeValid := prior.1.1.1.1.2
                      simp only [parallelMultiInstanceRuntimeWellFormed,
                        Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq] at runtimeValid
                      have slotIdentities := runtimeValid.1.1.1.1.2
                      have rejected : (pendingParallelTaskIds controller.slots).contains
                          (parallelWaitTaskId inserted) = false := by
                        apply Bool.eq_false_iff.mpr
                        intro contained
                        have elementEq := pendingParallelTaskIds_have_slot_task_element
                          { id, origin, input, taskId, taskName, data, normalOutput, boundaryTimer,
                            completionCondition, limits }
                          { processInstanceId := controller.id.processInstanceId
                            controller := some controller
                            liveChildren := pendingParallelTaskIds controller.slots
                            lifetimeTimer := match record.attachedTimers with
                              | [timer] => some timer
                              | _ => none
                            processBindings := state.variables.process.bindings
                            taskActivationHighWater := activationCount state taskId
                            activityActivationHighWater := activityActivationCount state taskId
                            timerActivationHighWater := timerActivationCount state
                              boundaryTimer.elementId }
                          controller.slots slotIdentities (parallelWaitTaskId inserted)
                          (by simpa [List.contains_eq_mem] using contained)
                        apply different
                        exact taskDefinitionId_eq_of_value_eq _ _
                          (by simpa [parallelWaitTaskId] using elementEq.symm)
                      have waitFrame : (insertUserTaskWait inserted state.waits).filter
                          (fun wait => (pendingParallelTaskIds controller.slots).contains
                            (parallelWaitTaskId wait)) =
                          state.waits.filter (fun wait =>
                            (pendingParallelTaskIds controller.slots).contains
                              (parallelWaitTaskId wait)) := by
                        exact filter_insertUserTaskWait_rejected _ _ _ rejected
                      have countFrame : activationCount
                          ({ state with
                            waits := insertUserTaskWait inserted state.waits
                            activations := (setActivationCount state.activations
                              inserted.task.id inserted.activation) }) taskId =
                          activationCount state taskId := by
                        simpa [activationCount] using activationCount_setActivationCount_other
                          ({ state with waits := insertUserTaskWait inserted state.waits })
                          inserted.task.id taskId inserted.activation different
                      have activityCountFrame : activityActivationCount
                          ({ state with
                            waits := insertUserTaskWait inserted state.waits
                            activations := (setActivationCount state.activations
                              inserted.task.id inserted.activation) }) taskId =
                          activityActivationCount state taskId := rfl
                      have timerCountFrame : timerActivationCount
                          ({ state with
                            waits := insertUserTaskWait inserted state.waits
                            activations := (setActivationCount state.activations
                              inserted.task.id inserted.activation) }) boundaryTimer.elementId =
                          timerActivationCount state boundaryTimer.elementId := rfl
                      rw [waitFrame, countFrame, activityCountFrame, timerCountFrame]
                      refine ⟨?_, ?_⟩
                      · simpa only [beq_iff_eq, decide_eq_true_eq,
                          List.contains_eq_mem] using prior.1
                      intro wait waitMember
                      obtain ⟨rawMember, matched⟩ := List.mem_filter.mp waitMember
                      cases prior.2 wait rawMember with
                      | inl notMatched =>
                          exact False.elim (notMatched (by
                            simpa [List.contains_eq_mem] using matched))
                      | inr shape =>
                          simpa only [beq_iff_eq] using shape
  · intro operation member
    have prior := valid.2 operation member
    cases operation <;>
      simp only [ParallelMultiInstanceArm.ofOperation?] at prior ⊢ <;> try exact prior
    case awaitParallelMultiInstanceUserTask id origin input taskId taskName data normalOutput
        boundaryTimer completionCondition limits =>
      have different := disjoint (.awaitParallelMultiInstanceUserTask id origin input taskId
        taskName data normalOutput boundaryTimer completionCondition limits) member
      simp only [SemanticOperation.id] at prior ⊢
      generalize ownerEq : operationOwningScope? program id = owner at prior ⊢
      cases owner with
      | none =>
          simp at prior
      | some scopeId =>
          have scopedWaitFrame : (insertUserTaskWait inserted state.waits).filter
              (fun wait => wait.task.id == taskId &&
                wait.owner.definitionScopeId == scopeId) =
            state.waits.filter (fun wait => wait.task.id == taskId &&
                wait.owner.definitionScopeId == scopeId) := by
            apply filter_insertUserTaskWait_rejected
            apply Bool.eq_false_iff.mpr
            intro matched
            simp only [Bool.and_eq_true, beq_iff_eq] at matched
            exact different matched.1.symm
          simp only at prior ⊢
          rw [scopedWaitFrame]
          exact prior

private theorem filter_canonicalInsertBy_rejected (before : α → α → Bool)
    (predicate : α → Bool) (inserted : α) (values : List α)
    (rejected : predicate inserted = false) :
    (canonicalInsertBy before inserted values).filter predicate = values.filter predicate := by
  induction values with
  | nil => simp [canonicalInsertBy, rejected]
  | cons current rest ih =>
      simp only [canonicalInsertBy]
      split <;> cases currentMatches : predicate current <;>
        simp [rejected, currentMatches, ih]

private theorem filter_insertTimerWait_rejected (predicate : TimerWait → Bool)
    (inserted : TimerWait) (waits : List TimerWait)
    (rejected : predicate inserted = false) :
    (insertTimerWait inserted waits).filter predicate = waits.filter predicate := by
  unfold insertTimerWait
  exact filter_canonicalInsertBy_rejected _ _ _ _ rejected

theorem parallelMultiInstanceProgramBindingsValid_insertTimerWait_frame
    (program : Program) (state : RuntimeState) (inserted : TimerWait)
    (disjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ _ _ _ boundaryTimer _ =>
          boundaryTimer.elementId ≠ inserted.elementId
      | .awaitParallelMultiInstanceUserTask _ _ _ _ _ _ _ boundaryTimer _ _ =>
          boundaryTimer.elementId ≠ inserted.elementId
      | _ => True)
    (counterFrame : ∀ operation ∈ program.operations,
      match ParallelMultiInstanceArm.ofOperation? operation with
      | some arm =>
          timerActivationCount
              ({ state with
                timerWaits := insertTimerWait inserted state.timerWaits
                timerActivations := setTimerActivationCount state.timerActivations
                  inserted.elementId inserted.activation }) arm.boundaryTimer.elementId =
            timerActivationCount state arm.boundaryTimer.elementId
      | none => True)
    (valid : parallelMultiInstanceProgramBindingsValid program state = true) :
    parallelMultiInstanceProgramBindingsValid program
      { state with
        timerWaits := insertTimerWait inserted state.timerWaits
        timerActivations := setTimerActivationCount state.timerActivations
          inserted.elementId inserted.activation } = true := by
  simp only [parallelMultiInstanceProgramBindingsValid, Bool.and_eq_true,
    List.all_eq_true] at valid ⊢
  refine ⟨⟨⟨?_, valid.1.1.2⟩, valid.1.2⟩, ?_⟩
  · intro controller member
    have prior := valid.1.1.1 controller member
    unfold parallelControllerProgramBindingValid parallelRecordForController? at prior ⊢
    simp only at prior ⊢
    generalize recordsEq : state.activityOccurrences.filter
      (fun record => parallelControllerNamesIdentity controller record.processInstanceId
        ⟨record.activityElementId.value⟩ record.activation) = records at prior ⊢
    cases records with
    | nil => simp at prior
    | cons record rest =>
        cases rest with
        | cons next tail => simp at prior
        | nil =>
            simp only at prior ⊢
            generalize operationsEq : program.operations.filter (fun operation =>
              match ParallelMultiInstanceArm.ofOperation? operation with
              | some arm => arm.taskId.value == controller.id.activityElementId.value
              | none => false) = operations at prior ⊢
            cases operations with
            | nil => simp at prior
            | cons entry remaining =>
                cases remaining with
                | cons next tail => simp at prior
                | nil =>
                    cases entry <;>
                      simp only [ParallelMultiInstanceArm.ofOperation?] at prior ⊢
                    all_goals try simp at prior
                    case awaitParallelMultiInstanceUserTask id origin input taskId taskName data
                        normalOutput boundaryTimer completionCondition limits =>
                      simp only [Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq] at prior ⊢
                      have entryMember : SemanticOperation.awaitParallelMultiInstanceUserTask id
                          origin input taskId taskName data normalOutput boundaryTimer
                            completionCondition limits ∈ program.operations := by
                        have filteredMember : SemanticOperation.awaitParallelMultiInstanceUserTask
                            id origin input taskId taskName data normalOutput boundaryTimer
                              completionCondition limits ∈ program.operations.filter (fun operation =>
                                match ParallelMultiInstanceArm.ofOperation? operation with
                                | some arm =>
                                    arm.taskId.value == controller.id.activityElementId.value
                                | none => false) := by
                          rw [operationsEq]
                          simp
                        exact (List.mem_filter.mp filteredMember).1
                      have different := disjoint
                        (.awaitParallelMultiInstanceUserTask id origin input taskId taskName data
                          normalOutput boundaryTimer completionCondition limits) entryMember
                      have countFrame := counterFrame
                        (.awaitParallelMultiInstanceUserTask id origin input taskId taskName data
                          normalOutput boundaryTimer completionCondition limits) entryMember
                      simp only [ParallelMultiInstanceArm.ofOperation?] at different countFrame
                      have runtimeValid := prior.1.1.1.1.2
                      simp only [parallelMultiInstanceRuntimeWellFormed,
                        Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq] at runtimeValid
                      have attachedTimerValid := runtimeValid.1.1.2
                      cases attachedEq : record.attachedTimers with
                      | nil => simp [attachedEq] at attachedTimerValid
                      | cons timer rest =>
                          cases rest with
                          | cons next tail => simp [attachedEq] at attachedTimerValid
                          | nil =>
                              simp only [attachedEq, Bool.and_eq_true,
                                decide_eq_true_eq] at attachedTimerValid
                              have rejected : timerIdNamesWait timer inserted = false := by
                                apply Bool.eq_false_iff.mpr
                                intro matched
                                simp only [timerIdNamesWait, Bool.and_eq_true, beq_iff_eq] at matched
                                apply different
                                apply nodeId_eq_of_value_eq
                                exact attachedTimerValid.1.2.symm.trans matched.1.2
                              have timerFrame : (insertTimerWait inserted state.timerWaits).filter
                                  (timerIdNamesWait timer) =
                                  state.timerWaits.filter (timerIdNamesWait timer) :=
                                filter_insertTimerWait_rejected _ _ _ rejected
                              have taskCountFrame : activationCount
                                  ({ state with
                                    timerWaits := insertTimerWait inserted state.timerWaits
                                    timerActivations := setTimerActivationCount
                                      state.timerActivations inserted.elementId inserted.activation })
                                    taskId = activationCount state taskId := rfl
                              have activityCountFrame : activityActivationCount
                                  ({ state with
                                    timerWaits := insertTimerWait inserted state.timerWaits
                                    timerActivations := setTimerActivationCount
                                      state.timerActivations inserted.elementId inserted.activation })
                                    taskId = activityActivationCount state taskId := rfl
                              rw [attachedEq] at prior
                              simp only at prior ⊢
                              rw [timerFrame, countFrame, taskCountFrame, activityCountFrame]
                              refine ⟨?_, ?_⟩
                              · simpa only [beq_iff_eq, decide_eq_true_eq,
                                  List.contains_eq_mem] using prior.1
                              intro wait waitMember
                              obtain ⟨rawMember, matched⟩ := List.mem_filter.mp waitMember
                              cases prior.2 wait rawMember with
                              | inl notMatched =>
                                  exact False.elim (notMatched (by
                                    simpa [List.contains_eq_mem] using matched))
                              | inr shape =>
                                  simpa only [beq_iff_eq] using shape
  · intro operation member
    have prior := valid.2 operation member
    cases operation <;>
      simp only [ParallelMultiInstanceArm.ofOperation?] at prior ⊢ <;> try exact prior
    case awaitParallelMultiInstanceUserTask id origin input taskId taskName data normalOutput
        boundaryTimer completionCondition limits =>
      have different := disjoint (.awaitParallelMultiInstanceUserTask id origin input taskId
        taskName data normalOutput boundaryTimer completionCondition limits) member
      simp only [SemanticOperation.id] at prior ⊢
      generalize ownerEq : operationOwningScope? program id = owner at prior ⊢
      cases owner with
      | none => simp at prior
      | some scopeId =>
          have scopedTimerFrame : (insertTimerWait inserted state.timerWaits).filter
              (fun wait => wait.elementId == boundaryTimer.elementId &&
                wait.owner.definitionScopeId == scopeId) =
              state.timerWaits.filter (fun wait => wait.elementId == boundaryTimer.elementId &&
                wait.owner.definitionScopeId == scopeId) := by
            apply filter_insertTimerWait_rejected
            apply Bool.eq_false_iff.mpr
            intro matched
            simp only [Bool.and_eq_true, beq_iff_eq] at matched
            exact different matched.1.symm
          simp only at prior ⊢
          rw [scopedTimerFrame]
          exact prior

theorem parallelMultiInstanceProgramBindingsValid_frame (program : Program)
    (before after : RuntimeState)
    (controllers : before.parallelMultiInstanceControllers = after.parallelMultiInstanceControllers)
    (records : before.activityOccurrences = after.activityOccurrences)
    (waits : before.waits = after.waits)
    (timers : before.timerWaits = after.timerWaits)
    (processBindings : before.variables.process.bindings = after.variables.process.bindings)
    (activations : ∀ taskId, activationCount before taskId = activationCount after taskId)
    (activityActivations : ∀ taskId,
      activityActivationCount before taskId = activityActivationCount after taskId)
    (timerActivations : ∀ timerId,
      timerActivationCount before timerId = timerActivationCount after timerId) :
    parallelMultiInstanceProgramBindingsValid program before =
      parallelMultiInstanceProgramBindingsValid program after := by
  unfold parallelMultiInstanceProgramBindingsValid
    parallelControllerProgramBindingValid parallelRecordForController?
  simp only [controllers, records, waits, timers, processBindings, activations,
    activityActivations, timerActivations]

end BpmnSemantics.SemanticProcess
