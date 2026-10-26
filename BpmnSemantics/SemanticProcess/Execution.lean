module

public import BpmnSemantics.SemanticProcess.ExecutionRuntime
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessCompletionLaws
public import BpmnSemantics.SemanticProcess.CallDataStateLaws
public import BpmnSemantics.SemanticProcess.CommandAdmissionLaws
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime

/-! # Semantic Process external execution

This module owns reusable full-occurrence-identity refusal laws over `ExecutionRuntime` states. Bounded closure and the pure `applyStimulus` boundary are owned by `TransitionTrace`; external command admission, wait completion, scenario projection, and capsule fixtures remain separate.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem applyStimulus_rejected_of_admission
    (closureLimit : Nat) (program : Program) (state : RuntimeState)
    (stimulus : Stimulus)
    (rejected : admitStimulus program state stimulus =
      { outcome := .rejected, state }) :
    applyStimulus closureLimit program state stimulus =
      { outcome := .rejected
        state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  simp [applyStimulus, rejected]

/-- Exact committed admission successors determine successful evaluation for every profile.
`CLOSURE-ATOMIC-01` retains the distinct predecessor on rollback, so the conclusion requires successful closure. -/
theorem applyStimulus_equal_of_same_admitted_successor
    (closureLimit : Nat) (program : Program)
    (leftState rightState successor : RuntimeState) (stimulus : Stimulus)
    (leftAdmission : admitStimulus program leftState stimulus = { outcome := .committed, state := successor })
    (rightAdmission : admitStimulus program rightState stimulus = { outcome := .committed, state := successor })
    (committed : (applyStimulus closureLimit program leftState stimulus).outcome = .committed) :
    applyStimulus closureLimit program leftState stimulus =
      applyStimulus closureLimit program rightState stimulus := by
  simp only [applyStimulus, leftAdmission, rightAdmission] at committed ⊢
  unfold StimulusResult.ofScheduledClosure at committed ⊢
  split at committed
  · simp at committed
  · rename_i successful
    simp only [ite_eq_right successful]
    unfold StimulusResult.ofClosure at committed ⊢
    split at committed <;> simp_all

private theorem committedScheduledClosureFacts (before : RuntimeState)
    (closed : InternalCommutation.ScheduledClosureResult)
    (committed : (StimulusResult.ofScheduledClosure before closed).outcome = .committed) :
    closed.failed = false ∧ (StimulusResult.ofScheduledClosure before closed).state = closed.state := by
  unfold StimulusResult.ofScheduledClosure at committed ⊢
  split at committed
  · simp at committed
  · rename_i scheduleAccepted
    simp only [ite_eq_right scheduleAccepted]
    unfold StimulusResult.ofClosure at committed ⊢
    split at committed
    · simp at committed
    · rename_i closureAccepted
      simp [closureAccepted, InternalCommutation.ScheduledClosureResult.failed, scheduleAccepted]

/-- Every committed command exposes a stable complete frontier, as required by reachable retirement. -/
theorem applyStimulus_committed_frontier_stable
    (closureLimit : Nat) (program : Program) (before : RuntimeState) (stimulus : Stimulus)
    (committed : (applyStimulus closureLimit program before stimulus).outcome = .committed) :
    let after := (applyStimulus closureLimit program before stimulus).state
    ((InternalCommutation.deriveInternalExecutionFrontier program after).offers.isEmpty &&
      !(InternalCommutation.deriveInternalExecutionFrontier program after).preparationFailed) = true := by
  cases outcome : (admitStimulus program before stimulus).outcome <;>
    simp only [applyStimulus, outcome] at committed ⊢ <;> try contradiction
  obtain ⟨succeeded, stateEq⟩ := committedScheduledClosureFacts before _ committed
  rw [stateEq]
  exact InternalCommutation.closeScheduledTraced_success_stable closureLimit program
    (stimulusCommandId stimulus) 1 0 [] (admitStimulus program before stimulus).state succeeded

private theorem empty_activities_refuse_scope_binding (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (empty : state.activityOccurrences = []) :
    sequentialScopeBindingForOwner? program state owner = none := by
  unfold sequentialScopeBindingForOwner?
  split <;> cases control : state.control <;> simp [sequentialScopeBindingForEntry?, empty, control]
 private theorem empty_activities_refuse_scoped_effect (program : Program) (state : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (empty : state.activityOccurrences = []) :
    completeSequentialScopeEffect? program state effectId result = none := by
  have unbound := empty_activities_refuse_scope_binding program state
  simp only [completeSequentialScopeEffect?]
  split <;> try rfl
  cases result <;> try rfl
  simp [completeSequentialScopeEffectData?, writeSequentialScopeValues?, unbound _ empty]
  split <;> simp

private theorem empty_process_refuses_parallel_scope_start (program : Program) :
    ParallelScopeStart.programStartCapacity program [] = none := by
  cases analysis : ParallelScopeStart.analyzeProgram program <;>
    simp [ParallelScopeStart.programStartCapacity, analysis]

private theorem empty_process_refuses_parallel_scope_capacity (program : Program) (state : RuntimeState)
    (empty : state.variables.process.bindings = []) :
    ParallelScopeStart.programStateCapacity program state = none := by
  simp [ParallelScopeStart.programStateCapacity, empty, empty_process_refuses_parallel_scope_start]

private theorem empty_process_refuses_parallel_scope_effect (program : Program) (state : RuntimeState)
    (commandId : SemanticId) (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (empty : state.variables.process.bindings = [])
    (selected : ParallelScopeStart.programSelected program = true) :
    ParallelScopeCommand.stimulusAdmitted program state (.completeEffect commandId effectId result) = false := by
  have capacity := empty_process_refuses_parallel_scope_capacity program state empty
  cases analysis : ParallelScopeStart.analyzeProgram program <;> cases result <;>
    simp [ParallelScopeCommand.stimulusAdmitted, selected, analysis, capacity]

/-- A matching effect result whose patch cannot satisfy the committed mapping contract is rejected with exact state preservation. -/
theorem effect_result_mapping_failure_is_rejected
    (program : Program) (wait : EffectWait)
    (completionCommandId : SemanticId)
    (result : EffectExecutionResult) (logicalTimeMs : Nat)
    (legacy : program.identity.semanticProfile ≠ serialBusinessTaskProfileId)
    (legacyMixed : program.identity.semanticProfile ≠ mixedTaskControlFlowProfileId)
    (legacyError : program.identity.semanticProfile ≠ mixedTaskBusinessErrorProfileId)
    (legacyEffectData : program.identity.semanticProfile ≠ portableEffectDataProfileId)
    (legacyNested : nestedScopeDataProgram program = false)
    (invalid :
      let owner : EffectOccurrenceId :=
        { processInstanceId := wait.processInstanceId
          elementId := ⟨wait.elementId.value⟩
          activation := wait.activation }
      completeActivityVariableScope
          (addActivityVariableScope emptyScopedVariables owner wait.arguments)
          owner wait.outputMappings result = none) :
    let effectId : EffectOccurrenceId :=
      { processInstanceId := wait.processInstanceId
        elementId := ⟨wait.elementId.value⟩
        activation := wait.activation }
    applyStimulus scenarioClosureLimit program
        (singletonEffectWaitingState wait logicalTimeMs)
        (.completeEffect completionCommandId effectId result) =
      { outcome := .rejected
        state := singletonEffectWaitingState wait logicalTimeMs
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  let state := singletonEffectWaitingState wait logicalTimeMs
  let effectId : EffectOccurrenceId :=
    { processInstanceId := wait.processInstanceId
      elementId := ⟨wait.elementId.value⟩
      activation := wait.activation }
  have scopedInvalid :
      completeActivityVariableScope state.variables effectId
          wait.outputMappings result = none := by
    simpa [state, singletonEffectWaitingState, effectId, initialState]
      using invalid
  have noCompletion : completeEffect state effectId result = none := by
    unfold completeEffect
    have occurrence :
        state.effectWaits.find? (effectIdNamesWait effectId) =
          some wait := by
      simp [state, singletonEffectWaitingState, effectId,
        effectIdNamesWait]
    simp only [occurrence]
    rw [scopedInvalid]
  change applyStimulus scenarioClosureLimit program state
      (.completeEffect completionCommandId effectId result) =
    { outcome := .rejected
      state
      internalStepBoundExceeded := false
      ambiguousInternalChoice := false }
  have rejectedAdmission :
      admitStimulus program state
          (.completeEffect completionCommandId effectId result) =
        { outcome := .rejected, state } := by
    have noScopedCompletion := empty_activities_refuse_scoped_effect program state effectId result rfl
    have noIncidents : state.effectIncidents = [] := rfl
    have running : state.control = .running wait.processInstanceId := rfl
    have noCompensationWaits : state.compensationHandlerEffectWaits = [] := rfl
    have exactOrdinaryWaits :
        state.effectWaits.filter (effectIdNamesWait effectId) = [wait] := by
      simp [state, singletonEffectWaitingState, effectId, effectIdNamesWait]
    cases declared : program.compensationEventSubProcessSnapshots with
    | none =>
        simp [admitStimulus, declared, noIncidents, running, noCompensationWaits,
          exactOrdinaryWaits, noCompletion, noScopedCompletion, legacy, legacyMixed, legacyError, legacyEffectData,
          legacyNested]
        intro _ _ _ _ admitted selected
        have refused := empty_process_refuses_parallel_scope_effect program state
          completionCommandId effectId result rfl selected
        simp [refused] at admitted
    | some _ => simp [admitStimulus, declared]
  simp [applyStimulus, rejectedAdmission]

/-- A matching effect occurrence whose typed result has no committed route is rejected with exact state preservation. -/
theorem effect_result_route_failure_is_rejected
    (program : Program) (wait : EffectWait)
    (completionCommandId : SemanticId)
    (result : EffectExecutionResult) (logicalTimeMs : Nat)
    (legacy : program.identity.semanticProfile ≠ serialBusinessTaskProfileId)
    (legacyMixed : program.identity.semanticProfile ≠ mixedTaskControlFlowProfileId)
    (legacyError : program.identity.semanticProfile ≠ mixedTaskBusinessErrorProfileId)
    (legacyEffectData : program.identity.semanticProfile ≠ portableEffectDataProfileId)
    (invalid : effectResultOutput wait result = none) :
    let effectId : EffectOccurrenceId :=
      { processInstanceId := wait.processInstanceId
        elementId := ⟨wait.elementId.value⟩
        activation := wait.activation }
    applyStimulus scenarioClosureLimit program
        (singletonEffectWaitingState wait logicalTimeMs)
        (.completeEffect completionCommandId effectId result) =
      { outcome := .rejected
        state := singletonEffectWaitingState wait logicalTimeMs
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  let state := singletonEffectWaitingState wait logicalTimeMs
  let effectId : EffectOccurrenceId :=
    { processInstanceId := wait.processInstanceId
      elementId := ⟨wait.elementId.value⟩
      activation := wait.activation }
  have noCompletion : completeEffect state effectId result = none := by
    simp [completeEffect, state, singletonEffectWaitingState,
      effectId, effectIdNamesWait, invalid]
    split <;> rfl
  change applyStimulus scenarioClosureLimit program state
      (.completeEffect completionCommandId effectId result) =
    { outcome := .rejected
      state
      internalStepBoundExceeded := false
      ambiguousInternalChoice := false }
  have rejectedAdmission :
      admitStimulus program state
          (.completeEffect completionCommandId effectId result) =
        { outcome := .rejected, state } := by
    have noScopedCompletion := empty_activities_refuse_scoped_effect program state effectId result rfl
    have noIncidents : state.effectIncidents = [] := rfl
    have running : state.control = .running wait.processInstanceId := rfl
    have noCompensationWaits : state.compensationHandlerEffectWaits = [] := rfl
    have exactOrdinaryWaits :
        state.effectWaits.filter (effectIdNamesWait effectId) = [wait] := by
      simp [state, singletonEffectWaitingState, effectId, effectIdNamesWait]
    cases declared : program.compensationEventSubProcessSnapshots with
    | none =>
        simp [admitStimulus, declared, noIncidents, running, noCompensationWaits,
          exactOrdinaryWaits, noCompletion, noScopedCompletion, legacy, legacyMixed, legacyError, legacyEffectData,
          NestedScopeData.completeEffect?_without_success program state effectId result (by
            intro patch success; simp [success, effectResultOutput] at invalid)]
        intro _ _ _ _ admitted selected
        have refused := empty_process_refuses_parallel_scope_effect program state
          completionCommandId effectId result rfl selected
        simp [refused] at admitted
    | some _ => simp [admitStimulus, declared]
  simp [applyStimulus, rejectedAdmission]

private theorem raw_task_completion_frames_message_phase (program : Program)
    (before after : RuntimeState) (instanceId processId : SemanticId)
    (task : TaskDefinitionId) (activation : Nat)
    (running : before.control = .running instanceId)
    (completed : completeUserTask before processId task activation = some after) :
    interruptingMessageEventSubProcessStateValid program after =
      interruptingMessageEventSubProcessStateValid program before := by
  unfold completeUserTask at completed
  split at completed
  · simp at completed
  · rename_i wait found
    cases completed
    exact message_handler_phase_wait_token_exchange program before instanceId wait running
      (List.mem_of_find?_eq_some found)

/-- Matching ordinary User Task completions with one raw successor and admissible right-hand storage agree after successful closure.
Repeated-scope profiles use exact admitted successors because scoped writes depend on the selected owner.
`CLOSURE-ATOMIC-01` retains each distinct input on rollback, so admitted-successor equality alone does not equate failed results. -/
theorem user_task_completion_with_same_successor_is_equal
    (closureLimit : Nat) (program : Program)
    (leftState rightState successor : RuntimeState)
    (completionCommandId : SemanticId)
    (submittedTaskId : UserTaskInstanceId)
    (submittedValues : List VariableBinding)
    (noRepeatedScope : sequentialScopeProgramSelected program = false)
    (noParallelRepeatedScope : ParallelScopeStart.programSelected program = false)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (rightStorage : committedStateCollectionAdmitted rightState = true)
    (serialGuardAgreement :
      serialBusinessCommandAdmitted program leftState
        (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues) =
      serialBusinessCommandAdmitted program rightState
        (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues))
    (unselectedEffectData : program.identity.semanticProfile ≠ portableEffectDataProfileId)
    (unselectedNested : nestedScopeDataProgram program = false)
    (leftRunning : leftState.control = .running submittedTaskId.processInstanceId)
    (rightRunning : rightState.control = .running submittedTaskId.processInstanceId)
    (ordinaryTask :
      isBoundedTaskDefinition program ⟨submittedTaskId.elementId.value⟩ = false ∧
        isMonitoredTaskDefinition program ⟨submittedTaskId.elementId.value⟩ = false)
    (noMessageBoundedTask : isMessageBoundedTaskDefinition program
      ⟨submittedTaskId.elementId.value⟩ = false)
    (noMessageMonitoredTask : isMessageMonitoredTaskDefinition program
      ⟨submittedTaskId.elementId.value⟩ = false)
    (noSequentialMultiInstance : sequentialMultiInstanceOperationForTask? program
      ⟨submittedTaskId.elementId.value⟩ = none)
    (noParallelMultiInstance : parallelMultiInstanceEntryForTask? program
      ⟨submittedTaskId.elementId.value⟩ = none)
    (noDataInputTask : isDataInputTaskDefinition program
      ⟨submittedTaskId.elementId.value⟩ = false)
    (noDataInputOutputTask : isDataInputOutputTaskDefinition program
      ⟨submittedTaskId.elementId.value⟩ = false)
    (noDataOutputTask : isDataOutputTaskDefinition program
      ⟨submittedTaskId.elementId.value⟩ = false)
    (ordinaryProgram : isCallActivityProgram program = false)
    (nonCompensationTarget : compensationTargetDeclaredForFamily program
      ⟨submittedTaskId.elementId.value⟩ .ordinaryUserTask = false)
    (leftNoIncidents : leftState.effectIncidents = [])
    (rightNoIncidents : rightState.effectIncidents = [])
    (valuesAdmitted : processDataBindingsAdmitted program.identity.semanticProfile
      .userTaskCompletion submittedValues = true)
    (leftCompletion : completeUserTask leftState submittedTaskId.processInstanceId
      ⟨submittedTaskId.elementId.value⟩ submittedTaskId.activation = some successor)
    (rightCompletion : completeUserTask rightState submittedTaskId.processInstanceId
      ⟨submittedTaskId.elementId.value⟩ submittedTaskId.activation = some successor)
    (committed : (applyStimulus closureLimit program leftState
      (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues)).outcome =
        .committed) :
    applyStimulus closureLimit program leftState
        (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues) =
      applyStimulus closureLimit program rightState
        (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues) := by
  simp [sequentialScopeProgramSelected] at noRepeatedScope
  have leftSerial : serialBusinessCommandAdmitted program leftState
      (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues) = true := by
    cases accepted : serialBusinessCommandAdmitted program leftState
        (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues) with
    | false => simp [applyStimulus, admitStimulus, snapshotAbsent, accepted] at committed
    | true => rfl
  have rightSerial := serialGuardAgreement.symm.trans leftSerial
  have notCallData : program.identity.semanticProfile ≠ callDataCheckpointProfileId := by
    intro profile
    have valid : callDataRuntimeStateValid program leftState = true := by
      cases checked : callDataRuntimeStateValid program leftState with
      | false =>
          have refused := admitStimulus_invalid_call_data_state program leftState
            (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues) checked
          simp [applyStimulus, refused] at committed
      | true => rfl
    have composed := callData_valid_completion_has_composed_definition program leftState successor
      submittedTaskId.processInstanceId submittedTaskId.processInstanceId
      ⟨submittedTaskId.elementId.value⟩ submittedTaskId.activation profile leftRunning valid leftCompletion
    simp [noDataInputOutputTask] at composed
  have leftDataValid : callDataRuntimeStateValid program leftState = true := by
    simp [callDataRuntimeStateValid, notCallData]
  have rightDataValid : callDataRuntimeStateValid program rightState = true := by
    simp [callDataRuntimeStateValid, notCallData]
  have leftPhaseValid : interruptingMessageEventSubProcessStateValid program leftState = true := by
    cases checked : interruptingMessageEventSubProcessStateValid program leftState with
    | false => simp [applyStimulus, admitStimulus, snapshotAbsent, leftSerial, unselectedEffectData, unselectedNested, leftDataValid, checked] at committed
    | true => rfl
  have rightPhaseValid : interruptingMessageEventSubProcessStateValid program rightState = true := by
    rw [← raw_task_completion_frames_message_phase program rightState successor _ _ _ _ rightRunning rightCompletion,
      raw_task_completion_frames_message_phase program leftState successor _ _ _ _ leftRunning leftCompletion]
    exact leftPhaseValid
  have inputRefused (state : RuntimeState) :=
    undeclaredTaskRefusesCompletion program state submittedTaskId.processInstanceId
      ⟨submittedTaskId.elementId.value⟩ submittedTaskId.activation noDataInputTask
  have noOutputAssociation : dataOutputAssociation? program
      ⟨submittedTaskId.elementId.value⟩ = none := by
    have notUnique : ((dataOutputTaskOperations program).filter fun entry =>
        decide (entry.1 = ⟨submittedTaskId.elementId.value⟩)).length ≠ 1 := by
      simpa [isDataOutputTaskDefinition, List.countP_eq_length_filter] using noDataOutputTask
    unfold dataOutputAssociation?
    split
    · rename_i entry matching
      simp [matching] at notUnique
    · rfl
  have outputRefused (state : RuntimeState) :=
    dataOutputUndeclaredTaskRefusesCompletion program state
      submittedTaskId.processInstanceId ⟨submittedTaskId.elementId.value⟩
      submittedTaskId.activation submittedValues noOutputAssociation
  have admittedOutcome : (admitStimulus program leftState
      (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues)).outcome = .committed := by
    cases outcome : (admitStimulus program leftState
        (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues)).outcome <;>
      simp_all [applyStimulus]
  have leftStorage := admitStimulus_committed_collection_storage program leftState _ admittedOutcome
  have admissionsEqual : admitStimulus program leftState
      (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues) =
      admitStimulus program rightState
        (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues) := by
    cases serialInput : ((program.identity.semanticProfile != serialBusinessTaskProfileId && program.identity.semanticProfile != mixedTaskControlFlowProfileId && program.identity.semanticProfile != mixedTaskBusinessErrorProfileId) ||
      SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) submittedValues) <;>
    cases completionAdmitted : structuredCompositionOrdinaryCompletionAdmitted program
      submittedTaskId submittedValues <;>
    cases inputPresent : (dataInputTaskOperations program).any (fun entry =>
    decide (entry.1 = ⟨submittedTaskId.elementId.value⟩)) <;>
    cases outputPresent : (dataOutputTaskOperations program).any (fun entry =>
      decide (entry.1 = ⟨submittedTaskId.elementId.value⟩)) <;>
    simp [admitStimulus, leftStorage, rightStorage, noRepeatedScope, noParallelRepeatedScope, snapshotAbsent, leftSerial, rightSerial, unselectedEffectData, unselectedNested, leftDataValid, rightDataValid, leftPhaseValid, rightPhaseValid, leftNoIncidents,
    rightNoIncidents, leftRunning, rightRunning,
    ordinaryTask.1, ordinaryTask.2, noSequentialMultiInstance, noParallelMultiInstance,
    noMessageBoundedTask, noMessageMonitoredTask, noDataInputOutputTask, inputPresent, outputPresent,
    inputRefused, outputRefused,
    ordinaryProgram, valuesAdmitted, completionAdmitted, serialInput,
    completeOrdinaryUserTaskWithCompensation?, nonCompensationTarget, leftCompletion,
    rightCompletion] at admittedOutcome ⊢
    all_goals try (split at admittedOutcome <;> simp_all)
    all_goals simp_all
  have exactAdmission : admitStimulus program leftState
      (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues) =
      { outcome := .committed, state := (admitStimulus program leftState
        (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues)).state } := by
    cases admission : admitStimulus program leftState
        (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues) with
    | mk outcome state =>
        have outcomeCommitted : outcome = .committed := by simpa only [admission] using admittedOutcome
        simp only [outcomeCommitted]
  exact applyStimulus_equal_of_same_admitted_successor closureLimit program leftState rightState _ _
    exactAdmission (admissionsEqual.symm.trans exactAdmission) committed

private theorem empty_activities_refuse_monitored_task_completion (program : Program)
    (state : RuntimeState) (process : SemanticId) (task : TaskDefinitionId) (activation : Nat)
    (empty : state.activityOccurrences = []) :
    completeSelectedMonitoredUserTask? program state process task activation = none := by
  unfold completeSelectedMonitoredUserTask?
  rw [empty]
  rfl

private theorem empty_activities_refuse_message_monitored_completion (program : Program)
    (state : RuntimeState) (process : SemanticId) (task : TaskDefinitionId) (activation : Nat)
    (values : List VariableBinding) (empty : state.activityOccurrences = []) :
    completeMessageMonitoredUserTask? program state process task activation values = none := by
  unfold completeMessageMonitoredUserTask?
  split
  · rfl
  · unfold messageMonitoredPairForTask?
    rw [empty]
    rfl

private theorem empty_activities_refuse_monitored_task_timer (program : Program)
    (state : RuntimeState) (identity : TimerOccurrenceId) (time : Nat)
    (empty : state.activityOccurrences = []) :
    spawnFromSelectedMonitoredUserTask? program state identity time = .ok none := by
  unfold spawnFromSelectedMonitoredUserTask?
  rw [empty]
  rfl

private theorem singleton_task_mismatch_refuses_parallel_completion
    (program : Program) (wait : UserTaskWait) (id : UserTaskInstanceId)
    (values : List VariableBinding) (time : Nat) (variables : ScopedVariables)
    (mismatch : id.processInstanceId ≠ wait.processInstanceId ∨
      id.elementId.value ≠ wait.task.id.value ∨ id.activation ≠ wait.activation) :
    ParallelScopeCommand.completeTask? program (singletonWaitingState wait time variables) id values = none := by
  rcases mismatch with processMismatch | elementMismatch | activationMismatch
  · simp [ParallelScopeCommand.completeTask?, singletonWaitingState, taskIdNamesWait, processMismatch]
  · simp [ParallelScopeCommand.completeTask?, singletonWaitingState, taskIdNamesWait, elementMismatch]
  · simp [ParallelScopeCommand.completeTask?, singletonWaitingState, taskIdNamesWait, activationMismatch]

/-- Any ordinary-family mismatch in the full semantic task-occurrence identity rejects completion with exact state preservation. -/
theorem task_identity_mismatch_is_rejected
    (program : Program) (wait : UserTaskWait)
    (completionCommandId : SemanticId)
    (submittedTaskId : UserTaskInstanceId)
    (submittedValues : List VariableBinding)
    (logicalTimeMs : Nat)
    (variables : ScopedVariables)
    (noSequentialMultiInstance : sequentialMultiInstanceOperationForTask? program
      ⟨submittedTaskId.elementId.value⟩ = none)
    (noParallelMultiInstance : parallelMultiInstanceEntryForTask? program
      ⟨submittedTaskId.elementId.value⟩ = none)
    (mismatch :
      submittedTaskId.processInstanceId ≠ wait.processInstanceId ∨
      submittedTaskId.elementId.value ≠ wait.task.id.value ∨
      submittedTaskId.activation ≠ wait.activation) :
    applyStimulus scenarioClosureLimit program
        (singletonWaitingState wait logicalTimeMs variables)
        (.completeUserTaskInstance completionCommandId submittedTaskId
          submittedValues) =
      { outcome := .rejected
        state := singletonWaitingState wait logicalTimeMs variables
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  have noParallelCompletion := singleton_task_mismatch_refuses_parallel_completion program wait
    submittedTaskId submittedValues logicalTimeMs variables mismatch
  by_cases selected : ParallelScopeStart.programSelected program = true
  · apply applyStimulus_rejected_of_admission
    have running : (singletonWaitingState wait logicalTimeMs variables).control = .running wait.processInstanceId := rfl
    have noIncidents : (singletonWaitingState wait logicalTimeMs variables).effectIncidents = [] := rfl
    cases declared : program.compensationEventSubProcessSnapshots <;>
      simp [admitStimulus, declared, selected, running, noIncidents, noParallelCompletion]
  have unselected : ParallelScopeStart.programSelected program = false := by
    cases selection : ParallelScopeStart.programSelected program <;> simp_all
  rcases mismatch with processMismatch | remainingMismatch
  · apply applyStimulus_rejected_of_admission
    cases declared : program.compensationEventSubProcessSnapshots <;>
      simp [taskIdNamesWait, admitStimulus, declared, ParallelScopeCommand.stimulusAdmitted, unselected,
        completeOrdinaryUserTaskWithCompensation?, matchingOrdinaryUserTaskWait?, completeUserTask,
        initialState,
        completeBoundedUserTask?, empty_activities_refuse_monitored_task_completion, completeDataInputOutputUserTask?,
        isDataInputOutputTaskDefinition, dataInputOutputTaskContract?,
        dataInputOutputTaskContracts, dataInputOutputTaskWait?, completeDataInputUserTask?,
        completeDataOutputUserTask?, dataOutputAssociation?,
        dataOutputTaskOperations, dataOutputTaskWait?, dataInputTaskWait?,
        completeMessageBoundedUserTask?, messageBoundedPairForTask?,
          empty_activities_refuse_message_monitored_completion,
        NestedScopeData.completeUserTask?, singletonWaitingState, sequentialScopeTaskWaits, noSequentialMultiInstance,
          noParallelMultiInstance, processMismatch]
  · rcases remainingMismatch with elementMismatch | activationMismatch
    · apply applyStimulus_rejected_of_admission
      cases declared : program.compensationEventSubProcessSnapshots <;>
        simp [taskIdNamesWait, admitStimulus, declared, ParallelScopeCommand.stimulusAdmitted, unselected,
          completeOrdinaryUserTaskWithCompensation?, matchingOrdinaryUserTaskWait?, completeUserTask,
          initialState,
          completeBoundedUserTask?, empty_activities_refuse_monitored_task_completion, completeDataInputOutputUserTask?,
          isDataInputOutputTaskDefinition, dataInputOutputTaskContract?,
          dataInputOutputTaskContracts, dataInputOutputTaskWait?, completeDataInputUserTask?,
          completeDataOutputUserTask?, dataOutputAssociation?,
          dataOutputTaskOperations, dataOutputTaskWait?, dataInputTaskWait?,
          completeMessageBoundedUserTask?, messageBoundedPairForTask?,
          empty_activities_refuse_message_monitored_completion,
          NestedScopeData.completeUserTask?, singletonWaitingState, sequentialScopeTaskWaits, noSequentialMultiInstance,
          noParallelMultiInstance, elementMismatch]
    · apply applyStimulus_rejected_of_admission
      cases declared : program.compensationEventSubProcessSnapshots <;>
        simp [taskIdNamesWait, admitStimulus, declared, ParallelScopeCommand.stimulusAdmitted, unselected,
          completeOrdinaryUserTaskWithCompensation?, matchingOrdinaryUserTaskWait?, completeUserTask,
          initialState,
          completeBoundedUserTask?, empty_activities_refuse_monitored_task_completion, completeDataInputOutputUserTask?,
          isDataInputOutputTaskDefinition, dataInputOutputTaskContract?,
          dataInputOutputTaskContracts, dataInputOutputTaskWait?, completeDataInputUserTask?,
          completeDataOutputUserTask?, dataOutputAssociation?,
          dataOutputTaskOperations, dataOutputTaskWait?, dataInputTaskWait?,
          completeMessageBoundedUserTask?, messageBoundedPairForTask?,
          empty_activities_refuse_message_monitored_completion,
          NestedScopeData.completeUserTask?, singletonWaitingState, sequentialScopeTaskWaits, noSequentialMultiInstance,
          noParallelMultiInstance, activationMismatch]

private theorem empty_activities_refuse_monitored_scope (program : Program) (state : RuntimeState)
    (identity : TimerOccurrenceId) (time : Nat) (empty : state.activityOccurrences = []) :
    spawnFromMonitoredScope? program state identity time = .ok none := by
  unfold spawnFromMonitoredScope?
  cases selected : monitoredScopePairForDeadline? program state identity with
  | none => rfl
  | some pair =>
      have census := pair.property.2.1.2.2.2.2.1
      simp [empty] at census

/-- Any generic timer-family mismatch in the full occurrence identity or exact logical deadline rejects firing with exact state preservation. This one law covers both early and late firing. -/
theorem timer_identity_or_time_mismatch_is_rejected
    (program : Program) (wait : TimerWait)
    (fireCommandId : SemanticId)
    (submittedTimerId : TimerOccurrenceId) (submittedLogicalTimeMs : Nat)
    (currentLogicalTimeMs : Nat)
    (noSequentialMultiInstance : sequentialMultiInstanceOperationForTimer? program
      ⟨submittedTimerId.elementId.value⟩ = none)
    (noParallelMultiInstance : parallelMultiInstanceEntryForTimer? program
      ⟨submittedTimerId.elementId.value⟩ = none)
    (mismatch :
      submittedTimerId.processInstanceId ≠ wait.processInstanceId ∨
      submittedTimerId.elementId.value ≠ wait.elementId.value ∨
      submittedTimerId.activation ≠ wait.activation ∨
      submittedLogicalTimeMs ≠ wait.deadlineMs) :
    applyStimulus scenarioClosureLimit program
        (singletonTimerWaitingState wait currentLogicalTimeMs)
        (.fireTimer fireCommandId submittedTimerId submittedLogicalTimeMs) =
      { outcome := .rejected
        state := singletonTimerWaitingState wait currentLogicalTimeMs
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  rcases mismatch with processMismatch | remainingMismatch
  · apply applyStimulus_rejected_of_admission
    cases declared : program.compensationEventSubProcessSnapshots <;>
      simp [timerIdNamesWait, admitStimulus, declared, fireTimer,
        singletonTimerWaitingState, initialState, noSequentialMultiInstance,
        noParallelMultiInstance, processMismatch]
  · rcases remainingMismatch with elementMismatch | remainingMismatch
    · apply applyStimulus_rejected_of_admission
      cases declared : program.compensationEventSubProcessSnapshots <;>
        simp [timerIdNamesWait, admitStimulus, declared, fireTimer,
          singletonTimerWaitingState, initialState, noSequentialMultiInstance,
          noParallelMultiInstance, elementMismatch]
    · rcases remainingMismatch with activationMismatch | timeMismatch
      · apply applyStimulus_rejected_of_admission
        cases declared : program.compensationEventSubProcessSnapshots <;>
          simp [timerIdNamesWait, admitStimulus, declared, fireTimer,
            singletonTimerWaitingState, initialState, noSequentialMultiInstance,
            noParallelMultiInstance, activationMismatch]
      · by_cases processMatches :
          wait.processInstanceId = submittedTimerId.processInstanceId
        · by_cases elementMatches :
            wait.elementId.value = submittedTimerId.elementId.value
          · by_cases activationMatches :
              wait.activation = submittedTimerId.activation
            · -- The bounded-scope deadline arm is unreachable here structurally rather than by
              -- timing: this state holds one root occurrence, so no child region exists to cancel.
              -- Splitting on the definition lookup lets both arms reduce, since each yields `none`.
              -- `activityOccurrenceForTimerWait?` is in the simp set because the bounded-scope arm
              -- now reaches its child through the ownership record: on a state holding no record the
              -- lookup answers `none`, which is what makes the arm reduce away here.
              apply applyStimulus_rejected_of_admission
              cases declared : program.compensationEventSubProcessSnapshots <;>
                cases definitionFound : boundedScopeDefinitionFor? program wait <;>
                simp [timerIdNamesWait, admitStimulus, declared, fireTimer,
                  activityOccurrenceForTimerWait?, empty_activities_refuse_monitored_task_timer,
                  empty_activities_refuse_monitored_scope,
                  singletonTimerWaitingState, initialState,
                  processMatches, elementMatches,
                  activationMatches, timeMismatch, definitionFound,
                  noSequentialMultiInstance, noParallelMultiInstance,
                  interruptBoundedScope?, boundedScopeDeadlineWait?,
                  boundedScopeChildFor?]
            · apply applyStimulus_rejected_of_admission
              cases declared : program.compensationEventSubProcessSnapshots <;>
                simp [timerIdNamesWait, admitStimulus, declared, fireTimer,
                  singletonTimerWaitingState, initialState, noSequentialMultiInstance,
                  noParallelMultiInstance, Ne.symm activationMatches]
          · apply applyStimulus_rejected_of_admission
            cases declared : program.compensationEventSubProcessSnapshots <;>
              simp [timerIdNamesWait, admitStimulus, declared, fireTimer,
                singletonTimerWaitingState, initialState, noSequentialMultiInstance,
                noParallelMultiInstance, Ne.symm elementMatches]
        · apply applyStimulus_rejected_of_admission
          cases declared : program.compensationEventSubProcessSnapshots <;>
            simp [timerIdNamesWait, admitStimulus, declared, fireTimer,
              singletonTimerWaitingState, initialState, noSequentialMultiInstance,
              noParallelMultiInstance, Ne.symm processMatches]

/-- Any mismatch in the full effect-occurrence identity rejects completion with exact state preservation. -/
theorem effect_identity_mismatch_is_rejected
    (program : Program) (wait : EffectWait)
    (completionCommandId : SemanticId)
    (submittedEffectId : EffectOccurrenceId)
    (result : EffectExecutionResult) (logicalTimeMs : Nat)
    (mismatch :
      submittedEffectId.processInstanceId ≠ wait.processInstanceId ∨
      submittedEffectId.elementId.value ≠ wait.elementId.value ∨
      submittedEffectId.activation ≠ wait.activation) :
    applyStimulus scenarioClosureLimit program
        (singletonEffectWaitingState wait logicalTimeMs)
        (.completeEffect completionCommandId submittedEffectId result) =
      { outcome := .rejected
        state := singletonEffectWaitingState wait logicalTimeMs
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  by_cases selected : ParallelScopeStart.programSelected program = true
  · have refused := empty_process_refuses_parallel_scope_effect program
      (singletonEffectWaitingState wait logicalTimeMs) completionCommandId submittedEffectId result rfl selected
    apply applyStimulus_rejected_of_admission
    cases declared : program.compensationEventSubProcessSnapshots <;> simp [admitStimulus, declared, refused]
  have unselected : ParallelScopeStart.programSelected program = false := by
    cases selection : ParallelScopeStart.programSelected program <;> simp_all
  rcases mismatch with processMismatch | remainingMismatch
  · have noOccurrence :
        effectIdNamesWait submittedEffectId wait = false := by
      simp [effectIdNamesWait, processMismatch]
    apply applyStimulus_rejected_of_admission
    cases declared : program.compensationEventSubProcessSnapshots <;>
      simp [admitStimulus, declared, initialState, ParallelScopeCommand.stimulusAdmitted, unselected,
        singletonEffectWaitingState, noOccurrence]
  · rcases remainingMismatch with elementMismatch | activationMismatch
    · have noOccurrence :
          effectIdNamesWait submittedEffectId wait = false := by
        simp [effectIdNamesWait, elementMismatch]
      apply applyStimulus_rejected_of_admission
      cases declared : program.compensationEventSubProcessSnapshots <;>
        simp [admitStimulus, declared, initialState, ParallelScopeCommand.stimulusAdmitted, unselected,
          singletonEffectWaitingState, noOccurrence]
    · have noOccurrence :
          effectIdNamesWait submittedEffectId wait = false := by
        simp [effectIdNamesWait, activationMismatch]
      apply applyStimulus_rejected_of_admission
      cases declared : program.compensationEventSubProcessSnapshots <;>
        simp [admitStimulus, declared, initialState, ParallelScopeCommand.stimulusAdmitted, unselected,
          singletonEffectWaitingState, noOccurrence]

end BpmnSemantics.SemanticProcess
