import BpmnSemantics.SemanticProcess.ParallelMultiInstanceTransition
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.ProfileAdmission

/-! # Parallel Multi-Instance evaluator soundness and invariant preservation

Each executable evaluator is a checked realization of the corresponding declarative family step.
The post-state invariant check is part of fail-closed evaluation, never a repair: a candidate that
does not satisfy the complete applicable invariant is refused before it can become committed state.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem enterParallelMultiInstance_sound (arm : ParallelMultiInstanceArm)
    (before after : ParallelMultiInstanceRuntimeState)
    (success : enterParallelMultiInstance? arm before = some after) :
    ParallelMultiInstanceEntryStep arm before after := by
  unfold enterParallelMultiInstance? at success
  cases ready : parallelEntryReady arm before with
  | false => simp [ready] at success
  | true =>
    cases admitted : admittedParallelSnapshot? arm before with
    | none => simp [ready, admitted] at success
    | some snapshot =>
        cases post : parallelMultiInstanceRuntimeWellFormed arm
            (parallelEntryState arm before snapshot) with
        | false => simp [ready, admitted, post] at success
        | true =>
          simp [ready, admitted, post] at success
          cases success
          exact .enters before snapshot ready admitted post

theorem completeParallelMultiInstance_sound (arm : ParallelMultiInstanceArm)
    (before after : ParallelMultiInstanceRuntimeState) (taskId : UserTaskInstanceId)
    (submitted : List VariableBinding)
    (success : completeParallelMultiInstance? arm before taskId submitted = some after) :
    ParallelMultiInstanceCompletionStep arm taskId submitted before after := by
  unfold completeParallelMultiInstance? at success
  cases pre : parallelMultiInstanceRuntimeWellFormed arm before with
  | false => simp [pre] at success
  | true =>
    cases candidate : parallelCompletionCandidate? arm before taskId submitted with
    | none => simp [pre, candidate] at success
    | some rewritten =>
        cases post : parallelMultiInstanceRuntimeWellFormed arm rewritten with
        | false => simp [pre, candidate, post] at success
        | true =>
          simp [pre, candidate, post] at success
          cases success
          exact .completes before after pre candidate post

theorem interruptParallelMultiInstance_sound (arm : ParallelMultiInstanceArm)
    (before after : ParallelMultiInstanceRuntimeState) (timer : TimerOccurrenceId)
    (success : interruptParallelMultiInstance? arm before timer = some after) :
    ParallelMultiInstanceTimerStep arm timer before after := by
  unfold interruptParallelMultiInstance? at success
  cases pre : parallelMultiInstanceRuntimeWellFormed arm before with
  | false => simp [pre] at success
  | true =>
    cases candidate : parallelTimerCandidate? arm before timer with
    | none => simp [pre, candidate] at success
    | some rewritten =>
        cases post : parallelMultiInstanceRuntimeWellFormed arm rewritten with
        | false => simp [pre, candidate, post] at success
        | true =>
          simp [pre, candidate, post] at success
          cases success
          exact .interrupts before after pre candidate post

theorem enterSharedParallelMultiInstance_sound (arm : ParallelMultiInstanceArm)
    (before after : RuntimeState)
    (success : enterSharedParallelMultiInstance? arm before = some after) :
    SharedParallelMultiInstanceEntryStep arm before after := by
  unfold enterSharedParallelMultiInstance? at success
  cases running : before.control with
  | notStarted => simp [running] at success
  | completed instanceId => simp [running] at success
  | cancelled instanceId => simp [running] at success
  | running instanceId =>
    cases ownerEq : onlyTokenOwner? before arm.input with
    | none => simp [running, ownerEq] at success
    | some owner =>
      cases controllers : before.parallelMultiInstanceControllers.any (fun controller =>
          controller.id.activityElementId.value == arm.taskId.value) with
      | true => simp [running, ownerEq, controllers] at success
      | false =>
        cases records : before.activityOccurrences.any (fun record =>
            record.activityElementId.value == arm.taskId.value) with
        | true => simp [running, ownerEq, controllers, records] at success
        | false =>
          cases tasks : before.waits.any (fun wait => wait.task.id == arm.taskId) with
          | true => simp [running, ownerEq, controllers, records, tasks] at success
          | false =>
            cases timers : before.timerWaits.any (fun wait =>
                wait.elementId == arm.boundaryTimer.elementId) with
            | true => simp [running, ownerEq, controllers, records, tasks, timers] at success
            | false =>
              cases snapshotEq : admittedSharedParallelSnapshot? arm before with
              | none =>
                simp [running, ownerEq, controllers, records, tasks, timers, snapshotEq] at success
              | some items =>
                cases absent : parallelOutputAbsent arm
                    { processInstanceId := instanceId
                      processBindings := before.variables.process.bindings } with
                | false =>
                  simp [running, ownerEq, controllers, records, tasks, timers, snapshotEq,
                    absent] at success
                | true =>
                  cases items with
                  | nil =>
                    simp [running, ownerEq, controllers, records, tasks, timers, snapshotEq,
                      absent] at success
                    cases success
                    exact .empty before _ instanceId owner running ownerEq controllers records
                      tasks timers snapshotEq absent (by simp [running])
                  | cons first rest =>
                    generalize pendingEq : pendingParallelTaskIds
                      (pendingParallelSlots instanceId arm.taskId (activationCount before arm.taskId)
                        (first :: rest)) = pending
                    cases pending with
                    | nil =>
                      simp [running, ownerEq, controllers, records, tasks, timers, snapshotEq,
                        absent, pendingEq] at success
                    | cons firstTask restTasks =>
                      simp [running, ownerEq, controllers, records, tasks, timers, snapshotEq,
                        absent, pendingEq] at success
                      cases success
                      exact .nonempty before _ instanceId owner first rest running ownerEq
                        controllers records tasks timers snapshotEq absent firstTask restTasks
                        pendingEq (by simp [running])

theorem completeSharedParallelMultiInstance_sound (arm : ParallelMultiInstanceArm)
    (before after : RuntimeState) (taskId : UserTaskInstanceId)
    (submitted : List VariableBinding)
    (success : completeSharedParallelMultiInstance? arm before taskId submitted = some after) :
    SharedParallelMultiInstanceCompletionStep arm taskId submitted before after := by
  unfold completeSharedParallelMultiInstance? at success
  cases running : before.control with
  | notStarted => simp [running] at success
  | completed instanceId => simp [running] at success
  | cancelled instanceId => simp [running] at success
  | running instanceId =>
    by_cases same : taskId.processInstanceId = instanceId
    ·
      cases controllerEq : parallelControllerForTask? arm before taskId with
      | none => simp [running, same, controllerEq] at success
      | some controller =>
        cases recordEq : parallelControllerRecord? before controller with
        | none => simp [running, same, controllerEq, recordEq] at success
        | some record =>
          cases region : parallelRegionValid arm before controller record with
          | false => simp [running, same, controllerEq, recordEq, region] at success
          | true =>
            cases accepted : acceptedParallelResult? arm submitted with
            | none => simp [running, same, controllerEq, accepted] at success
            | some result =>
              cases conditionEq : evaluateSimpleBooleanExpression arm.completionCondition
                  before.variables.process.bindings with
              | none =>
                simp [running, same, controllerEq, accepted, conditionEq]
                  at success
              | some condition =>
                cases completedEq : completedParallelResults?
                    (replacePendingParallelSlot controller.slots taskId result) with
                | some results =>
                  cases limits : withinParallelMultiInstanceLimits arm results with
                  | false =>
                    simp [running, same, controllerEq, accepted, conditionEq,
                      completedEq, limits] at success
                  | true =>
                    simp [running, same, controllerEq, recordEq, region, accepted, conditionEq,
                      completedEq, limits] at success
                    cases success
                    exact .final before _ instanceId controller record result condition results
                      running same controllerEq recordEq region accepted conditionEq completedEq
                      limits rfl
                | none =>
                  cases condition with
                  | true =>
                    simp [running, same, controllerEq, recordEq, region, accepted, conditionEq,
                      completedEq] at success
                    cases success
                    exact .early before _ instanceId controller record result running same
                      controllerEq recordEq region accepted conditionEq completedEq rfl
                  | false =>
                    generalize pendingEq : pendingParallelTaskIds
                      (replacePendingParallelSlot controller.slots taskId result) = pending
                    cases pending with
                    | nil =>
                      simp [running, same, controllerEq, recordEq, accepted, conditionEq,
                        completedEq, pendingEq] at success
                    | cons first rest =>
                      simp [running, same, controllerEq, recordEq, region, accepted, conditionEq,
                        completedEq, pendingEq] at success
                      cases success
                      exact .progresses before _ instanceId controller record result first rest
                        running same controllerEq recordEq region accepted conditionEq completedEq
                        pendingEq (by simp [running])
    · simp [running, same] at success

theorem interruptSharedParallelMultiInstance_sound (arm : ParallelMultiInstanceArm)
    (before after : RuntimeState) (timerId : TimerOccurrenceId) (logicalTimeMs : Nat)
    (success : interruptSharedParallelMultiInstance? arm before timerId logicalTimeMs = some after) :
    SharedParallelMultiInstanceTimerStep arm timerId logicalTimeMs before after := by
  unfold interruptSharedParallelMultiInstance? at success
  cases running : before.control with
  | notStarted => simp [running] at success
  | completed instanceId => simp [running] at success
  | cancelled instanceId => simp [running] at success
  | running instanceId =>
    by_cases same : timerId.processInstanceId = instanceId
    ·
      cases controllerEq : parallelControllerForTimer? arm before timerId with
      | none => simp [running, same, controllerEq] at success
      | some controller =>
        cases recordEq : parallelControllerRecord? before controller with
        | none => simp [running, same, controllerEq, recordEq] at success
        | some record =>
          cases region : parallelRegionValid arm before controller record with
          | false => simp [running, same, controllerEq, recordEq, region] at success
          | true =>
            generalize deadlineEq : before.timerWaits.filter (timerIdNamesWait timerId) = waits
            cases waits with
            | nil => simp [running, same, controllerEq, deadlineEq] at success
            | cons deadline rest =>
              cases rest with
              | cons next tail =>
                simp [running, same, controllerEq, deadlineEq] at success
              | nil =>
                by_cases due : logicalTimeMs = deadline.deadlineMs
                ·
                  simp [running, same, controllerEq, recordEq, region, deadlineEq, due]
                    at success
                  cases success
                  exact .interrupts before _ instanceId controller record deadline running same
                    controllerEq recordEq region deadlineEq due (by simp [due])
                · simp [running, same, controllerEq, deadlineEq, due] at success
    · simp [running, same] at success

theorem entry_evaluator_preserves_runtime_well_formedness
    (arm : ParallelMultiInstanceArm) (before after : ParallelMultiInstanceRuntimeState)
    (success : enterParallelMultiInstance? arm before = some after) :
    parallelMultiInstanceRuntimeWellFormed arm after = true := by
  cases enterParallelMultiInstance_sound arm before after success
  assumption

theorem completion_evaluator_preserves_runtime_well_formedness
    (arm : ParallelMultiInstanceArm) (before after : ParallelMultiInstanceRuntimeState)
    (taskId : UserTaskInstanceId) (submitted : List VariableBinding)
    (success : completeParallelMultiInstance? arm before taskId submitted = some after) :
    parallelMultiInstanceRuntimeWellFormed arm after = true := by
  cases completeParallelMultiInstance_sound arm before after taskId submitted success
  assumption

theorem timer_evaluator_preserves_runtime_well_formedness
    (arm : ParallelMultiInstanceArm) (before after : ParallelMultiInstanceRuntimeState)
    (timer : TimerOccurrenceId)
    (success : interruptParallelMultiInstance? arm before timer = some after) :
    parallelMultiInstanceRuntimeWellFormed arm after = true := by
  cases interruptParallelMultiInstance_sound arm before after timer success
  assumption

/-- Exact admitted Program facts consumed only by shared-state preservation. -/
structure SharedParallelProgramAccount (program : Program) (arm : ParallelMultiInstanceArm)
    (ownerScope : DefinitionScopeId) where
  profile : program.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId
  structural : programWellFormed program = true
  capabilities : programProfileCapabilitiesValid program = true
  entryOperation : SemanticOperation
  completionOperation : SemanticOperation
  entryMember : entryOperation ∈ program.operations
  completionMember : completionOperation ∈ program.operations
  projects : ParallelMultiInstanceArm.ofOperation? entryOperation = some arm
  uniqueEntry : program.operations.filterMap ParallelMultiInstanceArm.ofOperation? = [arm]
  paired : parallelMultiInstanceOperationsPair entryOperation completionOperation = true
  entryOwner : operationOwningScope? program arm.id = some ownerScope
  inputDeclared : ∃ place, program.controlPlaces.filter (fun candidate =>
    decide (candidate.id = arm.input)) = [place]
  normalOutputDeclared : ∃ place, program.controlPlaces.filter (fun candidate =>
    decide (candidate.id = arm.normalOutput)) = [place]
  timerOutputDeclared : ∃ place, program.controlPlaces.filter (fun candidate =>
    decide (candidate.id = arm.boundaryTimer.output)) = [place]
  inputOwner : program.controlPlaceScopes.filter (fun ownership =>
    decide (ownership.controlPlaceId = arm.input)) =
      [{ controlPlaceId := arm.input, scopeId := ownerScope }]
  normalOutputOwner : program.controlPlaceScopes.filter (fun ownership =>
    decide (ownership.controlPlaceId = arm.normalOutput)) =
      [{ controlPlaceId := arm.normalOutput, scopeId := ownerScope }]
  timerOutputOwner : program.controlPlaceScopes.filter (fun ownership =>
    decide (ownership.controlPlaceId = arm.boundaryTimer.output)) =
      [{ controlPlaceId := arm.boundaryTimer.output, scopeId := ownerScope }]

private theorem programWellFormed_parallel_projection_exact (program : Program)
    (operation : SemanticOperation) (valid : programWellFormed program = true)
    (member : operation ∈ program.operations)
    (projects : (ParallelMultiInstanceArm.ofOperation? operation).isSome = true) :
    parallelMultiInstanceExactEntry operation = true := by
  have operationValid := List.all_eq_true.mp (programWellFormed_operations program valid)
    operation member
  cases operation <;> simp_all only [ParallelMultiInstanceArm.ofOperation?,
    parallelMultiInstanceExactEntry, Option.isSome_some, Option.isSome_none, Bool.false_eq_true]
  case awaitParallelMultiInstanceUserTask id origin input taskId taskName data normalOutput
      boundaryTimer completionCondition limits =>
    change parallelMultiInstanceOperationWellFormed program.controlPlaces
      (.awaitParallelMultiInstanceUserTask id origin input taskId taskName data normalOutput
        boundaryTimer completionCondition limits) = true at operationValid
    simp only [parallelMultiInstanceOperationWellFormed, Bool.and_eq_true] at operationValid
    exact operationValid.1

private theorem parallel_projection_filterMap_eq_exact_of (operations : List SemanticOperation)
    (exact : ∀ operation ∈ operations,
      (ParallelMultiInstanceArm.ofOperation? operation).isSome = true →
        parallelMultiInstanceExactEntry operation = true) :
    operations.filterMap ParallelMultiInstanceArm.ofOperation? =
      (operations.filter parallelMultiInstanceExactEntry).filterMap
        ParallelMultiInstanceArm.ofOperation? := by
  induction operations with
  | nil => rfl
  | cons operation rest ih =>
      have tailExact (candidate : SemanticOperation) (member : candidate ∈ rest)
          (projects : (ParallelMultiInstanceArm.ofOperation? candidate).isSome = true) :
          parallelMultiInstanceExactEntry candidate = true :=
        exact candidate (by simp [member]) projects
      cases projectionEq : ParallelMultiInstanceArm.ofOperation? operation with
      | none =>
          have exactFalse : parallelMultiInstanceExactEntry operation = false := by
            apply Bool.eq_false_iff.mpr
            intro exactTrue
            have projects := parallelMultiInstanceExactEntry_projects operation exactTrue
            simp [projectionEq] at projects
          simp [projectionEq, exactFalse, ih tailExact]
      | some projected =>
          have exactTrue := exact operation (by simp) (by simp [projectionEq])
          simp [projectionEq, exactTrue, ih tailExact]

private theorem parallel_projection_filterMap_eq_exact (program : Program)
    (structural : programWellFormed program = true) :
    program.operations.filterMap ParallelMultiInstanceArm.ofOperation? =
      (program.operations.filter parallelMultiInstanceExactEntry).filterMap
        ParallelMultiInstanceArm.ofOperation? := by
  apply parallel_projection_filterMap_eq_exact_of
  intro operation member projects
  exact programWellFormed_parallel_projection_exact program operation structural member projects

private theorem admittedSharedParallelEntryAccount (program : Program)
    (arm : ParallelMultiInstanceArm) (entryOperation : SemanticOperation)
    (profile : program.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId)
    (structural : programWellFormed program = true)
    (capabilities : programProfileCapabilitiesValid program = true)
    (entryMember : entryOperation ∈ program.operations)
    (projects : ParallelMultiInstanceArm.ofOperation? entryOperation = some arm) :
    program.operations.filterMap ParallelMultiInstanceArm.ofOperation? = [arm] ∧
      ∃ completionOperation,
        completionOperation ∈ program.operations ∧
        parallelMultiInstanceOperationsPair entryOperation completionOperation = true ∧
        parallelMultiInstanceCompletionForEntry? program.operations entryOperation =
          some completionOperation := by
  simp only [programProfileCapabilitiesValid, Bool.and_eq_true] at capabilities
  obtain ⟨profileEntry, completionOperation, entries, completions, paired, completionLookup⟩ :=
    programParallelMultiInstanceProfile_pair_census program profile capabilities.1.2
  have selectedExact := programWellFormed_parallel_projection_exact program entryOperation
    structural entryMember (by simp [projects])
  have selectedMember : entryOperation ∈
      program.operations.filter parallelMultiInstanceExactEntry :=
    List.mem_filter.mpr ⟨entryMember, selectedExact⟩
  rw [entries] at selectedMember
  have selectedEq : entryOperation = profileEntry := by simpa using selectedMember
  subst profileEntry
  refine ⟨?_, completionOperation, ?_, paired, completionLookup⟩
  · rw [parallel_projection_filterMap_eq_exact program structural, entries]
    simp [projects]
  · exact (List.mem_filter.mp (by rw [completions]; simp)).1

private theorem nodup_of_value_nodup (values : List α) (value : α → String)
    (valid : (values.map value).Nodup) : values.Nodup := by
  induction values with
  | nil => simp
  | cons head tail ih =>
      obtain ⟨fresh, rest⟩ := List.nodup_cons.mp valid
      apply List.nodup_cons.mpr
      refine ⟨?_, ih rest⟩
      intro member
      exact fresh (List.mem_map.mpr ⟨head, member, rfl⟩)

private theorem sharedParallelProgramAccount_of_admission (program : Program)
    (arm : ParallelMultiInstanceArm) (entryOperation : SemanticOperation)
    (profile : program.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId)
    (structural : programWellFormed program = true)
    (capabilities : programProfileCapabilitiesValid program = true)
    (entryMember : entryOperation ∈ program.operations)
    (projects : ParallelMultiInstanceArm.ofOperation? entryOperation = some arm) :
    ∃ ownerScope, Nonempty (SharedParallelProgramAccount program arm ownerScope) := by
  obtain ⟨uniqueEntry, completionOperation, completionMember, paired, completionLookup⟩ :=
    admittedSharedParallelEntryAccount program arm entryOperation profile structural capabilities
      entryMember projects
  have structuralWhole := structural
  have operationValuesNodup := strictlySortedStrings_nodup _
    (programWellFormed_operationIdsSorted program structural)
  have placeValuesNodup := strictlySortedStrings_nodup _
    (programWellFormed_controlPlaceIdsSorted program structural)
  have operationIdsUnique : (program.operations.map (fun operation => operation.id)).Nodup :=
    nodup_of_value_nodup _ (fun operationId => operationId.value) (by
      rw [List.map_map]
      exact operationValuesNodup)
  have placeIdsUnique : (program.controlPlaces.map (fun place => place.id)).Nodup :=
    nodup_of_value_nodup _ (fun placeId => placeId.value) (by
      rw [List.map_map]
      exact placeValuesNodup)
  have entryId : entryOperation.id = arm.id := by
    cases entryOperation <;> simp [ParallelMultiInstanceArm.ofOperation?] at projects
    rw [← projects]
    rfl
  obtain ⟨ownerScope, inputDeclared, timerDeclared, normalDeclared, entryScope, _, inputOwner,
      timerOwner, normalOwner, inputDeclaration, timerDeclaration, normalDeclaration⟩ :=
    programGraphWellFormed_pairedOperationControlPlaceScopes program entryOperation
      completionOperation arm (programWellFormed_graph program structural) operationIdsUnique
      placeIdsUnique entryMember
      completionMember projects paired completionLookup
  have entryOwner : operationOwningScope? program arm.id = some ownerScope := by
    unfold operationOwningScope?
    rw [← entryId, entryScope]
  exact ⟨ownerScope, ⟨
    { profile, structural := structuralWhole, capabilities, entryOperation, completionOperation,
      entryMember, completionMember, projects, uniqueEntry, paired, entryOwner,
      inputDeclared := ⟨inputDeclared, inputDeclaration⟩,
      normalOutputDeclared := ⟨normalDeclared, normalDeclaration⟩,
      timerOutputDeclared := ⟨timerDeclared, timerDeclaration⟩, normalOutputOwner := normalOwner,
      timerOutputOwner := timerOwner, inputOwner }⟩⟩

private theorem admitted_parallel_controllers_absent (program : Program)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope) (state : RuntimeState)
    (bindings : parallelMultiInstanceProgramBindingsValid program state = true)
    (absent : state.parallelMultiInstanceControllers.any (fun controller =>
      controller.id.activityElementId.value == arm.taskId.value) = false) :
    state.parallelMultiInstanceControllers = [] := by
  exact parallelControllers_absent_of_unique_entry program arm state account.uniqueEntry bindings
    absent

private theorem sharedParallelEmpty_preserves_runtimeStateWellFormed (program : Program)
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

/-- Public command application preserves the exact pre-state for every semantic refusal. -/
def completeParallelMultiInstanceOrPreserve (arm : ParallelMultiInstanceArm)
    (before : ParallelMultiInstanceRuntimeState) (taskId : UserTaskInstanceId)
    (submitted : List VariableBinding) : ParallelMultiInstanceRuntimeState :=
  (completeParallelMultiInstance? arm before taskId submitted).getD before

theorem stale_or_duplicate_completion_preserves_exact_state
    (arm : ParallelMultiInstanceArm) (before : ParallelMultiInstanceRuntimeState)
    (taskId : UserTaskInstanceId) (submitted : List VariableBinding)
    (refused : completeParallelMultiInstance? arm before taskId submitted = none) :
    completeParallelMultiInstanceOrPreserve arm before taskId submitted = before := by
  simp [completeParallelMultiInstanceOrPreserve, refused]

/-- Shared command application preserves the exact pre-state for every semantic refusal. -/
def completeSharedParallelMultiInstanceOrPreserve (arm : ParallelMultiInstanceArm)
    (before : RuntimeState) (taskId : UserTaskInstanceId)
    (submitted : List VariableBinding) : RuntimeState :=
  (completeSharedParallelMultiInstance? arm before taskId submitted).getD before

theorem shared_stale_or_duplicate_completion_preserves_exact_state
    (arm : ParallelMultiInstanceArm) (before : RuntimeState)
    (taskId : UserTaskInstanceId) (submitted : List VariableBinding)
    (refused : completeSharedParallelMultiInstance? arm before taskId submitted = none) :
    completeSharedParallelMultiInstanceOrPreserve arm before taskId submitted = before := by
  simp [completeSharedParallelMultiInstanceOrPreserve, refused]

end BpmnSemantics.SemanticProcess
