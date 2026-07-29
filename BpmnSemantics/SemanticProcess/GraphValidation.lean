import BpmnSemantics.SemanticProcessContract

/-! # Fuel-bounded graph validation

This module owns small executable graph predicates shared by checked-source proof experiments and standalone Semantic Process validation. Fuel is always supplied from the finite admitted vertex set; graph search never participates in a semantic transition.
-/

namespace BpmnSemantics.SemanticProcess

structure GraphEdge (α : Type) where
  source : α
  target : α
  deriving Repr, DecidableEq

/-- Declarative reflexive-transitive reachability over explicit graph edges. -/
inductive GraphReaches (edges : List (GraphEdge α)) : α → α → Prop where
  | refl (node : α) : GraphReaches edges node node
  | step {source middle target : α}
      (path : GraphReaches edges source middle)
      (edge : { source := middle, target := target } ∈ edges) :
      GraphReaches edges source target

private def successors [DecidableEq α] (edges : List (GraphEdge α))
    (frontier : List α) : List α :=
  (edges.filterMap fun edge =>
    if frontier.contains edge.source then some edge.target else none).eraseDups

private theorem successor_reachable [DecidableEq α]
    (edges : List (GraphEdge α)) (source target : α) (frontier : List α)
    (frontierReachable :
      ∀ node ∈ frontier, GraphReaches edges source node)
    (member : target ∈ successors edges frontier) :
    GraphReaches edges source target := by
  simp [successors] at member
  obtain ⟨edge, edgeMember, sourceMember, rfl⟩ := member
  exact .step (frontierReachable edge.source sourceMember) edgeMember

def reachableNodesWithin [DecidableEq α] (edges : List (GraphEdge α)) :
    Nat → List α → List α → List α
  | 0, _, visited => visited
  | fuel + 1, frontier, visited =>
      let next :=
        (successors edges frontier).filter fun node =>
          !visited.contains node
      reachableNodesWithin edges fuel next (visited ++ next)

private theorem reachableNodesWithin_sound [DecidableEq α]
    (edges : List (GraphEdge α)) (source : α) :
    ∀ fuel frontier visited,
      (∀ node ∈ frontier, GraphReaches edges source node) →
      (∀ node ∈ visited, GraphReaches edges source node) →
      ∀ target ∈ reachableNodesWithin edges fuel frontier visited,
        GraphReaches edges source target := by
  intro fuel
  induction fuel with
  | zero => simp [reachableNodesWithin]
  | succ fuel ih =>
      intro frontier visited frontierReachable visitedReachable
      let next :=
        (successors edges frontier).filter fun node =>
          !visited.contains node
      apply ih next (visited ++ next)
      · intro node member
        exact successor_reachable edges source node frontier
          frontierReachable (List.mem_filter.mp member).1
      · intro node member
        rcases List.mem_append.mp member with member | member
        · exact visitedReachable node member
        · exact successor_reachable edges source node frontier
            frontierReachable (List.mem_filter.mp member).1

def reachableWithin [DecidableEq α] (edges : List (GraphEdge α))
    (fuel : Nat) (source target : α) : Bool :=
  (reachableNodesWithin edges fuel [source] [source]).contains target

/-- Every node found by the executable bounded search has a declarative edge path. -/
theorem reachableWithin_sound [DecidableEq α]
    (edges : List (GraphEdge α)) (fuel : Nat) (source target : α)
    (accepted : reachableWithin edges fuel source target = true) :
    GraphReaches edges source target := by
  apply reachableNodesWithin_sound edges source fuel [source] [source]
  · simp only [List.mem_singleton]
    intro node equal
    subst node
    exact .refl source
  · simp only [List.mem_singleton]
    intro node equal
    subst node
    exact .refl source
  · simpa [reachableWithin] using accepted

def allReachableWithin [DecidableEq α] (nodes : List α)
    (edges : List (GraphEdge α)) (fuel : Nat) (source : α) : Bool :=
  nodes.all (reachableWithin edges fuel source)

def allCoreachableWithin [DecidableEq α] (nodes : List α)
    (edges : List (GraphEdge α)) (fuel : Nat) (targets : List α) : Bool :=
  !targets.isEmpty &&
    nodes.all fun node =>
      targets.any (reachableWithin edges fuel node)

/-- No admitted edge may return to its source within the finite vertex fuel. -/
def acyclicWithin [DecidableEq α] (edges : List (GraphEdge α))
    (fuel : Nat) : Bool :=
  edges.all fun edge =>
    !reachableWithin edges fuel edge.target edge.source

private def operationInputs : SemanticOperation → List ControlPlaceId
  | .initiate .. => []
  | .awaitUserTask _ _ input _ _
  | .awaitTimer _ _ input _ _
  | .awaitEffect _ _ input _ _ _
  | .duplicate _ _ input _
  | .terminate _ _ input => [input]
  | .synchronize _ _ inputs _ => inputs

private def operationOutputs : SemanticOperation → List ControlPlaceId
  | .initiate _ _ output
  | .awaitUserTask _ _ _ output _
  | .awaitTimer _ _ _ output _
  | .synchronize _ _ _ output => [output]
  | .awaitEffect _ _ _ output _ route =>
      output :: route.toList.map (·.output)
  | .duplicate _ _ _ outputs => outputs
  | .terminate .. => []

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

private def programEdges (program : Program) : List (GraphEdge OperationId) :=
  program.controlPlaces.flatMap fun place =>
    (producers program.operations place.id).flatMap fun producer =>
      (consumers program.operations place.id).map fun consumer =>
        { source := producer, target := consumer }

private def initiateIds (operations : List SemanticOperation) :
    List OperationId :=
  operations.filterMap fun
    | .initiate id _ _ => some id
    | _ => none

private def terminateIds (operations : List SemanticOperation) :
    List OperationId :=
  operations.filterMap fun
    | .terminate id _ _ => some id
    | _ => none

/-- Standalone graph backstop for decoded programs, independent of lowering equality. -/
def programGraphWellFormed (program : Program) : Bool :=
  let operationIds := program.operations.map (·.id)
  let starts := initiateIds program.operations
  let ends := terminateIds program.operations
  match starts with
  | [start] =>
      let edges := programEdges program
      let fuel := operationIds.length
      program.controlPlaces.all (fun place =>
        (producers program.operations place.id).length = 1 &&
          (consumers program.operations place.id).length = 1) &&
        allReachableWithin operationIds edges fuel start &&
        allCoreachableWithin operationIds edges fuel ends &&
        acyclicWithin edges fuel
  | _ => false

end BpmnSemantics.SemanticProcess
