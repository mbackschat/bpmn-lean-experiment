module

public import BpmnSemantics.SemanticProcess.MergeRegionAdmission
public import BpmnSemantics.SemanticProcessContract
import BpmnSemantics.SemanticProcess.StructuredCompositionAdmission

/-! The fork-branch cut of NSC-ADMIT-01 and the Call placement scan of CMCALL-ADMIT-01, as PTPB-WORK-01 and
PTPB-CALL-01 of the [pass-through branch specification](../../docs/capsules/PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#admission)
relax them for pass vertices, and the terminal-fork relaxation of the [terminal forks specification](../../docs/capsules/TERMINAL-FORKS-SPEC.md#admission), and the placement and synthetic forks of the [scope host](../../docs/capsules/SCOPE-HOST-FLOW-LISTS-SPEC.md#admission) over raw bodies. `NestedScopeControl` consumes them in hidden bodies only, through a private import; the TypeScript twin of the scope host part is `scope-host-body-projection.ts`. -/

public section

namespace BpmnSemantics.SemanticProcess.NestedScopeControl

open StructuredParallelBody

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

/-- Where one fork output's closure scan stops: at a task it arms, at a join it cannot pass, or at an End. -/
private inductive BranchStop where
  | work | join (id : String) | finish
  deriving DecidableEq

/-- PTPB-WORK-01: the closure scan from one fork output, through pass vertices and past a nested fork's
join when every branch of that fork reaches it wait-free; the flag records whether it met a pass vertex. -/
private def branchScan (vertices : List Vertex) : Nat → String → BranchStop × Bool
  | 0, _ => (.finish, false)
  | fuel + 1, id =>
      match vertices.find? (·.id == id) with
      | none => (.finish, false)
      | some vertex =>
          match vertex.kind, vertex.outputs with
          | .task, _ => (.work, false)
          | .pass, [next] => ((branchScan vertices fuel next).1, true)
          | .join, _ => (.join vertex.id, false)
          | .fork, outputs =>
              let branches := outputs.map (branchScan vertices fuel)
              let passes := branches.any (·.2)
              if branches.any (·.1 == .finish) then (.finish, passes)
              else match branches.head? with
                | some (.join join, _) =>
                    if branches.all (·.1 == .join join) then
                      match (vertices.find? (·.id == join)).bind (·.outputs.head?) with
                      | some next =>
                          let after := branchScan vertices fuel next
                          (after.1, passes || after.2)
                      | none => (.finish, passes)
                    else (.work, passes)
                | _ => (.work, passes)
          | _, _ => (.finish, false)

/-- BPMN 13.4.1's cut, relaxed by PTPB-WORK-01 only for a branch whose closure scan meets a pass vertex: it
may reach its fork's paired join without waiting, never an End, so no End is co-enabled with a sibling
branch's entry (the singleton premise of the pass-through branch specification). Where `terminalForkBoundsKept`
relaxes it to `branchesReachWorkOrEnd`, that premise holds only for definitions this cut still governs. -/
def branchesStartWithWork (vertices : List Vertex) : Bool :=
  vertices.all fun vertex => vertex.kind != .fork || vertex.outputs.all fun id =>
    reachesWork vertices vertices.length id ||
      (let scan := branchScan vertices vertices.length id; scan.2 && scan.1 != .finish)

/-- TFK-ADMIT-01 also admits a terminal-fork branch whose closure scan stops at its End without arming a task,
so its End may share a closure with sibling work, a declared entry included (DTB-COMMUTE-01); a branch that
reaches its paired join keeps PTPB-WORK-01. -/
def branchesReachWorkOrEnd (vertices : List Vertex) : Bool :=
  vertices.all fun vertex => vertex.kind != .fork || vertex.outputs.all fun id =>
    reachesWork vertices vertices.length id ||
      (let scan := branchScan vertices vertices.length id; scan.1 == .finish || scan.2)

/-- TFK-ADMIT-01 and DTB-ADMIT-01: the shared analysis relaxes the root End count and the cut for every caller,
and this restores one root End and the strict cut wherever the relaxation does not apply. `relaxed` is the
nested scope-data profile, whether or not the definition declares scope-local data. -/
def terminalForkBoundsKept (relaxed : Bool) (root : String) (bodies : List (String × List Vertex)) : Bool :=
  (relaxed || ((bodies.lookup root).getD []).countP (·.kind == .finish) == 1) &&
    (relaxed || bodies.all fun body => branchesStartWithWork body.2)

/-- PTPB-CALL-01: pass vertices never wait, so a body's first vertex is the first one after them. -/
def afterPasses (vertices : List Vertex) : Nat → List String → List String
  | 0, first => first
  | fuel + 1, first =>
      match first with
      | [id] =>
          match vertices.find? (·.id == id) with
          | some vertex => if vertex.kind == .pass then afterPasses vertices fuel vertex.outputs else first
          | none => first
      | _ => first

/-- A raw Start or task vertex with two or more successors: a splitting None Start or Sub-Process, a scope host's
entries or an exit's parent outputs (SCPH-ADMIT-01). -/
private def splitsRaw (vertex : MergeRegion.RawVertex) : Bool :=
  (vertex.kind == .vertex .start || vertex.kind == .vertex .task) && 2 ≤ vertex.outputs.length

/-- Each splitting vertex followed by a synthetic fork over its successors, so the structured-body analysis keeps its
arity rule; `>` occurs in no XML ID or derived operation ID. -/
def withSplitForks (vertices : List MergeRegion.RawVertex) : List MergeRegion.RawVertex :=
  vertices.flatMap fun vertex =>
    if splitsRaw vertex then
      [{ vertex with outputs := ["fork>" ++ vertex.id] }, ⟨"fork>" ++ vertex.id, .vertex .fork, vertex.outputs⟩]
    else [vertex]

/-- Ordered by reachability with every vertex of its body, so no fork region holds it; this reads exactly the fork
regions because the concurrent account admits no Choice. -/
private def outsideForkRegions (vertices : List MergeRegion.RawVertex) (vertex : String) : Bool :=
  let edges := vertices.flatMap fun source => source.outputs.map fun target => (⟨source.id, target⟩ : GraphEdge String)
  let reach := reachedSet edges vertices.length
  vertices.all fun other => (reach vertex).contains other.id || (reach other.id).contains vertex

/-- Whether the Sub-Process vertex entering `scope`, and that of every ancestor, lies outside the fork regions of its
body; fuel of one level per body refuses a parent cycle. -/
private def placedFrom (bodies : List (String × List MergeRegion.RawVertex × List (String × String))) :
    Nat → String → Bool
  | fuel, scope =>
      match bodies.findSome? fun (owner, vertices, children) =>
          (children.find? (·.2 == scope)).map fun (vertex, _) => (owner, vertices, vertex) with
      | none => true
      | some (owner, vertices, vertex) => match fuel with
        | 0 => false
        | fuel + 1 => outsideForkRegions vertices vertex && placedFrom bodies fuel owner

/-- SCPH-SINGLE-01: a splitting body Start's Sub-Process and a splitting Sub-Process lie outside every fork region of
their scope and of every ancestor scope, so no other internal operation is enabled with the host or exit. A root Start
always qualifies. ACSP-SINGLE-01: so does a splitting Task, a task vertex with two or more successors that holds no child
scope. -/
def splitScopesPlaced (bodies : List (String × List MergeRegion.RawVertex × List (String × String))) : Bool :=
  bodies.all fun (scope, vertices, children) => vertices.all fun vertex =>
    match children.find? (·.1 == vertex.id) with
    | none => vertex.kind != .vertex .task || !splitsRaw vertex ||
        (outsideForkRegions vertices vertex.id && placedFrom bodies bodies.length scope)
    | some (_, child) =>
        let splittingChild := splitsRaw vertex || (bodies.find? (·.1 == child)).any fun (_, childVertices, _) =>
          childVertices.any fun start => start.kind == .vertex .start && splitsRaw start
        !splittingChild || placedFrom bodies bodies.length child

/-! Helpers of the nested analysis over vertex lists and checked scopes, kept here so its owner stays within the size
target. Its Program-path helpers stay in the owner: `SequentialMultiInstanceProgramBindingConformance` kernel-decides
Program admission through the owner's opened bodies and cannot reduce this leaf's (CI run 42424301692, 2026-11-07). -/

/-- Task vertices a scan armed: each has exactly its one input among the scan's arrivals. -/
def armed (vertices : List Vertex) (closure : Closure) : List String :=
  (vertices.filter fun vertex =>
    vertex.kind == .task && closure.arrivals.count vertex.id == incomingCount vertices vertex.id).map (·.id)

def depthOf (parents : List (String × (String × String))) : Nat → String → Option Nat
  | 0, _ => none
  | fuel + 1, scope =>
      match List.lookup scope parents with
      | none => some 0
      | some (owner, _) => (depthOf parents fuel owner).map (· + 1)

def reaches (vertices : List Vertex) : Nat → String → String → Bool
  | 0, _, _ => false
  | fuel + 1, source, target =>
      match vertices.find? (·.id == source) with
      | some vertex => vertex.outputs.any fun next => next == target || reaches vertices fuel next target
      | none => false

def controlCheckedScope? (source : CheckedProcess) (nodeId : NodeId) : Option String := do
  let owner ← StructuredComposition.unique? (source.nodeScopes.filter (·.nodeId == nodeId))
  return owner.scopeId.value

/-- The parentless definition scope of the Process a Call names. -/
def calledRoot? (source : CheckedProcess) (calledProcessId : ProcessId) : Option String := do
  let root ← StructuredComposition.unique? (source.definitionScopes.filter fun scope =>
    scope.parentScopeId.isNone && scope.originElementId.value == calledProcessId.value)
  return root.id.value

end BpmnSemantics.SemanticProcess.NestedScopeControl
