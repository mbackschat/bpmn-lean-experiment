import BpmnSemantics.SemanticProcess.Data

/-! # Semantic Process runtime state

This module owns committed runtime data, scope-occurrence ownership, token operations, wait construction, and pure state transformations shared by the declarative and executable transition accounts.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive ProcessControl where
  | notStarted
  | running (instanceId : SemanticId)
  | completed (instanceId : SemanticId)
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

/-! ## Runtime representation invariant

In an admitted reachable state, every token and wait is owned by one live `ScopeOccurrenceId` for the same semantic Process instance, and child occurrences form a parent-linked tree rooted at the Process occurrence. Task, Message, Timer, effect, and scope activation counts are monotonic high-water marks: removing a wait or occurrence never makes an identity reusable. Interrupting a scope removes the selected occurrence subtree together with every owned token and wait and the Activity-local scopes paired with its effects, while retaining all activation counters and End history. Normal scope completion may remove an occurrence only after its owned tokens, waits, and child occurrences are absent; a child then emits exactly one parent-owned continuation, while root completion clears the root occurrence.
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
  variables : ScopedVariables
  activations : List TaskActivation
  messageActivations : List MessageActivation
  timerActivations : List TimerActivation
  effectActivations : List EffectActivation
  scopeActivations : List ScopeActivation
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
    variables := emptyScopedVariables
    activations := []
    messageActivations := []
    timerActivations := []
    effectActivations := []
    scopeActivations := []
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
  match program.definitionScopes.filter (·.parentScopeId.isNone) with
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

private def activationCount (state : RuntimeState) (taskId : TaskDefinitionId) :
    Nat :=
  (state.activations.find? fun activation =>
    decide (activation.taskId = taskId)).map (·.count) |>.getD 0

private def setActivationCount (activations : List TaskActivation)
    (taskId : TaskDefinitionId) (count : Nat) : List TaskActivation :=
  { taskId, count } ::
    activations.filter fun activation => decide (activation.taskId ≠ taskId)

private def elementActivationCount (activations : List (NodeId × Nat))
    (elementId : NodeId) : Nat :=
  (activations.find? fun activation => decide (activation.1 = elementId))
    |>.map (·.2) |>.getD 0

private def timerActivationCount (state : RuntimeState) (elementId : NodeId) :
    Nat :=
  elementActivationCount (state.timerActivations.map fun value =>
    (value.elementId, value.count)) elementId

private def messageActivationCount (state : RuntimeState)
    (elementId : NodeId) : Nat :=
  elementActivationCount (state.messageActivations.map fun value =>
    (value.elementId, value.count)) elementId

private def effectActivationCount (state : RuntimeState) (elementId : NodeId) :
    Nat :=
  elementActivationCount (state.effectActivations.map fun value =>
    (value.elementId, value.count)) elementId

private def scopeActivationCount (state : RuntimeState)
    (scopeId : DefinitionScopeId) : Nat :=
  (state.scopeActivations.find? fun activation =>
    decide (activation.scopeId = scopeId)).map (·.count) |>.getD 0

def activateUserTask (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId)
    (task : UserTaskDefinition) : RuntimeState :=
  let activation := activationCount state task.id + 1
  { state with
    tokens := removeToken state.tokens input owner
    waits :=
      { processInstanceId := instanceId
        owner
        task
        activation
        output } :: state.waits
    activations :=
      { taskId := task.id, count := activation } ::
        state.activations.filter fun value => decide (value.taskId ≠ task.id) }

def activateTimer (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId)
    (timer : TimerDefinition) : RuntimeState :=
  let activation := timerActivationCount state timer.elementId + 1
  { state with
    tokens := removeToken state.tokens input owner
    timerWaits :=
      { processInstanceId := instanceId
        owner
        elementId := timer.elementId
        activation
        deadlineMs := state.logicalTimeMs + timer.durationMs
        output } :: state.timerWaits
    timerActivations :=
      { elementId := timer.elementId, count := activation } ::
        state.timerActivations.filter fun value =>
          decide (value.elementId ≠ timer.elementId) }

def activateMessage (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId)
    (message : MessageDefinition) : RuntimeState :=
  let activation := messageActivationCount state message.elementId + 1
  { state with
    tokens := removeToken state.tokens input owner
    messageWaits :=
      { processInstanceId := instanceId
        owner
        elementId := message.elementId
        activation
        channel := message.channel
        output } :: state.messageWaits
    messageActivations :=
      { elementId := message.elementId, count := activation } ::
        state.messageActivations.filter fun value =>
          decide (value.elementId ≠ message.elementId) }

def activateEffect (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId)
    (effect : EffectDefinition) (bpmnErrorRoute : Option BpmnErrorRoute) :
    RuntimeState :=
  let activation := effectActivationCount state effect.elementId + 1
  let arguments := (evaluateInputMappings effect.inputMappings).getD []
  let effectOwner : EffectOccurrenceId :=
    { processInstanceId := instanceId
      elementId := ⟨effect.elementId.value⟩
      activation }
  { state with
    tokens := removeToken state.tokens input owner
    effectWaits :=
      { processInstanceId := instanceId
        owner
        elementId := effect.elementId
        activation
        descriptor := effect.descriptor
        arguments
        outputMappings := effect.outputMappings
        output
        bpmnErrorRoute } :: state.effectWaits
    variables := addActivityVariableScope state.variables effectOwner arguments
    effectActivations :=
      { elementId := effect.elementId, count := activation } ::
        state.effectActivations.filter fun value =>
          decide (value.elementId ≠ effect.elementId) }

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

private def occurrenceParent? (occurrences : List RuntimeScopeOccurrence)
    (candidate : ScopeOccurrenceId) : Option ScopeOccurrenceId :=
  (occurrences.find? fun occurrence => decide (occurrence.id = candidate))
    |>.bind (·.parent)

private def occurrenceInSubtreeWithin
    (occurrences : List RuntimeScopeOccurrence) (root candidate : ScopeOccurrenceId) :
    Nat → Bool
  | 0 => false
  | fuel + 1 =>
      if candidate = root then true
      else match occurrenceParent? occurrences candidate with
        | some parent => occurrenceInSubtreeWithin occurrences root parent fuel
        | none => false

/-- Whether one live occurrence is the selected scope occurrence or one of its descendants. -/
def occurrenceInSubtree (occurrences : List RuntimeScopeOccurrence)
    (root candidate : ScopeOccurrenceId) : Bool :=
  occurrenceInSubtreeWithin occurrences root candidate (occurrences.length + 1)

private def effectOccurrenceId (wait : EffectWait) : EffectOccurrenceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.elementId.value⟩
    activation := wait.activation }

/-- Atomically remove all runtime owners in one scope-occurrence subtree and emit the caught route token in its live parent. Activation counters and End occurrence history are monotonic and deliberately survive interruption. -/
def interruptScope (state : RuntimeState) (root parent : ScopeOccurrenceId)
    (output : ControlPlaceId) : RuntimeState :=
  let interrupted := fun owner =>
    occurrenceInSubtree state.scopeOccurrences root owner
  let interruptedEffects := state.effectWaits.filter fun wait =>
    interrupted wait.owner
  { state with
    tokens := addToken
      (state.tokens.filter fun token => !interrupted token.owner) output parent
    scopeOccurrences := state.scopeOccurrences.filter fun occurrence =>
      !interrupted occurrence.id
    waits := state.waits.filter fun wait => !interrupted wait.owner
    messageWaits := state.messageWaits.filter fun wait => !interrupted wait.owner
    timerWaits := state.timerWaits.filter fun wait => !interrupted wait.owner
    effectWaits := state.effectWaits.filter fun wait => !interrupted wait.owner
    variables :=
      { state.variables with
        activities := state.variables.activities.filter fun activity =>
          !(interruptedEffects.any fun wait =>
            activityScopeMatches (effectOccurrenceId wait) activity) } }

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

def scopeQuiescent (state : RuntimeState) (owner : ScopeOccurrenceId) : Bool :=
  !(state.tokens.any fun token => token.owner == owner) &&
    !(state.waits.any fun wait => wait.owner == owner) &&
    !(state.messageWaits.any fun wait => wait.owner == owner) &&
    !(state.timerWaits.any fun wait => wait.owner == owner) &&
    !(state.effectWaits.any fun wait => wait.owner == owner) &&
    !(state.scopeOccurrences.any fun occurrence => occurrence.parent == some owner)

def completeScopeState? (state : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId) : Option RuntimeState := do
  let occurrence ← match state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id.definitionScopeId = scopeId) with
    | [occurrence] => some occurrence
    | _ => none
  if !scopeQuiescent state occurrence.id then none
  else match occurrence.parent, parentOutput, state.control with
    | none, none, .running instanceId =>
        if state.initiationPending then none
        else some ({ state with
            control := .completed instanceId
            scopeOccurrences := [] })
    | some parent, some output, .running _ =>
        if state.scopeOccurrences.any fun candidate => candidate.id == parent then
          some ({ state with
              tokens := addToken state.tokens output parent
              scopeOccurrences := state.scopeOccurrences.filter fun candidate =>
                decide (candidate.id ≠ occurrence.id) })
        else none
    | _, _, _ => none

/-- A uniquely identified live scope cannot complete while any owned token, wait, or child occurrence remains. -/
theorem completeScopeState_refuses_nonquiescent
    (state : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId) (occurrence : RuntimeScopeOccurrence)
    (unique :
      state.scopeOccurrences.filter (fun candidate =>
        decide (candidate.id.definitionScopeId = scopeId)) = [occurrence])
    (blocked : scopeQuiescent state occurrence.id = false) :
    completeScopeState? state scopeId parentOutput = none := by
  simp [completeScopeState?, unique, blocked]

end BpmnSemantics.SemanticProcess
