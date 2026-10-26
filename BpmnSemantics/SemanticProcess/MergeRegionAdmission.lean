module

public import BpmnSemantics.SemanticProcess.StructuredParallelBodyAdmission

/-! CEA-ADMIT-01 merge-region recognition for the embedded completion profile. The structured-body
analysis has no merge vertex, because a task vertex has one input and every vertex with several inputs is a
join, so a region `fork → branches → merge → target → after → End` is recognized here and contracted to one
task vertex before that analysis runs. The scan has no quantified certificate; each retained model and
refusal fixes it by kernel decision. It carries no runtime or serialized authority. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.MergeRegion

open StructuredParallelBody

inductive RawKind where
  | vertex (kind : Kind)
  /-- A converging identity-only Exclusive merge, which never reaches the structured-body analysis. -/
  | merge
  deriving Repr, DecidableEq

structure RawVertex where
  id : String
  kind : RawKind
  outputs : List String
  deriving Repr, DecidableEq

/-- A recognized region, contracted to the task vertex `vertex` (the fork's id) followed by `finish`.
Every listed task is a User Task or a data-free Service Task; the target's own body is checked by the caller. -/
structure Region where
  vertex : String
  finish : String
  branches : List (List String)
  target : String
  targetScope : String
  after : List String
  deriving Repr, DecidableEq

def predecessors (vertices : List RawVertex) (id : String) : List RawVertex :=
  vertices.filter (·.outputs.contains id)

/-- A region's serial task, a User Task or a data-free Service Task: one input, one output, and no child scope. -/
def userTask (vertices : List RawVertex) (children : List (String × String)) (vertex : RawVertex) : Bool :=
  vertex.kind == .vertex .task && (List.lookup vertex.id children).isNone && vertex.outputs.length == 1 &&
    (predecessors vertices vertex.id).length == 1

/-- Walks back from a merge input through tasks, returning the branch in flow order and the first
vertex that is not one. -/
def walkBack (vertices : List RawVertex) (children : List (String × String)) :
    Nat → RawVertex → List String → Option (List String × RawVertex)
  | 0, _, _ => none
  | fuel + 1, current, branch =>
      if userTask vertices children current then
        match predecessors vertices current.id with
        | [previous] => walkBack vertices children fuel previous (current.id :: branch)
        | _ => none
      else some (branch, current)

/-- Walks forward from the target's successor through tasks to the first vertex that is not one. -/
def walkForward (vertices : List RawVertex) (children : List (String × String)) :
    Nat → String → List String → Option (List String × RawVertex)
  | 0, _, _ => none
  | fuel + 1, id, after => do
      let current ← vertices.find? (·.id == id)
      if userTask vertices children current then
        match current.outputs with
        | [next] => walkForward vertices children fuel next (after ++ [current.id])
        | _ => none
      else some (after, current)

/-- The region closed by `merge`; `none` refuses a merge outside the region shape. Each branch walks
back to one common fork whose every output starts a branch, so a partial merge, two forks and a fork
output straight into the merge are refused. -/
def regionAt (vertices : List RawVertex) (children : List (String × String)) (merge : RawVertex) :
    Option Region := do
  let fuel := vertices.length
  let inputs := predecessors vertices merge.id
  if merge.outputs.length != 1 || inputs.length < 2 then none else
  let walks ← inputs.mapM fun last => walkBack vertices children fuel last []
  let (_, fork) ← walks.head?
  if !(walks.all fun (branch, reached) => !branch.isEmpty && reached.kind == .vertex .fork && reached.id == fork.id)
  then none else
  let branches := walks.map (·.1)
  if fork.outputs.length != branches.length ||
      !(branches.all fun branch => branch.head?.any fork.outputs.contains) then none else
  let [targetId] := merge.outputs | none
  let target ← vertices.find? (·.id == targetId)
  let targetScope ← List.lookup target.id children
  if target.kind != .vertex .task || (predecessors vertices target.id).length != 1 then none else
  let [next] := target.outputs | none
  let (after, finish) ← walkForward vertices children fuel next []
  if finish.kind != .vertex .finish || (predecessors vertices finish.id).length != 1 then none else
  return { vertex := fork.id, finish := finish.id, branches, target := target.id, targetScope, after }

/-- Contracts every merge region of one body; `none` refuses a merge outside the region shape. -/
def contract (vertices : List RawVertex) (children : List (String × String)) :
    Option (List Vertex × List Region) := do
  let merges := vertices.filter (·.kind == .merge)
  let regions ← merges.mapM (regionAt vertices children)
  let removed := merges.map (·.id) ++ regions.flatMap fun region =>
    region.target :: region.branches.flatten ++ region.after
  let contracted ← (vertices.filter fun vertex => !removed.contains vertex.id).mapM fun vertex =>
    match regions.find? (·.vertex == vertex.id), vertex.kind with
    | some region, _ => some (⟨vertex.id, .task, [region.finish]⟩ : Vertex)
    | none, .merge => none
    | none, .vertex kind => some ⟨vertex.id, kind, vertex.outputs⟩
  return (contracted, regions)

/-- Counted tasks that run once per fork output: the target body's and those after the target that
`counted` selects. -/
def multiplicityWeightedExtra (region : Region) (targetTasks : Nat) (counted : String → Bool) : Nat :=
  (region.branches.length - 1) * (targetTasks + (region.after.filter counted).length)

end BpmnSemantics.SemanticProcess.MergeRegion
