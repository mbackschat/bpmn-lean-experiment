module

public import BpmnSemantics.CheckedProcessContract
public import BpmnSemantics.SemanticProcess.MergeRegionAdmission
public import BpmnSemantics.SemanticProcess.StructuredCompositionAdmission
public import BpmnSemantics.SemanticProcess.StructuredParallelBodyAdmission

/-! NSC-ADMIT-01 for the embedded completion profile. Each definition scope's body is projected to the
reviewed structured-body analysis, a Sub-Process appearing in its parent as a task vertex, so
contraction, pairing and separate Ends stay that owner's. This module adds only the scope tree, the
branch condition and the nested burst composition; it carries no runtime or serialized authority.
CEA-ADMIT-01 merge regions are contracted first by `MergeRegion`; their target bodies stay in the tree
and their per-arrival bursts are composed here.

CALLN-ADMIT-01 adds Process-root Calls: a Call is a task vertex of the caller root whose called Process
body, a serial chain, is expanded once per call site below it, so the burst composition and the task
bound see the call tree exactly as a Sub-Process tree. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.NestedScopeControl

open StructuredParallelBody

/-- Definition depth of the deepest admitted Sub-Process body below the root. -/
def depthLimit : Nat := 3

/-- Concurrent-wait ceiling shared with the parallel Multi-Instance capacity account. -/
def userTaskLimit : Nat := 128

/-- Call nesting below the caller root, a Call in the caller being depth one (CALLN-ADMIT-01). -/
def callDepthLimit : Nat := 3

/-- The vertices of a called Process body between its None Start and None End (CALLN-ADMIT-01). -/
def calledBodyVertexLimit : Nat := 3

structure Body where
  scope : String
  vertices : List Vertex
  /-- The child scope of every Sub-Process vertex of this body, merge targets included. -/
  children : List (String × String)
  userTasks : List String
  regions : List MergeRegion.Region := []
  /-- The called Process root scope of every Call vertex of this body. -/
  calls : List (String × String) := []
  deriving Repr, DecidableEq

/-- A body before merge-region contraction. -/
structure RawBody where
  scope : String
  vertices : List MergeRegion.RawVertex
  children : List (String × String)
  userTasks : List String
  calls : List (String × String) := []

def contractBody (raw : RawBody) : Option Body := do
  let (vertices, regions) ← MergeRegion.contract raw.vertices raw.children
  return { scope := raw.scope, vertices, children := raw.children, userTasks := raw.userTasks, regions,
           calls := raw.calls }

/-- A merge target's body is a serial chain of User Tasks; it owns no Sub-Process, gateway or region. -/
def serialTargetBody (body : Body) : Bool :=
  body.children.isEmpty && body.calls.isEmpty && body.regions.isEmpty && !body.userTasks.isEmpty &&
    body.vertices.all (fun vertex => vertex.kind == .start || vertex.kind == .finish || vertex.kind == .task) &&
    (body.vertices.filter (·.kind == .task)).length == body.userTasks.length

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

/-- What arming charges beyond the vertex's own step: a Sub-Process vertex's child entry, and for a
region vertex, whose fork runs in the same closure, one arming per branch. -/
def armedCost (scan : BodyScan) (closure : Closure) (enter : String → Nat) : Nat :=
  (armed scan.body.vertices closure).foldl (fun total vertex =>
    match scan.body.regions.find? (·.vertex == vertex) with
    | some region => total + region.branches.length
    | none => match List.lookup vertex scan.body.children with
      | some child => total + enter child
      | none => total) 0

/-- A Sub-Process vertex's own step is `enterScope`; its child's entry scan runs in the same closure. -/
def entryBurst (scans : List BodyScan) : Nat → String → Nat
  | 0, _ => 0
  | fuel + 1, scope =>
      match scans.find? (·.body.scope == scope) with
      | none => 0
      | some scan => scan.entry.steps + armedCost scan scan.entry (fun child => entryBurst scans fuel child)

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
              closure.steps + armedCost scan closure (entryBurst scans fuel) + if closure.waits != 0 then 0 else
                1 + match List.lookup scope parents with
                  | some (owner, ownerVertex) => resumeBurst scans parents fuel up owner ownerVertex
                  | none => 0

/-- CEA-ADMIT-01 per-arrival charges of a region's tasks, never summed across arrivals. A branch's last
task charges the merge pass, `enterScope` and the target's first arming; the target's last task charges
its End and `completeScope`, then the first task after the target or the region End's resumption. -/
def regionTasks (bodies : List Body) (resume : String → String → Nat) (scope : String)
    (region : MergeRegion.Region) : List Nat :=
  let targetTasks := ((bodies.find? (·.scope == region.targetScope)).map (·.userTasks.length)).getD 0
  let last := fun (count index final : Nat) => if index + 1 < count then 1 else final
  let leave := 2 + if region.after.isEmpty then resume scope region.vertex else 1
  region.branches.flatMap (fun branch => (List.range branch.length).map fun index => last branch.length index 3) ++
    (List.range targetTasks).map (fun index => last targetTasks index leave) ++
    (List.range region.after.length).map fun index => last region.after.length index (resume scope region.vertex)

def depthOf (parents : List (String × (String × String))) : Nat → String → Option Nat
  | 0, _ => none
  | fuel + 1, scope =>
      match List.lookup scope parents with
      | none => some 0
      | some (owner, _) => (depthOf parents fuel owner).map (· + 1)

/-- A called Process body is a serial chain of one to three User Task or Call vertices (CALLN-ADMIT-01). -/
def serialCalledBody (body : Body) : Bool :=
  let vertices := body.vertices.filter (·.kind == .task)
  body.children.isEmpty && body.regions.isEmpty &&
    1 ≤ vertices.length && vertices.length ≤ calledBodyVertexLimit &&
    vertices.length == body.userTasks.length + body.calls.length &&
    body.vertices.all (fun vertex => vertex.kind == .start || vertex.kind == .finish || vertex.kind == .task)

/-- The expanded call tree below one body: its copies keyed by call site, their parents and the
definition each site invokes. -/
structure Expansion where
  bodies : List Body
  parents : List (String × (String × String))
  invoked : List (String × String)

/-- Expands the call tree once per call site, so one definition called from two sites is analysed twice.
A site key joins its caller key and Call vertex with `>`, which no XML ID or derived operation ID
contains, so it never meets a definition scope. `remaining` is the Call depth still allowed below `key`;
a call cycle exhausts it. -/
def expandSite (called : List (String × Body)) : Nat → String → Body → Option Expansion
  | 0, key, body =>
      if body.calls.isEmpty then some ⟨[{ body with scope := key }], [], []⟩ else none
  | remaining + 1, key, body => do
      let sites ← body.calls.mapM fun (vertex, definition) => do
        let calledBody ← List.lookup definition called
        let site := key ++ ">" ++ vertex
        let below ← expandSite called remaining site calledBody
        return ((vertex, site), { below with
          parents := (site, (key, vertex)) :: below.parents
          invoked := (site, definition) :: below.invoked })
      return ⟨{ body with scope := key, children := body.children ++ sites.map (·.1) } ::
          sites.flatMap (·.2.bodies), sites.flatMap (·.2.parents), sites.flatMap (·.2.invoked)⟩

/-- What arming invokes: a Call vertex's definition and, recursively, its body's leading Calls. -/
def armedDefinitions (scan : BodyScan) (closure : Closure) (invoked : List (String × String))
    (enter : String → List String) : List String :=
  (armed scan.body.vertices closure).flatMap fun vertex =>
    match List.lookup vertex scan.body.children with
    | some child => (List.lookup child invoked).toList ++ enter child
    | none => []

def entryDefinitions (scans : List BodyScan) (invoked : List (String × String)) :
    Nat → String → List String
  | 0, _ => []
  | fuel + 1, scope =>
      match scans.find? (·.body.scope == scope) with
      | none => []
      | some scan => armedDefinitions scan scan.entry invoked (entryDefinitions scans invoked fuel)

/-- Mirrors `resumeBurst`; leaving a merge target continues as the region vertex when nothing follows the
target, exactly as `regionTasks` charges it. -/
def resumeDefinitions (scans : List BodyScan) (parents : List (String × (String × String)))
    (invoked : List (String × String)) (fuel : Nat) : Nat → String → String → List String
  | 0, _, _ => []
  | up + 1, scope, vertex =>
      match scans.find? (·.body.scope == scope) with
      | none => []
      | some scan =>
          match List.lookup vertex scan.resumptions with
          | none =>
              match scan.body.regions.find? (·.target == vertex) with
              | some region =>
                  if region.after.isEmpty then resumeDefinitions scans parents invoked fuel up scope region.vertex
                  else []
              | none => []
          | some closure =>
              armedDefinitions scan closure invoked (entryDefinitions scans invoked fuel) ++
                if closure.waits != 0 then [] else
                  match List.lookup scope parents with
                  | some (owner, ownerVertex) => resumeDefinitions scans parents invoked fuel up owner ownerVertex
                  | none => []

/-- CALLN-ONCE-01: no closure invokes two instances of one definition. Every task vertex's resumption is
checked, a superset of the closures a journey reaches. -/
def invokesEachDefinitionOnce (scans : List BodyScan) (parents : List (String × (String × String)))
    (invoked : List (String × String)) (fuel : Nat) (root : String) : Bool :=
  let distinct := fun (definitions : List String) => definitions.eraseDups.length == definitions.length
  distinct (entryDefinitions scans invoked fuel root) &&
    scans.all fun scan => scan.resumptions.all fun (vertex, _) =>
      distinct (resumeDefinitions scans parents invoked fuel fuel scan.body.scope vertex)

def reaches (vertices : List Vertex) : Nat → String → String → Bool
  | 0, _, _ => false
  | fuel + 1, source, target =>
      match vertices.find? (·.id == source) with
      | some vertex => vertex.outputs.any fun next => next == target || reaches vertices fuel next target
      | none => false

/-- The definitions containing a Call in the expanded call tree below `site`, the site's own included. -/
def callBearing (expanded : List Body) (invoked : List (String × String)) (called : List (String × Body)) :
    Nat → String → List String
  | 0, _ => []
  | fuel + 1, site =>
      let own := match List.lookup site invoked with
        | some definition => if ((List.lookup definition called).map (·.calls.isEmpty)) == some false
            then [definition] else []
        | none => []
      let children := ((expanded.find? (·.scope == site)).map (·.children)).getD []
      own ++ children.flatMap fun (_, child) => callBearing expanded invoked called fuel child

/-- CALLN-SHARED-01: the call trees of two concurrent Calls of the caller root share no definition that
contains a Call. The root body is a structured fork-join body with one End, so two of its vertices lie on
distinct branches of one Parallel block exactly when neither reaches the other. -/
def sharesNoCallBearingDefinition (rootBody : Body) (expanded : List Body) (invoked : List (String × String))
    (called : List (String × Body)) (fuel : Nat) : Bool :=
  let sites := rootBody.children.filter fun (_, site) => (List.lookup site invoked).isSome
  let width := rootBody.vertices.length
  sites.zipIdx.all fun ((left, leftSite), index) => (sites.drop (index + 1)).all fun (right, rightSite) =>
    reaches rootBody.vertices width left right || reaches rootBody.vertices width right left ||
      !(callBearing expanded invoked called fuel leftSite).any
        (callBearing expanded invoked called fuel rightSite).contains

/-- Validates the caller's scope tree and every body, expands the called bodies per call site, then
composes the largest automatic closure; Start applies `initiate` as the first step, while a child or
called body's elided Start costs nothing. -/
def analyze (allScopes : List DefinitionScope) (allBodies : List Body) : Option Nat := do
  let calledRoots := (allBodies.flatMap fun body => body.calls.map (·.2)).eraseDups
  let roots := allScopes.filter (·.parentScopeId.isNone)
  let root ← StructuredComposition.unique? (roots.filter fun scope => !calledRoots.contains scope.id.value)
  let called ← calledRoots.mapM fun scope => do
    let body ← allBodies.find? (·.scope == scope)
    if roots.any (·.id.value == scope) && serialCalledBody body then some (scope, body) else none
  let scopes := allScopes.filter fun scope => !calledRoots.contains scope.id.value
  let bodies := allBodies.filter fun body => !calledRoots.contains body.scope
  let parents := bodies.flatMap fun body => body.children.map fun (vertex, child) => (child, (body.scope, vertex))
  let declared := fun (child parent : String) =>
    (scopes.filter (·.id.value == child)).map (·.parentScopeId.map (·.value)) == [some parent]
  let fuel := scopes.length + 1
  let rootBody ← bodies.find? (·.scope == root.id.value)
  let regions := bodies.flatMap (·.regions)
  if !((allBodies.map (·.scope)).eraseDups.length == allBodies.length && allBodies.length == allScopes.length &&
      bodies.length == scopes.length &&
      bodies.all (fun body => scopes.any (·.id.value == body.scope)) &&
      parents.all (fun (child, (parent, _)) => declared child parent) &&
      (parents.map (·.1)).eraseDups.length == parents.length && parents.length + 1 == scopes.length &&
      -- A caller without Sub-Process needs a Call to leave the exact-multiset class.
      (!parents.isEmpty || !called.isEmpty) &&
      scopes.all (fun scope => scope.id == root.id || (List.lookup scope.id.value parents).isSome) &&
      scopes.all (fun scope => match depthOf parents fuel scope.id.value with
        | some depth => depth ≤ depthLimit
        | none => false) &&
      (rootBody.vertices.filter (·.kind == .finish)).length == 1 && rootBody.regions.isEmpty &&
      -- Stage A admits Calls in the caller root only, never in a Sub-Process or merge body.
      bodies.all (fun body => body.scope == root.id.value || body.calls.isEmpty) &&
      regions.all (fun region => (bodies.find? (·.scope == region.targetScope)).any serialTargetBody)) then none
  else do
    let expansion ← expandSite called callDepthLimit root.id.value rootBody
    let expanded := expansion.bodies ++ bodies.filter (·.scope != root.id.value)
    let allParents := parents ++ expansion.parents
    let calledTasks := ((expansion.bodies.filter (·.scope != root.id.value)).map (·.userTasks.length)).sum
    -- CEA-ADMIT-01 weights the target body's tasks and those after it once per fork output.
    let weighted := (bodies.map (·.userTasks.length)).sum + (regions.map fun region =>
      MergeRegion.multiplicityWeightedExtra region
        (((bodies.find? (·.scope == region.targetScope)).map (·.userTasks.length)).getD 0)).sum
    let expandedFuel := expanded.length + 1
    if !((expansion.invoked.map (·.2)).eraseDups.length == called.length &&
        weighted + calledTasks ≤ userTaskLimit) then none
    else do
      let scans ← expanded.mapM scanBody
      -- Without Calls both rules hold vacuously; skipping their scans keeps a Call-free model's kernel
      -- reduction at its prior cost, since the resumption scan of a 128-task body broke the 3 GiB fixture
      -- ceiling (`ConcurrentEmbeddedActivationsAdmissionConformance`, exit 137, 2026-10-23).
      if !(called.isEmpty ||
          invokesEachDefinitionOnce scans allParents expansion.invoked expandedFuel root.id.value &&
            sharesNoCallBearingDefinition ((expanded.find? (·.scope == root.id.value)).getD rootBody) expanded
              expansion.invoked called expandedFuel) then none
      else
        let resume := resumeBurst scans allParents expandedFuel expandedFuel
        let targets := regions.map (·.targetScope)
        let resumed := expanded.flatMap fun body =>
          let inRegion := body.regions.flatMap fun region => region.branches.flatten ++ region.after
          if targets.contains body.scope then []
          else (body.userTasks.filter fun task => !inRegion.contains task).map (resume body.scope)
        let regional := expanded.flatMap fun body => body.regions.flatMap (regionTasks expanded resume body.scope)
        let maximum := (resumed ++ regional).foldl max (1 + entryBurst scans expandedFuel root.id.value)
        if maximum ≤ scenarioClosureLimit then some maximum else none

def controlCheckedScope? (source : CheckedProcess) (nodeId : NodeId) : Option String := do
  let owner ← StructuredComposition.unique? (source.nodeScopes.filter (·.nodeId == nodeId))
  return owner.scopeId.value

def checkedVertex? (source : CheckedProcess) (node : CheckedNode) :
    Option (MergeRegion.RawVertex × Option String) := do
  let id := node.id.value
  let outputs := (source.sequenceFlows.filter (·.sourceId == node.id)).map (·.targetId.value)
  let kind ← match node with
    | .noneStartEvent _ => some (MergeRegion.RawKind.vertex .start)
    | .noneEndEvent _ => some (.vertex .finish)
    | .userTask _ _ none => some (.vertex .task)
    | .embeddedSubProcess _ _ => some (.vertex .task)
    | .callActivity _ _ .empty => some (.vertex .task)
    | .parallelGateway _ .diverging => some (.vertex .fork)
    | .parallelGateway _ .converging => some (.vertex .join)
    | .exclusiveMerge _ => some .merge
    | _ => none
  let child := match node with
    | .embeddedSubProcess _ child => some child.value
    | _ => none
  return (⟨id, kind, outputs⟩, child)

/-- The parentless definition scope of the Process a Call names. -/
def calledRoot? (source : CheckedProcess) (calledProcessId : ProcessId) : Option String := do
  let root ← StructuredComposition.unique? (source.definitionScopes.filter fun scope =>
    scope.parentScopeId.isNone && scope.originElementId.value == calledProcessId.value)
  return root.id.value

def checkedBodies (source : CheckedProcess) : Option (List RawBody) := do
  if !(source.sequenceFlows.all fun flow => flow.condition.isNone &&
      (controlCheckedScope? source flow.sourceId).isSome && controlCheckedScope? source flow.sourceId == controlCheckedScope? source flow.targetId)
  then none
  else source.definitionScopes.mapM fun scope => do
    let members := source.nodes.filter fun node => controlCheckedScope? source node.id == some scope.id.value
    let projected ← members.mapM (checkedVertex? source)
    let calls ← members.filterMapM fun node => match node with
      | .callActivity id calledProcessId _ => (calledRoot? source calledProcessId).map fun root => some (id.value, root)
      | _ => some none
    return { scope := scope.id.value, vertices := projected.map (·.1)
             children := projected.filterMap fun (vertex, child) => child.map (vertex.id, ·)
             userTasks := members.filterMap fun node => match node with
               | .userTask id _ _ => some id.value
               | _ => none
             calls }

/-- NSC-ADMIT-01 over the checked graph; `none` refuses it, otherwise the admitted largest closure. -/
def checkedAnalysis (source : CheckedProcess) : Option Nat := do
  if !(source.nodes.all fun node => (controlCheckedScope? source node.id).isSome) then none
  else analyze source.definitionScopes (← (← checkedBodies source).mapM contractBody)

def controlOperationScope? (program : Program) (operation : SemanticOperation) : Option String := do
  let owner ← StructuredComposition.unique? (program.operationScopes.filter (·.operationId == operation.id))
  return owner.scopeId.value

def operationInputs : SemanticOperation → List ControlPlaceId
  | .enterScope _ _ input .. | .awaitUserTask _ _ input .. | .duplicate _ _ input _
  | .reachNoneEnd _ _ input | .invokeProcess _ _ input .. => [input]
  | .synchronize _ _ inputs _ | .mergeExclusive _ _ inputs _ => inputs
  | _ => []

/-- The unique same-scope operation consuming `place`. -/
def consumer? (program : Program) (scope : String) (place : ControlPlaceId) : Option String := do
  let consumer ← StructuredComposition.unique? (program.operations.filter fun op => (operationInputs op).contains place)
  if controlOperationScope? program consumer == some scope then some consumer.id.value else none

def controlParentOutput? (program : Program) (child : DefinitionScopeId) : Option ControlPlaceId := do
  let completion ← StructuredComposition.unique? (program.operations.filter fun op => match op with
    | .completeScope _ _ scopeId _ => scopeId == child
    | _ => false)
  match completion with
  | .completeScope _ _ _ (some output) =>
      if controlOperationScope? program completion == some child.value then some output else none
  | _ => none

/-- The caller output of the one empty-data return an invocation names, owned by its called root. -/
def callerOutput? (program : Program) (calledRoot : DefinitionScopeId) (returnOperationId : OperationId) :
    Option ControlPlaceId := do
  let returned ← StructuredComposition.unique? (program.operations.filter (·.id == returnOperationId))
  match returned with
  | .returnProcess _ _ _ root output .empty =>
      if root == calledRoot && controlOperationScope? program returned == some calledRoot.value then some output else none
  | _ => none

def isCallReturn : SemanticOperation → Bool
  | .returnProcess .. => true
  | _ => false

/-- The lowered child Start is elided; this synthetic vertex stands for the child's entry place. -/
def childStart (scope : String) : String := "start:" ++ scope

def operationVertex? (program : Program) (scope : String) (operation : SemanticOperation) :
    Option (MergeRegion.RawVertex × Option String) := do
  let id := operation.id.value
  let follow := fun (places : List ControlPlaceId) => places.mapM (consumer? program scope)
  match operation with
  | .initiate _ _ output => return (⟨id, .vertex .start, ← follow [output]⟩, none)
  | .awaitUserTask _ _ _ output task =>
      if task.metadata.isSome then none else return (⟨id, .vertex .task, ← follow [output]⟩, none)
  | .duplicate _ _ _ outputs => return (⟨id, .vertex .fork, ← follow outputs⟩, none)
  | .synchronize _ _ _ output => return (⟨id, .vertex .join, ← follow [output]⟩, none)
  | .mergeExclusive _ _ _ output => return (⟨id, .merge, ← follow [output]⟩, none)
  | .reachNoneEnd .. => return (⟨id, .vertex .finish, []⟩, none)
  | .enterScope _ _ _ _ child =>
      return (⟨id, .vertex .task, ← follow [← controlParentOutput? program child]⟩, some child.value)
  | .invokeProcess _ _ _ _ calledRoot calledEntry returnOperationId .empty => do
      let output ← callerOutput? program calledRoot returnOperationId
      let _ ← consumer? program calledRoot.value calledEntry
      return (⟨id, .vertex .task, ← follow [output]⟩, none)
  | _ => none

def programBodies (program : Program) : Option (List RawBody) := do
  let operations := program.operations.filter fun op => !StructuredComposition.isScopeCompletion op && !isCallReturn op
  program.definitionScopes.mapM fun scope => do
    let members ← (operations.filterM fun op => do
      return (← controlOperationScope? program op) == scope.id.value)
    let projected ← members.mapM (operationVertex? program scope.id.value)
    let entries ← operations.filterMapM fun op => match op with
      | .enterScope _ _ _ childEntry child =>
          if child == scope.id then (consumer? program scope.id.value childEntry).map some else some none
      | .invokeProcess _ _ _ _ calledRoot calledEntry .. =>
          if calledRoot == scope.id then (consumer? program scope.id.value calledEntry).map some else some none
      | _ => some none
    -- A called root takes its synthetic Start once, however many Calls name it; they agree on its entry.
    let start := match entries.eraseDups with
      | [entry] => [⟨childStart scope.id.value, .vertex .start, [entry]⟩]
      | _ => []
    return { scope := scope.id.value, vertices := start ++ projected.map (·.1)
             children := projected.filterMap fun (vertex, child) => child.map (vertex.id, ·)
             userTasks := members.filterMap fun op => match op with
               | .awaitUserTask id .. => some id.value
               | _ => none
             calls := members.filterMap fun op => match op with
               | .invokeProcess id _ _ _ calledRoot .. => some (id.value, calledRoot.value)
               | _ => none }

/-- NSC-ADMIT-01 over the Program, independent of the checked graph; `none` refuses it. -/
def programAnalysis (program : Program) : Option Nat := do
  let root ← StructuredComposition.unique? (program.definitionScopes.filter fun scope =>
    scope.parentScopeId.isNone && scope.originElementId.value == program.processId.value)
  let completions := program.operations.filter StructuredComposition.isScopeCompletion
  -- A called root completes by its returns, one per Call naming it, so it has no `completeScope`.
  let calledRoots := (program.operations.filterMap fun op => match op with
    | .returnProcess _ _ _ root _ _ => some root
    | _ => none).eraseDups
  let invocations := program.operations.filter fun op => match op with
    | .invokeProcess .. => true
    | _ => false
  let rootCompleted := completions.filter fun op => match op with
    | .completeScope _ _ scopeId none => scopeId == root.id
    | _ => false
  if !(program.identity.sourceOverlay.isNone && program.internalSchedulingMode == .rejectObservableChoice &&
      program.compensationActivityRetention.isNone && program.compensationEventSubProcessSnapshots.isNone &&
      program.compensationExecution.isNone && program.interruptingMessageEventSubProcesses.isEmpty &&
      program.scopeLocalData.isEmpty && rootCompleted.length == 1 &&
      completions.length + calledRoots.length == program.definitionScopes.length &&
      -- Every return pairs with exactly one invocation, so no called root completes without a caller.
      (program.operations.filter isCallReturn).all (fun returned =>
        (invocations.filter fun op => match op with
          | .invokeProcess _ _ _ _ _ _ returnOperationId _ => returnOperationId == returned.id
          | _ => false).length == 1) &&
      program.operations.all fun op => (controlOperationScope? program op).isSome) then none
  else analyze program.definitionScopes (← (← programBodies program).mapM contractBody)

end BpmnSemantics.SemanticProcess.NestedScopeControl
