import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStatePreservation

/-! # Empty parallel Multi-Instance runtime-state preservation

The zero-item entry route closes the Activity atomically without creating a controller. This module
composes that route's existing conjunct laws into the complete runtime-state invariant while keeping
the reusable Parallel Multi-Instance preservation owner below its reviewability ceiling.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

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
  obtain ⟨existing, claims⟩ := wellFormed
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨position, races⟩, incidents⟩, owners⟩, identities⟩,
    bounds⟩, declarations⟩, hidden⟩, order⟩, bodies⟩, timersUnambiguous⟩,
    messagesUnambiguous⟩, activityIds⟩, controllers⟩, sequentialBindings⟩,
    parallelBindings⟩, controllerIds⟩, notExhausted⟩, lifecycle⟩ := existing
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
  have sequentialAfter : sequentialMultiInstanceProgramBindingsValid program
      { before with
        tokens := addToken (removeToken before.tokens arm.input owner) arm.normalOutput owner
        variables := publishSharedParallelResults before arm [] } = true := by
    rw [sequentialMultiInstanceProgramBindingsValid_frame program before
      { before with
        tokens := addToken (removeToken before.tokens arm.input owner) arm.normalOutput owner
        variables := publishSharedParallelResults before arm [] } rfl rfl rfl rfl]
    exact sequentialBindings
  have lifecycleAfter :
      (match ({ before with
        tokens := addToken (removeToken before.tokens arm.input owner) arm.normalOutput owner
        variables := publishSharedParallelResults before arm [] } : RuntimeState).control with
       | .notStarted => notStartedStateEmpty
          { before with
            tokens := addToken (removeToken before.tokens arm.input owner) arm.normalOutput owner
            variables := publishSharedParallelResults before arm [] }
       | _ => true) = true := by
    simp [running]
  refine ⟨?_, claims⟩
  refine ⟨?_, lifecycleAfter⟩
  refine ⟨?_, notExhausted⟩
  refine ⟨?_, controllerIds⟩
  refine ⟨?_, parallelAfter⟩
  refine ⟨?_, sequentialAfter⟩
  refine ⟨?_, controllers⟩
  refine ⟨?_, activityIds⟩
  refine ⟨?_, messagesUnambiguous⟩
  refine ⟨?_, timersUnambiguous⟩
  refine ⟨?_, bodies⟩
  refine ⟨?_, order⟩
  refine ⟨?_, hidden⟩
  refine ⟨?_, declarations⟩
  refine ⟨?_, bounds⟩
  refine ⟨?_, identities⟩
  refine ⟨?_, owners⟩
  refine ⟨?_, incidents⟩
  refine ⟨?_, races⟩
  simpa [removed] using positionAfter

end BpmnSemantics.SemanticProcess
