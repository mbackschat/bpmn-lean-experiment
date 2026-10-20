import BpmnSemantics.CheckedProcessContract
import BpmnSemantics.SemanticProcess.StructuredCompositionAdmission
import BpmnSemantics.SemanticProcess.StructuredParallelBodyAdmission

/-! NSC-ADMIT-01 for the embedded completion profile. Each definition scope's body is projected to the
reviewed structured-body analysis, a Sub-Process appearing in its parent as a task vertex, so
contraction, pairing and separate Ends stay that owner's. This module adds only the scope tree, the
branch condition and the nested burst composition; it carries no runtime or serialized authority. -/

namespace BpmnSemantics.SemanticProcess.NestedScopeControl

open StructuredParallelBody

/-- Definition depth of the deepest admitted Sub-Process body below the root. -/
def depthLimit : Nat := 3

/-- Concurrent-wait ceiling shared with the parallel Multi-Instance capacity account. -/
def userTaskLimit : Nat := 128

structure Body where
  scope : String
  vertices : List Vertex
  /-- The child scope of every Sub-Process vertex of this body. -/
  children : List (String × String)
  userTasks : List String
  deriving Repr, DecidableEq

/-- BPMN 13.4.1: every path from a fork output reaches a task vertex before a join or End consumes it. -/
def reachesWork (vertices : List Vertex) : Nat → String → Bool
  | 0, _ => false
  | fuel + 1, id =>
      match vertices.find? (·.id == id) with
      | some vertex =>
          match vertex.kind with
          | .task => true
          | .fork => vertex.outputs.all (reachesWork vertices fuel)
          | _ => false
      | none => false

def branchesStartWithWork (vertices : List Vertex) : Bool :=
  vertices.all fun vertex => vertex.kind != .fork || vertex.outputs.all (reachesWork vertices vertices.length)

structure BodyScan where
  body : Body
  entry : Closure
  resumptions : List (String × Closure)

/-- Task vertices a scan armed: each has exactly its one input among the scan's arrivals. -/
def armed (vertices : List Vertex) (closure : Closure) : List String :=
  (vertices.filter fun vertex =>
    vertex.kind == .task && closure.arrivals.count vertex.id == incomingCount vertices vertex.id).map (·.id)

def scanBody (body : Body) : Option BodyScan := do
  let ordered ← structureOrder body.vertices
  if !branchesStartWithWork body.vertices then none
  else do
    let start ← body.vertices.find? (·.kind == .start)
    return { body, entry := close body.vertices ordered [start.id]
             resumptions := (body.vertices.filter (·.kind == .task)).map fun task =>
               (task.id, afterTask body.vertices ordered task) }

/-- A Sub-Process vertex's own step is `enterScope`; its child's entry scan runs in the same closure. -/
def entryBurst (scans : List BodyScan) : Nat → String → Nat
  | 0, _ => 0
  | fuel + 1, scope =>
      match scans.find? (·.body.scope == scope) with
      | none => 0
      | some scan =>
          scan.entry.steps + ((armed scan.body.vertices scan.entry).filterMap (fun vertex => List.lookup vertex scan.body.children)).foldl
            (fun total child => total + entryBurst scans fuel child) 0

/-- A resumption leaving its body without a wait may have completed it, which charges `completeScope` and
continues in the parent. Under a terminal fork the body may still be live, so this over-approximates. -/
def resumeBurst (scans : List BodyScan) (parents : List (String × (String × String))) (fuel : Nat) :
    Nat → String → String → Nat
  | 0, _, _ => 0
  | up + 1, scope, vertex =>
      match scans.find? (·.body.scope == scope) with
      | none => 0
      | some scan =>
          match List.lookup vertex scan.resumptions with
          | none => 0
          | some closure =>
              let children := ((armed scan.body.vertices closure).filterMap (fun vertex => List.lookup vertex scan.body.children)).foldl
                (fun total child => total + entryBurst scans fuel child) 0
              closure.steps + children + if closure.waits != 0 then 0 else
                1 + match List.lookup scope parents with
                  | some (owner, ownerVertex) => resumeBurst scans parents fuel up owner ownerVertex
                  | none => 0

def depthOf (parents : List (String × (String × String))) : Nat → String → Option Nat
  | 0, _ => none
  | fuel + 1, scope =>
      match List.lookup scope parents with
      | none => some 0
      | some (owner, _) => (depthOf parents fuel owner).map (· + 1)

/-- Validates the scope tree and every body, then composes the largest automatic closure; Start applies
`initiate` as the first step, while a child body's elided Start costs nothing. -/
def analyze (scopes : List DefinitionScope) (bodies : List Body) : Option Nat := do
  let root ← StructuredComposition.unique? (scopes.filter (·.parentScopeId.isNone))
  let parents := bodies.flatMap fun body => body.children.map fun (vertex, child) => (child, (body.scope, vertex))
  let declared := fun (child parent : String) =>
    (scopes.filter (·.id.value == child)).map (·.parentScopeId.map (·.value)) == [some parent]
  let fuel := scopes.length + 1
  let rootBody ← bodies.find? (·.scope == root.id.value)
  if !((bodies.map (·.scope)).eraseDups.length == bodies.length && bodies.length == scopes.length &&
      bodies.all (fun body => scopes.any (·.id.value == body.scope)) &&
      parents.all (fun (child, (parent, _)) => declared child parent) &&
      (parents.map (·.1)).eraseDups.length == parents.length && parents.length + 1 == scopes.length &&
      !parents.isEmpty &&
      scopes.all (fun scope => scope.id == root.id || (List.lookup scope.id.value parents).isSome) &&
      scopes.all (fun scope => match depthOf parents fuel scope.id.value with
        | some depth => depth ≤ depthLimit
        | none => false) &&
      (rootBody.vertices.filter (·.kind == .finish)).length == 1 &&
      (bodies.map (·.userTasks.length)).sum ≤ userTaskLimit) then none
  else do
    let scans ← bodies.mapM scanBody
    let resumed := bodies.flatMap fun body =>
      body.userTasks.map (resumeBurst scans parents fuel fuel body.scope)
    let maximum := resumed.foldl max (1 + entryBurst scans fuel root.id.value)
    if maximum ≤ scenarioClosureLimit then some maximum else none

private def checkedScope? (source : CheckedProcess) (nodeId : NodeId) : Option String := do
  let owner ← StructuredComposition.unique? (source.nodeScopes.filter (·.nodeId == nodeId))
  return owner.scopeId.value

def checkedVertex? (source : CheckedProcess) (node : CheckedNode) : Option (Vertex × Option String) := do
  let id := node.id.value
  let outputs := (source.sequenceFlows.filter (·.sourceId == node.id)).map (·.targetId.value)
  let kind ← match node with
    | .noneStartEvent _ => some Kind.start
    | .noneEndEvent _ => some .finish
    | .userTask _ _ none => some .task
    | .embeddedSubProcess _ _ => some .task
    | .parallelGateway _ .diverging => some .fork
    | .parallelGateway _ .converging => some .join
    | _ => none
  let child := match node with
    | .embeddedSubProcess _ child => some child.value
    | _ => none
  return (⟨id, kind, outputs⟩, child)

def checkedBodies (source : CheckedProcess) : Option (List Body) := do
  if !(source.sequenceFlows.all fun flow => flow.condition.isNone &&
      (checkedScope? source flow.sourceId).isSome && checkedScope? source flow.sourceId == checkedScope? source flow.targetId)
  then none
  else source.definitionScopes.mapM fun scope => do
    let members := source.nodes.filter fun node => checkedScope? source node.id == some scope.id.value
    let projected ← members.mapM (checkedVertex? source)
    return { scope := scope.id.value, vertices := projected.map (·.1)
             children := projected.filterMap fun (vertex, child) => child.map (vertex.id, ·)
             userTasks := members.filterMap fun node => match node with
               | .userTask id _ _ => some id.value
               | _ => none }

/-- NSC-ADMIT-01 over the checked graph; `none` refuses it, otherwise the admitted largest closure. -/
def checkedAnalysis (source : CheckedProcess) : Option Nat := do
  if !(source.nodes.all fun node => (checkedScope? source node.id).isSome) then none
  else analyze source.definitionScopes (← checkedBodies source)

private def operationScope? (program : Program) (operation : SemanticOperation) : Option String := do
  let owner ← StructuredComposition.unique? (program.operationScopes.filter (·.operationId == operation.id))
  return owner.scopeId.value

def operationInputs : SemanticOperation → List ControlPlaceId
  | .enterScope _ _ input .. | .awaitUserTask _ _ input .. | .duplicate _ _ input _
  | .reachNoneEnd _ _ input => [input]
  | .synchronize _ _ inputs _ => inputs
  | _ => []

/-- The unique same-scope operation consuming `place`. -/
def consumer? (program : Program) (scope : String) (place : ControlPlaceId) : Option String := do
  let consumer ← StructuredComposition.unique? (program.operations.filter fun op => (operationInputs op).contains place)
  if operationScope? program consumer == some scope then some consumer.id.value else none

private def parentOutput? (program : Program) (child : DefinitionScopeId) : Option ControlPlaceId := do
  let completion ← StructuredComposition.unique? (program.operations.filter fun op => match op with
    | .completeScope _ _ scopeId _ => scopeId == child
    | _ => false)
  match completion with
  | .completeScope _ _ _ (some output) =>
      if operationScope? program completion == some child.value then some output else none
  | _ => none

/-- The lowered child Start is elided; this synthetic vertex stands for the child's entry place. -/
def childStart (scope : String) : String := "start:" ++ scope

def operationVertex? (program : Program) (scope : String) (operation : SemanticOperation) :
    Option (Vertex × Option String) := do
  let id := operation.id.value
  let follow := fun (places : List ControlPlaceId) => places.mapM (consumer? program scope)
  match operation with
  | .initiate _ _ output => return (⟨id, .start, ← follow [output]⟩, none)
  | .awaitUserTask _ _ _ output task =>
      if task.metadata.isSome then none else return (⟨id, .task, ← follow [output]⟩, none)
  | .duplicate _ _ _ outputs => return (⟨id, .fork, ← follow outputs⟩, none)
  | .synchronize _ _ _ output => return (⟨id, .join, ← follow [output]⟩, none)
  | .reachNoneEnd .. => return (⟨id, .finish, []⟩, none)
  | .enterScope _ _ _ _ child =>
      return (⟨id, .task, ← follow [← parentOutput? program child]⟩, some child.value)
  | _ => none

def programBodies (program : Program) : Option (List Body) := do
  let operations := program.operations.filter fun op => !StructuredComposition.isScopeCompletion op
  program.definitionScopes.mapM fun scope => do
    let members ← (operations.filterM fun op => do
      return (← operationScope? program op) == scope.id.value)
    let projected ← members.mapM (operationVertex? program scope.id.value)
    let entries ← operations.filterMapM fun op => match op with
      | .enterScope _ _ _ childEntry child =>
          if child == scope.id then (consumer? program scope.id.value childEntry).map some else some none
      | _ => some none
    let start := match entries with
      | [entry] => [⟨childStart scope.id.value, Kind.start, [entry]⟩]
      | _ => []
    return { scope := scope.id.value, vertices := start ++ projected.map (·.1)
             children := projected.filterMap fun (vertex, child) => child.map (vertex.id, ·)
             userTasks := members.filterMap fun op => match op with
               | .awaitUserTask id .. => some id.value
               | _ => none }

/-- NSC-ADMIT-01 over the Program, independent of the checked graph; `none` refuses it. -/
def programAnalysis (program : Program) : Option Nat := do
  let root ← StructuredComposition.unique? (program.definitionScopes.filter (·.parentScopeId.isNone))
  let completions := program.operations.filter StructuredComposition.isScopeCompletion
  let rootCompleted := completions.filter fun op => match op with
    | .completeScope _ _ scopeId none => scopeId == root.id
    | _ => false
  if !(program.identity.sourceOverlay.isNone && program.internalSchedulingMode == .rejectObservableChoice &&
      program.compensationActivityRetention.isNone && program.compensationEventSubProcessSnapshots.isNone &&
      program.compensationExecution.isNone && program.interruptingMessageEventSubProcesses.isEmpty &&
      program.scopeLocalData.isEmpty && rootCompleted.length == 1 &&
      completions.length == program.definitionScopes.length &&
      program.operations.all fun op => (operationScope? program op).isSome) then none
  else analyze program.definitionScopes (← programBodies program)

end BpmnSemantics.SemanticProcess.NestedScopeControl
