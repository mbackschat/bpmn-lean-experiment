import BpmnSemantics.SemanticProcess.TransitionTrace

/-! # Semantic Process external execution

This module owns explicit operation choice, bounded internal closure, the pure `applyStimulus` boundary, and reusable full-occurrence-identity refusal laws. External command admission is owned by `CommandAdmission`; wait completion, scenario projection, and capsule fixtures remain separate.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def runChoices (program : Program) : RuntimeState → List OperationId →
    Option RuntimeState
  | state, [] => some state
  | state, choice :: choices =>
      match step program state choice with
      | none => none
      | some successor => runChoices program successor choices

def singletonWaitingState (wait : UserTaskWait) (logicalTimeMs : Nat := 0)
    (variables : ScopedVariables := emptyScopedVariables) :
    RuntimeState :=
  { initialState with
    control := .running wait.processInstanceId
    scopeOccurrences := [{ id := wait.owner, parent := none }]
    waits := [wait]
    activations := [{ taskId := wait.task.id, count := wait.activation }]
    scopeActivations :=
      [{ scopeId := wait.owner.definitionScopeId, count := wait.owner.activation }]
    variables
    logicalTimeMs }

/-- Isolated state used to state timer-refusal laws over the complete public timer occurrence identity and logical-time input. -/
def singletonTimerWaitingState (wait : TimerWait) (logicalTimeMs : Nat := 0) :
    RuntimeState :=
  { initialState with
    control := .running wait.processInstanceId
    scopeOccurrences := [{ id := wait.owner, parent := none }]
    timerWaits := [wait]
    timerActivations :=
      [{ elementId := wait.elementId, count := wait.activation }]
    scopeActivations :=
      [{ scopeId := wait.owner.definitionScopeId, count := wait.owner.activation }]
    logicalTimeMs }

/-- Isolated state used to state effect-result refusal over the complete public occurrence identity. -/
def singletonEffectWaitingState (wait : EffectWait)
    (logicalTimeMs : Nat := 0) : RuntimeState :=
  let owner : EffectOccurrenceId :=
    { processInstanceId := wait.processInstanceId
      elementId := ⟨wait.elementId.value⟩
      activation := wait.activation }
  { initialState with
    control := .running wait.processInstanceId
    scopeOccurrences := [{ id := wait.owner, parent := none }]
    effectWaits := [wait]
    variables :=
      addActivityVariableScope initialState.variables owner wait.arguments
    effectActivations :=
      [{ elementId := wait.elementId, count := wait.activation }]
    scopeActivations :=
      [{ scopeId := wait.owner.definitionScopeId, count := wait.owner.activation }]
    logicalTimeMs }

/-- A matching effect result whose patch cannot satisfy the committed mapping contract is rejected with exact state preservation. -/
theorem effect_result_mapping_failure_is_rejected
    (program : Program) (wait : EffectWait)
    (completionCommandId : SemanticId)
    (result : EffectExecutionResult) (logicalTimeMs : Nat)
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
        state.effectWaits.find? (effectOccurrenceMatches effectId) =
          some wait := by
      simp [state, singletonEffectWaitingState, effectId,
        effectOccurrenceMatches]
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
    unfold admitStimulus dispatchStimulus
    dsimp [state, singletonEffectWaitingState, initialState] at noCompletion ⊢
    rw [noCompletion]
  simp [applyStimulus, rejectedAdmission]

/-- A matching effect occurrence whose typed result has no committed route is rejected with exact state preservation. -/
theorem effect_result_route_failure_is_rejected
    (program : Program) (wait : EffectWait)
    (completionCommandId : SemanticId)
    (result : EffectExecutionResult) (logicalTimeMs : Nat)
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
      effectId, effectOccurrenceMatches, invalid]
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
    unfold admitStimulus dispatchStimulus
    dsimp [state, singletonEffectWaitingState, initialState] at noCompletion ⊢
    rw [noCompletion]
  simp [applyStimulus, rejectedAdmission]

/-- Matching ordinary User Task completions are equal when admission and the semantic successor agree. -/
theorem user_task_completion_with_same_successor_is_equal
    (closureLimit : Nat) (program : Program)
    (leftState rightState successor : RuntimeState)
    (completionCommandId : SemanticId)
    (submittedTaskId : UserTaskInstanceId)
    (submittedValues : List VariableBinding)
    (leftRunning : leftState.control = .running submittedTaskId.processInstanceId)
    (rightRunning : rightState.control = .running submittedTaskId.processInstanceId)
    (ordinaryTask :
      isBoundedTaskDefinition program ⟨submittedTaskId.elementId.value⟩ = false ∧
        isMonitoredTaskDefinition program ⟨submittedTaskId.elementId.value⟩ = false)
    (ordinaryProgram : isCallActivityProgram program = false)
    (leftNoIncidents : leftState.effectIncidents = [])
    (rightNoIncidents : rightState.effectIncidents = [])
    (valuesAdmitted : processDataBindingsAdmitted program.identity.semanticProfile
      .userTaskCompletion submittedValues = true)
    (leftCompletion : completeUserTask leftState submittedTaskId.processInstanceId
      ⟨submittedTaskId.elementId.value⟩ submittedTaskId.activation = some successor)
    (rightCompletion : completeUserTask rightState submittedTaskId.processInstanceId
      ⟨submittedTaskId.elementId.value⟩ submittedTaskId.activation = some successor) :
    applyStimulus closureLimit program leftState
        (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues) =
      applyStimulus closureLimit program rightState
        (.completeUserTaskInstance completionCommandId submittedTaskId submittedValues) := by
  simp [applyStimulus, admitStimulus, dispatchStimulus, leftNoIncidents,
    rightNoIncidents, leftRunning, rightRunning,
    ordinaryTask.1, ordinaryTask.2, ordinaryProgram, valuesAdmitted,
    leftCompletion, rightCompletion]

/-- Any mismatch in the full semantic task-occurrence identity rejects completion with exact state preservation. -/
theorem task_identity_mismatch_is_rejected
    (program : Program) (wait : UserTaskWait)
    (completionCommandId : SemanticId)
    (submittedTaskId : UserTaskInstanceId)
    (submittedValues : List VariableBinding)
    (logicalTimeMs : Nat)
    (variables : ScopedVariables)
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
  rcases mismatch with processMismatch | remainingMismatch
  · have noMatch : ¬ (
        (wait.processInstanceId = submittedTaskId.processInstanceId ∧
          wait.task.id = ⟨submittedTaskId.elementId.value⟩) ∧
        wait.activation = submittedTaskId.activation) := by
      intro exactMatch
      exact processMismatch exactMatch.1.1.symm
    simp [applyStimulus, admitStimulus, dispatchStimulus, completeUserTask, initialState,
      completeBoundedUserTask?, completeMonitoredUserTask?,
      singletonWaitingState, noMatch]
  · rcases remainingMismatch with elementMismatch | activationMismatch
    · have noMatch : ¬ (
          (wait.processInstanceId = submittedTaskId.processInstanceId ∧
            wait.task.id = ⟨submittedTaskId.elementId.value⟩) ∧
          wait.activation = submittedTaskId.activation) := by
        intro exactMatch
        exact elementMismatch
          (congrArg TaskDefinitionId.value exactMatch.1.2).symm
      simp [applyStimulus, admitStimulus, dispatchStimulus, completeUserTask, initialState,
        completeBoundedUserTask?, completeMonitoredUserTask?,
      singletonWaitingState, noMatch]
    · have noMatch : ¬ (
          (wait.processInstanceId = submittedTaskId.processInstanceId ∧
            wait.task.id = ⟨submittedTaskId.elementId.value⟩) ∧
          wait.activation = submittedTaskId.activation) := by
        intro exactMatch
        exact activationMismatch exactMatch.2.symm
      simp [applyStimulus, admitStimulus, dispatchStimulus, completeUserTask, initialState,
        completeBoundedUserTask?, completeMonitoredUserTask?,
      singletonWaitingState, noMatch]

/-- Any mismatch in the full timer-occurrence identity or exact logical deadline rejects firing with exact state preservation. This one law covers both early and late firing. -/
theorem timer_identity_or_time_mismatch_is_rejected
    (program : Program) (wait : TimerWait)
    (fireCommandId : SemanticId)
    (submittedTimerId : TimerOccurrenceId) (submittedLogicalTimeMs : Nat)
    (currentLogicalTimeMs : Nat)
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
  · have noMatch : ¬ (
        (wait.processInstanceId = submittedTimerId.processInstanceId ∧
          wait.elementId.value = submittedTimerId.elementId.value) ∧
        wait.activation = submittedTimerId.activation) := by
      intro exactMatch
      exact processMismatch exactMatch.1.1.symm
    simp [applyStimulus, admitStimulus, dispatchStimulus, fireTimer,
      singletonTimerWaitingState, initialState, noMatch]
  · rcases remainingMismatch with elementMismatch | remainingMismatch
    · have noMatch : ¬ (
          (wait.processInstanceId = submittedTimerId.processInstanceId ∧
            wait.elementId.value = submittedTimerId.elementId.value) ∧
          wait.activation = submittedTimerId.activation) := by
        intro exactMatch
        exact elementMismatch exactMatch.1.2.symm
      simp [applyStimulus, admitStimulus, dispatchStimulus, fireTimer,
        singletonTimerWaitingState, initialState, noMatch]
    · rcases remainingMismatch with activationMismatch | timeMismatch
      · have noMatch : ¬ (
            (wait.processInstanceId = submittedTimerId.processInstanceId ∧
              wait.elementId.value = submittedTimerId.elementId.value) ∧
            wait.activation = submittedTimerId.activation) := by
          intro exactMatch
          exact activationMismatch exactMatch.2.symm
        simp [applyStimulus, admitStimulus, dispatchStimulus, fireTimer,
          singletonTimerWaitingState, initialState, noMatch]
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
              cases definitionFound : boundedScopeDefinitionFor? program wait <;>
                simp [applyStimulus, admitStimulus, dispatchStimulus, fireTimer,
                  activityOccurrenceForTimerWait?, boundedScopeChildFor?,
                  singletonTimerWaitingState, initialState,
                  processMatches, elementMatches,
                  activationMatches, timeMismatch, definitionFound,
                  interruptBoundedScope?, boundedScopeDeadlineWait?,
                  boundedScopeChildFor?]
            · have noMatch : ¬ (
                  (wait.processInstanceId =
                      submittedTimerId.processInstanceId ∧
                    wait.elementId.value =
                      submittedTimerId.elementId.value) ∧
                  wait.activation = submittedTimerId.activation) := by
                intro exactMatch
                exact activationMatches exactMatch.2
              simp [applyStimulus, admitStimulus, dispatchStimulus, fireTimer,
                singletonTimerWaitingState, initialState, noMatch]
          · have noMatch : ¬ (
                (wait.processInstanceId =
                    submittedTimerId.processInstanceId ∧
                  wait.elementId.value =
                    submittedTimerId.elementId.value) ∧
                wait.activation = submittedTimerId.activation) := by
              intro exactMatch
              exact elementMatches exactMatch.1.2
            simp [applyStimulus, admitStimulus, dispatchStimulus, fireTimer,
              singletonTimerWaitingState, initialState, noMatch]
        · have noMatch : ¬ (
              (wait.processInstanceId =
                  submittedTimerId.processInstanceId ∧
                wait.elementId.value =
                  submittedTimerId.elementId.value) ∧
              wait.activation = submittedTimerId.activation) := by
            intro exactMatch
            exact processMatches exactMatch.1.1
          simp [applyStimulus, admitStimulus, dispatchStimulus, fireTimer,
            singletonTimerWaitingState, initialState, noMatch]

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
  rcases mismatch with processMismatch | remainingMismatch
  · have noMatch : ¬ (
        (wait.processInstanceId = submittedEffectId.processInstanceId ∧
          wait.elementId.value = submittedEffectId.elementId.value) ∧
        wait.activation = submittedEffectId.activation) := by
      intro exactMatch
      exact processMismatch exactMatch.1.1.symm
    have noOccurrence :
        effectOccurrenceMatches submittedEffectId wait = false := by
      simp [effectOccurrenceMatches, noMatch]
    simp [applyStimulus, admitStimulus, dispatchStimulus, completeEffect, initialState,
      singletonEffectWaitingState, noOccurrence]
  · rcases remainingMismatch with elementMismatch | activationMismatch
    · have noMatch : ¬ (
          (wait.processInstanceId = submittedEffectId.processInstanceId ∧
            wait.elementId.value = submittedEffectId.elementId.value) ∧
          wait.activation = submittedEffectId.activation) := by
        intro exactMatch
        exact elementMismatch exactMatch.1.2.symm
      have noOccurrence :
          effectOccurrenceMatches submittedEffectId wait = false := by
        simp [effectOccurrenceMatches, noMatch]
      simp [applyStimulus, admitStimulus, dispatchStimulus, completeEffect, initialState,
        singletonEffectWaitingState, noOccurrence]
    · have noMatch : ¬ (
          (wait.processInstanceId = submittedEffectId.processInstanceId ∧
            wait.elementId.value = submittedEffectId.elementId.value) ∧
          wait.activation = submittedEffectId.activation) := by
        intro exactMatch
        exact activationMismatch exactMatch.2.symm
      have noOccurrence :
          effectOccurrenceMatches submittedEffectId wait = false := by
        simp [effectOccurrenceMatches, noMatch]
      simp [applyStimulus, admitStimulus, dispatchStimulus, completeEffect, initialState,
        singletonEffectWaitingState, noOccurrence]

end BpmnSemantics.SemanticProcess
