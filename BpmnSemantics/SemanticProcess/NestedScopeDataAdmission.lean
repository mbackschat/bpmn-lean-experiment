module

public import BpmnSemantics.SemanticProcess.EffectDataAdmission
import BpmnSemantics.SemanticProcess.CheckedPassThroughFlow
import BpmnSemantics.SemanticProcess.ActivityHostWork
meta import BpmnSemantics.PrivateEquationLemmas

/-! # Nested scope-data profile admission

NSD-ADMIT-01 and NSD-AVAILABLE-01 for `nestedScopeDataProfileId`, per the
[nested scope data specification](../../docs/capsules/NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#stable-rules).
The checked graph and the IL are analyzed independently into one transient tree walk: each scope is
one serial path, and a Sub-Process vertex walks its child scope before its own successor. The walk
records every read and definite write with the declaring frames enclosing it, which is all the
availability scan needs; the walk is analysis evidence, never serialized executable authority.

Mapping grammar, name policy and literal bounds are `SerialBusinessTask`'s and `EffectData`'s.
-/

public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace NestedScopeData

/-- Definition depth of the deepest admitted Sub-Process below the root. -/
def depthLimit : Nat := 3

/-- Input and output declarations admitted per Sub-Process. -/
def declarationLimit : Nat := 8

/-- User Tasks admitted on a called Process's serial path (CVM-ADMIT-01). -/
def calledTaskLimit : Nat := 3

/-- CALLN-ADMIT-01's Stage B: up to two Calls, each on the root path or at most two Sub-Processes deep. -/
def callLimit : Nat := 2

def callDepthLimit : Nat := 2

inductive Kind where
  | start
  | human
  | service
  /-- An Abstract or Manual Task (PTT-ADMIT-01), on the Program side a one-input exclusive merge: it reads and
  writes nothing and continues. -/
  | passThrough
  /-- `entry` is the first vertex of the child scope and `origin` the Sub-Process element. -/
  | subProcess (child entry origin : String)
  /-- `scope` is the called root, `entry` its first vertex, `calledProcess` the called Process. -/
  | call (scope entry calledProcess : String) (inputs outputs : List VariableMapping)
  | finish
  deriving Repr, DecidableEq

structure Vertex where
  id : String
  scope : String
  kind : Kind
  outputs : List String
  reads : List String := []
  writes : List String := []
  deriving Repr, DecidableEq

/-- A name access together with the names declared by the frames enclosing it, innermost first.
`callInput` reads a Call input source without making Start bind it, because an absent source
becomes a present null (CVM-IN-01); `callOutput` is a definite write, because return always writes
(CVM-AVAILABLE-01). -/
inductive Access where
  | read (name : String) (frames : List (List String))
  | write (name : String) (frames : List (List String))
  | callInput (name : String) (frames : List (List String))
  | callOutput (name : String) (frames : List (List String))
  deriving Repr, DecidableEq

/-- `optional` is `none` without a Call, where any admitted name may be bound at Start. -/
structure Analysis where
  accesses : List Access
  required : List String
  optional : Option (List String) := none
  deriving Repr, DecidableEq

def readNames (mappings : List VariableMapping) : List String :=
  SerialBusinessTask.readNames mappings

def recordValid (handlers : List String) (record : ScopeLocalData) : Bool :=
  !record.localInputs.isEmpty && record.localInputs.length ≤ declarationLimit &&
    record.localOutputs.length ≤ declarationLimit &&
    strictlySortedStrings (record.localInputs.map (·.target)) &&
    strictlySortedStrings (record.localOutputs.map (·.target)) &&
    record.localInputs.all (fun mapping =>
      SerialBusinessTask.nameAllowed handlers mapping.target && match mapping.expression with
        | .stringLiteral value =>
            SerialBusinessTask.literalValid value && value.utf8ByteSize ≤ EffectData.literalByteLimit
        | .enclosingVariable name => SerialBusinessTask.nameAllowed handlers name
        | .localVariable _ => false) &&
    record.localOutputs.all fun mapping =>
      SerialBusinessTask.nameAllowed handlers mapping.target && match mapping.expression with
        | .localVariable source => record.localInputs.any (·.target == source)
        | _ => false

def recordOf (records : List ScopeLocalData) (child : String) : Option ScopeLocalData :=
  records.find? (·.scopeId.value == child)

/-- A Sub-Process's child scope must be a direct child of the walking scope, originating at that element. -/
def childScopeValid (scopes : List DefinitionScope) (parent child origin : String) : Bool :=
  match scopes.filter (·.id.value == child) with
  | [scope] => scope.parentScopeId.map (·.value) == some parent && scope.originElementId.value == origin
  | _ => false

/-- The called root a Call names: parentless and originating at the called Process. -/
def calledScopeValid (scopes : List DefinitionScope) (scope calledProcess : String) : Bool :=
  match scopes.filter (·.id.value == scope) with
  | [root] => root.parentScopeId.isNone && root.originElementId.value == calledProcess
  | _ => false

/-- CVM-ADMIT-01's names: every source and target an admitted identifier no handler uses. -/
def callMappingsAdmitted (handlers : List String) (inputs outputs : List VariableMapping) : Bool :=
  (inputs ++ outputs).all fun mapping => SerialBusinessTask.nameAllowed handlers mapping.target &&
    match mapping.expression with
    | .stringLiteral _ => false
    | .localVariable name | .enclosingVariable name => SerialBusinessTask.nameAllowed handlers name

/-- The called path: an optional Start, one to `calledTaskLimit` User Tasks, then an End. -/
def calledPathValid (vertices : List Vertex) (visited : List String) : Bool :=
  let kinds := visited.filterMap fun id => (vertices.find? (·.id == id)).map (·.kind)
  let tasks := (kinds.filter (· == .human)).length
  kinds.length == visited.length && 1 ≤ tasks && tasks ≤ calledTaskLimit &&
    kinds.all fun kind => kind == .start || kind == .human || kind == .finish

/-- Walks one scope's serial path from `id`, returning its accesses, the caller tree's visited
vertices, each once, and every called body's vertices, once per call site. Recursion depth is
bounded by `fuel`, which the caller sets above the vertex count. -/
def walk (vertices : List Vertex) (records : List ScopeLocalData) (scopes : List DefinitionScope) :
    Nat → Nat → List (List String) → String → String →
      Option (List Access × List String × List String)
  | 0, _, _, _, _ => none
  | fuel + 1, depth, frames, scope, id => do
      let v ← StructuredComposition.unique? (vertices.filter (·.id == id))
      if v.scope != scope then none else
      match v.kind, v.outputs with
      | .finish, [] => some ([], [v.id], [])
      | .start, [next] | .passThrough, [next] | .human, [next] => do
          let (accesses, visited, called) ← walk vertices records scopes fuel depth frames scope next
          some (accesses, v.id :: visited, called)
      | .service, [next] => do
          let (accesses, visited, called) ← walk vertices records scopes fuel depth frames scope next
          some (v.reads.map (Access.read · frames) ++ v.writes.map (Access.write · frames) ++ accesses,
            v.id :: visited, called)
      | .subProcess child entry origin, [next] => do
          if depth ≥ depthLimit || !childScopeValid scopes scope child origin then none else do
          let inputs := ((recordOf records child).map (·.localInputs)).getD []
          let outputs := ((recordOf records child).map (·.localOutputs)).getD []
          let (inner, innerVisited, innerCalled) ←
            walk vertices records scopes fuel (depth + 1) (inputs.map (·.target) :: frames) child entry
          let (accesses, visited, called) ← walk vertices records scopes fuel depth frames scope next
          some ((readNames inputs).map (Access.read · frames) ++ inner ++
              outputs.map (fun mapping => Access.write mapping.target frames) ++ accesses,
            v.id :: innerVisited ++ visited, innerCalled ++ called)
      -- CALLN-ADMIT-01's Stage B: a Call on the root path or at most `callDepthLimit` Sub-Processes
      -- deep. Its inputs read and its outputs write along the enclosing `frames`, so a Call inside a
      -- Sub-Process resolves through that Sub-Process's chain (CALLN-FRAME-01). The called instance
      -- has no parent scope, so its walk starts with no enclosing frame (CVM-ISOLATE-01).
      | .call calledScope entry calledProcess inputs outputs, [next] => do
          if depth > callDepthLimit || !calledScopeValid scopes calledScope calledProcess then none else do
          let (_, innerVisited, _) ← walk vertices records scopes fuel depth [] calledScope entry
          if !calledPathValid vertices innerVisited then none else do
          let (accesses, visited, called) ← walk vertices records scopes fuel depth frames scope next
          some ((readNames inputs).map (Access.callInput · frames) ++
              outputs.map (fun mapping => Access.callOutput mapping.target frames) ++ accesses,
            v.id :: visited, innerVisited ++ called)
      | _, _ => none

/-- NSD-AVAILABLE-01: a read is available when an enclosing frame declares it or an earlier definite
write landed at the Process; a write landing in a declaring frame adds nothing, since only readers
inside that frame, which see the declaration anyway, could resolve to it. -/
def requiredReads : List Access → List String → List String
  | [], _ => []
  | .read name frames :: rest, produced =>
      (if frames.any (·.contains name) || produced.contains name then [] else [name]) ++
        requiredReads rest produced
  | .write name frames :: rest, produced | .callOutput name frames :: rest, produced =>
      requiredReads rest (if frames.any (·.contains name) then produced else name :: produced)
  | .callInput .. :: rest, produced => requiredReads rest produced

/-- CVM-START-01: the Call input sources and output targets a Start binding may supply, those
landing at the Process because no enclosing frame declares them and no earlier step definitely
produces them. -/
def optionalCallNames : List Access → List String → List String
  | [], _ => []
  | .callInput name frames :: rest, produced =>
      (if frames.any (·.contains name) || produced.contains name then [] else [name]) ++
        optionalCallNames rest produced
  | .callOutput name frames :: rest, produced =>
      if frames.any (·.contains name) then optionalCallNames rest produced
      else (if produced.contains name then [] else [name]) ++ optionalCallNames rest (name :: produced)
  | .write name frames :: rest, produced =>
      optionalCallNames rest (if frames.any (·.contains name) then produced else name :: produced)
  | .read .. :: rest, produced => optionalCallNames rest produced

/-- The scope list holds the root, one child per Sub-Process and one called root for the Calls, at most
`callLimit` of one called definition; and every record keys a Sub-Process scope. The re-entry account
(`ScopeReentryAdmission`) applies it to a root graph. -/
def structureAdmitted (vertices : List Vertex) (records : List ScopeLocalData) (scopes : List DefinitionScope)
    (root : String) (handlers : List String) : Bool :=
  let children := vertices.filterMap fun v => match v.kind with
    | .subProcess child .. => some child
    | _ => none
  let calls := vertices.filterMap fun v => match v.kind with
    | .call calledScope _ _ inputs outputs => some (calledScope, inputs, outputs)
    | _ => none
  let calledScopes := (calls.map (·.1)).eraseDups
  let roots := (scopes.filter (·.parentScopeId.isNone)).map (·.id.value)
  scopes.length == children.length + calledScopes.length + 1 &&
    calls.length ≤ callLimit && calledScopes.length ≤ 1 &&
    roots.length == calledScopes.length + 1 && roots.contains root &&
    calls.all (fun (calledScope, inputs, outputs) =>
      calledScope != root && variableMappingsValid inputs outputs && callMappingsAdmitted handlers inputs outputs) &&
    strictlySortedStrings (records.map (·.scopeId.value)) &&
    records.all (fun record => children.contains record.scopeId.value && recordValid handlers record)

run_meta privateEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`structureAdmitted]

/-- Every caller vertex is visited exactly once from the root's entry and every called vertex is
walked from some Call, the two disjoint, under `structureAdmitted`. -/
def analyze (vertices : List Vertex) (records : List ScopeLocalData) (scopes : List DefinitionScope)
    (root entry : String) (handlers : List String) : Option Analysis := do
  if !structureAdmitted vertices records scopes root handlers then none
  else do
    let (accesses, visited, called) ← walk vertices records scopes (vertices.length + 1) 0 [] root entry
    let calledVertices := called.eraseDups
    if visited.eraseDups.length != visited.length || visited.any calledVertices.contains ||
        visited.length + calledVertices.length != vertices.length then none
    else some { accesses, required := (requiredReads accesses []).eraseDups,
                optional := if vertices.any (fun v => match v.kind with | .call .. => true | _ => false)
                  then some (optionalCallNames accesses []).eraseDups else none }

def metadataValid (handlers : List String) (metadata : Option UserTaskMetadata) : Bool :=
  metadata.all (·.form.isNone) && SerialBusinessTask.metadataValid handlers metadata

def serviceValid (handlers : List String) (descriptor : EffectDescriptor)
    (inputs outputs : List VariableMapping) : Bool :=
  SerialBusinessTask.descriptorValid descriptor && EffectData.mappingsValid handlers inputs outputs

/-- `CheckedGraphValidation` owns the general lookup but sits above the profile catalog; this one also
refuses a node with more than one owner. -/
def dataCheckedNodeScope? (source : CheckedProcess) (nodeId : NodeId) : Option DefinitionScopeId := do
  let owner ← StructuredComposition.unique? (source.nodeScopes.filter (·.nodeId == nodeId))
  return owner.scopeId

def checkedStart? (source : CheckedProcess) (scope : DefinitionScopeId) : Option NodeId :=
  StructuredComposition.unique? (source.nodes.filterMap fun node => match node with
    | .noneStartEvent id => if dataCheckedNodeScope? source id == some scope then some id else none
    | _ => none)

def checkedVertex? (source : CheckedProcess) (node : CheckedNode) : Option Vertex := do
  let id := node.id.value
  let scope ← dataCheckedNodeScope? source node.id
  let outputs := (source.sequenceFlows.filter (·.sourceId == node.id)).map (·.targetId.value)
  let handlers := SerialBusinessTask.checkedHandlers source
  match node with
  | .noneStartEvent _ => return { id, scope := scope.value, kind := .start, outputs }
  | .noneEndEvent _ => return { id, scope := scope.value, kind := .finish, outputs }
  -- PTSM-ADMIT-01: a pass-through node with several incoming flows lowers to a many-input merge, which is no serial
  -- vertex, as an Exclusive merge is not; the re-entry account takes it as a joint before consulting this function.
  | .nonOperationalTask _ _ | .noneIntermediateThrowEvent _ =>
      if CheckedPassThroughFlow.merges source.sequenceFlows node then none
      else return { id, scope := scope.value, kind := .passThrough, outputs }
  | .userTask _ _ metadata =>
      if !metadataValid handlers metadata then none
      else return { id, scope := scope.value, kind := .human, outputs }
  | .serviceTask _ descriptor inputs mappings none =>
      if !serviceValid handlers descriptor inputs mappings then none
      else return { id, scope := scope.value, kind := .service, outputs, reads := readNames inputs,
                    writes := mappings.map (·.target) }
  | .embeddedSubProcess _ child => do
      let entry ← checkedStart? source child
      return { id, scope := scope.value, kind := .subProcess child.value entry.value id, outputs }
  | .callActivity _ calledProcess (.variableMappings copiedIn copiedOut) => do
      let calledRoot ← StructuredComposition.unique? (source.definitionScopes.filter fun candidate =>
        candidate.parentScopeId.isNone && candidate.originElementId.value == calledProcess.value)
      let entry ← checkedStart? source calledRoot.id
      return { id, scope := scope.value, outputs,
               kind := .call calledRoot.id.value entry.value calledProcess.value copiedIn copiedOut }
  | _ => none

run_meta privateMatchEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`checkedVertex?]

/-- SSM-ADMIT-01 and SSM-PROFILE-01: the nested scope-data profile admits a Process whose only scope is its root,
while every other profile reaching these analyses keeps needing a Sub-Process or a Call, a second scope. -/
def scopeCountAdmitted (profile : ProfileId) (scopeCount : Nat) : Bool :=
  if profile == nestedScopeDataProfileId then 1 ≤ scopeCount else 2 ≤ scopeCount

/-- The profile's checked envelope, which the re-entry account shares: the root scope and its Start. -/
def checkedEnvelope? (source : CheckedProcess) : Option (DefinitionScopeId × NodeId) := do
  let identities := source.processId.value :: source.nodes.map (·.id.value) ++
    source.sequenceFlows.map (·.id.value)
  if !(source.identity.sourceOverlay.isSome && source.compensation.isNone &&
      source.transactionCancellation.isNone && source.interruptingMessageEventSubProcesses.isEmpty &&
      identities.eraseDups.length == identities.length &&
      scopeCountAdmitted source.identity.semanticProfile source.definitionScopes.length)
  then none
  else do
    let root ← StructuredComposition.unique? (source.definitionScopes.filter fun scope =>
      scope.parentScopeId.isNone && scope.originElementId.value == source.processId.value)
    let entry ← checkedStart? source root.id
    some (root.id, entry)

def checkedAnalysis (source : CheckedProcess) : Option Analysis := do
  let (root, entry) ← checkedEnvelope? source
  if !source.sequenceFlows.all (·.condition.isNone) then none else do
  let vertices ← source.nodes.mapM (checkedVertex? source)
  analyze vertices source.scopeLocalData source.definitionScopes root.value entry.value
    (SerialBusinessTask.checkedHandlers source)

def dataOperationScope? (program : Program) (operation : SemanticOperation) : Option String := do
  let owner ← StructuredComposition.unique?
    (program.operationScopes.filter (·.operationId == operation.id))
  return owner.scopeId.value

def childCompletion? (program : Program) (child : DefinitionScopeId) : Option ControlPlaceId :=
  match program.operations.filter (fun op => match op with
      | .completeScope _ _ scopeId _ => scopeId == child
      | _ => false) with
  | [.completeScope _ _ _ (some output)] => some output
  | _ => none

run_meta privateMatchEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`childCompletion?]

/-- A root Choice's, Merge's and host's inputs too, which only the re-entry account's root graph admits. -/
def operationInputs : SemanticOperation → List ControlPlaceId
  | .enterScope _ _ input .. | .invokeProcess _ _ input .. | .choose _ _ input .. => [input]
  | .mergeExclusive _ _ inputs _ => inputs
  | .activity host => host.inputs
  | operation => SerialBusinessTask.operationInputs operation

/-- The unique operation consuming `place`; scope completions consume no place. -/
def consumer? (program : Program) (place : ControlPlaceId) : Option String := do
  let consumer ← StructuredComposition.unique? (program.operations.filter fun op =>
    (operationInputs op).contains place)
  return consumer.id.value

/-- The vertex of a User Task wait, the legacy operation's and its host's alike (ACTH-ADMIT-01), with one successor per
output (ACSP-HOST-01). -/
private def humanVertex? (program : Program) (id scope : String) (outputs : List ControlPlaceId)
    (task : UserTaskDefinition) : Option Vertex := do
  if !metadataValid (SerialBusinessTask.programHandlers program) task.metadata then none
  else return { id, scope, kind := .human, outputs := ← outputs.mapM (consumer? program) }

/-- The vertex of an effect wait without a BPMN Error route, the legacy operation's and its host's alike. -/
private def serviceVertex? (program : Program) (id scope : String) (origin : BpmnElementOrigin)
    (outputs : List ControlPlaceId) (effect : EffectDefinition) : Option Vertex := do
  if !(origin.elementId == effect.elementId && serviceValid (SerialBusinessTask.programHandlers program)
      effect.descriptor effect.inputMappings effect.outputMappings) then none
  else return { id, scope, kind := .service, outputs := ← outputs.mapM (consumer? program),
                reads := readNames effect.inputMappings, writes := effect.outputMappings.map (·.target) }

def operationVertex? (program : Program) (operation : SemanticOperation) : Option Vertex := do
  let id := operation.id.value
  let scope ← dataOperationScope? program operation
  let consumer := consumer? program
  match operation with
  | .initiate _ _ output => return { id, scope, kind := .start, outputs := [← consumer output] }
  | .reachNoneEnd .. => return { id, scope, kind := .finish, outputs := [] }
  -- Every checked Exclusive merge has at least two inputs (`CheckedProcessAdmission`), so a one-input merge is an
  -- Abstract or Manual Task (PTT-ADMIT-01); a merge of two or more is no serial vertex.
  | .mergeExclusive _ _ [_] output => return { id, scope, kind := .passThrough, outputs := [← consumer output] }
  | .awaitUserTask _ _ _ output task => humanVertex? program id scope [output] task
  | .awaitEffect _ origin _ output effect none => serviceVertex? program id scope origin [output] effect
  -- ACTH-ADMIT-01, ACSP-HOST-01: a host is the vertex of its work's legacy operation, its inputs being its several
  -- predecessors and every output's consumer a successor.
  | .activity host =>
      let outputs := host.outputs.map (·.place)
      match host.workAt (← host.inputs.head?) (← outputs.head?) with
      | .awaitUserTask _ _ _ _ task => humanVertex? program id scope outputs task
      | .awaitEffect _ origin _ _ effect none => serviceVertex? program id scope origin outputs effect
      | _ => none
  | .enterScope _ origin _ childEntry child =>
      return { id, scope, kind := .subProcess child.value (← consumer childEntry) origin.elementId.value,
               outputs := [← consumer (← childCompletion? program child)] }
  | .invokeProcess _ _ _ calledProcess calledScope calledEntry returnId (.variableMappings inputs outputs) =>
      match program.operations.filter (·.id == returnId) with
      | [.returnProcess _ _ _ returnedScope callerOutput returnedData] =>
          if returnedScope != calledScope || returnedData != .variableMappings inputs outputs then none
          else return { id, scope, outputs := [← consumer callerOutput],
                        kind := .call calledScope.value (← consumer calledEntry) calledProcess.value inputs outputs }
      | _ => none
  | _ => none

run_meta privateMatchEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`operationVertex?]

/-- The profile's Program envelope, which the re-entry account shares: the root scope, the Start operation and
the operations that become vertices. -/
def programEnvelope? (program : Program) : Option (DefinitionScopeId × OperationId × List SemanticOperation) := do
  if !(program.identity.sourceOverlay.isSome &&
      program.internalSchedulingMode == .rejectObservableChoice &&
      program.compensationActivityRetention.isNone && program.compensationEventSubProcessSnapshots.isNone &&
      program.compensationExecution.isNone && program.interruptingMessageEventSubProcesses.isEmpty &&
      scopeCountAdmitted program.identity.semanticProfile program.definitionScopes.length) then none
  else do
    let root ← StructuredComposition.unique? (program.definitionScopes.filter fun scope =>
      scope.parentScopeId.isNone && scope.originElementId.value == program.processId.value)
    let calledRoots := (program.definitionScopes.filter (·.parentScopeId.isNone)).length - 1
    let completions := program.operations.filter StructuredComposition.isScopeCompletion
    -- A Call's return is no vertex: it shares the Call's element identity and continues the caller,
    -- so the walk reaches the caller's successor from the invocation, as for a Sub-Process.
    let operations := program.operations.filter fun op =>
      !StructuredComposition.isScopeCompletion op && match op with | .returnProcess .. => false | _ => true
    let rootCompleted := completions.any fun op => match op with
      | .completeScope _ _ scopeId none => scopeId == root.id
      | _ => false
    -- NEF-ADMIT-01: the arrivals of one fan-in End share its origin and count once, only when all lie in the root
    -- graph; every other repeated origin still refuses, keeping one vertex per element.
    let arrivals := operations.filterMap fun op => match op with
      | .reachNoneEnd id origin _ => some (origin.elementId.value, id)
      | _ => none
    let arrivalsRooted := arrivals.all fun (origin, id) =>
      (arrivals.filter (·.1 == origin)).length == 1 ||
        (program.operationScopes.find? (·.operationId == id)).map (·.scopeId) == some root.id
    let identities := program.processId.value :: operations.filterMap (fun op =>
      match op with
      | .initiate _ origin _ | .awaitUserTask _ origin ..
      | .awaitEffect _ origin .. | .enterScope _ origin .. | .invokeProcess _ origin ..
      | .choose _ origin .. | .mergeExclusive _ origin .. => some origin.elementId.value
      | .activity host => some host.origin.elementId.value
      | _ => none) ++ (arrivals.map (·.1)).eraseDups ++ program.controlPlaces.map (·.origin.elementId.value)
    if !(rootCompleted && completions.length == program.definitionScopes.length - calledRoots &&
        arrivalsRooted && identities.eraseDups.length == identities.length) then none
    else do
      let start ← StructuredComposition.unique? (operations.filter fun op => match op with
        | .initiate .. => true
        | _ => false)
      some (root.id, start.id, operations)

run_meta privateMatchEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`programEnvelope?]

def programAnalysis (program : Program) : Option Analysis := do
  let (root, start, operations) ← programEnvelope? program
  let vertices ← operations.mapM (operationVertex? program)
  analyze vertices program.scopeLocalData program.definitionScopes root.value start.value
    (SerialBusinessTask.programHandlers program)

run_meta privateEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`programAnalysis]

/-- NSD-AVAILABLE-01 and the profile's Start domain: admitted names, each a `SingletonBusinessItem`,
covering every required name; a present null counts as present. CVM-START-01 restricts the names to
required and optional ones only in Programs with a Call, keeping every earlier admission unchanged. The
serial and re-entry accounts each supply their own analysis. -/
def startBindingsAdmittedBy (analysis : Option Analysis) (program : Program) (bindings : List VariableBinding) :
    Bool :=
  match analysis with
  | none => false
  | some analysis =>
      EffectData.bindingsValidWith (EffectMappingValuePolicy.singletonBusinessItem.admits true)
          (SerialBusinessTask.programHandlers program) bindings &&
        analysis.required.all (fun name => bindings.any (·.name == name)) &&
        analysis.optional.all (fun optional => bindings.all fun binding =>
          analysis.required.contains binding.name || optional.contains binding.name)

def startBindingsAdmitted (program : Program) (bindings : List VariableBinding) : Bool :=
  startBindingsAdmittedBy (programAnalysis program) program bindings

end NestedScopeData
end BpmnSemantics.SemanticProcess
