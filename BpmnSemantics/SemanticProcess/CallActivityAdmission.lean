import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants

/-! # Call Activity program admission

This module owns standalone well-formedness for the paired cross-root operations and the virtual called-End-to-return graph edge. Source binding and runtime transitions remain separate owners.
-/

namespace BpmnSemantics.SemanticProcess

private structure InvokeBinding where
  id : OperationId
  origin : BpmnElementOrigin
  input : ControlPlaceId
  calledProcessId : ProcessId
  calledRoot : DefinitionScopeId
  calledEntry : ControlPlaceId
  returnOperationId : OperationId

private structure ReturnBinding where
  id : OperationId
  origin : BpmnElementOrigin
  calledProcessId : ProcessId
  calledRoot : DefinitionScopeId
  callerOutput : ControlPlaceId

private def operationScope? (program : Program) (operationId : OperationId) :
    Option DefinitionScopeId :=
  (program.operationScopes.find? fun owner =>
    decide (owner.operationId = operationId)).map (·.scopeId)

private def placeScope? (program : Program) (placeId : ControlPlaceId) :
    Option DefinitionScopeId :=
  (program.controlPlaceScopes.find? fun owner =>
    decide (owner.controlPlaceId = placeId)).map (·.scopeId)

def invokeProcessOperationWellFormed (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (calledProcessId : ProcessId) (calledRootScopeId : DefinitionScopeId)
    (calledEntry : ControlPlaceId) (returnOperationId : OperationId) : Bool :=
  nonempty id.value && nonempty origin.elementId.value &&
    nonempty calledProcessId.value && nonempty calledRootScopeId.value &&
    nonempty returnOperationId.value &&
    (program.controlPlaces.any fun place => place.id = input) &&
    (program.controlPlaces.any fun place => place.id = calledEntry) &&
    (program.definitionScopes.any fun scope => scope.id = calledRootScopeId)

def returnProcessOperationWellFormed (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin)
    (calledProcessId : ProcessId) (calledRootScopeId : DefinitionScopeId)
    (callerOutput : ControlPlaceId) : Bool :=
  nonempty id.value && nonempty origin.elementId.value &&
    nonempty calledProcessId.value && nonempty calledRootScopeId.value &&
    (program.controlPlaces.any fun place => place.id = callerOutput) &&
    (program.definitionScopes.any fun scope => scope.id = calledRootScopeId)

/-- Count every identity-associated invoke/return before validating its other fields. -/
def callOperationsPaired (program : Program) : Bool :=
  let invokes : List InvokeBinding := program.operations.filterMap fun
    | .invokeProcess id origin input calledProcessId calledRoot calledEntry returned =>
        some (show InvokeBinding from
          { id
            origin
            input
            calledProcessId
            calledRoot
            calledEntry
            returnOperationId := returned })
    | _ => none
  let returns : List ReturnBinding := program.operations.filterMap fun
    | .returnProcess id origin calledProcessId calledRoot callerOutput =>
        some (show ReturnBinding from
          { id, origin, calledProcessId, calledRoot, callerOutput })
    | _ => none
  if invokes.isEmpty && returns.isEmpty then true
  else
    match program.definitionScopes.filter fun scope =>
        scope.parentScopeId.isNone &&
          scope.originElementId.value = program.processId.value with
    | [entryRoot] =>
        invokes.length = returns.length &&
          invokes.all fun invoke =>
            match returns.filter fun returned =>
                returned.id = invoke.returnOperationId with
            | [returned] =>
                match program.definitionScopes.filter fun scope =>
                    decide (scope.parentScopeId.isNone &&
                      scope.originElementId.value = invoke.calledProcessId.value) with
                | [calledRoot] =>
                    calledRoot.id = invoke.calledRoot &&
                      calledRoot.id ≠ entryRoot.id &&
                      operationScope? program invoke.id = some entryRoot.id &&
                      operationScope? program returned.id = some calledRoot.id &&
                      placeScope? program invoke.input = some entryRoot.id &&
                      placeScope? program invoke.calledEntry = some calledRoot.id &&
                      placeScope? program returned.callerOutput = some entryRoot.id &&
                      returned.origin = invoke.origin &&
                      returned.calledProcessId = invoke.calledProcessId &&
                      returned.calledRoot = invoke.calledRoot
                | _ => false
            | _ => false
          && returns.all fun returned =>
            (invokes.filter fun invoke =>
              invoke.returnOperationId = returned.id).length = 1
    | _ => false

/-- Virtual graph edges from the unique called End operation to its return. -/
def callCompletionPairs (program : Program) : List (OperationId × OperationId) :=
  program.operations.filterMap fun
    | .returnProcess returnId _ _ calledRoot _ =>
        match program.operations.filter fun operation =>
            match operation with
            | .reachNoneEnd endId _ _ =>
                operationScope? program endId = some calledRoot
            | _ => false with
        | [.reachNoneEnd endId _ _] => some (endId, returnId)
        | _ => none
    | _ => none

end BpmnSemantics.SemanticProcess
