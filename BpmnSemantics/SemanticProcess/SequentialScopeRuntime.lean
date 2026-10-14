import BpmnSemantics.SemanticProcess.ScopeCompletion
import BpmnSemantics.SemanticProcess.ScopeVariableData
import BpmnSemantics.SemanticProcess.MultiInstanceScopeWrite
import BpmnSemantics.SemanticProcess.CanonicalJsonStringCollection
import BpmnSemantics.SemanticProcess.SerialBusinessTaskAdmission
import BpmnSemantics.SemanticProcess.EffectCompletion
import BpmnSemantics.SemanticProcess.EffectDataMapping

/-! # Sequential repeated embedded scopes

SMIS-ENTER-01 and SMIS-END-01 separate outer token consumption from fresh body issuance.
Body-local initialization and disposal are atomic; the outer Activity retains the sole child reference.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Immutable entry facts projected from the paired IL declaration, never stored in the controller. -/
structure SequentialScopeEntry where
  id : OperationId
  elementId : NodeId
  input : ControlPlaceId
  childEntry : ControlPlaceId
  childScopeId : DefinitionScopeId
  normalOutput : ControlPlaceId
  collectionName : String
  itemName : String
  bodyInputs : List VariableMapping
  completionBooleanName : Option String
  deriving Repr, DecidableEq

def sequentialScopeEntry? : SemanticOperation → Option SequentialScopeEntry
  | .enterSequentialMultiInstanceScope id origin input childEntry childScopeId normalOutput collectionName itemName bodyInputs condition =>
      some ⟨id, origin.elementId, input, childEntry, childScopeId, normalOutput, collectionName, itemName, bodyInputs, condition⟩
  | _ => none

def sequentialScopeCollectionWithinLimits (items : List String) : Bool :=
  items.length ≤ 16 && items.all (fun item => decide (item.utf8ByteSize ≤ 512)) &&
    canonicalJsonStringCollectionUtf8Bytes items ≤ 8192

def sequentialScopeCollection? (entry : SequentialScopeEntry) (state : RuntimeState) : Option (List String) := do
  let [binding] := state.variables.process.bindings.filter (·.name == entry.collectionName) | none
  let .stringList items := binding.value | none
  if sequentialScopeCollectionWithinLimits items then some items else none

def sequentialScopeEntryEnabled (entry : SequentialScopeEntry) (state : RuntimeState)
    (parent : ScopeOccurrenceId) : Bool :=
  state.control == .running parent.processInstanceId &&
    decide ((state.tokens.filter fun token => token.placeId == entry.input && token.owner == parent).length = 1) &&
    state.scopeOccurrences.any (fun occurrence => occurrence.id == parent) &&
    !(state.activityOccurrences.any fun record => record.activityElementId == entry.elementId)

/-- The generated body's identity comes from the retained scope high-water mark, including on turnover. -/
def issueSequentialScope? (entry : SequentialScopeEntry) (state : RuntimeState)
    (parent : ScopeOccurrenceId) : Option (RuntimeState × ScopeOccurrenceId) := do
  let .running _ := state.control | none
  if state.scopeOccurrences.any (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) then none
  else
    let child : ScopeOccurrenceId :=
      { processInstanceId := parent.processInstanceId,
        definitionScopeId := entry.childScopeId, activation := scopeActivationCount state entry.childScopeId + 1 }
    some ({ state with
      tokens := addToken state.tokens entry.childEntry child,
      scopeOccurrences := insertScopeOccurrence { id := child, parent := some parent } state.scopeOccurrences,
      scopeActivations := setScopeActivationCount state.scopeActivations entry.childScopeId child.activation }, child)

def sequentialScopeActivityId (record : ActivityOccurrence) : ActivityOccurrenceId :=
  ⟨record.processInstanceId, ⟨record.activityElementId.value⟩, record.activation⟩

/-- SMIS-IDENTITY-01 joins current-body data and lifecycle to the same outer Activity. -/
structure SequentialScopeBinding where
  entry : SequentialScopeEntry
  activity : ActivityOccurrence
  controller : SequentialScopeController
  body : RuntimeScopeOccurrence
  locals : ScopeVariableScope
  deriving Repr, DecidableEq

def sequentialScopeBindingForEntry? (entry : SequentialScopeEntry) (state : RuntimeState) :
    Option SequentialScopeBinding := do
  let .running instanceId := state.control | none
  let [record] := state.activityOccurrences.filter (fun record => record.activityElementId == entry.elementId) | none
  let .childScope child := record.body | none
  if record.processInstanceId ≠ instanceId || record.owner.processInstanceId ≠ instanceId ||
      child.processInstanceId ≠ instanceId || child.definitionScopeId ≠ entry.childScopeId ||
      !record.attachedHandlers.isEmpty then none
  else
    let [body] := state.scopeOccurrences.filter (fun occurrence => occurrence.id == child) | none
    let [controller] := state.sequentialScopeControllers.filter (fun controller =>
      decide (controller.id = sequentialScopeActivityId record)) | none
    let locals ← selectScopeVariables? state.variables child
    if body.parent ≠ some record.owner ||
        !(state.scopeOccurrences.any fun occurrence => occurrence.id == record.owner) ||
        controller.total > 16 || controller.completed ≥ controller.total then none
    else some ⟨entry, record, controller, body, locals⟩

def sequentialScopeBindingForOwner? (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) : Option SequentialScopeBinding := do
  let [entry] := (program.operations.filterMap sequentialScopeEntry?).filter
    (fun entry => entry.childScopeId == owner.definitionScopeId) | none
  let binding ← sequentialScopeBindingForEntry? entry state
  if binding.body.id == owner then some binding else none

def hasSequentialScopeDefinition (program : Program) (owner : ScopeOccurrenceId) : Bool :=
  (program.operations.filterMap sequentialScopeEntry?).any (·.childScopeId == owner.definitionScopeId)

/-- Capsule-private execution never changes the command policy of another selected profile. -/
@[simp] def sequentialScopeProgramSelected (program : Program) : Bool :=
  program.identity.semanticProfile.value == "cibseven-2.2.0-sequential-multi-instance-subprocess-draft"

/-- Present null is local data; only absence falls through to the captured item and Process scope. -/
def readSequentialScopeVariable? (binding : SequentialScopeBinding) (state : RuntimeState)
    (name : String) : Option VariableValue := do
  match binding.locals.bindings.filter (·.name == name) with
  | [value] => if scopeVariableScalar value.value then some value.value else none
  | [] =>
      if name == binding.entry.itemName then some (.string binding.controller.currentItem)
      else
        let [value] := state.variables.process.bindings.filter (·.name == name) | none
        if scopeVariableScalar value.value then some value.value else none
  | _ => none

def sequentialScopeHandlerNames (program : Program) : List String :=
  program.operations.filterMap fun operation => match operation with
    | .awaitEffect _ _ _ _ effect _ => some effect.descriptor.operation
    | _ => none

/-- SMIS-DATA-01 snapshots only declared inputs through a unique live body binding. -/
def evaluateSequentialScopeInputs? (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (mappings : List VariableMapping) : Option (List VariableBinding) := do
  let binding ← sequentialScopeBindingForOwner? program state owner
  evaluateInputMappings? (fun name =>
    if (sequentialScopeHandlerNames program).contains name then none
    else readSequentialScopeVariable? binding state name) mappings

/-- SMIS-DATA-01 selects the input context before either direct execution or prepared arming; the
value domain of an enclosing read is the Program's effect-mapping policy (PBV-EFF-03). -/
def evaluateEffectInputs? (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (mappings : List VariableMapping) : Option (List VariableBinding) :=
  if sequentialScopeProgramSelected program && hasSequentialScopeDefinition program owner then
    evaluateSequentialScopeInputs? program state owner mappings
  else evaluateEnclosingInputMappingsUnder (programEffectMappingValuePolicy program)
    state.variables.process.bindings mappings

abbrev SequentialScopeWriteKind := MultiInstanceScopeWriteKind

/-- SMIS-DATA-01 joins the shared write policy to the unique current sequential body. -/
def writeSequentialScopeValues? (program : Program) (state : RuntimeState) (owner : ScopeOccurrenceId)
    (values : List VariableBinding) (kind : SequentialScopeWriteKind) : Option ScopedVariables := do
  let binding ← sequentialScopeBindingForOwner? program state owner
  writeBoundMultiInstanceScopeValues? state.variables owner binding.entry.collectionName binding.entry.itemName
    binding.entry.completionBooleanName (sequentialScopeHandlerNames program) values kind

/-- Explicit local-result projection precedes nearest-scope writes and exact effect-frame disposal. -/
def completeSequentialScopeEffectData? (program : Program) (state : RuntimeState) (owner : ScopeOccurrenceId)
    (effectId : EffectOccurrenceId) (outputs : List VariableMapping) (patch : List VariableBinding) :
    Option ScopedVariables := do
  let [_activity] := state.variables.activities.filter (activityScopeMatches effectId) | none
  let projected ← serialEffectPatch? (sequentialScopeHandlerNames program) outputs [] patch
  let variables ← writeSequentialScopeValues? program state owner
    (mergeProcessVariableBindings [] projected) .serviceTask
  some { variables with activities := variables.activities.filter fun scope => !activityScopeMatches effectId scope }

/-- SMIS-DATA-01 commits the selected body's successful result and continuation atomically. -/
def completeSequentialScopeEffect? (program : Program) (state : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult) : Option RuntimeState := do
  let [wait] := state.effectWaits.filter (effectIdNamesWait effectId) | none
  let .success patch := result | none
  if wait.processInstanceId != wait.owner.processInstanceId || wait.bpmnErrorRoute.isSome then none
  else
    let variables ← completeSequentialScopeEffectData? program state wait.owner effectId wait.outputMappings patch
    some { state with
      effectWaits := state.effectWaits.erase wait
      variables
      tokens := addToken state.tokens wait.output wait.owner }

def sequentialScopeTaskWaits (state : RuntimeState) (taskId : UserTaskInstanceId) : List UserTaskWait :=
  state.waits.filter (taskIdNamesWait taskId)

/-- SMIS-DATA-01 and SMIS-EARLY-01 bind human writes and continuation to one current body. -/
def completeSequentialScopeUserTask? (program : Program) (state : RuntimeState)
    (taskId : UserTaskInstanceId) (values : List VariableBinding) : Option RuntimeState := do
  let [wait] := sequentialScopeTaskWaits state taskId | none
  if wait.processInstanceId != wait.owner.processInstanceId then none
  else
    let variables ← writeSequentialScopeValues? program state wait.owner values .userTask
    some { state with
      waits := state.waits.erase wait
      variables
      tokens := addToken state.tokens wait.output wait.owner }

/-- Entry distinguishes a zero-item continuation from generating its first body. -/
inductive SequentialScopeEntryResult where
  | empty (owner : ScopeOccurrenceId) (state : RuntimeState)
  | first (owner : ScopeOccurrenceId) (state : RuntimeState)
  deriving Repr, DecidableEq

def SequentialScopeEntryResult.state : SequentialScopeEntryResult → RuntimeState
  | .empty _ state | .first _ state => state

/-- Completion retains the finished child identity across replacement or retirement. -/
inductive SequentialScopeCompletionResult where
  | next (owner : ScopeOccurrenceId) (state : RuntimeState)
  | terminal (owner : ScopeOccurrenceId) (state : RuntimeState)
  deriving Repr, DecidableEq

def SequentialScopeCompletionResult.state : SequentialScopeCompletionResult → RuntimeState
  | .next _ state | .terminal _ state => state

/-- SMIS-ENTER-01 consumes the parent once; failed initialization leaves the complete predecessor intact. -/
def enterSequentialScopeResult? (entry : SequentialScopeEntry) (state : RuntimeState)
    (parent : ScopeOccurrenceId) : Option SequentialScopeEntryResult := do
  if !sequentialScopeEntryEnabled entry state parent then none
  else
    let items ← sequentialScopeCollection? entry state
    match items with
    | [] => some (.empty parent { state with tokens := addToken (removeToken state.tokens entry.input parent) entry.normalOutput parent })
    | currentItem :: _ =>
      let (issued, child) ← issueSequentialScope? entry state parent
      let variables ← initializeScopeVariables? state.variables child entry.bodyInputs
      let taskId : TaskDefinitionId := ⟨entry.elementId.value⟩
      let record : ActivityOccurrence :=
        { processInstanceId := parent.processInstanceId,
          activityElementId := entry.elementId, activation := activityActivationCount state taskId + 1,
          owner := parent, body := .childScope child, attachedHandlers := [] }
      some (.first parent { issued with
        variables := variables
        tokens := removeToken issued.tokens entry.input parent,
        activityOccurrences := insertActivityOccurrence record state.activityOccurrences,
        activityActivations := setActivationCount state.activityActivations taskId record.activation,
        sequentialScopeControllers := state.sequentialScopeControllers ++
          [{ id := sequentialScopeActivityId record, total := items.length, completed := 0, currentItem }] })

def enterSequentialScopeState? (entry : SequentialScopeEntry) (state : RuntimeState)
    (parent : ScopeOccurrenceId) : Option RuntimeState :=
  (enterSequentialScopeResult? entry state parent).map SequentialScopeEntryResult.state

/-- Operation dispatch selects the parent from the offered input before evaluating entry. -/
def enterSequentialScope? (operation : SemanticOperation) (state : RuntimeState) : Option SequentialScopeEntryResult := do
  let entry ← sequentialScopeEntry? operation
  let parent ← onlyTokenOwner? state entry.input
  enterSequentialScopeResult? entry state parent

/-- SMIS-EARLY-01 reads only the selected Process Boolean after body quiescence. -/
def sequentialScopeCondition? (entry : SequentialScopeEntry) (state : RuntimeState) : Option Bool :=
  match entry.completionBooleanName with
  | none => some false
  | some name => match state.variables.process.bindings.filter (·.name == name) with
    | [{ value := .boolean value, .. }] => some value
    | _ => none

/-- The outer Activity owns the current child; no controller-local child identity is reconstructed. -/
def completeSequentialScopeResult? (entry : SequentialScopeEntry) (state : RuntimeState) : Option SequentialScopeCompletionResult := do
  let binding ← sequentialScopeBindingForEntry? entry state
  let record := binding.activity
  let child := binding.body.id
  let occurrence := binding.body
  let controller := binding.controller
  if !scopeQuiescent state child || (state.activityOccurrences.any fun candidate => candidate.owner == child) then none
  else
    let condition ← sequentialScopeCondition? entry state
    let variables ← removeScopeVariables? state.variables child
    let retired := { state with
      variables := variables
      scopeOccurrences := state.scopeOccurrences.filter (fun candidate => decide (candidate ≠ occurrence)) }
    let completed := controller.completed + 1
    if completed = controller.total || condition then
      some (.terminal child { retired with
        tokens := addToken retired.tokens entry.normalOutput record.owner,
        activityOccurrences := retired.activityOccurrences.filter (fun candidate => decide (candidate ≠ record)),
        sequentialScopeControllers := retired.sequentialScopeControllers.filter (fun candidate => decide (candidate ≠ controller)) })
    else
      let [binding] := state.variables.process.bindings.filter (·.name == entry.collectionName) | none
      let .stringList items := binding.value | none
      let currentItem ← items[completed]?
      let (issued, nextChild) ← issueSequentialScope? entry retired record.owner
      let variables ← initializeScopeVariables? retired.variables nextChild entry.bodyInputs
      some (.next child { issued with
        variables := variables
        activityOccurrences := issued.activityOccurrences.map (fun candidate =>
          if candidate = record then { record with body := .childScope nextChild } else candidate),
        sequentialScopeControllers := issued.sequentialScopeControllers.map (fun candidate =>
          if candidate = controller then { controller with completed, currentItem } else candidate) })

def completeSequentialScopeState? (entry : SequentialScopeEntry) (state : RuntimeState) : Option RuntimeState :=
  (completeSequentialScopeResult? entry state).map SequentialScopeCompletionResult.state

/-- Completion derives policy from its exact paired entry, never from an independently chosen continuation. -/
def completeSequentialScope? (program : Program) (operation : SemanticOperation) (state : RuntimeState) : Option SequentialScopeCompletionResult := do
  let .completeSequentialMultiInstanceScope _ origin entryId := operation | none
  let [operation] := program.operations.filter (fun candidate => candidate.id == entryId) | none
  let entry ← sequentialScopeEntry? operation
  if entry.elementId = origin.elementId then completeSequentialScopeResult? entry state else none

inductive SequentialScopeEntryStep (operation : SemanticOperation) (before : RuntimeState) : RuntimeState → Prop where
  | empty (owner : ScopeOccurrenceId) (after : RuntimeState)
      (selected : enterSequentialScope? operation before = some (.empty owner after)) :
      SequentialScopeEntryStep operation before after
  | first (owner : ScopeOccurrenceId) (after : RuntimeState)
      (selected : enterSequentialScope? operation before = some (.first owner after)) :
      SequentialScopeEntryStep operation before after

inductive SequentialScopeCompletionStep (program : Program) (operation : SemanticOperation)
    (before : RuntimeState) : RuntimeState → Prop where
  | next (owner : ScopeOccurrenceId) (after : RuntimeState)
      (selected : completeSequentialScope? program operation before = some (.next owner after)) :
      SequentialScopeCompletionStep program operation before after
  | terminal (owner : ScopeOccurrenceId) (after : RuntimeState)
      (selected : completeSequentialScope? program operation before = some (.terminal owner after)) :
      SequentialScopeCompletionStep program operation before after

theorem enterSequentialScope_sound (operation : SemanticOperation) (before after : RuntimeState)
    (result : (enterSequentialScope? operation before).map SequentialScopeEntryResult.state = some after) :
    SequentialScopeEntryStep operation before after := by
  obtain ⟨selected, selection, projected⟩ := Option.map_eq_some_iff.mp result
  cases selected with
  | empty owner state => cases projected; exact .empty owner state selection
  | first owner state => cases projected; exact .first owner state selection

theorem completeSequentialScope_sound (program : Program) (operation : SemanticOperation) (before after : RuntimeState)
    (result : (completeSequentialScope? program operation before).map SequentialScopeCompletionResult.state = some after) :
    SequentialScopeCompletionStep program operation before after := by
  obtain ⟨selected, selection, projected⟩ := Option.map_eq_some_iff.mp result
  cases selected with
  | next owner state => cases projected; exact .next owner state selection
  | terminal owner state => cases projected; exact .terminal owner state selection

end BpmnSemantics.SemanticProcess
