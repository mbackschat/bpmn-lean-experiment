module

public import BpmnSemantics.SemanticProcess.NestedScopeDataAdmission
import BpmnSemantics.SemanticProcess.ScopeDataBurst

/-! # Scope re-entry admission

SRE-ROUTE-01, SRE-ADMIT-01, SRE-AVAILABLE-01 and SRE-BURST-01 for `nestedScopeDataProfileId`, per the
[scope re-entry specification](../../docs/capsules/SCOPE-REENTRY-SPEC.md#admission). A Process root body is a graph
of tasks, Sub-Processes, Calls, Choices with one or more conditions and Merges, possibly cyclic. The profile's
envelope, its structure rule and the serial walk of each Sub-Process body and called Process stay
`NestedScopeData`'s; this module adds only the root graph; the burst is `ScopeDataBurst`'s. A Choice or Merge, which
only routes, is a pair of its id and its outputs, a Choice's being its candidates' targets in declaration order, then
its default's. Transcribed independently by the TypeScript `scope-reentry-admission` module.
-/

public section

namespace BpmnSemantics.SemanticProcess.ScopeReentry

open BpmnSemantics
open NestedScopeData

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
with its arity checked. `rootEnds` counts the root's None End elements, which each analysis level counts its own way
(NEF-END-01). -/
private def rootGraphAnalysis (vertices : List Vertex) (joints : List (String × List String))
    (records : List ScopeLocalData) (scopes : List DefinitionScope) (root entry : String) (handlers : List String)
    (rootEnds : Nat) : Option (Analysis × Nat) := do
  let rootVertices := vertices.filter (·.scope == root)
  let ids := vertices.map (·.id) ++ joints.map (·.1)
  let rootIds := rootVertices.map (·.id) ++ joints.map (·.1)
  if !(structureAdmitted vertices records scopes root handlers && ids.eraseDups.length == ids.length &&
      rootVertices.any (·.id == entry) &&
      (rootVertices.filter (·.kind == .start)).length == 1 && rootEnds == 1 &&
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
      let burst ← ScopeDataBurst.scopeDataBurst? vertices joints root entry
      let walked := walks.map (·.1) ++ joints.map fun joint => (joint.1, [])
      let outputs := ScopeDataBurst.jointOutputs vertices joints
      some ({ accesses := walked.flatMap (·.2), required := barrierNames outputs entry walked requiredReads,
              optional := if vertices.any (fun v => match v.kind with | .call .. => true | _ => false)
                then some (barrierNames outputs entry walked optionalCallNames) else none }, burst)

private theorem rootGraphAnalysis_one_scope (vertices : List Vertex) (joints : List (String × List String))
    (records : List ScopeLocalData) (scopes : List DefinitionScope) (root entry : String) (handlers : List String)
    (rootEnds : Nat) (one : scopes.length = 1) :
    rootGraphAnalysis vertices joints records scopes root entry handlers rootEnds = none := by
  -- `delta` unfolds without realizing equation lemmas, which Lean would export; this module stays off the
  -- `meta import` of the equation helper, whose hidden-edit fan-out is at its recorded bound.
  delta rootGraphAnalysis
  simp [structureAdmitted_one_scope vertices records scopes root handlers one]

private def checkedJoint : CheckedNode → Bool
  | .exclusiveGateway .. | .exclusiveMerge .. => true
  | _ => false

/-- SRE-ADMIT-01, XCA-ADMIT-01: a Choice with one or more conditions or a single-output Merge of the root scope; one in a
body refuses. -/
private def checkedJoint? (source : CheckedProcess) (root : DefinitionScopeId) :
    CheckedNode → Option (String × List String)
  | .exclusiveGateway id candidates default => do
      if dataCheckedNodeScope? source id != some root || candidates.isEmpty then none else do
      let outputs ← (candidates ++ [default]).mapM fun flowId =>
        (source.sequenceFlows.find? (·.id == flowId)).map (·.targetId.value)
      some (id.value, outputs)
  | .exclusiveMerge id =>
      match (source.sequenceFlows.filter (·.sourceId == id)).map (·.targetId.value) with
      | [output] => if dataCheckedNodeScope? source id != some root then none else some (id.value, [output])
      | _ => none
  | _ => none

/-- A one-input merge is an Abstract or Manual Task (PTT-ADMIT-01), a vertex that keeps a serial model serial, so
only a merge of two or more inputs is a joint (SRE-ROUTE-01). -/
private def operationJoint : SemanticOperation → Bool
  | .choose .. => true
  | .mergeExclusive _ _ inputs _ => 2 ≤ inputs.length
  | _ => false

/-- SRE-ADMIT-01, XCA-ADMIT-01: a Choice with one or more conditions or a Merge of the root scope; one in a body refuses. -/
private def operationJoint? (program : Program) (root : String) (operation : SemanticOperation) :
    Option (String × List String) := do
  if dataOperationScope? program operation != some root then none else
  match operation with
  | .choose id _ _ candidates defaultOutput _ =>
      if candidates.isEmpty then none
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
    (SerialBusinessTask.checkedHandlers source) (vertices.filter fun v => v.scope == root.value && v.kind == .finish).length

private def programAdmission (program : Program) : Option (Analysis × Nat) := do
  let (root, start, operations) ← programEnvelope? program
  let vertices ← (operations.filter (!operationJoint ·)).mapM (operationVertex? program)
  let joints ← (operations.filter operationJoint).mapM (operationJoint? program root.value)
  -- A fan-in End lowers to one Finish vertex per incoming flow, all with the End as origin (NEF-END-01), so the
  -- Program counts the distinct origins of its root arrivals where the checked graph counts End vertices.
  let rootEnds := (operations.filterMap fun op => match op with
    | .reachNoneEnd _ origin _ =>
        if dataOperationScope? program op == some root.value then some origin.elementId.value else none
    | _ => none).eraseDups.length
  rootGraphAnalysis vertices joints program.scopeLocalData program.definitionScopes root.value start.value
    (SerialBusinessTask.programHandlers program) rootEnds

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
  cases programEnvelope? program <;> simp [rootGraphAnalysis_one_scope _ _ _ _ _ _ _ _ one]

/-- SRE-AVAILABLE-01 and the profile's Start domain over the re-entry analysis. -/
def startBindingsAdmitted (program : Program) (bindings : List VariableBinding) : Bool :=
  startBindingsAdmittedBy (programAnalysis program) program bindings

end BpmnSemantics.SemanticProcess.ScopeReentry
