import BpmnSemantics.SemanticProcess.ParallelMultiInstancePreservation
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceLaws
import BpmnSemantics.SemanticProcess.InternalCommutationRuntimePreservation

/-! # Parallel Multi-Instance shared runtime-state preservation

This downstream owner provides reusable shared-state insertion and exclusion facts plus the complete
empty-entry preservation case. Separate Entry and Closing owners complete nonempty and closing
preservation. The upstream owner retains evaluator soundness, admitted-Program account extraction,
and exact-state refusal.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def parallelEntryChildWait (arm : ParallelMultiInstanceArm)
    (owner : ScopeOccurrenceId) (slot : ParallelMultiInstanceSlot) : UserTaskWait :=
  { processInstanceId := slot.taskId.processInstanceId
    owner
    task := { id := arm.taskId, name := arm.taskName }
    activation := slot.taskId.activation
    output := arm.normalOutput
    metadata := none }

def parallelEntryWaitTaskId (wait : UserTaskWait) : UserTaskInstanceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.task.id.value⟩
    activation := wait.activation }

theorem taskDefinitionId_eq_iff_value_eq (left right : TaskDefinitionId) :
    left = right ↔ left.value = right.value := by
  cases left
  cases right
  simp

theorem insertParallelChildWaits_cons (arm : ParallelMultiInstanceArm)
    (owner : ScopeOccurrenceId) (slot : ParallelMultiInstanceSlot)
    (slots : List ParallelMultiInstanceSlot) (waits : List UserTaskWait) :
    insertParallelChildWaits arm owner (slot :: slots) waits =
      insertParallelChildWaits arm owner slots
        (insertUserTaskWait (parallelEntryChildWait arm owner slot) waits) := by
  rfl

theorem pendingParallelSlotsFrom_lower_bound (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (highWater index : Nat) (snapshot : List String) :
    ∀ candidate ∈ parallelSlotTaskIds
      (pendingParallelSlotsFrom processInstanceId taskId highWater snapshot index),
      highWater + index < candidate.activation := by
  induction snapshot generalizing index with
  | nil => simp [pendingParallelSlotsFrom, parallelSlotTaskIds]
  | cons item rest ih =>
      intro candidate member
      simp only [pendingParallelSlotsFrom, parallelSlotTaskIds, List.map_cons,
        List.mem_cons] at member
      cases member with
      | inl same =>
          subst candidate
          simp [ParallelMultiInstanceSlot.taskId, mintedParallelTaskId]
      | inr tail =>
          have lower := ih (index + 1) candidate tail
          omega

theorem pendingParallelSlotsFrom_task_ids_nodup (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (highWater index : Nat) (snapshot : List String) :
    (parallelSlotTaskIds
      (pendingParallelSlotsFrom processInstanceId taskId highWater snapshot index)).Nodup := by
  induction snapshot generalizing index with
  | nil => simp [pendingParallelSlotsFrom, parallelSlotTaskIds]
  | cons item rest ih =>
      simp only [pendingParallelSlotsFrom, parallelSlotTaskIds, List.map_cons,
        List.nodup_cons]
      constructor
      · intro member
        have lower := pendingParallelSlotsFrom_lower_bound processInstanceId taskId highWater
          (index + 1) rest _ member
        simp [ParallelMultiInstanceSlot.taskId, mintedParallelTaskId] at lower
        omega
      · exact ih (index + 1)

theorem pendingParallelSlotsFrom_identity (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (highWater index : Nat) (snapshot : List String) :
    ∀ slot ∈ pendingParallelSlotsFrom processInstanceId taskId highWater snapshot index,
      slot.taskId.processInstanceId = processInstanceId ∧
        slot.taskId.elementId.value = taskId.value ∧
        slot.taskId.activation ≤ highWater + index + snapshot.length := by
  induction snapshot generalizing index with
  | nil => simp [pendingParallelSlotsFrom]
  | cons item rest ih =>
      intro slot member
      simp only [pendingParallelSlotsFrom, List.mem_cons] at member
      cases member with
      | inl same =>
          subst slot
          simp [ParallelMultiInstanceSlot.taskId, mintedParallelTaskId]
      | inr tail =>
          obtain ⟨process, element, upper⟩ := ih (index + 1) slot tail
          exact ⟨process, element, by
            simpa [Nat.add_assoc, Nat.add_left_comm, Nat.add_comm] using upper⟩

theorem pendingParallelSlots_all_pending (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (highWater index : Nat) (snapshot : List String) :
    pendingParallelTaskIds
        (pendingParallelSlotsFrom processInstanceId taskId highWater snapshot index) =
      parallelSlotTaskIds
        (pendingParallelSlotsFrom processInstanceId taskId highWater snapshot index) := by
  induction snapshot generalizing index with
  | nil => rfl
  | cons item rest ih =>
      simp [pendingParallelSlotsFrom, pendingParallelTaskIds, parallelSlotTaskIds,
        ParallelMultiInstanceSlot.taskId, ih (index + 1)]

theorem filter_insertParallelChildWaits_perm (arm : ParallelMultiInstanceArm)
    (owner : ScopeOccurrenceId) (slots : List ParallelMultiInstanceSlot)
    (waits : List UserTaskWait) (predicate : UserTaskWait → Bool)
    (kept : ∀ slot ∈ slots, predicate (parallelEntryChildWait arm owner slot) = true) :
    ((insertParallelChildWaits arm owner slots waits).filter predicate).Perm
      (slots.map (parallelEntryChildWait arm owner) ++ waits.filter predicate) := by
  induction slots generalizing waits with
  | nil => simp [insertParallelChildWaits]
  | cons slot rest ih =>
      rw [insertParallelChildWaits_cons]
      have inserted : ((insertUserTaskWait (parallelEntryChildWait arm owner slot) waits).filter
          predicate).Perm
          (parallelEntryChildWait arm owner slot :: waits.filter predicate) := by
        rw [insertUserTaskWait_eq_canonicalInsertBy]
        exact filter_canonicalInsertBy_perm userTaskWaitBefore predicate
          (parallelEntryChildWait arm owner slot) waits (kept slot (by simp))
      have tailKept : ∀ candidate ∈ rest,
          predicate (parallelEntryChildWait arm owner candidate) = true := by
        exact fun candidate member => kept candidate (by simp [member])
      have tail := ih (insertUserTaskWait (parallelEntryChildWait arm owner slot) waits) tailKept
      have mapped := List.Perm.append_left (rest.map (parallelEntryChildWait arm owner)) inserted
      exact tail.trans (mapped.trans (by simp))

theorem mem_insertParallelChildWaits_of_mem (arm : ParallelMultiInstanceArm)
    (owner : ScopeOccurrenceId) (slots : List ParallelMultiInstanceSlot)
    (waits : List UserTaskWait) (candidate : UserTaskWait) (member : candidate ∈ waits) :
    candidate ∈ insertParallelChildWaits arm owner slots waits := by
  induction slots generalizing waits with
  | nil => exact member
  | cons slot rest ih =>
      rw [insertParallelChildWaits_cons]
      apply ih
      exact (mem_insertUserTaskWait _ _ _).mpr (Or.inr member)

theorem pending_slot_has_inserted_wait (arm : ParallelMultiInstanceArm)
    (owner : ScopeOccurrenceId) (slots : List ParallelMultiInstanceSlot)
    (waits : List UserTaskWait) (slot : ParallelMultiInstanceSlot) (member : slot ∈ slots) :
    ∃ wait ∈ insertParallelChildWaits arm owner slots waits,
      wait = parallelEntryChildWait arm owner slot := by
  induction slots generalizing waits with
  | nil => simp at member
  | cons head rest ih =>
      rw [insertParallelChildWaits_cons]
      simp only [List.mem_cons] at member
      cases member with
      | inl same =>
          subst slot
          refine ⟨parallelEntryChildWait arm owner head, ?_, rfl⟩
          apply mem_insertParallelChildWaits_of_mem
          exact (mem_insertUserTaskWait _ _ _).mpr (Or.inl rfl)
      | inr tail =>
          exact ih (insertUserTaskWait (parallelEntryChildWait arm owner head) waits) tail

theorem insertNextUserTask_preserves_identityBound (state : RuntimeState)
    (wait : UserTaskWait) (next : wait.activation = activationCount state wait.task.id + 1)
    (bounded : runtimeStateIdentityBound state = true) :
    runtimeStateIdentityBound
      { state with
        waits := insertUserTaskWait wait state.waits
        activations := setActivationCount state.activations wait.task.id wait.activation } = true := by
  simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounded ⊢
  obtain ⟨⟨tasks, timers⟩, activities⟩ := bounded
  refine ⟨⟨?_, timers⟩, activities⟩
  simp only [all_insertUserTaskWait, Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq]
  refine ⟨?_, ?_⟩
  · change wait.activation ≤ activationCount
      { state with activations := setActivationCount state.activations wait.task.id wait.activation }
        wait.task.id
    rw [activationCount_setActivationCount_self]
    exact Nat.le_refl _
  · intro candidate member
    have prior := List.all_eq_true.mp tasks candidate member
    simp only [decide_eq_true_eq] at prior
    by_cases same : candidate.task.id = wait.task.id
    · rw [same] at prior ⊢
      change candidate.activation ≤ activationCount
        { state with activations := setActivationCount state.activations wait.task.id wait.activation }
          wait.task.id
      rw [activationCount_setActivationCount_self, next]
      omega
    · change candidate.activation ≤ activationCount
        { state with activations := setActivationCount state.activations wait.task.id wait.activation }
          candidate.task.id
      rw [activationCount_setActivationCount_other _ _ _ _ same]
      exact prior

private theorem filter_insertTaskActivation_other (inserted : TaskActivation)
    (values : List TaskActivation) :
    (insertTaskActivation inserted values).filter
        (fun activation => !decide (activation.taskId = inserted.taskId)) =
      values.filter (fun activation => !decide (activation.taskId = inserted.taskId)) := by
  induction values with
  | nil => simp [insertTaskActivation]
  | cons current rest ih =>
      unfold insertTaskActivation
      split <;> by_cases same : current.taskId = inserted.taskId <;>
        simp [same, ih]

theorem setActivationCount_same (values : List TaskActivation)
    (taskId : TaskDefinitionId) (first second : Nat) :
    setActivationCount (setActivationCount values taskId first) taskId second =
      setActivationCount values taskId second := by
  unfold setActivationCount
  simp only [decide_not]
  congr 1
  simpa using filter_insertTaskActivation_other { taskId, count := first }
    (values.filter fun activation => !decide (activation.taskId = taskId))

def insertPendingParallelChildWaitState (arm : ParallelMultiInstanceArm)
    (owner : ScopeOccurrenceId) (processInstanceId : SemanticId) (highWater : Nat) :
    List String → Nat → RuntimeState → RuntimeState
  | [], _, state => state
  | _ :: rest, index, state =>
      let slot : ParallelMultiInstanceSlot :=
        .pending (mintedParallelTaskId processInstanceId arm.taskId highWater index)
      let wait := parallelEntryChildWait arm owner slot
      insertPendingParallelChildWaitState arm owner processInstanceId highWater rest (index + 1)
        { state with
          waits := insertUserTaskWait wait state.waits
          activations := setActivationCount state.activations arm.taskId wait.activation }

theorem insertPendingParallelChildWaitState_eq (arm : ParallelMultiInstanceArm)
    (owner : ScopeOccurrenceId) (processInstanceId : SemanticId) (highWater index : Nat)
    (firstItem : String) (restItems : List String) (state : RuntimeState) :
    insertPendingParallelChildWaitState arm owner processInstanceId highWater
        (firstItem :: restItems) index state =
      { state with
        waits := insertParallelChildWaits arm owner
          (pendingParallelSlotsFrom processInstanceId arm.taskId highWater
            (firstItem :: restItems) index) state.waits
        activations := setActivationCount state.activations arm.taskId
          (highWater + index + (firstItem :: restItems).length) } := by
  induction restItems generalizing index state firstItem with
  | nil =>
      simp only [insertPendingParallelChildWaitState, pendingParallelSlotsFrom,
        parallelEntryChildWait, mintedParallelTaskId, ParallelMultiInstanceSlot.taskId,
        List.length_cons, List.length_nil]
      congr 1
  | cons nextItem tail ih =>
      let slot : ParallelMultiInstanceSlot :=
        .pending (mintedParallelTaskId processInstanceId arm.taskId highWater index)
      let wait := parallelEntryChildWait arm owner slot
      let nextState : RuntimeState :=
        { state with
          waits := insertUserTaskWait wait state.waits
          activations := setActivationCount state.activations arm.taskId wait.activation }
      change insertPendingParallelChildWaitState arm owner processInstanceId highWater
          (nextItem :: tail) (index + 1) nextState = _
      rw [ih (index + 1) nextItem nextState]
      simp [nextState, wait, slot, pendingParallelSlotsFrom, insertParallelChildWaits_cons,
        parallelEntryChildWait, mintedParallelTaskId, ParallelMultiInstanceSlot.taskId,
        setActivationCount_same, Nat.add_assoc, Nat.add_left_comm, Nat.add_comm]

theorem insertPendingParallelChildWaitState_preserves (arm : ParallelMultiInstanceArm)
    (owner : ScopeOccurrenceId) (processInstanceId : SemanticId) (highWater index : Nat)
    (snapshot : List String) (state : RuntimeState)
    (count : activationCount state arm.taskId = highWater + index)
    (bounded : runtimeStateIdentityBound state = true)
    (records : activityRecordsOwnLiveWork state = true) :
    runtimeStateIdentityBound
        (insertPendingParallelChildWaitState arm owner processInstanceId highWater snapshot index
          state) = true ∧
      activityRecordsOwnLiveWork
        (insertPendingParallelChildWaitState arm owner processInstanceId highWater snapshot index
          state) = true := by
  induction snapshot generalizing index state with
  | nil => exact ⟨bounded, records⟩
  | cons item rest ih =>
      let slot : ParallelMultiInstanceSlot :=
        .pending (mintedParallelTaskId processInstanceId arm.taskId highWater index)
      let wait := parallelEntryChildWait arm owner slot
      let nextState : RuntimeState :=
        { state with
          waits := insertUserTaskWait wait state.waits
          activations := setActivationCount state.activations arm.taskId wait.activation }
      have next : wait.activation = activationCount state wait.task.id + 1 := by
        simp [wait, slot, parallelEntryChildWait, mintedParallelTaskId,
          ParallelMultiInstanceSlot.taskId, count]
      have boundedNext : runtimeStateIdentityBound nextState = true := by
        simpa [nextState, wait, parallelEntryChildWait] using
          insertNextUserTask_preserves_identityBound state wait next bounded
      have recordsNext : activityRecordsOwnLiveWork nextState = true := by
        change activityRecordsOwnLiveWork
          { state with waits := insertUserTaskWait wait state.waits } = true
        exact InternalCommutation.activityRecords_insertUserTaskWait state wait next bounded records
      have countNext : activationCount nextState arm.taskId = highWater + (index + 1) := by
        change activationCount
          { state with activations := setActivationCount state.activations arm.taskId wait.activation }
            arm.taskId = highWater + (index + 1)
        rw [activationCount_setActivationCount_self]
        simp [wait, slot, parallelEntryChildWait, mintedParallelTaskId,
          ParallelMultiInstanceSlot.taskId, Nat.add_assoc]
      simpa [insertPendingParallelChildWaitState, slot, wait, nextState] using
        ih (index + 1) nextState countNext boundedNext recordsNext

theorem insertParallelChildWaits_all_live (state : RuntimeState)
    (arm : ParallelMultiInstanceArm) (owner : ScopeOccurrenceId)
    (slots : List ParallelMultiInstanceSlot) (waits : List UserTaskWait)
    (ownerLive : exactLiveOccurrence state owner = true)
    (holds : waits.all (fun wait => exactLiveOccurrence state wait.owner) = true) :
    (insertParallelChildWaits arm owner slots waits).all
      (fun wait => exactLiveOccurrence state wait.owner) = true := by
  induction slots generalizing waits with
  | nil => exact holds
  | cons slot rest ih =>
      apply ih
      rw [all_insertUserTaskWait]
      simp only [Bool.and_eq_true, List.all_eq_true]
      constructor
      · change exactLiveOccurrence state owner = true
        exact ownerLive
      · exact List.all_eq_true.mp holds

theorem insertParallelChildWaits_ordered (arm : ParallelMultiInstanceArm)
    (owner : ScopeOccurrenceId) (slots : List ParallelMultiInstanceSlot)
    (waits : List UserTaskWait) (ordered : orderedBy userTaskWaitBefore waits = true) :
    orderedBy userTaskWaitBefore (insertParallelChildWaits arm owner slots waits) = true := by
  induction slots generalizing waits with
  | nil => exact ordered
  | cons slot rest ih =>
      exact ih _ (orderedBy_insertUserTaskWait _ _ ordered)

theorem mem_insertParallelChildWaits_shape (arm : ParallelMultiInstanceArm)
    (owner : ScopeOccurrenceId) (slots : List ParallelMultiInstanceSlot)
    (waits : List UserTaskWait) (candidate : UserTaskWait)
    (member : candidate ∈ insertParallelChildWaits arm owner slots waits) :
    candidate ∈ waits ∨ (candidate.task.id = arm.taskId ∧ candidate.owner = owner) := by
  induction slots generalizing waits with
  | nil => exact Or.inl member
  | cons slot rest ih =>
      have selected := ih _ member
      cases selected with
      | inr shape => exact Or.inr shape
      | inl inserted =>
          rcases (mem_insertUserTaskWait _ _ _).mp inserted with new | old
          · subst candidate
            right
            constructor <;> rfl
          · exact Or.inl old

theorem insertActivityOccurrence_eq_canonicalInsertBy (record : ActivityOccurrence) :
    ∀ records, insertActivityOccurrence record records =
      canonicalInsertBy activityOccurrenceBefore record records := by
  intro records
  induction records with
  | nil => rfl
  | cons current rest ih =>
      simp only [insertActivityOccurrence, canonicalInsertBy]
      split <;> simp_all

theorem pendingParallelChildWaits_unique_from (arm : ParallelMultiInstanceArm)
    (owner : ScopeOccurrenceId) (processInstanceId : SemanticId) (highWater : Nat)
    (snapshot : List String) (index : Nat) (waits : List UserTaskWait)
    (unique : waits.all (occursOnce userTaskWaitKeyMatches waits) = true)
    (prior : ∀ wait ∈ waits, wait.task.id = arm.taskId →
      wait.activation < highWater + index + 1) :
    let slots := pendingParallelSlotsFrom processInstanceId arm.taskId highWater snapshot index
    (insertParallelChildWaits arm owner slots waits).all
      (occursOnce userTaskWaitKeyMatches
        (insertParallelChildWaits arm owner slots waits)) = true := by
  induction snapshot generalizing index waits with
  | nil => exact unique
  | cons item rest ih =>
      let taskId := mintedParallelTaskId processInstanceId arm.taskId highWater index
      let inserted : UserTaskWait :=
        { processInstanceId := taskId.processInstanceId
          owner
          task := { id := arm.taskId, name := arm.taskName }
          activation := taskId.activation
          output := arm.normalOutput
          metadata := none }
      have fresh : ∀ old ∈ waits,
          userTaskWaitKeyMatches inserted old = false ∧
            userTaskWaitKeyMatches old inserted = false := by
        intro old member
        have reject : old.task.id = arm.taskId → old.activation ≠ taskId.activation := by
          intro same activationEq
          have bound := prior old member same
          simp [taskId, mintedParallelTaskId] at activationEq
          omega
        constructor
        · apply Bool.eq_false_iff.mpr
          intro matched
          simp only [userTaskWaitKeyMatches, inserted, Bool.and_eq_true,
            decide_eq_true_eq] at matched
          exact reject matched.1.2.symm matched.2.symm
        · apply Bool.eq_false_iff.mpr
          intro matched
          simp only [userTaskWaitKeyMatches, inserted, Bool.and_eq_true,
            decide_eq_true_eq] at matched
          exact reject matched.1.2 matched.2
      have insertedUnique : (insertUserTaskWait inserted waits).all
          (occursOnce userTaskWaitKeyMatches (insertUserTaskWait inserted waits)) = true := by
        rw [insertUserTaskWait_eq_canonicalInsertBy]
        exact InternalCommutation.occurrenceKeysUnique_canonicalInsertBy userTaskWaitBefore
          userTaskWaitKeyMatches inserted waits unique fresh (by simp [userTaskWaitKeyMatches])
      have nextPrior : ∀ wait ∈ insertUserTaskWait inserted waits,
          wait.task.id = arm.taskId → wait.activation < highWater + (index + 1) + 1 := by
        intro wait member same
        rcases (mem_insertUserTaskWait _ _ _).mp member with new | old
        · subst wait
          simp [inserted, taskId, mintedParallelTaskId]
        · exact Nat.lt_trans (prior wait old same) (by omega)
      change (insertParallelChildWaits arm owner
          (pendingParallelSlotsFrom processInstanceId arm.taskId highWater rest (index + 1))
          (insertUserTaskWait inserted waits)).all
        (occursOnce userTaskWaitKeyMatches
          (insertParallelChildWaits arm owner
            (pendingParallelSlotsFrom processInstanceId arm.taskId highWater rest (index + 1))
            (insertUserTaskWait inserted waits))) = true
      exact ih (index + 1) (insertUserTaskWait inserted waits) insertedUnique nextPrior

theorem mem_pendingParallelChildWaits_activation_bound (arm : ParallelMultiInstanceArm)
    (owner : ScopeOccurrenceId) (processInstanceId : SemanticId) (highWater : Nat)
    (snapshot : List String) (index : Nat) (waits : List UserTaskWait)
    (candidate : UserTaskWait)
    (member : candidate ∈ insertParallelChildWaits arm owner
      (pendingParallelSlotsFrom processInstanceId arm.taskId highWater snapshot index) waits) :
    candidate ∈ waits ∨ candidate.activation ≤ highWater + index + snapshot.length := by
  induction snapshot generalizing index waits with
  | nil => exact Or.inl member
  | cons item rest ih =>
      let taskId := mintedParallelTaskId processInstanceId arm.taskId highWater index
      let inserted : UserTaskWait :=
        { processInstanceId := taskId.processInstanceId
          owner
          task := { id := arm.taskId, name := arm.taskName }
          activation := taskId.activation
          output := arm.normalOutput
          metadata := none }
      change candidate ∈ insertParallelChildWaits arm owner
        (pendingParallelSlotsFrom processInstanceId arm.taskId highWater rest (index + 1))
        (insertUserTaskWait inserted waits) at member
      rcases ih (index + 1) (insertUserTaskWait inserted waits) member with prior | tailBound
      · rcases (mem_insertUserTaskWait _ _ _).mp prior with new | old
        · subst candidate
          right
          simp [inserted, taskId, mintedParallelTaskId]
        · exact Or.inl old
      · right
        calc
          candidate.activation ≤ highWater + (index + 1) + rest.length := tailBound
          _ = highWater + index + (item :: rest).length := by simp; omega

theorem admitted_parallel_controllers_absent (program : Program)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope) (state : RuntimeState)
    (bindings : parallelMultiInstanceProgramBindingsValid program state = true)
    (absent : state.parallelMultiInstanceControllers.any (fun controller =>
      controller.id.activityElementId.value == arm.taskId.value) = false) :
    state.parallelMultiInstanceControllers = [] := by
  exact parallelControllers_absent_of_unique_entry program arm state account.uniqueEntry bindings
    absent

theorem admitted_parallel_has_no_sequential_operation (program : Program)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope) :
    ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask .. => False
      | _ => True := by
  have capabilities := account.capabilities
  simp only [programProfileCapabilitiesValid, Bool.and_eq_true] at capabilities
  have selected := capabilities.1.1
  simp [programSequentialMultiInstanceProfileMatches, account.profile,
    parallelMultiInstanceUserTaskProfileId, sequentialMultiInstanceUserTaskProfileId] at selected
  intro operation member
  have absent := selected operation member
  cases operation <;> simp_all

theorem sequential_controllers_absent (program : Program) (state : RuntimeState)
    (noSequential : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask .. => False
      | _ => True)
    (valid : sequentialMultiInstanceProgramBindingsValid program state = true) :
    state.sequentialMultiInstanceControllers = [] := by
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro controller member
  simp only [sequentialMultiInstanceProgramBindingsValid,
    sequentialMultiInstanceControllerProgramBindingsValid, Bool.and_eq_true,
    List.all_eq_true] at valid
  have bound := valid.1 controller member
  unfold sequentialMultiInstanceControllerProgramBindingValid at bound
  generalize recordsEq : state.activityOccurrences.filter
    (controllerNamesActivityOccurrence controller) = records at bound
  cases records with
  | nil => simp at bound
  | cons record rest =>
      cases rest with
      | cons next tail => simp at bound
      | nil =>
          let operationBinding : List SemanticOperation → Bool
            | [.awaitSequentialMultiInstanceUserTask id _ _ task _ normalOutput
                boundaryTimer _] =>
                operationOwningScope? program id == some record.owner.definitionScopeId &&
                  record.owner.processInstanceId == record.processInstanceId &&
                  match activityBodyTask? record with
                  | some body =>
                      body.processInstanceId == record.processInstanceId &&
                        body.elementId.value == task.id.value &&
                        match state.waits.filter (taskIdNamesWait body), record.attachedTimers with
                        | [wait], [timerId] =>
                            wait.owner == record.owner && wait.task.id == task.id &&
                              wait.task.name == task.name && wait.metadata == none &&
                              wait.output == normalOutput &&
                              timerId.processInstanceId == record.processInstanceId &&
                              timerId.elementId.value == boundaryTimer.elementId.value &&
                              match state.timerWaits.filter (timerIdNamesWait timerId) with
                              | [timerWait] => timerWait.owner == record.owner &&
                                  timerWait.output == boundaryTimer.output
                              | _ => false
                        | _, _ => false
                  | none => false
            | _ => false
          change operationBinding (program.operations.filter (fun
            | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
                decide (task.id.value = controller.activityElementId.value)
            | _ => false)) = true at bound
          have operationFilter : program.operations.filter (fun
              | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
                  decide (task.id.value = controller.activityElementId.value)
              | _ => false) = [] := by
            apply List.filter_eq_nil_iff.mpr
            intro operation operationMember selected
            have absent := noSequential operation operationMember
            cases operation <;> simp at selected
            simp at absent
          rw [operationFilter] at bound
          simp [operationBinding] at bound

theorem sequential_bindings_of_no_sequential_operation (program : Program)
    (state : RuntimeState)
    (noSequential : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask .. => False
      | _ => True)
    (controllers : state.sequentialMultiInstanceControllers = []) :
    sequentialMultiInstanceProgramBindingsValid program state = true := by
  simp only [sequentialMultiInstanceProgramBindingsValid,
    sequentialMultiInstanceControllerProgramBindingsValid, controllers, List.all_nil]
  change program.operations.all
    (sequentialMultiInstanceOperationBindingComplete program state) = true
  rw [List.all_eq_true]
  intro operation member
  have absent := noSequential operation member
  cases operation <;> simp_all only [sequentialMultiInstanceOperationBindingComplete]

theorem parallelEntry_projection_id (operation : SemanticOperation)
    (arm : ParallelMultiInstanceArm)
    (projects : ParallelMultiInstanceArm.ofOperation? operation = some arm) :
    operation.id = arm.id := by
  cases operation <;> simp [ParallelMultiInstanceArm.ofOperation?] at projects
  rw [← projects]
  rfl

theorem parallelEntry_projection_declares_user_task (operation : SemanticOperation)
    (arm : ParallelMultiInstanceArm)
    (projects : ParallelMultiInstanceArm.ofOperation? operation = some arm) :
    operationDeclaresWaitKey operation (userTaskWaitDeclarationKey arm.taskId) = true := by
  cases operation <;> simp [ParallelMultiInstanceArm.ofOperation?] at projects
  rw [← projects]
  simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, userTaskWaitDeclarationKey]

theorem parallelEntry_projection_declares_timer (operation : SemanticOperation)
    (arm : ParallelMultiInstanceArm)
    (projects : ParallelMultiInstanceArm.ofOperation? operation = some arm) :
    operationDeclaresWaitKey operation
      (timerWaitDeclarationKey arm.boundaryTimer.elementId) = true := by
  cases operation <;> simp [ParallelMultiInstanceArm.ofOperation?] at projects
  rw [← projects]
  simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, timerWaitDeclarationKey]

private theorem parallelProjection_filter_eq_nil_of_filterMap_eq_nil
    (operations : List SemanticOperation) (taskId : TaskDefinitionId)
    (empty : operations.filterMap ParallelMultiInstanceArm.ofOperation? = []) :
    operations.filter (fun operation =>
      match ParallelMultiInstanceArm.ofOperation? operation with
      | some arm => arm.taskId.value == taskId.value
      | none => false) = [] := by
  apply List.filter_eq_nil_iff.mpr
  intro operation member selected
  cases projects : ParallelMultiInstanceArm.ofOperation? operation with
  | none => simp [projects] at selected
  | some arm =>
      have mapped : arm ∈ operations.filterMap ParallelMultiInstanceArm.ofOperation? :=
        List.mem_filterMap.mpr ⟨operation, member, projects⟩
      rw [empty] at mapped
      simp at mapped

theorem parallelEntry_matching_operations (operations : List SemanticOperation)
    (entry : SemanticOperation) (arm : ParallelMultiInstanceArm)
    (member : entry ∈ operations)
    (projects : ParallelMultiInstanceArm.ofOperation? entry = some arm)
    (unique : operations.filterMap ParallelMultiInstanceArm.ofOperation? = [arm]) :
    operations.filter (fun operation =>
      match ParallelMultiInstanceArm.ofOperation? operation with
      | some candidate => candidate.taskId.value == arm.taskId.value
      | none => false) = [entry] := by
  induction operations with
  | nil => simp at member
  | cons head tail ih =>
      simp only [List.mem_cons] at member
      cases member with
      | inl same =>
          subst head
          have tailEmpty : tail.filterMap ParallelMultiInstanceArm.ofOperation? = [] := by
            simpa [projects] using unique
          have tailFiltered := parallelProjection_filter_eq_nil_of_filterMap_eq_nil tail arm.taskId
            tailEmpty
          simp [projects, tailFiltered]
      | inr tailMember =>
          cases headProjects : ParallelMultiInstanceArm.ofOperation? head with
          | none =>
              have tailUnique : tail.filterMap ParallelMultiInstanceArm.ofOperation? = [arm] := by
                simpa [headProjects] using unique
              simpa [headProjects] using ih tailMember tailUnique
          | some headArm =>
              have tailEmpty : tail.filterMap ParallelMultiInstanceArm.ofOperation? = [] := by
                simpa [headProjects] using congrArg List.tail unique
              have mapped : arm ∈ tail.filterMap ParallelMultiInstanceArm.ofOperation? :=
                List.mem_filterMap.mpr ⟨entry, tailMember, projects⟩
              rw [tailEmpty] at mapped
              simp at mapped

theorem insertNextTimer_preserves_identityBound (state : RuntimeState)
    (wait : TimerWait) (next : wait.activation = timerActivationCount state wait.elementId + 1)
    (bounded : runtimeStateIdentityBound state = true) :
    runtimeStateIdentityBound
      { state with
        timerWaits := insertTimerWait wait state.timerWaits
        timerActivations := setTimerActivationCount state.timerActivations wait.elementId
          wait.activation } = true := by
  simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounded ⊢
  obtain ⟨⟨tasks, timers⟩, activities⟩ := bounded
  refine ⟨⟨tasks, ?_⟩, activities⟩
  simp only [insertTimerWait, all_canonicalInsertBy, Bool.and_eq_true, List.all_eq_true,
    decide_eq_true_eq]
  refine ⟨?_, ?_⟩
  · change wait.activation ≤ timerActivationCount
      { state with timerActivations := (setTimerActivationCount state.timerActivations
          wait.elementId wait.activation) } wait.elementId
    rw [timerActivationCount_set_self]
    exact Nat.le_refl _
  · intro candidate member
    have prior := List.all_eq_true.mp timers candidate member
    simp only [decide_eq_true_eq] at prior
    by_cases same : candidate.elementId = wait.elementId
    · rw [same] at prior ⊢
      change candidate.activation ≤ timerActivationCount
        { state with timerActivations := (setTimerActivationCount state.timerActivations
            wait.elementId wait.activation) } wait.elementId
      rw [timerActivationCount_set_self, next]
      omega
    · change candidate.activation ≤ timerActivationCount
        { state with timerActivations := (setTimerActivationCount state.timerActivations
            wait.elementId wait.activation) } candidate.elementId
      rw [timerActivationCount_set_other _ _ _ _ same]
      exact prior

theorem activityActivationCount_set_self (state : RuntimeState)
    (taskId : TaskDefinitionId) (count : Nat) :
    activityActivationCount
      { state with activityActivations := setActivationCount state.activityActivations taskId count }
      taskId = count := by
  simpa [activityActivationCount, activationCount] using
    activationCount_setActivationCount_self
      { state with activations := state.activityActivations } taskId count

theorem activityActivationCount_set_other (state : RuntimeState)
    (target query : TaskDefinitionId) (count : Nat) (other : query ≠ target) :
    activityActivationCount
      { state with activityActivations := setActivationCount state.activityActivations target count }
      query = activityActivationCount state query := by
  simpa [activityActivationCount, activationCount] using
    activationCount_setActivationCount_other
      { state with activations := state.activityActivations } target query count other

theorem insertNextActivity_preserves_identityBound (state : RuntimeState)
    (record : ActivityOccurrence)
    (_next : record.activation = activityActivationCount state
      ⟨record.activityElementId.value⟩ + 1)
    (elementFresh : ∀ old ∈ state.activityOccurrences,
      old.activityElementId.value ≠ record.activityElementId.value)
    (bounded : runtimeStateIdentityBound state = true) :
    runtimeStateIdentityBound
      { state with
        activityOccurrences := insertActivityOccurrence record state.activityOccurrences
        activityActivations := setActivationCount state.activityActivations
          ⟨record.activityElementId.value⟩ record.activation } = true := by
  simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounded ⊢
  obtain ⟨⟨tasks, timers⟩, activities⟩ := bounded
  refine ⟨⟨tasks, timers⟩, ?_⟩
  rw [insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy]
  simp only [Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq]
  refine ⟨?_, ?_⟩
  · change record.activation ≤ activityActivationCount
      { state with activityActivations := (setActivationCount state.activityActivations
          ⟨record.activityElementId.value⟩ record.activation) }
      ⟨record.activityElementId.value⟩
    rw [activityActivationCount_set_self]
    exact Nat.le_refl _
  · intro old member
    have prior := List.all_eq_true.mp activities old member
    simp only [decide_eq_true_eq] at prior
    have different : TaskDefinitionId.mk old.activityElementId.value ≠
        TaskDefinitionId.mk record.activityElementId.value := by
      intro same
      exact elementFresh old member (congrArg TaskDefinitionId.value same)
    change old.activation ≤ activityActivationCount
      { state with activityActivations := (setActivationCount state.activityActivations
          ⟨record.activityElementId.value⟩ record.activation) }
      ⟨old.activityElementId.value⟩
    rw [activityActivationCount_set_other _ _ _ _ different]
    exact prior

theorem sharedParallelEmpty_preserves_runtimeStateWellFormed (program : Program)
    (expectedInstanceId : SemanticId) (arm : ParallelMultiInstanceArm)
    (ownerScope : DefinitionScopeId) (account : SharedParallelProgramAccount program arm ownerScope)
    (before : RuntimeState) (instanceId : SemanticId) (owner : ScopeOccurrenceId)
    (running : before.control = .running instanceId)
    (tokenOwner : onlyTokenOwner? before arm.input = some owner)
    (controllerAbsent : before.parallelMultiInstanceControllers.any (fun controller =>
      controller.id.activityElementId.value == arm.taskId.value) = false)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true) :
    runtimeStateWellFormed program expectedInstanceId
      { before with
        tokens := addToken (removeToken before.tokens arm.input owner) arm.normalOutput owner
        variables := publishSharedParallelResults before arm [] } = true := by
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed ⊢
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨position, races⟩, incidents⟩, owners⟩, identities⟩,
    bounds⟩, declarations⟩, hidden⟩, order⟩, bodies⟩, attached⟩, activityIds⟩,
    controllers⟩, sequentialBindings⟩, parallelBindings⟩, controllerIds⟩, notExhausted⟩,
    lifecycle⟩ := wellFormed
  let removed : RuntimeState :=
    { before with
      tokens := removeToken before.tokens arm.input owner
      variables := publishSharedParallelResults before arm [] }
  have ownerFacts := runtimePositionValid_onlyTokenOwner_live_and_scope program
    expectedInstanceId before arm.input owner ownerScope position tokenOwner account.inputOwner
  have removedPosition : runtimePositionValid program expectedInstanceId removed = true :=
    runtimePositionValid_removeToken_frame program expectedInstanceId before removed arm.input owner
      position tokenOwner rfl rfl rfl rfl
  have ownerLive : exactLiveOccurrence removed owner = true := by
    simpa [removed, exactLiveOccurrence] using ownerFacts.1
  have positionAfter := runtimePositionValid_addToken program expectedInstanceId removed
    arm.normalOutput owner removedPosition ownerLive account.normalOutputDeclared (by
      simpa [ownerFacts.2] using account.normalOutputOwner)
  have noControllers := admitted_parallel_controllers_absent program arm ownerScope account before
    parallelBindings controllerAbsent
  have parallelAfter : parallelMultiInstanceProgramBindingsValid program
      { before with
        tokens := addToken (removeToken before.tokens arm.input owner) arm.normalOutput owner
        variables := publishSharedParallelResults before arm [] } = true := by
    simp [parallelMultiInstanceProgramBindingsValid, noControllers] at parallelBindings ⊢
    exact parallelBindings
  refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨?_, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩
  · simpa [removed] using positionAfter
  · exact races
  · exact incidents
  · exact owners
  · exact identities
  · exact bounds
  · exact declarations
  · exact hidden
  · exact order
  · exact bodies
  · exact attached
  · exact activityIds
  · exact controllers
  · rw [sequentialMultiInstanceProgramBindingsValid_frame program before
      { before with
        tokens := addToken (removeToken before.tokens arm.input owner) arm.normalOutput owner
        variables := publishSharedParallelResults before arm [] } rfl rfl rfl rfl]
    exact sequentialBindings
  · exact parallelAfter
  · exact controllerIds
  · exact notExhausted
  · simp [running]

end BpmnSemantics.SemanticProcess
