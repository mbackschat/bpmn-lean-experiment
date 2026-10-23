module

public import BpmnSemantics.SemanticProcess.StructuredCompositionAdmission
public import BpmnSemantics.SemanticProcess.Data
public import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants

/-! SBT-CHAIN-01 and SBT-AVAILABLE-01 independently analyze the checked graph and IL. The transient chain is analysis evidence, never serialized executable authority. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

abbrev serialBusinessTaskProfileId : ProfileId :=
  ⟨"cibseven-2.2.0-serial-business-tasks-draft"⟩

namespace SerialBusinessTask

def asciiLetter (c : Char) : Bool :=
  ('A' ≤ c && c ≤ 'Z') || ('a' ≤ c && c ≤ 'z')

def identifier (name : String) : Bool :=
  match name.toList with
  | [] => false
  | first :: rest =>
      (asciiLetter first || first == '_') &&
        rest.all (fun c => asciiLetter c || c == '_' || ('0' ≤ c && c ≤ '9')) &&
        !(["null", "true", "false", "empty", "div", "mod", "not", "and", "or",
          "le", "lt", "eq", "ne", "ge", "gt", "instanceof", "execution", "caseExecution",
          "task", "externalTask", "authenticatedUserId"].contains name)

def nameAllowed (handlers : List String) (name : String) : Bool :=
  identifier name && !handlers.contains name

/-- BPD-METADATA-01 composes passive legacy metadata with the existing writable-name policy. -/
def metadataValid (handlers : List String) : Option UserTaskMetadata → Bool
  | none => true
  | some metadata => UserTaskMetadata.assignmentFormWellFormed metadata &&
      match metadata.form with
      | some { fields := [{ key, type := .string }] } => nameAllowed handlers key
      | _ => false

def scalar : VariableValue → Bool
  | .string _ | .null => true
  | _ => false

def bindingsValid (handlers : List String) (bindings : List VariableBinding) : Bool :=
  strictlySortedStrings (bindings.map (·.name)) &&
    bindings.all (fun b => nameAllowed handlers b.name && scalar b.value)

def edgeWhitespace (c : Char) : Bool :=
  [9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197,
   8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279].contains c.toNat

/-- Whether `marker` is immediately followed by `{`. Structural over the characters, because
`String.splitOn` recurses well-foundedly over positions and the kernel cannot decide it, which left
every literal-input admission outside `decide +kernel`. -/
def opensExpression (marker : Char) : List Char → Bool
  | first :: second :: rest => (first == marker && second == '{') || opensExpression marker (second :: rest)
  | _ => false

/-- SBT source text excludes ECMAScript edge whitespace and `${`/`#{` expression openers while
preserving interior literal bytes. -/
def literalValid (value : String) : Bool :=
  !value.isEmpty && !(value.toList.head?.any edgeWhitespace) &&
    !(value.toList.getLast?.any edgeWhitespace) &&
    !opensExpression '$' value.toList && !opensExpression '#' value.toList

def mappingsValid (handlers : List String) (inputs outputs : List VariableMapping) : Bool :=
  strictlySortedStrings (inputs.map (·.target)) &&
    strictlySortedStrings (outputs.map (·.target)) &&
    inputs.all (fun m => nameAllowed handlers m.target && match m.expression with
      | .stringLiteral value => literalValid value
      | .enclosingVariable name => nameAllowed handlers name
      | .localVariable _ => false) &&
    outputs.all (fun m => nameAllowed handlers m.target && match m.expression with
      | .localVariable name => nameAllowed handlers name
      | _ => false)

def descriptorValid (descriptor : EffectDescriptor) : Bool :=
  descriptor.protocol == "urn:bpmn-lean:effect-protocol:activity-v1" &&
    descriptor.operation.length ≤ 1024 && identifier descriptor.operation

inductive Kind where
  | start | human | service | finish
  deriving Repr, DecidableEq

structure Vertex where
  id : String
  kind : Kind
  outputs : List String
  reads : List String := []
  writes : List String := []
  deriving Repr, DecidableEq

structure Analysis where
  ordered : List Vertex
  required : List String
  deriving Repr, DecidableEq

def requiredInputs : List Vertex → List String → List String
  | [], _ => []
  | v :: rest, produced =>
      v.reads.filter (fun name => !produced.contains name) ++
        requiredInputs rest (v.writes ++ produced)

def follow : Nat → List Vertex → String → Option (List Vertex)
  | 0, _, _ => none
  | fuel + 1, vertices, id => do
      let v ← StructuredComposition.unique? (vertices.filter (·.id == id))
      let rest := vertices.filter (·.id != id)
      match v.kind, v.outputs with
      | .finish, [] => if rest.isEmpty then some [v] else none
      | .start, [next] | .human, [next] | .service, [next] =>
          return v :: (← follow fuel rest next)
      | _, _ => none

def analyze (vertices : List Vertex) : Option Analysis := do
  if !((vertices.map (·.id)).eraseDups.length == vertices.length &&
      vertices.any (·.kind == .human) && vertices.any (·.kind == .service) &&
      (vertices.filter (·.kind == .finish)).length == 1 && vertices.all (fun v =>
        let incoming := vertices.flatMap (fun other => other.outputs.filter (· == v.id))
        match v.kind with
        | .start => incoming.isEmpty && v.outputs.length == 1
        | .finish => incoming.length == 1 && v.outputs.isEmpty
        | _ => incoming.length == 1 && v.outputs.length == 1)) then none
  else do
    let start ← StructuredComposition.unique? (vertices.filter (·.kind == .start))
    let ordered ← follow vertices.length vertices start.id
    return { ordered, required := (requiredInputs ordered []).eraseDups }

def readNames (inputs : List VariableMapping) : List String :=
  inputs.filterMap fun m => match m.expression with
    | .enclosingVariable name => some name
    | _ => none

def checkedHandlers (source : CheckedProcess) : List String :=
  source.nodes.filterMap fun node => match node with
    | .serviceTask _ descriptor .. => some descriptor.operation
    | _ => none

def programHandlers (program : Program) : List String :=
  program.operations.filterMap fun operation => match operation with
    | .awaitEffect _ _ _ _ effect _ => some effect.descriptor.operation
    | _ => none

def checkedVertex? (source : CheckedProcess) (node : CheckedNode) : Option Vertex := do
  let id := node.id.value
  let outputs := (source.sequenceFlows.filter (·.sourceId == node.id)).map (·.targetId.value)
  match node with
  | .noneStartEvent _ => return { id, kind := .start, outputs }
  | .noneEndEvent _ => return { id, kind := .finish, outputs }
  | .userTask _ _ metadata =>
      if !metadataValid (checkedHandlers source) metadata then none
      else return { id, kind := .human, outputs }
  | .serviceTask _ descriptor inputs mappings none =>
      if !(descriptorValid descriptor && mappingsValid (checkedHandlers source) inputs mappings) then none
      else return { id, kind := .service, outputs, reads := readNames inputs,
                    writes := mappings.map (·.target) }
  | _ => none

def operationInputs : SemanticOperation → List ControlPlaceId
  | .awaitUserTask _ _ input .. | .awaitEffect _ _ input ..
  | .reachNoneEnd _ _ input => [input]
  | _ => []

def consumer? (program : Program) (place : ControlPlaceId) : Option String := do
  let consumer ← StructuredComposition.unique? (program.operations.filter fun op =>
    (operationInputs op).contains place)
  return consumer.id.value

def operationVertex? (program : Program) (operation : SemanticOperation) : Option Vertex := do
  let id := operation.id.value
  match operation with
  | .initiate _ _ output => return { id, kind := .start, outputs := [← consumer? program output] }
  | .reachNoneEnd .. => return { id, kind := .finish, outputs := [] }
  | .awaitUserTask _ _ _ output task =>
      if !metadataValid (programHandlers program) task.metadata then none
      else return { id, kind := .human, outputs := [← consumer? program output] }
  | .awaitEffect _ origin _ output effect none =>
      if !(origin.elementId == effect.elementId && descriptorValid effect.descriptor &&
          mappingsValid (programHandlers program) effect.inputMappings effect.outputMappings) then none
      else return { id, kind := .service, outputs := [← consumer? program output],
                    reads := readNames effect.inputMappings, writes := effect.outputMappings.map (·.target) }
  | _ => none

def checkedAnalysis (source : CheckedProcess) : Option Analysis := do
  let identities := source.processId.value :: source.nodes.map (·.id.value) ++
    source.sequenceFlows.map (·.id.value)
  if !(source.identity.sourceOverlay.isSome && source.definitionScopes.length == 1 && source.compensation.isNone &&
      source.transactionCancellation.isNone && source.interruptingMessageEventSubProcesses.isEmpty &&
      identities.eraseDups.length == identities.length && source.sequenceFlows.all (·.condition.isNone)) then none
  else analyze (← source.nodes.mapM (checkedVertex? source))

def programAnalysis (program : Program) : Option Analysis := do
  if !(program.identity.sourceOverlay.isSome && program.definitionScopes.length == 1 &&
      program.internalSchedulingMode == .rejectObservableChoice &&
      program.compensationActivityRetention.isNone && program.compensationEventSubProcessSnapshots.isNone &&
      program.compensationExecution.isNone && program.interruptingMessageEventSubProcesses.isEmpty) then none
  else do
    let completion ← StructuredComposition.unique?
      (program.operations.filter StructuredComposition.isScopeCompletion)
    match completion with
    | .completeScope _ _ _ none =>
        let operations := program.operations.filter fun op => !StructuredComposition.isScopeCompletion op
        let identities := program.processId.value :: operations.filterMap (fun op =>
          match op with
          | .initiate _ origin _ | .reachNoneEnd _ origin _ | .awaitUserTask _ origin ..
          | .awaitEffect _ origin .. => some origin.elementId.value
          | _ => none) ++ program.controlPlaces.map (·.origin.elementId.value)
        if identities.eraseDups.length != identities.length then none
        else analyze (← operations.mapM (operationVertex? program))
    | _ => none

def startBindingsAdmitted (program : Program) (bindings : List VariableBinding) : Bool :=
  match programAnalysis program with
  | none => false
  | some analysis => bindingsValid (programHandlers program) bindings &&
      analysis.required.all (fun name => bindings.any (·.name == name))

end SerialBusinessTask
end BpmnSemantics.SemanticProcess
