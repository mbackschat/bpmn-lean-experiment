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
