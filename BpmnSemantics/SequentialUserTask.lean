import BpmnSemantics.Scenario

/-! # BpmnSemantics.SequentialUserTask — Milestone 0 executable semantics

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

/-- Compatibility accessor for the retained Milestone 0 lifecycle account. -/
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
  | .completeUserTask _ elementId, .waitingUserTask instanceId activation =>
      if elementId = definition.userTaskId then
        { outcome := .committed
          state := { state with control := .leavingUserTask instanceId activation }
          microtrace := [.userTaskWaitCompleted definition.userTaskId] }
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
  | .completeUserTask commandId _ => commandId
  | .completeUserTaskInstance commandId _ => commandId

private def internalClosureLimit : Nat := 4

/-- Projection versions keep the retained lifecycle trace separate from current semantics. -/
private inductive ProjectionSchema where
  | retainedLifecycle
  | userTaskInteraction

private def enabledCompletions (definition : Model) (stimuli : List Stimulus) :
    List Stimulus :=
  stimuli.filter fun stimulus =>
    match stimulus with
    | .completeUserTask _ elementId => decide (elementId = definition.userTaskId)
    | .completeUserTaskInstance _ _ => false
    | .startProcess _ _ _ => false

private def userTaskInstanceId (definition : Model) (instanceId : SemanticId)
    (activation : Nat) : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := definition.userTaskId
    activation }

private def observeStableState (projection : ProjectionSchema)
    (definition : Model) (state : RuntimeState)
    (remainingStimuli : List Stimulus) : Option StateObservation :=
  match state.control with
  | .waitingUserTask instanceId activation =>
      let taskId := userTaskInstanceId definition instanceId activation
      let activeWaits :=
        [ { elementId := definition.userTaskId
            kind := .userTask
            multiplicity := 1 } ]
      match projection with
      | .retainedLifecycle =>
          some
            { instanceId
              status := .running
              activeWaits
              openUserTasks := none
              enabledStimuli := some (enabledCompletions definition remainingStimuli)
              enabledInteractions := none
              logicalTimeMs := state.logicalTimeMs }
      | .userTaskInteraction =>
          some
            { instanceId
              status := .running
              activeWaits
              openUserTasks :=
                some
                  [ { id := taskId
                      name := definition.userTask.name
                      state := .active } ]
              enabledStimuli := none
              enabledInteractions := some [.completeUserTaskInstance taskId]
              logicalTimeMs := state.logicalTimeMs }
  | .completed instanceId =>
      match projection with
      | .retainedLifecycle =>
          some
            { instanceId
              status := .completed
              activeWaits := []
              openUserTasks := none
              enabledStimuli := some []
              enabledInteractions := none
              logicalTimeMs := state.logicalTimeMs }
      | .userTaskInteraction =>
          some
            { instanceId
              status := .completed
              activeWaits := []
              openUserTasks := some []
              enabledStimuli := none
              enabledInteractions := some []
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

private def finishNonCommit (projection : ProjectionSchema) (definition : Model)
    (remainingStimuli : List Stimulus) (outcome : CommandOutcome)
    (state : RuntimeState) (observation : CanonicalObservation) : Execution :=
  { outcome := .semantic outcome
    state
    trace :=
      match projection with
      | .retainedLifecycle => [observation]
      | .userTaskInteraction =>
          match observeStableState projection definition state remainingStimuli with
          | none => [observation]
          | some snapshot => [observation, .state snapshot] }

private def executeStimuli (projection : ProjectionSchema)
    (closureLimit : Nat) (definition : Model) :
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
            match observeStableState projection definition result.state remaining with
            | none =>
                { outcome := .harnessFailure
                  state := result.state
                  trace := [] }
            | some snapshot =>
                let rest :=
                  executeStimuli projection closureLimit definition result.state remaining
                { outcome := rest.outcome
                  state := rest.state
                  trace := commandObservation :: .state snapshot :: rest.trace }
        | .rolledBack =>
            finishNonCommit projection definition remaining .rolledBack
              result.state commandObservation
        | .rejected =>
            finishNonCommit projection definition remaining .rejected
              result.state commandObservation
        | .semanticFailure =>
            finishNonCommit projection definition remaining .semanticFailure
              result.state commandObservation
        | .unsupported =>
            finishNonCommit projection definition remaining .unsupported
              result.state commandObservation

private abbrev hasCalibratedBpmnIdentity (scenario : Scenario) : Prop :=
  scenario.bpmn.id = ⟨"m0-sequential-user-task-process"⟩ ∧
    scenario.bpmn.relativePath = "scenarios/m0-sequential-user-task/process.bpmn" ∧
    scenario.bpmn.sha256 =
      "537758345c021a30d3dcca2e8d18137fae151d6501b72b4b46a77e6125dee295"

private def isRetainedLifecycleScenario (scenario : Scenario) : Bool :=
  decide
    (scenario.schemaVersion = "0.1.0" ∧
      scenario.traceSchemaVersion = "0.1.0" ∧
      scenario.id = ⟨"m0-sequential-user-task"⟩ ∧
      scenario.profile = ⟨"cibseven-2.2.0-spike.1"⟩ ∧
      hasCalibratedBpmnIdentity scenario ∧
      scenario.observations =
        [ .deployment
        , .commandResults
        , .processStatus
        , .activeWaits
        , .enabledStimuli
        , .logicalTime ])

private abbrev isInteractionScenarioId (id : ScenarioId) : Prop :=
  id = ⟨"m1-user-task-discovery-completion"⟩ ∨
    id = ⟨"m1-user-task-wrong-activation"⟩ ∨
    id = ⟨"m1-user-task-stale-completion"⟩

private def isUserTaskInteractionScenario (scenario : Scenario) : Bool :=
  decide
    (scenario.schemaVersion = "0.2.0" ∧
      scenario.traceSchemaVersion = "0.2.0" ∧
      isInteractionScenarioId scenario.id ∧
      scenario.profile = ⟨"cibseven-2.2.0-spike.2"⟩ ∧
      hasCalibratedBpmnIdentity scenario ∧
      scenario.observations =
        [ .deployment
        , .commandResults
        , .processStatus
        , .activeWaits
        , .openUserTasks
        , .enabledInteractions
        , .logicalTime ])

private def projectionForScenario (scenario : Scenario) : Option ProjectionSchema :=
  if isRetainedLifecycleScenario scenario then
    some .retainedLifecycle
  else if isUserTaskInteractionScenario scenario then
    some .userTaskInteraction
  else
    none

/-- Execute with an explicit harness limit so bound-exhaustion behavior remains testable. -/
def runWithClosureLimit (closureLimit : Nat) : ScenarioRunner :=
  fun scenario =>
    match projectionForScenario scenario with
    | some projection =>
        let execution :=
          executeStimuli projection closureLimit model initialState scenario.stimuli
        { outcome := execution.outcome
          trace := .deployment .committed :: execution.trace }
    | none =>
        { outcome := .semantic .unsupported
          trace := [.deployment .unsupported] }

/-- Execute the supported profile capsule and derive canonical observations from stable state. -/
def run : ScenarioRunner :=
  runWithClosureLimit internalClosureLimit

def startStimulus : Stimulus :=
  .startProcess ⟨"start-process"⟩ model.processId ⟨"Instance_1"⟩

def completionStimulus : Stimulus :=
  .completeUserTask ⟨"complete-user-task"⟩ model.userTaskId

def afterStartState : RuntimeState :=
  { control := .waitingUserTask ⟨"Instance_1"⟩ 1
    logicalTimeMs := 0 }

def completedState : RuntimeState :=
  { control := .completed ⟨"Instance_1"⟩
    logicalTimeMs := 0 }

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

/-- A non-matching completion cannot advance or complete the waiting Process. -/
theorem no_completion_before_matching_command :
    applyStimulus internalClosureLimit model afterStartState
        (.completeUserTask ⟨"wrong-completion"⟩ ⟨"Other_Task"⟩) =
      { outcome := .rejected
        state := afterStartState
        microtrace := []
        internalStepBoundExceeded := false } := by
  decide

/-- The exact active task occurrence used by the bounded interaction capsule. -/
def exactTaskInstanceId : UserTaskInstanceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := model.userTaskId
    activation := 1 }

/-- Exact task-instance completion is distinct from the retained element-only command. -/
def exactTaskCompletionStimulus : Stimulus :=
  .completeUserTaskInstance ⟨"complete-user-task-instance"⟩ exactTaskInstanceId

/-- Completing the exact active task occurrence releases the wait and terminates the Process. -/
theorem exact_task_completion_terminates :
    applyStimulus internalClosureLimit model afterStartState
        exactTaskCompletionStimulus =
      { outcome := .committed
        state := completedState
        microtrace :=
          [ .userTaskWaitCompleted model.userTaskId
          , .flowTaken model.userTaskId model.endEventId
          , .processCompleted ]
        internalStepBoundExceeded := false } := by
  decide

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
        internalStepBoundExceeded := false } := by
  simp [applyStimulus, admit, h]

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
