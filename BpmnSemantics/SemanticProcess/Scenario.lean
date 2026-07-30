import BpmnSemantics.SemanticProcess.Execution

/-! # Semantic Process scenario projection

This module owns stable-state projection, scenario admission, and answer-free scenario execution over the pure stimulus boundary. It does not define lowering, transition meaning, or capsule fixtures.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def commandId : Stimulus → SemanticId
  | .startProcess id _ _
  | .completeUserTaskInstance id _
  | .fireTimer id _ _
  | .completeEffect id _ _ => id

private def taskDefinitions (program : Program) : List UserTaskDefinition :=
  program.operations.filterMap fun
    | .awaitUserTask _ _ _ _ task => some task
    | _ => none

private def timerDefinitions (program : Program) : List TimerDefinition :=
  program.operations.filterMap fun
    | .awaitTimer _ _ _ _ timer => some timer
    | _ => none

private def effectDefinitions (program : Program) : List EffectDefinition :=
  program.operations.filterMap fun
    | .awaitEffect _ _ _ _ effect _ => some effect
    | _ => none

def timerWaitMultiplicity (state : RuntimeState) (elementId : NodeId) : Nat :=
  (state.timerWaits.filter fun wait =>
    decide (wait.elementId = elementId)).length

def effectWaitMultiplicity (state : RuntimeState) (elementId : NodeId) : Nat :=
  (state.effectWaits.filter fun wait =>
    decide (wait.elementId = elementId)).length

private def activeWaits (program : Program) (state : RuntimeState) :
    List ActiveWait :=
  let taskWaits :=
    (taskDefinitions program).filterMap fun task =>
      let multiplicity := waitMultiplicity state task.id
      if multiplicity = 0 then
        none
      else
        some
          { elementId := ⟨task.id.value⟩
            kind := .userTask
            multiplicity }
  let timerWaits :=
    (timerDefinitions program).filterMap fun timer =>
      let multiplicity := timerWaitMultiplicity state timer.elementId
      if multiplicity = 0 then
        none
      else
        some
          { elementId := ⟨timer.elementId.value⟩
            kind := .timer
            multiplicity }
  let effectWaits :=
    (effectDefinitions program).filterMap fun effect =>
      let multiplicity := effectWaitMultiplicity state effect.elementId
      if multiplicity = 0 then
        none
      else
        some
          { elementId := ⟨effect.elementId.value⟩
            kind := .effect
            multiplicity }
  taskWaits ++ timerWaits ++ effectWaits

private def openUserTasks (program : Program) (state : RuntimeState) :
    List OpenUserTask :=
  (taskDefinitions program).flatMap fun task =>
    (state.waits.filter fun wait => decide (wait.task.id = task.id)).map fun wait =>
      { id :=
          { processInstanceId := wait.processInstanceId
            elementId := ⟨task.id.value⟩
            activation := wait.activation }
        name := task.name
        state := .active }

private def openTimers (program : Program) (state : RuntimeState) :
    List OpenTimer :=
  (timerDefinitions program).flatMap fun timer =>
    (state.timerWaits.filter fun wait =>
      decide (wait.elementId = timer.elementId)).map fun wait =>
        { id :=
            { processInstanceId := wait.processInstanceId
              elementId := ⟨timer.elementId.value⟩
              activation := wait.activation }
          deadlineMs := wait.deadlineMs }

private def openEffects (program : Program) (state : RuntimeState) :
    List OpenEffect :=
  (effectDefinitions program).flatMap fun effect =>
    (state.effectWaits.filter fun wait =>
      decide (wait.elementId = effect.elementId)).map fun wait =>
        { id :=
            { processInstanceId := wait.processInstanceId
              elementId := ⟨effect.elementId.value⟩
              activation := wait.activation }
          descriptor := wait.descriptor
          arguments := wait.arguments }

/-- Project canonical state projection, defined only for started semantic Process instances. -/
def observeStableState (program : Program) (state : RuntimeState) :
    Option StateObservation :=
  match state.control with
  | .notStarted => none
  | .running instanceId =>
      let tasks := openUserTasks program state
      some
        { instanceId
          status := .running
          activeWaits := activeWaits program state
          openUserTasks := tasks
          openTimers := openTimers program state
          openEffects := openEffects program state
          variables := state.variables.process.bindings
          enabledInteractions :=
            tasks.map fun task => .completeUserTaskInstance task.id
          logicalTimeMs := state.logicalTimeMs }
  | .completed instanceId =>
      some
        { instanceId
          status := .completed
          activeWaits := []
          openUserTasks := []
          openTimers := []
          openEffects := []
          variables := state.variables.process.bindings
          enabledInteractions := []
          logicalTimeMs := state.logicalTimeMs }

private structure ScenarioExecution where
  outcome : ScenarioOutcome
  state : RuntimeState
  trace : List CanonicalObservation

private def terminalExecution (program : Program) (outcome : CommandOutcome)
    (state : RuntimeState) (observation : CanonicalObservation) :
    ScenarioExecution :=
  { outcome := .semantic outcome
    state
    trace :=
      match observeStableState program state with
      | none => [observation]
      | some snapshot => [observation, .state snapshot] }

private def executeStimuli (closureLimit : Nat) (program : Program) :
    RuntimeState → List Stimulus → ScenarioExecution
  | state, [] =>
      { outcome := .semantic .committed
        state
        trace := [] }
  | state, stimulus :: remaining =>
      let result := applyStimulus closureLimit program state stimulus
      if result.internalStepBoundExceeded ||
          result.ambiguousInternalChoice then
        { outcome := .harnessFailure
          state := result.state
          trace := [] }
      else
        let observation :=
          CanonicalObservation.command (commandId stimulus) result.outcome
        match result.outcome with
        | .committed =>
            match observeStableState program result.state with
            | none =>
                { outcome := .harnessFailure
                  state := result.state
                  trace := [] }
            | some snapshot =>
                let rest :=
                  executeStimuli closureLimit program result.state remaining
                { outcome := rest.outcome
                  state := rest.state
                  trace := observation :: .state snapshot :: rest.trace }
        | .rolledBack =>
            terminalExecution program .rolledBack result.state observation
        | .rejected =>
            terminalExecution program .rejected result.state observation
        | .semanticFailure =>
            terminalExecution program .semanticFailure result.state observation
        | .unsupported =>
            terminalExecution program .unsupported result.state observation

private def requiredObservations : List ObservationKind :=
  [ .deployment
  , .commandResults
  , .processStatus
  , .activeWaits
  , .openUserTasks
  , .openTimers
  , .openEffects
  , .variables
  , .enabledInteractions
  , .logicalTime ]

def supportsScenario (program : Program) (scenario : Scenario) : Bool :=
  programWellFormed program &&
    decide (
      scenario.kind = .scenario &&
        scenario.profile = program.identity.semanticProfile &&
        scenario.bpmn.id = program.identity.sourceId &&
        scenario.bpmn.sha256 = program.identity.sourceSha256 &&
        scenario.observations = requiredObservations)

def runScenarioWithClosureLimit (closureLimit : Nat) (program : Program)
    (scenario : Scenario) : ScenarioResult :=
  if supportsScenario program scenario then
    let execution :=
      executeStimuli closureLimit program initialState scenario.stimuli
    { outcome := execution.outcome
      trace := .deployment .committed :: execution.trace }
  else
    { outcome := .semantic .unsupported
      trace := [.deployment .unsupported] }

def runScenario (program : Program) (scenario : Scenario) : ScenarioResult :=
  runScenarioWithClosureLimit scenarioClosureLimit program scenario

/-! ## Exact bounded definitions and separating witnesses -/


end BpmnSemantics.SemanticProcess
