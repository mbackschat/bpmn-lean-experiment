import BpmnSemantics.SemanticProcessContract

/-! # BpmnSemantics.SemanticProcess — bounded lowering and operational semantics

This module implements the project-owned checked BPMN graph to Semantic Process lowering and the first generic token semantics. Runtime execution selects an operation by explicit semantic input; definition order is therefore not an implicit scheduler.

`lowerCheckedProcess` is total as required by the reviewed preservation proposition, but only `checkedWellFormed` inputs are admitted. Its arbitrary result outside that domain is never a semantic outcome.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def CheckedNode.id : CheckedNode → NodeId
  | .noneStartEvent id
  | .userTask id _
  | .intermediateCatchTimerEvent id _
  | .parallelGateway id _
  | .noneEndEvent id => id

def CheckedSequenceFlow.toControlPlace (flow : CheckedSequenceFlow) :
    ControlPlace :=
  { id := ⟨"place:" ++ flow.id.value⟩
    origin := { elementId := flow.id } }

def nodeOperationId (id : NodeId) : OperationId :=
  ⟨"operation:" ++ id.value⟩

def flowControlPlaceId (id : SequenceFlowId) : ControlPlaceId :=
  ⟨"place:" ++ id.value⟩

private def incomingPlaces (source : CheckedProcess) (nodeId : NodeId) :
    List ControlPlaceId :=
  source.sequenceFlows.filterMap fun flow =>
    if flow.targetId = nodeId then
      some (flowControlPlaceId flow.id)
    else
      none

private def outgoingPlaces (source : CheckedProcess) (nodeId : NodeId) :
    List ControlPlaceId :=
  source.sequenceFlows.filterMap fun flow =>
    if flow.sourceId = nodeId then
      some (flowControlPlaceId flow.id)
    else
      none

private def firstPlace (places : List ControlPlaceId) : ControlPlaceId :=
  places.head?.getD ⟨""⟩

private def lowerNode (source : CheckedProcess) : CheckedNode → SemanticOperation
  | .noneStartEvent id =>
      .initiate
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (outgoingPlaces source id))
  | .userTask id name =>
      .awaitUserTask
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { id := ⟨id.value⟩, name }
  | .intermediateCatchTimerEvent id durationLiteral =>
      .awaitTimer
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (firstPlace (outgoingPlaces source id))
        { elementId := id
          durationMs := if durationLiteral = "PT1S" then 1000 else 0 }
  | .parallelGateway id .diverging =>
      .duplicate
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))
        (outgoingPlaces source id)
  | .parallelGateway id .converging =>
      .synchronize
        (nodeOperationId id)
        { elementId := id }
        (incomingPlaces source id)
        (firstPlace (outgoingPlaces source id))
  | .noneEndEvent id =>
      .terminate
        (nodeOperationId id)
        { elementId := id }
        (firstPlace (incomingPlaces source id))

/-- Canonical lowering over the current checked graph. Meaning is claimed only under `checkedWellFormed`. -/
def lowerCheckedProcess (source : CheckedProcess) : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := source.identity.semanticProfile
        sourceId := source.identity.sourceId
        sourceSha256 := source.identity.sourceSha256 }
    processId := source.processId
    controlPlaces := source.sequenceFlows.map CheckedSequenceFlow.toControlPlace
    operations := source.nodes.map (lowerNode source) }

theorem lower_preserves_definition_identity (source : CheckedProcess) :
    (lowerCheckedProcess source).identity.semanticProfile =
        source.identity.semanticProfile ∧
      (lowerCheckedProcess source).identity.sourceId =
        source.identity.sourceId ∧
      (lowerCheckedProcess source).identity.sourceSha256 =
        source.identity.sourceSha256 ∧
      (lowerCheckedProcess source).processId = source.processId := by
  simp [lowerCheckedProcess]

theorem lower_preserves_sequence_flow_origins (source : CheckedProcess) :
    (lowerCheckedProcess source).controlPlaces.map (·.origin.elementId) =
      source.sequenceFlows.map (·.id) := by
  simp [lowerCheckedProcess, CheckedSequenceFlow.toControlPlace]

private def strictlySortedStrings : List String → Bool
  | []
  | [_] => true
  | left :: right :: rest =>
      decide (left < right) && strictlySortedStrings (right :: rest)

private def nonempty (value : String) : Bool :=
  !value.isEmpty

private def lowercaseHexSha256 (value : String) : Bool :=
  value.length = 64 &&
    value.toList.all fun character =>
      "0123456789abcdef".toList.contains character

private def incomingCount (flows : List CheckedSequenceFlow) (id : NodeId) : Nat :=
  (flows.filter fun flow => decide (flow.targetId = id)).length

private def outgoingCount (flows : List CheckedSequenceFlow) (id : NodeId) : Nat :=
  (flows.filter fun flow => decide (flow.sourceId = id)).length

private def hasFlow (flows : List CheckedSequenceFlow) (source target : NodeId) :
    Bool :=
  flows.any fun flow =>
    decide (flow.sourceId = source && flow.targetId = target)

private def nodeExists (nodes : List CheckedNode) (id : NodeId) : Bool :=
  nodes.any fun node => decide (node.id = id)

private def checkedNodeArityValid (flows : List CheckedSequenceFlow) :
    CheckedNode → Bool
  | .noneStartEvent id =>
      incomingCount flows id = 0 && outgoingCount flows id = 1
  | .userTask id _ =>
      incomingCount flows id = 1 && outgoingCount flows id = 1
  | .intermediateCatchTimerEvent id durationLiteral =>
      durationLiteral = "PT1S" &&
        incomingCount flows id = 1 && outgoingCount flows id = 1
  | .parallelGateway id .diverging =>
      incomingCount flows id = 1 && outgoingCount flows id ≥ 2
  | .parallelGateway id .converging =>
      incomingCount flows id ≥ 2 && outgoingCount flows id = 1
  | .noneEndEvent id =>
      incomingCount flows id = 1 && outgoingCount flows id = 0

private def startIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .noneStartEvent id => some id
    | _ => none

private def taskIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .userTask id _ => some id
    | _ => none

private def timerIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .intermediateCatchTimerEvent id _ => some id
    | _ => none

private def divergingGatewayIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .parallelGateway id .diverging => some id
    | _ => none

private def convergingGatewayIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .parallelGateway id .converging => some id
    | _ => none

private def endIds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .noneEndEvent id => some id
    | _ => none

private def boundedTopology (source : CheckedProcess) : Bool :=
  match
      startIds source.nodes,
      taskIds source.nodes,
      timerIds source.nodes,
      divergingGatewayIds source.nodes,
      convergingGatewayIds source.nodes,
      endIds source.nodes with
  | [start], [task], [], [], [], [endNode] =>
      source.nodes.length = 3 &&
        source.sequenceFlows.length = 2 &&
        hasFlow source.sequenceFlows start task &&
        hasFlow source.sequenceFlows task endNode
  | [start], [], [timer], [], [], [endNode] =>
      source.nodes.length = 3 &&
        source.sequenceFlows.length = 2 &&
        hasFlow source.sequenceFlows start timer &&
        hasFlow source.sequenceFlows timer endNode
  | [start], [taskA, taskB], [], [fork], [join], [endNode] =>
      source.nodes.length = 6 &&
        source.sequenceFlows.length = 6 &&
        hasFlow source.sequenceFlows start fork &&
        hasFlow source.sequenceFlows fork taskA &&
        hasFlow source.sequenceFlows fork taskB &&
        hasFlow source.sequenceFlows taskA join &&
        hasFlow source.sequenceFlows taskB join &&
        hasFlow source.sequenceFlows join endNode
  | _, _, _, _, _, _ => false

/-- Independent static admission for the current sequential and balanced parallel checked graphs. -/
def checkedWellFormed (source : CheckedProcess) : Bool :=
  nonempty source.identity.semanticProfile.value &&
    nonempty source.identity.sourceId.value &&
    lowercaseHexSha256 source.identity.sourceSha256 &&
    nonempty source.processId.value &&
    strictlySortedStrings (source.nodes.map fun node => node.id.value) &&
    strictlySortedStrings (source.sequenceFlows.map fun flow => flow.id.value) &&
    source.nodes.all fun node => nonempty node.id.value &&
    source.sequenceFlows.all fun flow =>
      nonempty flow.id.value &&
        nodeExists source.nodes flow.sourceId &&
        nodeExists source.nodes flow.targetId &&
        decide (flow.sourceId ≠ flow.targetId) &&
    source.nodes.all (checkedNodeArityValid source.sequenceFlows) &&
    boundedTopology source

def SemanticOperation.id : SemanticOperation → OperationId
  | .initiate id _ _
  | .awaitUserTask id _ _ _ _
  | .awaitTimer id _ _ _ _
  | .duplicate id _ _ _
  | .synchronize id _ _ _
  | .terminate id _ _ => id

private def placeExists (places : List ControlPlace) (id : ControlPlaceId) : Bool :=
  places.any fun place => decide (place.id = id)

private def sortedDistinctPlaceIds (ids : List ControlPlaceId) : Bool :=
  strictlySortedStrings (ids.map fun id => id.value)

private def operationWellFormed (places : List ControlPlace) :
    SemanticOperation → Bool
  | .initiate id origin output =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        placeExists places output
  | .awaitUserTask id origin input output task =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty task.id.value &&
        decide (origin.elementId.value = task.id.value) &&
        placeExists places input &&
        placeExists places output
  | .awaitTimer id origin input output timer =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        nonempty timer.elementId.value &&
        decide (origin.elementId = timer.elementId) &&
        timer.durationMs = 1000 &&
        placeExists places input &&
        placeExists places output
  | .duplicate id origin input outputs =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        placeExists places input &&
        outputs.length ≥ 2 &&
        sortedDistinctPlaceIds outputs &&
        outputs.all (placeExists places)
  | .synchronize id origin inputs output =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        inputs.length ≥ 2 &&
        sortedDistinctPlaceIds inputs &&
        inputs.all (placeExists places) &&
        placeExists places output
  | .terminate id origin input =>
      nonempty id.value &&
        nonempty origin.elementId.value &&
        placeExists places input

private def isInitiate : SemanticOperation → Bool
  | .initiate .. => true
  | _ => false

/-- Structural validation for a decoded Semantic Process program, independent of checked-source equality. -/
def programWellFormed (program : Program) : Bool :=
  nonempty program.identity.semanticProfile.value &&
    nonempty program.identity.sourceId.value &&
    lowercaseHexSha256 program.identity.sourceSha256 &&
    nonempty program.processId.value &&
    !program.controlPlaces.isEmpty &&
    !program.operations.isEmpty &&
    strictlySortedStrings (program.controlPlaces.map fun place => place.id.value) &&
    strictlySortedStrings (program.operations.map fun operation => operation.id.value) &&
    program.controlPlaces.all fun place =>
      nonempty place.id.value && nonempty place.origin.elementId.value &&
    program.operations.all (operationWellFormed program.controlPlaces) &&
    (program.operations.filter isInitiate).length = 1

/-- Artifact admission requires both independent validators and exact canonical lowering equality. -/
def definitionBindingValid (source : CheckedProcess) (program : Program) : Bool :=
  checkedWellFormed source &&
    programWellFormed program &&
    decide (lowerCheckedProcess source = program)

inductive ProcessControl where
  | notStarted
  | running (instanceId : SemanticId)
  | completed (instanceId : SemanticId)
  deriving Repr, DecidableEq

structure UserTaskWait where
  processInstanceId : SemanticId
  task : UserTaskDefinition
  activation : Nat
  output : ControlPlaceId
  deriving Repr, DecidableEq

structure TimerWait where
  processInstanceId : SemanticId
  elementId : NodeId
  activation : Nat
  deadlineMs : Nat
  output : ControlPlaceId
  deriving Repr, DecidableEq

structure TaskActivation where
  taskId : TaskDefinitionId
  count : Nat
  deriving Repr, DecidableEq

structure TimerActivation where
  elementId : NodeId
  count : Nat
  deriving Repr, DecidableEq

structure RuntimeState where
  control : ProcessControl
  initiationPending : Bool
  tokens : List ControlPlaceId
  waits : List UserTaskWait
  timerWaits : List TimerWait
  activations : List TaskActivation
  timerActivations : List TimerActivation
  endOccurrences : Nat
  logicalTimeMs : Nat
  deriving Repr, DecidableEq

def initialState : RuntimeState :=
  { control := .notStarted
    initiationPending := false
    tokens := []
    waits := []
    timerWaits := []
    activations := []
    timerActivations := []
    endOccurrences := 0
    logicalTimeMs := 0 }

def runningStartState (instanceId : SemanticId) : RuntimeState :=
  { initialState with
    control := .running instanceId
    initiationPending := true }

def tokenMultiplicity (state : RuntimeState) (place : ControlPlaceId) : Nat :=
  (state.tokens.filter fun token => decide (token = place)).length

def hasToken (state : RuntimeState) (place : ControlPlaceId) : Bool :=
  tokenMultiplicity state place > 0

private def removeToken : List ControlPlaceId → ControlPlaceId →
    List ControlPlaceId
  | [], _ => []
  | token :: rest, place =>
      if token = place then rest else token :: removeToken rest place

private def removeTokens (tokens : List ControlPlaceId)
    (places : List ControlPlaceId) : List ControlPlaceId :=
  places.foldl removeToken tokens

private def addTokens (tokens : List ControlPlaceId)
    (places : List ControlPlaceId) : List ControlPlaceId :=
  places.foldr List.cons tokens

private def activationCount (state : RuntimeState) (taskId : TaskDefinitionId) :
    Nat :=
  (state.activations.find? fun activation =>
    decide (activation.taskId = taskId)).map (·.count) |>.getD 0

private def setActivationCount (activations : List TaskActivation)
    (taskId : TaskDefinitionId) (count : Nat) : List TaskActivation :=
  { taskId, count } ::
    activations.filter fun activation => decide (activation.taskId ≠ taskId)

private def timerActivationCount (state : RuntimeState) (elementId : NodeId) :
    Nat :=
  (state.timerActivations.find? fun activation =>
    decide (activation.elementId = elementId)).map (·.count) |>.getD 0

private def setTimerActivationCount (activations : List TimerActivation)
    (elementId : NodeId) (count : Nat) : List TimerActivation :=
  { elementId, count } ::
    activations.filter fun activation =>
      decide (activation.elementId ≠ elementId)

private def activateUserTask (state : RuntimeState) (instanceId : SemanticId)
    (input output : ControlPlaceId) (task : UserTaskDefinition) : RuntimeState :=
  let activation := activationCount state task.id + 1
  { state with
    tokens := removeToken state.tokens input
    waits :=
      { processInstanceId := instanceId
        task
        activation
        output } :: state.waits
    activations := setActivationCount state.activations task.id activation }

private def activateTimer (state : RuntimeState) (instanceId : SemanticId)
    (input output : ControlPlaceId) (timer : TimerDefinition) : RuntimeState :=
  let activation := timerActivationCount state timer.elementId + 1
  { state with
    tokens := removeToken state.tokens input
    timerWaits :=
      { processInstanceId := instanceId
        elementId := timer.elementId
        activation
        deadlineMs := state.logicalTimeMs + timer.durationMs
        output } :: state.timerWaits
    timerActivations :=
      setTimerActivationCount state.timerActivations timer.elementId activation }

private def duplicateToken (state : RuntimeState) (input : ControlPlaceId)
    (outputs : List ControlPlaceId) : RuntimeState :=
  { state with
    tokens := addTokens (removeToken state.tokens input) outputs }

private def synchronizeTokens (state : RuntimeState)
    (inputs : List ControlPlaceId) (output : ControlPlaceId) : RuntimeState :=
  { state with
    tokens := output :: removeTokens state.tokens inputs }

private def terminateToken (state : RuntimeState) (instanceId : SemanticId)
    (input : ControlPlaceId) : RuntimeState :=
  let tokens := removeToken state.tokens input
  let completed :=
    tokens.isEmpty && state.waits.isEmpty && state.timerWaits.isEmpty &&
      !state.initiationPending
  { state with
    control := if completed then .completed instanceId else state.control
    tokens
    endOccurrences := state.endOccurrences + 1 }

/-- Declarative transition relation for one explicitly selected Semantic Process operation. -/
inductive OperationStep : SemanticOperation → RuntimeState → RuntimeState → Prop where
  | initiate (id origin output) (state : RuntimeState)
      (pending : state.initiationPending = true) :
      OperationStep
        (.initiate id origin output)
        state
        { state with
          initiationPending := false
          tokens := output :: state.tokens }
  | awaitUserTask (id origin input output task) (state : RuntimeState)
      (instanceId : SemanticId)
      (running : state.control = .running instanceId)
      (enabled : hasToken state input = true) :
      OperationStep
        (.awaitUserTask id origin input output task)
        state
        (activateUserTask state instanceId input output task)
  | awaitTimer (id origin input output timer) (state : RuntimeState)
      (instanceId : SemanticId)
      (running : state.control = .running instanceId)
      (enabled : hasToken state input = true) :
      OperationStep
        (.awaitTimer id origin input output timer)
        state
        (activateTimer state instanceId input output timer)
  | duplicate (id origin input outputs) (state : RuntimeState)
      (enabled : hasToken state input = true) :
      OperationStep
        (.duplicate id origin input outputs)
        state
        (duplicateToken state input outputs)
  | synchronize (id origin inputs output) (state : RuntimeState)
      (enabled : inputs.all (hasToken state) = true) :
      OperationStep
        (.synchronize id origin inputs output)
        state
        (synchronizeTokens state inputs output)
  | terminate (id origin input) (state : RuntimeState)
      (instanceId : SemanticId)
      (running : state.control = .running instanceId)
      (enabled : hasToken state input = true) :
      OperationStep
        (.terminate id origin input)
        state
        (terminateToken state instanceId input)

/-- Executable transition for one operation. It performs no operation selection. -/
def fire? (operation : SemanticOperation) (state : RuntimeState) :
    Option RuntimeState :=
  match operation with
  | .initiate _ _ output =>
      if state.initiationPending then
        some
          { state with
            initiationPending := false
            tokens := output :: state.tokens }
      else
        none
  | .awaitUserTask _ _ input output task =>
      match state.control with
      | .running instanceId =>
          if hasToken state input then
            some (activateUserTask state instanceId input output task)
          else
            none
      | .notStarted
      | .completed _ => none
  | .awaitTimer _ _ input output timer =>
      match state.control with
      | .running instanceId =>
          if hasToken state input then
            some (activateTimer state instanceId input output timer)
          else
            none
      | .notStarted
      | .completed _ => none
  | .duplicate _ _ input outputs =>
      if hasToken state input then
        some (duplicateToken state input outputs)
      else
        none
  | .synchronize _ _ inputs output =>
      if inputs.all (hasToken state) then
        some (synchronizeTokens state inputs output)
      else
        none
  | .terminate _ _ input =>
      match state.control with
      | .running instanceId =>
          if hasToken state input then
            some (terminateToken state instanceId input)
          else
            none
      | .notStarted
      | .completed _ => none

theorem fire_sound (operation : SemanticOperation)
    (before after : RuntimeState)
    (result : fire? operation before = some after) :
    OperationStep operation before after := by
  cases operation with
  | initiate id origin output =>
      by_cases pending : before.initiationPending = true
      · simp [fire?, pending] at result
        subst after
        exact .initiate id origin output before pending
      · simp [fire?, pending] at result
  | awaitUserTask id origin input output task =>
      cases controlEq : before.control with
      | notStarted => simp [fire?, controlEq] at result
      | completed instanceId => simp [fire?, controlEq] at result
      | running instanceId =>
          by_cases enabled : hasToken before input = true
          · simp [fire?, controlEq, enabled] at result
            subst after
            exact .awaitUserTask id origin input output task before
              instanceId controlEq enabled
          · simp [fire?, controlEq, enabled] at result
  | awaitTimer id origin input output timer =>
      cases controlEq : before.control with
      | notStarted => simp [fire?, controlEq] at result
      | completed instanceId => simp [fire?, controlEq] at result
      | running instanceId =>
          by_cases enabled : hasToken before input = true
          · simp [fire?, controlEq, enabled] at result
            subst after
            exact .awaitTimer id origin input output timer before
              instanceId controlEq enabled
          · simp [fire?, controlEq, enabled] at result
  | duplicate id origin input outputs =>
      by_cases enabled : hasToken before input = true
      · simp [fire?, enabled] at result
        subst after
        exact .duplicate id origin input outputs before enabled
      · simp [fire?, enabled] at result
  | synchronize id origin inputs output =>
      by_cases enabled : inputs.all (hasToken before) = true
      · simp [fire?, enabled] at result
        subst after
        exact .synchronize id origin inputs output before enabled
      · simp [fire?, enabled] at result
  | terminate id origin input =>
      cases controlEq : before.control with
      | notStarted => simp [fire?, controlEq] at result
      | completed instanceId => simp [fire?, controlEq] at result
      | running instanceId =>
          by_cases enabled : hasToken before input = true
          · simp [fire?, controlEq, enabled] at result
            subst after
            exact .terminate id origin input before instanceId controlEq enabled
          · simp [fire?, controlEq, enabled] at result

/-- Program relation keeps the explicit selected operation identity as semantic input. -/
def ProgramStep (program : Program) (before : RuntimeState)
    (choice : OperationId) (after : RuntimeState) : Prop :=
  ∃ operation,
    operation ∈ program.operations ∧
      operation.id = choice ∧
        OperationStep operation before after

/-- Select and execute exactly the operation named by the semantic input. -/
def step (program : Program) (state : RuntimeState) (choice : OperationId) :
    Option RuntimeState :=
  match program.operations.find? fun operation =>
      decide (operation.id = choice) with
  | none => none
  | some operation => fire? operation state

/-- Every evaluator-produced transition is permitted by the declarative program relation. -/
theorem step_sound :
    Obligations.evaluator_sound ProgramStep step := by
  intro program state choice successor result
  unfold step at result
  generalize selectedEq :
      program.operations.find? (fun operation =>
        decide (operation.id = choice)) = selected at result
  cases selected with
  | none => simp at result
  | some operation =>
      refine ⟨operation, List.mem_of_find?_eq_some selectedEq, ?_, ?_⟩
      · have selectedMatches : decide (operation.id = choice) = true :=
          List.find?_some
            (p := fun candidate : SemanticOperation =>
              decide (candidate.id = choice))
            selectedEq
        exact of_decide_eq_true selectedMatches
      · exact fire_sound operation state successor result

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

private def commandId : Stimulus → SemanticId
  | .startProcess id _ _
  | .completeUserTaskInstance id _
  | .fireTimer id _ _ => id

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

private def taskDefinitions (program : Program) : List UserTaskDefinition :=
  program.operations.filterMap fun
    | .awaitUserTask _ _ _ _ task => some task
    | _ => none

private def timerDefinitions (program : Program) : List TimerDefinition :=
  program.operations.filterMap fun
    | .awaitTimer _ _ _ _ timer => some timer
    | _ => none

def timerWaitMultiplicity (state : RuntimeState) (elementId : NodeId) : Nat :=
  (state.timerWaits.filter fun wait =>
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
  taskWaits ++ timerWaits

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

private def observeStableState (program : Program) (state : RuntimeState) :
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

def sequentialCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"cibseven-2.2.0-user-task-draft"⟩
        sourceId := ⟨"sequential-user-task-process"⟩
        sourceSha256 :=
          "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d" }
    processId := ⟨"Process_SequentialUserTask"⟩
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_1"⟩
      , .noneStartEvent ⟨"StartEvent_1"⟩
      , .userTask ⟨"UserTask_Approve"⟩ (some "Approve") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_StartToTask"⟩
          sourceId := ⟨"StartEvent_1"⟩
          targetId := ⟨"UserTask_Approve"⟩ }
      , { id := ⟨"Flow_TaskToEnd"⟩
          sourceId := ⟨"UserTask_Approve"⟩
          targetId := ⟨"EndEvent_1"⟩ } ] }

def sequentialProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"cibseven-2.2.0-user-task-draft"⟩
        sourceId := ⟨"sequential-user-task-process"⟩
        sourceSha256 :=
          "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d" }
    processId := ⟨"Process_SequentialUserTask"⟩
    controlPlaces :=
      [ { id := ⟨"place:Flow_StartToTask"⟩
          origin := { elementId := ⟨"Flow_StartToTask"⟩ } }
      , { id := ⟨"place:Flow_TaskToEnd"⟩
          origin := { elementId := ⟨"Flow_TaskToEnd"⟩ } } ]
    operations :=
      [ .terminate
          ⟨"operation:EndEvent_1"⟩
          { elementId := ⟨"EndEvent_1"⟩ }
          ⟨"place:Flow_TaskToEnd"⟩
      , .initiate
          ⟨"operation:StartEvent_1"⟩
          { elementId := ⟨"StartEvent_1"⟩ }
          ⟨"place:Flow_StartToTask"⟩
      , .awaitUserTask
          ⟨"operation:UserTask_Approve"⟩
          { elementId := ⟨"UserTask_Approve"⟩ }
          ⟨"place:Flow_StartToTask"⟩
          ⟨"place:Flow_TaskToEnd"⟩
          { id := ⟨"UserTask_Approve"⟩, name := some "Approve" } ] }

def parallelCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"parallel-fork-join-draft"⟩
        sourceId := ⟨"parallel-two-user-tasks-process"⟩
        sourceSha256 :=
          "e68382dfa9125fbecd6f717578e5ec8bc59a4b33b62671d9794919ec8b52bcc6" }
    processId := ⟨"Process_ParallelForkJoin"⟩
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_1"⟩
      , .parallelGateway ⟨"Gateway_Fork"⟩ .diverging
      , .parallelGateway ⟨"Gateway_Join"⟩ .converging
      , .noneStartEvent ⟨"StartEvent_1"⟩
      , .userTask ⟨"UserTask_A"⟩ (some "A")
      , .userTask ⟨"UserTask_B"⟩ (some "B") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_AToJoin"⟩
          sourceId := ⟨"UserTask_A"⟩
          targetId := ⟨"Gateway_Join"⟩ }
      , { id := ⟨"Flow_BToJoin"⟩
          sourceId := ⟨"UserTask_B"⟩
          targetId := ⟨"Gateway_Join"⟩ }
      , { id := ⟨"Flow_ForkToA"⟩
          sourceId := ⟨"Gateway_Fork"⟩
          targetId := ⟨"UserTask_A"⟩ }
      , { id := ⟨"Flow_ForkToB"⟩
          sourceId := ⟨"Gateway_Fork"⟩
          targetId := ⟨"UserTask_B"⟩ }
      , { id := ⟨"Flow_JoinToEnd"⟩
          sourceId := ⟨"Gateway_Join"⟩
          targetId := ⟨"EndEvent_1"⟩ }
      , { id := ⟨"Flow_StartToFork"⟩
          sourceId := ⟨"StartEvent_1"⟩
          targetId := ⟨"Gateway_Fork"⟩ } ] }

def parallelProgram : Program :=
  lowerCheckedProcess parallelCheckedProcess

def parallelInstanceId : SemanticId := ⟨"Instance_Parallel"⟩
def parallelStartOperation : OperationId := ⟨"operation:StartEvent_1"⟩
def parallelForkOperation : OperationId := ⟨"operation:Gateway_Fork"⟩
def parallelJoinOperation : OperationId := ⟨"operation:Gateway_Join"⟩
def parallelTaskAOperation : OperationId := ⟨"operation:UserTask_A"⟩
def parallelTaskBOperation : OperationId := ⟨"operation:UserTask_B"⟩
def parallelEndOperation : OperationId := ⟨"operation:EndEvent_1"⟩

def parallelStartState : RuntimeState :=
  runningStartState parallelInstanceId

def parallelAfterStart : RuntimeState :=
  { parallelStartState with
    initiationPending := false
    tokens := [⟨"place:Flow_StartToFork"⟩] }

def parallelAfterFork : RuntimeState :=
  { parallelAfterStart with
    tokens :=
      [ ⟨"place:Flow_ForkToA"⟩
      , ⟨"place:Flow_ForkToB"⟩ ] }

def parallelWaitingState : RuntimeState :=
  (runChoices parallelProgram parallelStartState
    [ parallelStartOperation
    , parallelForkOperation
    , parallelTaskAOperation
    , parallelTaskBOperation ]).getD initialState

def parallelWaitingStateBThenA : RuntimeState :=
  (runChoices parallelProgram parallelStartState
    [ parallelStartOperation
    , parallelForkOperation
    , parallelTaskBOperation
    , parallelTaskAOperation ]).getD initialState

def parallelJoinInputs : List ControlPlaceId :=
  [⟨"place:Flow_AToJoin"⟩, ⟨"place:Flow_BToJoin"⟩]

def duplicateLeftNoRightState : RuntimeState :=
  { parallelAfterFork with
    tokens := [⟨"place:Flow_AToJoin"⟩, ⟨"place:Flow_AToJoin"⟩] }

def excessJoinState : RuntimeState :=
  { parallelAfterFork with
    tokens :=
      [ ⟨"place:Flow_AToJoin"⟩
      , ⟨"place:Flow_AToJoin"⟩
      , ⟨"place:Flow_BToJoin"⟩ ] }

def excessAfterJoin : RuntimeState :=
  { excessJoinState with
    tokens :=
      [ ⟨"place:Flow_JoinToEnd"⟩
      , ⟨"place:Flow_AToJoin"⟩ ] }

def parallelAfterCompletingA : RuntimeState :=
  (completeUserTask parallelWaitingState parallelInstanceId
    ⟨"UserTask_A"⟩ 1).getD initialState

def parallelAfterAThenB : RuntimeState :=
  (completeUserTask parallelAfterCompletingA parallelInstanceId
    ⟨"UserTask_B"⟩ 1).getD initialState

def parallelAfterCompletingB : RuntimeState :=
  (completeUserTask parallelWaitingState parallelInstanceId
    ⟨"UserTask_B"⟩ 1).getD initialState

def parallelAfterBThenA : RuntimeState :=
  (completeUserTask parallelAfterCompletingB parallelInstanceId
    ⟨"UserTask_A"⟩ 1).getD initialState

def parallelFinalAThenB : RuntimeState :=
  (runChoices parallelProgram parallelAfterAThenB
    [parallelJoinOperation, parallelEndOperation]).getD initialState

def parallelFinalBThenA : RuntimeState :=
  (runChoices parallelProgram parallelAfterBThenA
    [parallelJoinOperation, parallelEndOperation]).getD initialState

theorem parallel_start_creates_exact_branch_waits :
    waitMultiplicity parallelWaitingState ⟨"UserTask_A"⟩ = 1 ∧
      waitMultiplicity parallelWaitingState ⟨"UserTask_B"⟩ = 1 ∧
      parallelWaitingState.tokens = [] := by
  decide

theorem parallel_task_activation_order_has_same_observation :
    observeStableState parallelProgram parallelWaitingState =
      observeStableState parallelProgram parallelWaitingStateBThenA := by
  decide

theorem parallel_supported_closure_reaches_exact_waiting_state :
    (applyStimulus scenarioClosureLimit parallelProgram initialState
      (.startProcess ⟨"start-process"⟩
        ⟨"Process_ParallelForkJoin"⟩ ⟨"Instance_1"⟩)) =
      { outcome := .committed
        state :=
          { parallelWaitingState with
            control := .running ⟨"Instance_1"⟩
            waits := parallelWaitingState.waits.map fun wait =>
              { wait with processInstanceId := ⟨"Instance_1"⟩ } }
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide

theorem exact_completion_removes_only_named_occurrence :
    waitMultiplicity parallelAfterCompletingA ⟨"UserTask_A"⟩ = 0 ∧
      waitMultiplicity parallelAfterCompletingA ⟨"UserTask_B"⟩ = 1 ∧
      tokenMultiplicity parallelAfterCompletingA ⟨"place:Flow_AToJoin"⟩ = 1 := by
  decide

theorem completion_order_independent_at_final_state :
    parallelFinalAThenB = parallelFinalBThenA := by
  decide

theorem synchronize_consumes_per_incoming_and_preserves_excess :
    step parallelProgram excessJoinState parallelJoinOperation =
      some excessAfterJoin := by
  decide

theorem token_projection_ignores_storage_permutation :
    projectTokenMultiplicities parallelProgram
        { excessJoinState with
          tokens :=
            [ ⟨"place:Flow_BToJoin"⟩
            , ⟨"place:Flow_AToJoin"⟩
            , ⟨"place:Flow_AToJoin"⟩ ] } =
      projectTokenMultiplicities parallelProgram excessJoinState := by
  decide

/-- The nearest count-based join proposition is false for two offers on only the left incoming flow. -/
theorem duplicate_left_no_right_non_law :
    countBasedJoinReady duplicateLeftNoRightState parallelJoinInputs = true ∧
      perIncomingJoinReady duplicateLeftNoRightState parallelJoinInputs = false := by
  decide

end BpmnSemantics.SemanticProcess
