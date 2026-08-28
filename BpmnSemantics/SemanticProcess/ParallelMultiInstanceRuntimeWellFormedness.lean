import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeInvariant
import BpmnSemantics.SemanticProcess.ActivityOccurrence
import BpmnSemantics.SemanticProcess.RuntimeStateIdentityBound

/-! # Parallel Multi-Instance shared runtime well-formedness

This module binds each parallel Multi-Instance family controller to the exact shared `RuntimeState`
Activity occurrence, child waits, lifetime Timer, owning Program operation, and Program-wide census.
It provides the singleton construction, absence, and frame results needed by transition preservation.

Scope boundary: shared `RuntimeState` binding validity and its proofs. The family-local carrier and
executable invariant are imported from `ParallelMultiInstanceRuntimeInvariant`; this module defines
no transition, public observation, shared runtime-state field, or host state.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

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

/-- Construct the complete Program binding for one parallel Multi-Instance controller from its exact
record, operation, child-wait, Timer-wait, family-state, and Program-wide census facts. -/
theorem parallelMultiInstanceProgramBindingsValid_singleton (program : Program)
    (state : RuntimeState) (controller : ParallelMultiInstanceController)
    (record : ActivityOccurrence) (entry : SemanticOperation) (arm : ParallelMultiInstanceArm)
    (timer : TimerOccurrenceId) (timerWait : TimerWait) (childWaits : List UserTaskWait)
    (controllers : state.parallelMultiInstanceControllers = [controller])
    (controllerRecord : state.activityOccurrences.filter (fun candidate =>
      parallelControllerNamesIdentity controller candidate.processInstanceId
        ⟨candidate.activityElementId.value⟩ candidate.activation) = [record])
    (matchingOperation : program.operations.filter (fun operation =>
      match ParallelMultiInstanceArm.ofOperation? operation with
      | some candidate => candidate.taskId.value == controller.id.activityElementId.value
      | none => false) = [entry])
    (projects : ParallelMultiInstanceArm.ofOperation? entry = some arm)
    (ownerScope : operationOwningScope? program entry.id = some record.owner.definitionScopeId)
    (familyWellFormed : parallelMultiInstanceRuntimeWellFormed arm
      { processInstanceId := controller.id.processInstanceId
        controller := some controller
        liveChildren := pendingParallelTaskIds controller.slots
        lifetimeTimer := some timer
        processBindings := state.variables.process.bindings
        taskActivationHighWater := activationCount state arm.taskId
        activityActivationHighWater := activityActivationCount state arm.taskId
        timerActivationHighWater := timerActivationCount state arm.boundaryTimer.elementId } = true)
    (body : activityBodyParallelTasks? record = some (pendingParallelTaskIds controller.slots))
    (childWaitsExact : state.waits.filter (fun wait =>
      (pendingParallelTaskIds controller.slots).contains
        (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : UserTaskInstanceId)) = childWaits)
    (childWaitLength : childWaits.length = (pendingParallelTaskIds controller.slots).length)
    (childWaitIdsUnique : (childWaits.map fun wait =>
      (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : UserTaskInstanceId)).Nodup)
    (childWaitBindings : childWaits.all (fun wait =>
      wait.owner == record.owner && wait.task.id == arm.taskId &&
        wait.task.name == arm.taskName && wait.metadata == none &&
        wait.output == arm.normalOutput) = true)
    (attachedTimer : record.attachedTimers = [timer])
    (matchingTimerWait : state.timerWaits.filter (timerIdNamesWait timer) = [timerWait])
    (timerOwner : timerWait.owner = record.owner)
    (timerElement : timerWait.elementId = arm.boundaryTimer.elementId)
    (timerOutput : timerWait.output = arm.boundaryTimer.output)
    (operationCompleteness : program.operations.all (fun operation =>
      match ParallelMultiInstanceArm.ofOperation? operation with
      | none => true
      | some candidate =>
          match operationOwningScope? program operation.id with
          | none => false
          | some scopeId =>
              let matchingControllers := state.parallelMultiInstanceControllers.filter fun current =>
                current.id.activityElementId.value == candidate.taskId.value
              let matchingRecords := state.activityOccurrences.filter fun candidateRecord =>
                candidateRecord.activityElementId.value == candidate.taskId.value &&
                  candidateRecord.owner.definitionScopeId == scopeId &&
                  (activityBodyParallelTasks? candidateRecord).isSome
              let matchingWaits := state.waits.filter fun wait =>
                wait.task.id == candidate.taskId && wait.owner.definitionScopeId == scopeId
              let matchingTimers := state.timerWaits.filter fun wait =>
                wait.elementId == candidate.boundaryTimer.elementId &&
                  wait.owner.definitionScopeId == scopeId
              matchingControllers.length = matchingRecords.length &&
                matchingControllers.length = matchingTimers.length &&
                matchingWaits.length = matchingControllers.foldl
                  (fun count current =>
                    count + (pendingParallelTaskIds current.slots).length) 0) = true) :
    parallelMultiInstanceProgramBindingsValid program state = true := by
  simp only [parallelMultiInstanceProgramBindingsValid, controllers, Bool.and_eq_true,
    List.all_eq_true]
  refine ⟨⟨⟨?_, ?_⟩, ?_⟩, ?_⟩
  · intro current member
    have same : current = controller := by simpa using member
    subst current
    have privateWaits : state.waits.filter (fun wait =>
        (pendingParallelTaskIds controller.slots).contains (parallelWaitTaskId wait)) =
        childWaits := by
      simpa only [parallelWaitTaskId] using childWaitsExact
    have privateWaitIdsUnique : (childWaits.map parallelWaitTaskId).Nodup := by
      change (childWaits.map fun wait =>
        (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : UserTaskInstanceId)).Nodup
      exact childWaitIdsUnique
    have childBindingsProp : ∀ wait ∈ childWaits,
        (((wait.owner = record.owner ∧ wait.task.id = arm.taskId) ∧
          wait.task.name = arm.taskName) ∧ wait.metadata = none) ∧
          wait.output = arm.normalOutput := by
      intro wait waitMember
      have binding := List.all_eq_true.mp childWaitBindings wait waitMember
      simpa only [Bool.and_eq_true, beq_iff_eq] using binding
    unfold parallelControllerProgramBindingValid parallelRecordForController?
    rw [controllerRecord, matchingOperation]
    simp only [projects]
    rw [ownerScope, attachedTimer, privateWaits]
    simp [familyWellFormed, body, childWaitLength, privateWaitIdsUnique,
      matchingTimerWait, timerOwner, timerElement, timerOutput]
    exact childBindingsProp
  · intro current member
    have same : current = controller := by simpa using member
    subst current
    simp [sameParallelControllerIdentity]
  · rfl
  · rw [controllers] at operationCompleteness
    exact List.all_eq_true.mp operationCompleteness

private theorem pendingParallelTaskIds_sublist_parallelSlotTaskIds
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

private theorem nodup_subset_of_nodup_subset_length_eq [BEq α] [LawfulBEq α]
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

/-- Eliminate the private controller binding validator into one pending parallel task and the exact
Program operation, Activity record, and child wait that bind it. -/
theorem parallelMultiInstanceProgramBindingsValid_controller_witness
    (program : Program) (state : RuntimeState)
    (controller : ParallelMultiInstanceController)
    (valid : parallelMultiInstanceProgramBindingsValid program state = true)
    (controllerMember : controller ∈ state.parallelMultiInstanceControllers) :
    ∃ taskId entry arm record wait,
      taskId ∈ pendingParallelTaskIds controller.slots ∧
      entry ∈ program.operations ∧
      ParallelMultiInstanceArm.ofOperation? entry = some arm ∧
      arm.taskId.value = controller.id.activityElementId.value ∧
      operationOwningScope? program entry.id = some record.owner.definitionScopeId ∧
      record ∈ state.activityOccurrences ∧
      parallelControllerNamesIdentity controller record.processInstanceId
        ⟨record.activityElementId.value⟩ record.activation = true ∧
      activityBodyParallelTasks? record = some (pendingParallelTaskIds controller.slots) ∧
      wait ∈ state.waits ∧
      (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : UserTaskInstanceId) =
        taskId ∧
      wait.owner = record.owner ∧ wait.task.id = arm.taskId := by
  simp only [parallelMultiInstanceProgramBindingsValid, Bool.and_eq_true,
    List.all_eq_true] at valid
  have bound := valid.1.1.1 controller controllerMember
  unfold parallelControllerProgramBindingValid parallelRecordForController? at bound
  generalize recordsEq : state.activityOccurrences.filter (fun record =>
    parallelControllerNamesIdentity controller record.processInstanceId
      ⟨record.activityElementId.value⟩ record.activation) = records at bound
  cases records with
  | nil => simp at bound
  | cons record remainingRecords =>
      cases remainingRecords with
      | cons next tail => simp at bound
      | nil =>
          have filteredRecord : record ∈ state.activityOccurrences.filter (fun candidate =>
              parallelControllerNamesIdentity controller candidate.processInstanceId
                ⟨candidate.activityElementId.value⟩ candidate.activation) := by
            rw [recordsEq]
            simp
          obtain ⟨recordMember, recordIdentity⟩ := List.mem_filter.mp filteredRecord
          generalize operationsEq : program.operations.filter (fun operation =>
            match ParallelMultiInstanceArm.ofOperation? operation with
            | some arm => arm.taskId.value == controller.id.activityElementId.value
            | none => false) = operations at bound
          cases operations with
          | nil => simp at bound
          | cons entry remainingOperations =>
              cases remainingOperations with
              | cons next tail => simp at bound
              | nil =>
                  have filteredEntry : entry ∈ program.operations.filter (fun operation =>
                      match ParallelMultiInstanceArm.ofOperation? operation with
                      | some arm => arm.taskId.value == controller.id.activityElementId.value
                      | none => false) := by
                    rw [operationsEq]
                    simp
                  obtain ⟨entryMember, taskIdentity⟩ := List.mem_filter.mp filteredEntry
                  cases projects : ParallelMultiInstanceArm.ofOperation? entry with
                  | none => simp [projects] at bound
                  | some arm =>
                      simp only [projects, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq,
                        List.all_eq_true] at bound taskIdentity
                      obtain ⟨⟨⟨⟨⟨ownerScope, runtimeValid⟩, body⟩, waitLength⟩,
                        waitIdsNodup⟩, waitBindings⟩ := bound
                      have pendingNonempty : ∃ taskId,
                          taskId ∈ pendingParallelTaskIds controller.slots := by
                        cases bodyShape : record.body with
                        | parallelUserTasks first rest =>
                            simp [activityBodyParallelTasks?, bodyShape] at body
                            exact ⟨first, by rw [← body]; simp⟩
                        | userTask task => simp [activityBodyParallelTasks?, bodyShape] at body
                        | childScope scope => simp [activityBodyParallelTasks?, bodyShape] at body
                      obtain ⟨taskId, pendingMember⟩ := pendingNonempty
                      simp only [parallelMultiInstanceRuntimeWellFormed, Bool.and_eq_true,
                        decide_eq_true_eq, List.all_eq_true] at runtimeValid
                      have slotIdsNodup :
                          (parallelSlotTaskIds controller.slots).Nodup :=
                        runtimeValid.1.1.1.1.1.2
                      have pendingNodup : (pendingParallelTaskIds controller.slots).Nodup :=
                        (pendingParallelTaskIds_sublist_parallelSlotTaskIds controller.slots).nodup
                          slotIdsNodup
                      let waits := state.waits.filter fun wait =>
                        (pendingParallelTaskIds controller.slots).contains (parallelWaitTaskId wait)
                      have waitIdsIncluded : waits.map parallelWaitTaskId ⊆
                          pendingParallelTaskIds controller.slots := by
                        intro candidate candidateMember
                        obtain ⟨wait, waitMember, rfl⟩ := List.mem_map.mp candidateMember
                        simpa [List.contains_eq_mem] using (List.mem_filter.mp waitMember).2
                      have waitIdsLength : (waits.map parallelWaitTaskId).length =
                          (pendingParallelTaskIds controller.slots).length := by
                        simpa [waits] using waitLength
                      have pendingIncluded : pendingParallelTaskIds controller.slots ⊆
                          waits.map parallelWaitTaskId :=
                        nodup_subset_of_nodup_subset_length_eq waitIdsNodup pendingNodup
                          waitIdsIncluded waitIdsLength
                      obtain ⟨wait, waitMember, waitId⟩ :=
                        List.mem_map.mp (pendingIncluded pendingMember)
                      obtain ⟨rawWaitMember, _⟩ := List.mem_filter.mp waitMember
                      obtain ⟨⟨⟨⟨waitOwner, waitTask⟩, _⟩, _⟩, _⟩ :=
                        (waitBindings wait waitMember).1
                      refine ⟨taskId, entry, arm, record, wait, pendingMember, entryMember, projects,
                        taskIdentity,
                        ownerScope, recordMember, recordIdentity, body, rawWaitMember, ?_,
                        waitOwner, waitTask⟩
                      simpa only [parallelWaitTaskId] using waitId

/-- Under an exact one-arm program census, absence of that arm's controller excludes every parallel
controller from a state admitted by the bidirectional program binding. -/
theorem parallelControllers_absent_of_unique_entry (program : Program)
    (arm : ParallelMultiInstanceArm) (state : RuntimeState)
    (uniqueEntry : program.operations.filterMap ParallelMultiInstanceArm.ofOperation? = [arm])
    (bindings : parallelMultiInstanceProgramBindingsValid program state = true)
    (absent : state.parallelMultiInstanceControllers.any (fun controller =>
      controller.id.activityElementId.value == arm.taskId.value) = false) :
    state.parallelMultiInstanceControllers = [] := by
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro controller member
  simp only [parallelMultiInstanceProgramBindingsValid, Bool.and_eq_true,
    List.all_eq_true] at bindings
  have bound := bindings.1.1.1 controller member
  unfold parallelControllerProgramBindingValid parallelRecordForController? at bound
  generalize recordsEq : state.activityOccurrences.filter (fun record =>
    parallelControllerNamesIdentity controller record.processInstanceId
      ⟨record.activityElementId.value⟩ record.activation) = records at bound
  cases records with
  | nil => simp at bound
  | cons record rest =>
      cases rest with
      | cons next tail => simp at bound
      | nil =>
          generalize operationsEq : program.operations.filter (fun operation =>
            match ParallelMultiInstanceArm.ofOperation? operation with
            | some candidate => candidate.taskId.value == controller.id.activityElementId.value
            | none => false) = operations at bound
          cases operations with
          | nil => simp at bound
          | cons entry rest =>
              cases rest with
              | cons next tail => simp at bound
              | nil =>
                  have filtered : entry ∈ program.operations.filter (fun operation =>
                      match ParallelMultiInstanceArm.ofOperation? operation with
                      | some candidate =>
                          candidate.taskId.value == controller.id.activityElementId.value
                      | none => false) := by rw [operationsEq]; simp
                  obtain ⟨entryMember, taskMatch⟩ := List.mem_filter.mp filtered
                  cases projects : ParallelMultiInstanceArm.ofOperation? entry with
                  | none => simp [projects] at taskMatch
                  | some candidate =>
                      have candidateMember : candidate ∈
                          program.operations.filterMap ParallelMultiInstanceArm.ofOperation? :=
                        List.mem_filterMap.mpr ⟨entry, entryMember, projects⟩
                      rw [uniqueEntry] at candidateMember
                      have candidateEq : candidate = arm := by simpa using candidateMember
                      subst candidate
                      simp only [projects, beq_iff_eq] at taskMatch
                      have selected : state.parallelMultiInstanceControllers.any (fun current =>
                          current.id.activityElementId.value == arm.taskId.value) = true := by
                        rw [List.any_eq_true]
                        exact ⟨controller, member, by simp [taskMatch]⟩
                      rw [absent] at selected
                      contradiction

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
