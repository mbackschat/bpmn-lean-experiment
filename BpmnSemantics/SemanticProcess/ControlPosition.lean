import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation

/-! # Public committed control positions

This module owns the fail-closed projection from private control places and runtime scope occurrences to BPMN Sequence Flow and definition-scope origins. It also owns exact transition deltas and their revision-zero fold. No private control-place identifier enters a public position.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Public multiplicity at one BPMN Sequence Flow and runtime scope occurrence. -/
structure PublicControlTokenPosition where
  sequenceFlowId : SequenceFlowId
  owner : ScopeOccurrenceId
  multiplicity : Nat
  deriving Repr, DecidableEq

/-- Public identity and parentage of one live runtime definition-scope occurrence. -/
structure PublicScopePosition where
  id : ScopeOccurrenceId
  parent : Option ScopeOccurrenceId
  bpmnElementId : NodeId
  deriving Repr, DecidableEq

/-- Complete public control position, independently projected from one RuntimeState. -/
structure PublicControlPosition where
  controlTokens : List PublicControlTokenPosition
  scopes : List PublicScopePosition
  deriving Repr, DecidableEq

/-- Exact public position change across one semantic transition. -/
structure PublicControlPositionDelta where
  consumedTokens : List PublicControlTokenPosition
  producedTokens : List PublicControlTokenPosition
  enteredScopes : List PublicScopePosition
  exitedScopes : List PublicScopePosition
  deriving Repr, DecidableEq

def emptyPublicControlPosition : PublicControlPosition :=
  { controlTokens := [], scopes := [] }

private def sameTokenPosition (left right : PublicControlTokenPosition) : Bool :=
  decide (left.sequenceFlowId = right.sequenceFlowId && left.owner = right.owner)

private def tokenPositionBefore (left right : PublicControlTokenPosition) : Bool :=
  if left.sequenceFlowId.value ≠ right.sequenceFlowId.value then
    left.sequenceFlowId.value < right.sequenceFlowId.value
  else if left.owner.processInstanceId.value ≠ right.owner.processInstanceId.value then
    left.owner.processInstanceId.value < right.owner.processInstanceId.value
  else if left.owner.definitionScopeId.value ≠ right.owner.definitionScopeId.value then
    left.owner.definitionScopeId.value < right.owner.definitionScopeId.value
  else left.owner.activation < right.owner.activation

private def insertTokenPosition (position : PublicControlTokenPosition) :
    List PublicControlTokenPosition → List PublicControlTokenPosition
  | [] => [position]
  | current :: rest =>
      if sameTokenPosition position current then
        { current with multiplicity := current.multiplicity + position.multiplicity } :: rest
      else if tokenPositionBefore position current then position :: current :: rest
      else current :: insertTokenPosition position rest

private def scopePositionBefore (left right : PublicScopePosition) : Bool :=
  if left.id.processInstanceId.value ≠ right.id.processInstanceId.value then
    left.id.processInstanceId.value < right.id.processInstanceId.value
  else if left.id.definitionScopeId.value ≠ right.id.definitionScopeId.value then
    left.id.definitionScopeId.value < right.id.definitionScopeId.value
  else left.id.activation < right.id.activation

private def insertScopePosition? (position : PublicScopePosition) :
    List PublicScopePosition → Option (List PublicScopePosition)
  | [] => some [position]
  | current :: rest =>
      if position.id = current.id then none
      else if scopePositionBefore position current then some (position :: current :: rest)
      else do pure (current :: (← insertScopePosition? position rest))

private def uniqueControlPlace? (program : Program) (placeId : ControlPlaceId) :
    Option ControlPlace :=
  match program.controlPlaces.filter fun place => decide (place.id = placeId) with
  | [place] =>
      match program.controlPlaces.filter fun candidate => decide (candidate.origin = place.origin) with
      | [_] => some place
      | _ => none
  | _ => none

private def controlPlaceScope? (program : Program) (placeId : ControlPlaceId) :
    Option DefinitionScopeId :=
  match program.controlPlaceScopes.filter fun ownership =>
      decide (ownership.controlPlaceId = placeId) with
  | [ownership] => some ownership.scopeId
  | _ => none

private def uniqueDefinitionScope? (program : Program) (scopeId : DefinitionScopeId) :
    Option DefinitionScope :=
  match program.definitionScopes.filter fun scope => decide (scope.id = scopeId) with
  | [scope] =>
      match program.definitionScopes.filter fun candidate =>
          decide (candidate.originElementId = scope.originElementId) with
      | [_] => some scope
      | _ => none
  | _ => none

private def programProjectionBindingsValid (program : Program) : Bool :=
  (program.controlPlaces.all fun place =>
    (program.controlPlaces.filter fun candidate =>
      decide (candidate.origin = place.origin)).length = 1) &&
    program.definitionScopes.all fun scope =>
      (program.definitionScopes.filter fun candidate =>
        decide (candidate.originElementId = scope.originElementId)).length = 1

def exactLiveOccurrence (state : RuntimeState) (id : ScopeOccurrenceId) : Bool :=
  (state.scopeOccurrences.filter fun occurrence => decide (occurrence.id = id)).length = 1

private def hostingRoot (program : Program) (instanceId : SemanticId)
    (scope : DefinitionScope) (occurrence : RuntimeScopeOccurrence) : Bool :=
  occurrence.parent.isNone &&
    occurrence.id.processInstanceId = instanceId &&
    scope.parentScopeId.isNone &&
    scope.originElementId.value = program.processId.value

private def calledRootBindingValid (state : RuntimeState)
    (scope : DefinitionScope) (occurrence : RuntimeScopeOccurrence) : Bool :=
  match state.calledProcessOccurrences.filter fun record =>
      decide (record.calledRoot = occurrence.id) with
  | [record] => record.calledProcessId.value = scope.originElementId.value
  | _ => false

private def rootAssociationValid (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (scope : DefinitionScope)
    (occurrence : RuntimeScopeOccurrence) : Bool :=
  let hosting := hostingRoot program instanceId scope occurrence
  let called := calledRootBindingValid state scope occurrence
  (hosting && !called) || (!hosting && called)

private def runtimeParentValid (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (scope : DefinitionScope)
    (occurrence : RuntimeScopeOccurrence) : Bool :=
  match scope.parentScopeId, occurrence.parent with
  | none, none => rootAssociationValid program instanceId state scope occurrence
  | some definitionParent, some runtimeParent =>
      runtimeParent.processInstanceId = occurrence.id.processInstanceId &&
        runtimeParent.definitionScopeId = definitionParent &&
        exactLiveOccurrence state runtimeParent
  | _, _ => false

private def scopeOccurrenceValid (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (occurrence : RuntimeScopeOccurrence) : Bool :=
  match uniqueDefinitionScope? program occurrence.id.definitionScopeId with
  | none => false
  | some scope =>
      decide (occurrence.id.processInstanceId.value ≠ "") &&
        occurrence.id.activation > 0 &&
        runtimeParentValid program instanceId state scope occurrence

private def tokenBindingValid (program : Program) (state : RuntimeState)
    (token : ControlToken) : Bool :=
  match uniqueControlPlace? program token.placeId,
      controlPlaceScope? program token.placeId with
  | some _, some staticOwner =>
      staticOwner = token.owner.definitionScopeId &&
        exactLiveOccurrence state token.owner
  | _, _ => false

private def hostingRootCount (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) : Nat :=
  (state.scopeOccurrences.filter fun occurrence =>
    match uniqueDefinitionScope? program occurrence.id.definitionScopeId with
    | none => false
    | some scope => hostingRoot program instanceId scope occurrence).length

private def runningPositionValid (program : Program) (expectedInstanceId instanceId : SemanticId)
    (state : RuntimeState) : Bool :=
  instanceId = expectedInstanceId &&
    hostingRootCount program instanceId state = 1 &&
    calledProcessAssociationsValid state &&
    (state.scopeOccurrences.all fun occurrence =>
      exactLiveOccurrence state occurrence.id &&
        scopeOccurrenceValid program instanceId state occurrence) &&
    state.tokens.all (tokenBindingValid program state)

private def lifecyclePositionValid (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState) : Bool :=
  match state.control with
  | .notStarted => state.scopeOccurrences.isEmpty && state.tokens.isEmpty
  | .running instanceId => runningPositionValid program expectedInstanceId instanceId state
  | .completed instanceId | .cancelled instanceId =>
      instanceId = expectedInstanceId &&
        state.scopeOccurrences.isEmpty && state.tokens.isEmpty

/-- Independent lifecycle, scope-forest, call-association, and token-binding validity for public projection. -/
def runtimePositionValid (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState) : Bool :=
  programWellFormed program && programProjectionBindingsValid program &&
    lifecyclePositionValid program expectedInstanceId state

private def tokenOrigin (program : Program) (token : ControlToken) : SequenceFlowId :=
  match uniqueControlPlace? program token.placeId with
  | some place => place.origin.elementId
  | none => ⟨""⟩

private def projectTokens (program : Program) :
    List ControlToken → List PublicControlTokenPosition
  | [] => []
  | token :: rest =>
      insertTokenPosition
        { sequenceFlowId := tokenOrigin program token
          owner := token.owner
          multiplicity := 1 }
        (projectTokens program rest)

private def scopeOrigin (program : Program)
    (occurrence : RuntimeScopeOccurrence) : NodeId :=
  match uniqueDefinitionScope? program occurrence.id.definitionScopeId with
  | some scope => scope.originElementId
  | none => ⟨""⟩

private def insertProjectedScopePosition (position : PublicScopePosition) :
    List PublicScopePosition → List PublicScopePosition
  | [] => [position]
  | current :: rest =>
      if scopePositionBefore position current then position :: current :: rest
      else current :: insertProjectedScopePosition position rest

private def projectScopes (program : Program) :
    List RuntimeScopeOccurrence → List PublicScopePosition
  | [] => []
  | occurrence :: rest =>
      insertProjectedScopePosition
        { id := occurrence.id
          parent := occurrence.parent
          bpmnElementId := scopeOrigin program occurrence }
        (projectScopes program rest)

/-- Project exact public positions, rejecting malformed Program bindings and runtime ownership. -/
def projectControlPosition? (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState) : Option PublicControlPosition :=
  if runtimePositionValid program expectedInstanceId state then
    some
      { controlTokens := projectTokens program state.tokens
        scopes := projectScopes program state.scopeOccurrences }
  else none

/-- Explicit validity hypotheses under which the private-to-public projection is total. -/
def controlPositionProjectable (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState) : Prop :=
  runtimePositionValid program expectedInstanceId state = true

/-- Every admitted, binding-valid runtime position has one exact public projection. -/
theorem projectControlPosition_total (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState)
    (valid : controlPositionProjectable program expectedInstanceId state) :
    ∃ position, projectControlPosition? program expectedInstanceId state = some position := by
  let position : PublicControlPosition :=
    { controlTokens := projectTokens program state.tokens
      scopes := projectScopes program state.scopeOccurrences }
  have validity : runtimePositionValid program expectedInstanceId state = true := valid
  refine ⟨position, ?_⟩
  simp [projectControlPosition?, validity, position]

private def tokenMultiplicityAt (positions : List PublicControlTokenPosition)
    (target : PublicControlTokenPosition) : Nat :=
  match positions.find? (sameTokenPosition target) with
  | some position => position.multiplicity
  | none => 0

private def tokenDifference (left right : List PublicControlTokenPosition) :
    List PublicControlTokenPosition :=
  left.filterMap fun position =>
    let multiplicity := position.multiplicity - tokenMultiplicityAt right position
    if multiplicity = 0 then none else some { position with multiplicity }

private def scopeDifference (left right : List PublicScopePosition) :
    List PublicScopePosition :=
  left.filter fun position => !(right.any fun candidate => candidate == position)

/-- Compute one exact delta from independently projected before and after states. -/
def controlPositionDelta? (program : Program) (expectedInstanceId : SemanticId)
    (before after : RuntimeState) : Option PublicControlPositionDelta := do
  let beforePosition ← projectControlPosition? program expectedInstanceId before
  let afterPosition ← projectControlPosition? program expectedInstanceId after
  pure
    { consumedTokens := tokenDifference beforePosition.controlTokens afterPosition.controlTokens
      producedTokens := tokenDifference afterPosition.controlTokens beforePosition.controlTokens
      enteredScopes := scopeDifference afterPosition.scopes beforePosition.scopes
      exitedScopes := scopeDifference beforePosition.scopes afterPosition.scopes }

private def consumeTokenPosition? (consumed : PublicControlTokenPosition) :
    List PublicControlTokenPosition → Option (List PublicControlTokenPosition)
  | [] => none
  | current :: rest =>
      if sameTokenPosition consumed current then
        if consumed.multiplicity = 0 || consumed.multiplicity > current.multiplicity then none
        else if consumed.multiplicity = current.multiplicity then some rest
        else some ({ current with multiplicity := current.multiplicity - consumed.multiplicity } :: rest)
      else do pure (current :: (← consumeTokenPosition? consumed rest))

private def consumeTokenPositions? :
    List PublicControlTokenPosition → List PublicControlTokenPosition →
      Option (List PublicControlTokenPosition)
  | current, [] => some current
  | current, consumed :: rest => do
      consumeTokenPositions? (← consumeTokenPosition? consumed current) rest

private def produceTokenPositions? (current : List PublicControlTokenPosition) :
    List PublicControlTokenPosition → Option (List PublicControlTokenPosition)
  | [] => some current
  | produced :: rest =>
      if produced.multiplicity = 0 then none
      else produceTokenPositions? (insertTokenPosition produced current) rest

private def exitScopePosition? (exited : PublicScopePosition) :
    List PublicScopePosition → Option (List PublicScopePosition)
  | [] => none
  | current :: rest =>
      if current = exited then some rest
      else do pure (current :: (← exitScopePosition? exited rest))

private def exitScopePositions? :
    List PublicScopePosition → List PublicScopePosition → Option (List PublicScopePosition)
  | current, [] => some current
  | current, exited :: rest => do
      exitScopePositions? (← exitScopePosition? exited current) rest

private def enterScopePositions? (current : List PublicScopePosition) :
    List PublicScopePosition → Option (List PublicScopePosition)
  | [] => some current
  | entered :: rest => do
      enterScopePositions? (← insertScopePosition? entered current) rest

/-- Apply one fail-closed exact position delta. -/
def applyControlPositionDelta? (current : PublicControlPosition)
    (delta : PublicControlPositionDelta) : Option PublicControlPosition := do
  let remainingTokens ← consumeTokenPositions? current.controlTokens delta.consumedTokens
  let nextTokens ← produceTokenPositions? remainingTokens delta.producedTokens
  let remainingScopes ← exitScopePositions? current.scopes delta.exitedScopes
  let nextScopes ← enterScopePositions? remainingScopes delta.enteredScopes
  pure { controlTokens := nextTokens, scopes := nextScopes }

def foldControlPositionDeltas :
    PublicControlPosition → List PublicControlPositionDelta → Option PublicControlPosition
  | position, [] => some position
  | position, delta :: rest => do
      foldControlPositionDeltas (← applyControlPositionDelta? position delta) rest

private structure DeltaTraceAccumulator where
  state : RuntimeState
  deltas : List PublicControlPositionDelta

private def replayOneTransition? (program : Program) (state : RuntimeState) :
    CommittedTransition → Option RuntimeState
  | .externalStimulus stimulus =>
      let admission := admitStimulus program state stimulus
      if admission.outcome = .committed then some admission.state else none
  | .internalOperation record => replayInternalTransition? program state record

private def buildPositionDeltas? (program : Program) (expectedInstanceId : SemanticId) :
    RuntimeState → List CommittedTransition → Option DeltaTraceAccumulator
  | state, [] => some { state, deltas := [] }
  | state, transition :: rest => do
      let successor ← replayOneTransition? program state transition
      let delta ← controlPositionDelta? program expectedInstanceId state successor
      let tail ← buildPositionDeltas? program expectedInstanceId successor rest
      pure { state := tail.state, deltas := delta :: tail.deltas }

private def foldCheckedDeltas (current : PublicControlPosition) :
    List PublicControlPositionDelta → Option (List PublicControlPositionDelta)
  | deltas =>
      if foldControlPositionDeltas emptyPublicControlPosition deltas = some current then
        some deltas
      else none

/-- Replay a trace only to prove each exact before/after delta and its independent head projection. -/
def traceControlPositionDeltas? (program : Program) (expectedInstanceId : SemanticId)
    (initial : RuntimeState) (transitions : List CommittedTransition) :
    Option (List PublicControlPositionDelta × PublicControlPosition) := do
  let initialPosition ← projectControlPosition? program expectedInstanceId initial
  if initialPosition ≠ emptyPublicControlPosition then none
  else
    let traced ← buildPositionDeltas? program expectedInstanceId initial transitions
    let current ← projectControlPosition? program expectedInstanceId traced.state
    let deltas ← foldCheckedDeltas current traced.deltas
    pure (deltas, current)

/-- Every accepted delta list folds from revision zero to the independently projected head. -/
theorem foldCheckedDeltas_reconstructs_current (current : PublicControlPosition)
    (candidate accepted : List PublicControlPositionDelta)
    (result : foldCheckedDeltas current candidate = some accepted) :
    foldControlPositionDeltas emptyPublicControlPosition accepted = some current := by
  unfold foldCheckedDeltas at result
  dsimp only at result
  split at result <;> simp_all

/-- Every successfully emitted delta trace folds to the same independently projected head it returns. -/
theorem traceControlPositionDeltas_reconstructs_head (program : Program)
    (expectedInstanceId : SemanticId) (initial : RuntimeState)
    (transitions : List CommittedTransition)
    (deltas : List PublicControlPositionDelta) (current : PublicControlPosition)
    (result : traceControlPositionDeltas? program expectedInstanceId initial transitions =
      some (deltas, current)) :
    foldControlPositionDeltas emptyPublicControlPosition deltas = some current := by
  unfold traceControlPositionDeltas? at result
  generalize initialProjectionEq :
    projectControlPosition? program expectedInstanceId initial = initialProjection at result
  cases initialProjection with
  | none => simp at result
  | some initialPosition =>
      by_cases nonempty : initialPosition ≠ emptyPublicControlPosition
      · simp [nonempty] at result
      · simp at result
        rcases result with ⟨_initialEmpty, result⟩
        generalize tracedEq :
          buildPositionDeltas? program expectedInstanceId initial transitions = traced at result
        cases traced with
        | none => simp at result
        | some traced =>
            generalize currentEq :
              projectControlPosition? program expectedInstanceId traced.state = projected at result
            cases projected with
            | none => simp [currentEq] at result
            | some projected =>
                simp [currentEq] at result
                generalize deltasEq : foldCheckedDeltas projected traced.deltas = accepted at result
                cases accepted with
                | none => simp at result
                | some accepted =>
                    simp at result
                    rcases result with ⟨rfl, rfl⟩
                    exact foldCheckedDeltas_reconstructs_current projected traced.deltas accepted deltasEq

end BpmnSemantics.SemanticProcess
