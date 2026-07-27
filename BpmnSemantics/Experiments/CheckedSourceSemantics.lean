import BpmnSemantics.SemanticProcessContract

/-! # BpmnSemantics.Experiments.CheckedSourceSemantics — direct checked-graph token game

This module transcribes the reviewed bounded capsule directly over `CheckedProcess`. Tokens retain BPMN Sequence Flow identity, and transitions select checked BPMN nodes. The module cannot depend on Semantic Process lowering or execution because it sits below that implementation in the import graph.
-/

namespace BpmnSemantics.Experiments.CheckedSourceSemantics

open BpmnSemantics
open BpmnSemantics.SemanticProcess

inductive SourceControl where
  | notStarted
  | running (instanceId : SemanticId)
  | completed (instanceId : SemanticId)
  deriving Repr, DecidableEq

structure SourceUserTaskWait where
  processInstanceId : SemanticId
  taskNodeId : NodeId
  name : Option String
  activation : Nat
  output : SequenceFlowId
  deriving Repr, DecidableEq

structure SourceTaskActivation where
  taskNodeId : NodeId
  count : Nat
  deriving Repr, DecidableEq

structure SourceRuntimeState where
  control : SourceControl
  initiationPending : Bool
  tokens : List SequenceFlowId
  waits : List SourceUserTaskWait
  activations : List SourceTaskActivation
  endOccurrences : Nat
  logicalTimeMs : Nat
  deriving Repr, DecidableEq

def initialState : SourceRuntimeState :=
  { control := .notStarted
    initiationPending := false
    tokens := []
    waits := []
    activations := []
    endOccurrences := 0
    logicalTimeMs := 0 }

def runningStartState (instanceId : SemanticId) : SourceRuntimeState :=
  { initialState with
    control := .running instanceId
    initiationPending := true }

def CheckedNode.id : CheckedNode → NodeId
  | .noneStartEvent id
  | .userTask id _
  | .intermediateCatchTimerEvent id _
  | .serviceTask id _ _ _ _
  | .parallelGateway id _
  | .noneEndEvent id => id

def incomingFlowIds (source : CheckedProcess) (nodeId : NodeId) :
    List SequenceFlowId :=
  source.sequenceFlows.filterMap fun flow =>
    if flow.targetId = nodeId then some flow.id else none

def outgoingFlowIds (source : CheckedProcess) (nodeId : NodeId) :
    List SequenceFlowId :=
  source.sequenceFlows.filterMap fun flow =>
    if flow.sourceId = nodeId then some flow.id else none

def firstFlowId (flows : List SequenceFlowId) : SequenceFlowId :=
  flows.head?.getD ⟨""⟩

def tokenMultiplicity (state : SourceRuntimeState)
    (flowId : SequenceFlowId) : Nat :=
  (state.tokens.filter fun token => decide (token = flowId)).length

def hasToken (state : SourceRuntimeState) (flowId : SequenceFlowId) : Bool :=
  tokenMultiplicity state flowId > 0

def removeToken : List SequenceFlowId → SequenceFlowId →
    List SequenceFlowId
  | [], _ => []
  | token :: rest, flowId =>
      if token = flowId then rest else token :: removeToken rest flowId

def removeTokens (tokens : List SequenceFlowId)
    (flows : List SequenceFlowId) : List SequenceFlowId :=
  flows.foldl removeToken tokens

def addTokens (tokens : List SequenceFlowId)
    (flows : List SequenceFlowId) : List SequenceFlowId :=
  flows.foldr List.cons tokens

def activationCount (state : SourceRuntimeState) (nodeId : NodeId) : Nat :=
  (state.activations.find? fun activation =>
    decide (activation.taskNodeId = nodeId)).map (·.count) |>.getD 0

def setActivationCount (activations : List SourceTaskActivation)
    (nodeId : NodeId) (count : Nat) : List SourceTaskActivation :=
  { taskNodeId := nodeId, count } ::
    activations.filter fun activation =>
      decide (activation.taskNodeId ≠ nodeId)

def activateUserTask (state : SourceRuntimeState) (instanceId : SemanticId)
    (nodeId : NodeId) (name : Option String)
    (input output : SequenceFlowId) : SourceRuntimeState :=
  let activation := activationCount state nodeId + 1
  { state with
    tokens := removeToken state.tokens input
    waits :=
      { processInstanceId := instanceId
        taskNodeId := nodeId
        name
        activation
        output } :: state.waits
    activations :=
      setActivationCount state.activations nodeId activation }

def duplicateToken (state : SourceRuntimeState) (input : SequenceFlowId)
    (outputs : List SequenceFlowId) : SourceRuntimeState :=
  { state with
    tokens := addTokens (removeToken state.tokens input) outputs }

def synchronizeTokens (state : SourceRuntimeState)
    (inputs : List SequenceFlowId) (output : SequenceFlowId) :
    SourceRuntimeState :=
  { state with
    tokens := output :: removeTokens state.tokens inputs }

def terminateToken (state : SourceRuntimeState) (instanceId : SemanticId)
    (input : SequenceFlowId) : SourceRuntimeState :=
  let tokens := removeToken state.tokens input
  let completed :=
    tokens.isEmpty && state.waits.isEmpty && !state.initiationPending
  { state with
    control := if completed then .completed instanceId else state.control
    tokens
    endOccurrences := state.endOccurrences + 1 }

/-- Direct checked-node relation in BPMN vocabulary. -/
inductive NodeStep (source : CheckedProcess) :
    CheckedNode → SourceRuntimeState → SourceRuntimeState → Prop where
  | noneStartEvent (id : NodeId) (state : SourceRuntimeState)
      (pending : state.initiationPending = true) :
      NodeStep source (.noneStartEvent id) state
        { state with
          initiationPending := false
          tokens := firstFlowId (outgoingFlowIds source id) :: state.tokens }
  | userTask (id : NodeId) (name : Option String)
      (state : SourceRuntimeState) (instanceId : SemanticId)
      (running : state.control = .running instanceId)
      (enabled :
        hasToken state (firstFlowId (incomingFlowIds source id)) = true) :
      NodeStep source (.userTask id name) state
        (activateUserTask state instanceId id name
          (firstFlowId (incomingFlowIds source id))
          (firstFlowId (outgoingFlowIds source id)))
  | parallelFork (id : NodeId) (state : SourceRuntimeState)
      (enabled :
        hasToken state (firstFlowId (incomingFlowIds source id)) = true) :
      NodeStep source (.parallelGateway id .diverging) state
        (duplicateToken state
          (firstFlowId (incomingFlowIds source id))
          (outgoingFlowIds source id))
  | parallelJoin (id : NodeId) (state : SourceRuntimeState)
      (enabled : (incomingFlowIds source id).all (hasToken state) = true) :
      NodeStep source (.parallelGateway id .converging) state
        (synchronizeTokens state
          (incomingFlowIds source id)
          (firstFlowId (outgoingFlowIds source id)))
  | noneEndEvent (id : NodeId) (state : SourceRuntimeState)
      (instanceId : SemanticId)
      (running : state.control = .running instanceId)
      (enabled :
        hasToken state (firstFlowId (incomingFlowIds source id)) = true) :
      NodeStep source (.noneEndEvent id) state
        (terminateToken state instanceId
          (firstFlowId (incomingFlowIds source id)))

/-- Executable selector for one checked node. It does not select a node by collection order. -/
def fireNode? (source : CheckedProcess) (node : CheckedNode)
    (state : SourceRuntimeState) : Option SourceRuntimeState :=
  match node with
  | .noneStartEvent id =>
      if state.initiationPending then
        some
          { state with
            initiationPending := false
            tokens :=
              firstFlowId (outgoingFlowIds source id) :: state.tokens }
      else none
  | .userTask id name =>
      match state.control with
      | .running instanceId =>
          let input := firstFlowId (incomingFlowIds source id)
          if hasToken state input then
            some
              (activateUserTask state instanceId id name input
                (firstFlowId (outgoingFlowIds source id)))
          else none
      | .notStarted
      | .completed _ => none
  | .intermediateCatchTimerEvent _ _ => none
  | .serviceTask _ _ _ _ _ => none
  | .parallelGateway id .diverging =>
      let input := firstFlowId (incomingFlowIds source id)
      if hasToken state input then
        some
          (duplicateToken state input (outgoingFlowIds source id))
      else none
  | .parallelGateway id .converging =>
      let inputs := incomingFlowIds source id
      if inputs.all (hasToken state) then
        some
          (synchronizeTokens state inputs
            (firstFlowId (outgoingFlowIds source id)))
      else none
  | .noneEndEvent id =>
      match state.control with
      | .running instanceId =>
          let input := firstFlowId (incomingFlowIds source id)
          if hasToken state input then
            some (terminateToken state instanceId input)
          else none
      | .notStarted
      | .completed _ => none

theorem fireNode_sound (source : CheckedProcess) (node : CheckedNode)
    (before after : SourceRuntimeState)
    (result : fireNode? source node before = some after) :
    NodeStep source node before after := by
  cases node with
  | noneStartEvent id =>
      by_cases pending : before.initiationPending = true
      · simp [fireNode?, pending] at result
        subst after
        exact .noneStartEvent id before pending
      · simp [fireNode?, pending] at result
  | userTask id name =>
      cases controlEq : before.control with
      | notStarted => simp [fireNode?, controlEq] at result
      | completed instanceId => simp [fireNode?, controlEq] at result
      | running instanceId =>
          by_cases enabled :
              hasToken before (firstFlowId (incomingFlowIds source id)) = true
          · simp [fireNode?, controlEq, enabled] at result
            subst after
            exact .userTask id name before instanceId controlEq enabled
          · simp [fireNode?, controlEq, enabled] at result
  | intermediateCatchTimerEvent id durationLiteral =>
      simp [fireNode?] at result
  | serviceTask id implementation delegateExpressionNamespace
      delegateExpressionValue asyncBeforeNamespace asyncBeforeValue =>
      simp [fireNode?] at result
  | parallelGateway id direction =>
      cases direction with
      | diverging =>
          by_cases enabled :
              hasToken before (firstFlowId (incomingFlowIds source id)) = true
          · simp [fireNode?, enabled] at result
            subst after
            exact .parallelFork id before enabled
          · simp [fireNode?, enabled] at result
      | converging =>
          by_cases enabled :
              (incomingFlowIds source id).all (hasToken before) = true
          · simp [fireNode?, enabled] at result
            subst after
            exact .parallelJoin id before enabled
          · simp [fireNode?, enabled] at result
  | noneEndEvent id =>
      cases controlEq : before.control with
      | notStarted => simp [fireNode?, controlEq] at result
      | completed instanceId => simp [fireNode?, controlEq] at result
      | running instanceId =>
          by_cases enabled :
              hasToken before (firstFlowId (incomingFlowIds source id)) = true
          · simp [fireNode?, controlEq, enabled] at result
            subst after
            exact .noneEndEvent id before instanceId controlEq enabled
          · simp [fireNode?, controlEq, enabled] at result

def completeUserTask (state : SourceRuntimeState)
    (processInstanceId : SemanticId) (nodeId : NodeId)
    (activation : Nat) : Option SourceRuntimeState :=
  match state.waits.find? fun wait =>
      decide (
        wait.processInstanceId = processInstanceId &&
          wait.taskNodeId = nodeId &&
          wait.activation = activation) with
  | none => none
  | some wait =>
      some
        { state with
          waits := state.waits.erase wait
          tokens := wait.output :: state.tokens }

structure ExternalAdmission where
  outcome : CommandOutcome
  state : SourceRuntimeState
  deriving Repr, DecidableEq

def admitStimulus (source : CheckedProcess) (state : SourceRuntimeState) :
    Stimulus → ExternalAdmission
  | .startProcess _ processId instanceId =>
      match state.control with
      | .notStarted =>
          if source.processId.value = processId.value then
            { outcome := .committed, state := runningStartState instanceId }
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
  | .fireTimer _ _ _ => { outcome := .unsupported, state }
  | .completeEffect _ _ _ => { outcome := .unsupported, state }

def enabledTransitions (source : CheckedProcess)
    (state : SourceRuntimeState) :
    List (CheckedNode × SourceRuntimeState) :=
  source.nodes.filterMap fun node =>
    (fireNode? source node state).map fun successor => (node, successor)

def independentParallelTaskChoices (source : CheckedProcess) :
    List (CheckedNode × SourceRuntimeState) → Bool
  | [(.userTask idA _, _), (.userTask idB _, _)] =>
      decide (
        firstFlowId (incomingFlowIds source idA) ≠
            firstFlowId (incomingFlowIds source idB) ∧
          firstFlowId (outgoingFlowIds source idA) ≠
            firstFlowId (outgoingFlowIds source idB) ∧
          idA ≠ idB)
  | _ => false

structure ClosureResult where
  state : SourceRuntimeState
  hitBound : Bool
  ambiguousChoice : Bool
  deriving Repr, DecidableEq

def closeSupported : Nat → CheckedProcess → SourceRuntimeState →
    ClosureResult
  | 0, source, state =>
      match enabledTransitions source state with
      | [] => { state, hitBound := false, ambiguousChoice := false }
      | [_]
      | _ :: _ :: _ =>
          { state, hitBound := true, ambiguousChoice := false }
  | fuel + 1, source, state =>
      match enabledTransitions source state with
      | [] => { state, hitBound := false, ambiguousChoice := false }
      | [(_, successor)] => closeSupported fuel source successor
      | first :: second :: remaining =>
          let transitions := first :: second :: remaining
          if independentParallelTaskChoices source transitions then
            closeSupported fuel source first.2
          else
            { state, hitBound := false, ambiguousChoice := true }

structure StimulusResult where
  outcome : CommandOutcome
  state : SourceRuntimeState
  internalStepBoundExceeded : Bool
  ambiguousInternalChoice : Bool
  deriving Repr, DecidableEq

def applyStimulus (closureLimit : Nat) (source : CheckedProcess)
    (state : SourceRuntimeState) (stimulus : Stimulus) : StimulusResult :=
  let admission := admitStimulus source state stimulus
  match admission.outcome with
  | .committed =>
      let closure := closeSupported closureLimit source admission.state
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
          openTimers := []
          openEffects := []
          variables := []
          enabledInteractions := []
          logicalTimeMs := state.logicalTimeMs }

def commandId : Stimulus → SemanticId
  | .startProcess id _ _
  | .completeUserTaskInstance id _
  | .fireTimer id _ _
  | .completeEffect id _ _ => id

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
