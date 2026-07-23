import BpmnSemantics.Scenario

/-! # BpmnSemantics.SequentialUserTask — Milestone 0 executable semantics

This module is the production Lean account for exactly one semantic capsule: a None Start Event followed by one User Task and one None End Event. It is deliberately not a general BPMN intermediate representation.

External commands are admitted separately from deterministic internal closure. A committed start command creates control at the Start Event; closure advances it to the externally visible User Task wait. A matching completion command releases that wait; closure advances through the End Event and removes the final control item. Exhausting the closure bound is represented separately so it cannot be mistaken for BPMN behavior.
-/

namespace BpmnSemantics.SequentialUserTask

open BpmnSemantics

/-- Immutable definition data needed by the Milestone 0 semantic capsule. -/
structure Model where
  processId : SemanticId
  startEventId : SemanticId
  userTaskId : SemanticId
  endEventId : SemanticId
  deriving Repr, DecidableEq

/-- The content of the calibrated executable Process, independent of CIB's PVM representation. -/
def model : Model :=
  { processId := ⟨"Process_SequentialUserTask"⟩
    startEventId := ⟨"StartEvent_1"⟩
    userTaskId := ⟨"UserTask_Approve"⟩
    endEventId := ⟨"EndEvent_1"⟩ }

/-- Control positions distinguish externally stable states from transient internal positions. -/
inductive ControlState where
  | notStarted
  | enteringStart (instanceId : SemanticId)
  | enteringUserTask (instanceId : SemanticId)
  | waitingUserTask (instanceId : SemanticId)
  | leavingUserTask (instanceId : SemanticId)
  | enteringEnd (instanceId : SemanticId)
  | completed (instanceId : SemanticId)
  deriving Repr, DecidableEq

/-- Runtime state belongs to one Process instance; the shared definition remains immutable. -/
structure RuntimeState where
  control : ControlState
  logicalTimeMs : Nat
  deriving Repr, DecidableEq

def initialState : RuntimeState :=
  { control := .notStarted
    logicalTimeMs := 0 }

/-- Internal evidence is diagnostic and is not part of the canonical comparison trace. -/
inductive MicroEvent where
  | flowTaken (sourceId : SemanticId) (targetId : SemanticId)
  | userTaskWaitCreated (elementId : SemanticId)
  | userTaskWaitCompleted (elementId : SemanticId)
  | processCompleted
  deriving Repr, DecidableEq

/-- One admitted external command before internal closure. -/
private structure CommandAdmission where
  outcome : CommandOutcome
  state : RuntimeState
  microtrace : List MicroEvent
  deriving Repr, DecidableEq

/-- The public reducer result keeps closure protection outside the semantic command outcome. -/
structure CommandResult where
  outcome : CommandOutcome
  state : RuntimeState
  microtrace : List MicroEvent
  internalStepBoundExceeded : Bool
  deriving Repr, DecidableEq

/-- One deterministic internal transition for this capsule. -/
def internalStep (definition : Model) (state : RuntimeState) :
    Option (RuntimeState × MicroEvent) :=
  match state.control with
  | .enteringStart instanceId =>
      some
        ( { state with control := .enteringUserTask instanceId }
        , .flowTaken definition.startEventId definition.userTaskId )
  | .enteringUserTask instanceId =>
      some
        ( { state with control := .waitingUserTask instanceId }
        , .userTaskWaitCreated definition.userTaskId )
  | .leavingUserTask instanceId =>
      some
        ( { state with control := .enteringEnd instanceId }
        , .flowTaken definition.userTaskId definition.endEventId )
  | .enteringEnd instanceId =>
      some
        ( { state with control := .completed instanceId }
        , .processCompleted )
  | .notStarted
  | .waitingUserTask _
  | .completed _ => none

/-- Result of closing deterministic internal transitions to an external command boundary. -/
private structure ClosureResult where
  state : RuntimeState
  microtrace : List MicroEvent
  hitBound : Bool

/-- Bounded closure is a total execution harness; reaching the bound is not a BPMN incident. -/
private def closeInternal : Nat → Model → RuntimeState → ClosureResult
  | 0, definition, state =>
      match internalStep definition state with
      | none => { state, microtrace := [], hitBound := false }
      | some _ => { state, microtrace := [], hitBound := true }
  | fuel + 1, definition, state =>
      match internalStep definition state with
      | none => { state, microtrace := [], hitBound := false }
      | some (nextState, event) =>
          let rest := closeInternal fuel definition nextState
          { state := rest.state
            microtrace := event :: rest.microtrace
            hitBound := rest.hitBound }

private def admit (definition : Model) (state : RuntimeState)
    (stimulus : Stimulus) : CommandAdmission :=
  match stimulus, state.control with
  | .startProcess _ processId instanceId, .notStarted =>
      if processId = definition.processId then
        { outcome := .committed
          state := { state with control := .enteringStart instanceId }
          microtrace := [] }
      else
        { outcome := .rejected, state, microtrace := [] }
  | .completeUserTask _ elementId, .waitingUserTask instanceId =>
      if elementId = definition.userTaskId then
        { outcome := .committed
          state := { state with control := .leavingUserTask instanceId }
          microtrace := [.userTaskWaitCompleted definition.userTaskId] }
      else
        { outcome := .rejected, state, microtrace := [] }
  | _, _ => { outcome := .rejected, state, microtrace := [] }

/-- Apply one external command, then normalize committed control to the next stable boundary. -/
def reduce (fuel : Nat) (definition : Model) (state : RuntimeState)
    (stimulus : Stimulus) : CommandResult :=
  let admission := admit definition state stimulus
  match admission.outcome with
  | .committed =>
      let closure := closeInternal fuel definition admission.state
      { outcome := .committed
        state := closure.state
        microtrace := admission.microtrace ++ closure.microtrace
        internalStepBoundExceeded := closure.hitBound }
  | .rolledBack =>
      { outcome := .rolledBack
        state := admission.state
        microtrace := admission.microtrace
        internalStepBoundExceeded := false }
  | .rejected =>
      { outcome := .rejected
        state := admission.state
        microtrace := admission.microtrace
        internalStepBoundExceeded := false }
  | .semanticFailure =>
      { outcome := .semanticFailure
        state := admission.state
        microtrace := admission.microtrace
        internalStepBoundExceeded := false }
  | .unsupported =>
      { outcome := .unsupported
        state := admission.state
        microtrace := admission.microtrace
        internalStepBoundExceeded := false }

private def commandId : Stimulus → SemanticId
  | .startProcess commandId _ _ => commandId
  | .completeUserTask commandId _ => commandId

private def internalClosureLimit : Nat := 4

private def enabledCompletions (definition : Model) (stimuli : List Stimulus) :
    List Stimulus :=
  stimuli.filter fun stimulus =>
    match stimulus with
    | .completeUserTask _ elementId => decide (elementId = definition.userTaskId)
    | .startProcess _ _ _ => false

private def observeStableState (definition : Model) (state : RuntimeState)
    (remainingStimuli : List Stimulus) : Option StateObservation :=
  match state.control with
  | .waitingUserTask instanceId =>
      some
        { instanceId
          status := .running
          activeWaits :=
            [ { elementId := definition.userTaskId
                kind := .userTask
                multiplicity := 1 } ]
          enabledStimuli := enabledCompletions definition remainingStimuli
          logicalTimeMs := state.logicalTimeMs }
  | .completed instanceId =>
      some
        { instanceId
          status := .completed
          activeWaits := []
          enabledStimuli := []
          logicalTimeMs := state.logicalTimeMs }
  | .notStarted
  | .enteringStart _
  | .enteringUserTask _
  | .leavingUserTask _
  | .enteringEnd _ => none

private structure Execution where
  outcome : ScenarioOutcome
  state : RuntimeState
  trace : List CanonicalObservation

private def finishNonCommit (outcome : CommandOutcome) (state : RuntimeState)
    (observation : CanonicalObservation) : Execution :=
  { outcome := .semantic outcome
    state
    trace := [observation] }

private def executeStimuli (definition : Model) :
    RuntimeState → List Stimulus → Execution
  | state, [] =>
      { outcome := .semantic .committed
        state
        trace := [] }
  | state, stimulus :: remaining =>
      let result := reduce internalClosureLimit definition state stimulus
      let commandObservation := CanonicalObservation.command (commandId stimulus) result.outcome
      if result.internalStepBoundExceeded then
        { outcome := .harnessFailure
          state := result.state
          trace := [commandObservation] }
      else
        match result.outcome with
        | .committed =>
            match observeStableState definition result.state remaining with
            | none =>
                { outcome := .harnessFailure
                  state := result.state
                  trace := [commandObservation] }
            | some snapshot =>
                let rest := executeStimuli definition result.state remaining
                { outcome := rest.outcome
                  state := rest.state
                  trace := commandObservation :: .state snapshot :: rest.trace }
        | .rolledBack => finishNonCommit .rolledBack result.state commandObservation
        | .rejected => finishNonCommit .rejected result.state commandObservation
        | .semanticFailure => finishNonCommit .semanticFailure result.state commandObservation
        | .unsupported => finishNonCommit .unsupported result.state commandObservation

private def supportedScenario (scenario : Scenario) : Bool :=
  decide
    (scenario.schemaVersion = "0.1.0" ∧
      scenario.id = ⟨"m0-sequential-user-task"⟩ ∧
      scenario.profile = ⟨"cibseven-2.2.0-spike.1"⟩ ∧
      scenario.bpmn.id = ⟨"m0-sequential-user-task-process"⟩ ∧
      scenario.bpmn.relativePath = "scenarios/m0-sequential-user-task/process.bpmn" ∧
      scenario.bpmn.sha256 =
        "537758345c021a30d3dcca2e8d18137fae151d6501b72b4b46a77e6125dee295")

/-- Execute the supported profile capsule and derive canonical observations from stable state. -/
def run : ScenarioRunner :=
  fun scenario =>
    if supportedScenario scenario then
      let execution := executeStimuli model initialState scenario.stimuli
      { outcome := execution.outcome
        trace := .deployment .committed :: execution.trace }
    else
      { outcome := .semantic .unsupported
        trace := [.deployment .unsupported] }

def startStimulus : Stimulus :=
  .startProcess ⟨"start-process"⟩ model.processId ⟨"Instance_1"⟩

def completionStimulus : Stimulus :=
  .completeUserTask ⟨"complete-user-task"⟩ model.userTaskId

def afterStartState : RuntimeState :=
  { control := .waitingUserTask ⟨"Instance_1"⟩
    logicalTimeMs := 0 }

def completedState : RuntimeState :=
  { control := .completed ⟨"Instance_1"⟩
    logicalTimeMs := 0 }

/-- Starting the calibrated Process closes at exactly one User Task wait. -/
theorem start_reaches_single_user_task_wait :
    reduce internalClosureLimit model initialState startStimulus =
      { outcome := .committed
        state := afterStartState
        microtrace :=
          [ .flowTaken model.startEventId model.userTaskId
          , .userTaskWaitCreated model.userTaskId ]
        internalStepBoundExceeded := false } := by
  decide

/-- The matching completion command releases the wait and closes the Process. -/
theorem matching_completion_terminates :
    reduce internalClosureLimit model afterStartState completionStimulus =
      { outcome := .committed
        state := completedState
        microtrace :=
          [ .userTaskWaitCompleted model.userTaskId
          , .flowTaken model.userTaskId model.endEventId
          , .processCompleted ]
        internalStepBoundExceeded := false } := by
  decide

/-- A non-matching completion cannot advance or complete the waiting Process. -/
theorem no_completion_before_matching_command :
    reduce internalClosureLimit model afterStartState
        (.completeUserTask ⟨"wrong-completion"⟩ ⟨"Other_Task"⟩) =
      { outcome := .rejected
        state := afterStartState
        microtrace := []
        internalStepBoundExceeded := false } := by
  decide

end BpmnSemantics.SequentialUserTask
