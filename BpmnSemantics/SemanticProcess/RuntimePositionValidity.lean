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

end BpmnSemantics.SemanticProcess
