module

public import BpmnSemantics.SemanticProcess.SerialBusinessTaskAdmission
public import BpmnSemantics.SemanticProcess.EffectMappingValuePolicy

/-! # Structured effect-data profile admission

Source shape, Program shape and Start admission for `portableEffectDataProfileId`, per the
[structured effect-data amendment](../../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#source-profile-and-port-contract).
The admitted graph is the serial business-task chain restricted to Service Tasks: a User Task makes
the model unsupported, and a String literal input is capped at 1,024 UTF-8 bytes so every value an
input can reference is already in the `SingletonBusinessItem` port domain.

The chain vertices, mapping grammar and name policy are `SerialBusinessTask`'s. Only the analysis
preamble differs, and it is restated here instead of parameterizing `SerialBusinessTask.analyze`
because three serial proof modules unfold that definition.
-/

public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace EffectData

open SerialBusinessTask

/-- UTF-8 byte ceiling of one String literal input, equal to the `SingletonBusinessItem` root String bound. -/
def literalByteLimit : Nat := 1024

def mappingsValid (handlers : List String) (inputs outputs : List VariableMapping) : Bool :=
  SerialBusinessTask.mappingsValid handlers inputs outputs &&
    inputs.all fun mapping => match mapping.expression with
      | .stringLiteral value => value.utf8ByteSize ≤ literalByteLimit
      | .enclosingVariable _ | .localVariable _ => true

/-- Names must be admitted identifiers outside the handler namespace in strictly increasing order; the
value test is the caller's, because Start and a result patch take different domains. -/
def bindingsValidWith (admits : VariableValue → Bool) (handlers : List String)
    (bindings : List VariableBinding) : Bool :=
  strictlySortedStrings (bindings.map (·.name)) &&
    bindings.all fun binding => nameAllowed handlers binding.name && admits binding.value

def bindingsValidUnder (policy : EffectMappingValuePolicy) (handlers : List String)
    (bindings : List VariableBinding) : Bool :=
  bindingsValidWith (policy.admits true) handlers bindings

theorem bindingsValidUnder_scalar (handlers : List String) (bindings : List VariableBinding) :
    bindingsValidUnder .scalar handlers bindings = SerialBusinessTask.bindingsValid handlers bindings := by
  unfold bindingsValidUnder bindingsValidWith SerialBusinessTask.bindingsValid
  congr 1
  apply congrArg
  funext binding
  cases binding.value <;> simp [EffectMappingValuePolicy.admits, SerialBusinessTask.scalar]

def checkedVertex? (source : CheckedProcess) (node : CheckedNode) : Option Vertex := do
  let id := node.id.value
  let outputs := (source.sequenceFlows.filter (·.sourceId == node.id)).map (·.targetId.value)
  match node with
  | .noneStartEvent _ => return { id, kind := .start, outputs }
  | .noneEndEvent _ => return { id, kind := .finish, outputs }
  | .serviceTask _ descriptor inputs mappings none =>
      if !(descriptorValid descriptor && mappingsValid (checkedHandlers source) inputs mappings) then none
      else return { id, kind := .service, outputs, reads := readNames inputs,
                    writes := mappings.map (·.target) }
  | _ => none

def operationVertex? (program : Program) (operation : SemanticOperation) : Option Vertex := do
  let id := operation.id.value
  match operation with
  | .initiate _ _ output => return { id, kind := .start, outputs := [← consumer? program output] }
  | .reachNoneEnd .. => return { id, kind := .finish, outputs := [] }
  | .awaitEffect _ origin _ output effect none =>
      if !(origin.elementId == effect.elementId && descriptorValid effect.descriptor &&
          mappingsValid (programHandlers program) effect.inputMappings effect.outputMappings) then none
      else return { id, kind := .service, outputs := [← consumer? program output],
                    reads := readNames effect.inputMappings, writes := effect.outputMappings.map (·.target) }
  | _ => none

/-- SBT-CHAIN-01 without Human vertices: the chain must hold at least one Service Task and no Human Task. -/
def analyzeServiceChain (vertices : List Vertex) : Option Analysis := do
  if !((vertices.map (·.id)).eraseDups.length == vertices.length &&
      !vertices.any (·.kind == .human) && vertices.any (·.kind == .service) &&
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

def checkedAnalysis (source : CheckedProcess) : Option Analysis := do
  let identities := source.processId.value :: source.nodes.map (·.id.value) ++
    source.sequenceFlows.map (·.id.value)
  if !(source.identity.sourceOverlay.isSome && source.definitionScopes.length == 1 && source.compensation.isNone &&
      source.transactionCancellation.isNone && source.interruptingMessageEventSubProcesses.isEmpty &&
      identities.eraseDups.length == identities.length && source.sequenceFlows.all (·.condition.isNone)) then none
  else analyzeServiceChain (← source.nodes.mapM (checkedVertex? source))

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
        else analyzeServiceChain (← operations.mapM (operationVertex? program))
    | _ => none

/-- Start takes String or Null only, bounded by the item policy, and every earlier-unwritten read. -/
def startBindingsAdmitted (program : Program) (bindings : List VariableBinding) : Bool :=
  match programAnalysis program with
  | none => false
  | some analysis =>
      bindingsValidWith (fun value => SerialBusinessTask.scalar value &&
        EffectMappingValuePolicy.singletonBusinessItem.admits true value) (programHandlers program) bindings &&
        analysis.required.all (fun name => bindings.any (·.name == name))

/-! PBV-EFF-01's 1,024-byte bound as laws over the bounding predicates; finite witnesses would have to
construct boundary-sized Strings in the kernel ([witness placement](../../docs/REVIEW-POLICY.md#lean-proof-design-and-review)). -/

private theorem mapM_none_of_mem {α β : Type} {f : α → Option β} {items : List α} {item : α}
    (member : item ∈ items) (refused : f item = none) : items.mapM f = none := by
  induction items with
  | nil => cases member
  | cons head tail ih =>
      cases member with
      | head => simp [refused]
      | tail _ inTail => cases f head <;> simp [ih inTail]

theorem mappingsValid_refuses_overlong_literal {handlers : List String}
    {inputs outputs : List VariableMapping} {mapping : VariableMapping} {value : String}
    (member : mapping ∈ inputs) (literal : mapping.expression = .stringLiteral value)
    (over : literalByteLimit < value.utf8ByteSize) : mappingsValid handlers inputs outputs = false := by
  have refused : (inputs.all fun mapping => match mapping.expression with
      | .stringLiteral value => value.utf8ByteSize ≤ literalByteLimit
      | .enclosingVariable _ | .localVariable _ => true) = false :=
    List.all_eq_false.mpr ⟨mapping, member, by simp [literal]; omega⟩
  simp [mappingsValid, refused]

/-- A Service Task holding an over-bound String literal input makes the whole source unsupported. -/
theorem checkedAnalysis_refuses_overlong_literal {source : CheckedProcess} {id : NodeId}
    {descriptor : EffectDescriptor} {inputs outputs : List VariableMapping} {mapping : VariableMapping}
    {value : String} (node : .serviceTask id descriptor inputs outputs none ∈ source.nodes)
    (member : mapping ∈ inputs) (literal : mapping.expression = .stringLiteral value)
    (over : literalByteLimit < value.utf8ByteSize) : checkedAnalysis source = none := by
  have vertex : checkedVertex? source (.serviceTask id descriptor inputs outputs none) = none := by
    simp [checkedVertex?, mappingsValid_refuses_overlong_literal member literal over]
  simp only [checkedAnalysis]
  split <;> simp [mapM_none_of_mem node vertex]

/-- A Start binding holding an over-bound String is refused whatever the Program. -/
theorem startBindingsAdmitted_refuses_overlong_string {program : Program}
    {bindings : List VariableBinding} {binding : VariableBinding} {value : String}
    (member : binding ∈ bindings) (string : binding.value = .string value)
    (over : literalByteLimit < value.utf8ByteSize) : startBindingsAdmitted program bindings = false := by
  unfold startBindingsAdmitted
  split
  · rfl
  · have refused := singletonBusinessItem_refuses_overlong_string true over
    have unsorted : (bindings.all fun binding => nameAllowed (programHandlers program) binding.name &&
        (SerialBusinessTask.scalar binding.value &&
          EffectMappingValuePolicy.singletonBusinessItem.admits true binding.value)) = false :=
      List.all_eq_false.mpr ⟨binding, member, by simp [string, refused]⟩
    simp [bindingsValidWith, unsorted]

def scenarioStartAdmitted (program : Program) (stimuli : List Stimulus) : Bool :=
  if program.identity.semanticProfile != portableEffectDataProfileId then true
  else match stimuli with
    | .startProcess _ _ instanceId bindings :: _ =>
        !instanceId.value.isEmpty && startBindingsAdmitted program bindings
    | _ => false

end EffectData
end BpmnSemantics.SemanticProcess
