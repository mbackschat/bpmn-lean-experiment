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

inductive Kind where
  | start
  | human
  | service
  /-- `entry` is the first vertex of the child scope and `origin` the Sub-Process element. -/
  | subProcess (child entry origin : String)
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

/-- A name access together with the names declared by the frames enclosing it, innermost first. -/
inductive Access where
  | read (name : String) (frames : List (List String))
  | write (name : String) (frames : List (List String))
  deriving Repr, DecidableEq

structure Analysis where
  accesses : List Access
  required : List String
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
      | _, _ => none

/-- NSD-AVAILABLE-01: a read is available when an enclosing frame declares it or an earlier definite
write landed at the Process; a write landing in a declaring frame adds nothing, since only readers
inside that frame, which see the declaration anyway, could resolve to it. -/
def requiredReads : List Access → List String → List String
  | [], _ => []
  | .read name frames :: rest, produced =>
      (if frames.any (·.contains name) || produced.contains name then [] else [name]) ++
        requiredReads rest produced
  | .write name frames :: rest, produced =>
      requiredReads rest (if frames.any (·.contains name) then produced else name :: produced)

/-- Every vertex is visited exactly once from the root's entry, the scope list holds the root and one
child per Sub-Process, and every record keys a Sub-Process scope. -/
def analyze (vertices : List Vertex) (records : List ScopeLocalData) (scopes : List DefinitionScope)
    (root entry : String) (handlers : List String) : Option Analysis := do
  let subProcesses := vertices.filter fun v => match v.kind with | .subProcess .. => true | _ => false
  let children := subProcesses.filterMap fun v => match v.kind with
    | .subProcess child .. => some child
    | _ => none
  if !(scopes.length == children.length + 1 && !children.isEmpty &&
      (scopes.filter (·.parentScopeId.isNone)).map (·.id.value) == [root] &&
      strictlySortedStrings (records.map (·.scopeId.value)) &&
      records.all (fun record => children.contains record.scopeId.value && recordValid handlers record))
  then none
  else do
    let (accesses, visited) ← walk vertices records scopes (vertices.length + 1) 0 [] root entry
    if visited.length != vertices.length || visited.eraseDups.length != visited.length then none
    else some { accesses, required := (requiredReads accesses []).eraseDups }

private theorem one_scope_guard (scopes : List DefinitionScope) (children : List String)
    (one : scopes.length = 1) : (scopes.length == children.length + 1 && !children.isEmpty) = false := by
  cases children <;> simp [one]

theorem analyze_one_scope (vertices : List Vertex) (records : List ScopeLocalData)
    (scopes : List DefinitionScope) (root entry : String) (handlers : List String) (one : scopes.length = 1) :
    analyze vertices records scopes root entry handlers = none := by
  unfold analyze
  dsimp only
  rw [one_scope_guard scopes _ one]
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
  | _ => none

def checkedAnalysis (source : CheckedProcess) : Option Analysis := do
  let identities := source.processId.value :: source.nodes.map (·.id.value) ++
    source.sequenceFlows.map (·.id.value)
  if !(source.identity.sourceOverlay.isSome && source.compensation.isNone &&
      source.transactionCancellation.isNone && source.interruptingMessageEventSubProcesses.isEmpty &&
      identities.eraseDups.length == identities.length && source.sequenceFlows.all (·.condition.isNone))
  then none
  else do
    let root ← StructuredComposition.unique? (source.definitionScopes.filter (·.parentScopeId.isNone))
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
  | .enterScope _ _ input .. => [input]
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
  | _ => none

def programAnalysis (program : Program) : Option Analysis := do
  if !(program.identity.sourceOverlay.isSome &&
      program.internalSchedulingMode == .rejectObservableChoice &&
      program.compensationActivityRetention.isNone && program.compensationEventSubProcessSnapshots.isNone &&
      program.compensationExecution.isNone && program.interruptingMessageEventSubProcesses.isEmpty) then none
  else do
    let root ← StructuredComposition.unique? (program.definitionScopes.filter (·.parentScopeId.isNone))
    let completions := program.operations.filter StructuredComposition.isScopeCompletion
    let operations := program.operations.filter fun op => !StructuredComposition.isScopeCompletion op
    let rootCompleted := completions.any fun op => match op with
      | .completeScope _ _ scopeId none => scopeId == root.id
      | _ => false
    let identities := program.processId.value :: operations.filterMap (fun op =>
      match op with
      | .initiate _ origin _ | .reachNoneEnd _ origin _ | .awaitUserTask _ origin ..
      | .awaitEffect _ origin .. | .enterScope _ origin .. => some origin.elementId.value
      | _ => none) ++ program.controlPlaces.map (·.origin.elementId.value)
    if !(rootCompleted && completions.length == program.definitionScopes.length &&
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
covering every required name; a present null counts as present. -/
def startBindingsAdmitted (program : Program) (bindings : List VariableBinding) : Bool :=
  match programAnalysis program with
  | none => false
  | some analysis =>
      EffectData.bindingsValidWith (EffectMappingValuePolicy.singletonBusinessItem.admits true)
          (SerialBusinessTask.programHandlers program) bindings &&
        analysis.required.all (fun name => bindings.any (·.name == name))

end NestedScopeData
end BpmnSemantics.SemanticProcess
