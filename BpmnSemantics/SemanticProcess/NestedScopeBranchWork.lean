module

public import BpmnSemantics.SemanticProcess.StructuredParallelBodyAdmission

/-! The fork-branch cut of NSC-ADMIT-01 and the Call placement scan of CMCALL-ADMIT-01, as PTPB-WORK-01 and
PTPB-CALL-01 of the [pass-through branch specification](../../docs/capsules/PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#admission)
relax them for pass vertices, and the terminal-fork relaxation of the [terminal forks specification](../../docs/capsules/TERMINAL-FORKS-SPEC.md#admission). `NestedScopeControl` consumes them in hidden bodies only, through a private import. -/

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
so its End may share a closure with sibling work; a branch that reaches its paired join keeps PTPB-WORK-01. -/
def branchesReachWorkOrEnd (vertices : List Vertex) : Bool :=
  vertices.all fun vertex => vertex.kind != .fork || vertex.outputs.all fun id =>
    reachesWork vertices vertices.length id ||
      (let scan := branchScan vertices vertices.length id; scan.1 == .finish || scan.2)

/-- TFK-ADMIT-01 and TFK-DATA-01: the shared analysis relaxes the root End count and the cut for every caller,
and this restores one root End and the strict cut wherever the relaxation does not apply. `relaxed` is the
nested scope-data profile; a definition declaring scope-local data keeps the strict cut, because its declared
entry has no commutation law beside an End (the terminal forks specification). -/
def terminalForkBoundsKept (relaxed declaresData : Bool) (root : String)
    (bodies : List (String × List Vertex)) : Bool :=
  (relaxed || ((bodies.lookup root).getD []).countP (·.kind == .finish) == 1) &&
    ((relaxed && !declaresData) || bodies.all fun body => branchesStartWithWork body.2)

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

end BpmnSemantics.SemanticProcess.NestedScopeControl
