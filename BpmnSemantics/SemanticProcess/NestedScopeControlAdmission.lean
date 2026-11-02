module

public import BpmnSemantics.SemanticProcess.MergeRegionAdmission
public import BpmnSemantics.SemanticProcess.SerialBusinessTaskAdmission
public import BpmnSemantics.SemanticProcess.NestedScopeDataAdmission
public import BpmnSemantics.SemanticProcess.ConcurrentScopeDataAvailability
import BpmnSemantics.SemanticProcess.ScopeReentryAdmission
import BpmnSemantics.SemanticProcess.ScopeDataBurst
import all BpmnSemantics.SemanticProcess.StructuredCompositionAdmission
meta import BpmnSemantics.PrivateEquationLemmas

/-! NSC-ADMIT-01 for the embedded completion profile. Each definition scope's body is projected to the
reviewed structured-body analysis, a Sub-Process appearing in its parent as a task vertex, so
contraction, pairing and separate Ends stay that owner's. This module adds only the scope tree, the
branch condition and the nested burst composition; it carries no runtime or serialized authority.
CEA-ADMIT-01 merge regions are contracted first by `MergeRegion`; their target bodies stay in the tree
and their per-arrival bursts are composed here.

CALLN-ADMIT-01 adds Process-root Calls: a Call is a task vertex of the caller root whose called Process
body, a serial chain, is expanded once per call site below it, so the burst composition and the task
bound see the call tree exactly as a Sub-Process tree.

CSE-ADMIT-01 makes a data-free, overlay-bound Service Task a task wherever a User Task is one, except in
a called body or beside a Call. Its completion resumes like a User Task's, so it joins the per-body task
list that drives the bursts, the task bound and the merge-target check.

CSD-ADMIT-01 admits data: Sub-Process declarations and mapped Service Tasks under the bounded String
rules, with the required Start names of CSD-AVAILABLE-01 computed over the raw bodies by
`ConcurrentScopeData`. CMCALL-ADMIT-01 adds mapped Calls to a data-bearing model: at the Call placements
of CALLN-ADMIT-01 and after the first vertex of a serial Sub-Process body at depth one or two, each called
Process a serial User Task chain invoked only by mapped or only by unmapped Calls. -/

run_meta privateEquations `BpmnSemantics.SemanticProcess.StructuredComposition #[`unique?]

public section

namespace BpmnSemantics.SemanticProcess.NestedScopeControl

open StructuredParallelBody

/-- Definition depth of the deepest admitted Sub-Process body below the root. -/
def depthLimit : Nat := 3

/-- Concurrent-wait ceiling shared with the parallel Multi-Instance capacity account. -/
def taskLimit : Nat := 128

/-- CSE-ADMIT-01: the hosting preflight's concurrent-Activity ceiling, multiplicity-weighted like `taskLimit`. -/
def serviceTaskLimit : Nat := 32

/-- Call nesting below the caller root, a Call in the caller being depth one (CALLN-ADMIT-01). -/
def callDepthLimit : Nat := 3

/-- The vertices of a called Process body between its None Start and None End (CALLN-ADMIT-01). -/
def calledBodyVertexLimit : Nat := 3

/-- CMCALL-ADMIT-01: the deepest Sub-Process body that may hold a mapped Call. -/
private def embeddedCallDepthLimit : Nat := 2

structure Body where
  scope : String
  vertices : List Vertex
  /-- The child scope of every Sub-Process vertex of this body, merge targets included. -/
  children : List (String × String)
  /-- User and Service Task vertices; Service Tasks are also listed in `serviceTasks`. -/
  tasks : List String
  serviceTasks : List String := []
  regions : List MergeRegion.Region := []
  /-- The called Process root scope of every Call vertex of this body. -/
  calls : List (String × String) := []
  /-- The Call vertices of `calls` that carry variable mappings. -/
  mapped : List String := []
  deriving Repr, DecidableEq

/-- A body before merge-region contraction. -/
structure RawBody where
  scope : String
  vertices : List MergeRegion.RawVertex
  children : List (String × String)
  tasks : List String
  serviceTasks : List String := []
  calls : List (String × String) := []
  mapped : List String := []

def contractBody (raw : RawBody) : Option Body := do
  let (vertices, regions) ← MergeRegion.contract raw.vertices raw.children
  return { scope := raw.scope, vertices, children := raw.children, tasks := raw.tasks,
           serviceTasks := raw.serviceTasks, regions, calls := raw.calls, mapped := raw.mapped }

/-- A merge target's body is a serial chain of tasks; it owns no Sub-Process, gateway or region. -/
def serialTargetBody (body : Body) : Bool :=
  body.children.isEmpty && body.calls.isEmpty && body.regions.isEmpty && !body.tasks.isEmpty &&
    body.vertices.all (fun vertex => vertex.kind == .start || vertex.kind == .finish || vertex.kind == .task) &&
    (body.vertices.filter (·.kind == .task)).length == body.tasks.length

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
  let targetTasks := ((bodies.find? (·.scope == region.targetScope)).map (·.tasks.length)).getD 0
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

/-- A called Process body is a serial chain of one to three User Task or Call vertices (CALLN-ADMIT-01,
CSE-ADMIT-01); in a data-bearing model, of User Tasks only (CMCALL-ADMIT-01). -/
def serialCalledBody (dataBearing : Bool) (body : Body) : Bool :=
  let vertices := body.vertices.filter (·.kind == .task)
  body.children.isEmpty && body.regions.isEmpty && body.serviceTasks.isEmpty && (!dataBearing || body.calls.isEmpty) &&
    1 ≤ vertices.length && vertices.length ≤ calledBodyVertexLimit &&
    vertices.length == body.tasks.length + body.calls.length &&
    body.vertices.all (fun vertex => vertex.kind == .start || vertex.kind == .finish || vertex.kind == .task)

/-- CMCALL-ADMIT-01: a Call outside the root is a mapped Call of a data-bearing model in a serial body at
depth one or two, never the body's first vertex. Its invocation therefore follows a wait in the same body
and is never co-enabled with sibling work, since the parentless caller is the only one the internal
scope-creation selection prepares. -/
private def embeddedCallsPlaced (dataBearing : Bool) (depth : Option Nat) (body : Body) : Bool :=
  let first := (body.vertices.filter (·.kind == .start)).flatMap (·.outputs)
  body.calls.isEmpty ||
    dataBearing && depth.any (· ≤ embeddedCallDepthLimit) && body.regions.isEmpty &&
      body.vertices.all (fun vertex => vertex.kind == .start || vertex.kind == .finish || vertex.kind == .task) &&
      body.calls.all fun (vertex, _) => body.mapped.contains vertex && !first.contains vertex

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
def analyze (allScopes : List DefinitionScope) (allBodies : List Body) (dataBearing : Bool) : Option Nat := do
  let calledRoots := (allBodies.flatMap fun body => body.calls.map (·.2)).eraseDups
  -- A called root invoked by both a mapped and an unmapped Call is refused (CMCALL-ADMIT-01), because
  -- whether its frame isolates called-owned names is decided per definition.
  let sites := allBodies.flatMap fun body => body.calls.map fun (vertex, scope) => (scope, body.mapped.contains vertex)
  let roots := allScopes.filter (·.parentScopeId.isNone)
  let root ← StructuredComposition.unique? (roots.filter fun scope => !calledRoots.contains scope.id.value)
  let called ← calledRoots.mapM fun scope => do
    let body ← allBodies.find? (·.scope == scope)
    if roots.any (·.id.value == scope) && serialCalledBody dataBearing body &&
        ((sites.filter (·.1 == scope)).map (·.2)).eraseDups.length == 1 then some (scope, body) else none
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
      bodies.all (fun body => body.scope == root.id.value ||
        embeddedCallsPlaced dataBearing (depthOf parents fuel body.scope) body) &&
      regions.all (fun region => (bodies.find? (·.scope == region.targetScope)).any serialTargetBody)) then none
  else do
    -- Each caller-tree body expands its own Calls; a Sub-Process adds no call nesting, and the head of each
    -- expansion is the body itself, so the call-site copies are its tail.
    let expansions ← bodies.mapM fun body => expandSite called callDepthLimit body.scope body
    let expansion : Expansion := ⟨expansions.flatMap (·.bodies), expansions.flatMap (·.parents),
      expansions.flatMap (·.invoked)⟩
    let expanded := expansion.bodies
    let allParents := parents ++ expansion.parents
    let calledTasks := ((expansions.flatMap (·.bodies.drop 1)).map (·.tasks.length)).sum
    -- CEA-ADMIT-01 weights the target body's tasks and those after it once per fork output; CSE-ADMIT-01
    -- weights Service Tasks the same way against their own bound.
    let weight := fun (listed : Body → List String) => (bodies.map fun body => (listed body).length +
      (body.regions.map fun region => MergeRegion.multiplicityWeightedExtra region
        (((bodies.find? (·.scope == region.targetScope)).map fun target => (listed target).length).getD 0)
        (listed body).contains).sum).sum
    let weightedServices := weight (·.serviceTasks)
    let expandedFuel := expanded.length + 1
    if !((expansion.invoked.map (·.2)).eraseDups.length == called.length &&
        weight (·.tasks) + calledTasks ≤ taskLimit && weightedServices ≤ serviceTaskLimit &&
        -- CSE-ADMIT-01 refuses a Service Task beside a Call; called bodies refuse them in `serialCalledBody`.
        (called.isEmpty || weightedServices == 0)) then none
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
          else (body.tasks.filter fun task => !inRegion.contains task).map (resume body.scope)
        let regional := expanded.flatMap fun body => body.regions.flatMap (regionTasks expanded resume body.scope)
        let maximum := (resumed ++ regional).foldl max (1 + entryBurst scans expandedFuel root.id.value)
        if maximum ≤ scenarioClosureLimit then some maximum else none

/-- A data-bearing model's declarations, handler names and mapped Service Task and Call accesses. -/
structure Data where
  records : List ScopeLocalData
  handlers : List String
  accesses : List (String × ConcurrentScopeData.Access)

private def serviceAccess (inputs outputs : List VariableMapping) : ConcurrentScopeData.Access :=
  { reads := SerialBusinessTask.readNames inputs, writes := outputs.map (·.target) }

/-- A mapped Call reads without requiring and definitely writes its outputs (CMCALL-AVAILABLE-01,
CMCALL-START-01). -/
private def callAccess (inputs outputs : List VariableMapping) : ConcurrentScopeData.Access :=
  let writes := outputs.map (·.target)
  { reads := [], writes, optional := SerialBusinessTask.readNames inputs ++ writes }

/-- CALLN-ADMIT-01's empty Call anywhere; in a data-bearing model also CVM-ADMIT-01's mappings
(CMCALL-ADMIT-01). -/
private def callDataAdmitted (data : Option Data) : CallDataInterface → Bool
  | .empty => true
  | .variableMappings inputs outputs => match data with
      | some data => variableMappingsValid inputs outputs && NestedScopeData.callMappingsAdmitted data.handlers inputs outputs
      | none => false
  | .scalar _ => false

/-- CSD-ADMIT-01's data rules over a tree whose control is already admitted: declarations sorted by scope,
each on a Sub-Process scope and within the declaration rule, then CSD-AVAILABLE-01 and CMCALL-START-01
over the raw bodies. The optional names are `none` without a mapped Call, where every admitted Start name
is allowed. -/
private def admittedData (scopes : List DefinitionScope) (raw : List RawBody) (data : Data) :
    Option (List String × Option (List String)) := do
  -- The caller root is the one parentless scope no Call names; called roots declare nothing.
  let calledRoots := raw.flatMap fun body => body.calls.map (·.2)
  let root ← StructuredComposition.unique? (scopes.filter fun scope =>
    scope.parentScopeId.isNone && !calledRoots.contains scope.id.value)
  let bodies := raw.map fun body => ({ scope := body.scope, vertices := body.vertices, children := body.children } :
    ConcurrentScopeData.Body)
  if !(strictlySortedStrings (data.records.map (·.scopeId.value)) &&
      data.records.all (fun record => record.scopeId != root.id && raw.any (·.scope == record.scopeId.value) &&
        NestedScopeData.recordValid data.handlers record)) then none
  else do
    let (required, optional) ← ConcurrentScopeData.startNames root.id.value bodies data.records data.accesses
    return (required, if raw.any (!·.mapped.isEmpty) then some optional else none)

/-- The admitted largest closure and, for a data-bearing model, its required and optional Start names. -/
private def admittedModel (scopes : List DefinitionScope) (raw : List RawBody) (data : Option Data) :
    Option (Nat × List String × Option (List String)) := do
  let burst ← analyze scopes (← raw.mapM contractBody) data.isSome
  match data with
  | none => return (burst, [], none)
  | some data => return (burst, ← admittedData scopes raw data)

run_meta privateEquations `BpmnSemantics.SemanticProcess.NestedScopeControl #[`admittedModel]

/-- A single scope admits nothing: the class needs a Sub-Process or a Call, and a called root is a second
scope. -/
theorem analyze_one_scope (allScopes : List DefinitionScope) (allBodies : List Body) (dataBearing : Bool)
    (one : allScopes.length = 1) : analyze allScopes allBodies dataBearing = none := by
  cases analyzed : analyze allScopes allBodies dataBearing with
  | none => rfl
  | some burst =>
      exfalso
      obtain ⟨only, rfl⟩ := List.length_eq_one_iff.mp one
      unfold analyze at analyzed
      simp only [bind, Option.bind_eq_some_iff] at analyzed
      obtain ⟨root, rootFound, called, calledFound, analyzed⟩ := analyzed
      generalize (allBodies.flatMap fun body => body.calls.map (·.2)).eraseDups = calledRoots
        at rootFound calledFound analyzed
      have notCalled : calledRoots.contains only.id.value = false := by
        clear analyzed calledFound
        cases parentless : only.parentScopeId.isNone <;>
          cases contained : calledRoots.contains only.id.value <;>
          simp_all [StructuredComposition.unique?, List.filter]
      cases calledRoots with
      | cons first rest =>
          clear analyzed
          rw [List.mapM_cons] at calledFound
          obtain ⟨_, headFound, _⟩ := Option.bind_eq_some_iff.mp calledFound
          obtain ⟨_, _, headFound⟩ := Option.bind_eq_some_iff.mp headFound
          clear rootFound calledFound
          split at headFound
          · cases parentless : only.parentScopeId.isNone <;> simp_all [List.filter]
          · contradiction
      | nil =>
          rw [List.mapM_nil] at calledFound
          obtain rfl : called = [] := (Option.some.inj calledFound).symm
          obtain ⟨_, _, analyzed⟩ := analyzed
          clear rootFound
          split at analyzed
          · contradiction
          · rename_i admitted
            clear analyzed
            simp only [Bool.not_eq_true', Bool.not_eq_false, Bool.and_eq_true, beq_iff_eq] at admitted
            simp at admitted
            -- Admission requires a parent link (no Call was admitted), but one scope has no child.
            obtain ⟨⟨⟨⟨⟨⟨⟨⟨_, noChildren⟩, body, member, child⟩, _⟩, _⟩, _⟩, _⟩, _⟩, _⟩ := admitted
            have zero := List.sum_eq_zero_iff_forall_eq_nat.mp noChildren body.children.length
              (List.mem_map.mpr ⟨body, by simpa using member, rfl⟩)
            exact child (List.eq_nil_of_length_eq_zero zero)

def controlCheckedScope? (source : CheckedProcess) (nodeId : NodeId) : Option String := do
  let owner ← StructuredComposition.unique? (source.nodeScopes.filter (·.nodeId == nodeId))
  return owner.scopeId.value

/-- CSD-ADMIT-01 lets Service Tasks of a data-bearing model map data under the bounded String rules, and
CMCALL-ADMIT-01 lets its Calls map. -/
def checkedVertex? (source : CheckedProcess) (data : Option Data) (node : CheckedNode) :
    Option (MergeRegion.RawVertex × Option String) := do
  let id := node.id.value
  let outputs := (source.sequenceFlows.filter (·.sourceId == node.id)).map (·.targetId.value)
  let kind ← match node with
    | .noneStartEvent _ => some (MergeRegion.RawKind.vertex .start)
    | .noneEndEvent _ => some (.vertex .finish)
    | .userTask _ _ none => some (.vertex .task)
    | .serviceTask _ descriptor inputs outputs none =>
        match data with
        | none => if inputs.isEmpty && outputs.isEmpty && SerialBusinessTask.descriptorValid descriptor
            then some (.vertex .task) else none
        | some data => if NestedScopeData.serviceValid data.handlers descriptor inputs outputs
            then some (.vertex .task) else none
    | .embeddedSubProcess _ _ => some (.vertex .task)
    | .callActivity _ _ callData => if callDataAdmitted data callData then some (.vertex .task) else none
    | .parallelGateway _ .diverging => some (.vertex .fork)
    | .parallelGateway _ .converging => some (.vertex .join)
    | .exclusiveMerge _ => some .merge
    | _ => none
  let child := match node with
    | .embeddedSubProcess _ child => some child.value
    | _ => none
  return (⟨id, kind, outputs⟩, child)

run_meta privateMatchEquations `BpmnSemantics.SemanticProcess.NestedScopeControl #[`checkedVertex?]

/-- The parentless definition scope of the Process a Call names. -/
def calledRoot? (source : CheckedProcess) (calledProcessId : ProcessId) : Option String := do
  let root ← StructuredComposition.unique? (source.definitionScopes.filter fun scope =>
    scope.parentScopeId.isNone && scope.originElementId.value == calledProcessId.value)
  return root.id.value

/-- A checked graph carries data exactly when a scope declares a local, a Service Task maps one or a Call
maps. -/
def checkedData (source : CheckedProcess) : Option Data :=
  let services := source.nodes.filterMap fun node => match node with
    | .serviceTask id _ inputs outputs _ => some (id.value, inputs, outputs)
    | _ => none
  let calls := source.nodes.filterMap fun node => match node with
    | .callActivity id _ (.variableMappings inputs outputs) => some (id.value, callAccess inputs outputs)
    | _ => none
  if source.scopeLocalData.isEmpty && calls.isEmpty &&
      services.all (fun (_, inputs, outputs) => inputs.isEmpty && outputs.isEmpty)
  then none
  else some { records := source.scopeLocalData, handlers := SerialBusinessTask.checkedHandlers source
              accesses := services.map (fun (id, inputs, outputs) => (id, serviceAccess inputs outputs)) ++ calls }

def checkedBodies (source : CheckedProcess) (data : Option Data) : Option (List RawBody) := do
  if !(source.sequenceFlows.all fun flow => flow.condition.isNone &&
      (controlCheckedScope? source flow.sourceId).isSome && controlCheckedScope? source flow.sourceId == controlCheckedScope? source flow.targetId)
  then none
  else source.definitionScopes.mapM fun scope => do
    let members := source.nodes.filter fun node => controlCheckedScope? source node.id == some scope.id.value
    let projected ← members.mapM (checkedVertex? source data)
    let calls ← members.filterMapM fun node => match node with
      | .callActivity id calledProcessId _ => (calledRoot? source calledProcessId).map fun root => some (id.value, root)
      | _ => some none
    let serviceTasks := members.filterMap fun node => match node with
      | .serviceTask id .. => some id.value
      | _ => none
    return { scope := scope.id.value, vertices := projected.map (·.1)
             children := projected.filterMap fun (vertex, child) => child.map (vertex.id, ·)
             tasks := members.filterMap (fun node => match node with
               | .userTask id _ _ => some id.value
               | _ => none) ++ serviceTasks
             serviceTasks, calls
             mapped := members.filterMap fun node => match node with
               | .callActivity id _ (.variableMappings ..) => some id.value
               | _ => none }

private def checkedModel (source : CheckedProcess) : Option (Nat × List String × Option (List String)) := do
  if !(source.nodes.all fun node => (controlCheckedScope? source node.id).isSome) then none
  else
    let data := checkedData source
    admittedModel source.definitionScopes (← checkedBodies source data) data

/-- NSC-ADMIT-01 and CSD-ADMIT-01 over the checked graph; `none` refuses it, otherwise the admitted
largest closure. -/
def checkedAnalysis (source : CheckedProcess) : Option Nat :=
  (checkedModel source).map (·.1)

/-- CSD-AVAILABLE-01's required Start names over the checked graph, empty for a data-free model. -/
def checkedStartNames (source : CheckedProcess) : Option (List String) :=
  (checkedModel source).map (·.2.1)

def controlOperationScope? (program : Program) (operation : SemanticOperation) : Option String := do
  let owner ← StructuredComposition.unique? (program.operationScopes.filter (·.operationId == operation.id))
  return owner.scopeId.value

def operationInputs : SemanticOperation → List ControlPlaceId
  | .enterScope _ _ input .. | .awaitUserTask _ _ input .. | .awaitEffect _ _ input .. | .duplicate _ _ input _
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

run_meta privateMatchEquations `BpmnSemantics.SemanticProcess.NestedScopeControl #[`controlParentOutput?]

/-- The caller output of the one return an invocation names, owned by its called root and carrying the
invocation's own Call data, so CVM-OUT-01 reads exactly what this Call declares. -/
def callerOutput? (program : Program) (calledRoot : DefinitionScopeId) (returnOperationId : OperationId)
    (callData : CallDataInterface) : Option ControlPlaceId := do
  let returned ← StructuredComposition.unique? (program.operations.filter (·.id == returnOperationId))
  match returned with
  | .returnProcess _ _ _ root output returnedData =>
      if root == calledRoot && returnedData == callData && controlOperationScope? program returned == some calledRoot.value
      then some output else none
  | _ => none

run_meta privateMatchEquations `BpmnSemantics.SemanticProcess.NestedScopeControl #[`callerOutput?]

def isCallReturn : SemanticOperation → Bool
  | .returnProcess .. => true
  | _ => false

/-- The lowered child Start is elided; this synthetic vertex stands for the child's entry place. -/
def childStart (scope : String) : String := "start:" ++ scope

def operationVertex? (program : Program) (data : Option Data) (scope : String) (operation : SemanticOperation) :
    Option (MergeRegion.RawVertex × Option String) := do
  let id := operation.id.value
  let follow := fun (places : List ControlPlaceId) => places.mapM (consumer? program scope)
  match operation with
  | .initiate _ _ output => return (⟨id, .vertex .start, ← follow [output]⟩, none)
  | .awaitUserTask _ _ _ output task =>
      if task.metadata.isSome then none else return (⟨id, .vertex .task, ← follow [output]⟩, none)
  | .awaitEffect _ _ _ output effect none =>
      let admitted := match data with
        | none => effect.inputMappings.isEmpty && effect.outputMappings.isEmpty &&
            SerialBusinessTask.descriptorValid effect.descriptor
        | some data => NestedScopeData.serviceValid data.handlers effect.descriptor effect.inputMappings
            effect.outputMappings
      if admitted then return (⟨id, .vertex .task, ← follow [output]⟩, none) else none
  | .duplicate _ _ _ outputs => return (⟨id, .vertex .fork, ← follow outputs⟩, none)
  | .synchronize _ _ _ output => return (⟨id, .vertex .join, ← follow [output]⟩, none)
  | .mergeExclusive _ _ _ output => return (⟨id, .merge, ← follow [output]⟩, none)
  | .reachNoneEnd .. => return (⟨id, .vertex .finish, []⟩, none)
  | .enterScope _ _ _ _ child =>
      return (⟨id, .vertex .task, ← follow [← controlParentOutput? program child]⟩, some child.value)
  | .invokeProcess _ _ _ _ calledRoot calledEntry returnOperationId callData => do
      if !callDataAdmitted data callData then none
      let output ← callerOutput? program calledRoot returnOperationId callData
      let _ ← consumer? program calledRoot.value calledEntry
      return (⟨id, .vertex .task, ← follow [output]⟩, none)
  | _ => none

def programBodies (program : Program) (data : Option Data) : Option (List RawBody) := do
  let operations := program.operations.filter fun op => !StructuredComposition.isScopeCompletion op && !isCallReturn op
  program.definitionScopes.mapM fun scope => do
    let members ← (operations.filterM fun op => do
      return (← controlOperationScope? program op) == scope.id.value)
    let projected ← members.mapM (operationVertex? program data scope.id.value)
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
    let serviceTasks := members.filterMap fun op => match op with
      | .awaitEffect id .. => some id.value
      | _ => none
    return { scope := scope.id.value, vertices := start ++ projected.map (·.1)
             children := projected.filterMap fun (vertex, child) => child.map (vertex.id, ·)
             tasks := members.filterMap (fun op => match op with
               | .awaitUserTask id .. => some id.value
               | _ => none) ++ serviceTasks
             serviceTasks
             calls := members.filterMap (fun op => match op with
               | .invokeProcess id _ _ _ calledRoot .. => some (id.value, calledRoot.value)
               | _ => none)
             mapped := members.filterMap fun op => match op with
               | .invokeProcess id _ _ _ _ _ _ (.variableMappings ..) => some id.value
               | _ => none }

run_meta privateMatchEquations `BpmnSemantics.SemanticProcess.NestedScopeControl #[`programBodies]

/-- A data-bearing embedded completion Program's, or any nested scope-data Program's (CSSD-ADMIT-01),
declarations, handlers, mapped Service Tasks and mapped Calls. -/
private def programData (program : Program) : Option Data :=
  if program.identity.semanticProfile == nestedScopeDataProfileId || embeddedScopeDataBearing program then
    some { records := program.scopeLocalData, handlers := SerialBusinessTask.programHandlers program
           accesses := program.operations.filterMap fun op => match op with
             | .awaitEffect id _ _ _ effect _ => some (id.value, serviceAccess effect.inputMappings effect.outputMappings)
             | .invokeProcess id _ _ _ _ _ _ (.variableMappings inputs outputs) => some (id.value, callAccess inputs outputs)
             | _ => none }
  else none

private def programModel (program : Program) : Option (Nat × List String × Option (List String)) := do
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
  -- CSE-ADMIT-01: the source overlay binds Service Task handlers, so a Program carries one exactly when it
  -- has an effect; CSSD-ADMIT-01 keeps the nested scope-data profile's overlay on every model.
  let structured := program.identity.semanticProfile == nestedScopeDataProfileId
  let hasEffect := program.operations.any fun op => match op with
    | .awaitEffect .. => true
    | _ => false
  if !(program.identity.sourceOverlay.isSome == (structured || hasEffect) &&
      program.internalSchedulingMode == .rejectObservableChoice &&
      program.compensationActivityRetention.isNone && program.compensationEventSubProcessSnapshots.isNone &&
      program.compensationExecution.isNone && program.interruptingMessageEventSubProcesses.isEmpty &&
      (program.scopeLocalData.isEmpty || program.identity.semanticProfile == embeddedCompletionProfileId || structured) &&
      rootCompleted.length == 1 &&
      completions.length + calledRoots.length == program.definitionScopes.length &&
      -- Every return pairs with exactly one invocation, so no called root completes without a caller.
      (program.operations.filter isCallReturn).all (fun returned =>
        (invocations.filter fun op => match op with
          | .invokeProcess _ _ _ _ _ _ returnOperationId _ => returnOperationId == returned.id
          | _ => false).length == 1) &&
      program.operations.all fun op => (controlOperationScope? program op).isSome) then none
  else
    let data := programData program
    admittedModel program.definitionScopes (← programBodies program data) data

/-- NSC-ADMIT-01 and CSD-ADMIT-01 over the Program, independent of the checked graph; `none` refuses it. -/
def programAnalysis (program : Program) : Option Nat :=
  (programModel program).map (·.1)

run_meta privateEquations `BpmnSemantics.SemanticProcess.NestedScopeControl #[`programAnalysis, `programModel]

theorem programAnalysis_one_scope (program : Program) (one : program.definitionScopes.length = 1) :
    programAnalysis program = none := by
  simp only [programAnalysis, programModel, admittedModel, bind, Option.bind, analyze_one_scope _ _ _ one]
  repeat' first | rfl | split | simp

/-- CSD-AVAILABLE-01's required Start names over the Program, empty for a data-free Program. -/
def programStartNames (program : Program) : Option (List String) :=
  (programModel program).map (·.2.1)

/-- CSD-VALUE-01, CSD-AVAILABLE-01 and CMCALL-START-01 at Start of a data-bearing Program: admitted names
outside the handler namespace, each within the bounded String policy, covering every required name, a
present null counting as present; with a mapped Call, every name required or optional. -/
def startBindingsAdmitted (program : Program) (bindings : List VariableBinding) : Bool :=
  match programModel program with
  | none => false
  | some (_, required, optional) =>
      EffectData.bindingsValidUnder (programEffectMappingValuePolicy program)
          (SerialBusinessTask.programHandlers program) bindings &&
        required.all (fun name => bindings.any (·.name == name)) &&
        optional.all fun optional => bindings.all fun binding =>
          required.contains binding.name || optional.contains binding.name

end BpmnSemantics.SemanticProcess.NestedScopeControl

/-! ## Structured scope-data routing

CSSD-ROUTE-01 and CSSD-ADMIT-01 for `nestedScopeDataProfileId`, per the
[concurrent structured scope data specification](../../docs/capsules/CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#stable-rules).
A Program or checked graph of the profile is concurrent exactly when it splits a token. The serial analysis
refuses every split, so no model it admits is ever routed elsewhere; a concurrent one takes this module's
analysis, restricted to a source overlay on every model, forks only in Sub-Process bodies, no merge region and
the profile's own Call bound. SRE-ROUTE-01 sends a model whose root body holds a Choice or Merge to the
re-entry account (`ScopeReentryAdmission`) and refuses one that also splits. Transcribed independently by the
TypeScript `structured-scope-data-routing` module. -/

namespace BpmnSemantics.SemanticProcess.StructuredScopeData

open BpmnSemantics

private def splits (operations : List SemanticOperation) : Bool :=
  operations.any fun
    | .duplicate .. => true
    | _ => false

/-- CSSD-ROUTE-01: a Program of the nested scope-data profile that splits a token. -/
def concurrentProgram (program : Program) : Bool :=
  program.identity.semanticProfile == nestedScopeDataProfileId && splits program.operations

/-- The checked-graph counterpart of `concurrentProgram`, consulted only under the profile. -/
private def checkedConcurrent (source : CheckedProcess) : Bool :=
  source.nodes.any fun
    | .parallelGateway _ .diverging => true
    | _ => false

/-- The scope a Process root body runs in, which the profile keeps one serial path. -/
private def rootScope? (scopes : List DefinitionScope) (processId : ProcessId) : Option DefinitionScopeId :=
  (scopes.find? fun scope => scope.parentScopeId.isNone && scope.originElementId.value == processId.value).map (·.id)

/-- The profile's Call bound (CVM-ADMIT-01, Stage B): at most two Calls, all mapped, all naming the one
called Process of a two-Process document. -/
private def callsAdmitted (calls : List (ProcessId × CallDataInterface)) : Bool :=
  calls.length ≤ NestedScopeData.callLimit && (calls.map (·.1.value)).eraseDups.length ≤ 1 &&
    calls.all fun
      | (_, .variableMappings ..) => true
      | _ => false

private def programRestrictionsHold (program : Program) : Bool :=
  match rootScope? program.definitionScopes program.processId with
  | none => false
  | some root =>
      let scopeOf := fun (id : OperationId) =>
        (program.operationScopes.find? (·.operationId == id)).map (·.scopeId)
      program.identity.sourceOverlay.isSome &&
        !(program.operations.any fun
          | .mergeExclusive .. => true
          | .duplicate id .. => scopeOf id == some root
          | _ => false) &&
        callsAdmitted (program.operations.filterMap fun
          | .invokeProcess _ _ _ calledProcessId _ _ _ data => some (calledProcessId, data)
          | _ => none)

private def checkedRestrictionsHold (source : CheckedProcess) : Bool :=
  match rootScope? source.definitionScopes source.processId with
  | none => false
  | some root =>
      let scopeOf := fun (id : NodeId) => (source.nodeScopes.find? (·.nodeId == id)).map (·.scopeId)
      source.identity.sourceOverlay.isSome &&
        !(source.nodes.any fun
          | .exclusiveMerge _ => true
          | .parallelGateway id .diverging => scopeOf id == some root
          | _ => false) &&
        callsAdmitted (source.nodes.filterMap fun
          | .callActivity _ calledProcessId data => some (calledProcessId, data)
          | _ => none)

/-- CSSD-ADMIT-01 over the Program: the serial analysis for a serial Program, under PTT-BURST-01 when it holds a
pass-through Task, the restricted nested scope-control analysis for a concurrent one. -/
def programRouted (program : Program) : Bool :=
  if ScopeReentry.programReentry program then
    !concurrentProgram program && (ScopeReentry.programAnalysis program).isSome
  else if concurrentProgram program then
    programRestrictionsHold program && (NestedScopeControl.programAnalysis program).isSome
  else (NestedScopeData.programAnalysis program).isSome && ScopeDataBurst.programSerialBurstAdmitted program

/-- CSSD-ADMIT-01 over the checked graph, independent of the Program. -/
def checkedRouted (source : CheckedProcess) : Bool :=
  if ScopeReentry.checkedReentry source then
    !checkedConcurrent source && (ScopeReentry.checkedAnalysis source).isSome
  else if checkedConcurrent source then
    checkedRestrictionsHold source && (NestedScopeControl.checkedAnalysis source).isSome
  else (NestedScopeData.checkedAnalysis source).isSome && ScopeDataBurst.checkedSerialBurstAdmitted source

/-- NSD-AVAILABLE-01 for a serial Program; CSD-AVAILABLE-01 and CMCALL-START-01 under the profile's
`SingletonBusinessItem` policy for a concurrent one. -/
def startBindingsRouted (program : Program) (bindings : List VariableBinding) : Bool :=
  if ScopeReentry.programReentry program then
    !concurrentProgram program && ScopeReentry.startBindingsAdmitted program bindings
  else if concurrentProgram program then
    programRestrictionsHold program && NestedScopeControl.startBindingsAdmitted program bindings
  else NestedScopeData.startBindingsAdmitted program bindings && ScopeDataBurst.programSerialBurstAdmitted program

run_meta privateEquations `BpmnSemantics.SemanticProcess.StructuredScopeData #[`concurrentProgram, `programRouted, `checkedRouted, `startBindingsRouted]

/-- CSSD-ROUTE-01: without a split, Program admission is the serial analysis's under PTT-BURST-01. -/
private theorem programRouted_serial (program : Program) (serial : concurrentProgram program = false)
    (unchosen : ScopeReentry.programReentry program = false) :
    programRouted program =
      ((NestedScopeData.programAnalysis program).isSome && ScopeDataBurst.programSerialBurstAdmitted program) := by
  simp [programRouted, serial, unchosen]

/-- CSSD-ROUTE-01: without a fork, checked admission is the serial analysis's under PTT-BURST-01. -/
private theorem checkedRouted_serial (source : CheckedProcess) (serial : checkedConcurrent source = false)
    (unchosen : ScopeReentry.checkedReentry source = false) :
    checkedRouted source =
      ((NestedScopeData.checkedAnalysis source).isSome && ScopeDataBurst.checkedSerialBurstAdmitted source) := by
  simp [checkedRouted, serial, unchosen]

/-- CSSD-ROUTE-01: without a split, the Start rule is the serial analysis's under PTT-BURST-01. -/
private theorem startBindingsRouted_serial (program : Program) (bindings : List VariableBinding)
    (serial : concurrentProgram program = false) (unchosen : ScopeReentry.programReentry program = false) :
    startBindingsRouted program bindings =
      (NestedScopeData.startBindingsAdmitted program bindings && ScopeDataBurst.programSerialBurstAdmitted program) := by
  simp [startBindingsRouted, serial, unchosen]

/-- SRE-ROUTE-01's preservation: a Program without a root Choice or a Merge of two or more inputs routes as before
this account existed, the concurrent route unchanged and the serial route gaining only PTT-BURST-01. -/
private theorem programRouted_unchosen (program : Program) (unchosen : ScopeReentry.programReentry program = false) :
    programRouted program = if concurrentProgram program then
      programRestrictionsHold program && (NestedScopeControl.programAnalysis program).isSome
    else (NestedScopeData.programAnalysis program).isSome && ScopeDataBurst.programSerialBurstAdmitted program := by
  simp [programRouted, unchosen]

/-- Neither routed analysis admits a single scope. -/
theorem programRouted_one_scope (program : Program) (one : program.definitionScopes.length = 1) :
    programRouted program = false := by
  unfold programRouted
  repeat' split
  all_goals simp [NestedScopeControl.programAnalysis_one_scope program one,
    NestedScopeData.programAnalysis_one_scope program one, ScopeReentry.programAnalysis_one_scope program one]

end BpmnSemantics.SemanticProcess.StructuredScopeData
