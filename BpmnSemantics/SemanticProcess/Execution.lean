import BpmnSemantics.SemanticProcess.Transition

/-! # Semantic Process external execution

This module owns external command admission, explicit operation choice, bounded internal closure, the pure `applyStimulus` boundary, and reusable full-occurrence-identity refusal laws. It does not own scenario projection or capsule fixtures.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def perIncomingJoinReady (state : RuntimeState)
    (inputs : List ControlPlaceId) : Bool :=
  inputs.all (hasToken state)

def countBasedJoinReady (state : RuntimeState)
    (inputs : List ControlPlaceId) : Bool :=
  inputs.foldl (fun count input => count + tokenMultiplicity state input) 0 ≥
    inputs.length

def waitMultiplicity (state : RuntimeState) (taskId : TaskDefinitionId) : Nat :=
  (state.waits.filter fun wait => decide (wait.task.id = taskId)).length

def completeUserTask (state : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) : Option RuntimeState :=
  match state.waits.find? fun wait =>
      decide (
        wait.processInstanceId = processInstanceId &&
          wait.task.id = taskId &&
          wait.activation = activation) with
  | none => none
  | some wait =>
      some
        { state with
          waits := state.waits.erase wait
          tokens := wait.output :: state.tokens }

def fireTimer (state : RuntimeState) (timerId : TimerOccurrenceId)
    (logicalTimeMs : Nat) : Option RuntimeState :=
  match state.timerWaits.find? fun wait =>
      decide (
        wait.processInstanceId = timerId.processInstanceId &&
          wait.elementId.value = timerId.elementId.value &&
          wait.activation = timerId.activation) with
  | none => none
  | some wait =>
      if logicalTimeMs = wait.deadlineMs then
        some
          { state with
            timerWaits := state.timerWaits.erase wait
            tokens := wait.output :: state.tokens
            logicalTimeMs := wait.deadlineMs }
      else
        none

def effectOccurrenceMatches (effectId : EffectOccurrenceId)
    (wait : EffectWait) : Bool :=
  decide (
    wait.processInstanceId = effectId.processInstanceId &&
      wait.elementId.value = effectId.elementId.value &&
      wait.activation = effectId.activation)

/-- Declarative account of one successful effect-result transition. It exposes occurrence matching and mapping validation as separate premises rather than defining validity through the executable transition. -/
inductive EffectCompletionStep :
    RuntimeState → EffectOccurrenceId → EffectExecutionResult →
      RuntimeState → Prop where
  | commit
      (state : RuntimeState)
      (effectId : EffectOccurrenceId)
      (result : EffectExecutionResult)
      (wait : EffectWait)
      (processVariables : List VariableBinding)
      (occurrence :
        state.effectWaits.find? (effectOccurrenceMatches effectId) = some wait)
      (mapping :
        applyEffectResult wait.arguments wait.outputMappings
          state.processVariables result = some processVariables) :
      EffectCompletionStep state effectId result
        { state with
          effectWaits := state.effectWaits.erase wait
          processVariables
          tokens := wait.output :: state.tokens }

def completeEffect (state : RuntimeState) (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult) : Option RuntimeState :=
  match state.effectWaits.find? (effectOccurrenceMatches effectId) with
  | none => none
  | some wait =>
      match applyEffectResult wait.arguments wait.outputMappings
          state.processVariables result with
      | none => none
      | some processVariables =>
          some
            { state with
              effectWaits := state.effectWaits.erase wait
              processVariables
              tokens := wait.output :: state.tokens }

/-- Every successful executable effect completion is permitted by the separately stated effect-result relation. -/
theorem completeEffect_sound
    (state successor : RuntimeState)
    (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult)
    (success : completeEffect state effectId result = some successor) :
    EffectCompletionStep state effectId result successor := by
  unfold completeEffect at success
  split at success
  · contradiction
  · rename_i wait occurrence
    split at success
    · contradiction
    · rename_i processVariables mapping
      cases success
      exact .commit state effectId result wait processVariables
        occurrence mapping

def runChoices (program : Program) : RuntimeState → List OperationId →
    Option RuntimeState
  | state, [] => some state
  | state, choice :: choices =>
      match step program state choice with
      | none => none
      | some successor => runChoices program successor choices

def projectTokenMultiplicities (program : Program) (state : RuntimeState) :
    List (ControlPlaceId × Nat) :=
  program.controlPlaces.map fun place =>
    (place.id, tokenMultiplicity state place.id)

private structure ExternalAdmission where
  outcome : CommandOutcome
  state : RuntimeState

private def admitStimulus (program : Program) (state : RuntimeState) :
    Stimulus → ExternalAdmission
  | .startProcess _ processId instanceId =>
      match state.control with
      | .notStarted =>
          if program.processId.value = processId.value then
            { outcome := .committed
              state := runningStartState instanceId }
          else
            { outcome := .rejected, state }
      | .running _
      | .completed _ => { outcome := .rejected, state }
  | .completeUserTaskInstance _ taskId =>
      match state.control with
      | .running instanceId =>
          match completeUserTask state taskId.processInstanceId
              ⟨taskId.elementId.value⟩ taskId.activation with
          | some successor =>
              if taskId.processInstanceId = instanceId then
                { outcome := .committed, state := successor }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _ => { outcome := .rejected, state }
  | .fireTimer _ timerId logicalTimeMs =>
      match state.control with
      | .running instanceId =>
          match fireTimer state timerId logicalTimeMs with
          | some successor =>
              if timerId.processInstanceId = instanceId then
                { outcome := .committed, state := successor }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _ => { outcome := .rejected, state }
  | .completeEffect _ effectId result =>
      match state.control with
      | .running instanceId =>
          match completeEffect state effectId result with
          | some successor =>
              if effectId.processInstanceId = instanceId then
                { outcome := .committed, state := successor }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _ => { outcome := .rejected, state }

private def enabledTransitions (program : Program) (state : RuntimeState) :
    List (SemanticOperation × RuntimeState) :=
  program.operations.filterMap fun operation =>
    match fire? operation state with
    | none => none
    | some successor => some (operation, successor)

private def independentParallelTaskChoices :
    List (SemanticOperation × RuntimeState) → Bool
  | [ (.awaitUserTask _ _ inputA outputA taskA, _)
    , (.awaitUserTask _ _ inputB outputB taskB, _) ] =>
      decide (
        inputA ≠ inputB ∧
          outputA ≠ outputB ∧
          taskA.id ≠ taskB.id)
  | _ => false

private structure ClosureResult where
  state : RuntimeState
  hitBound : Bool
  ambiguousChoice : Bool

/-- Close one enabled operation, or the admitted two-task activation pair whose distinct inputs, outputs, and task identities make its public stable result order-independent. Every other multiple-enabled state still requires an explicit semantic choice. -/
private def closeSupported : Nat → Program → RuntimeState → ClosureResult
  | 0, program, state =>
      match enabledTransitions program state with
      | [] => { state, hitBound := false, ambiguousChoice := false }
      | [_]
      | _ :: _ :: _ =>
          { state, hitBound := true, ambiguousChoice := false }
  | fuel + 1, program, state =>
      match enabledTransitions program state with
      | [] => { state, hitBound := false, ambiguousChoice := false }
      | [(_, successor)] => closeSupported fuel program successor
      | first :: second :: remaining =>
          let transitions := first :: second :: remaining
          if independentParallelTaskChoices transitions then
            closeSupported fuel program first.2
          else
            { state, hitBound := false, ambiguousChoice := true }

structure StimulusResult where
  outcome : CommandOutcome
  state : RuntimeState
  internalStepBoundExceeded : Bool
  ambiguousInternalChoice : Bool
  deriving Repr, DecidableEq

def scenarioClosureLimit : Nat := 8

def applyStimulus (closureLimit : Nat) (program : Program)
    (state : RuntimeState) (stimulus : Stimulus) : StimulusResult :=
  let admission := admitStimulus program state stimulus
  match admission.outcome with
  | .committed =>
      let closure := closeSupported closureLimit program admission.state
      { outcome := .committed
        state := closure.state
        internalStepBoundExceeded := closure.hitBound
        ambiguousInternalChoice := closure.ambiguousChoice }
  | .rolledBack =>
      { outcome := .rolledBack
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }
  | .rejected =>
      { outcome := .rejected
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }
  | .semanticFailure =>
      { outcome := .semanticFailure
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }
  | .unsupported =>
      { outcome := .unsupported
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }


def singletonWaitingState (wait : UserTaskWait) (logicalTimeMs : Nat := 0) :
    RuntimeState :=
  { initialState with
    control := .running wait.processInstanceId
    waits := [wait]
    activations := [{ taskId := wait.task.id, count := wait.activation }]
    logicalTimeMs }

/-- Isolated state used to state timer-refusal laws over the complete public timer occurrence identity and logical-time input. -/
def singletonTimerWaitingState (wait : TimerWait) (logicalTimeMs : Nat := 0) :
    RuntimeState :=
  { initialState with
    control := .running wait.processInstanceId
    timerWaits := [wait]
    timerActivations :=
      [{ elementId := wait.elementId, count := wait.activation }]
    logicalTimeMs }

/-- Isolated state used to state effect-result refusal over the complete public occurrence identity. -/
def singletonEffectWaitingState (wait : EffectWait)
    (logicalTimeMs : Nat := 0) : RuntimeState :=
  { initialState with
    control := .running wait.processInstanceId
    effectWaits := [wait]
    effectActivations :=
      [{ elementId := wait.elementId, count := wait.activation }]
    logicalTimeMs }

/-- A matching effect result whose patch cannot satisfy the committed mapping contract is rejected with exact state preservation. -/
theorem effect_result_mapping_failure_is_rejected
    (program : Program) (wait : EffectWait)
    (completionCommandId : SemanticId)
    (result : EffectExecutionResult) (logicalTimeMs : Nat)
    (invalid :
      applyEffectResult wait.arguments wait.outputMappings
        initialState.processVariables result = none) :
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
  simp [applyStimulus, admitStimulus, completeEffect,
    singletonEffectWaitingState, effectOccurrenceMatches, invalid]

/-- Any mismatch in the full semantic task-occurrence identity rejects completion with exact state preservation. -/
-- tag::task-identity-law[]
theorem task_identity_mismatch_is_rejected
    (program : Program) (wait : UserTaskWait)
    (completionCommandId : SemanticId)
    (submittedTaskId : UserTaskInstanceId) (logicalTimeMs : Nat)
    (mismatch :
      submittedTaskId.processInstanceId ≠ wait.processInstanceId ∨
      submittedTaskId.elementId.value ≠ wait.task.id.value ∨
      submittedTaskId.activation ≠ wait.activation) :
    applyStimulus scenarioClosureLimit program
        (singletonWaitingState wait logicalTimeMs)
        (.completeUserTaskInstance completionCommandId submittedTaskId) =
      { outcome := .rejected
        state := singletonWaitingState wait logicalTimeMs
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  rcases mismatch with processMismatch | remainingMismatch
  · have noMatch : ¬ (
        (wait.processInstanceId = submittedTaskId.processInstanceId ∧
          wait.task.id = ⟨submittedTaskId.elementId.value⟩) ∧
        wait.activation = submittedTaskId.activation) := by
      intro exactMatch
      exact processMismatch exactMatch.1.1.symm
    simp [applyStimulus, admitStimulus, completeUserTask,
      singletonWaitingState, noMatch]
  · rcases remainingMismatch with elementMismatch | activationMismatch
    · have noMatch : ¬ (
          (wait.processInstanceId = submittedTaskId.processInstanceId ∧
            wait.task.id = ⟨submittedTaskId.elementId.value⟩) ∧
          wait.activation = submittedTaskId.activation) := by
        intro exactMatch
        exact elementMismatch
          (congrArg TaskDefinitionId.value exactMatch.1.2).symm
      simp [applyStimulus, admitStimulus, completeUserTask,
        singletonWaitingState, noMatch]
    · have noMatch : ¬ (
          (wait.processInstanceId = submittedTaskId.processInstanceId ∧
            wait.task.id = ⟨submittedTaskId.elementId.value⟩) ∧
          wait.activation = submittedTaskId.activation) := by
        intro exactMatch
        exact activationMismatch exactMatch.2.symm
      simp [applyStimulus, admitStimulus, completeUserTask,
        singletonWaitingState, noMatch]
-- end::task-identity-law[]

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
    simp [applyStimulus, admitStimulus, fireTimer,
      singletonTimerWaitingState, noMatch]
  · rcases remainingMismatch with elementMismatch | remainingMismatch
    · have noMatch : ¬ (
          (wait.processInstanceId = submittedTimerId.processInstanceId ∧
            wait.elementId.value = submittedTimerId.elementId.value) ∧
          wait.activation = submittedTimerId.activation) := by
        intro exactMatch
        exact elementMismatch exactMatch.1.2.symm
      simp [applyStimulus, admitStimulus, fireTimer,
        singletonTimerWaitingState, noMatch]
    · rcases remainingMismatch with activationMismatch | timeMismatch
      · have noMatch : ¬ (
            (wait.processInstanceId = submittedTimerId.processInstanceId ∧
              wait.elementId.value = submittedTimerId.elementId.value) ∧
            wait.activation = submittedTimerId.activation) := by
          intro exactMatch
          exact activationMismatch exactMatch.2.symm
        simp [applyStimulus, admitStimulus, fireTimer,
          singletonTimerWaitingState, noMatch]
      · by_cases processMatches :
          wait.processInstanceId = submittedTimerId.processInstanceId
        · by_cases elementMatches :
            wait.elementId.value = submittedTimerId.elementId.value
          · by_cases activationMatches :
              wait.activation = submittedTimerId.activation
            · simp [applyStimulus, admitStimulus, fireTimer,
                singletonTimerWaitingState, processMatches, elementMatches,
                activationMatches, timeMismatch]
            · have noMatch : ¬ (
                  (wait.processInstanceId =
                      submittedTimerId.processInstanceId ∧
                    wait.elementId.value =
                      submittedTimerId.elementId.value) ∧
                  wait.activation = submittedTimerId.activation) := by
                intro exactMatch
                exact activationMatches exactMatch.2
              simp [applyStimulus, admitStimulus, fireTimer,
                singletonTimerWaitingState, noMatch]
          · have noMatch : ¬ (
                (wait.processInstanceId =
                    submittedTimerId.processInstanceId ∧
                  wait.elementId.value =
                    submittedTimerId.elementId.value) ∧
                wait.activation = submittedTimerId.activation) := by
              intro exactMatch
              exact elementMatches exactMatch.1.2
            simp [applyStimulus, admitStimulus, fireTimer,
              singletonTimerWaitingState, noMatch]
        · have noMatch : ¬ (
              (wait.processInstanceId =
                  submittedTimerId.processInstanceId ∧
                wait.elementId.value =
                  submittedTimerId.elementId.value) ∧
              wait.activation = submittedTimerId.activation) := by
            intro exactMatch
            exact processMatches exactMatch.1.1
          simp [applyStimulus, admitStimulus, fireTimer,
            singletonTimerWaitingState, noMatch]

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
    simp [applyStimulus, admitStimulus, completeEffect,
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
      simp [applyStimulus, admitStimulus, completeEffect,
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
      simp [applyStimulus, admitStimulus, completeEffect,
        singletonEffectWaitingState, noOccurrence]

end BpmnSemantics.SemanticProcess
