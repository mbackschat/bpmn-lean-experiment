module

public import BpmnSemantics.SemanticProcess.SerialBusinessTaskAdmission
public import BpmnSemantics.SemanticProcess.GraphReachability
public import BpmnSemantics.SemanticProcess.SimpleBooleanExpression

/-! MTCF-SOURCE-01, MTCF-DATA-01 and MTCF-PROGRESS-01 require independent checked-graph and Program analysis; writer barriers and wait cuts prevent later writes or resumptions from justifying first-entry data or internal progress. -/

public section

namespace BpmnSemantics.SemanticProcess

abbrev mixedTaskControlFlowProfileId : ProfileId :=
  ⟨"cibseven-2.2.0-mixed-task-control-flow-draft"⟩

abbrev mixedTaskBusinessErrorProfileId : ProfileId :=
  ⟨"cibseven-2.2.0-mixed-task-business-error-draft"⟩

namespace MixedTaskControlFlow

inductive Kind where
  | start | human | service | choice | merge | finish
  deriving Repr, DecidableEq

structure Vertex where
  id : String
  kind : Kind
  outputs : List String
  reads : List String := []
  writes : List String := []
  deriving Repr, DecidableEq

structure Rank where
  id : String
  remaining : Nat
  deriving Repr, DecidableEq

structure Analysis where
  vertices : List Vertex
  startId : String
  finishId : String
  cutOrder : List Vertex
  ranks : List Rank
  required : List String
  maximumBurst : Nat
  deriving Repr, DecidableEq

def isWait (kind : Kind) : Bool :=
  match kind with
  | .human | .service => true
  | _ => false

def edges (vertices : List Vertex) : List (GraphEdge String) :=
  vertices.flatMap fun vertex => vertex.outputs.map fun target => { source := vertex.id, target }

def cutEdges (vertices : List Vertex) : List (GraphEdge String) :=
  edges (vertices.filter fun vertex => !isWait vertex.kind)

/-- MTCF-DATA-01 cuts after a guaranteed writer; its own entry remains reachable. -/
def writerBarrierEdges (vertices : List Vertex) (name : String) : List (GraphEdge String) :=
  edges (vertices.filter fun vertex => !(vertex.kind == .service && vertex.writes.contains name))

def uniqueNames (names : List String) : Bool :=
  names.all nonempty && names.eraseDups.length == names.length

def aritiesValid (vertices : List Vertex) : Bool :=
  vertices.all fun vertex =>
    let inputs := (vertices.flatMap (·.outputs)).count vertex.id
    let outputs := vertex.outputs.length
    vertex.outputs.all (fun id => vertices.any (·.id == id)) &&
      match vertex.kind with
      | .start => inputs == 0 && outputs == 1
      | .finish => inputs == 1 && outputs == 0
      | .human => inputs == 1 && outputs == 1
      | .service => inputs == 1 && outputs ≥ 1
      | .choice => inputs == 1 && outputs ≥ 2
      | .merge => inputs ≥ 2 && outputs == 1

/-- This ordering removes wait continuations only, as required by MTCF-PROGRESS-01. -/
def cutTopologicalOrder : Nat → List Vertex → Option (List Vertex)
  | 0, vertices => if vertices.isEmpty then some [] else none
  | fuel + 1, vertices => do
      if vertices.isEmpty then return []
      let first ← vertices.find? fun vertex =>
        !(cutEdges vertices).any (·.target == vertex.id)
      let rest ← cutTopologicalOrder fuel (vertices.filter (·.id != first.id))
      return first :: rest

def rank? (ranks : List Rank) (id : String) : Option Nat :=
  (ranks.find? (·.id == id)).map (·.remaining)

def vertexRank? (ranks : List Rank) (vertex : Vertex) : Option Nat := do
  match vertex.kind with
  | .human | .service => return 1
  | .finish => return 2
  | _ => return 1 + ((← vertex.outputs.mapM (rank? ranks)).foldl max 0)

def deriveRanks : List Vertex → Option (List Rank)
  | [] => some []
  | vertex :: rest => do
      let ranks ← deriveRanks rest
      return { id := vertex.id, remaining := ← vertexRank? ranks vertex } :: ranks

def ranksValid (vertices : List Vertex) (ranks : List Rank) : Bool :=
  vertices.all fun vertex => rank? ranks vertex.id == vertexRank? ranks vertex

def maximumBurst? (vertices : List Vertex) (ranks : List Rank) : Option Nat := do
  let entries := vertices.flatMap fun vertex =>
    match vertex.kind with
    | .start => [vertex.id]
    | .human | .service => vertex.outputs
    | _ => []
  return (← entries.mapM (rank? ranks)).foldl max 0

def readNames (vertices : List Vertex) : List String :=
  (vertices.flatMap (·.reads)).eraseDups

def requiredInputs (vertices : List Vertex) (start : String) : List String :=
  (readNames vertices).filter fun name =>
    vertices.any fun reader => reader.reads.contains name &&
      reachableWithin (writerBarrierEdges vertices name) vertices.length start reader.id

/-- Saturation makes negative writer-barrier searches usable as path exclusion proofs. -/
def writerSearchesClosed (vertices : List Vertex) (start : String) : Bool :=
  (readNames vertices).all fun name =>
    reachedClosed (writerBarrierEdges vertices name) vertices.length start

def analyze (vertices : List Vertex) : Option Analysis := do
  if !(uniqueNames (vertices.map (·.id)) && aritiesValid vertices &&
      vertices.any (fun vertex => isWait vertex.kind) &&
      vertices.all (fun vertex => match vertex.kind with
        | .service => true
        | _ => vertex.reads.isEmpty && vertex.writes.isEmpty)) then none
  else do
    let start ← StructuredComposition.unique? (vertices.filter (·.kind == .start))
    let finish ← StructuredComposition.unique? (vertices.filter (·.kind == .finish))
    let ids := vertices.map (·.id)
    if !(allReachableWithin ids (edges vertices) vertices.length start.id &&
        allCoreachableWithin ids (edges vertices) vertices.length [finish.id] &&
        acyclicClosed (cutEdges vertices) vertices.length &&
        writerSearchesClosed vertices start.id) then none
    else do
      let cutOrder ← cutTopologicalOrder vertices.length vertices
      let ranks ← deriveRanks cutOrder
      let maximumBurst ← maximumBurst? vertices ranks
      if !(ranksValid vertices ranks && maximumBurst ≤ scenarioClosureLimit) then none
      else return { vertices, startId := start.id, finishId := finish.id, cutOrder, ranks,
                    required := requiredInputs vertices start.id, maximumBurst }

def checkedConditionValid : Option CheckedCondition → Bool
  | none => false
  | some condition => condition.language == simpleBooleanExpressionLanguage &&
      (parseSimpleBooleanExpression condition.body).isSome

def checkedChoiceValid (source : CheckedProcess) (id : NodeId)
    (candidates : List SequenceFlowId) (default : SequenceFlowId) : Bool :=
  !candidates.isEmpty && uniqueNames ((candidates ++ [default]).map (·.value)) &&
    (source.sequenceFlows.filter (·.sourceId == id)).length == candidates.length + 1 &&
    candidates.all (fun candidate => source.sequenceFlows.any fun flow =>
      flow.id == candidate && flow.sourceId == id && checkedConditionValid flow.condition) &&
    source.sequenceFlows.any (fun flow =>
      flow.id == default && flow.sourceId == id && flow.condition.isNone)

def routesAdmitted (profile : ProfileId) (hasRoute : Bool) : Bool :=
  if profile == mixedTaskBusinessErrorProfileId then hasRoute
  else profile == mixedTaskControlFlowProfileId && !hasRoute

def checkedRoutes (source : CheckedProcess) : List CheckedBpmnErrorRoute :=
  source.nodes.filterMap fun node => match node with
    | .serviceTask _ _ _ _ route => route
    | _ => none

/-- MBERR-CATCH-01 binds exceptional production to its attached boundary and exact flow. -/
def checkedProducer? (source : CheckedProcess) (flow : CheckedSequenceFlow) : Option NodeId := do
  let producer ← StructuredComposition.unique? (source.nodes.filter fun node =>
    node.id == flow.sourceId || match node with
      | .serviceTask _ _ _ _ (some route) =>
          route.attachedToRef == node.id && route.boundaryEventId == flow.sourceId &&
            route.outputFlowId == flow.id
      | _ => false)
  return producer.id

def checkedRouteValid (source : CheckedProcess) (service : NodeId)
    (route : CheckedBpmnErrorRoute) : Bool :=
  route.attachedToRef == service && nonempty route.code &&
    (source.sequenceFlows.filter (·.sourceId == route.boundaryEventId)).length == 1 &&
    !(source.sequenceFlows.any (·.targetId == route.boundaryEventId)) &&
    source.sequenceFlows.any (fun flow => flow.id == route.outputFlowId &&
      flow.sourceId == route.boundaryEventId && flow.condition.isNone)

def checkedRoutesValid (source : CheckedProcess) : Bool :=
  let routes := checkedRoutes source
  let declarations := source.processId.value :: source.nodes.map (·.id.value) ++
    source.sequenceFlows.map (·.id.value) ++
    routes.flatMap (fun route => [route.boundaryEventId.value, route.errorDefinitionId.value]) ++
    (routes.map (·.errorElementId.value)).eraseDups
  routesAdmitted source.identity.semanticProfile (!routes.isEmpty) && uniqueNames declarations &&
    source.nodes.all (fun node => match node with
      | .serviceTask id _ _ _ (some route) => checkedRouteValid source id route
      | _ => true) &&
    routes.all (fun route => routes.all fun other =>
      route.errorElementId != other.errorElementId ||
        (route.code == other.code && route.errorName == other.errorName))

def checkedVertex? (source : CheckedProcess) (node : CheckedNode) : Option Vertex := do
  let id := node.id.value
  let outputs := (source.sequenceFlows.filter (·.sourceId == node.id)).map (·.targetId.value)
  match node with
  | .noneStartEvent _ => return { id, kind := .start, outputs }
  | .noneEndEvent _ => return { id, kind := .finish, outputs }
  | .userTask _ _ metadata =>
      if !SerialBusinessTask.metadataValid (SerialBusinessTask.checkedHandlers source) metadata then none
      else return { id, kind := .human, outputs }
  | .serviceTask _ descriptor inputs mappings none =>
      if !(outputs.length == 1 && SerialBusinessTask.descriptorValid descriptor &&
          SerialBusinessTask.mappingsValid (SerialBusinessTask.checkedHandlers source) inputs mappings)
      then none
      else return { id, kind := .service, outputs, reads := SerialBusinessTask.readNames inputs,
                    writes := mappings.map (·.target) }
  | .serviceTask service descriptor inputs mappings (some route) =>
      if !(outputs.length == 1 && checkedRouteValid source service route &&
          SerialBusinessTask.descriptorValid descriptor &&
          SerialBusinessTask.mappingsValid (SerialBusinessTask.checkedHandlers source) inputs mappings)
      then none
      else do
        let exceptional ← StructuredComposition.unique? (source.sequenceFlows.filter fun flow =>
          flow.id == route.outputFlowId && flow.sourceId == route.boundaryEventId)
        return { id, kind := .service, outputs := outputs ++ [exceptional.targetId.value],
                 reads := SerialBusinessTask.readNames inputs, writes := mappings.map (·.target) }
  | .exclusiveGateway nodeId candidates default =>
      if !checkedChoiceValid source nodeId candidates default then none
      else do
        let ordered ← (candidates ++ [default]).mapM fun flowId => do
          let flow ← StructuredComposition.unique? (source.sequenceFlows.filter (·.id == flowId))
          return flow.targetId.value
        return { id, kind := .choice, outputs := ordered }
  | .exclusiveMerge _ => return { id, kind := .merge, outputs }
  | _ => none

def checkedOwnershipValid (source : CheckedProcess) (root : DefinitionScope) : Bool :=
  root.parentScopeId.isNone && root.originElementId.value == source.processId.value &&
    nonempty root.id.value &&
    source.nodeScopes.length == source.nodes.length &&
    source.nodes.all (fun node =>
      (source.nodeScopes.filter (fun owner => owner.nodeId == node.id && owner.scopeId == root.id)).length == 1) &&
    source.sequenceFlowScopes.length == source.sequenceFlows.length &&
    source.sequenceFlows.all (fun flow =>
      (source.sequenceFlowScopes.filter (fun owner =>
        owner.sequenceFlowId == flow.id && owner.scopeId == root.id)).length == 1)

def checkedAnalysis (source : CheckedProcess) : Option Analysis := do
  let root ← StructuredComposition.unique? source.definitionScopes
  let identities := source.processId.value :: source.nodes.map (·.id.value) ++
    source.sequenceFlows.map (·.id.value)
  if !(source.identity.sourceOverlay.isSome && checkedOwnershipValid source root &&
      source.compensation.isNone && source.transactionCancellation.isNone &&
      source.interruptingMessageEventSubProcesses.isEmpty && uniqueNames identities &&
      checkedRoutesValid source &&
      source.sequenceFlows.all (fun flow =>
        (checkedProducer? source flow).isSome && source.nodes.any (·.id == flow.targetId) &&
        (flow.condition.isNone || source.nodes.any (fun node => match node with
          | .exclusiveGateway id candidates _ => id == flow.sourceId && candidates.contains flow.id
          | _ => false)))) then none
  else analyze (← source.nodes.mapM (checkedVertex? source))

def operationInputs : SemanticOperation → List ControlPlaceId
  | .awaitUserTask _ _ input .. | .awaitEffect _ _ input ..
  | .choose _ _ input .. | .reachNoneEnd _ _ input => [input]
  | .mergeExclusive _ _ inputs _ => inputs
  | _ => []

def operationOutputs : SemanticOperation → List ControlPlaceId
  | .initiate _ _ output | .awaitUserTask _ _ _ output _
  | .awaitEffect _ _ _ output _ none | .mergeExclusive _ _ _ output => [output]
  | .awaitEffect _ _ _ output _ (some route) => [output, route.output]
  | .choose _ _ _ candidates default _ => candidates.map (·.output) ++ [default]
  | _ => []

def operationOrigin? : SemanticOperation → Option BpmnElementOrigin
  | .initiate _ origin _ | .awaitUserTask _ origin .. | .awaitEffect _ origin ..
  | .choose _ origin .. | .mergeExclusive _ origin .. | .reachNoneEnd _ origin _ => some origin
  | _ => none

def consumer? (program : Program) (place : ControlPlaceId) : Option String := do
  let consumer ← StructuredComposition.unique? (program.operations.filter fun operation =>
    (operationInputs operation).contains place)
  return consumer.id.value

def choiceOriginsValid (program : Program) (candidates : List ConditionalCandidate)
    (default : ControlPlaceId) (origin : BpmnSequenceFlowOrigin) : Bool :=
  !candidates.isEmpty &&
    uniqueNames ((candidates.map (·.output) ++ [default]).map (·.value)) &&
    candidates.all (fun candidate => simpleBooleanExpressionValid candidate.condition &&
      program.controlPlaces.any (fun place =>
        place.id == candidate.output && place.origin == candidate.origin)) &&
    program.controlPlaces.any (fun place => place.id == default && place.origin == origin)

def programRoutes (program : Program) : List BpmnErrorRoute :=
  program.operations.filterMap fun operation => match operation with
    | .awaitEffect _ _ _ _ _ route => route
    | _ => none

def programRouteValid (program : Program) (route : BpmnErrorRoute) : Bool :=
  nonempty route.code && program.controlPlaces.any (fun place =>
    place.id == route.output && place.origin.elementId == route.origin.sequenceFlowId)

def programRoutesValid (program : Program) : Bool :=
  let routes := programRoutes program
  routesAdmitted program.identity.semanticProfile (!routes.isEmpty) &&
    routes.all (programRouteValid program) &&
    routes.all (fun route => routes.all fun other =>
      route.origin.errorElementId != other.origin.errorElementId || route.code == other.code)

def operationVertex? (program : Program) (operation : SemanticOperation) : Option Vertex := do
  let id := operation.id.value
  match operation with
  | .initiate _ _ output => return { id, kind := .start, outputs := [← consumer? program output] }
  | .reachNoneEnd .. => return { id, kind := .finish, outputs := [] }
  | .awaitUserTask _ origin _ output task =>
      if !(SerialBusinessTask.metadataValid (SerialBusinessTask.programHandlers program) task.metadata &&
          task.id.value == origin.elementId.value) then none
      else return { id, kind := .human, outputs := [← consumer? program output] }
  | .awaitEffect _ origin _ output effect none =>
      if !(origin.elementId == effect.elementId && SerialBusinessTask.descriptorValid effect.descriptor &&
          SerialBusinessTask.mappingsValid (SerialBusinessTask.programHandlers program)
            effect.inputMappings effect.outputMappings) then none
      else return { id, kind := .service, outputs := [← consumer? program output],
                    reads := SerialBusinessTask.readNames effect.inputMappings,
                    writes := effect.outputMappings.map (·.target) }
  | .awaitEffect _ origin _ output effect (some route) =>
      if !(origin.elementId == effect.elementId && programRouteValid program route &&
          SerialBusinessTask.descriptorValid effect.descriptor &&
          SerialBusinessTask.mappingsValid (SerialBusinessTask.programHandlers program)
            effect.inputMappings effect.outputMappings) then none
      else return { id, kind := .service,
                    outputs := [← consumer? program output, ← consumer? program route.output],
                    reads := SerialBusinessTask.readNames effect.inputMappings,
                    writes := effect.outputMappings.map (·.target) }
  | .choose _ _ _ candidates default origin =>
      if !choiceOriginsValid program candidates default origin then none
      else return { id, kind := .choice,
                    outputs := ← (candidates.map (·.output) ++ [default]).mapM (consumer? program) }
  | .mergeExclusive _ _ inputs output =>
      if !(inputs.length ≥ 2 && uniqueNames (inputs.map (·.value))) then none
      else return { id, kind := .merge, outputs := [← consumer? program output] }
  | _ => none

/-- MTCF-SOURCE-01 checks edge occurrences, not distinct producer/consumer sets. -/
def programEdgesValid (program : Program) : Bool :=
  let inputs := program.operations.flatMap operationInputs
  let outputs := program.operations.flatMap operationOutputs
  let places := program.controlPlaces.map (·.id)
  inputs.all places.contains && outputs.all places.contains &&
    places.all (fun place => inputs.count place == 1 && outputs.count place == 1)

def programOwnershipValid (program : Program) (root : DefinitionScope) : Bool :=
  root.parentScopeId.isNone && root.originElementId.value == program.processId.value &&
    nonempty root.id.value &&
    program.operationScopes.length == program.operations.length &&
    program.operations.all (fun operation =>
      (program.operationScopes.filter (fun owner =>
        owner.operationId == operation.id && owner.scopeId == root.id)).length == 1) &&
    program.controlPlaceScopes.length == program.controlPlaces.length &&
    program.controlPlaces.all (fun place =>
      (program.controlPlaceScopes.filter (fun owner =>
        owner.controlPlaceId == place.id && owner.scopeId == root.id)).length == 1)

def programAnalysis (program : Program) : Option Analysis := do
  let root ← StructuredComposition.unique? program.definitionScopes
  if !(program.identity.sourceOverlay.isSome && programOwnershipValid program root &&
      program.internalSchedulingMode == .rejectObservableChoice &&
      program.compensationActivityRetention.isNone && program.compensationEventSubProcessSnapshots.isNone &&
      program.compensationExecution.isNone && program.interruptingMessageEventSubProcesses.isEmpty &&
      uniqueNames (program.operations.map (·.id.value)) &&
      uniqueNames (program.controlPlaces.map (·.id.value)) && programEdgesValid program &&
      programRoutesValid program) then none
  else do
    let completion ← StructuredComposition.unique?
      (program.operations.filter StructuredComposition.isScopeCompletion)
    match completion with
    | .completeScope _ origin scope none =>
        if !(scope == root.id && origin.elementId.value == program.processId.value) then none
        else do
          let operations := program.operations.filter fun op => !StructuredComposition.isScopeCompletion op
          let origins ← operations.mapM operationOrigin?
          let identities := program.processId.value :: origins.map (·.elementId.value) ++
            program.controlPlaces.map (·.origin.elementId.value) ++
            (programRoutes program).flatMap (fun route =>
              [route.origin.boundaryEventId.value, route.origin.errorDefinitionId.value]) ++
            ((programRoutes program).map (·.origin.errorElementId.value)).eraseDups
          if !uniqueNames identities then none
          else analyze (← operations.mapM (operationVertex? program))
    | _ => none

def startBindingsAdmitted (program : Program) (bindings : List VariableBinding) : Bool :=
  match programAnalysis program with
  | none => false
  | some analysis => SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) bindings &&
      analysis.required.all (fun name => bindings.any (·.name == name))

end MixedTaskControlFlow
end BpmnSemantics.SemanticProcess
