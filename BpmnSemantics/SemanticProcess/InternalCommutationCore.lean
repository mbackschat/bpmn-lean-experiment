import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.InternalArmingOrder
import BpmnSemantics.SemanticProcess.Transition

/-! # Internal commutation footprint and prepared-patch core

Defines the bounded internal-arm representation, exact preparation algorithm, raw patch application, and public transition-footprint classifier used by the commutation proof layers.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive InternalWaitKind where
  | userTask
  | message
  | timer
  | effect
  deriving Repr, DecidableEq

inductive InternalStateAtom where
  | controlToken (owner : ScopeOccurrenceId) (place : ControlPlaceId)
  | scopeOccurrence (owner : ScopeOccurrenceId)
  | runtimeControl (instanceId : SemanticId)
  | logicalTime
  | activation (kind : InternalWaitKind) (elementId : NodeId)
  | wait (kind : InternalWaitKind) (occurrence : OccurrenceId)
  | openWaitAnchor (occurrence : OccurrenceId)
  | activityVariableScope (occurrence : EffectOccurrenceId)
  | activityVariable (occurrence : EffectOccurrenceId) (name : String)
  deriving Repr, DecidableEq

structure InternalPositionDelta where
  consumedSequenceFlow : SequenceFlowId
  owner : ScopeOccurrenceId
  multiplicity : Nat
  deriving Repr, DecidableEq

inductive InternalPublicationAtom where
  | committedTransition (operationId : OperationId) (kind : InternalWaitKind) (origin : BpmnElementOrigin) (owner : ScopeOccurrenceId) (logicalTimeMs : Nat) (positionDelta : InternalPositionDelta)
  | flowNodeLifecycle (occurrence : OccurrenceId)
  | publicationPair (operationId : OperationId) (occurrence : OccurrenceId)
  deriving Repr, DecidableEq

structure InternalTransitionFootprint where
  operationId : OperationId
  kind : InternalWaitKind
  occurrence : OccurrenceId
  reads : List InternalStateAtom
  writes : List InternalStateAtom
  publications : List InternalPublicationAtom
  deriving Repr, DecidableEq


namespace InternalCommutation

inductive InternalArmingWrite where
  | userTask (wait : UserTaskWait)
  | message (wait : MessageWait)
  | timer (wait : TimerWait)
  | effect (wait : EffectWait) (bindings : List VariableBinding)
  deriving Repr, DecidableEq

structure InternalArmingPatch where
  operation : SemanticOperation
  origin : BpmnElementOrigin
  runtimeInstanceId : SemanticId
  logicalTimeMs : Nat
  input : ControlPlaceId
  inputOrigin : BpmnSequenceFlowOrigin
  owner : ScopeOccurrenceId
  write : InternalArmingWrite
  deriving Repr, DecidableEq

def kindRank : InternalWaitKind → Nat
  | .userTask => 0
  | .message => 1
  | .timer => 2
  | .effect => 3

def scopeBefore (left right : ScopeOccurrenceId) : Bool :=
  if left.processInstanceId ≠ right.processInstanceId then
    left.processInstanceId.value < right.processInstanceId.value
  else if left.definitionScopeId ≠ right.definitionScopeId then
    left.definitionScopeId.value < right.definitionScopeId.value
  else
    left.activation < right.activation

def occurrenceBefore (left right : OccurrenceId) : Bool :=
  if left.processInstanceId ≠ right.processInstanceId then
    left.processInstanceId.value < right.processInstanceId.value
  else if left.elementId ≠ right.elementId then
    left.elementId.value < right.elementId.value
  else
    left.activation < right.activation

def effectOccurrenceBefore (left right : EffectOccurrenceId) : Bool := occurrenceBefore
  { processInstanceId := left.processInstanceId, elementId := ⟨left.elementId.value⟩, activation := left.activation }
  { processInstanceId := right.processInstanceId, elementId := ⟨right.elementId.value⟩, activation := right.activation }

def stateAtomRank : InternalStateAtom → Nat
  | .runtimeControl _ => 0
  | .scopeOccurrence _ => 1
  | .controlToken _ _ => 2
  | .logicalTime => 3
  | .activation _ _ => 4
  | .wait _ _ => 5
  | .openWaitAnchor _ => 6
  | .activityVariableScope _ => 7
  | .activityVariable _ _ => 8

def stateAtomBefore (left right : InternalStateAtom) : Bool :=
  if stateAtomRank left ≠ stateAtomRank right then
    stateAtomRank left < stateAtomRank right
  else
    match left, right with
    | .runtimeControl left, .runtimeControl right => left.value < right.value
    | .scopeOccurrence left, .scopeOccurrence right => scopeBefore left right
    | .controlToken leftOwner leftPlace, .controlToken rightOwner rightPlace =>
        if leftOwner ≠ rightOwner then scopeBefore leftOwner rightOwner
        else leftPlace.value < rightPlace.value
    | .logicalTime, .logicalTime => false
    | .activation leftKind leftElement, .activation rightKind rightElement =>
        if leftKind ≠ rightKind then kindRank leftKind < kindRank rightKind
        else leftElement.value < rightElement.value
    | .wait leftKind leftOccurrence, .wait rightKind rightOccurrence =>
        if leftKind ≠ rightKind then kindRank leftKind < kindRank rightKind
        else occurrenceBefore leftOccurrence rightOccurrence
    | .openWaitAnchor left, .openWaitAnchor right => occurrenceBefore left right
    | .activityVariableScope left, .activityVariableScope right => effectOccurrenceBefore left right
    | .activityVariable left leftName, .activityVariable right rightName =>
        if left ≠ right then effectOccurrenceBefore left right
        else leftName < rightName
    | _, _ => false

def publicationRank : InternalPublicationAtom → Nat
  | .committedTransition .. => 0
  | .flowNodeLifecycle .. => 1
  | .publicationPair .. => 2

def publicationBefore (left right : InternalPublicationAtom) : Bool :=
  if publicationRank left ≠ publicationRank right then
    publicationRank left < publicationRank right
  else
    match left, right with
    | .committedTransition leftId leftKind leftOrigin leftOwner leftTime leftDelta,
        .committedTransition rightId rightKind rightOrigin rightOwner rightTime rightDelta =>
        if leftId ≠ rightId then leftId.value < rightId.value
        else if leftKind ≠ rightKind then kindRank leftKind < kindRank rightKind
        else if leftOrigin ≠ rightOrigin then
          leftOrigin.elementId.value < rightOrigin.elementId.value
        else if leftOwner ≠ rightOwner then scopeBefore leftOwner rightOwner
        else if leftTime ≠ rightTime then leftTime < rightTime
        else if leftDelta.consumedSequenceFlow ≠ rightDelta.consumedSequenceFlow then
          leftDelta.consumedSequenceFlow.value < rightDelta.consumedSequenceFlow.value
        else if leftDelta.owner ≠ rightDelta.owner then
          scopeBefore leftDelta.owner rightDelta.owner
        else leftDelta.multiplicity < rightDelta.multiplicity
    | .flowNodeLifecycle leftOccurrence, .flowNodeLifecycle rightOccurrence => occurrenceBefore leftOccurrence rightOccurrence
    | .publicationPair leftId leftOccurrence, .publicationPair rightId rightOccurrence =>
        if leftId ≠ rightId then leftId.value < rightId.value
        else occurrenceBefore leftOccurrence rightOccurrence
    | _, _ => false

def sortInsertBy (before : α → α → Bool) (value : α) : List α → List α
  | [] => [value]
  | current :: rest =>
      if before value current then value :: current :: rest
      else current :: sortInsertBy before value rest

def sortBy (before : α → α → Bool) : List α → List α
  | [] => []
  | value :: rest => sortInsertBy before value (sortBy before rest)

theorem mem_sortInsertBy (before : α → α → Bool) (value inserted : α) (values : List α) : value ∈ sortInsertBy before inserted values ↔
      value = inserted ∨ value ∈ values := by
  induction values with
  | nil => simp [sortInsertBy]
  | cons current rest ih => simp only [sortInsertBy]; split <;> simp_all [or_left_comm]

theorem mem_sortBy (before : α → α → Bool) (value : α) (values : List α) :
    value ∈ sortBy before values ↔ value ∈ values := by
  induction values with
  | nil => simp [sortBy]
  | cons current rest ih => simp [sortBy, mem_sortInsertBy, ih]


end InternalCommutation

def canonicalStateAtomSet (atoms : List InternalStateAtom) : List InternalStateAtom :=
  InternalCommutation.sortBy InternalCommutation.stateAtomBefore atoms.eraseDups

def canonicalPublicationAtomSet (atoms : List InternalPublicationAtom) : List InternalPublicationAtom :=
  InternalCommutation.sortBy InternalCommutation.publicationBefore atoms.eraseDups


namespace InternalCommutation

def userTaskWaitOccurrence (wait : UserTaskWait) : OccurrenceId :=
  { processInstanceId := wait.processInstanceId, elementId := ⟨wait.task.id.value⟩, activation := wait.activation }

def messageWaitOccurrence (wait : MessageWait) : OccurrenceId :=
  { processInstanceId := wait.processInstanceId, elementId := ⟨wait.elementId.value⟩, activation := wait.activation }

def timerWaitOccurrence (wait : TimerWait) : OccurrenceId :=
  { processInstanceId := wait.processInstanceId, elementId := ⟨wait.elementId.value⟩, activation := wait.activation }

def effectWaitOccurrence (wait : EffectWait) : OccurrenceId :=
  { processInstanceId := wait.processInstanceId, elementId := ⟨wait.elementId.value⟩, activation := wait.activation }

def openWaitAnchors (state : RuntimeState) : List OccurrenceId :=
  state.waits.map userTaskWaitOccurrence ++
    state.messageWaits.map messageWaitOccurrence ++
    state.timerWaits.map timerWaitOccurrence ++
    state.effectWaits.map effectWaitOccurrence ++
    state.effectIncidents.map fun incident => effectWaitOccurrence incident.wait

def openWaitAnchorAbsent (state : RuntimeState) (occurrence : OccurrenceId) : Bool :=
  !(openWaitAnchors state).contains occurrence

def exactProgramSelection (program : Program) (operation : SemanticOperation) (owner : ScopeOccurrenceId) : Bool :=
  (program.operations.filter fun candidate => decide (candidate = operation)).length = 1 &&
    match program.operationScopes.filter fun binding =>
        decide (binding.operationId = operation.id) with
    | [binding] => decide (binding.scopeId = owner.definitionScopeId)
    | _ => false

/-- Internal proof API connecting a prepared exact selection to the runtime declaration census. -/
theorem declaredByExactlyOneOwnedOperation_of_exactSelection (program : Program)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId)
    (declarers : List SemanticOperation) (declarersEq : declarers = [operation])
    (selected : exactProgramSelection program operation owner = true) :
    declaredByExactlyOneOwnedOperation program declarers owner = true := by
  simp only [exactProgramSelection, Bool.and_eq_true] at selected
  rw [declarersEq]
  simp only [declaredByExactlyOneOwnedOperation, operationOwningScope?]
  generalize bindingsEq : (program.operationScopes.filter fun binding =>
    decide (binding.operationId = operation.id)) = bindings at selected ⊢
  cases bindings with
  | nil => simp at selected
  | cons binding rest => cases rest with
    | nil => simpa using selected.2
    | cons other tail => simp at selected

def uniqueFamilyDeclarer? (program : Program) (operation : SemanticOperation) (kind : InternalWaitKind) (elementId : NodeId) : Bool :=
  let declarers := match kind with
    | .userTask => userTaskWaitDeclarers program ⟨elementId.value⟩
    | .message => messageWaitDeclarers program elementId
    | .timer => timerWaitDeclarers program elementId
    | .effect => effectWaitDeclarers program elementId
  decide (declarers = [operation])

def selectedInputOrigin? (program : Program) (input : ControlPlaceId) (owner : ScopeOccurrenceId) : Option BpmnSequenceFlowOrigin := do
  let place ← match program.controlPlaces.filter fun place => decide (place.id = input) with
    | [place] => some place
    | _ => none
  let binding ← match program.controlPlaceScopes.filter fun binding =>
      decide (binding.controlPlaceId = input) with
    | [binding] => some binding
    | _ => none
  if binding.scopeId = owner.definitionScopeId then some place.origin else none

def internalArmInput? : SemanticOperation → Option ControlPlaceId
  | .awaitUserTask _ _ input _ _ | .awaitMessage _ _ input _ _
  | .awaitTimer _ _ input _ _ | .awaitEffect _ _ input _ _ _ => some input
  | _ => none

def internalArmOrigin? : SemanticOperation → Option BpmnElementOrigin
  | .awaitUserTask _ origin _ _ _ | .awaitMessage _ origin _ _ _
  | .awaitTimer _ origin _ _ _ | .awaitEffect _ origin _ _ _ _ => some origin
  | _ => none

def InternalArmingWrite.kind : InternalArmingWrite → InternalWaitKind
  | .userTask .. => .userTask
  | .message .. => .message
  | .timer .. => .timer
  | .effect .. => .effect

def InternalArmingWrite.occurrence : InternalArmingWrite → OccurrenceId
  | .userTask wait => userTaskWaitOccurrence wait
  | .message wait => messageWaitOccurrence wait
  | .timer wait => timerWaitOccurrence wait
  | .effect wait _ => effectWaitOccurrence wait

def InternalArmingWrite.elementId : InternalArmingWrite → NodeId
  | .userTask wait => ⟨wait.task.id.value⟩
  | .message wait => wait.elementId
  | .timer wait => wait.elementId
  | .effect wait _ => wait.elementId

def InternalArmingWrite.owner : InternalArmingWrite → ScopeOccurrenceId
  | .userTask wait => wait.owner
  | .message wait => wait.owner
  | .timer wait => wait.owner
  | .effect wait _ => wait.owner

def InternalArmingWrite.available (state : RuntimeState) : InternalArmingWrite → Bool
  | .effect wait _ => !state.variables.activities.any (activityScopeMatches (effectWaitOccurrence wait))
  | _ => true

def prepareInternalArm? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option InternalArmingPatch := do
  let input ← internalArmInput? operation
  let origin ← internalArmOrigin? operation
  let owner ← onlyTokenOwner? state input
  if !exactProgramSelection program operation owner || !exactLiveOccurrence state owner then none
  else pure ()
  let inputOrigin ← selectedInputOrigin? program input owner
  let runtimeInstanceId ← match state.control with
    | .running instanceId => some instanceId
    | _ => none
  let write : InternalArmingWrite ← match operation with
    | .awaitUserTask _ _ _ output task =>
        let next := activationCount state task.id + 1
        some (.userTask
          { processInstanceId := owner.processInstanceId, owner, task, activation := next,
            output, metadata := task.metadata })
    | .awaitMessage _ _ _ output message =>
        let next := messageActivationCount state message.elementId + 1
        some (.message
          { processInstanceId := owner.processInstanceId, owner,
            elementId := message.elementId, activation := next, channel := message.channel, output })
    | .awaitTimer _ _ _ output timer =>
        let next := timerActivationCount state timer.elementId + 1
        some (.timer
          { processInstanceId := owner.processInstanceId, owner,
            elementId := timer.elementId, activation := next,
            deadlineMs := state.logicalTimeMs + timer.durationMs, output })
    | .awaitEffect _ _ _ output effect route =>
        let evaluated := evaluateInputMappings effect.inputMappings
        if evaluated.isNone then none else
        let bindings := evaluated.getD []
        let next := effectActivationCount state effect.elementId + 1
        some (.effect
            { processInstanceId := owner.processInstanceId, owner,
              elementId := effect.elementId, activation := next, descriptor := effect.descriptor,
              arguments := bindings, outputMappings := effect.outputMappings, output,
              bpmnErrorRoute := route }
            bindings)
    | _ => none
  if !uniqueFamilyDeclarer? program operation write.kind write.elementId ||
      !openWaitAnchorAbsent state write.occurrence || !write.available state then none
  else
    some
      { operation := operation
        origin := origin
        runtimeInstanceId := runtimeInstanceId
        logicalTimeMs := state.logicalTimeMs
        input := input
        inputOrigin := inputOrigin
        owner := owner
        write := write }

def applyInternalArmingPatch (state : RuntimeState)
    (patch : InternalArmingPatch) : RuntimeState :=
  let tokens := removeToken state.tokens patch.input patch.owner
  match patch.write with
  | .userTask wait =>
      { state with
        tokens := tokens
        waits := insertUserTaskWait wait state.waits
        activations := setActivationCount state.activations wait.task.id wait.activation }
  | .message wait =>
      { state with
        tokens := tokens
        messageWaits := insertMessageWait wait state.messageWaits
        messageActivations := setMessageActivationCount state.messageActivations
          wait.elementId wait.activation }
  | .timer wait =>
      { state with
        tokens := tokens
        timerWaits := insertTimerWait wait state.timerWaits
        timerActivations := setTimerActivationCount state.timerActivations
          wait.elementId wait.activation }
  | .effect wait bindings =>
      { state with
        tokens := tokens
        effectWaits := insertEffectWait wait state.effectWaits
        effectActivations := setEffectActivationCount state.effectActivations
          wait.elementId wait.activation
        variables := { state.variables with
          activities := insertActivityVariableScope
            { owner := .effectOccurrence (effectWaitOccurrence wait), bindings }
            state.variables.activities } }

def footprintOfPatch (patch : InternalArmingPatch) : InternalTransitionFootprint :=
  let kind := patch.write.kind
  let occurrence := patch.write.occurrence
  let elementId := patch.write.elementId
  let extraReads := match patch.write with
    | .timer .. => [.logicalTime]
    | .effect wait _ => [.activityVariableScope (effectWaitOccurrence wait)]
    | _ => []
  let extraWrites := match patch.write with
    | .effect wait bindings => .activityVariableScope (effectWaitOccurrence wait) ::
        bindings.map fun binding => .activityVariable (effectWaitOccurrence wait) binding.name
    | _ => []
  { operationId := patch.operation.id
    kind := kind
    occurrence := occurrence
    reads := canonicalStateAtomSet
      ([.runtimeControl patch.runtimeInstanceId, .scopeOccurrence patch.owner,
        .controlToken patch.owner patch.input, .activation kind elementId,
        .wait kind occurrence, .openWaitAnchor occurrence] ++ extraReads)
    writes := canonicalStateAtomSet
      ([.controlToken patch.owner patch.input, .activation kind elementId,
        .wait kind occurrence, .openWaitAnchor occurrence] ++ extraWrites)
    publications := canonicalPublicationAtomSet
      [.committedTransition patch.operation.id kind patch.origin patch.owner
          patch.logicalTimeMs
          { consumedSequenceFlow := patch.inputOrigin.elementId,
            owner := patch.owner, multiplicity := 1 },
        .flowNodeLifecycle occurrence,
        .publicationPair patch.operation.id occurrence] }


end InternalCommutation

def internalTransitionFootprint? (program : Program) (state : RuntimeState) (operation : SemanticOperation) : Option InternalTransitionFootprint :=
  (InternalCommutation.prepareInternalArm? program state operation).map InternalCommutation.footprintOfPatch


namespace InternalCommutation

def listsDisjoint [DecidableEq α] (left right : List α) : Bool := left.all fun value => !right.contains value

end InternalCommutation

def footprintsNonInterfering (left right : InternalTransitionFootprint) : Bool :=
  InternalCommutation.listsDisjoint left.writes right.reads &&
    InternalCommutation.listsDisjoint right.writes left.reads &&
    InternalCommutation.listsDisjoint left.writes right.writes &&
    InternalCommutation.listsDisjoint left.publications right.publications


end BpmnSemantics.SemanticProcess
