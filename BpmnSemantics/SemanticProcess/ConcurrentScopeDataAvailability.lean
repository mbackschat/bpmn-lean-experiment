module

public import BpmnSemantics.SemanticProcess.MergeRegionAdmission
public import BpmnSemantics.SemanticProcess.SerialBusinessTaskAdmission
meta import BpmnSemantics.PrivateEquationLemmas

/-! # Concurrent scope data availability

CSD-AVAILABLE-01 of the
[concurrent scope data specification](../../docs/capsules/CONCURRENT-SCOPE-DATA-SPEC.md#admission).
A name declared by an input of the reader's scope chain is always available, because every local of the
profile is an input. Any other name resolves to the Process, so the walk tracks only Process-landing
definite writes: a Service or Sub-Process output whose target no enclosing scope declares. The set at a
raw body vertex is the union of its inputs after a Parallel join, their intersection after an Exclusive
merge, and the union of every End at a body's completion, which waits for every branch; forward flow
alone keeps a write in one fork branch away from its siblings. A read that is neither declared nor
definitely written is a required Start name. The walk is analysis evidence over raw bodies, before
merge-region contraction, and carries no runtime authority.

CMCALL-START-01 adds the optional Start names: a mapped Call's input sources and output targets that are
neither declared on the Call's chain nor definitely written before it, so they resolve to the Process
binding there. A Call input reads without requiring, because an absent source becomes a present null
(CVM-IN-01), and a Call output is a definite write (CMCALL-AVAILABLE-01).
-/

public section

namespace BpmnSemantics.SemanticProcess.ConcurrentScopeData

open StructuredParallelBody

/-- The names one task vertex reads before it runs and writes when it completes; `optional` holds a mapped
Call's names a Start binding may supply without being required to. -/
structure Access where
  reads : List String
  writes : List String
  optional : List String := []
  deriving Repr, DecidableEq

/-- One definition scope's raw body and the child scope of each of its Sub-Process vertices. -/
structure Body where
  scope : String
  vertices : List MergeRegion.RawVertex
  children : List (String × String)
  deriving Repr, DecidableEq

/-- What reaching a vertex establishes: its definitely written names and the required and optional names
seen so far. -/
structure Reached where
  written : List String
  required : List String
  optional : List String := []

private def union (sets : List (List String)) : List String := sets.flatten.eraseDups

private def intersection : List (List String) → List String
  | [] => []
  | first :: rest => first.filter fun name => rest.all (·.contains name)

run_meta privateEquations `BpmnSemantics.SemanticProcess.ConcurrentScopeData #[`intersection]

/-- CSD-AVAILABLE-01 at an Exclusive merge: a name stays available only when every incoming branch wrote
it, so a write on one merge branch never reaches the merge target. -/
private theorem intersection_written_on_every_branch {sets : List (List String)} {name : String}
    (available : name ∈ intersection sets) : ∀ set ∈ sets, name ∈ set := by
  cases sets with
  | nil => simp [intersection] at available
  | cons first rest =>
      simp [intersection] at available
      intro set member
      rcases List.mem_cons.mp member with rfl | later
      · exact available.1
      · exact available.2 set later

/-- A Sub-Process vertex reads its inputs' enclosing names and writes its output targets. -/
private def recordAccess (record : ScopeLocalData) : Access :=
  { reads := SerialBusinessTask.readNames record.localInputs, writes := record.localOutputs.map (·.target) }

/-- Leaving `id`: the merge of its predecessors' exits, then a task's own reads and writes. `complete` is
the child completion one scope level down; vertex fuel refuses a cycle. -/
def exit (body : Body) (declared entry : List String) (accessOf : String → Access)
    (complete : String → List String → Option Reached) : Nat → String → Option Reached
  | 0, _ => none
  | fuel + 1, id => do
      let vertex ← body.vertices.find? (·.id == id)
      let before ← match vertex.kind with
        | .vertex .start => some { written := entry, required := [] }
        | kind => do
            let inputs ← (body.vertices.filter (·.outputs.contains id)).mapM
              (fun input => exit body declared entry accessOf complete fuel input.id)
            if inputs.isEmpty then none
            else some { written := if kind == .merge then intersection (inputs.map (·.written))
                          else union (inputs.map (·.written))
                        required := union (inputs.map (·.required))
                        optional := union (inputs.map (·.optional)) }
      if vertex.kind != .vertex .task then some before
      else
        let access := accessOf id
        let unresolved := fun (name : String) => !declared.contains name && !before.written.contains name
        let done ← match List.lookup id body.children with
          | some child => complete child before.written
          | none => some { written := before.written, required := [] }
        some { written := union [done.written, access.writes.filter (!declared.contains ·)]
               required := union [before.required, access.reads.filter unresolved, done.required]
               optional := union [before.optional, access.optional.filter unresolved, done.optional] }

/-- The union over every End of `scope`'s body entered with `entry`, under the names `enclosing` declares;
scope fuel bounds the descent, so a child cycle refuses. -/
def completion (bodies : List Body) (records : List ScopeLocalData) (accesses : List (String × Access)) :
    Nat → String → List String → List String → Option Reached
  | 0, _, _, _ => none
  | fuel + 1, scope, entry, enclosing => do
      let body ← bodies.find? (·.scope == scope)
      let record := records.find? (·.scopeId.value == scope)
      let declared := enclosing ++ (record.map fun record => record.localInputs.map (·.target)).getD []
      let accessOf := fun (id : String) => match List.lookup id body.children with
        | some child => ((records.find? (·.scopeId.value == child)).map recordAccess).getD { reads := [], writes := [] }
        | none => (List.lookup id accesses).getD { reads := [], writes := [] }
      let ends ← (body.vertices.filter (·.kind == .vertex .finish)).mapM fun vertex =>
        exit body declared entry accessOf (fun child written => completion bodies records accesses fuel child written declared)
          (body.vertices.length + 1) vertex.id
      if ends.isEmpty then none
      else some { written := union (ends.map (·.written)), required := union (ends.map (·.required))
                  optional := union (ends.map (·.optional)) }

/-- The required and optional Start names of the tree below `root`, each in canonical order; `none` when a
body is missing or a walk is cyclic. `accesses` holds the mapped Service Task and Call vertices. -/
def startNames (root : String) (bodies : List Body) (records : List ScopeLocalData)
    (accesses : List (String × Access)) : Option (List String × List String) := do
  let reached ← completion bodies records accesses (bodies.length + 1) root [] []
  let sorted := fun (names : List String) => names.mergeSort fun left right => decide (left ≤ right)
  return (sorted reached.required, sorted reached.optional)

end BpmnSemantics.SemanticProcess.ConcurrentScopeData
