import BpmnSemantics.SemanticProcess.Execution
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation

/-! # Semantic Process scenario projection

This module owns stable-state projection, scenario admission, and answer-free scenario execution over the pure stimulus boundary. It does not define lowering, transition meaning, or capsule fixtures.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def waitMultiplicity (state : RuntimeState) (taskId : TaskDefinitionId) : Nat :=
  (state.waits.filter fun wait => decide (wait.task.id = taskId)).length

def projectTokenMultiplicities (program : Program) (state : RuntimeState) :
    List (ControlPlaceId × Nat) :=
  program.controlPlaces.map fun place =>
    (place.id, tokenMultiplicity state place.id)

private def commandId : Stimulus → SemanticId
  | .startProcess id _ _ _
  | .triggerMessageStart id _ _ _ _
  | .triggerTimerStart id _ _ _
  | .completeUserTaskInstance id _ _
  | .deliverMessage id _ _
  | .fireTimer id _ _
  | .completeEffect id _ _
  | .reportEffectFailure id _ _
  | .retryIncident id _
  | .cancelIncidentProcess id _ _ => id

/-- The external waits one operation can own, so every public projection reads one inventory. -/
private structure OwnedWaitDefinitions where
  tasks : List UserTaskDefinition := []
  messages : List MessageDefinition := []
  timers : List TimerDefinition := []
  effects : List EffectDefinition := []

/-- Deliberately exhaustive with no wildcard: a new operation variant must decide here which public waits it exposes. A catch-all made a composite family's waits silently invisible to every observation instead of failing to compile. -/
private def ownedWaitDefinitions : SemanticOperation → OwnedWaitDefinitions
  | .awaitUserTask _ _ _ _ task => { tasks := [task] }
  | .awaitTimer _ _ _ _ timer => { timers := [timer] }
  | .awaitMessage _ _ _ _ message => { messages := [message] }
  | .awaitEffect _ _ _ _ effect _ => { effects := [effect] }
  | .awaitEventRace _ _ _ message timer =>
      { messages :=
          [{ elementId := message.elementId, channel := message.channel }]
        timers :=
          [{ elementId := timer.elementId, durationMs := timer.durationMs }] }
  | .awaitBoundedUserTask _ _ _ task boundaryTimer
  | .awaitMonitoredUserTask _ _ _ task boundaryTimer =>
      { tasks := [{ id := task.id, name := task.name }]
        timers :=
          [{ elementId := boundaryTimer.elementId
             durationMs := boundaryTimer.durationMs }] }
  | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ boundaryTimer _ =>
      { tasks := [{ id := task.id, name := task.name }]
        timers :=
          [{ elementId := boundaryTimer.elementId
             durationMs := boundaryTimer.durationMs }] }
  -- The deadline only. The bounded child's own task wait belongs to the child scope's `awaitUserTask`,
  -- so publishing it here would expose one task occurrence twice.
  | .enterBoundedScope _ _ _ _ _ boundaryTimer =>
      { timers :=
          [{ elementId := boundaryTimer.elementId
             durationMs := boundaryTimer.durationMs }] }
  | .initiate .. | .initiateMessage .. | .initiateTimer .. | .enterScope .. | .invokeProcess .. | .returnProcess ..
  | .duplicate .. | .synchronize .. | .mergeExclusive .. | .choose ..
  | .selectMany ..
  | .synchronizeSelected .. | .throwError .. | .reachNoneEnd ..
  | .terminateScope ..
  | .completeScope .. => {}

private def taskDefinitions (program : Program) : List UserTaskDefinition :=
  program.operations.flatMap fun operation => (ownedWaitDefinitions operation).tasks

private def timerDefinitions (program : Program) : List TimerDefinition :=
  program.operations.flatMap fun operation => (ownedWaitDefinitions operation).timers

private def messageDefinitions (program : Program) : List MessageDefinition :=
  program.operations.flatMap fun operation =>
    (ownedWaitDefinitions operation).messages

private def effectDefinitions (program : Program) : List EffectDefinition :=
  program.operations.flatMap fun operation =>
    (ownedWaitDefinitions operation).effects

def timerWaitMultiplicity (state : RuntimeState) (elementId : NodeId) : Nat :=
  (state.timerWaits.filter fun wait =>
    decide (wait.elementId = elementId)).length

def messageWaitMultiplicity (state : RuntimeState) (elementId : NodeId) : Nat :=
  (state.messageWaits.filter fun wait =>
    decide (wait.elementId = elementId)).length

def effectWaitMultiplicity (state : RuntimeState) (elementId : NodeId) : Nat :=
  (state.effectWaits.filter fun wait =>
    decide (wait.elementId = elementId)).length

def incidentWaitMultiplicity (state : RuntimeState) (elementId : NodeId) : Nat :=
  (state.effectIncidents.filter fun incident =>
    decide (incident.wait.elementId = elementId)).length

private def insertActiveWaitByElementId (wait : ActiveWait) :
    List ActiveWait → List ActiveWait
  | [] => [wait]
  | candidate :: remaining =>
      if wait.elementId.value < candidate.elementId.value then
        wait :: candidate :: remaining
      else
        candidate :: insertActiveWaitByElementId wait remaining

private def sortActiveWaitsByElementId : List ActiveWait → List ActiveWait
  | [] => []
  | wait :: remaining =>
      insertActiveWaitByElementId wait
        (sortActiveWaitsByElementId remaining)

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
  let messageWaits :=
    (messageDefinitions program).filterMap fun message =>
      let multiplicity := messageWaitMultiplicity state message.elementId
      if multiplicity = 0 then
        none
      else
        some
          { elementId := ⟨message.elementId.value⟩
            kind := .message
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
  let incidentWaits :=
    (effectDefinitions program).filterMap fun effect =>
      let multiplicity := incidentWaitMultiplicity state effect.elementId
      if multiplicity = 0 then
        none
      else
        some
          { elementId := ⟨effect.elementId.value⟩
            kind := .incident
            multiplicity }
  sortActiveWaitsByElementId taskWaits ++
    sortActiveWaitsByElementId messageWaits ++
    sortActiveWaitsByElementId timerWaits ++
    sortActiveWaitsByElementId effectWaits ++
    sortActiveWaitsByElementId incidentWaits

private def openUserTasks (program : Program) (state : RuntimeState) :
    List OpenUserTask :=
  (taskDefinitions program).flatMap fun task =>
    (state.waits.filter fun wait => decide (wait.task.id = task.id)).map fun wait =>
      { id :=
          { processInstanceId := wait.processInstanceId
            elementId := ⟨task.id.value⟩
            activation := wait.activation }
        name := task.name
        state := .active
        metadata := wait.metadata }

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

private def openMessageSubscriptions (program : Program)
    (state : RuntimeState) : List OpenMessageSubscription :=
  (messageDefinitions program).flatMap fun message =>
    (state.messageWaits.filter fun wait =>
      decide (wait.elementId = message.elementId)).map fun wait =>
        { id :=
            { processInstanceId := wait.processInstanceId
              elementId := ⟨message.elementId.value⟩
              activation := wait.activation }
          channel := wait.channel }

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

private structure SequentialMultiInstanceObservationDefinition where
  taskId : TaskDefinitionId
  taskInputName : String
  completionBindingName : String

private def sequentialMultiInstanceObservationDefinitions (program : Program) :
    List SequentialMultiInstanceObservationDefinition :=
  program.operations.filterMap fun
    | .awaitSequentialMultiInstanceUserTask _ _ _ task data _ _ _ =>
        some
          { taskId := task.id
            taskInputName := data.input.taskDataInputId
            completionBindingName := data.output.taskDataOutputId }
    | _ => none

private def openSequentialMultiInstanceIterations
    (definition : SequentialMultiInstanceObservationDefinition)
    (state : RuntimeState) (controller : SequentialMultiInstanceController) :
    List OpenSequentialMultiInstanceIteration :=
  match state.activityOccurrences.filter
      (controllerNamesActivityOccurrence controller) with
  | [record] =>
      match activityBodyTask? record, activeSnapshotItem controller with
      | some taskId, some item =>
          [{ loopCounter := completedInstanceCount controller
             taskId
             taskInput :=
               { name := definition.taskInputName
                 value := .string item }
             completionBindingName := definition.completionBindingName }]
      | _, _ => []
  | _ => []

private def openSequentialMultiInstances (program : Program) (state : RuntimeState) :
    Option (List OpenSequentialMultiInstance) :=
  let definitions := sequentialMultiInstanceObservationDefinitions program
  if definitions.isEmpty then none
  else
    some <| state.sequentialMultiInstanceControllers.flatMap fun controller =>
      match definitions.find? fun definition =>
          decide (definition.taskId.value = controller.activityElementId.value) with
      | none => []
      | some definition =>
          let activeIterations :=
            openSequentialMultiInstanceIterations definition state controller
          let completed := completedInstanceCount controller
          let active := activeIterations.length
          let generated := completed + active
          [{ id :=
               { processInstanceId := controller.processInstanceId
                 activityElementId := ⟨controller.activityElementId.value⟩
                 activation := controller.activation }
             plannedInstanceCount := controller.snapshot.length
             pendingItemCount := controller.snapshot.length - generated
             numberOfInstances := generated
             numberOfActiveInstances := active
             numberOfCompletedInstances := completed
             numberOfTerminatedInstances := 0
             activeIterations }]

private def openIncidents (program : Program) (state : RuntimeState) :
    List OpenEffectIncident :=
  (effectDefinitions program).flatMap fun effect =>
    (state.effectIncidents.filter fun incident =>
      decide (incident.wait.elementId = effect.elementId)).map fun incident =>
        { kind := .effectExecutionFailed
          id := incident.id
          effect :=
            { id := effectWaitOccurrenceId incident.wait
              descriptor := incident.wait.descriptor
              arguments := incident.wait.arguments } }

def observeStableState (program : Program) (state : RuntimeState) :
    Option StateObservation :=
  match state.control with
  | .notStarted => none
  | .running instanceId =>
      if !incidentStateAdmitted program state then none
      else
        let tasks := openUserTasks program state
        let messages := openMessageSubscriptions program state
        let incidents := openIncidents program state
        let cancellationInteractions := match incidents with
          | [incident] =>
              if (incidentProcessCancellationEligibility? program state instanceId
                  incident.id).isSome then
                [.cancelIncidentProcess instanceId incident.id]
              else []
          | _ => []
        let incidentInteractions :=
          incidents.map (fun incident => .retryIncident incident.id) ++
            cancellationInteractions
        some
          { instanceId
            status := .running
            activeWaits := activeWaits program state
            openUserTasks := tasks
            openMessageSubscriptions := messages
            openTimers := openTimers program state
            openEffects := openEffects program state
            openIncidents := incidents
            openMultiInstances := openSequentialMultiInstances program state
            variables := state.variables.process.bindings
            enabledInteractions :=
              tasks.map (fun task => .completeUserTaskInstance task.id) ++
                messages.map (fun subscription =>
                  .deliverMessage subscription.id subscription.channel) ++
                incidentInteractions
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
          openIncidents := []
          openMultiInstances := openSequentialMultiInstances program state
          variables := state.variables.process.bindings
          enabledInteractions := []
          logicalTimeMs := state.logicalTimeMs }
  | .cancelled instanceId =>
      some
        { instanceId
          status := .cancelled
          activeWaits := []
          openUserTasks := []
          openMessageSubscriptions := []
          openTimers := []
          openEffects := []
          openIncidents := []
          openMultiInstances := openSequentialMultiInstances program state
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

private def requiredObservations (program : Program) : List ObservationKind :=
  let baseline :=
    [ .deployment
  , .commandResults
  , .processStatus
  , .activeWaits
  , .openUserTasks
  , .openTimers
  , .openEffects ]
  let multiInstance :=
    if (sequentialMultiInstanceObservationDefinitions program).isEmpty then []
    else [.openMultiInstances]
  baseline ++ multiInstance ++
  [ .variables
  , .enabledInteractions
  , .logicalTime ]

private def isProcessStartStimulus : Stimulus → Bool
  | .startProcess .. | .triggerMessageStart .. | .triggerTimerStart .. => true
  | .completeUserTaskInstance .. | .deliverMessage .. | .fireTimer ..
  | .completeEffect .. | .reportEffectFailure .. | .retryIncident ..
  | .cancelIncidentProcess .. => false

/-- A scenario starts exactly once, in its first position, through one member of the closed start family. -/
def stimulusSequenceSupported : List Stimulus → Bool
  | .startProcess .. :: remaining
  | .triggerMessageStart .. :: remaining
  | .triggerTimerStart .. :: remaining =>
      remaining.all fun stimulus => !isProcessStartStimulus stimulus
  | _ => false

private def firstStimulusMatchesProgram (program : Program) :
    List Stimulus → Bool
  | stimulus :: _ => startStimulusMatchesProgram program stimulus
  | [] => false

/-- Admit only the `scenario` document kind for a structurally well-formed, profile-capability-valid program whose profile and source identity match the scenario and whose requested observations are exactly the required observation list. -/
def supportsScenario (program : Program) (scenario : Scenario) : Bool :=
  programWellFormed program &&
    programProfileCapabilitiesValid program &&
    stimulusSequenceSupported scenario.stimuli &&
    firstStimulusMatchesProgram program scenario.stimuli &&
    decide (
      scenario.kind = .scenario &&
        scenario.profile = program.identity.semanticProfile &&
        scenario.bpmn.id = program.identity.sourceId &&
        scenario.bpmn.sha256 = program.identity.sourceSha256 &&
        scenario.bpmn.sourceOverlay = program.identity.sourceOverlay &&
        scenario.observations = requiredObservations program)

/-- Run an admitted scenario with a caller-supplied bounded-closure harness limit. Failed support admission returns the unsupported deployment result without executing a stimulus. -/
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


end BpmnSemantics.SemanticProcess
