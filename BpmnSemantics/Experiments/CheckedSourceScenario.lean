import BpmnSemantics.Experiments.CheckedSourceTransition

/-! # Checked-source scenario execution

This module owns observation and scenario execution for the provisional direct checked-source account.
-/

namespace BpmnSemantics.Experiments.CheckedSourceSemantics

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def waitMultiplicity (state : SourceRuntimeState) (nodeId : NodeId) : Nat :=
  (state.waits.filter fun wait => decide (wait.taskNodeId = nodeId)).length

def taskDefinitions (source : CheckedProcess) :
    List (NodeId × Option String) :=
  source.nodes.filterMap fun
    | .userTask id name => some (id, name)
    | _ => none

def observeStableState (source : CheckedProcess)
    (state : SourceRuntimeState) : Option StateObservation :=
  match state.control with
  | .notStarted => none
  | .running instanceId =>
      let tasks :=
        (taskDefinitions source).flatMap fun (nodeId, name) =>
          (state.waits.filter fun wait =>
            decide (wait.taskNodeId = nodeId)).map fun wait =>
              { id :=
                  { processInstanceId := wait.processInstanceId
                    elementId := ⟨nodeId.value⟩
                    activation := wait.activation }
                name
                state := .active }
      some
        { instanceId
          status := .running
          activeWaits :=
            (taskDefinitions source).filterMap fun (nodeId, _) =>
              let multiplicity := waitMultiplicity state nodeId
              if multiplicity = 0 then none
              else
                some
                  { elementId := ⟨nodeId.value⟩
                    kind := .userTask
                    multiplicity }
          openUserTasks := tasks
          openMessageSubscriptions := []
          openTimers := []
          openEffects := []
          variables := []
          enabledInteractions :=
            tasks.map fun task => .completeUserTaskInstance task.id
          logicalTimeMs := state.logicalTimeMs }
  | .completed instanceId =>
      some
        { instanceId
          status := .completed
          activeWaits := []
          openUserTasks := []
          openMessageSubscriptions := []
          openTimers := []
          openEffects := []
          variables := []
          enabledInteractions := []
          logicalTimeMs := state.logicalTimeMs }

def commandId : Stimulus → SemanticId
  | .startProcess id _ _ _
  | .triggerMessageStart id _ _ _ _
  | .triggerTimerStart id _ _ _
  | .completeUserTaskInstance id _ _
  | .fireTimer id _ _
  | .deliverMessage id _ _
  | .completeEffect id _ _
  | .reportEffectFailure id _ _
  | .retryIncident id _ => id

structure ScenarioExecution where
  outcome : ScenarioOutcome
  state : SourceRuntimeState
  trace : List CanonicalObservation
  deriving Repr, DecidableEq

def terminalExecution (source : CheckedProcess) (outcome : CommandOutcome)
    (state : SourceRuntimeState) (observation : CanonicalObservation) :
    ScenarioExecution :=
  { outcome := .semantic outcome
    state
    trace :=
      match observeStableState source state with
      | none => [observation]
      | some snapshot => [observation, .state snapshot] }

def executeStimuli (closureLimit : Nat) (source : CheckedProcess) :
    SourceRuntimeState → List Stimulus → ScenarioExecution
  | state, [] =>
      { outcome := .semantic .committed, state, trace := [] }
  | state, stimulus :: remaining =>
      let result := applyStimulus closureLimit source state stimulus
      if result.internalStepBoundExceeded ||
          result.ambiguousInternalChoice then
        { outcome := .harnessFailure, state := result.state, trace := [] }
      else
        let observation :=
          CanonicalObservation.command (commandId stimulus) result.outcome
        match result.outcome with
        | .committed =>
            match observeStableState source result.state with
            | none =>
                { outcome := .harnessFailure
                  state := result.state
                  trace := [] }
            | some snapshot =>
                let rest :=
                  executeStimuli closureLimit source result.state remaining
                { outcome := rest.outcome
                  state := rest.state
                  trace := observation :: .state snapshot :: rest.trace }
        | .rolledBack =>
            terminalExecution source .rolledBack result.state observation
        | .rejected =>
            terminalExecution source .rejected result.state observation
        | .semanticFailure =>
            terminalExecution source .semanticFailure result.state observation
        | .unsupported =>
            terminalExecution source .unsupported result.state observation

def requiredObservations : List ObservationKind :=
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

def supportsScenario (source : CheckedProcess) (scenario : Scenario) : Bool :=
  (!source.nodes.any fun node =>
      match node with
      | .messageStartEvent .. => true
      | .timerStartEvent .. => true
      | _ => false) &&
    (!scenario.stimuli.any fun stimulus =>
      match stimulus with
      | .triggerMessageStart .. => true
      | .triggerTimerStart .. => true
      | _ => false) &&
    decide (
    scenario.kind = .scenario &&
      scenario.profile = source.identity.semanticProfile &&
      scenario.bpmn.id = source.identity.sourceId &&
      scenario.bpmn.sha256 = source.identity.sourceSha256 &&
      scenario.observations = requiredObservations)

def runScenarioWithClosureLimit (closureLimit : Nat)
    (source : CheckedProcess) (scenario : Scenario) : ScenarioResult :=
  if supportsScenario source scenario then
    let execution :=
      executeStimuli closureLimit source initialState scenario.stimuli
    { outcome := execution.outcome
      trace := .deployment .committed :: execution.trace }
  else
    { outcome := .semantic .unsupported
      trace := [.deployment .unsupported] }

end BpmnSemantics.Experiments.CheckedSourceSemantics
