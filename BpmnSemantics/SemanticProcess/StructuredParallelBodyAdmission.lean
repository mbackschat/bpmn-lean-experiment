import BpmnSemantics.SemanticProcess.GraphReachability

/-! SMIS-ADMIT-01 recognizes serial/paired regions and separate Ends, then counts task-cut automatic bursts. -/

namespace BpmnSemantics.SemanticProcess.StructuredParallelBody

inductive Kind where
  | start | task | fork | join | finish
  deriving Repr, DecidableEq

structure Vertex where
  id : String
  kind : Kind
  outputs : List String
  deriving Repr, DecidableEq

structure Bursts where
  entry : Nat
  resumption : Nat
  terminal : Nat
  deriving Repr, DecidableEq

def incomingCount (vertices : List Vertex) (id : String) : Nat :=
  (vertices.flatMap (·.outputs)).count id

def edges (vertices : List Vertex) : List (GraphEdge String) :=
  vertices.flatMap fun vertex => vertex.outputs.map fun target => ⟨vertex.id, target⟩

def aritiesValid (vertices : List Vertex) : Bool :=
  vertices.all fun vertex =>
    let inputs := incomingCount vertices vertex.id
    let outputs := vertex.outputs.length
    vertex.outputs.all (fun target => vertices.any (·.id == target)) &&
      match vertex.kind with
      | .start => inputs == 0 && outputs == 1
      | .task => inputs == 1 && outputs == 1
      | .fork => inputs == 1 && outputs ≥ 2
      | .join => inputs ≥ 2 && outputs == 1
      | .finish => inputs == 1 && outputs == 0

private def orderPending : Nat → List (Vertex × Nat) → Option (List Vertex)
  | 0, pending => if pending.isEmpty then some [] else none
  | fuel + 1, pending => do
      if pending.isEmpty then return []
      let (first, _) ← pending.find? (·.2 == 0)
      let remaining := (pending.filter (·.1.id != first.id)).map fun (vertex, incoming) =>
        (vertex, incoming - first.outputs.count vertex.id)
      let rest ← orderPending fuel remaining
      return first :: rest

/-- Kahn's indegree update preserves edge multiplicity without recounting the graph for each candidate. -/
def topologicalOrder (fuel : Nat) (vertices : List Vertex) : Option (List Vertex) :=
  orderPending fuel (vertices.map fun vertex => (vertex, incomingCount vertices vertex.id))

def replaceTarget (vertices : List Vertex) (removed replacement : String) : List Vertex :=
  vertices.map fun vertex =>
    { vertex with outputs := vertex.outputs.map fun id => if id == removed then replacement else id }

def contractAt (vertices : List Vertex) (vertex : Vertex) : Option (List Vertex) := do
  match vertex.kind with
  | .task =>
      let [next] := vertex.outputs | none
      return replaceTarget (vertices.filter (·.id != vertex.id)) vertex.id next
  | .fork =>
      let first ← vertex.outputs.head?
      let target ← vertices.find? (·.id == first)
      if vertex.outputs.all (· == first) && target.kind == .join &&
          incomingCount vertices first == vertex.outputs.length then
        let [next] := target.outputs | none
        return replaceTarget (vertices.filter fun node => node.id != vertex.id && node.id != first) vertex.id next
      else if vertex.outputs.eraseDups.length == vertex.outputs.length &&
          vertex.outputs.all (fun id => incomingCount vertices id == 1 &&
            vertices.any (fun node => node.id == id && node.kind == .finish)) then
        -- BPMN 13.3.4: this is an analysis sink, never a runtime join or first-End completion rule.
        return (vertices.filter fun node => !vertex.outputs.contains node.id).map fun node =>
          if node.id == vertex.id then { node with kind := .finish, outputs := [] } else node
      else none
  | _ => none

def paired : Nat → List Vertex → Bool
  | 0, _ => false
  | fuel + 1, vertices =>
      if vertices.length == 2 then
        match vertices.find? (·.kind == .start), vertices.find? (·.kind == .finish) with
        | some start, some finish => start.outputs == [finish.id] && finish.outputs.isEmpty
        | _, _ => false
      else match vertices.findSome? (contractAt vertices) with
        | none => false
        | some reduced => paired fuel reduced

structure Closure where
  arrivals : List String
  steps : Nat := 0
  waits : Nat := 0
  deriving Repr, DecidableEq

/-- Topological scanning counts each enabled operation once; a newly armed Task stops its own branch. -/
def close (vertices ordered : List Vertex) (arrivals : List String) : Closure :=
  ordered.foldl (init := { arrivals }) fun state vertex =>
    let enabled := if vertex.kind == .start then state.arrivals.contains vertex.id
      else state.arrivals.count vertex.id == incomingCount vertices vertex.id
    if !enabled then state
    else match vertex.kind with
      | .task => { state with steps := state.steps + 1, waits := state.waits + 1 }
      | .start => { state with arrivals := state.arrivals ++ vertex.outputs }
      | _ => { state with arrivals := state.arrivals ++ vertex.outputs, steps := state.steps + 1 }

/-- Only causally independent join inputs can have arrived before the selected Task completion. -/
def afterTask (vertices ordered : List Vertex) (task : Vertex) : Closure :=
  let descendants := reachedSet (edges vertices) vertices.length task.id
  let prior := (edges vertices).filterMap fun edge =>
    if !descendants.contains edge.source && descendants.contains edge.target &&
        vertices.any (fun vertex => vertex.id == edge.target && vertex.kind == .join) then some edge.target else none
  close vertices ordered (prior ++ task.outputs)

/-- A complete acyclic contraction certifies the selected body independently of burst limits. -/
def structureOrder (vertices : List Vertex) : Option (List Vertex) := do
  if !(vertices.all (fun vertex => !vertex.id.isEmpty) &&
      (vertices.map (·.id)).eraseDups.length == vertices.length && aritiesValid vertices &&
      (vertices.filter (·.kind == .start)).length == 1 && vertices.any (·.kind == .task)) then none
  else do
    let ordered ← topologicalOrder vertices.length vertices
    if !paired (vertices.length + 1) vertices then none else some ordered

def analyze (vertices : List Vertex) : Option Bursts := do
  let ordered ← structureOrder vertices
  let start ← vertices.find? (·.kind == .start)
  let resumed := (vertices.filter (·.kind == .task)).map (afterTask vertices ordered)
  return {
    entry := (close vertices ordered [start.id]).steps
    resumption := resumed.foldl (fun maximum result => max maximum result.steps) 0
    terminal := resumed.foldl (fun maximum result => if result.waits == 0 then max maximum result.steps else maximum) 0 }

end BpmnSemantics.SemanticProcess.StructuredParallelBody
