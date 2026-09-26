import BpmnSemantics.SemanticProcessContract

/-! # Bounded graph reachability

Finite search and saturation certificates shared by semantic graph admission and its laws.
-/

namespace BpmnSemantics.SemanticProcess

structure GraphEdge (α : Type) where
  source : α
  target : α
  deriving Repr, DecidableEq

/-- Consecutive directed edges materialized by a vertex path. -/
def directedPathEdges : List α → List (GraphEdge α)
  | source :: target :: rest =>
      { source, target } :: directedPathEdges (target :: rest)
  | _ => []

/-- A material vertex path whose every consecutive edge belongs to the selected graph. -/
def DirectedPath [DecidableEq α] (edges : List (GraphEdge α))
    (vertices : List α) : Prop :=
  ∀ edge ∈ directedPathEdges vertices, edge ∈ edges

/-- A nonempty material directed cycle, represented by a path returning to its first vertex. -/
def DirectedCycle [DecidableEq α] (edges : List (GraphEdge α))
    (vertices : List α) : Prop :=
  ∃ start middle,
    vertices = start :: middle ++ [start] ∧ DirectedPath edges vertices

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

/-- A finite directed-cycle witness: one retained edge plus a saturated return search through the same retained graph. -/
def CycleWitnessWithin [DecidableEq α] (edges : List (GraphEdge α))
    (fuel : Nat) : Prop :=
  ∃ edge ∈ edges,
    reachableWithin edges fuel edge.target edge.source = true

/-- Saturation-certified acyclicity rules out every cycle that survives a profile-selected edge cut. Therefore any full-graph cycle must contain at least one removed edge. -/
theorem saturation_certified_cut_excludes_uncut_cycle
    [DecidableEq α] (retainedEdges : List (GraphEdge α)) (fuel : Nat)
    (acyclic : acyclicClosed retainedEdges fuel = true) :
    ¬ CycleWitnessWithin retainedEdges fuel := by
  intro witness
  obtain ⟨edge, member, returns⟩ := witness
  simp [acyclicClosed] at acyclic
  have checked := acyclic edge member
  simp [returns] at checked

end BpmnSemantics.SemanticProcess
