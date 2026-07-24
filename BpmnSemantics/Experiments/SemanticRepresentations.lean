/-! # BpmnSemantics.Experiments.SemanticRepresentations — bounded architecture candidates

This module tests whether small, serializable data types can preserve source provenance, compiled scope relations, edge-arrival identity, runtime instances, and command closure without importing CIB Seven or Temporal representations. The types are experiment-local candidates, not an approved BPMN IR or execution semantics.
-/

namespace BpmnSemantics.Experiments.SemanticRepresentations

abbrev ElementId := String
abbrev FlowId := String
abbrev ScopeId := String

/-- BPMN concepts admitted only by this representation experiment. -/
inductive SourceNodeKind where
  | noneStart
  | userTask
  | noneEnd
  | parallelGateway
  | boundaryTimer
  deriving Repr, DecidableEq, BEq

/-- Source position retained for diagnostics but not used as executable semantics. -/
structure SourceLocation where
  resource : String
  line : Nat
  column : Nat
  deriving Repr, DecidableEq

/-- XML and diagram material that a source-preserving layer may retain independently of the executable IR. -/
structure PreservedSourceData where
  documentation : Option String
  extensionAttributes : List (String × String)
  diagramBounds : Option (Nat × Nat × Nat × Nat)
  deriving Repr, DecidableEq

/-- A resolved source node candidate before executable normalization. -/
structure SourceNode where
  id : ElementId
  kind : SourceNodeKind
  parentScope : ScopeId
  attachedTo : Option ElementId
  location : SourceLocation
  preserved : PreservedSourceData
  deriving Repr, DecidableEq

/-- Sequence-flow references still use source identities at this layer. -/
structure SourceFlow where
  id : FlowId
  sourceRef : ElementId
  targetRef : ElementId
  xmlOrder : Nat
  deriving Repr, DecidableEq

/-- Source-preserving input to the candidate compiler. -/
structure SourceDocument where
  processId : ScopeId
  nodes : List SourceNode
  flows : List SourceFlow
  deriving Repr, DecidableEq

/-- Explicit executable node kinds replace runtime behavior-class identity. -/
inductive ExecutableNodeKind where
  | noneStart
  | userTask
  | noneEnd
  | parallelGateway
  | boundaryTimer
  deriving Repr, DecidableEq, BEq

/-- Provenance distinguishes source nodes from justified compiler-introduced nodes. -/
inductive NodeOrigin where
  | source (elementId : ElementId)
  | synthetic (reason : String) (sources : List ElementId)
  deriving Repr, DecidableEq

/-- Flow and event ownership are separate relations even when they happen to name the same scope. -/
structure ScopeRelations where
  flowScope : ScopeId
  eventScope : ScopeId
  deriving Repr, DecidableEq

/-- Data-only candidate executable node. -/
structure ExecutableNode where
  id : ElementId
  kind : ExecutableNodeKind
  scopes : ScopeRelations
  origin : NodeOrigin
  deriving Repr, DecidableEq

/-- Resolved executable flow retaining source order explicitly. -/
structure ExecutableFlow where
  id : FlowId
  source : ElementId
  target : ElementId
  order : Nat
  deriving Repr, DecidableEq

/-- Candidate deployment result shared by every runtime instance. -/
structure ExecutableModel where
  processId : ScopeId
  nodes : List ExecutableNode
  flows : List ExecutableFlow
  deriving Repr, DecidableEq

/-- Small validation classes needed to make the normalization boundary observable. -/
inductive CompileError where
  | duplicateNodeId (id : ElementId)
  | missingFlowSource (flowId : FlowId) (sourceRef : ElementId)
  | missingFlowTarget (flowId : FlowId) (targetRef : ElementId)
  | missingAttachment (nodeId : ElementId) (attachedTo : ElementId)
  deriving Repr, DecidableEq

private def firstDuplicate? : List String → Option String
  | [] => none
  | value :: rest =>
      if rest.contains value then
        some value
      else
        firstDuplicate? rest

private def hasNode (document : SourceDocument) (id : ElementId) : Bool :=
  document.nodes.any fun node => node.id == id

private def compileKind : SourceNodeKind → ExecutableNodeKind
  | .noneStart => .noneStart
  | .userTask => .userTask
  | .noneEnd => .noneEnd
  | .parallelGateway => .parallelGateway
  | .boundaryTimer => .boundaryTimer

private def compileNode (document : SourceDocument) (node : SourceNode) :
    Except CompileError ExecutableNode := do
  match node.attachedTo with
  | some attachedTo =>
      if !hasNode document attachedTo then
        throw (.missingAttachment node.id attachedTo)
  | none => pure ()
  pure
    { id := node.id
      kind := compileKind node.kind
      scopes :=
        { flowScope := node.parentScope
          eventScope := node.attachedTo.getD node.parentScope }
      origin := .source node.id }

private def compileFlow (document : SourceDocument) (flow : SourceFlow) :
    Except CompileError ExecutableFlow := do
  if !hasNode document flow.sourceRef then
    throw (.missingFlowSource flow.id flow.sourceRef)
  if !hasNode document flow.targetRef then
    throw (.missingFlowTarget flow.id flow.targetRef)
  pure
    { id := flow.id
      source := flow.sourceRef
      target := flow.targetRef
      order := flow.xmlOrder }

/-- Candidate normalization intentionally drops presentation material after retaining semantic provenance. -/
def compile (document : SourceDocument) : Except CompileError ExecutableModel := do
  match firstDuplicate? (document.nodes.map (·.id)) with
  | some duplicate => throw (.duplicateNodeId duplicate)
  | none => pure ()
  pure
    { processId := document.processId
      nodes := ← document.nodes.mapM (compileNode document)
      flows := ← document.flows.mapM (compileFlow document) }

private def location (line : Nat) : SourceLocation :=
  { resource := "process.bpmn", line, column := 3 }

private def preserved (documentation : Option String := none) : PreservedSourceData :=
  { documentation
    extensionAttributes := []
    diagramBounds := none }

/-- The sequential User Task source shape used only to probe the representation boundary. -/
def sequentialSource : SourceDocument :=
  { processId := "Process_SequentialUserTask"
    nodes :=
      [ { id := "Start_None"
          kind := .noneStart
          parentScope := "Process_SequentialUserTask"
          attachedTo := none
          location := location 4
          preserved := preserved }
      , { id := "UserTask_Approve"
          kind := .userTask
          parentScope := "Process_SequentialUserTask"
          attachedTo := none
          location := location 5
          preserved := preserved (some "Approve the request") }
      , { id := "End_None"
          kind := .noneEnd
          parentScope := "Process_SequentialUserTask"
          attachedTo := none
          location := location 6
          preserved := preserved } ]
    flows :=
      [ { id := "Flow_Start_Task"
          sourceRef := "Start_None"
          targetRef := "UserTask_Approve"
          xmlOrder := 0 }
      , { id := "Flow_Task_End"
          sourceRef := "UserTask_Approve"
          targetRef := "End_None"
          xmlOrder := 0 } ] }

private def compiledSequential? : Option ExecutableModel :=
  match compile sequentialSource with
  | .ok model => some model
  | .error _ => none

/-- The compiler resolves flow endpoints and retains source provenance without carrying source presentation data. -/
def sourceToIrWitness : Bool :=
  match compiledSequential? with
  | none => false
  | some model =>
      model.nodes.length == 3 &&
      model.flows.length == 2 &&
      model.nodes.all fun node => node.origin == .source node.id

/-- A boundary-event-shaped candidate demonstrates representational capacity only; exact BPMN ownership rules remain a later semantic question. -/
def distinctScopeRelationsWitness : Bool :=
  let boundary : SourceNode :=
    { id := "Boundary_Timer"
      kind := .boundaryTimer
      parentScope := "Process"
      attachedTo := some "Task"
      location := location 8
      preserved := preserved }
  let document : SourceDocument :=
    { processId := "Process"
      nodes :=
        [ { id := "Task"
            kind := .userTask
            parentScope := "Process"
            attachedTo := none
            location := location 7
            preserved := preserved }
        , boundary ]
      flows := [] }
  match compile document with
  | .error _ => false
  | .ok model =>
      match model.nodes.find? fun node => node.id == boundary.id with
      | none => false
      | some node =>
          node.scopes.flowScope == "Process" &&
          node.scopes.eventScope == "Task"

/-- Runtime token candidate keeps scope and arrival provenance separate from definition identity. -/
structure ArrivalToken where
  id : String
  nodeId : ElementId
  scopeInstanceId : String
  arrivedVia : Option FlowId
  deriving Repr, DecidableEq

/-- Deliberately weak countermodel corresponding to a pure arrival-count join test. -/
def countOnlyJoinReady (incoming : List FlowId) (gatewayId : ElementId)
    (tokens : List ArrivalToken) : Bool :=
  (tokens.filter fun token => token.nodeId == gatewayId).length >= incoming.length

/-- Candidate readiness account that requires at least one offered token from every incoming flow. -/
def edgeProvenanceJoinReady (incoming : List FlowId) (gatewayId : ElementId)
    (tokens : List ArrivalToken) : Bool :=
  incoming.all fun flowId =>
    tokens.any fun token =>
      token.nodeId == gatewayId && token.arrivedVia == some flowId

private def duplicateLeftArrivals : List ArrivalToken :=
  [ { id := "Token_1"
      nodeId := "Join"
      scopeInstanceId := "Scope_1"
      arrivedVia := some "Flow_Left" }
  , { id := "Token_2"
      nodeId := "Join"
      scopeInstanceId := "Scope_1"
      arrivedVia := some "Flow_Left" } ]

/-- The seeded weak account incorrectly treats two arrivals from one incoming flow as join readiness. -/
def countOnlyAcceptsDuplicateArrivalWitness : Bool :=
  countOnlyJoinReady ["Flow_Left", "Flow_Right"] "Join" duplicateLeftArrivals

/-- The stronger account rejects the same witness because `Flow_Right` has no offer. -/
def edgeProvenanceRejectsDuplicateArrivalWitness : Bool :=
  !edgeProvenanceJoinReady ["Flow_Left", "Flow_Right"] "Join" duplicateLeftArrivals

/-- Runtime lifecycle is instance state, not a mutation of the shared executable definition. -/
inductive RuntimeStatus where
  | notStarted
  | running
  | completed
  deriving Repr, DecidableEq, BEq

inductive TokenPhase where
  | entering
  | waiting
  | leaving
  deriving Repr, DecidableEq, BEq

structure RuntimeToken where
  id : String
  nodeId : ElementId
  scopeInstanceId : String
  phase : TokenPhase
  arrivedVia : Option FlowId
  deriving Repr, DecidableEq

structure ScopeInstance where
  id : String
  definitionId : ScopeId
  parent : Option String
  deriving Repr, DecidableEq

structure UserTaskWait where
  id : String
  elementId : ElementId
  tokenId : String
  deriving Repr, DecidableEq

structure RuntimeState where
  status : RuntimeStatus
  scopes : List ScopeInstance
  tokens : List RuntimeToken
  userTaskWaits : List UserTaskWait
  deriving Repr, DecidableEq

inductive MicroEvent where
  | flowTaken (flowId : FlowId) (tokenId : String)
  | userTaskWaitCreated (elementId : ElementId) (tokenId : String)
  | userTaskWaitCompleted (elementId : ElementId) (tokenId : String)
  | tokenConsumed (elementId : ElementId) (tokenId : String)
  | processCompleted
  deriving Repr, DecidableEq

structure ClosureResult where
  state : RuntimeState
  microtrace : List MicroEvent
  hitBound : Bool
  deriving Repr, DecidableEq

inductive SpikeStimulus where
  | start
  | completeUserTaskWait (waitId : String)
  deriving Repr, DecidableEq

inductive SpikeCommandOutcome where
  | committed
  | rejected
  | internalStepBoundExceeded
  deriving Repr, DecidableEq, BEq

structure SpikeCommandResult where
  outcome : SpikeCommandOutcome
  state : RuntimeState
  microtrace : List MicroEvent
  deriving Repr, DecidableEq

def initialState : RuntimeState :=
  { status := .notStarted
    scopes := []
    tokens := []
    userTaskWaits := [] }

private def findNode? (model : ExecutableModel) (id : ElementId) : Option ExecutableNode :=
  model.nodes.find? fun node => node.id == id

private def firstNodeOfKind? (model : ExecutableModel)
    (kind : ExecutableNodeKind) : Option ExecutableNode :=
  model.nodes.find? fun node => node.kind == kind

private def firstOutgoing? (model : ExecutableModel)
    (source : ElementId) : Option ExecutableFlow :=
  model.flows.find? fun flow => flow.source == source

private def replaceToken (tokens : List RuntimeToken) (replacement : RuntimeToken) :
    List RuntimeToken :=
  tokens.map fun token =>
    if token.id == replacement.id then replacement else token

private def removeToken (tokens : List RuntimeToken) (id : String) : List RuntimeToken :=
  tokens.filter fun token => token.id != id

private def routeToken (model : ExecutableModel) (state : RuntimeState)
    (token : RuntimeToken) : Option (RuntimeState × MicroEvent) := do
  let flow ← firstOutgoing? model token.nodeId
  let moved :=
    { token with
      nodeId := flow.target
      phase := .entering
      arrivedVia := some flow.id }
  pure
    ( { state with tokens := replaceToken state.tokens moved }
    , .flowTaken flow.id token.id )

/-- One deterministic internal transition for the deliberately sequential witness model. -/
def internalStep (model : ExecutableModel) (state : RuntimeState) :
    Option (RuntimeState × MicroEvent) := do
  let token ← state.tokens.find? fun candidate => candidate.phase != .waiting
  let node ← findNode? model token.nodeId
  match node.kind, token.phase with
  | .noneStart, .entering => routeToken model state token
  | .userTask, .entering =>
      let waiting := { token with phase := .waiting }
      let wait : UserTaskWait :=
        { id := "wait:" ++ token.id
          elementId := node.id
          tokenId := token.id }
      pure
        ( { state with
              tokens := replaceToken state.tokens waiting
              userTaskWaits := wait :: state.userTaskWaits }
        , .userTaskWaitCreated node.id token.id )
  | .userTask, .leaving => routeToken model state token
  | .noneEnd, .entering =>
      let remaining := removeToken state.tokens token.id
      let event :=
        if remaining.isEmpty then
          .processCompleted
        else
          .tokenConsumed node.id token.id
      pure
        ( { state with
              tokens := remaining
              status := if remaining.isEmpty then .completed else state.status }
        , event )
  | _, _ => none

/-- Bounded closure exposes divergence protection as a harness result rather than an invented BPMN incident. -/
def closeInternal : Nat → ExecutableModel → RuntimeState → ClosureResult
  | 0, _, state =>
      { state
        microtrace := []
        hitBound := true }
  | fuel + 1, model, state =>
      match internalStep model state with
      | none =>
          { state
            microtrace := []
            hitBound := false }
      | some (nextState, event) =>
          let rest := closeInternal fuel model nextState
          { state := rest.state
            microtrace := event :: rest.microtrace
            hitBound := rest.hitBound }

private def closureOutcome (closure : ClosureResult) : SpikeCommandOutcome :=
  if closure.hitBound then .internalStepBoundExceeded else .committed

/-- External stimuli are serialized at a command boundary and then closed to the next stable state. -/
def applyStimulus (fuel : Nat) (model : ExecutableModel) (state : RuntimeState)
    (stimulus : SpikeStimulus) : SpikeCommandResult :=
  match stimulus with
  | .start =>
      if state.status != .notStarted then
        { outcome := .rejected, state, microtrace := [] }
      else
        match firstNodeOfKind? model .noneStart with
        | none => { outcome := .rejected, state, microtrace := [] }
        | some start =>
            let rootScope : ScopeInstance :=
              { id := "scope:root"
                definitionId := model.processId
                parent := none }
            let token : RuntimeToken :=
              { id := "token:1"
                nodeId := start.id
                scopeInstanceId := rootScope.id
                phase := .entering
                arrivedVia := none }
            let closure :=
              closeInternal fuel model
                { status := .running
                  scopes := [rootScope]
                  tokens := [token]
                  userTaskWaits := [] }
            { outcome := closureOutcome closure
              state := closure.state
              microtrace := closure.microtrace }
  | .completeUserTaskWait waitId =>
      match state.userTaskWaits.find? fun wait => wait.id == waitId with
      | none => { outcome := .rejected, state, microtrace := [] }
      | some wait =>
          match state.tokens.find? fun token => token.id == wait.tokenId with
          | none => { outcome := .rejected, state, microtrace := [] }
          | some token =>
              let leaving := { token with phase := .leaving }
              let ready :=
                { state with
                    tokens := replaceToken state.tokens leaving
                    userTaskWaits :=
                      state.userTaskWaits.filter fun candidate => candidate.id != wait.id }
              let closure := closeInternal fuel model ready
              { outcome := closureOutcome closure
                state := closure.state
                microtrace :=
                  .userTaskWaitCompleted wait.elementId token.id :: closure.microtrace }

private def sequentialStartResult? : Option SpikeCommandResult :=
  compiledSequential?.map fun model => applyStimulus 8 model initialState .start

/-- One command contains internal flow and wait-creation microsteps, then stops at a stable external wait. -/
def startCommandClosureWitness : Bool :=
  match sequentialStartResult? with
  | none => false
  | some result =>
      result.outcome == .committed &&
      result.state.status == .running &&
      result.state.userTaskWaits.length == 1 &&
      result.microtrace.length == 2

/-- Completing the wait starts a second command closure whose internal steps reach Process completion. -/
def completionCommandClosureWitness : Bool :=
  match compiledSequential?, sequentialStartResult? with
  | some model, some started =>
      let completed :=
        applyStimulus 8 model started.state (.completeUserTaskWait "wait:token:1")
      completed.outcome == .committed &&
      completed.state.status == .completed &&
      completed.state.tokens.isEmpty &&
      completed.state.userTaskWaits.isEmpty &&
      completed.microtrace.length == 3
  | _, _ => false

end BpmnSemantics.Experiments.SemanticRepresentations
