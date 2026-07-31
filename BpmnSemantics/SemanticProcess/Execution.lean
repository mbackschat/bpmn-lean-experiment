import BpmnSemantics.SemanticProcess.Message

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

def effectResultOutput (wait : EffectWait) :
    EffectExecutionResult → Option ControlPlaceId
  | .success _ => some wait.output
  | .bpmnError code _ _ =>
      match wait.bpmnErrorRoute with
      | some route => if route.code = code then some route.output else none
      | none => none

/-- Declarative account of one successful effect-result transition. It exposes occurrence matching and mapping validation as separate premises rather than defining validity through the executable transition. -/
inductive EffectCompletionStep :
    RuntimeState → EffectOccurrenceId → EffectExecutionResult →
      RuntimeState → Prop where
  | commit
      (state : RuntimeState)
      (effectId : EffectOccurrenceId)
      (result : EffectExecutionResult)
      (wait : EffectWait)
      (variables : ScopedVariables)
      (output : ControlPlaceId)
      (occurrence :
        state.effectWaits.find? (effectOccurrenceMatches effectId) = some wait)
      (mapping :
        completeActivityVariableScope state.variables effectId
          wait.outputMappings result = some variables)
      (route : effectResultOutput wait result = some output) :
      EffectCompletionStep state effectId result
        { state with
          effectWaits := state.effectWaits.erase wait
          variables
          tokens := output :: state.tokens }

def completeEffect (state : RuntimeState) (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult) : Option RuntimeState :=
  match state.effectWaits.find? (effectOccurrenceMatches effectId) with
  | none => none
  | some wait =>
      match completeActivityVariableScope state.variables effectId
          wait.outputMappings result with
      | none => none
      | some variables =>
          match effectResultOutput wait result with
          | none => none
          | some output =>
              some
                { state with
                  effectWaits := state.effectWaits.erase wait
                  variables
                  tokens := output :: state.tokens }

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
    · rename_i variables mapping
      split at success
      · contradiction
      · rename_i output route
        cases success
        exact .commit state effectId result wait variables output
          occurrence mapping route

def runChoices (program : Program) : RuntimeState → List OperationId →
    Option RuntimeState
  | state, [] => some state
  | state, choice :: choices =>
      match step program state choice with
      | none => none
      | some successor => runChoices program successor choices

private structure ExternalAdmission where
  outcome : CommandOutcome
  state : RuntimeState

private def admitStimulus (program : Program) (state : RuntimeState) :
    Stimulus → ExternalAdmission
  | .startProcess _ processId instanceId initialVariables =>
      match state.control with
      | .notStarted =>
          if program.processId.value = processId.value then
            { outcome := .committed
              state := runningStartState instanceId initialVariables }
          else
            { outcome := .rejected, state }
      | .running _
      | .completed _ => { outcome := .rejected, state }
  | .completeUserTaskInstance _ taskId submittedValues =>
      match state.control with
      | .running instanceId =>
          match completeUserTask state taskId.processInstanceId
              ⟨taskId.elementId.value⟩ taskId.activation with
          | some successor =>
              if taskId.processInstanceId = instanceId then
                { outcome := .committed
                  state :=
                    { successor with
                      variables :=
                        { successor.variables with
                          process :=
                            { bindings := mergeProcessVariableBindings
                                successor.variables.process.bindings
                                submittedValues } } } }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _ => { outcome := .rejected, state }
  | .deliverMessage _ subscriptionId channel =>
      match state.control with
      | .running instanceId =>
          match deliverMessage program state subscriptionId channel with
          | some successor =>
              if subscriptionId.processInstanceId = instanceId then
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

/-- Number of enabled internal operations, exposed for targeted admission-preservation checks. -/
def enabledInternalOperationCount (program : Program)
    (state : RuntimeState) : Nat :=
  (enabledTransitions program state).length

/-- A state already known to be internally stable is resumable exactly when it is complete or exposes a semantic wait. -/
def stableStateResumable (state : RuntimeState) : Bool :=
  match state.control with
  | .notStarted => false
  | .running _ =>
      !state.waits.isEmpty ||
        !state.messageWaits.isEmpty ||
        !state.timerWaits.isEmpty ||
        !state.effectWaits.isEmpty
  | .completed _ => true

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


def singletonWaitingState (wait : UserTaskWait) (logicalTimeMs : Nat := 0)
    (variables : ScopedVariables := emptyScopedVariables) :
    RuntimeState :=
  { initialState with
    control := .running wait.processInstanceId
    waits := [wait]
    activations := [{ taskId := wait.task.id, count := wait.activation }]
    variables
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
  let owner : EffectOccurrenceId :=
    { processInstanceId := wait.processInstanceId
      elementId := ⟨wait.elementId.value⟩
      activation := wait.activation }
  { initialState with
    control := .running wait.processInstanceId
    effectWaits := [wait]
    variables :=
      addActivityVariableScope initialState.variables owner wait.arguments
    effectActivations :=
      [{ elementId := wait.elementId, count := wait.activation }]
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
    unfold admitStimulus
    dsimp [state, singletonEffectWaitingState] at noCompletion ⊢
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
    unfold admitStimulus
    dsimp [state, singletonEffectWaitingState] at noCompletion ⊢
    rw [noCompletion]
  simp [applyStimulus, rejectedAdmission]

/-- Any mismatch in the full semantic task-occurrence identity rejects completion with exact state preservation. -/
-- tag::task-identity-law[]
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
