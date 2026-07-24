import BpmnSemantics.Scenario

/-! # BpmnSemantics.SequentialUserTask — sequential User Task executable semantics

This module is the production Lean account for exactly one semantic capsule: a None Start Event followed by one User Task and one None End Event. It is deliberately not a general BPMN intermediate representation.

External commands are admitted separately from deterministic internal closure. A committed start command creates control at the Start Event; closure advances it to the externally visible User Task wait. A matching completion command releases that wait; closure advances through the End Event and removes the final control item. Exhausting the closure bound is represented separately so it cannot be mistaken for BPMN behavior.
-/

namespace BpmnSemantics.SequentialUserTask

open BpmnSemantics

/-- Immutable User Task definition data admitted from the executable model. -/
structure UserTaskDefinition where
  id : SemanticId
  name : Option String
  deriving Repr, DecidableEq

/-- Immutable definition data needed by the sequential User Task semantic capsule. -/
structure Model where
  processId : SemanticId
  startEventId : SemanticId
  userTask : UserTaskDefinition
  endEventId : SemanticId
  deriving Repr, DecidableEq

/-- Stable accessor used by semantic rules and reusable laws. -/
def Model.userTaskId (definition : Model) : SemanticId :=
  definition.userTask.id

/-- The content of the calibrated executable Process, independent of CIB's PVM representation. -/
def model : Model :=
  { processId := ⟨"Process_SequentialUserTask"⟩
    startEventId := ⟨"StartEvent_1"⟩
    userTask :=
      { id := ⟨"UserTask_Approve"⟩
        name := some "Approve" }
    endEventId := ⟨"EndEvent_1"⟩ }

/-- Control positions distinguish externally stable states from transient internal positions. -/
inductive ControlState where
  | notStarted
  | enteringStart (instanceId : SemanticId)
  | enteringUserTask (instanceId : SemanticId)
  | waitingUserTask (instanceId : SemanticId) (activation : Nat)
  | leavingUserTask (instanceId : SemanticId) (activation : Nat)
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

/-- Declarative account of the internal transitions permitted by this capsule. -/
inductive InternalMicroStep (definition : Model) :
    RuntimeState → MicroEvent → RuntimeState → Prop where
  | takeStartFlow (instanceId : SemanticId) (logicalTimeMs : Nat) :
      InternalMicroStep definition
        { control := .enteringStart instanceId, logicalTimeMs }
        (.flowTaken definition.startEventId definition.userTaskId)
        { control := .enteringUserTask instanceId, logicalTimeMs }
  | createUserTaskWait (instanceId : SemanticId) (logicalTimeMs : Nat) :
      InternalMicroStep definition
        { control := .enteringUserTask instanceId, logicalTimeMs }
        (.userTaskWaitCreated definition.userTaskId)
        { control := .waitingUserTask instanceId 1, logicalTimeMs }
  | takeUserTaskFlow (instanceId : SemanticId) (activation logicalTimeMs : Nat) :
      InternalMicroStep definition
        { control := .leavingUserTask instanceId activation, logicalTimeMs }
        (.flowTaken definition.userTaskId definition.endEventId)
        { control := .enteringEnd instanceId, logicalTimeMs }
  | completeProcess (instanceId : SemanticId) (logicalTimeMs : Nat) :
      InternalMicroStep definition
        { control := .enteringEnd instanceId, logicalTimeMs }
        .processCompleted
        { control := .completed instanceId, logicalTimeMs }

/-- One admitted external command before internal closure. -/
private structure CommandAdmission where
  outcome : CommandOutcome
  state : RuntimeState
  microtrace : List MicroEvent
  deriving Repr, DecidableEq

/-- The public semantic core result keeps closure protection outside the semantic command outcome. -/
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
        ( { state with control := .waitingUserTask instanceId 1 }
        , .userTaskWaitCreated definition.userTaskId )
  | .leavingUserTask instanceId _ =>
      some
        ( { state with control := .enteringEnd instanceId }
        , .flowTaken definition.userTaskId definition.endEventId )
  | .enteringEnd instanceId =>
      some
        ( { state with control := .completed instanceId }
        , .processCompleted )
  | .notStarted
  | .waitingUserTask _ _
  | .completed _ => none

/-- Every transition selected by the executable evaluator is permitted by the declarative relation. -/
theorem internalStep_sound (definition : Model) (before after : RuntimeState)
    (event : MicroEvent)
    (h : internalStep definition before = some (after, event)) :
    InternalMicroStep definition before event after := by
  cases before with
  | mk control logicalTimeMs =>
      cases control with
      | notStarted => simp [internalStep] at h
      | enteringStart instanceId =>
          simp [internalStep] at h
          rcases h with ⟨rfl, rfl⟩
          exact .takeStartFlow instanceId logicalTimeMs
      | enteringUserTask instanceId =>
          simp [internalStep] at h
          rcases h with ⟨rfl, rfl⟩
          exact .createUserTaskWait instanceId logicalTimeMs
      | waitingUserTask instanceId activation =>
          simp [internalStep] at h
      | leavingUserTask instanceId activation =>
          simp [internalStep] at h
          rcases h with ⟨rfl, rfl⟩
          exact .takeUserTaskFlow instanceId activation logicalTimeMs
      | enteringEnd instanceId =>
          simp [internalStep] at h
          rcases h with ⟨rfl, rfl⟩
          exact .completeProcess instanceId logicalTimeMs
      | completed instanceId => simp [internalStep] at h

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
  | .completeUserTaskInstance _ taskId, .waitingUserTask instanceId activation =>
      if taskId.processInstanceId = instanceId ∧
          taskId.elementId = definition.userTaskId ∧
          taskId.activation = activation then
        { outcome := .committed
          state := { state with control := .leavingUserTask instanceId activation }
          microtrace := [.userTaskWaitCompleted definition.userTaskId] }
      else
        { outcome := .rejected, state, microtrace := [] }
  | _, _ => { outcome := .rejected, state, microtrace := [] }

/-- Apply one external command, then normalize committed control to the next stable boundary. -/
def applyStimulus (fuel : Nat) (definition : Model) (state : RuntimeState)
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
  | .completeUserTaskInstance commandId _ => commandId

private def internalClosureLimit : Nat := 4

private def userTaskInstanceId (definition : Model) (instanceId : SemanticId)
    (activation : Nat) : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := definition.userTaskId
    activation }

private def observeStableState (definition : Model) (state : RuntimeState) :
    Option StateObservation :=
  match state.control with
  | .waitingUserTask instanceId activation =>
      let taskId := userTaskInstanceId definition instanceId activation
      some
        { instanceId
          status := .running
          activeWaits :=
            [ { elementId := definition.userTaskId
                kind := .userTask
                multiplicity := 1 } ]
          openUserTasks :=
            [ { id := taskId
                name := definition.userTask.name
                state := .active } ]
          enabledInteractions := [.completeUserTaskInstance taskId]
          logicalTimeMs := state.logicalTimeMs }
  | .completed instanceId =>
      some
        { instanceId
          status := .completed
          activeWaits := []
          openUserTasks := []
          enabledInteractions := []
          logicalTimeMs := state.logicalTimeMs }
  | .notStarted
  | .enteringStart _
  | .enteringUserTask _
  | .leavingUserTask _ _
  | .enteringEnd _ => none

private structure Execution where
  outcome : ScenarioOutcome
  state : RuntimeState
  trace : List CanonicalObservation

private def finishNonCommit (definition : Model) (outcome : CommandOutcome)
    (state : RuntimeState) (observation : CanonicalObservation) : Execution :=
  { outcome := .semantic outcome
    state
    trace :=
      match observeStableState definition state with
      | none => [observation]
      | some snapshot => [observation, .state snapshot] }

private def executeStimuli (closureLimit : Nat) (definition : Model) :
    RuntimeState → List Stimulus → Execution
  | state, [] =>
      { outcome := .semantic .committed
        state
        trace := [] }
  | state, stimulus :: remaining =>
      let result := applyStimulus closureLimit definition state stimulus
      if result.internalStepBoundExceeded then
        { outcome := .harnessFailure
          state := result.state
          trace := [] }
      else
        let commandObservation := CanonicalObservation.command (commandId stimulus) result.outcome
        match result.outcome with
        | .committed =>
            match observeStableState definition result.state with
            | none =>
                { outcome := .harnessFailure
                  state := result.state
                  trace := [] }
            | some snapshot =>
                let rest :=
                  executeStimuli closureLimit definition result.state remaining
                { outcome := rest.outcome
                  state := rest.state
                  trace := commandObservation :: .state snapshot :: rest.trace }
        | .rolledBack =>
            finishNonCommit definition .rolledBack result.state commandObservation
        | .rejected =>
            finishNonCommit definition .rejected result.state commandObservation
        | .semanticFailure =>
            finishNonCommit definition .semanticFailure result.state commandObservation
        | .unsupported =>
            finishNonCommit definition .unsupported result.state commandObservation

private abbrev hasCalibratedBpmnIdentity (scenario : Scenario) : Prop :=
  scenario.bpmn.id = ⟨"sequential-user-task-process"⟩ ∧
    scenario.bpmn.relativePath =
      "scenarios/user-task-discovery-completion/process.bpmn" ∧
    scenario.bpmn.sha256 =
      "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d"

private def isSupportedScenario (scenario : Scenario) : Bool :=
  decide
    (scenario.kind = .scenario ∧
      hasCalibratedBpmnIdentity scenario ∧
      scenario.observations =
        [ .deployment
        , .commandResults
        , .processStatus
        , .activeWaits
        , .openUserTasks
        , .enabledInteractions
        , .logicalTime ])

/-- Execute with an explicit harness limit so bound-exhaustion behavior remains testable. -/
def runWithClosureLimit (closureLimit : Nat) : ScenarioRunner :=
  fun scenario =>
    if isSupportedScenario scenario then
      let execution :=
        executeStimuli closureLimit model initialState scenario.stimuli
      { outcome := execution.outcome
        trace := .deployment .committed :: execution.trace }
    else
      { outcome := .semantic .unsupported
        trace := [.deployment .unsupported] }

/-- Execute the supported profile capsule and derive canonical observations from stable state. -/
def run : ScenarioRunner :=
  runWithClosureLimit internalClosureLimit

def startStimulus : Stimulus :=
  .startProcess ⟨"start-process"⟩ model.processId ⟨"Instance_1"⟩

def afterStartState : RuntimeState :=
  { control := .waitingUserTask ⟨"Instance_1"⟩ 1
    logicalTimeMs := 0 }

def completedState : RuntimeState :=
  { control := .completed ⟨"Instance_1"⟩
    logicalTimeMs := 0 }

/-- The exact active task occurrence used by the bounded interaction capsule. -/
def exactTaskInstanceId : UserTaskInstanceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := model.userTaskId
    activation := 1 }

def completionStimulus : Stimulus :=
  .completeUserTaskInstance ⟨"complete-user-task-instance"⟩ exactTaskInstanceId

/-- Starting the calibrated Process closes at exactly one User Task wait. -/
theorem start_reaches_single_user_task_wait :
    applyStimulus internalClosureLimit model initialState startStimulus =
      { outcome := .committed
        state := afterStartState
        microtrace :=
          [ .flowTaken model.startEventId model.userTaskId
          , .userTaskWaitCreated model.userTaskId ]
        internalStepBoundExceeded := false } := by
  decide

/-- The matching completion command releases the wait and closes the Process. -/
theorem matching_completion_terminates :
    applyStimulus internalClosureLimit model afterStartState completionStimulus =
      { outcome := .committed
        state := completedState
        microtrace :=
          [ .userTaskWaitCompleted model.userTaskId
          , .flowTaken model.userTaskId model.endEventId
          , .processCompleted ]
        internalStepBoundExceeded := false } := by
  decide

/-- A non-matching task occurrence cannot advance or complete the waiting Process. -/
theorem no_completion_before_matching_command :
    applyStimulus internalClosureLimit model afterStartState
        (.completeUserTaskInstance ⟨"wrong-completion"⟩
          { exactTaskInstanceId with elementId := ⟨"Other_Task"⟩ }) =
      { outcome := .rejected
        state := afterStartState
        microtrace := []
        internalStepBoundExceeded := false } := by
  decide

/-- A completion whose submitted task occurrence differs from the active occurrence is rejected without state change. -/
-- tag::task-identity-law[]
theorem task_identity_mismatch_is_rejected
    (definition : Model) (instanceId : SemanticId)
    (activeActivation : Nat) (completionCommandId : SemanticId)
    (submittedTaskId : UserTaskInstanceId) (logicalTimeMs : Nat)
    (h :
      submittedTaskId.processInstanceId ≠ instanceId ∨
      submittedTaskId.elementId ≠ definition.userTaskId ∨
      submittedTaskId.activation ≠ activeActivation) :
    applyStimulus internalClosureLimit definition
        { control := .waitingUserTask instanceId activeActivation
          logicalTimeMs }
        (.completeUserTaskInstance completionCommandId
          submittedTaskId) =
      { outcome := .rejected
        state :=
          { control := .waitingUserTask instanceId activeActivation
            logicalTimeMs }
        microtrace := []
        internalStepBoundExceeded := false } := by
  rcases h with processMismatch | remainingMismatch
  · simp [applyStimulus, admit, processMismatch]
  · rcases remainingMismatch with elementMismatch | activationMismatch
    · simp [applyStimulus, admit, elementMismatch]
    · simp [applyStimulus, admit, activationMismatch]
-- end::task-identity-law[]

/-- A command with the wrong activation ordinal is rejected for any identifiers and model. -/
theorem wrong_activation_is_rejected
    (definition : Model) (instanceId : SemanticId)
    (activeActivation submittedActivation : Nat) (completionCommandId : SemanticId)
    (logicalTimeMs : Nat)
    (h : submittedActivation ≠ activeActivation) :
    applyStimulus internalClosureLimit definition
        { control := .waitingUserTask instanceId activeActivation
          logicalTimeMs }
        (.completeUserTaskInstance completionCommandId
          { processInstanceId := instanceId
            elementId := definition.userTaskId
            activation := submittedActivation }) =
      { outcome := .rejected
        state :=
          { control := .waitingUserTask instanceId activeActivation
            logicalTimeMs }
        microtrace := []
        internalStepBoundExceeded := false } :=
  task_identity_mismatch_is_rejected
    definition instanceId activeActivation completionCommandId
      { processInstanceId := instanceId
        elementId := definition.userTaskId
        activation := submittedActivation }
      logicalTimeMs (Or.inr (Or.inr h))

/-- Matching the BPMN element ID alone is not sufficient task-instance identity. -/
theorem element_id_alone_is_insufficient :
    let wrongTaskId : UserTaskInstanceId :=
      { exactTaskInstanceId with activation := 2 }
    wrongTaskId.elementId = exactTaskInstanceId.elementId ∧
      (applyStimulus internalClosureLimit model afterStartState
        (.completeUserTaskInstance ⟨"wrong-activation"⟩ wrongTaskId)).outcome =
          .rejected := by
  decide

end BpmnSemantics.SequentialUserTask
