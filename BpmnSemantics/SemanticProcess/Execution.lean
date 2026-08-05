import BpmnSemantics.SemanticProcess.WaitCompletion

/-! # Semantic Process external execution

This module owns external command admission, explicit operation choice, bounded internal closure, the pure `applyStimulus` boundary, and reusable full-occurrence-identity refusal laws. It does not own external wait completion, scenario projection, or capsule fixtures.
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

private structure ExternalAdmission where
  outcome : CommandOutcome
  state : RuntimeState

private def isCallActivityProgram (program : Program) : Bool :=
  program.identity.semanticProfile.value =
    "bpmn-2.0.2-called-process-call-activity-draft"

private def admitStimulus (program : Program) (state : RuntimeState) :
    Stimulus → ExternalAdmission
  | .startProcess _ processId instanceId initialVariables =>
      match state.control with
      | .notStarted =>
          if program.processId.value = processId.value &&
              (!isCallActivityProgram program || initialVariables.isEmpty) then
            match runningProgramStartState? program instanceId initialVariables with
            | some started => { outcome := .committed, state := started }
            | none => { outcome := .semanticFailure, state }
          else
            { outcome := .rejected, state }
      | .running _
      | .completed _ => { outcome := .rejected, state }
  | .completeUserTaskInstance _ taskId submittedValues =>
      match state.control with
      | .running instanceId =>
          -- The bounded arm is routed here rather than inside `completeUserTask` because refusing a
          -- non-empty submission is part of the same admission decision: the timing profile admits no
          -- completion patch, so ignoring one would silently add a data claim.
          if isBoundedTaskDefinition program ⟨taskId.elementId.value⟩ then
            match completeBoundedUserTask? program state taskId.processInstanceId
                ⟨taskId.elementId.value⟩ taskId.activation with
            | some successor =>
                if taskId.processInstanceId = instanceId && submittedValues.isEmpty then
                  { outcome := .committed, state := successor }
                else
                  { outcome := .rejected, state }
            | none => { outcome := .rejected, state }
          else
          match completeUserTask state taskId.processInstanceId
              ⟨taskId.elementId.value⟩ taskId.activation with
          | some successor =>
              if taskId.processInstanceId = instanceId &&
                  !isCallActivityProgram program then
                { outcome := .committed
                  state :=
                    { successor with
                      variables :=
                        { successor.variables with
                          process :=
                            { bindings := mergeProcessVariableBindings
                                successor.variables.process.bindings
                                submittedValues } } } }
              else if isCallActivityProgram program && submittedValues.isEmpty then
                { outcome := .committed, state := successor }
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
          match fireTimer program state timerId logicalTimeMs with
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
    match fire? program operation state with
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
      eventRaceAssociationsValid state &&
        calledProcessAssociationsValid state &&
        (!state.waits.isEmpty ||
          !state.messageWaits.isEmpty ||
          !state.timerWaits.isEmpty ||
          !state.effectWaits.isEmpty)
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

/-- Separates the semantic command outcome and candidate committed state from closure-bound or ambiguous-choice harness failures. Either flag means the state is not a stable public observation even when external admission committed. -/
structure StimulusResult where
  outcome : CommandOutcome
  state : RuntimeState
  internalStepBoundExceeded : Bool
  ambiguousInternalChoice : Bool
  deriving Repr, DecidableEq

def scenarioClosureLimit : Nat := 8

/-- Pure external-command boundary over an already admitted program. Committed admission runs bounded internal closure. Every currently reachable refusal preserves the exact input state and exposes no speculative mutation; no current admission path produces `.rolledBack`. Closure exhaustion and unresolved multiple-enabledness set harness flags instead of changing the semantic outcome. This function performs no I/O and constructs no command or state observation: callers publish those only after both flags are false. -/
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
      completeBoundedUserTask?, singletonWaitingState, noMatch]
  · rcases remainingMismatch with elementMismatch | activationMismatch
    · have noMatch : ¬ (
          (wait.processInstanceId = submittedTaskId.processInstanceId ∧
            wait.task.id = ⟨submittedTaskId.elementId.value⟩) ∧
          wait.activation = submittedTaskId.activation) := by
        intro exactMatch
        exact elementMismatch
          (congrArg TaskDefinitionId.value exactMatch.1.2).symm
      simp [applyStimulus, admitStimulus, completeUserTask,
        completeBoundedUserTask?, singletonWaitingState, noMatch]
    · have noMatch : ¬ (
          (wait.processInstanceId = submittedTaskId.processInstanceId ∧
            wait.task.id = ⟨submittedTaskId.elementId.value⟩) ∧
          wait.activation = submittedTaskId.activation) := by
        intro exactMatch
        exact activationMismatch exactMatch.2.symm
      simp [applyStimulus, admitStimulus, completeUserTask,
        completeBoundedUserTask?, singletonWaitingState, noMatch]

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
      singletonTimerWaitingState, initialState, noMatch]
  · rcases remainingMismatch with elementMismatch | remainingMismatch
    · have noMatch : ¬ (
          (wait.processInstanceId = submittedTimerId.processInstanceId ∧
            wait.elementId.value = submittedTimerId.elementId.value) ∧
          wait.activation = submittedTimerId.activation) := by
        intro exactMatch
        exact elementMismatch exactMatch.1.2.symm
      simp [applyStimulus, admitStimulus, fireTimer,
        singletonTimerWaitingState, initialState, noMatch]
    · rcases remainingMismatch with activationMismatch | timeMismatch
      · have noMatch : ¬ (
            (wait.processInstanceId = submittedTimerId.processInstanceId ∧
              wait.elementId.value = submittedTimerId.elementId.value) ∧
            wait.activation = submittedTimerId.activation) := by
          intro exactMatch
          exact activationMismatch exactMatch.2.symm
        simp [applyStimulus, admitStimulus, fireTimer,
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
              cases definitionFound : boundedScopeDefinitionFor? program wait <;>
                simp [applyStimulus, admitStimulus, fireTimer,
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
              simp [applyStimulus, admitStimulus, fireTimer,
                singletonTimerWaitingState, initialState, noMatch]
          · have noMatch : ¬ (
                (wait.processInstanceId =
                    submittedTimerId.processInstanceId ∧
                  wait.elementId.value =
                    submittedTimerId.elementId.value) ∧
                wait.activation = submittedTimerId.activation) := by
              intro exactMatch
              exact elementMatches exactMatch.1.2
            simp [applyStimulus, admitStimulus, fireTimer,
              singletonTimerWaitingState, initialState, noMatch]
        · have noMatch : ¬ (
              (wait.processInstanceId =
                  submittedTimerId.processInstanceId ∧
                wait.elementId.value =
                  submittedTimerId.elementId.value) ∧
              wait.activation = submittedTimerId.activation) := by
            intro exactMatch
            exact processMatches exactMatch.1.1
          simp [applyStimulus, admitStimulus, fireTimer,
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
