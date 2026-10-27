module

public import BpmnSemantics.SemanticProcess.MergeRegionAdmission
public import BpmnSemantics.SemanticProcess.SerialBusinessTaskAdmission

/-! # Concurrent scope data availability

CSD-AVAILABLE-01 of the
[concurrent scope data proposal](../../docs/capsules/CONCURRENT-SCOPE-DATA-PROPOSAL.md#admission).
A name declared by an input of the reader's scope chain is always available, because every local of the
profile is an input. Any other name resolves to the Process, so the walk tracks only Process-landing
definite writes: a Service or Sub-Process output whose target no enclosing scope declares. The set at a
raw body vertex is the union of its inputs after a Parallel join, their intersection after an Exclusive
merge, and the union of every End at a body's completion, which waits for every branch; forward flow
alone keeps a write in one fork branch away from its siblings. A read that is neither declared nor
definitely written is a required Start name. The walk is analysis evidence over raw bodies, before
merge-region contraction, and carries no runtime authority.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.ConcurrentScopeData

open StructuredParallelBody

/-- The names one task vertex reads before it runs and writes when it completes. -/
structure Access where
  reads : List String
  writes : List String
  deriving Repr, DecidableEq

/-- One definition scope's raw body and the child scope of each of its Sub-Process vertices. -/
structure Body where
  scope : String
  vertices : List MergeRegion.RawVertex
  children : List (String × String)
  deriving Repr, DecidableEq

/-- What reaching a vertex establishes: its definitely written names and the required names seen so far. -/
structure Reached where
  written : List String
  required : List String

def union (sets : List (List String)) : List String := sets.flatten.eraseDups

def intersection : List (List String) → List String
  | [] => []
  | first :: rest => first.filter fun name => rest.all (·.contains name)

/-- CSD-AVAILABLE-01 at an Exclusive merge: a name stays available only when every incoming branch wrote
it, so a write on one merge branch never reaches the merge target. -/
theorem intersection_written_on_every_branch {sets : List (List String)} {name : String}
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
def recordAccess (record : ScopeLocalData) : Access :=
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
                        required := union (inputs.map (·.required)) }
      if vertex.kind != .vertex .task then some before
      else
        let access := accessOf id
        let missing := access.reads.filter fun name => !declared.contains name && !before.written.contains name
        let done ← match List.lookup id body.children with
          | some child => complete child before.written
          | none => some { written := before.written, required := [] }
        some { written := union [done.written, access.writes.filter (!declared.contains ·)]
               required := union [before.required, missing, done.required] }

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
        | some child => ((records.find? (·.scopeId.value == child)).map recordAccess).getD ⟨[], []⟩
        | none => (List.lookup id accesses).getD ⟨[], []⟩
      let ends ← (body.vertices.filter (·.kind == .vertex .finish)).mapM fun vertex =>
        exit body declared entry accessOf (fun child written => completion bodies records accesses fuel child written declared)
          (body.vertices.length + 1) vertex.id
      if ends.isEmpty then none
      else some { written := union (ends.map (·.written)), required := union (ends.map (·.required)) }

/-- The required Start names of the tree below `root`, in canonical order; `none` when a body is missing or
a walk is cyclic. `accesses` holds the mapped Service Task vertices. -/
def requiredStartNames (root : String) (bodies : List Body) (records : List ScopeLocalData)
    (accesses : List (String × Access)) : Option (List String) := do
  let reached ← completion bodies records accesses (bodies.length + 1) root [] []
  return reached.required.mergeSort fun left right => decide (left ≤ right)

end BpmnSemantics.SemanticProcess.ConcurrentScopeData
