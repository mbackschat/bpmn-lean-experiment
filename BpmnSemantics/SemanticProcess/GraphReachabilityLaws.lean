import BpmnSemantics.SemanticProcess.GraphValidation

/-! # Graph-reachability laws

This module relates executable bounded search and saturation certificates to declarative paths. It does not participate in semantic transitions.
-/

namespace BpmnSemantics.SemanticProcess

/-- Declarative reflexive-transitive reachability over explicit graph edges. -/
inductive GraphReaches (edges : List (GraphEdge α)) : α → α → Prop where
  | refl (node : α) : GraphReaches edges node node
  | step {source middle target : α}
      (path : GraphReaches edges source middle)
      (edge : { source := middle, target := target } ∈ edges) :
      GraphReaches edges source target

private theorem successor_reachable [DecidableEq α]
    (edges : List (GraphEdge α)) (source target : α) (frontier : List α)
    (frontierReachable : ∀ node ∈ frontier, GraphReaches edges source node)
    (member : target ∈ successors edges frontier) :
    GraphReaches edges source target := by
  simp [successors] at member
  obtain ⟨edge, edgeMember, sourceMember, rfl⟩ := member
  exact .step (frontierReachable edge.source sourceMember) edgeMember

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
  · simpa [reachableWithin, reachedSet] using accepted

private theorem visited_subset_reachableNodesWithin [DecidableEq α]
    (edges : List (GraphEdge α)) (target : α) :
    ∀ fuel frontier visited,
      target ∈ visited →
        target ∈ reachableNodesWithin edges fuel frontier visited := by
  intro fuel
  induction fuel with
  | zero => simp [reachableNodesWithin]
  | succ fuel ih =>
      intro frontier visited member
      simp only [reachableNodesWithin]
      apply ih
      exact List.mem_append_left _ member

/-- A saturated reached set contains every declaratively reachable node. -/
theorem reachedSet_complete [DecidableEq α]
    (edges : List (GraphEdge α)) (fuel : Nat) (source target : α)
    (closed : reachedClosed edges fuel source = true)
    (path : GraphReaches edges source target) :
    target ∈ reachedSet edges fuel source := by
  simp only [reachedClosed, List.all_eq_true] at closed
  induction path with
  | refl =>
      exact visited_subset_reachableNodesWithin edges source fuel [source]
        [source] (by simp)
  | step path edge ih =>
      have edgeClosed := closed _ edge
      simp [ih] at edgeClosed
      exact edgeClosed

/-- Saturation turns the bounded membership test into a complete path detector. -/
theorem reachableWithin_complete [DecidableEq α]
    (edges : List (GraphEdge α)) (fuel : Nat) (source target : α)
    (closed : reachedClosed edges fuel source = true)
    (path : GraphReaches edges source target) :
    reachableWithin edges fuel source target = true := by
  simpa [reachableWithin, reachedSet] using
    reachedSet_complete edges fuel source target closed path

theorem graphReaches_trans (edges : List (GraphEdge α)) {source middle target : α}
    (left : GraphReaches edges source middle)
    (right : GraphReaches edges middle target) :
    GraphReaches edges source target := by
  induction right with
  | refl => exact left
  | step _ edge ih => exact .step ih edge

private theorem directedPath_tail [DecidableEq α]
    (edges : List (GraphEdge α)) (source next : α) (rest : List α)
    (path : DirectedPath edges (source :: next :: rest)) :
    DirectedPath edges (next :: rest) := by
  intro edge edgeOnTail
  apply path edge
  exact List.mem_cons_of_mem _ edgeOnTail

/-- A material vertex path induces the existing declarative reachability relation. -/
theorem directedPath_graphReaches [DecidableEq α]
    (edges : List (GraphEdge α)) (source target : α) :
    ∀ middle,
      DirectedPath edges (source :: middle ++ [target]) →
        GraphReaches edges source target
  | [], path =>
      .step (.refl source) (path _ (by simp [directedPathEdges]))
  | next :: rest, path =>
      graphReaches_trans edges
        (.step (.refl source) (path _ (by simp [directedPathEdges])))
        (directedPath_graphReaches edges next target rest
          (directedPath_tail edges source next (rest ++ [target]) path))

/-- Every accepted saturation-certified graph excludes a return path across each edge. -/
theorem acyclicClosed_sound [DecidableEq α]
    (edges : List (GraphEdge α)) (fuel : Nat)
    (accepted : acyclicClosed edges fuel = true)
    (edge : GraphEdge α) (member : edge ∈ edges) :
    ¬ GraphReaches edges edge.target edge.source := by
  intro path
  simp only [acyclicClosed, List.all_eq_true] at accepted
  have edgeFact := accepted edge member
  simp only [Bool.and_eq_true] at edgeFact
  have detected :=
    reachableWithin_complete edges fuel edge.target edge.source
      edgeFact.1 path
  simp_all

/-- Saturation-certified acyclicity excludes every material directed cycle, independent of the cycle's listed path length. -/
theorem acyclicClosed_excludes_directedCycle [DecidableEq α]
    (edges : List (GraphEdge α)) (fuel : Nat)
    (accepted : acyclicClosed edges fuel = true) (vertices : List α) :
    ¬ DirectedCycle edges vertices := by
  intro cycle
  obtain ⟨start, middle, rfl, path⟩ := cycle
  cases middle with
  | nil =>
      let edge : GraphEdge α := { source := start, target := start }
      have member : edge ∈ edges := path edge (by simp [edge, directedPathEdges])
      exact acyclicClosed_sound edges fuel accepted edge member (.refl start)
  | cons next rest =>
      let edge : GraphEdge α := { source := start, target := next }
      have member : edge ∈ edges := path edge (by simp [edge, directedPathEdges])
      have tail : DirectedPath edges (next :: rest ++ [start]) :=
        directedPath_tail edges start next (rest ++ [start]) path
      exact acyclicClosed_sound edges fuel accepted edge member
        (directedPath_graphReaches edges next start rest tail)

/-- Declarative reachability is antisymmetric on a saturation-certified graph. -/
theorem graphReaches_antisymm [DecidableEq α]
    (edges : List (GraphEdge α)) (fuel : Nat)
    (accepted : acyclicClosed edges fuel = true)
    {left right : α}
    (forward : GraphReaches edges left right)
    (backward : GraphReaches edges right left) :
    left = right := by
  cases forward with
  | refl => rfl
  | step prior edgeMember =>
      exfalso
      exact acyclicClosed_sound edges fuel accepted _ edgeMember
        (graphReaches_trans edges backward prior)

end BpmnSemantics.SemanticProcess
