import BpmnSemantics.SemanticProcessContract

/-! # Fuel-bounded graph validation

This module owns small executable graph predicates shared by checked-source proof experiments and standalone Semantic Process validation. Production validators derive fuel from the finite admitted vertex set; discriminating witnesses may deliberately underfuel a search. Graph search never participates in a semantic transition.
-/

namespace BpmnSemantics.SemanticProcess

structure GraphEdge (α : Type) where
  source : α
  target : α
  deriving Repr, DecidableEq

/-- Distinct direct successors of the current frontier. -/
def successors [DecidableEq α] (edges : List (GraphEdge α))
    (frontier : List α) : List α :=
  (edges.filterMap fun edge =>
    if frontier.contains edge.source then some edge.target else none).eraseDups

def reachableNodesWithin [DecidableEq α] (edges : List (GraphEdge α)) :
    Nat → List α → List α → List α
  | 0, _, visited => visited
  | fuel + 1, frontier, visited =>
      let next :=
        (successors edges frontier).filter fun node =>
          !visited.contains node
      reachableNodesWithin edges fuel next (visited ++ next)

def reachedSet [DecidableEq α] (edges : List (GraphEdge α)) (fuel : Nat)
    (source : α) : List α :=
  reachableNodesWithin edges fuel [source] [source]

def reachableWithin [DecidableEq α] (edges : List (GraphEdge α))
    (fuel : Nat) (source target : α) : Bool :=
  (reachedSet edges fuel source).contains target

def allReachableWithin [DecidableEq α] (nodes : List α)
    (edges : List (GraphEdge α)) (fuel : Nat) (source : α) : Bool :=
  nodes.all (reachableWithin edges fuel source)

def allCoreachableWithin [DecidableEq α] (nodes : List α)
    (edges : List (GraphEdge α)) (fuel : Nat) (targets : List α) : Bool :=
  !targets.isEmpty &&
    nodes.all fun node =>
      targets.any (reachableWithin edges fuel node)

/-- Negative bounded-search witness account. Without a saturation certificate, failure to find a return path does not prove its absence. -/
def acyclicWithin [DecidableEq α] (edges : List (GraphEdge α))
    (fuel : Nat) : Bool :=
  edges.all fun edge =>
    !reachableWithin edges fuel edge.target edge.source

/-- Post-search certificate that every edge from a reached node stays in the reached set. -/
def reachedClosed [DecidableEq α] (edges : List (GraphEdge α)) (fuel : Nat)
    (source : α) : Bool :=
  let reached := reachedSet edges fuel source
  edges.all fun edge =>
    !reached.contains edge.source || reached.contains edge.target

/-- Cycle rejection backed by a checked saturation certificate for every return search. -/
def acyclicClosed [DecidableEq α] (edges : List (GraphEdge α))
    (fuel : Nat) : Bool :=
  edges.all fun edge =>
    reachedClosed edges fuel edge.target &&
      !reachableWithin edges fuel edge.target edge.source

private def operationInputs : SemanticOperation → List ControlPlaceId
  | .initiate ..
  | .completeScope .. => []
  | .enterScope _ _ input _ _
  | .awaitUserTask _ _ input _ _
  | .awaitTimer _ _ input _ _
  | .awaitMessage _ _ input _ _
  | .awaitEffect _ _ input _ _ _
  | .duplicate _ _ input _
  | .choose _ _ input _ _ _
  | .reachNoneEnd _ _ input => [input]
  | .synchronize _ _ inputs _ => inputs

private def operationOutputs : SemanticOperation → List ControlPlaceId
  | .initiate _ _ output
  | .awaitUserTask _ _ _ output _
  | .awaitTimer _ _ _ output _
  | .awaitMessage _ _ _ output _
  | .synchronize _ _ _ output => [output]
  | .enterScope _ _ _ childEntry _ => [childEntry]
  | .awaitEffect _ _ _ output _ route =>
      output :: route.toList.map (·.output)
  | .duplicate _ _ _ outputs => outputs
  | .choose _ _ _ candidates defaultOutput _ =>
      candidates.map (·.output) ++ [defaultOutput]
  | .reachNoneEnd .. => []
  | .completeScope _ _ _ parentOutput => parentOutput.toList

private def producers (operations : List SemanticOperation)
    (place : ControlPlaceId) : List OperationId :=
  operations.filterMap fun operation =>
    if (operationOutputs operation).contains place then
      some operation.id
    else
      none

private def consumers (operations : List SemanticOperation)
    (place : ControlPlaceId) : List OperationId :=
  operations.filterMap fun operation =>
    if (operationInputs operation).contains place then
      some operation.id
    else
      none

private def placeEdges (program : Program) : List (GraphEdge OperationId) :=
  program.controlPlaces.flatMap fun place =>
    (producers program.operations place.id).flatMap fun producer =>
      (consumers program.operations place.id).map fun consumer =>
        { source := producer, target := consumer }

private def operationScope? (program : Program) (operationId : OperationId) :
    Option DefinitionScopeId :=
  (program.operationScopes.find? fun ownership =>
    decide (ownership.operationId = operationId)).map (·.scopeId)

private def placeScope? (program : Program) (placeId : ControlPlaceId) :
    Option DefinitionScopeId :=
  (program.controlPlaceScopes.find? fun ownership =>
    decide (ownership.controlPlaceId = placeId)).map (·.scopeId)

private def definitionScope? (program : Program) (scopeId : DefinitionScopeId) :
    Option DefinitionScope :=
  program.definitionScopes.find? fun scope => decide (scope.id = scopeId)

private def placesOwnedBy (program : Program) (places : List ControlPlaceId)
    (scopeId : DefinitionScopeId) : Bool :=
  places.all fun place => placeScope? program place == some scopeId

private def operationRespectsScopes (program : Program)
    (operation : SemanticOperation) : Bool :=
  match operationScope? program operation.id with
  | none => false
  | some owner =>
      match operation with
      | .initiate _ _ output =>
          (definitionScope? program owner).any (·.parentScopeId.isNone) &&
            placesOwnedBy program [output] owner
      | .enterScope _ _ input childEntry childScopeId =>
          placesOwnedBy program [input] owner &&
            placesOwnedBy program [childEntry] childScopeId &&
            (definitionScope? program childScopeId).any fun scope =>
              scope.parentScopeId == some owner
      | .completeScope _ _ scopeId parentOutput =>
          scopeId = owner &&
            match definitionScope? program scopeId with
            | none => false
            | some scope =>
                match scope.parentScopeId, parentOutput with
                | none, none => true
                | some parent, some output =>
                    placesOwnedBy program [output] parent
                | _, _ => false
      | _ =>
          placesOwnedBy program
            (operationInputs operation ++ operationOutputs operation) owner

private def scopeEdges (program : Program) :
    List (GraphEdge DefinitionScopeId) :=
  program.definitionScopes.filterMap fun scope =>
    scope.parentScopeId.map fun parent =>
      { source := parent, target := scope.id }

private def scopeTreeWellFormed (program : Program) : Bool :=
  let ids := program.definitionScopes.map (·.id)
  match program.definitionScopes.filter (·.parentScopeId.isNone) with
  | [root] =>
      let edges := scopeEdges program
      let fuel := ids.length
      allReachableWithin ids edges fuel root.id && acyclicClosed edges fuel
  | _ => false

private def scopedOwnershipComplete (program : Program) : Bool :=
  program.operationScopes.map (·.operationId) = program.operations.map (·.id) &&
    program.controlPlaceScopes.map (·.controlPlaceId) =
      program.controlPlaces.map (·.id) &&
    program.operations.all (operationRespectsScopes program)

private def oneCompletionAndEntryPerScope (program : Program) : Bool :=
  program.definitionScopes.all fun scope =>
    (program.operations.filter fun
      | .completeScope _ _ scopeId _ => scopeId = scope.id
      | _ => false).length = 1 &&
    match scope.parentScopeId with
    | none =>
        program.operations.all fun
          | .enterScope _ _ _ _ childScopeId => childScopeId ≠ scope.id
          | _ => true
    | some _ =>
        (program.operations.filter fun
          | .enterScope _ _ _ _ childScopeId => childScopeId = scope.id
          | _ => false).length = 1

private def completionId? (program : Program) (scopeId : DefinitionScopeId) :
    Option OperationId :=
  program.operations.findSome? fun
    | .completeScope id _ candidate _ =>
        if candidate = scopeId then some id else none
    | _ => none

private def completionEdges (program : Program) : List (GraphEdge OperationId) :=
  program.operations.filterMap fun
    | .reachNoneEnd id _ _ => do
        let scopeId ← operationScope? program id
        let completionId ← completionId? program scopeId
        pure { source := id, target := completionId }
    | _ => none

private def programEdges (program : Program) : List (GraphEdge OperationId) :=
  placeEdges program ++ completionEdges program

private def initiateIds (operations : List SemanticOperation) :
    List OperationId :=
  operations.filterMap fun
    | .initiate id _ _ => some id
    | _ => none

private def rootScope? (program : Program) : Option DefinitionScopeId :=
  match program.definitionScopes.filter (·.parentScopeId.isNone) with
  | [scope] => some scope.id
  | _ => none

private def rootCompletionIds (program : Program) : List OperationId :=
  match rootScope? program with
  | none => []
  | some root => program.operations.filterMap fun
      | .completeScope id _ scopeId none =>
          if scopeId = root then some id else none
      | _ => none

/-- Standalone graph backstop for decoded programs, independent of lowering equality. -/
def programGraphWellFormed (program : Program) : Bool :=
  let operationIds := program.operations.map (·.id)
  let starts := initiateIds program.operations
  let ends := rootCompletionIds program
  match starts with
  | [start] =>
      let edges := programEdges program
      let fuel := operationIds.length
      scopeTreeWellFormed program &&
        scopedOwnershipComplete program &&
        oneCompletionAndEntryPerScope program &&
        program.controlPlaces.all (fun place =>
        (producers program.operations place.id).length = 1 &&
          (consumers program.operations place.id).length = 1) &&
        allReachableWithin operationIds edges fuel start &&
        allCoreachableWithin operationIds edges fuel ends &&
        acyclicClosed edges fuel
  | _ => false

end BpmnSemantics.SemanticProcess
