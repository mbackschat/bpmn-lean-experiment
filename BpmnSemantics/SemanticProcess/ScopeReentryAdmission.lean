module

public import BpmnSemantics.SemanticProcess.NestedScopeDataAdmission
import BpmnSemantics.SemanticProcess.ClosureLimit

/-! # Scope re-entry admission

SRE-ROUTE-01, SRE-ADMIT-01, SRE-AVAILABLE-01 and SRE-BURST-01 for `nestedScopeDataProfileId`, per the
[scope re-entry proposal](../../docs/capsules/SCOPE-REENTRY-PROPOSAL.md#admission). A Process root body is a graph
of tasks, Sub-Processes, Calls, two-condition Choices and Merges, possibly cyclic. The profile's envelope, its
structure rule and the serial walk of each Sub-Process body and called Process stay `NestedScopeData`'s; this module
adds only the root graph. A Choice or Merge, which only routes, is a pair of its id and its outputs, a Choice's
being its two candidates' targets in declaration order, then its default's. Transcribed independently by the
TypeScript `scope-reentry-admission` module.
-/

public section

namespace BpmnSemantics.SemanticProcess.ScopeReentry

open BpmnSemantics
open NestedScopeData

/-- The automatic steps from `id` along one body's serial path, with whether a wait armed: arming a wait costs
one and stops; a body's or called Process's Start is no operation and costs nothing; its End costs two, its own
step and its scope's completion or the called Process's return; an enclosed Sub-Process or Call costs its entry
plus its own body. `none` refuses, which the serial walk's admission of every body precludes. -/
private def bodySteps (vertices : List Vertex) : Nat → String → String → Option (Nat × Bool)
  | 0, _, _ => none
  | fuel + 1, scope, id => do
      let v ← vertices.find? (·.id == id)
      if v.scope != scope then none else do
      let here ← match v.kind with
        | .human | .service => some (1, true)
        | .start => some (0, false)
        | .finish => some (2, false)
        | .subProcess child entry _ | .call child entry .. => do
            let (cost, stops) ← bodySteps vertices fuel child entry
            some (1 + cost, stops)
      if here.2 then some here else
      match v.outputs with
      | [] => some here
      | [next] => do
          let (cost, stops) ← bodySteps vertices fuel scope next
          some (here.1 + cost, stops)
      | _ => none

private def rootOutputs (vertices : List Vertex) (joints : List (String × List String)) (id : String) :
    List String :=
  match joints.find? (·.1 == id) with
  | some joint => joint.2
  | none => ((vertices.find? (·.id == id)).map (·.outputs)).getD []

/-- Entering one root vertex: a root Start costs one, its End two and stops the Process, a Choice or Merge one. -/
private def rootEntry (vertices : List Vertex) (joints : List (String × List String)) (id : String) :
    Option (Nat × Bool) :=
  if joints.any (·.1 == id) then some (1, false) else do
  let v ← vertices.find? (·.id == id)
  match v.kind with
  | .human | .service => some (1, true)
  | .start => some (1, false)
  | .finish => some (2, true)
  | .subProcess child entry _ | .call child entry .. => do
      let (cost, stops) ← bodySteps vertices (2 * vertices.length + 1) child entry
      some (1 + cost, stops)

/-- The longest automatic burst from entering root vertex `id`. Every root step costs at least one, so `fuel`
of `scenarioClosureLimit + 1` root steps refuses exactly the bursts above the limit, an automatic cycle among
them. -/
private def rootSteps (vertices : List Vertex) (joints : List (String × List String)) : Nat → String → Option Nat
  | 0, _ => none
  | fuel + 1, id => do
      let (cost, stops) ← rootEntry vertices joints id
      if stops then some cost else do
      let rests ← (rootOutputs vertices joints id).mapM (rootSteps vertices joints fuel)
      some (cost + rests.foldl max 0)

/-- The steps after vertex `v` completes: the rest of its body, then each enclosing owner's continuation; each
recursion moves to an enclosing scope, so the vertex count bounds `fuel`. -/
private def stepsAfter (vertices : List Vertex) (joints : List (String × List String)) (root : String) :
    Nat → Vertex → Option Nat
  | 0, _ => none
  | fuel + 1, v =>
      if v.scope == root then do
        let rests ← v.outputs.mapM (rootSteps vertices joints (scenarioClosureLimit + 1))
        some (rests.foldl max 0)
      else do
        let (cost, stops) ← match v.outputs with
          | [next] => bodySteps vertices (2 * vertices.length + 1) v.scope next
          | _ => none
        if stops then some cost else do
        let owners := vertices.filter fun owner => match owner.kind with
          | .subProcess child .. | .call child .. => child == v.scope
          | _ => false
        if owners.isEmpty then none else do
        let continued ← owners.mapM (stepsAfter vertices joints root fuel)
        some (cost + continued.foldl max 0)

/-- SRE-BURST-01: the longest burst from Start or from any wait's resumption, `none` above the limit. -/
private def burst? (vertices : List Vertex) (joints : List (String × List String)) (root entry : String) :
    Option Nat := do
  let fromStart ← rootSteps vertices joints (scenarioClosureLimit + 1) entry
  let resumed ← (vertices.filter fun v => match v.kind with
    | .human | .service => true
    | _ => false).mapM (stepsAfter vertices joints root (vertices.length + 1))
  let burst := resumed.foldl max fromStart
  if burst ≤ scenarioClosureLimit then some burst else none

/-- Whether `target` is reachable from the pending vertices without leaving a barrier vertex; `fuel` exceeds the
vertex count, as each vertex is pushed at most once. -/
private def reachableAvoiding (outputs : String → List String) (barrier : String → Bool) (target : String) :
    Nat → List String → List String → Bool
  | 0, _, _ => false
  | _ + 1, [], _ => false
  | fuel + 1, current :: pending, seen =>
      if current == target then true
      else if barrier current then reachableAvoiding outputs barrier target fuel pending seen
      else
        let next := (outputs current).filter (!seen.contains ·)
        reachableAvoiding outputs barrier target fuel (pending ++ next) (seen ++ next)

/-- The Process-level names one root vertex definitely writes: writes no frame of its own declares. -/
private def definiteProcessWrites (accesses : List Access) : List String :=
  accesses.filterMap fun
    | .write name frames | .callOutput name frames => if frames.any (·.contains name) then none else some name
    | _ => none

/-- SRE-AVAILABLE-01's barrier rule (MTCF-DATA-01): a name a root vertex needs from outside is a Start name when
that vertex stays reachable from Start after removing the outgoing edges of every vertex that definitely writes the
name, so a write reached only through a back-edge never satisfies a first entry. -/
private def barrierNames (outputs : String → List String) (entry : String) (walked : List (String × List Access))
    (needs : List Access → List String → List String) : List String :=
  let writes := fun id => definiteProcessWrites (((walked.find? (·.1 == id)).map (·.2)).getD [])
  (walked.flatMap fun (id, accesses) =>
    (needs accesses []).filter fun name =>
      reachableAvoiding outputs (fun vertex => (writes vertex).contains name) id (walked.length + 1)
        [entry] [entry]).eraseDups

/-- One root vertex's accesses and the vertices its walk visits, by the serial walk over a copy of the model in
which the vertex's successor is a fresh End, so the walk stops after it. -/
private def rootVertexWalk (vertices : List Vertex) (records : List ScopeLocalData)
    (scopes : List DefinitionScope) (v : Vertex) : Option (List Access × List String × List String) :=
  if v.kind == .finish then some ([], [v.id], []) else do
  -- Longer than every vertex id, so distinct from all of them.
  let fresh := "#" ++ String.join (vertices.map (·.id))
  let stopped := { v with outputs := [fresh] } :: { id := fresh, scope := v.scope, kind := .finish, outputs := [] } ::
    vertices.filter (·.id != v.id)
  let (accesses, visited, called) ← walk stopped records scopes (stopped.length + 1) 0 [] v.scope v.id
  some (accesses, visited.filter (· != fresh), called)

private def rootArityValid (v : Vertex) : Bool :=
  match v.kind with
  | .finish => v.outputs.isEmpty
  | _ => v.outputs.length == 1

/-- SRE-ADMIT-01 over one root graph: the serial structure rule, every root vertex's own walk, each caller vertex
visited once and every called vertex walked from some Call, one Start and one End at the root, and a burst within
the limit, returned beside the analysis; the Start names follow SRE-AVAILABLE-01. Each Choice and Merge arrives
with its arity checked. -/
private def rootGraphAnalysis (vertices : List Vertex) (joints : List (String × List String))
    (records : List ScopeLocalData) (scopes : List DefinitionScope) (root entry : String) (handlers : List String) :
    Option (Analysis × Nat) := do
  let rootVertices := vertices.filter (·.scope == root)
  let ids := vertices.map (·.id) ++ joints.map (·.1)
  let rootIds := rootVertices.map (·.id) ++ joints.map (·.1)
  if !(structureAdmitted vertices records scopes root handlers && ids.eraseDups.length == ids.length &&
      rootVertices.any (·.id == entry) &&
      (rootVertices.filter (·.kind == .start)).length == 1 && (rootVertices.filter (·.kind == .finish)).length == 1 &&
      rootVertices.all rootArityValid &&
      (rootVertices.flatMap (·.outputs) ++ joints.flatMap (·.2)).all rootIds.contains) then none
  else do
    let walks ← rootVertices.mapM fun v => do
      let (accesses, visited, called) ← rootVertexWalk vertices records scopes v
      some ((v.id, accesses), visited, called)
    let visited := walks.flatMap (·.2.1)
    let called := (walks.flatMap (·.2.2)).eraseDups
    if visited.eraseDups.length != visited.length || visited.any called.contains ||
        visited.length + called.length != vertices.length then none
    else do
      let burst ← burst? vertices joints root entry
      let walked := walks.map (·.1) ++ joints.map fun joint => (joint.1, [])
      let outputs := rootOutputs vertices joints
      some ({ accesses := walked.flatMap (·.2), required := barrierNames outputs entry walked requiredReads,
              optional := if vertices.any (fun v => match v.kind with | .call .. => true | _ => false)
                then some (barrierNames outputs entry walked optionalCallNames) else none }, burst)

private theorem rootGraphAnalysis_one_scope (vertices : List Vertex) (joints : List (String × List String))
    (records : List ScopeLocalData) (scopes : List DefinitionScope) (root entry : String) (handlers : List String)
    (one : scopes.length = 1) : rootGraphAnalysis vertices joints records scopes root entry handlers = none := by
  -- `delta` unfolds without realizing equation lemmas, which Lean would export; this module stays off the
  -- `meta import` of the equation helper, whose hidden-edit fan-out is at its recorded bound.
  delta rootGraphAnalysis
  simp [structureAdmitted_one_scope vertices records scopes root handlers one]

private def checkedJoint : CheckedNode → Bool
  | .exclusiveGateway .. | .exclusiveMerge .. => true
  | _ => false

/-- SRE-ADMIT-01: a two-condition Choice or a single-output Merge of the root scope; one in a body refuses. -/
private def checkedJoint? (source : CheckedProcess) (root : DefinitionScopeId) :
    CheckedNode → Option (String × List String)
  | .exclusiveGateway id candidates default => do
      if dataCheckedNodeScope? source id != some root || candidates.length != 2 then none else do
      let outputs ← (candidates ++ [default]).mapM fun flowId =>
        (source.sequenceFlows.find? (·.id == flowId)).map (·.targetId.value)
      some (id.value, outputs)
  | .exclusiveMerge id =>
      match (source.sequenceFlows.filter (·.sourceId == id)).map (·.targetId.value) with
      | [output] => if dataCheckedNodeScope? source id != some root then none else some (id.value, [output])
      | _ => none
  | _ => none

private def operationJoint : SemanticOperation → Bool
  | .choose .. | .mergeExclusive .. => true
  | _ => false

/-- SRE-ADMIT-01: a two-condition Choice or a Merge of the root scope; one in a body refuses. -/
private def operationJoint? (program : Program) (root : String) (operation : SemanticOperation) :
    Option (String × List String) := do
  if dataOperationScope? program operation != some root then none else
  match operation with
  | .choose id _ _ candidates defaultOutput _ =>
      if candidates.length != 2 then none
      else return (id.value, ← (candidates.map (·.output) ++ [defaultOutput]).mapM (consumer? program))
  | .mergeExclusive id _ _ output => return (id.value, [← consumer? program output])
  | _ => none

private def rootScopeOf (scopes : List DefinitionScope) (processId : ProcessId) : Option DefinitionScopeId :=
  (scopes.find? fun scope => scope.parentScopeId.isNone && scope.originElementId.value == processId.value).map (·.id)

/-- SRE-ROUTE-01: a Program of the nested scope-data profile whose root body holds a Choice or a Merge. -/
def programReentry (program : Program) : Bool :=
  program.identity.semanticProfile == nestedScopeDataProfileId &&
    program.operations.any fun operation => operationJoint operation &&
      (program.operationScopes.find? (·.operationId == operation.id)).map (·.scopeId) ==
        rootScopeOf program.definitionScopes program.processId

/-- SRE-ROUTE-01 over the checked graph, independent of the Program; consulted only under the profile. -/
def checkedReentry (source : CheckedProcess) : Bool :=
  source.nodes.any fun node => checkedJoint node &&
    (source.nodeScopes.find? (·.nodeId == node.id)).map (·.scopeId) ==
      rootScopeOf source.definitionScopes source.processId

private def checkedAdmission (source : CheckedProcess) : Option (Analysis × Nat) := do
  let (root, entry) ← checkedEnvelope? source
  let vertices ← (source.nodes.filter (!checkedJoint ·)).mapM (checkedVertex? source)
  let joints ← (source.nodes.filter checkedJoint).mapM (checkedJoint? source root)
  rootGraphAnalysis vertices joints source.scopeLocalData source.definitionScopes root.value entry.value
    (SerialBusinessTask.checkedHandlers source)

private def programAdmission (program : Program) : Option (Analysis × Nat) := do
  let (root, start, operations) ← programEnvelope? program
  let vertices ← (operations.filter (!operationJoint ·)).mapM (operationVertex? program)
  let joints ← (operations.filter operationJoint).mapM (operationJoint? program root.value)
  rootGraphAnalysis vertices joints program.scopeLocalData program.definitionScopes root.value start.value
    (SerialBusinessTask.programHandlers program)

/-- SRE-ADMIT-01 over the checked graph; conditions are left to the generic rule placing them on Choice
candidates. -/
def checkedAnalysis (source : CheckedProcess) : Option Analysis := (checkedAdmission source).map (·.1)

/-- SRE-ADMIT-01 over the Program, independent of the checked graph. -/
def programAnalysis (program : Program) : Option Analysis := (programAdmission program).map (·.1)

/-- SRE-BURST-01's admitted burst of a checked graph, for agreement with the TypeScript account. -/
def checkedBurst? (source : CheckedProcess) : Option Nat := (checkedAdmission source).map (·.2)

/-- SRE-BURST-01's admitted burst of a Program. -/
def programBurst? (program : Program) : Option Nat := (programAdmission program).map (·.2)

/-- A one-scope Program is never admitted: the profile requires at least one Sub-Process. -/
theorem programAnalysis_one_scope (program : Program) (one : program.definitionScopes.length = 1) :
    programAnalysis program = none := by
  delta programAnalysis programAdmission
  cases programEnvelope? program <;> simp [rootGraphAnalysis_one_scope _ _ _ _ _ _ _ one]

/-- SRE-AVAILABLE-01 and the profile's Start domain over the re-entry analysis. -/
def startBindingsAdmitted (program : Program) (bindings : List VariableBinding) : Bool :=
  startBindingsAdmittedBy (programAnalysis program) program bindings

end BpmnSemantics.SemanticProcess.ScopeReentry
