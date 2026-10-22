import BpmnSemantics.SemanticProcess.EffectDataAdmission
import BpmnSemantics.SemanticProcess.NestedScopeData

/-! # Nested scope-data profile admission

NSD-ADMIT-01 and NSD-AVAILABLE-01 for `nestedScopeDataProfileId`, per the
[nested scope data specification](../../docs/capsules/NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#stable-rules).
The checked graph and the IL are analyzed independently into one transient tree walk: each scope is
one serial path, and a Sub-Process vertex walks its child scope before its own successor. The walk
records every read and definite write with the declaring frames enclosing it, which is all the
availability scan needs; the walk is analysis evidence, never serialized executable authority.

Mapping grammar, name policy and literal bounds are `SerialBusinessTask`'s and `EffectData`'s.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace NestedScopeData

/-- Definition depth of the deepest admitted Sub-Process below the root. -/
def depthLimit : Nat := 3

/-- Input and output declarations admitted per Sub-Process. -/
def declarationLimit : Nat := 8

/-- User Tasks admitted on a called Process's serial path (CVM-ADMIT-01). -/
def calledTaskLimit : Nat := 3

inductive Kind where
  | start
  | human
  | service
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

/-- Walks one scope's serial path from `id`, returning its accesses and every visited vertex.
Recursion depth is bounded by `fuel`, which the caller sets above the vertex count. -/
def walk (vertices : List Vertex) (records : List ScopeLocalData) (scopes : List DefinitionScope) :
    Nat → Nat → List (List String) → String → String → Option (List Access × List String)
  | 0, _, _, _, _ => none
  | fuel + 1, depth, frames, scope, id => do
      let v ← StructuredComposition.unique? (vertices.filter (·.id == id))
      if v.scope != scope then none else
      match v.kind, v.outputs with
      | .finish, [] => some ([], [v.id])
      | .start, [next] | .human, [next] => do
          let (accesses, visited) ← walk vertices records scopes fuel depth frames scope next
          some (accesses, v.id :: visited)
      | .service, [next] => do
          let (accesses, visited) ← walk vertices records scopes fuel depth frames scope next
          some (v.reads.map (Access.read · frames) ++ v.writes.map (Access.write · frames) ++ accesses,
            v.id :: visited)
      | .subProcess child entry origin, [next] => do
          if depth ≥ depthLimit || !childScopeValid scopes scope child origin then none else do
          let inputs := ((recordOf records child).map (·.localInputs)).getD []
          let outputs := ((recordOf records child).map (·.localOutputs)).getD []
          let (inner, innerVisited) ←
            walk vertices records scopes fuel (depth + 1) (inputs.map (·.target) :: frames) child entry
          let (accesses, visited) ← walk vertices records scopes fuel depth frames scope next
          some ((readNames inputs).map (Access.read · frames) ++ inner ++
              outputs.map (fun mapping => Access.write mapping.target frames) ++ accesses,
            v.id :: innerVisited ++ visited)
      -- CVM-ADMIT-01 keeps the Call on the root path (depth 0): the internal-batch and cancellation
      -- proofs rest on Call callers being Process roots, and lifting that premise is PC-SCOPE-05's.
      -- The called instance has no parent scope, so its walk starts with no enclosing frame.
      | .call calledScope entry calledProcess inputs outputs, [next] => do
          if depth != 0 || !calledScopeValid scopes calledScope calledProcess then none else do
          let (_, innerVisited) ← walk vertices records scopes fuel depth [] calledScope entry
          if !calledPathValid vertices innerVisited then none else do
          let (accesses, visited) ← walk vertices records scopes fuel depth frames scope next
          some ((readNames inputs).map (Access.callInput · frames) ++
              outputs.map (fun mapping => Access.callOutput mapping.target frames) ++ accesses,
            v.id :: innerVisited ++ visited)
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

/-- Every vertex is visited exactly once from the root's entry, the scope list holds the root, one
child per Sub-Process and one called root per Call (at most one), and every record keys a
Sub-Process scope. -/
def analyze (vertices : List Vertex) (records : List ScopeLocalData) (scopes : List DefinitionScope)
    (root entry : String) (handlers : List String) : Option Analysis := do
  let children := vertices.filterMap fun v => match v.kind with
    | .subProcess child .. => some child
    | _ => none
  let calls := vertices.filterMap fun v => match v.kind with
    | .call calledScope _ _ inputs outputs => some (calledScope, inputs, outputs)
    | _ => none
  let roots := (scopes.filter (·.parentScopeId.isNone)).map (·.id.value)
  if !(scopes.length == children.length + calls.length + 1 && !children.isEmpty && calls.length ≤ 1 &&
      roots.length == calls.length + 1 && roots.contains root &&
      calls.all (fun (calledScope, inputs, outputs) =>
        calledScope != root && variableMappingsValid inputs outputs && callMappingsAdmitted handlers inputs outputs) &&
      strictlySortedStrings (records.map (·.scopeId.value)) &&
      records.all (fun record => children.contains record.scopeId.value && recordValid handlers record))
  then none
  else do
    let (accesses, visited) ← walk vertices records scopes (vertices.length + 1) 0 [] root entry
    if visited.length != vertices.length || visited.eraseDups.length != visited.length then none
    else some { accesses, required := (requiredReads accesses []).eraseDups,
                optional := if calls.isEmpty then none else some (optionalCallNames accesses []).eraseDups }

private theorem one_scope_guard (scopes : List DefinitionScope) (children : List String) (calls : Nat)
    (one : scopes.length = 1) :
    (scopes.length == children.length + calls + 1 && !children.isEmpty) = false := by
  cases children <;> simp [one]

theorem analyze_one_scope (vertices : List Vertex) (records : List ScopeLocalData)
    (scopes : List DefinitionScope) (root entry : String) (handlers : List String) (one : scopes.length = 1) :
    analyze vertices records scopes root entry handlers = none := by
  unfold analyze
  dsimp only
  rw [one_scope_guard scopes _ _ one]
  rfl

def metadataValid (handlers : List String) (metadata : Option UserTaskMetadata) : Bool :=
  metadata.all (·.form.isNone) && SerialBusinessTask.metadataValid handlers metadata

def serviceValid (handlers : List String) (descriptor : EffectDescriptor)
    (inputs outputs : List VariableMapping) : Bool :=
  SerialBusinessTask.descriptorValid descriptor && EffectData.mappingsValid handlers inputs outputs

/-- `CheckedGraphValidation` owns the general lookup but sits above the profile catalog; this one also
refuses a node with more than one owner. -/
private def checkedNodeScope? (source : CheckedProcess) (nodeId : NodeId) : Option DefinitionScopeId := do
  let owner ← StructuredComposition.unique? (source.nodeScopes.filter (·.nodeId == nodeId))
  return owner.scopeId

private def checkedStart? (source : CheckedProcess) (scope : DefinitionScopeId) : Option NodeId :=
  StructuredComposition.unique? (source.nodes.filterMap fun node => match node with
    | .noneStartEvent id => if checkedNodeScope? source id == some scope then some id else none
    | _ => none)

def checkedVertex? (source : CheckedProcess) (node : CheckedNode) : Option Vertex := do
  let id := node.id.value
  let scope ← checkedNodeScope? source node.id
  let outputs := (source.sequenceFlows.filter (·.sourceId == node.id)).map (·.targetId.value)
  let handlers := SerialBusinessTask.checkedHandlers source
  match node with
  | .noneStartEvent _ => return { id, scope := scope.value, kind := .start, outputs }
  | .noneEndEvent _ => return { id, scope := scope.value, kind := .finish, outputs }
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

def checkedAnalysis (source : CheckedProcess) : Option Analysis := do
  let identities := source.processId.value :: source.nodes.map (·.id.value) ++
    source.sequenceFlows.map (·.id.value)
  if !(source.identity.sourceOverlay.isSome && source.compensation.isNone &&
      source.transactionCancellation.isNone && source.interruptingMessageEventSubProcesses.isEmpty &&
      identities.eraseDups.length == identities.length && source.sequenceFlows.all (·.condition.isNone))
  then none
  else do
    let root ← StructuredComposition.unique? (source.definitionScopes.filter fun scope =>
      scope.parentScopeId.isNone && scope.originElementId.value == source.processId.value)
    let entry ← checkedStart? source root.id
    analyze (← source.nodes.mapM (checkedVertex? source)) source.scopeLocalData source.definitionScopes
      root.id.value entry.value (SerialBusinessTask.checkedHandlers source)

private def operationScope? (program : Program) (operation : SemanticOperation) : Option String := do
  let owner ← StructuredComposition.unique?
    (program.operationScopes.filter (·.operationId == operation.id))
  return owner.scopeId.value

private def childCompletion? (program : Program) (child : DefinitionScopeId) : Option ControlPlaceId :=
  match program.operations.filter (fun op => match op with
      | .completeScope _ _ scopeId _ => scopeId == child
      | _ => false) with
  | [.completeScope _ _ _ (some output)] => some output
  | _ => none

def operationInputs : SemanticOperation → List ControlPlaceId
  | .enterScope _ _ input .. | .invokeProcess _ _ input .. => [input]
  | operation => SerialBusinessTask.operationInputs operation

/-- The unique operation consuming `place`; scope completions consume no place. -/
def consumer? (program : Program) (place : ControlPlaceId) : Option String := do
  let consumer ← StructuredComposition.unique? (program.operations.filter fun op =>
    (operationInputs op).contains place)
  return consumer.id.value

def operationVertex? (program : Program) (operation : SemanticOperation) : Option Vertex := do
  let id := operation.id.value
  let scope ← operationScope? program operation
  let consumer := consumer? program
  let handlers := SerialBusinessTask.programHandlers program
  match operation with
  | .initiate _ _ output => return { id, scope, kind := .start, outputs := [← consumer output] }
  | .reachNoneEnd .. => return { id, scope, kind := .finish, outputs := [] }
  | .awaitUserTask _ _ _ output task =>
      if !metadataValid handlers task.metadata then none
      else return { id, scope, kind := .human, outputs := [← consumer output] }
  | .awaitEffect _ origin _ output effect none =>
      if !(origin.elementId == effect.elementId &&
          serviceValid handlers effect.descriptor effect.inputMappings effect.outputMappings) then none
      else return { id, scope, kind := .service, outputs := [← consumer output],
                    reads := readNames effect.inputMappings, writes := effect.outputMappings.map (·.target) }
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

def programAnalysis (program : Program) : Option Analysis := do
  if !(program.identity.sourceOverlay.isSome &&
      program.internalSchedulingMode == .rejectObservableChoice &&
      program.compensationActivityRetention.isNone && program.compensationEventSubProcessSnapshots.isNone &&
      program.compensationExecution.isNone && program.interruptingMessageEventSubProcesses.isEmpty) then none
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
    let identities := program.processId.value :: operations.filterMap (fun op =>
      match op with
      | .initiate _ origin _ | .reachNoneEnd _ origin _ | .awaitUserTask _ origin ..
      | .awaitEffect _ origin .. | .enterScope _ origin .. | .invokeProcess _ origin .. => some origin.elementId.value
      | _ => none) ++ program.controlPlaces.map (·.origin.elementId.value)
    if !(rootCompleted && completions.length == program.definitionScopes.length - calledRoots &&
        identities.eraseDups.length == identities.length) then none
    else do
      let start ← StructuredComposition.unique? (operations.filter fun op => match op with
        | .initiate .. => true
        | _ => false)
      analyze (← operations.mapM (operationVertex? program)) program.scopeLocalData
        program.definitionScopes root.id.value start.id.value (SerialBusinessTask.programHandlers program)

/-- A one-scope Program is never admitted: the profile requires at least one Sub-Process. -/
theorem programAnalysis_one_scope (program : Program) (one : program.definitionScopes.length = 1) :
    programAnalysis program = none := by
  unfold programAnalysis
  simp only [analyze_one_scope _ _ _ _ _ _ one]
  repeat' first | rfl | split | simp

/-- NSD-AVAILABLE-01 and the profile's Start domain: admitted names, each a `SingletonBusinessItem`,
covering every required name; a present null counts as present. CVM-START-01 restricts the names to
required and optional ones only in Programs with a Call, keeping every earlier admission unchanged. -/
def startBindingsAdmitted (program : Program) (bindings : List VariableBinding) : Bool :=
  match programAnalysis program with
  | none => false
  | some analysis =>
      EffectData.bindingsValidWith (EffectMappingValuePolicy.singletonBusinessItem.admits true)
          (SerialBusinessTask.programHandlers program) bindings &&
        analysis.required.all (fun name => bindings.any (·.name == name)) &&
        analysis.optional.all (fun optional => bindings.all fun binding =>
          analysis.required.contains binding.name || optional.contains binding.name)

end NestedScopeData
end BpmnSemantics.SemanticProcess
