import BpmnSemantics.SemanticProcess.CallActivity
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation

/-! # Runtime position validity

This lower-level owner validates lifecycle state, the runtime scope forest, called-Process root
associations, and token bindings against one immutable Semantic Process program. Public control
projection and committed transition traces consume this predicate but do not define it.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def uniqueControlPlace? (program : Program) (placeId : ControlPlaceId) :
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

def uniqueDefinitionScope? (program : Program) (scopeId : DefinitionScopeId) :
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

/-- Independent lifecycle, scope-forest, call-association, and token-binding validity. -/
def runtimePositionValid (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState) : Bool :=
  programWellFormed program && programProjectionBindingsValid program &&
    lifecyclePositionValid program expectedInstanceId state

private theorem all_removeToken (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (predicate : ControlToken → Bool)
    (holds : tokens.all predicate = true) :
    (removeToken tokens place owner).all predicate = true := by
  induction tokens with
  | nil => rfl
  | cons token rest ih =>
      simp only [List.all_cons, Bool.and_eq_true] at holds
      simp only [removeToken]
      split
      · exact holds.2
      · simp [holds.1, ih holds.2]

/-- Removing one selected token preserves the runtime position when every other read is framed. -/
theorem runtimePositionValid_removeToken_frame (program : Program) (expectedInstanceId : SemanticId)
    (before after : RuntimeState) (input : ControlPlaceId) (owner : ScopeOccurrenceId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (_selected : onlyTokenOwner? before input = some owner)
    (controlFrame : after.control = before.control)
    (scopesFrame : after.scopeOccurrences = before.scopeOccurrences)
    (callsFrame : after.calledProcessOccurrences = before.calledProcessOccurrences)
    (tokensFrame : after.tokens = removeToken before.tokens input owner) :
    runtimePositionValid program expectedInstanceId after = true := by
  have exactLiveFrame (id : ScopeOccurrenceId) :
      exactLiveOccurrence after id = exactLiveOccurrence before id := by
    simp [exactLiveOccurrence, scopesFrame]
  have scopeValidFrame (instanceId : SemanticId) (occurrence : RuntimeScopeOccurrence) :
      scopeOccurrenceValid program instanceId after occurrence =
        scopeOccurrenceValid program instanceId before occurrence := by
    simp [scopeOccurrenceValid, runtimeParentValid, rootAssociationValid,
      calledRootBindingValid, exactLiveOccurrence, scopesFrame, callsFrame]
  have tokenValidFrame (token : ControlToken) :
      tokenBindingValid program after token = tokenBindingValid program before token := by
    simp [tokenBindingValid, exactLiveOccurrence, scopesFrame]
  have rootsFrame (instanceId : SemanticId) :
      hostingRootCount program instanceId after = hostingRootCount program instanceId before := by
    simp [hostingRootCount, scopesFrame]
  have associationsFrame :
      calledProcessAssociationsValid after = calledProcessAssociationsValid before := by
    exact calledProcessAssociationsValid_frame before after controlFrame scopesFrame callsFrame
  simp only [runtimePositionValid, Bool.and_eq_true] at valid ⊢
  refine ⟨valid.1, ?_⟩
  unfold lifecyclePositionValid at valid ⊢
  rw [controlFrame]
  cases controlEq : before.control with
  | notStarted =>
      simp [controlEq, scopesFrame, tokensFrame] at valid ⊢
      exact ⟨valid.2.1, by rw [valid.2.2]; rfl⟩
  | completed instanceId =>
      simp [controlEq, scopesFrame, tokensFrame] at valid ⊢
      exact ⟨valid.2.1, by rw [valid.2.2]; rfl⟩
  | cancelled instanceId =>
      simp [controlEq, scopesFrame, tokensFrame] at valid ⊢
      exact ⟨valid.2.1, by rw [valid.2.2]; rfl⟩
  | running instanceId =>
      simp only [controlEq, runningPositionValid, Bool.and_eq_true] at valid ⊢
      obtain ⟨⟨⟨⟨identity, roots⟩, associations⟩, scopes⟩, tokens⟩ := valid.2
      refine ⟨⟨⟨⟨identity, ?_⟩, ?_⟩, ?_⟩, ?_⟩
      · rw [rootsFrame]
        exact roots
      · rw [associationsFrame]
        exact associations
      · simp only [List.all_eq_true] at scopes ⊢
        intro occurrence member
        rw [scopesFrame] at member
        have prior := scopes occurrence member
        simpa [exactLiveFrame, scopeValidFrame] using prior
      · rw [tokensFrame]
        apply all_removeToken
        rw [List.all_eq_true] at tokens ⊢
        intro token member
        rw [tokenValidFrame]
        exact tokens token member

/-- Every token in a valid runtime position resolves to one projection-unique control place. -/
theorem runtimePositionValid_token_uniqueControlPlace (program : Program)
    (expectedInstanceId : SemanticId) (state : RuntimeState) (token : ControlToken)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (member : token ∈ state.tokens) :
    ∃ place, uniqueControlPlace? program token.placeId = some place := by
  simp only [runtimePositionValid, Bool.and_eq_true] at valid
  unfold lifecyclePositionValid at valid
  cases controlEq : state.control with
  | notStarted => simp [controlEq] at valid; simp_all
  | completed instanceId => simp [controlEq] at valid; simp_all
  | cancelled instanceId => simp [controlEq] at valid; simp_all
  | running instanceId =>
      simp only [controlEq, runningPositionValid, Bool.and_eq_true] at valid
      have tokenValid := List.all_eq_true.mp valid.2.2 token member
      unfold tokenBindingValid at tokenValid
      split at tokenValid <;> simp_all

end BpmnSemantics.SemanticProcess
