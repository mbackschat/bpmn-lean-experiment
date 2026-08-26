import BpmnSemantics.SemanticProcess.Data
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceController

/-! # Semantic Process runtime state

This module owns committed runtime data, scope-occurrence ownership, token operations, wait construction, and pure state transformations shared by the declarative and executable transition accounts.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive ProcessControl where
  | notStarted
  | running (instanceId : SemanticId)
  | completed (instanceId : SemanticId)
  | cancelled (instanceId : SemanticId)
  deriving Repr, DecidableEq

structure ScopeOccurrenceId where
  processInstanceId : SemanticId
  definitionScopeId : DefinitionScopeId
  activation : Nat
  deriving Repr, DecidableEq

structure RuntimeScopeOccurrence where
  id : ScopeOccurrenceId
  parent : Option ScopeOccurrenceId
  deriving Repr, DecidableEq

structure ControlToken where
  placeId : ControlPlaceId
  owner : ScopeOccurrenceId
  deriving Repr, DecidableEq

structure UserTaskWait where
  processInstanceId : SemanticId
  owner : ScopeOccurrenceId
  task : UserTaskDefinition
  activation : Nat
  output : ControlPlaceId
  metadata : Option UserTaskMetadata := none
  deriving Repr, DecidableEq

structure TimerWait where
  processInstanceId : SemanticId
  owner : ScopeOccurrenceId
  elementId : NodeId
  activation : Nat
  deadlineMs : Nat
  output : ControlPlaceId
  deriving Repr, DecidableEq

structure MessageWait where
  processInstanceId : SemanticId
  owner : ScopeOccurrenceId
  elementId : NodeId
  activation : Nat
  channel : MessageChannel
  output : ControlPlaceId
  deriving Repr, DecidableEq

structure EffectWait where
  processInstanceId : SemanticId
  owner : ScopeOccurrenceId
  elementId : NodeId
  activation : Nat
  descriptor : EffectDescriptor
  arguments : List VariableBinding
  outputMappings : List VariableMapping
  output : ControlPlaceId
  bpmnErrorRoute : Option BpmnErrorRoute
  incidentAlreadyRetried : Bool := false
  deriving Repr, DecidableEq

/-- Private incident state retains the complete suspended effect wait. -/
structure SemanticEffectIncident where
  id : EffectIncidentId
  wait : EffectWait
  deriving Repr, DecidableEq

structure TaskActivation where
  taskId : TaskDefinitionId
  count : Nat
  deriving Repr, DecidableEq

structure TimerActivation where
  elementId : NodeId
  count : Nat
  deriving Repr, DecidableEq

structure MessageActivation where
  elementId : NodeId
  count : Nat
  deriving Repr, DecidableEq

structure EffectActivation where
  elementId : NodeId
  count : Nat
  deriving Repr, DecidableEq

structure ScopeActivation where
  scopeId : DefinitionScopeId
  count : Nat
  deriving Repr, DecidableEq

structure EventRaceActivation where
  elementId : NodeId
  count : Nat
  deriving Repr, DecidableEq

structure CallActivation where
  elementId : NodeId
  count : Nat
  deriving Repr, DecidableEq

structure EventRace where
  id : OccurrenceId
  owner : ScopeOccurrenceId
  messageSubscriptionId : MessageSubscriptionId
  timerOccurrenceId : TimerOccurrenceId
  deriving Repr, DecidableEq

/-- Hidden ownership link from one caller occurrence to one distinct called Process root. -/
structure CalledProcessOccurrence where
  id : OccurrenceId
  caller : ScopeOccurrenceId
  calledProcessId : ProcessId
  calledRoot : ScopeOccurrenceId
  returnOperationId : OperationId
  deriving Repr, DecidableEq

/-- What one Activity occurrence's body currently is. A new arm, never a flag: the interrupting and
non-interrupting families stay distinct operation kinds and nothing here records which. -/
inductive ActivityBody where
  | userTask (task : OccurrenceId)
  | parallelUserTasks (first : OccurrenceId) (rest : List OccurrenceId)
  | childScope (scope : ScopeOccurrenceId)
  deriving Repr, DecidableEq

/-- What one Activity occurrence owns: its body, and the handler waits attached to it.

`owner` is the scope occurrence containing the Activity node, and every wait listed here shares it.
That is what makes a bounded Sub-Process deadline parent-owned by derivation rather than by the
mechanical argument that a child-owned deadline would leave the child permanently non-quiescent.

`attachedTimers` names Timer occurrences rather than a union of handler families, because Timer is the
only attached-handler family that produces a wait. What keeps a foreign identity out is the
well-formedness conjunct requiring each entry to resolve in `timerWaits`, not the field's type.

This carries no operation identity, and that is a deliberate divergence from the TypeScript record
rather than an omission. The semantic core reads the operation off the record to find its definition;
here the Activity element determines that operation uniquely under `programWellFormed`, so the field
would need threading through the arming relation and every theorem naming it for no consumer. The two
runtime representations are permitted to differ where the transition account and the canonical
observation contract do not. -/
structure ActivityOccurrence where
  processInstanceId : SemanticId
  activityElementId : NodeId
  activation : Nat
  owner : ScopeOccurrenceId
  body : ActivityBody
  attachedTimers : List OccurrenceId
  deriving Repr, DecidableEq

/-- The outer controller of one sequential Multi-Instance Activity occurrence.

Stores generators, not counters. Planned is the snapshot length, completed and the active loop counter
are the number of filled output slots, generated is one more, pending is the difference, and
terminated is zero in every stable state; storing any of them would install exactly the
second-disagreeing-fact defect the account above rejects for an Activity's active count. The
derivations and their law live with the family, in `SequentialMultiInstance`.

The identity is carried flat, in the three fields `ActivityOccurrence` carries it in. TypeScript nests
the same triple behind an `ActivityOccurrenceId` that exists there to stop a task identity from being
substituted for an Activity identity at compile time; Lean names no identity type for either side of
that pair, so the flat spelling keeps one carrier rather than introducing a second.

The active task identity is not here. It lives in the Activity occurrence record's body, which this
controller binds to by identity, so iteration turnover changes one fact in one place. -/
structure SequentialMultiInstanceController where
  processInstanceId : SemanticId
  activityElementId : NodeId
  activation : Nat
  snapshot : List String
  outputSlots : List String
  deriving Repr, DecidableEq

/-- Hidden inputs selected for one split activation and awaited by its paired join. -/
structure SelectedBranchSet where
  owner : ScopeOccurrenceId
  selectionKey : String
  expectedInputs : List ControlPlaceId
  deriving Repr, DecidableEq

/-! ## Runtime representation invariant

In an admitted reachable state, every token, wait, incident-owned suspended wait, selected-branch record, and event-race record is owned by one live `ScopeOccurrenceId` for the same semantic Process instance, and child occurrences form a parent-linked tree rooted at the Process occurrence. An effect occurrence appears in exactly one of `effectWaits` or `effectIncidents`; an incident retains the complete wait and exactly one matching Activity-local scope. User Task waits, User Task activation counters, selected-branch records, and event-race records use canonical identifier order so independent activation order is not retained as semantic state. Task, Message, Timer, effect, event-race, and scope activation counts are monotonic high-water marks: removing a wait or occurrence never makes an identity reusable. Interrupting profiles admit no incident-bearing state in this capsule. Normal scope completion may remove an occurrence only after its owned tokens, waits, incidents, selected-branch records, event-race records, and child occurrences are absent; a child then emits exactly one parent-owned continuation, while root completion clears the root occurrence.
-/

structure RuntimeState where
  control : ProcessControl
  initiationPending : Bool
  scopeOccurrences : List RuntimeScopeOccurrence
  tokens : List ControlToken
  waits : List UserTaskWait
  messageWaits : List MessageWait
  timerWaits : List TimerWait
  effectWaits : List EffectWait
  effectIncidents : List SemanticEffectIncident := []
  selectedBranchSets : List SelectedBranchSet
  eventRaces : List EventRace := []
  calledProcessOccurrences : List CalledProcessOccurrence := []
  activityOccurrences : List ActivityOccurrence := []
  /-- Absence and emptiness are one state here: the independently written core makes the same field
  optional only so continuation payloads under other profiles keep their byte shape, and no predicate
  or transition in either language distinguishes a missing collection from an empty one. -/
  sequentialMultiInstanceControllers : List SequentialMultiInstanceController := []
  parallelMultiInstanceControllers : List ParallelMultiInstanceController := []
  variables : ScopedVariables
  activations : List TaskActivation
  messageActivations : List MessageActivation
  timerActivations : List TimerActivation
  effectActivations : List EffectActivation
  scopeActivations : List ScopeActivation
  eventRaceActivations : List EventRaceActivation := []
  callActivations : List CallActivation := []
  activityActivations : List TaskActivation := []
  endOccurrences : Nat
  logicalTimeMs : Nat
  deriving Repr, DecidableEq

def initialState : RuntimeState :=
  { control := .notStarted
    initiationPending := false
    scopeOccurrences := []
    tokens := []
    waits := []
    messageWaits := []
    timerWaits := []
    effectWaits := []
    effectIncidents := []
    selectedBranchSets := []
    eventRaces := []
    calledProcessOccurrences := []
    activityOccurrences := []
    sequentialMultiInstanceControllers := []
    parallelMultiInstanceControllers := []
    variables := emptyScopedVariables
    activations := []
    messageActivations := []
    timerActivations := []
    effectActivations := []
    scopeActivations := []
    eventRaceActivations := []
    callActivations := []
    activityActivations := []
    endOccurrences := 0
    logicalTimeMs := 0 }

def runningStartState (instanceId : SemanticId)
    (initialVariables : List VariableBinding) : RuntimeState :=
  { initialState with
    control := .running instanceId
    initiationPending := true
    variables :=
      { emptyScopedVariables with
        process := { bindings := initialVariables } } }

def rootDefinitionScope? (program : Program) : Option DefinitionScope :=
  match program.definitionScopes.filter fun scope =>
      scope.parentScopeId.isNone &&
        scope.originElementId.value = program.processId.value with
  | [scope] => some scope
  | _ => none

def runningProgramStartState? (program : Program) (instanceId : SemanticId)
    (initialVariables : List VariableBinding) : Option RuntimeState := do
  let root ← rootDefinitionScope? program
  let owner : ScopeOccurrenceId :=
    { processInstanceId := instanceId
      definitionScopeId := root.id
      activation := 1 }
  pure
    { runningStartState instanceId initialVariables with
      scopeOccurrences := [{ id := owner, parent := none }]
      scopeActivations := [{ scopeId := root.id, count := 1 }] }

def tokenMultiplicity (state : RuntimeState) (place : ControlPlaceId) : Nat :=
  (state.tokens.filter fun token => decide (token.placeId = place)).length

def hasToken (state : RuntimeState) (place : ControlPlaceId) : Bool :=
  tokenMultiplicity state place > 0

def perIncomingJoinReady (state : RuntimeState)
    (inputs : List ControlPlaceId) : Bool :=
  inputs.all (hasToken state)

/-- Counts total multiplicity across the inputs, so it admits a join whose tokens are stacked on fewer places than `perIncomingJoinReady` requires. The two disagree exactly on that unbalanced case. -/
def countBasedJoinReady (state : RuntimeState)
    (inputs : List ControlPlaceId) : Bool :=
  inputs.foldl (fun count input => count + tokenMultiplicity state input) 0 ≥
    inputs.length

def tokenOwners (state : RuntimeState) (place : ControlPlaceId) :
    List ScopeOccurrenceId :=
  (state.tokens.filter fun token => decide (token.placeId = place)).map (·.owner)

def onlyTokenOwner? (state : RuntimeState) (place : ControlPlaceId) :
    Option ScopeOccurrenceId :=
  match tokenOwners state place with
  | [] => none
  | owner :: rest =>
      if rest.all fun candidate => decide (candidate = owner) then some owner
      else none

def removeToken : List ControlToken → ControlPlaceId → ScopeOccurrenceId →
    List ControlToken
  | [], _, _ => []
  | token :: rest, place, owner =>
      if token.placeId = place && token.owner = owner then rest
      else token :: removeToken rest place owner

theorem removeToken_commutes (tokens : List ControlToken)
    (leftPlace rightPlace : ControlPlaceId)
    (leftOwner rightOwner : ScopeOccurrenceId) :
    removeToken (removeToken tokens leftPlace leftOwner) rightPlace rightOwner =
      removeToken (removeToken tokens rightPlace rightOwner) leftPlace leftOwner := by
  induction tokens with
  | nil => rfl
  | cons token rest ih =>
      by_cases left : token.placeId = leftPlace ∧ token.owner = leftOwner
      · by_cases right : token.placeId = rightPlace ∧ token.owner = rightOwner
        · have samePlace : leftPlace = rightPlace := left.1.symm.trans right.1
          have sameOwner : leftOwner = rightOwner := left.2.symm.trans right.2
          subst rightPlace
          subst rightOwner
          simp [removeToken, left]
        · have different : ¬(leftPlace = rightPlace ∧ leftOwner = rightOwner) := by
            intro same
            apply right
            exact ⟨left.1.trans same.1, left.2.trans same.2⟩
          simp [removeToken, left, different]
      · by_cases right : token.placeId = rightPlace ∧ token.owner = rightOwner
        · have different : ¬(rightPlace = leftPlace ∧ rightOwner = leftOwner) := by
            intro same
            apply left
            exact ⟨right.1.trans same.1, right.2.trans same.2⟩
          simp [removeToken, right, different]
        · simp [removeToken, left, right, ih]

def addToken (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) : List ControlToken :=
  { placeId := place, owner } :: tokens

def rootScopeOccurrence? (state : RuntimeState) : Option ScopeOccurrenceId :=
  match state.scopeOccurrences.filter (·.parent.isNone) with
  | [occurrence] => some occurrence.id
  | _ => none

def initiateState? (state : RuntimeState) (output : ControlPlaceId) :
    Option RuntimeState := do
  let owner ← rootScopeOccurrence? state
  if state.initiationPending then
    some
      { state with
        initiationPending := false
        tokens := addToken state.tokens output owner }
  else none

def removeTokens (tokens : List ControlToken) (places : List ControlPlaceId)
    (owner : ScopeOccurrenceId) : List ControlToken :=
  places.foldl (fun current place => removeToken current place owner) tokens

def addTokens (tokens : List ControlToken) (places : List ControlPlaceId)
    (owner : ScopeOccurrenceId) : List ControlToken :=
  places.foldr (fun place current => addToken current place owner) tokens

def taskActivationCount : List TaskActivation → TaskDefinitionId → Nat
  | [], _ => 0
  | activation :: rest, taskId =>
      if activation.taskId = taskId then activation.count else taskActivationCount rest taskId

def activationCount (state : RuntimeState) (taskId : TaskDefinitionId) : Nat :=
  taskActivationCount state.activations taskId

/-- The Activity-element activation high-water mark, or zero when the element is absent.

Separate from `activationCount` even though both are keyed by the same identifier, because they count
different things: how many times an Activity was activated, against how many occurrences its body has
produced. They agree under every registered profile and nothing reads the agreement. -/
def activityActivationCount (state : RuntimeState) (taskId : TaskDefinitionId) :
    Nat :=
  taskActivationCount state.activityActivations taskId

/-- Canonical insertion for the task activation family, ordered by element identifier.

Public for the same reason `insertUserTaskWait` and `insertActivityOccurrence` are: a law about the
order this preserves has to speak about the term the counter update actually inserts with. -/
def insertTaskActivation (activation : TaskActivation) :
    List TaskActivation → List TaskActivation
  | [] => [activation]
  | current :: rest =>
      if activation.taskId.value < current.taskId.value then
        activation :: current :: rest
      else current :: insertTaskActivation activation rest

def setActivationCount (activations : List TaskActivation)
    (taskId : TaskDefinitionId) (count : Nat) : List TaskActivation :=
  insertTaskActivation { taskId, count }
    (activations.filter fun activation => decide (activation.taskId ≠ taskId))

def userTaskWaitBefore (left right : UserTaskWait) : Bool :=
  if left.processInstanceId.value ≠ right.processInstanceId.value then
    left.processInstanceId.value < right.processInstanceId.value
  else if left.owner.definitionScopeId.value ≠
      right.owner.definitionScopeId.value then
    left.owner.definitionScopeId.value < right.owner.definitionScopeId.value
  else if left.owner.activation ≠ right.owner.activation then
    left.owner.activation < right.owner.activation
  else if left.task.id.value ≠ right.task.id.value then
    left.task.id.value < right.task.id.value
  else left.activation < right.activation

def canonicalInsertBy (before : α → α → Bool) (value : α) : List α → List α
  | [] => [value]
  | current :: rest =>
      if before value current then value :: current :: rest
      else current :: canonicalInsertBy before value rest

def insertUserTaskWait (wait : UserTaskWait) : List UserTaskWait → List UserTaskWait
  | [] => [wait]
  | current :: rest =>
      if userTaskWaitBefore wait current then wait :: current :: rest
      else current :: insertUserTaskWait wait rest

def scopeOwnerBefore (left right : ScopeOccurrenceId) : Bool :=
  if left.processInstanceId.value ≠ right.processInstanceId.value then
    left.processInstanceId.value < right.processInstanceId.value
  else if left.definitionScopeId.value ≠ right.definitionScopeId.value then
    left.definitionScopeId.value < right.definitionScopeId.value
  else
    left.activation < right.activation

def waitOccurrenceBefore (leftInstance rightInstance : SemanticId)
    (leftOwner rightOwner : ScopeOccurrenceId) (leftElement rightElement : NodeId)
    (leftActivation rightActivation : Nat) : Bool :=
  if leftInstance.value ≠ rightInstance.value then
    leftInstance.value < rightInstance.value
  else if leftOwner ≠ rightOwner then
    scopeOwnerBefore leftOwner rightOwner
  else if leftElement.value ≠ rightElement.value then
    leftElement.value < rightElement.value
  else
    leftActivation < rightActivation

def messageWaitBefore (left right : MessageWait) : Bool :=
  waitOccurrenceBefore left.processInstanceId right.processInstanceId
    left.owner right.owner left.elementId right.elementId left.activation right.activation

def timerWaitBefore (left right : TimerWait) : Bool :=
  waitOccurrenceBefore left.processInstanceId right.processInstanceId
    left.owner right.owner left.elementId right.elementId left.activation right.activation

def effectWaitBefore (left right : EffectWait) : Bool :=
  waitOccurrenceBefore left.processInstanceId right.processInstanceId
    left.owner right.owner left.elementId right.elementId left.activation right.activation

def insertMessageWait (wait : MessageWait) (waits : List MessageWait) :
  List MessageWait :=
  canonicalInsertBy messageWaitBefore wait waits

def insertTimerWait (wait : TimerWait) (waits : List TimerWait) : List TimerWait :=
  canonicalInsertBy timerWaitBefore wait waits

def insertEffectWait (wait : EffectWait) (waits : List EffectWait) : List EffectWait :=
  canonicalInsertBy effectWaitBefore wait waits

private theorem canonicalInsertBy_length (before : α → α → Bool) (value : α)
    (values : List α) :
    (canonicalInsertBy before value values).length = values.length + 1 := by
  induction values with
  | nil => rfl
  | cons current rest ih =>
      simp only [canonicalInsertBy]
      split <;> simp_all

theorem insertMessageWait_length (wait : MessageWait) (waits : List MessageWait) :
    (insertMessageWait wait waits).length = waits.length + 1 :=
  canonicalInsertBy_length messageWaitBefore wait waits

theorem insertTimerWait_length (wait : TimerWait) (waits : List TimerWait) :
    (insertTimerWait wait waits).length = waits.length + 1 :=
  canonicalInsertBy_length timerWaitBefore wait waits

theorem insertEffectWait_length (wait : EffectWait) (waits : List EffectWait) :
    (insertEffectWait wait waits).length = waits.length + 1 :=
  canonicalInsertBy_length effectWaitBefore wait waits

/-- Canonical order for the task activation family: by element identifier.

Beside its two siblings because `canonicalCollectionOrder` and the preservation laws must read one
spelling of this order; an inlined lambda in the conjunct and a named comparator in the laws would be
two canonical orders that happen to agree. -/
def activationBefore (left right : TaskActivation) : Bool :=
  decide (left.taskId.value < right.taskId.value)

def messageActivationBefore (left right : MessageActivation) : Bool :=
  decide (left.elementId.value < right.elementId.value)

def timerActivationBefore (left right : TimerActivation) : Bool :=
  decide (left.elementId.value < right.elementId.value)

def effectActivationBefore (left right : EffectActivation) : Bool :=
  decide (left.elementId.value < right.elementId.value)

def setMessageActivationCount (activations : List MessageActivation)
    (elementId : NodeId) (count : Nat) : List MessageActivation :=
  canonicalInsertBy messageActivationBefore { elementId, count }
    (activations.filter fun activation => decide (activation.elementId ≠ elementId))

def setTimerActivationCount (activations : List TimerActivation)
    (elementId : NodeId) (count : Nat) : List TimerActivation :=
  canonicalInsertBy timerActivationBefore { elementId, count }
    (activations.filter fun activation => decide (activation.elementId ≠ elementId))

def setEffectActivationCount (activations : List EffectActivation)
    (elementId : NodeId) (count : Nat) : List EffectActivation :=
  canonicalInsertBy effectActivationBefore { elementId, count }
    (activations.filter fun activation => decide (activation.elementId ≠ elementId))

/-- Canonical order: Process instance, then Activity element, then activation. -/
def activityOccurrenceBefore (left right : ActivityOccurrence) : Bool :=
  if left.processInstanceId.value ≠ right.processInstanceId.value then
    left.processInstanceId.value < right.processInstanceId.value
  else if left.activityElementId.value ≠ right.activityElementId.value then
    left.activityElementId.value < right.activityElementId.value
  else
    left.activation < right.activation

/-- Canonical insertion, so an arming transition preserves `RSI-ORDER-01` rather than prepending.

An ordered insert rather than a sort of the whole list: the invariant already holds of the list being
inserted into, so sorting would re-derive what is given, and the kernel reduces this to the singleton
arm at the one-record cardinality every current profile admits.
-/
def insertActivityOccurrence (record : ActivityOccurrence) :
    List ActivityOccurrence → List ActivityOccurrence
  | [] => [record]
  | current :: rest =>
      if activityOccurrenceBefore record current then
        record :: current :: rest
      else current :: insertActivityOccurrence record rest

/-- Canonical insertion adds exactly one record, whichever position the order selects. -/
theorem insertActivityOccurrence_length (record : ActivityOccurrence)
    (records : List ActivityOccurrence) :
    (insertActivityOccurrence record records).length = records.length + 1 := by
  induction records with
  | nil => rfl
  | cons current rest ih =>
      by_cases before : activityOccurrenceBefore record current
      · simp [insertActivityOccurrence, before]
      · simp [insertActivityOccurrence, before, ih]

def elementActivationCount (activations : List (NodeId × Nat))
    (elementId : NodeId) : Nat :=
  (activations.find? fun activation => decide (activation.1 = elementId))
    |>.map (·.2) |>.getD 0

/-- The monotonic activation ordinal already reached by this Timer element. Shared with the bounded-scope family, whose deadline must be numbered from the same counter so the pair keeps one ordinal. -/
def timerActivationCount (state : RuntimeState) (elementId : NodeId) :
    Nat :=
  elementActivationCount (state.timerActivations.map fun value =>
    (value.elementId, value.count)) elementId

private def scopeActivationCount (state : RuntimeState)
    (scopeId : DefinitionScopeId) : Nat :=
  (state.scopeActivations.find? fun activation =>
    decide (activation.scopeId = scopeId)).map (·.count) |>.getD 0

def callActivationCount (state : RuntimeState) (elementId : NodeId) : Nat :=
  elementActivationCount (state.callActivations.map fun value =>
    (value.elementId, value.count)) elementId

def setCallActivationCount (state : RuntimeState) (elementId : NodeId)
    (count : Nat) : List CallActivation :=
  { elementId, count } :: state.callActivations.filter fun value =>
    decide (value.elementId ≠ elementId)

def duplicateToken (state : RuntimeState) (owner : ScopeOccurrenceId)
    (input : ControlPlaceId) (outputs : List ControlPlaceId) : RuntimeState :=
  { state with
    tokens := addTokens (removeToken state.tokens input owner) outputs owner }

def synchronizeTokens (state : RuntimeState) (owner : ScopeOccurrenceId)
    (inputs : List ControlPlaceId) (output : ControlPlaceId) : RuntimeState :=
  { state with
    tokens := addToken (removeTokens state.tokens inputs owner) output owner }

def chooseToken (state : RuntimeState) (owner : ScopeOccurrenceId)
    (input output : ControlPlaceId) : RuntimeState :=
  { state with
    tokens := addToken (removeToken state.tokens input owner) output owner }

def reachNoneEndToken (state : RuntimeState) (owner : ScopeOccurrenceId)
    (input : ControlPlaceId) : RuntimeState :=
  { state with
    tokens := removeToken state.tokens input owner
    endOccurrences := state.endOccurrences + 1 }

def commonTokenOwner? (state : RuntimeState) (inputs : List ControlPlaceId) :
    Option ScopeOccurrenceId :=
  match inputs with
  | [] => none
  | first :: rest => do
      let owner ← onlyTokenOwner? state first
      if rest.all fun input => onlyTokenOwner? state input == some owner then
        some owner
      else none

def enterScopeState? (state : RuntimeState) (input childEntry : ControlPlaceId)
    (childScopeId : DefinitionScopeId) : Option RuntimeState := do
  let parent ← onlyTokenOwner? state input
  let instanceId ← match state.control with
    | .running instanceId => some instanceId
    | _ => none
  if parent.processInstanceId ≠ instanceId ||
      state.scopeOccurrences.any fun occurrence =>
        occurrence.id.definitionScopeId == childScopeId then none
  else
    let activation := scopeActivationCount state childScopeId + 1
    let child : ScopeOccurrenceId :=
      { processInstanceId := instanceId
        definitionScopeId := childScopeId
        activation }
    some
      { state with
        tokens := addToken (removeToken state.tokens input parent) childEntry child
        scopeOccurrences := { id := child, parent := some parent } ::
          state.scopeOccurrences
        scopeActivations := { scopeId := childScopeId, count := activation } ::
          state.scopeActivations.filter fun value =>
            decide (value.scopeId ≠ childScopeId) }

end BpmnSemantics.SemanticProcess
